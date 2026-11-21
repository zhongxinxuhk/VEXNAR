// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createElement as h, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { installStyles } from './styles.js'
import { OverviewPanel } from './overview.js'

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

function ConsoleIcon({ size }: { size?: number }): ReactNode {
  return h('svg', { width: size ?? 16, height: size ?? 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
    h('path', { d: 'M12 3 3 7l9 4 9-4-9-4Z' }),
    h('path', { d: 'm3 12 9 4 9-4' }),
    h('path', { d: 'm3 17 9 4 9-4' }))
}

/** 概览面板的图标：仪表盘弧 + 指针，与「任务」等列表图标区分开。 */
function OverviewIcon({ size }: { size?: number }): ReactNode {
  return h('svg', { width: size ?? 16, height: size ?? 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
    h('path', { d: 'M5.5 19a8.5 8.5 0 1 1 13 0' }),
    h('path', { d: 'M12 14 16 9' }),
    h('circle', { cx: 12, cy: 14, r: 1.4 }))
}

/**
 * 领域接口走同源 /vexnar-api。账户插件将流量和资产请求转给本机 Go 服务。
 */
const CORE_BASE = '/vexnar-api'

async function responseError(response: Response) {
  const data = await response.json().catch(() => null)
  return new Error(data?.error || `HTTP ${response.status}`)
}

async function callApi(path: string, method = 'GET', body?: unknown) {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  const response = await fetch(CORE_BASE + path, init)
  if (!response.ok) throw await responseError(response)
  return response.json()
}

function useApi(path: string, deps: unknown[] = []): { data: any; error: string; loading: boolean } {
  const [state, setState] = useState<{ data: any; error: string; loading: boolean }>({ data: null, error: '', loading: true })
  useEffect(() => {
    let alive = true
    fetch(CORE_BASE + path)
      .then(async (response) => {
        if (!response.ok) throw await responseError(response)
        return response.json()
      })
      .then((data) => { if (alive) setState({ data, error: '', loading: false }) })
      .catch((error) => { if (alive) setState({ data: null, error: String(error?.message ?? error), loading: false }) })
    return () => { alive = false }
  }, deps)
  return state
}

function Dashboard() {
  const tasks = useApi('/api/tasks')
  const findings = useApi('/api/exploration/findings/stats')
  const assets = useApi('/api/assets/counts')
  const tokens = useApi('/api/tokens/daily?days=1')
  const cards = [
    ['任务', tasks.data?.tasks?.length ?? '—'],
    ['发现', findings.data?.total ?? '—'],
    ['资产', assets.data ? Object.values(assets.data).reduce((sum: number, value: any) => sum + Number(value), 0) : '—'],
    ['今日 Token', Array.isArray(tokens.data) ? tokens.data.reduce((sum: number, row: any) => sum + Number(row.input_tokens ?? 0) + Number(row.output_tokens ?? 0), 0) : '—']
  ]
  return h('div', null,
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginBottom: 20 } },
      cards.map(([label, value]) => h('div', { key: String(label), style: { border: '1px solid var(--vx-border, #e5e7eb)', borderRadius: 12, padding: 16 } },
        h('div', { style: { fontSize: 12, color: 'var(--vx-muted, #6b7280)' } }, String(label)),
        h('div', { style: { fontSize: 24, fontWeight: 600 } }, String(value))))),
    h('div', { style: { fontSize: 12, color: 'var(--vx-muted, #6b7280)' } }, tasks.error || findings.error || assets.error || tokens.error || '数据来自本地核心'))
}

