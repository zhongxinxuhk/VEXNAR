// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createElement as h, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { installStyles } from './styles.js'

/**
 * VEXNAR tool cards for the dsh client.
 *
 * Two keyed tool views render the domain tools the Go MCP bridge exposes:
 *   - mcp__vexnar__report_finding      → finding card
 *   - mcp__vexnar__traffic_get         → request/response viewer
 *
 * Cards are presentation only: the payload is the tool result already recorded
 * in the session log, so nothing here refetches or re-derives domain state.
 *
 * Styling rules (see styles.ts): no colour literal reaches a component. Every
 * value resolves through the `--vx-*` bridge into dsh's alias tokens, so the
 * cards follow the shell's theme, font-size setting and dark mode.
 */

/**
 * Required client services. dsh only puts a service on the plugin context when
 * the package declares it here: without this line `ctx.slots` is undefined and
 * every registration throws, so the shell silently falls back to its own brand
 * artwork instead of showing VEXNAR. Keep it at module scope, not inside apply().
 */
export const inject = ['slots']

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

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'none'

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
  info: '提示',
  none: 'finding'
}

function severityOf(value: unknown): Severity {
  switch (String(value ?? '').trim().toLowerCase()) {
    case 'critical':
    case '严重':
      return 'critical'
    case 'high':
    case '高危':
      return 'high'
    case 'medium':
    case '中危':
      return 'medium'
    case 'low':
    case '低危':
      return 'low'
    case 'info':
      return 'info'
    default:
      return 'none'
  }
}

function formatBytes(text: string): string {
  const bytes = new TextEncoder().encode(text).length
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function LoadingCard({ label }: { label: string }): ReactNode {
  return h(
    'div',
    { className: 'vx-card', 'data-phase': 'loading' },
    h('span', { className: 'vx-loading' }, label)
  )
}

function SeverityChip({ severity }: { severity: Severity }): ReactNode {
  return h(
    'span',
    { className: `vx-chip vx-chip--sev vx-sev-${severity}` },
    h('span', { className: 'vx-dot', 'aria-hidden': 'true' }),
    SEVERITY_LABEL[severity]
  )
}

export function FindingCard({ phase, block }: ToolViewProps): ReactNode {
  if (phase !== 'result') return h(LoadingCard, { label: '记录漏洞…' })
  const text = textOf(block)
  const data = jsonOf(text) ?? {}
  const severity = severityOf(data.severity ?? data.Severity)
  const vulnclass = data.vulnclass ?? data.Vulnclass ?? data.category
  const summary = data.summary ?? data.Summary
  const findingId = data.finding_id ?? data.FindingID
  const trafficCount = data.traffic_count ?? data.TrafficCount
  const failed = block?.isError === true

  return h(
    'div',
    { className: 'vx-card', 'data-error': failed ? '1' : '0' },
    h(
      'div',
      { className: 'vx-head' },
      h(SeverityChip, { severity }),
      vulnclass
        ? h('span', { className: 'vx-title' }, String(vulnclass))
        : h('span', { className: 'vx-title' }, '漏洞记录'),
      findingId !== undefined
        ? h('span', { className: 'vx-meta vx-meta--faint' }, `#${String(findingId)}`)
        : null,
      trafficCount !== undefined
        ? h('span', { className: 'vx-meta vx-spacer' }, `证据流量 ${String(trafficCount)} 条`)
        : null
    ),
    summary
      ? h('div', { className: 'vx-pre vx-pre--tight' }, String(summary))
      : h('pre', { className: 'vx-pre vx-pre--tight' }, text.slice(0, 800) || '(空)'),
    failed ? h('div', { className: 'vx-failed' }, '上报失败，见上方输出') : null
  )
}

function splitHttp(text: string): { head: string; body: string } {
  const match = text.match(/\r?\n\r?\n/)
  if (match === null || match.index === undefined) return { head: text, body: '' }
  return { head: text.slice(0, match.index), body: text.slice(match.index + match[0].length) }
}

/** First line of an HTTP dump is the request/status line — a good card title. */
function headlineOf(head: string): string {
  const first = head.split(/\r?\n/, 1)[0]?.trim() ?? ''
  return first.length > 64 ? `${first.slice(0, 63)}…` : first
}

export function TrafficViewer({ phase, block }: ToolViewProps): ReactNode {
  const [tab, setTab] = useState<'head' | 'body'>('head')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(timer)
  }, [copied])

  if (phase !== 'result') return h(LoadingCard, { label: '读取流量…' })
  const text = textOf(block)
  const parts = splitHttp(text)
  const failed = block?.isError === true
  const headline = headlineOf(parts.head)

  const copy = (): void => {
    void navigator.clipboard?.writeText(text).then(() => setCopied(true))
  }

  const tabButton = (id: 'head' | 'body', label: string): ReactNode =>
    h(
      'button',
      { type: 'button', 'aria-pressed': tab === id, onClick: () => setTab(id) },
      label
    )

  return h(
    'div',
    { className: 'vx-card', 'data-error': failed ? '1' : '0' },
    h(
      'div',
      { className: 'vx-head' },
      h('span', { className: 'vx-title vx-title--mono' }, headline || 'HTTP 流量'),
      h('span', { className: 'vx-meta vx-meta--faint' }, formatBytes(text)),
      h(
        'div',
        { className: 'vx-seg vx-spacer', role: 'group', 'aria-label': '查看内容' },
        tabButton('head', '头'),
        tabButton('body', '正文')
      ),
      h(
        'button',
        { type: 'button', className: 'vx-chip vx-chip--action', onClick: copy },
        copied ? '已复制' : '复制'
      )
    ),
    h('pre', { className: 'vx-pre' }, (tab === 'head' ? parts.head : parts.body) || '(空)'),
    failed ? h('div', { className: 'vx-failed' }, '读取失败，见上方输出') : null
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
    className: 'vx-mark',
    style: { borderRadius: 4 }
  })
}

