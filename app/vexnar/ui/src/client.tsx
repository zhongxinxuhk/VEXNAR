// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createElement as h, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

/**
 * VEXNAR tool cards for the dsh web client.
 *
 * Two keyed tool views render the domain tools the Go MCP bridge exposes:
 *   - mcp__vexnar__report_finding      → finding card
 *   - mcp__vexnar__traffic_get         → request/response viewer
 *
 * Cards are presentation only: the payload is the tool result already recorded
 * in the session log, so nothing here refetches or re-derives domain state.
 */

const FINDING_TOOL = 'mcp__vexnar__report_finding'
const TRAFFIC_TOOL = 'mcp__vexnar__traffic_get'

interface ToolViewProps {
  toolName: string
  phase: 'preparing' | 'start' | 'result'
  block?: {
    content?: ReadonlyArray<{ type?: string; text?: string }>
    isError?: boolean
    argsRaw?: string
  }
}

const palette = {
  border: 'var(--dsw-alias-border-secondary, #e5e7eb)',
  bg: 'var(--dsw-alias-bg-secondary, #f8fafc)',
  text: 'var(--dsw-alias-label-primary, #111827)',
  subtle: 'var(--dsw-alias-label-secondary, #6b7280)',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace'
}

const cardStyle: CSSProperties = {
  border: `1px solid ${palette.border}`,
  borderRadius: 10,
  background: palette.bg,
  padding: '10px 12px',
  margin: '6px 0',
  color: palette.text,
  font: '13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
}

const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const chipStyle: CSSProperties = {
  borderRadius: 999,
  padding: '1px 8px',
  fontSize: 11,
  fontWeight: 600,
  border: `1px solid ${palette.border}`,
  background: '#fff'
}

function textOf(block: ToolViewProps['block']): string {
  const content = block?.content ?? []
  return content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('\n')
    .trim()
}

/** report_finding returns "finding recorded: <node>\n{json}"; take the JSON part. */
function jsonOf(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function severityColor(severity: unknown): string {
  switch (String(severity ?? '').toLowerCase()) {
    case 'critical':
      return '#b91c1c'
    case 'high':
      return '#c2410c'
    case 'medium':
      return '#a16207'
    case 'low':
      return '#15803d'
    default:
      return palette.subtle as string
  }
}

function LoadingCard({ label }: { label: string }): ReactNode {
  return h('div', { style: cardStyle }, h('div', { style: { ...rowStyle, color: palette.subtle } }, label))
}

export function FindingCard({ phase, block }: ToolViewProps): ReactNode {
  if (phase !== 'result') return h(LoadingCard, { label: '记录漏洞…' })
  const text = textOf(block)
  const data = jsonOf(text) ?? {}
  const severity = data.severity ?? data.Severity
  const vulnclass = data.vulnclass ?? data.Vulnclass ?? data.category
  const summary = data.summary ?? data.Summary
  const findingId = data.finding_id ?? data.FindingID
  const trafficCount = data.traffic_count ?? data.TrafficCount
  const failed = block?.isError === true

  return h(
    'div',
    { style: { ...cardStyle, borderColor: failed ? '#fca5a5' : palette.border } },
    h(
      'div',
      { style: rowStyle },
      h('span', { style: { ...chipStyle, color: severityColor(severity), borderColor: severityColor(severity) } },
        String(severity ?? 'finding')),
      vulnclass ? h('strong', { style: { fontSize: 13 } }, String(vulnclass)) : null,
      findingId !== undefined ? h('span', { style: { color: palette.subtle, fontSize: 12 } }, `#${String(findingId)}`) : null,
      trafficCount !== undefined
        ? h('span', { style: { color: palette.subtle, fontSize: 12 } }, `证据流量 ${String(trafficCount)} 条`)
        : null
    ),
    summary
      ? h('div', { style: { marginTop: 6 } }, String(summary))
      : h('pre', { style: { margin: '6px 0 0', fontFamily: palette.mono, fontSize: 12, whiteSpace: 'pre-wrap' } },
          text.slice(0, 800) || '(空)'),
    failed ? h('div', { style: { marginTop: 6, color: '#b91c1c', fontSize: 12 } }, '上报失败，见输出') : null
  )
}

function splitHttp(text: string): { head: string; body: string } {
  const match = text.match(/\r?\n\r?\n/)
  if (match === null || match.index === undefined) return { head: text, body: '' }
  return { head: text.slice(0, match.index), body: text.slice(match.index + match[0].length) }
}

export function TrafficViewer({ phase, block }: ToolViewProps): ReactNode {
  const [tab, setTab] = useState<'head' | 'body'>('head')
  const [copied, setCopied] = useState(false)
  if (phase !== 'result') return h(LoadingCard, { label: '读取流量…' })
  const text = textOf(block)
  const parts = splitHttp(text)
  const failed = block?.isError === true

  const copy = (): void => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    })
  }

  const tabButton = (id: 'head' | 'body', label: string): ReactNode =>
    h(
      'button',
      {
        type: 'button',
        onClick: () => setTab(id),
        style: {
          ...chipStyle,
          cursor: 'pointer',
          background: tab === id ? palette.text : '#fff',
          color: tab === id ? '#fff' : palette.text
        }
      },
      label
    )

  return h(
    'div',
    { style: { ...cardStyle, borderColor: failed ? '#fca5a5' : palette.border } },
    h(
      'div',
      { style: rowStyle },
      h('strong', { style: { fontSize: 12 } }, 'HTTP 流量'),
      tabButton('head', '头'),
      tabButton('body', '正文'),
      h('span', { style: { color: palette.subtle, fontSize: 11 } }, `${new TextEncoder().encode(text).length} B`),
      h('button', {
        type: 'button',
        onClick: copy,
        style: { ...chipStyle, cursor: 'pointer', marginLeft: 'auto' }
      }, copied ? '已复制' : '复制')
    ),
    h(
      'pre',
      {
        style: {
          margin: '8px 0 0',
          padding: 8,
          maxHeight: 320,
          overflow: 'auto',
          background: '#fff',
          border: `1px solid ${palette.border}`,
          borderRadius: 6,
          fontFamily: palette.mono,
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all'
        }
      },
      (tab === 'head' ? parts.head : parts.body) || '(空)'
    )
  )
}