function TaskList({ onSelect, scope = '' }: { onSelect?: (id: string) => void; scope?: string }) {
  const { data, error, loading } = useApi('/api/tasks')
  if (loading) return h('div', null, '加载中…')
  if (error) return h('div', { style: { color: '#dc2626' } }, error)
  const all = data?.tasks ?? []
  const rows = (scope ? all.filter((task: any) => String(task.id) === scope) : all).slice(0, 30)
  return h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
    h('thead', null, h('tr', null, ['ID', '名称', '状态', '目标'].map((title) => h('th', { key: title, style: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--vx-border, #e5e7eb)' } }, title)))),
    h('tbody', null, rows.map((task: any) => h('tr', { key: task.id, onClick: () => onSelect?.(String(task.id)), style: { cursor: onSelect ? 'pointer' : 'default' } },
      h('td', { style: { padding: '6px 8px' } }, task.id),
      h('td', { style: { padding: '6px 8px' } }, task.name || '—'),
      h('td', { style: { padding: '6px 8px' } }, task.status),
      h('td', { style: { padding: '6px 8px', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, task.goal)))))
}

function TaskDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [tick, setTick] = useState(0)
  const task = useApi(`/api/tasks/${id}`, [tick])
  const goals = useApi(`/api/tasks/${id}/goals`, [tick])
  const intents = useApi(`/api/exploration/intents?task=${id}&limit=40`, [tick])
  const coverage = useApi(`/api/tasks/${id}/coverage`, [tick])
  const nodes = useApi(`/api/exploration/nodes?task=${id}&size=20`, [tick])

  const act = async (action: 'pause' | 'resume' | 'archive') => {
    if (action === 'archive' && !window.confirm('归档后该任务将从列表移出，继续？')) return
    try {
      if (action === 'archive') await callApi(`/api/tasks/${id}/archive`, 'POST')
      else await callApi(`/api/tasks/${id}/control`, 'POST', { action })
      setTick((value) => value + 1)
    } catch (error: any) { window.alert(String(error?.message ?? error)) }
  }

  if (task.loading) return h('div', null, '加载中…')
  if (task.error) return h('div', { style: { color: '#dc2626' } }, task.error)

  const row = task.data ?? {}
  const meta = (title: string, children: ReactNode) => h('div', { style: { marginBottom: 16 } },
    h('div', { style: { fontSize: 12, fontWeight: 600, color: 'var(--vx-text-dim)', marginBottom: 6 } }, title), children)
  const list = (value: any): any[] => (Array.isArray(value) ? value : (value?.items ?? value?.goals ?? []))
  const goalRows = list(goals.data)
  const intentRows = list(intents.data)
  const nodeRows = list(nodes.data)
  const cover = coverage.data ?? {}
  const tokens = row.tokens ?? {}
  const status = String(row.status ?? '')
  const pills = [
    ['目标', `${row.goals_met ?? 0}/${row.goals_total ?? 0}`],
    ['在途意图', String(row.in_flight ?? 0)],
    ['输入 Token', fmtCount(tokens.input_tokens)],
    ['输出 Token', fmtCount(tokens.output_tokens)],
    ['缓存读', fmtCount(tokens.cache_read_tokens)],
    ['覆盖度', cover.pct === null || cover.pct === undefined ? '—' : `${Math.round(Number(cover.pct))}%`]
  ]

  return h('div', null,
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' } },
      h('button', { type: 'button', onClick: onBack, style: { border: '1px solid var(--vx-border, #e5e7eb)', background: 'transparent', borderRadius: 8, padding: '3px 10px', cursor: 'pointer' } }, '← 返回'),
      h('span', { style: { fontSize: 18, fontWeight: 600 } }, String(row.description ?? row.name ?? id)),
      h('span', { className: 'vx-ov-pill' }, status === '' ? '未知' : status),
      h('span', { style: { fontSize: 12, color: 'var(--vx-text-dim)' } }, `${id} · 创建 ${fmtAgo(row.created_unix)} · 最近活动 ${fmtAgo(row.last_activity_unix)}`)),
    h('div', { style: { display: 'flex', gap: 8, margin: '10px 0 16px' } },
      status === 'running' ? h('button', { type: 'button', onClick: () => act('pause'), style: { cursor: 'pointer' } }, '暂停') : null,
      status === 'paused' ? h('button', { type: 'button', onClick: () => act('resume'), style: { cursor: 'pointer' } }, '恢复') : null,
      h('button', { type: 'button', onClick: () => act('archive'), style: { cursor: 'pointer' } }, '归档')),
    meta('目标', h('div', { style: { fontSize: 13, lineHeight: 1.6 } }, String(row.goal ?? '—'))),
    meta('统计', h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 12 } },
      pills.map(([label, value]) => h('span', { key: label, style: { color: 'var(--vx-text-dim)' } },
        `${label} `, h('b', { style: { color: 'var(--vx-text)', fontWeight: 600 } }, value))))),
    goalRows.length > 0 ? meta(`目标清单（${goalRows.length}）`, h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 } },
      goalRows.slice(0, 12).map((goal: any) => h('div', { key: String(goal.id), style: { display: 'flex', gap: 8, alignItems: 'baseline' } },
        h('span', { className: 'vx-ov-pill' }, String(goal.state ?? 'open')),
        h('span', null, String(goal.text ?? goal.summary ?? '')),
        goal.vulnclass ? h('span', { style: { color: 'var(--vx-text-faint)', fontSize: 11 } }, String(goal.vulnclass)) : null)))) : null,
    intentRows.length > 0 ? meta(`意图（最近 ${Math.min(intentRows.length, 8)}）`, h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 } },
      intentRows.slice(0, 8).map((intent: any) => h('div', { key: String(intent.id), style: { display: 'flex', gap: 8, alignItems: 'baseline' } },
        h('span', { className: 'vx-ov-pill' }, String(intent.state ?? intent.type ?? '')),
        h('span', { style: { color: 'var(--vx-text-dim)' } }, String(intent.worker ?? '')),
        h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, String(intent.summary ?? intent.label ?? '')))))) : null,
    nodeRows.length > 0 ? meta(`图谱节点（最近 ${Math.min(nodeRows.length, 8)}）`, h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 } },
      nodeRows.slice(0, 8).map((node: any) => h('div', { key: String(node.id), style: { display: 'flex', gap: 8, alignItems: 'baseline' } },
        h('span', { className: 'vx-ov-pill' }, String(node.type ?? node.kind ?? '')),
        h('span', { style: { color: 'var(--vx-text-dim)' } }, String(node.state ?? '')),
        h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, String(node.label ?? node.summary ?? '')))))) : null)
}

/** 任务详情里的小工具：紧凑数字与相对时间。 */
function fmtCount(value: unknown): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.round(n))
}