function BrandName(): ReactNode {
  return h('span', { className: 'vx-brand-name' }, 'VEXNAR')
}

function HeroLogo({ size }: { size?: number }): ReactNode {
  // Hero copy is 26px; a 34px mark disappears next to it.
  const px = Math.round((size ?? 34) * 1.55)
  return h('img', {
    src: VEXNAR_LOGO,
    width: px,
    height: px,
    alt: 'VEXNAR',
    className: 'vx-mark',
    style: { borderRadius: 6 }
  })
}

/**
 * The Claude-style skin draws its own sidebar brand (a `brand-identity` node
 * holding `brand-mark` + `brand-name`) and does not render the host's
 * `sidebar.brand.*` occupants, so the VEXNAR mark disappeared the moment the
 * skin was enabled. This guard rewrites the skin's own brand nodes into the
 * VEXNAR mark and wordmark: the element and its layout/click target stay, the
 * artwork does not. It only touches nodes the skin owns, so the plain dsh shell
 * keeps using the slot occupants registered below.
 */
const SKIN_BRAND_PARTS =
  '[data-dsh-claude-part~="brand-identity"], [data-dsh-claude-part~="rail-mark"]'

function installSkinBrandGuard(): () => void {
  const paint = (): void => {
    if (!document.body.hasAttribute('data-dsh-claude-style')) return
    document.querySelectorAll(SKIN_BRAND_PARTS).forEach((node) => {
      if (!(node instanceof HTMLElement)) return
      if (node.dataset.vexnarBrand === '1') return
      node.dataset.vexnarBrand = '1'
      const rail = node.dataset.dshClaudePart === 'rail-mark'
      const mark = document.createElement('img')
      mark.src = VEXNAR_LOGO
      mark.alt = 'VEXNAR'
      mark.className = 'vx-brand-logo'
      mark.setAttribute('aria-hidden', 'true')
      if (rail) {
        node.replaceChildren(mark)
      } else {
        const word = document.createElement('span')
        word.className = 'vx-brand-word'
        word.textContent = 'VEXNAR'
        node.replaceChildren(mark, word)
      }
    })
  }
  paint()
  const observer = new MutationObserver(paint)
  observer.observe(document.body, { childList: true, subtree: true })
  return () => observer.disconnect()
}

/**
 * The hero headline has no slot, so it is replaced in place: the title group is
 * located by its class fragment and rewritten when the blank-home hero mounts.
 * The marker attribute also opts the node into the gradient treatment.
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
 * Full-access mode is the dangerous preset: paint its trigger and menu entry in
 * the negative colour so the current state cannot be mistaken for the
 * sandboxed default. Uses the bridge token, so dark mode stays legible.
 */
function installPermissionWarning(): () => void {
  const negative = (): string =>
    getComputedStyle(document.body).getPropertyValue('--vx-negative').trim() || '#dc2626'
  const sweep = (): void => {
    document
      .querySelectorAll('[class*="triggerLabel"], [class*="optionLabelText"]')
      .forEach((node) => {
        if (!(node instanceof HTMLElement)) return
        const full = FULL_ACCESS_LABELS.has((node.textContent ?? '').trim())
        if (full && node.dataset.vexnarFull !== '1') {
          node.dataset.vexnarFull = '1'
          node.style.color = negative()
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
  slots?: {
    inject: (name: string, register: () => unknown) => void
    register: (options: { name: string; key?: string }, component: unknown) => unknown
  }
  effect?: (fn: () => () => void) => void
}): void {
  // A missing service must degrade to "no cards", never to a dead plugin: the
  // shell would then fall back to its own artwork with no visible error.
  // Bind once: narrowing on ctx.slots is lost after the first call below.
  const { slots } = ctx
  if (slots === undefined) {
    console.warn('[vexnar] client slots service missing; check `export const inject`')
    return
  }

  // Stylesheet first and once: cards may mount before the plugin's own effects
  // run, and the injection is idempotent, so it is not wired to disposal.
  installStyles()

  slots.inject('tool.call.toolview', () =>
    slots.register({ name: 'tool.call.toolview', key: FINDING_TOOL }, FindingCard))
  slots.inject('tool.call.toolview', () =>
    slots.register({ name: 'tool.call.toolview', key: TRAFFIC_TOOL }, TrafficViewer))
  // Brand slots replace @deepseek-ai/dsh-client-ui-brand-official, which the
  // profile patch disables. Occupying the slot is the supported override route.
  slots.inject('sidebar.brand.mark', () =>
    slots.register({ name: 'sidebar.brand.mark' }, BrandMark))
  slots.inject('sidebar.brand.name', () =>
    slots.register({ name: 'sidebar.brand.name' }, BrandName))
  // Chat hero: logo occupies the brand-mark slot; the slogan is rewritten in
  // place because the headline has no slot of its own.
  slots.inject('conversation.hero.brand.mark', () =>
    slots.register({ name: 'conversation.hero.brand.mark' }, HeroLogo))
  ctx.effect?.(() => installSkinBrandGuard())
  ctx.effect?.(() => installHeroSlogan())
  ctx.effect?.(() => installPermissionWarning())
}