declare const __VEXNAR_LOGO__: string
const VEXNAR_LOGO = __VEXNAR_LOGO__

function BrandMark({ size }: { size?: number }): ReactNode {
  // The shell asks for 24px; the mark reads small beside the wordmark, so draw
  // it larger while keeping the slot geometry.
  const px = Math.round((size ?? 24) * 1.35)
  return h('img', {
    src: VEXNAR_LOGO,
    width: px,
    height: px,
    alt: 'VEXNAR',
    style: { display: 'block', borderRadius: 4 }
  })
}

function BrandName(): ReactNode {
  return h(
    'span',
    { style: { fontWeight: 700, letterSpacing: '0.08em', fontSize: 13 } },
    'VEXNAR'
  )
}

function HeroLogo({ size }: { size?: number }): ReactNode {
  // Hero copy is 26px; a 34px mark disappears next to it.
  const px = Math.round((size ?? 34) * 1.55)
  return h('img', {
    src: VEXNAR_LOGO,
    width: px,
    height: px,
    alt: 'VEXNAR',
    style: { display: 'block', borderRadius: 6 }
  })
}

/**
 * The hero headline has no slot, so it is replaced in place: the title group is
 * located by its class fragment and rewritten when the blank-home hero mounts.
 */
function installHeroSlogan(): () => void {
  const slogan = () =>
    (navigator.language || 'zh').toLowerCase().startsWith('zh')
      ? '探索未知，突破边界'
      : 'Explore the unknown. Break the boundaries.'
  const rewrite = (): void => {
    const group = document.querySelector('[class*="titleGroup"]')
    const title = group?.firstElementChild
    if (!(title instanceof HTMLElement)) return
    if (title.dataset.vexnarSlogan === '1') return
    title.textContent = slogan()
    title.dataset.vexnarSlogan = '1'
  }
  rewrite()
  const observer = new MutationObserver(rewrite)
  observer.observe(document.body, { childList: true, subtree: true })
  return () => observer.disconnect()
}

const FULL_ACCESS_LABELS = new Set([
  '完全权限', 'Full access', 'フルアクセス', 'Acceso completo', 'Accès complet',
  'Voller Zugriff', 'Полный доступ', 'Acesso total'
])

/**
 * Full-access mode is the dangerous preset: paint its trigger and menu entry
 * red so the current state cannot be mistaken for the sandboxed default.
 */
function installPermissionWarning(): () => void {
  const sweep = (): void => {
    document
      .querySelectorAll('[class*="triggerLabel"], [class*="optionLabelText"]')
      .forEach((node) => {
        if (!(node instanceof HTMLElement)) return
        const full = FULL_ACCESS_LABELS.has((node.textContent ?? '').trim())
        if (full && node.dataset.vexnarFull !== '1') {
          node.dataset.vexnarFull = '1'
          node.style.color = '#dc2626'
          node.style.fontWeight = '600'
        } else if (!full && node.dataset.vexnarFull === '1') {
          delete node.dataset.vexnarFull
          node.style.color = ''
          node.style.fontWeight = ''
        }
      })
  }
  sweep()
  const observer = new MutationObserver(sweep)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  return () => observer.disconnect()
}

export function apply(ctx: {
  slots: {
    inject: (name: string, register: () => unknown) => void
    register: (options: { name: string; key?: string }, component: unknown) => unknown
  }
  effect?: (fn: () => () => void) => void
}): void {
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: FINDING_TOOL }, FindingCard))
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: TRAFFIC_TOOL }, TrafficViewer))
  // Brand slots replace @deepseek-ai/dsh-client-ui-brand-official, which the
  // profile patch disables. Occupying the slot is the supported override route.
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.register({ name: 'sidebar.brand.mark' }, BrandMark))
  ctx.slots.inject('sidebar.brand.name', () =>
    ctx.slots.register({ name: 'sidebar.brand.name' }, BrandName))
  // Chat hero: logo occupies the brand-mark slot; the slogan is rewritten in
  // place because the headline has no slot of its own.
  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.mark' }, HeroLogo))
  ctx.effect?.(installHeroSlogan)
  ctx.effect?.(installPermissionWarning)
}

export const inject = ['slots']

export default { name: '@vexnar/dsh-ui', inject, apply }