function fmtAgo(unix: unknown): string {
  const n = Number(unix ?? 0)
  if (!Number.isFinite(n) || n <= 0) return '—'
  const seconds = Math.floor(Date.now() / 1000 - n)
  if (seconds < 60) return `${seconds}s 前`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m 前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h 前`
  return `${Math.floor(seconds / 86400)}d 前`
}

function AgentsPage() {
  const { data, error, loading } = useApi('/api/agents')
  const [version, setVersion] = useState(0)
  if (loading) return h('div', null, '加载中…')
  if (error) return h('div', { style: { color: '#dc2626' } }, error)
  const rows = data?.agents ?? []
  const edit = async (agent: any) => {
    const name = window.prompt('Agent 名称', agent.name)
    if (name == null) return
    const description = window.prompt('描述', agent.description ?? '')
    if (description == null) return
    try { await callApi(`/api/agents/${agent.key}`, 'PATCH', { name, description }); setVersion(version + 1) } catch (e: any) { window.alert(String(e?.message ?? e)) }
  }
  return h('div', { key: version }, h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
    h('thead', null, h('tr', null, ['Key', '名称', '角色', '启用', ''].map((t) => h('th', { key: t, style: { textAlign: 'left', padding: '6px 8px' } }, t)))),
    h('tbody', null, rows.map((agent: any) => h('tr', { key: agent.key },
      h('td', { style: { padding: '6px 8px' } }, agent.key),
      h('td', { style: { padding: '6px 8px' } }, agent.name),
      h('td', { style: { padding: '6px 8px' } }, agent.role),
      h('td', { style: { padding: '6px 8px' } }, agent.enabled ? '是' : '否'),
      h('td', { style: { padding: '6px 8px' } }, h('button', { type: 'button', onClick: () => edit(agent), style: { cursor: 'pointer' } }, '编辑')))))))
}

function McpPage() {
  const { data, error, loading } = useApi('/api/mcp')
  const [version, setVersion] = useState(0)
  if (loading) return h('div', null, '加载中…')
  if (error) return h('div', { style: { color: '#dc2626' } }, error)
  const rows = data?.servers ?? []
  const toggle = async (row: any) => { try { await callApi(`/api/mcp/${row.id}/enabled`, 'PUT', { enabled: !row.enabled }); setVersion(version + 1) } catch (e: any) { window.alert(String(e?.message ?? e)) } }
  const remove = async (row: any) => { if (!window.confirm(`删除 ${row.name}?`)) return; try { await callApi(`/api/mcp/${row.id}`, 'DELETE'); setVersion(version + 1) } catch (e: any) { window.alert(String(e?.message ?? e)) } }
  return h('div', { key: version }, h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
    h('thead', null, h('tr', null, ['ID', '名称', '传输', '启用', ''].map((t) => h('th', { key: t, style: { textAlign: 'left', padding: '6px 8px' } }, t)))),
    h('tbody', null, rows.map((row: any) => h('tr', { key: row.id },
      h('td', { style: { padding: '6px 8px' } }, row.id),
      h('td', { style: { padding: '6px 8px' } }, row.name),
      h('td', { style: { padding: '6px 8px' } }, row.transport),
      h('td', { style: { padding: '6px 8px' } }, row.enabled ? '是' : '否'),
      h('td', { style: { padding: '6px 8px', display: 'flex', gap: 8 } },
        h('button', { type: 'button', onClick: () => toggle(row), style: { cursor: 'pointer' } }, row.enabled ? '停用' : '启用'),
        h('button', { type: 'button', onClick: () => remove(row), style: { cursor: 'pointer' } }, '删除')))))))
}

function ToolsPage() {
  const { data, error, loading } = useApi('/api/tools')
  const [version, setVersion] = useState(0)
  if (loading) return h('div', null, '加载中…')
  if (error) return h('div', { style: { color: '#dc2626' } }, error)
  const rows = data?.tools ?? []
  const toggle = async (row: any) => { try { await callApi(`/api/tools/${row.key}`, 'PUT', { enabled: !row.enabled }); setVersion(version + 1) } catch (e: any) { window.alert(String(e?.message ?? e)) } }
  return h('div', { key: version }, h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
    h('thead', null, h('tr', null, ['Key', '类型', '启用', '调用', ''].map((t) => h('th', { key: t, style: { textAlign: 'left', padding: '6px 8px' } }, t)))),
    h('tbody', null, rows.map((row: any) => h('tr', { key: row.key },
      h('td', { style: { padding: '6px 8px' } }, row.key),
      h('td', { style: { padding: '6px 8px' } }, row.kind),
      h('td', { style: { padding: '6px 8px' } }, row.enabled ? '是' : '否'),
      h('td', { style: { padding: '6px 8px' } }, row.calls ?? 0),
      h('td', { style: { padding: '6px 8px' } }, h('button', { type: 'button', onClick: () => toggle(row), style: { cursor: 'pointer' } }, row.enabled ? '停用' : '启用')))))))
}

function NotifyPage() {
  const { data, error, loading } = useApi('/api/notify/channels')
  const [version, setVersion] = useState(0)
  if (loading) return h('div', null, '加载中…')
  if (error) return h('div', { style: { color: '#dc2626' } }, error)
  const rows = data?.channels ?? []
  const add = async () => {
    const name = window.prompt('渠道名称', 'webhook')
    if (!name) return
    const url = window.prompt('Webhook URL', '')
    if (url == null) return
    try { await callApi('/api/notify/channels', 'POST', { name, kind: 'webhook', config: { url } }); setVersion(version + 1) } catch (e: any) { window.alert(String(e?.message ?? e)) }
  }
  const remove = async (row: any) => { if (!window.confirm(`删除 ${row.name}?`)) return; try { await callApi(`/api/notify/channels/${row.id}`, 'DELETE'); setVersion(version + 1) } catch (e: any) { window.alert(String(e?.message ?? e)) } }
  return h('div', { key: version },
    h('button', { type: 'button', onClick: add, style: { marginBottom: 10, cursor: 'pointer' } }, '+ 新增渠道'),
    h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
      h('thead', null, h('tr', null, ['ID', '名称', '类型', '启用', ''].map((t) => h('th', { key: t, style: { textAlign: 'left', padding: '6px 8px' } }, t)))),
      h('tbody', null, rows.map((row: any) => h('tr', { key: row.id },
        h('td', { style: { padding: '6px 8px' } }, row.id),
        h('td', { style: { padding: '6px 8px' } }, row.name),
        h('td', { style: { padding: '6px 8px' } }, row.kind),
        h('td', { style: { padding: '6px 8px' } }, row.enabled ? '是' : '否'),
        h('td', { style: { padding: '6px 8px' } }, h('button', { type: 'button', onClick: () => remove(row), style: { cursor: 'pointer' } }, '删除')))))))
}

/**
 * 直接执行内置侦察工具。taskID 来自执行台的任务范围：执行结果按任务落库，
 * 所以这里不再单独填 task_id，避免"跑在执行台、记在别的任务"。
 */
function ToolRunPage({ taskID = '' }: { taskID?: string }) {
  const [name, setName] = useState<'nmap' | 'httpx' | 'ffuf' | 'sqlmap'>('nmap')
  const [target, setTarget] = useState('')
  const [output, setOutput] = useState('')
  const run = async () => {
    setOutput('执行中…')
    try {
      const data = await callApi('/api/engine/tools/run', 'POST', { name, target, task_id: taskID || undefined })
      setOutput([`code=${data.code} truncated=${data.truncated}`, data.parsed ? JSON.stringify(data.parsed, null, 2) : '', data.stdout, data.stderr].filter(Boolean).join('\n'))
    } catch (error: any) { setOutput(String(error?.message ?? error)) }
  }
  return h('div', { style: { fontSize: 13 } },
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 } },
      h('select', { value: name, onChange: (event: any) => setName(event.target.value) }, ['nmap', 'httpx', 'ffuf', 'sqlmap'].map((item) => h('option', { key: item, value: item }, item))),
      h('input', { placeholder: 'target（域名 / URL / IP）', value: target, onChange: (event: any) => setTarget(event.target.value), style: { minWidth: 260 } }),
      h('button', { type: 'button', onClick: run, style: { cursor: 'pointer' } }, '执行'),
      h('span', { style: { fontSize: 12, color: 'var(--vx-text-dim)' } },
        taskID ? `结果记入任务 #${taskID}` : '未选任务：结果不落库')),
    h('pre', { style: { fontSize: 12, whiteSpace: 'pre-wrap', background: 'var(--vx-code, #f8fafc)', padding: 10, borderRadius: 8, minHeight: 120, maxHeight: 420, overflow: 'auto' } }, output))
}

function YakitImport({ onImported }: { onImported: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ imported: number; duplicates: number; errors: { entry: number; error: string }[] } | null>(null)

  async function upload(file: File) {
    setError('')
    setResult(null)
    if (file.size > 16 * 1024 * 1024) {
      setError('HAR 不可超过 16 MiB，请分批导出')
      return
    }
    setBusy(true)
    try {
      const response = await fetch(CORE_BASE + '/api/traffic/import/yakit', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: file
      })
      if (!response.ok) throw await responseError(response)
      const data = await response.json()
      setResult(data)
      if (data.imported || data.duplicates) onImported()
    } catch (error) {
      setError(String((error as Error).message))
    } finally {
      setBusy(false)
    }
  }

  return h('div', { style: { marginBottom: 12 } },
    h('label', null, '导入 Yakit HAR ',
      h('input', {
        type: 'file', accept: '.har,application/json', disabled: busy,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void upload(file)
        }
      })),
    h('div', { style: { fontSize: 12, color: 'var(--vx-muted, #6b7280)', marginTop: 4 } }, '在 Yakit History 选中记录并导出 HAR。每份最多 16 MiB、2000 条。'),
    busy && h('div', { role: 'status' }, '正在导入…'),
    error && h('div', { role: 'alert', style: { color: '#dc2626' } }, error),
    result && h('div', { role: 'status' },
      `已导入 ${result.imported} 条，重复 ${result.duplicates} 条，失败 ${result.errors.length} 条`,
      result.errors.length > 0 && h('details', null,
        h('summary', null, '查看失败记录'),
        h('ul', null, result.errors.map(({ entry, error }) => h('li', { key: entry }, `第 ${entry} 条 · ${error}`))))))
}

function TrafficExchange({ row, onBack }: { row: any; onBack: () => void }) {
  const { data, error, loading } = useApi(`/api/traffic/exchange?id=${encodeURIComponent(row.id)}`, [row.id])
  const [result, setResult] = useState('')
  const [promoting, setPromoting] = useState(false)
  const [saved, setSaved] = useState(false)

  async function promote() {
    setPromoting(true)
    setResult('')
    try {
      const assets = await callApi('/api/traffic/promote', 'POST', { id: row.id })
      setSaved(true)
      setResult(`已登记服务 #${assets.service_id}、端点 #${assets.endpoint_id}，可在资产页查看。`)
    } catch (error) {
      setResult(String((error as Error).message))
    } finally {
      setPromoting(false)
    }
  }

  const packetStyle = { fontSize: 12, whiteSpace: 'pre-wrap' as const, overflowWrap: 'anywhere' as const, background: 'var(--vx-code, #f8fafc)', padding: 10, borderRadius: 8, maxHeight: 360, overflow: 'auto' }
  return h('div', null,
    h('div', { style: { display: 'flex', gap: 8 } },
      h('button', { type: 'button', onClick: onBack }, '← 返回流量列表'),
      h('button', { type: 'button', onClick: promote, disabled: promoting || saved || !data }, promoting ? '登记中…' : '登记为资产')),
    result && h('p', { role: 'status' }, result),
    h('p', { style: { overflowWrap: 'anywhere' } }, `${row.method} ${row.url}`),
    loading && h('div', null, '加载中…'),
    error && h('div', { role: 'alert', style: { color: '#dc2626' } }, error),
    data && h('div', null,
      h('strong', null, '请求'), h('pre', { style: packetStyle }, data.req?.trim() ? data.req : '暂无请求内容'),
      h('strong', null, '响应'), h('pre', { style: packetStyle }, data.resp?.trim() ? data.resp : '暂无响应内容')))
}

function TrafficPage() {
  const [host, setHost] = useState('')
  const [method, setMethod] = useState('')
  const [q, setQ] = useState('')
  const [source, setSource] = useState('')
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [exchange, setExchange] = useState<any>(null)
  const params = new URLSearchParams({ page: String(page), size: '50' })
  if (host) params.set('host', host.trim())
  if (method) params.set('method', method)
  if (q) params.set('q', q.trim())
  if (source) params.set('source', source)
  const url = `/api/traffic?${params.toString()}`
  const { data, error, loading } = useApi(url, [url, revision])
  const rows = data?.exchanges ?? []
  const total = data?.total ?? rows.length
  if (exchange) return h(TrafficExchange, { row: exchange, onBack: () => setExchange(null) })
  return h('div', { style: { fontSize: 13 } },
    data?.storage_available !== false && h(YakitImport, { onImported: () => {
      setHost('')
      setMethod('')
      setQ('')
      setSource('yakit')
      setPage(0)
      setRevision((value) => value + 1)
    } }),
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 } },
      h('input', { placeholder: '主机', 'aria-label': '主机', value: host, onChange: (event: any) => { setHost(event.target.value); setPage(0) } }),
      h('select', { 'aria-label': 'HTTP 方法', value: method, onChange: (event: any) => { setMethod(event.target.value); setPage(0) } },
        ['', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].map((item) => h('option', { key: item || 'all', value: item }, item || '全部方法'))),
      h('input', { placeholder: 'URL 或报文关键字', 'aria-label': 'URL 或报文关键字', value: q, onChange: (event: any) => { setQ(event.target.value); setPage(0) } }),
      h('select', { 'aria-label': '流量来源', value: source, onChange: (event: any) => { setSource(event.target.value); setPage(0) } },
        h('option', { value: '' }, '全部来源'), h('option', { value: 'yakit' }, 'Yakit'), h('option', { value: 'vexnar' }, 'VEXNAR')),
      h('button', { type: 'button', onClick: () => setRevision((value) => value + 1) }, '刷新')),
    loading && h('div', null, '加载中…'),
    error && h('div', { role: 'alert', style: { color: '#dc2626' } }, error),
    data?.storage_available === false && h('div', { role: 'status' }, 'Go 流量存储未启用'),
    data && data.storage_available !== false && h('div', null,
      h('div', { style: { color: 'var(--vx-muted, #6b7280)', marginBottom: 8 } }, `匹配 ${total} 条流量`),
      rows.length === 0 ? h('p', null, '暂无匹配流量') : h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
        h('thead', null, h('tr', null, ['时间', '方法', 'URL', '状态', '来源'].map((t) => h('th', { key: t, style: { textAlign: 'left', padding: '6px 8px' } }, t)))),
        h('tbody', null, rows.map((row: any) => h('tr', { key: row.id },
          h('td', { style: { padding: '6px 8px' } }, row.ts),
          h('td', { style: { padding: '6px 8px' } }, row.method),
          h('td', { style: { padding: '6px 8px', maxWidth: 420, overflowWrap: 'anywhere' } },
            h('button', { type: 'button', onClick: () => setExchange(row), style: { whiteSpace: 'normal', textAlign: 'left' } }, row.url || row.host)),
          h('td', { style: { padding: '6px 8px' } }, row.status || '—'),
          h('td', { style: { padding: '6px 8px' } }, row.source === 'yakit' ? 'Yakit' : 'VEXNAR'))))),
      (page > 0 || total > 50) && h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 } },
        h('button', { type: 'button', disabled: page === 0, onClick: () => setPage(page - 1) }, '上一页'),
        h('span', null, `${page + 1} / ${Math.max(1, Math.ceil(total / 50))}`),
        h('button', { type: 'button', disabled: (page + 1) * 50 >= total, onClick: () => setPage(page + 1) }, '下一页'))))
}

function InterceptPage() {
  const { data, error, loading } = useApi('/api/intercept/rules')
  const [version, setVersion] = useState(0)
  const [form, setForm] = useState<any>({ id: 0, name: '', enabled: true, priority: 100, match_target: 'tool_input', match_type: 'string', pattern: '', action: 'deny' })
  if (loading) return h('div', null, '加载中…')
  if (error) return h('div', { style: { color: '#dc2626', fontSize: 12 } }, `${error}（需要 VEXNAR_GO_FALLBACK 代理 Go 拦截规则）`)
  const rows = data?.rules ?? []
  const submit = async () => {
    try {
      const body = { ...form, id: undefined }
      if (form.id) await callApi(`/api/intercept/rules/${form.id}`, 'PUT', body)
      else await callApi('/api/intercept/rules', 'POST', body)
      setForm({ id: 0, name: '', enabled: true, priority: 100, match_target: 'tool_input', match_type: 'string', pattern: '', action: 'deny' })
      setVersion(version + 1)
    } catch (e: any) { window.alert(String(e?.message ?? e)) }
  }
  const remove = async (row: any) => { if (!window.confirm(`删除规则 #${row.id}?`)) return; try { await callApi(`/api/intercept/rules/${row.id}`, 'DELETE'); setVersion(version + 1) } catch (e: any) { window.alert(String(e?.message ?? e)) } }
  const field = (key: string, placeholder: string, width = 140) =>
    h('input', { value: form[key] ?? '', placeholder, onChange: (event: any) => setForm({ ...form, [key]: event.target.value }), style: { width } })
  return h('div', { key: version, fontSize: 13 },
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' } },
      field('name', '规则名'),
      h('select', { value: form.match_target, onChange: (event: any) => setForm({ ...form, match_target: event.target.value }) }, ['tool_input', 'tool_name'].map((v) => h('option', { key: v, value: v }, v))),
      h('select', { value: form.match_type, onChange: (event: any) => setForm({ ...form, match_type: event.target.value }) }, ['string', 'regex'].map((v) => h('option', { key: v, value: v }, v))),
      field('pattern', '匹配内容', 240),
      h('select', { value: form.action, onChange: (event: any) => setForm({ ...form, action: event.target.value }) }, ['allow', 'deny', 'ask'].map((v) => h('option', { key: v, value: v }, v))),
      h('button', { type: 'button', onClick: submit, style: { cursor: 'pointer' } }, form.id ? '保存' : '新增'),
      form.id ? h('button', { type: 'button', onClick: () => setForm({ id: 0, name: '', enabled: true, priority: 100, match_target: 'tool_input', match_type: 'string', pattern: '', action: 'deny' }), style: { cursor: 'pointer' } }, '取消') : null),
    h('div', { style: { color: 'var(--vx-muted, #6b7280)', marginBottom: 8 } }, `共 ${data?.count ?? rows.length} 条规则`),
    h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
      h('thead', null, h('tr', null, ['ID', '名称', '匹配', '动作', '启用', ''].map((t) => h('th', { key: t, style: { textAlign: 'left', padding: '6px 8px' } }, t)))),
      h('tbody', null, rows.map((row: any) => h('tr', { key: row.id },
        h('td', { style: { padding: '6px 8px' } }, row.id),
        h('td', { style: { padding: '6px 8px' } }, row.name),
        h('td', { style: { padding: '6px 8px' } }, `${row.match_target}:${row.match_type}:${row.pattern ?? ''}`),
        h('td', { style: { padding: '6px 8px' } }, row.action),
        h('td', { style: { padding: '6px 8px' } }, row.enabled ? '是' : '否'),
        h('td', { style: { padding: '6px 8px', display: 'flex', gap: 8 } },
          h('button', { type: 'button', onClick: () => setForm({ ...row }), style: { cursor: 'pointer' } }, '编辑'),
          h('button', { type: 'button', onClick: () => remove(row), style: { cursor: 'pointer' } }, '删除')))))))
}

function ApprovalsPage() {
  const { data, error, loading } = useApi('/api/intercept/pending')
  const [version, setVersion] = useState(0)
  if (loading) return h('div', null, '加载中…')
  if (error) return h('div', { style: { color: '#dc2626', fontSize: 12 } }, `审批队列暂时读不到：${error}`)
  const rows = data?.pending ?? []
  const decide = async (row: any, decision: 'allowed' | 'denied') => {
    try { await callApi(`/api/intercept/pending/${row.id}/decide`, 'POST', { decision }); setVersion(version + 1) }
    catch (e: any) { window.alert(String(e?.message ?? e)) }
  }
  return h('div', { key: version, fontSize: 13 },
    h('div', { style: { color: 'var(--vx-muted, #6b7280)', marginBottom: 8 } }, `待处理 ${rows.length} 条`),
    rows.length === 0 ? h('div', { style: { border: '1px dashed var(--vx-border, #e5e7eb)', borderRadius: 12, padding: 20, color: 'var(--vx-muted, #6b7280)' } }, '当前没有待审批的工具调用。')
      : h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, ['ID', '任务', 'Agent', '工具', '状态', '原因', ''].map((t) => h('th', { key: t, style: { textAlign: 'left', padding: '6px 8px' } }, t)))),
          h('tbody', null, rows.map((row: any) => h('tr', { key: row.id },
            h('td', { style: { padding: '6px 8px' } }, row.id),
            h('td', { style: { padding: '6px 8px' } }, row.task_id ?? ''),
            h('td', { style: { padding: '6px 8px' } }, row.agent_name ?? ''),
            h('td', { style: { padding: '6px 8px' } }, row.tool_name ?? ''),
            h('td', { style: { padding: '6px 8px' } }, row.status),
            h('td', { style: { padding: '6px 8px', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, row.reason ?? ''),
            h('td', { style: { padding: '6px 8px', display: 'flex', gap: 8 } },
              row.status === 'pending' ? h('button', { type: 'button', onClick: () => decide(row, 'allowed'), style: { cursor: 'pointer' } }, '允许') : null,
              row.status === 'pending' ? h('button', { type: 'button', onClick: () => decide(row, 'denied'), style: { cursor: 'pointer' } }, '拒绝') : null))))))
}

/**
 * 资产 JSON 导入。它原本是设置里独立的「资产同步」一节，但它只做一件事——往资产
 * 库里灌数据——所以并进资产面板，导入完直接在下个页签看到结果。
 */
function AssetImport({ onImported }: { onImported: () => void }) {
  const [text, setText] = useState('{"assets":[{"type":"root_domain","domain":"example.com"}]}')
  const [result, setResult] = useState('')
  const submit = async () => {
    setResult('导入中…')
    try {
      const parsed = JSON.parse(text)
      const assets = Array.isArray(parsed) ? parsed : parsed.assets
      if (!Array.isArray(assets) || assets.length === 0) throw new Error('请填写资产列表')
      const data = await callApi('/api/assets', 'POST', { assets })
      const failures = (data.errors ?? []).map((item: any) => `第 ${item.index + 1} 条 · ${item.error}`)
      setResult([`已登记 ${data.results?.length ?? 0} 条，失败 ${failures.length} 条`, ...failures].join('；'))
      if ((data.results?.length ?? 0) > 0) onImported()
    } catch (error: any) { setResult(String(error?.message ?? error)) }
  }
  return h('div', null,
    h('p', { style: { fontSize: 12, color: 'var(--vx-text-dim)', marginTop: 0 } },
      '从 JSON 导入资产（域名 / IP / URL），按类型与标识去重。'),
    h('textarea', { value: text, onChange: (event: any) => setText(event.target.value), rows: 10, style: { width: '100%', fontFamily: 'monospace', fontSize: 12 } }),
    h('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
      h('button', { type: 'button', onClick: submit, style: { cursor: 'pointer' } }, '导入'),
      h('span', { style: { fontSize: 12, color: 'var(--vx-muted, #6b7280)' } }, result)))
}

/**
 * 该任务的执行流。
 *
 * 这正是原先「日志」面板展示的那批 activity 行：planner / main / intent 的每一步，
 * 其中 kind=tool_use / tool_result 的行就是一次工具执行。它过去有独立入口，但看的
 * 是同一批数据，所以并进工具执行页签——任务范围由执行台给，不用再选一次任务。
 */
function ExecStream({ taskID }: { taskID: string }) {
  const [session, setSession] = useState('plan')
  const [rows, setRows] = useState<any[]>([])
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!taskID) { setRows([]); setError(''); return }
    let alive = true
    setError('')
    fetch(CORE_BASE + `/api/exploration/activity/history?task=${encodeURIComponent(taskID)}&session=${session}&limit=100`)
      .then(async (response) => {
        if (!response.ok) throw await responseError(response)
        return response.json()
      })
      .then((data) => { if (alive) setRows(data.items ?? []) })
      .catch((e) => { if (alive) { setError(String(e?.message ?? e)); setRows([]) } })
    return () => { alive = false }
  }, [taskID, session, tick])
  return h('div', null,
    h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 } },
      h('span', { style: { fontSize: 12, fontWeight: 600, color: 'var(--vx-text-dim)' } }, `执行记录 · 任务 #${taskID}`),
      h('select', { 'aria-label': '会话', value: session, onChange: (event: any) => setSession(event.target.value) },
        [['plan', 'planner'], ['main', 'main']].map(([value, label]) => h('option', { key: value, value }, label))),
      h('button', { type: 'button', onClick: () => setTick((value) => value + 1), style: { cursor: 'pointer' } }, '刷新')),
    error ? h('div', { role: 'alert', style: { color: '#dc2626', fontSize: 12 } }, error) : null,
    rows.length === 0 && !error ? h('p', { style: { fontSize: 12, color: 'var(--vx-text-dim)' } }, '该会话还没有执行记录。') : null,
    rows.length > 0 ? h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
      h('thead', null, h('tr', null, ['seq', 'ts', 'worker', 'kind', 'tool', 'summary'].map((t) => h('th', { key: t, style: { textAlign: 'left', padding: '4px 6px' } }, t)))),
      h('tbody', null, rows.slice().reverse().map((row: any) => h('tr', { key: row.seq },
        h('td', { style: { padding: '4px 6px' } }, row.seq),
        h('td', { style: { padding: '4px 6px' } }, row.ts),
        h('td', { style: { padding: '4px 6px' } }, row.worker ?? ''),
        h('td', { style: { padding: '4px 6px' } }, row.kind ?? ''),
        h('td', { style: { padding: '4px 6px', fontFamily: 'var(--vx-mono)' } }, row.tool ?? ''),
        h('td', {
          style: {
            padding: '4px 6px', maxWidth: 460, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: row.is_error ? 'var(--vx-negative)' : undefined
          }
        }, row.summary ?? ''))))) : null)
}

function PanelShell({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) {
  return h('div', { className: 'vx-panel' },
    h('div', { className: 'vx-panel-head' },
      h('h1', { className: 'vx-panel-title' }, title),
      desc ? h('p', { className: 'vx-panel-desc' }, desc) : null),
    children ?? null)
}

function FindingList({ taskID = '', onSelect }: { taskID?: string; onSelect?: (id: string) => void }) {
  // task_id 是任务身份（Go 与 core 都按它过滤），执行台把同一个范围带给三个页签。
  const url = `/api/exploration/findings?page=1&limit=50${taskID ? `&task_id=${encodeURIComponent(taskID)}` : ''}`
  const { data, error, loading } = useApi(url, [url])
  if (loading) return h('div', null, '加载中…')
  if (error) return h('div', { style: { color: '#dc2626' } }, error)
  const rows = data?.items ?? []
  return h('div', null,
    h('div', { style: { fontSize: 12, color: 'var(--vx-muted, #6b7280)', marginBottom: 8 } },
      taskID ? `任务 #${taskID} · 共 ${data?.total ?? 0} 条` : `全部任务 · 共 ${data?.total ?? 0} 条`),
    h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
      h('thead', null, h('tr', null, ['ID', '任务', '漏洞类', '严重度', '状态', '摘要'].map((title) => h('th', { key: title, style: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--vx-border, #e5e7eb)' } }, title)))),
      h('tbody', null, rows.map((row: any) => h('tr', { key: row.finding_id, onClick: () => onSelect?.(String(row.finding_id)), style: { cursor: onSelect ? 'pointer' : 'default' } },
        h('td', { style: { padding: '6px 8px' } }, row.finding_id),
        h('td', { style: { padding: '6px 8px' } }, row.task_id ?? '—'),
        h('td', { style: { padding: '6px 8px' } }, row.vulnclass),
        h('td', { style: { padding: '6px 8px' } }, row.severity),
        h('td', { style: { padding: '6px 8px' } }, row.status),
        h('td', { style: { padding: '6px 8px', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, row.summary))))))
}

function FindingDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const finding = useApi(`/api/exploration/findings/${id}`)
  const traffic = useApi(`/api/exploration/findings/${id}/traffic`)
  const [body, setBody] = useState<{ title: string; text: string; error: string }>({ title: '', text: '', error: '' })
  const loadBody = async (bindingId: string, side: string) => {
    try {
      const data = await callApi(`/api/exploration/findings/${id}/traffic/${bindingId}/body?side=${side}&length=8192`)
      setBody({ title: `${bindingId} · ${side} · ${data.offset}-${data.next_offset}/${data.total}`, text: data.content, error: '' })
    } catch (error: any) { setBody({ title: `${bindingId} · ${side}`, text: '', error: String(error?.message ?? error) }) }
  }
  if (finding.loading) return h('div', null, '加载中…')
  if (finding.error) return h('div', { style: { color: '#dc2626' } }, finding.error)
  const row = finding.data ?? {}
  const bindings = traffic.data?.bindings ?? []
  return h('div', null,
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 } },
      h('button', { type: 'button', onClick: onBack, style: { border: '1px solid var(--vx-border, #e5e7eb)', background: 'transparent', borderRadius: 8, padding: '3px 10px', cursor: 'pointer' } }, '← 返回'),
      h('span', { style: { fontSize: 18, fontWeight: 600 } }, `${row.finding_id} · ${row.vulnclass ?? ''}`),
      h('span', { style: { fontSize: 12, color: 'var(--vx-muted, #6b7280)' } }, `${row.severity} / ${row.status}`)),
    h('div', { style: { fontSize: 13, marginBottom: 10 } }, row.summary),
    h('pre', { style: { fontSize: 12, whiteSpace: 'pre-wrap', background: 'var(--vx-code, #f8fafc)', padding: 10, borderRadius: 8, maxHeight: 220, overflow: 'auto' } }, row.evidence || ''),
    h('div', { style: { fontSize: 13, fontWeight: 600, margin: '14px 0 6px' } }, `流量绑定（${bindings.length}）`),
    ...bindings.map((binding: any) => h('div', { key: binding.id, style: { border: '1px solid var(--vx-border, #e5e7eb)', borderRadius: 8, padding: 8, marginBottom: 8, fontSize: 12 } },
      h('div', null, `#${binding.id} · ${binding.snapshot?.method ?? ''} ${binding.snapshot?.url ?? ''} · ${binding.role}`),
      h('div', { style: { marginTop: 6, display: 'flex', gap: 8 } },
        h('button', { type: 'button', onClick: () => loadBody(String(binding.id), 'response'), style: { cursor: 'pointer' } }, '响应正文'),
        h('button', { type: 'button', onClick: () => loadBody(String(binding.id), 'request'), style: { cursor: 'pointer' } }, '请求正文')))),
    body.title ? h('div', null,
      h('div', { style: { fontSize: 12, margin: '8px 0 4px', color: 'var(--vx-muted, #6b7280)' } }, body.title),
      body.error
        ? h('div', { style: { color: '#dc2626', fontSize: 12 } }, body.error)
        : h('pre', { style: { fontSize: 12, whiteSpace: 'pre-wrap', background: 'var(--vx-code, #f8fafc)', padding: 10, borderRadius: 8, maxHeight: 280, overflow: 'auto' } }, body.text)) : null)
}

type WorkbenchTab = 'tasks' | 'findings' | 'runs'

const WORKBENCH_TABS: ReadonlyArray<readonly [WorkbenchTab, string]> = [
  ['tasks', '任务'],
  ['findings', '发现'],
  ['runs', '工具执行']
]

/**
 * 执行台：任务 / 发现 / 工具执行 三面合一。
 *
 * 三个视图共用顶部那个任务范围，所以"看到某个任务 → 看它的发现 → 看它调过哪些工具"
 * 不用三次重新筛选。原先独立的「任务」「发现」「工具执行」入口和「日志」面板都并进
 * 这里：日志展示的就是工具执行页签里那份 activity 流，只是另一种视图。
 */
function WorkbenchPanel() {
  const tasks = useApi('/api/tasks')
  const [tab, setTab] = useState<WorkbenchTab>('tasks')
  const [taskID, setTaskID] = useState('')
  const [detailID, setDetailID] = useState('')
  const [findingID, setFindingID] = useState('')
  const options: any[] = tasks.data?.tasks ?? []
  const scoped = taskID !== ''
  const pick = (id: string): void => { setTaskID(id); setDetailID(''); setFindingID('') }

  const tabButton = (id: WorkbenchTab, label: string): ReactNode =>
    h('button', { key: id, type: 'button', 'aria-pressed': tab === id, onClick: () => setTab(id) }, label)

  let body: ReactNode
  if (tab === 'tasks') {
    body = detailID
      ? h(TaskDetail, { id: detailID, onBack: () => setDetailID('') })
      : h('div', null,
          h(Dashboard),
          h(TaskList, { scope: taskID, onSelect: (id: string) => { setDetailID(id); setTaskID(id) } }))
  } else if (tab === 'findings') {
    body = findingID
      ? h(FindingDetail, { id: findingID, onBack: () => setFindingID('') })
      : h(FindingList, { taskID, onSelect: setFindingID })
  } else {
    body = h('div', null,
      h(ToolRunPage, { taskID }),
      h('div', { style: { marginTop: 18 } },
        scoped
          ? h(ExecStream, { taskID })
          : h('p', { style: { fontSize: 12, color: 'var(--vx-text-dim)', margin: 0 } },
              '选一个任务即可看它的执行记录：planner / main 每一步，含工具调用与结果。')))
  }

  return h(PanelShell, { title: '执行台', desc: '任务 / 发现 / 工具执行共用同一个任务范围' },
    h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 } },
      h('div', { className: 'vx-seg', role: 'group', 'aria-label': '执行台视图' },
        WORKBENCH_TABS.map(([id, label]) => tabButton(id, label))),
      h('select', {
        key: 'scope',
        'aria-label': '任务范围',
        value: taskID,
        onChange: (event: any) => pick(event.target.value),
        style: { minWidth: 240 }
      },
        h('option', { key: 'all', value: '' }, '全部任务'),
        options.slice(0, 100).map((task: any) => h('option', { key: task.id, value: String(task.id) },
          `${task.id} · ${task.name || task.description || '未命名'}`))),
      scoped ? h('span', { style: { fontSize: 12, color: 'var(--vx-text-dim)' } }, '三个视图共用这个任务范围') : null),
    body)
}

function AssetsTable({ revision, onRefresh }: { revision: number; onRefresh: () => void }) {
  const [type, setType] = useState('root_domain')
  const [page, setPage] = useState(0)
  const url = `/api/assets?type=${type}&limit=50&offset=${page * 50}`
  const { data, error, loading } = useApi(url, [url, revision])
  const rows = data?.assets ?? []
  const total = data?.total ?? rows.length
  return h('div', null,
    h('div', { style: { display: 'flex', gap: 8, marginBottom: 10 } },
      h('select', { 'aria-label': '资产类型', value: type, onChange: (event: any) => { setType(event.target.value); setPage(0) } },
        [['root_domain', '主域名'], ['subdomain', '子域名'], ['ip', 'IP'], ['service', '服务'], ['endpoint', '端点'], ['app', '应用']].map(([value, label]) => h('option', { key: value, value }, label))),
      h('button', { type: 'button', onClick: onRefresh }, '刷新')),
    loading && h('div', null, '加载中…'),
    error && h('div', { role: 'alert', style: { color: '#dc2626' } }, error),
    data && (rows.length === 0 ? h('p', null, '暂无此类资产') : h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
      h('thead', null, h('tr', null, ['ID', '资产', '方法', '端口', '最后发现'].map((t) => h('th', { key: t, style: { textAlign: 'left', padding: '6px 8px' } }, t)))),
      h('tbody', null, rows.map((row: any) => h('tr', { key: row.id },
        h('td', { style: { padding: '6px 8px' } }, row.id),
        h('td', { style: { padding: '6px 8px', overflowWrap: 'anywhere' } }, row.url || row.domain || row.ip || row.app_name || ''),
        h('td', { style: { padding: '6px 8px' } }, row.method ?? ''),
        h('td', { style: { padding: '6px 8px' } }, row.port ?? ''),
        h('td', { style: { padding: '6px 8px' } }, row.last_seen ?? '')))))),
    data && (page > 0 || total > 50) && h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 } },
      h('button', { type: 'button', disabled: page === 0, onClick: () => setPage(page - 1) }, '上一页'),
      h('span', null, `${page + 1} / ${Math.max(1, Math.ceil(total / 50))}`),
      h('button', { type: 'button', disabled: (page + 1) * 50 >= total, onClick: () => setPage(page + 1) }, '下一页')))
}

/** 资产面板：列表与导入共用一处，导入完成后列表自动刷新。 */
function AssetsPanel() {
  const [tab, setTab] = useState<'list' | 'import'>('list')
  const [revision, setRevision] = useState(0)
  const refresh = (): void => setRevision((value) => value + 1)
  return h(PanelShell, { title: '资产', desc: '域名、IP、服务与端点；支持 JSON 导入' },
    h('div', { className: 'vx-seg', role: 'group', 'aria-label': '资产视图', style: { marginBottom: 12 } },
      h('button', { type: 'button', 'aria-pressed': tab === 'list', onClick: () => setTab('list') }, '资产列表'),
      h('button', { type: 'button', 'aria-pressed': tab === 'import', onClick: () => setTab('import') }, '导入')),
    tab === 'list'
      ? h(AssetsTable, { revision, onRefresh: refresh })
      : h(AssetImport, { onImported: () => { refresh(); setTab('list') } }))
}

function TrafficPanel() {
  return h(PanelShell, { title: '流量' }, h(TrafficPage))
}

function AgentSettings() {
  return h(PanelShell, { title: 'Agent 管理', desc: '名称、描述与触发配置' }, h(AgentsPage))
}

/**
 * 工具与 MCP：两者是同一件事的两半——内置/自定义工具，加上提供外部工具的 MCP
 * server。分成两个设置节时，用户要为"这个工具到底从哪来"来回切。
 */
function ToolsMcpSettings() {
  const [tab, setTab] = useState<'tools' | 'mcp'>('tools')
  const tabButton = (id: 'tools' | 'mcp', label: string): ReactNode =>
    h('button', { key: id, type: 'button', 'aria-pressed': tab === id, onClick: () => setTab(id) }, label)
  return h(PanelShell, { title: '工具与 MCP', desc: '内置/自定义工具，以及提供工具的 MCP server' },
    h('div', { className: 'vx-seg', role: 'group', 'aria-label': '工具与 MCP 视图', style: { marginBottom: 12 } },
      tabButton('tools', '工具'),
      tabButton('mcp', 'MCP server')),
    tab === 'tools' ? h(ToolsPage) : h(McpPage))
}

function NotifySettings() {
  return h(PanelShell, { title: '通知推送', desc: '渠道与投递' }, h(NotifyPage))
}

function InterceptSettings() {
  return h(PanelShell, { title: '拦截规则', desc: '工具输入/输出拦截（经 core 代理 Go）' }, h(InterceptPage))
}

function ApprovalsSettings() {
  return h(PanelShell, { title: '审批记录', desc: '人工审批与操作留痕' }, h(ApprovalsPage))
}

// 侧边栏入口：执行台把任务/发现/工具执行收在一起，日志不再是独立页面。
const PANELS = [
  { id: 'vexnar-overview', label: '概览', order: 99, component: OverviewPanel, icon: OverviewIcon },
  { id: 'vexnar-workbench', label: '执行台', order: 100, component: WorkbenchPanel },
  { id: 'vexnar-traffic', label: '流量', order: 102, component: TrafficPanel },
  { id: 'vexnar-assets', label: '资产', order: 103, component: AssetsPanel }
]

// 设置：MCP 与 工具 合并成「工具与 MCP」；资产同步并入资产面板。
const SETTINGS = [
  { id: 'vexnar-agents', label: 'Agent 管理', order: 40, component: AgentSettings },
  { id: 'vexnar-tools-mcp', label: '工具与 MCP', order: 41, component: ToolsMcpSettings },
  { id: 'vexnar-notify', label: '通知推送', order: 43, component: NotifySettings },
  { id: 'vexnar-intercept', label: '拦截规则', order: 44, component: InterceptSettings },
  { id: 'vexnar-approvals', label: '审批记录', order: 46, component: ApprovalsSettings }
]

export function apply(ctx: {
  slots?: {
    inject: (name: string, register: () => unknown) => void
    register: (options: { name: string; key?: string; id?: string; order?: number; label?: () => string }, component: unknown) => unknown
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
  for (const panel of PANELS) {
    slots.inject('main', () => slots.register({ name: 'main', key: panel.id }, panel.component))
    slots.inject('sidebar.panellist', () => slots.register({ name: 'sidebar.panellist', id: panel.id, order: panel.order, label: () => panel.label }, panel.icon ?? ConsoleIcon))
  }
  for (const section of SETTINGS) {
    slots.inject('settings.section', () => slots.register({ name: 'settings.section', id: section.id, label: () => section.label, order: section.order }, section.component))
  }
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
