// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createElement as h, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { installStyles } from './styles.js'
import { OverviewPanel } from './overview.js'
import { YakHistory, SessionTrafficAction } from './yak-history.js'
import { SessionCaptureAction } from './capture-action.js'
import { CORE_BASE, callApi, responseError, useApi } from './api.js'
import { McpTab, ToolsTab } from './catalog.js'
import { TasksWorkspace } from './tasks/workspace.js'
import { InterceptSettings as InterceptPanel } from './intercept/page.js'

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

export function Dashboard() {
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

const PAGE_SIZE = 20

const TASK_STATUS_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['created', '待启动'],
  ['queued', '排队'],
  ['running', '运行中'],
  ['paused', '暂停'],
  ['done', '完成'],
  ['failed', '失败'],
  ['timeout', '超时']
]

const SEVERITY_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['critical', '严重'],
  ['high', '高危'],
  ['medium', '中危'],
  ['low', '低危']
]

const FINDING_STATUS_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['pending', '待处理'],
  ['in_progress', '处理中'],
  ['confirmed', '已确认'],
  ['resolved', '已处理'],
  ['fixed', '已修复'],
  ['false_positive', '误报'],
  ['ignored', '忽略'],
  ['duplicate', '重复'],
  ['risk_accepted', '风险接受']
]

/** errText 把 fetch/响应错误统一成一句可读文案。 */
function errText(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error ?? '未知错误')
}

function labelOf(table: ReadonlyArray<readonly [string, string]>, value: unknown): string {
  const key = String(value ?? '')
  return table.find(([id]) => id === key)?.[1] ?? (key || '—')
}

/** 一个任务行的发现总数（按严重度分布合计）。 */
function findingCount(task: any): number {
  const f = task?.findings ?? {}
  return Number(f.critical ?? 0) + Number(f.high ?? 0) + Number(f.medium ?? 0) + Number(f.low ?? 0)
}

function Toolbar({ children }: { children?: ReactNode }) {
  return h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 } }, children)
}

function Pager({ page, pageCount, total, unit, onPage }: {
  page: number
  pageCount: number
  total: number
  unit: string
  onPage: (next: number) => void
}) {
  if (pageCount <= 1) {
    return h('div', { style: { fontSize: 12, color: 'var(--vx-text-dim)', marginTop: 8 } }, `共 ${total} ${unit}`)
  }
  return h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 12 } },
    h('button', { type: 'button', disabled: page <= 0, onClick: () => onPage(page - 1) }, '上一页'),
    h('span', null, `${page + 1} / ${pageCount} · 共 ${total} ${unit}`),
    h('button', { type: 'button', disabled: page + 1 >= pageCount, onClick: () => onPage(page + 1) }, '下一页'))
}

/**
 * 任务清单：core 的 /api/tasks 一次返回全部任务（与 Go 的 listTasks 一致），
 * 所以筛选与分页在客户端做，不额外造后端参数。
 */
/**
 * 任务范围选择器。
 *
 * 用 datalist 而不是 select：任务可能有上千条，select 只能渲染前 N 个（旧版就是 200），
 * 而 datalist 由浏览器做过滤，同时允许直接键入任意任务 id（范围以外也认）。
 * 留空 = 全部任务。
 */
function TaskScopePicker({ scope, onScope, options }: {
  scope: string
  onScope: (taskID: string) => void
  options: any[]
}) {
  const current = options.find((task) => String(task.id) === scope)
  const label = current ? current.name || current.description || '未命名' : ''
  return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
    h('input', {
      list: 'vx-task-scope-options',
      'aria-label': '任务范围',
      placeholder: '任务范围：留空=全部，可输入 ID 或搜索名称',
      value: scope,
      onChange: (event: any) => onScope(event.target.value.replace(/[^\w-]/g, '')),
      style: { minWidth: 220 }
    }),
    h('datalist', { id: 'vx-task-scope-options' },
      options.map((task: any) => h('option', { key: task.id, value: String(task.id) },
        `${task.id} · ${task.name || task.description || '未命名'}`))),
    scope
      ? h('button', {
          type: 'button', onClick: () => onScope(''), title: '清除任务范围'
        }, '×')
      : null,
    scope && label ? h('span', { style: { fontSize: 12, color: 'var(--vx-text-dim)' } }, label) : null)
}

/**
 * 任务清单：筛选与窗口都交给后端（`/api/tasks?status=&q=&page=&size=`），所以任务再多
 * 也只取一页；total 是筛选后的全集，分页器据此算页数。排序沿用后端的置顶优先 + id 倒序。
 */
export function TaskList({ onOpen }: { onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [needle, setNeedle] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timer = window.setTimeout(() => { setNeedle(query.trim()); setPage(1) }, 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) })
  if (status !== 'all') params.set('status', status)
  if (needle) params.set('q', needle)
  const url = `/api/tasks?${params.toString()}`
  const { data, error, loading } = useApi(url, [url])

  const rows: any[] = data?.tasks ?? []
  const total = Number(data?.total ?? rows.length)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return h('div', null,
    h(Toolbar, null,
      h('input', {
        placeholder: '搜索 ID / 名称 / 描述 / 目标',
        value: query,
        onChange: (event: any) => setQuery(event.target.value),
        style: { minWidth: 260 }
      }),
      h('select', {
        'aria-label': '任务状态',
        value: status,
        onChange: (event: any) => { setStatus(event.target.value); setPage(1) }
      },
        h('option', { key: 'all', value: 'all' }, '全部状态'),
        TASK_STATUS_LABELS.map(([value, label]) => h('option', { key: value, value }, label))),
      error
        ? h('span', { role: 'alert', style: { fontSize: 12, color: '#dc2626' } }, error)
        : h('span', { style: { fontSize: 12, color: 'var(--vx-text-dim)', marginLeft: 'auto' } },
            loading ? '加载中…' : `共 ${total} 个任务`)),
    rows.length === 0
      ? h('p', { style: { fontSize: 12, color: 'var(--vx-text-dim)' } },
          loading ? '加载中…' : '没有符合条件的任务。')
      : h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
          h('thead', null, h('tr', null,
            ['ID', '名称', '状态', '目标', '发现', '在途', '最近活动'].map((title) => h('th', {
              key: title, style: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--vx-border, #e5e7eb)' }
            }, title)))),
          h('tbody', null, rows.map((task: any) => h('tr', {
            key: task.id, onClick: () => onOpen(String(task.id)), style: { cursor: 'pointer' }
          },
            h('td', { style: { padding: '6px 8px', fontFamily: 'var(--vx-mono)' } }, task.id),
            h('td', { style: { padding: '6px 8px', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
              task.name || task.description || '未命名'),
            h('td', { style: { padding: '6px 8px' } }, labelOf(TASK_STATUS_LABELS, task.status)),
            h('td', { style: { padding: '6px 8px', fontSize: 12, color: 'var(--vx-text-dim)' } },
              `${task.goals_met ?? 0}/${task.goals_total ?? 0}`),
            h('td', { style: { padding: '6px 8px' } },
              `${findingCount(task)}`,
              findingCount(task) > 0 ? h('span', {
                style: { marginLeft: 6, fontSize: 11, color: 'var(--vx-negative)' }
              }, `严重 ${task.findings?.critical ?? 0} · 高 ${task.findings?.high ?? 0}`) : null),
            h('td', { style: { padding: '6px 8px', fontSize: 12 } }, task.in_flight ? `${task.in_flight}` : '—'),
            h('td', { style: { padding: '6px 8px', fontSize: 12, color: 'var(--vx-text-dim)' } },
              task.last_activity_unix ? fmtAgo(task.last_activity_unix) : '—'))))),
    h(Pager, { page: Math.min(page, pageCount) - 1, pageCount, total, unit: '个任务', onPage: (next) => setPage(next + 1) }))
}

/**
 * 任务详情：一个任务的全部上下文——目标、意图、节点、覆盖度，它的发现，以及它调过的
 * 工具与执行记录。执行记录本来就属于任务的从属数据，所以它在这里，不占顶层页签。
 */
export function TaskDetail({ id, onBack, onOpenFindings, onOpenFinding }: {
  id: string
  onBack: () => void
  onOpenFindings?: (taskID: string) => void
  onOpenFinding?: (findingID: string) => void
}) {
  const [tick, setTick] = useState(0)
  const task = useApi(`/api/tasks/${id}`, [tick])
  const goals = useApi(`/api/tasks/${id}/goals`, [tick])
  const intents = useApi(`/api/exploration/intents?task=${id}&limit=40`, [tick])
  const coverage = useApi(`/api/tasks/${id}/coverage`, [tick])
  const nodes = useApi(`/api/exploration/nodes?task=${id}&size=20`, [tick])
  const findings = useApi(`/api/exploration/findings?task_id=${encodeURIComponent(id)}&page=1&limit=20`, [tick, id])

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
  const findingRows: any[] = findings.data?.items ?? []
  const findingTotal = Number(findings.data?.total ?? findingRows.length)
  const intentRows = list(intents.data)
  const nodeRows = list(nodes.data)
  const cover = coverage.data ?? {}
  const tokens = row.tokens ?? {}
  const status = String(row.status ?? '')
  const pills = [
    ['目标', `${row.goals_met ?? 0}/${row.goals_total ?? 0}`],
    ['在途意图', String(row.in_flight ?? 0)],
    ['发现合计', String(findingCount(row))],
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
    h('div', { style: { display: 'flex', gap: 8, margin: '10px 0 16px', flexWrap: 'wrap' } },
      status === 'running' ? h('button', { type: 'button', onClick: () => act('pause'), style: { cursor: 'pointer' } }, '暂停') : null,
      status === 'paused' ? h('button', { type: 'button', onClick: () => act('resume'), style: { cursor: 'pointer' } }, '恢复') : null,
      h('button', { type: 'button', onClick: () => act('archive'), style: { cursor: 'pointer' } }, '归档'),
      h('button', { type: 'button', onClick: () => setTick((value) => value + 1), style: { cursor: 'pointer' } }, '刷新'),
      onOpenFindings ? h('button', {
        type: 'button', onClick: () => onOpenFindings(id), style: { cursor: 'pointer' }
      }, `在发现里查看（${findingRows.length}）`) : null),
    meta('目标', h('div', { style: { fontSize: 13, lineHeight: 1.6 } }, String(row.goal ?? '—'))),
    meta(`发现（${findingRows.length}${findingTotal > findingRows.length ? ` / 共 ${findingTotal}` : ''}）`,
      findings.error
        ? h('div', { role: 'alert', style: { fontSize: 12, color: '#dc2626' } }, `发现读取失败：${findings.error}`)
        : findings.loading && findingRows.length === 0
        ? h('div', { style: { fontSize: 12, color: 'var(--vx-text-dim)' } }, '加载中…')
        : findingRows.length === 0
        ? h('div', { style: { fontSize: 12, color: 'var(--vx-text-dim)' } }, '该任务还没有登记发现。')
        : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 } },
            findingRows.map((finding: any) => h('div', {
              key: String(finding.finding_id),
              onClick: onOpenFinding ? () => onOpenFinding(String(finding.finding_id)) : undefined,
              style: { display: 'flex', gap: 8, alignItems: 'baseline', cursor: onOpenFinding ? 'pointer' : 'default' }
            },
              h('span', { className: 'vx-ov-pill' }, labelOf(SEVERITY_LABELS, finding.severity)),
              h('span', { style: { color: 'var(--vx-text-dim)', fontFamily: 'var(--vx-mono)' } }, finding.vulnclass ?? ''),
              h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, finding.summary ?? ''),
              h('span', { style: { color: 'var(--vx-text-faint)', fontSize: 11, marginLeft: 'auto' } },
                labelOf(FINDING_STATUS_LABELS, finding.status)))))),
    meta('工具执行', h('div', null,
      h(ToolRunPage, { taskID: id }),
      h('div', { style: { marginTop: 14 } }, h(ExecStream, { taskID: id })))),
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
/**
 * 直接执行内置侦察工具。
 *
 * 工具清单来自 runner 自己的目录（`GET /api/engine/tools` → vexnar-store 的 templates），
 * 客户端不再硬编码名字表：runner 加工具，这里自动出现。额外参数按 runner 的约定以 JSON
 * 传入（nmap: {"ports":"1-1000","scripts":"..."}、ffuf: {"wordlist":"..."} …）。
 * 结果按当前任务落库，并把落库产出物数量回报出来。
 */
function ToolRunPage({ taskID = '' }: { taskID?: string }) {
  const catalog = useApi('/api/engine/tools')
  const tools: any[] = catalog.data?.tools ?? []
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [extra, setExtra] = useState('')
  const [busy, setBusy] = useState(false)
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')

  const selected = name || tools[0]?.name || 'nmap'
  const spec = tools.find((tool) => tool.name === selected)

  const run = async () => {
    setError('')
    let args: Record<string, unknown> = {}
    if (extra.trim()) {
      try {
        const parsed = JSON.parse(extra)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('参数需为 JSON 对象')
        args = parsed as Record<string, unknown>
      } catch (e: any) {
        setError(`参数不是合法 JSON 对象：${String(e?.message ?? e)}`)
        return
      }
    }
    setBusy(true)
    setOutput('执行中…')
    try {
      const data = await callApi('/api/engine/tools/run', 'POST', { name: selected, target, args, task_id: taskID || undefined })
      const created = Array.isArray(data.created) ? data.created : []
      setOutput([
        `code=${data.code} truncated=${data.truncated}${data.timed_out ? ' timed_out' : ''}`,
        created.length > 0
          ? `落库 ${created.length} 项：${created.slice(0, 12).map((row: any) => `${row.kind}#${row.id}`).join('、')}${created.length > 12 ? ' …' : ''}`
          : '',
        data.parsed ? JSON.stringify(data.parsed, null, 2) : '',
        data.stdout,
        data.stderr
      ].filter(Boolean).join('\n'))
    } catch (e: any) { setOutput(String(e?.message ?? e)) } finally { setBusy(false) }
  }

  return h('div', { style: { fontSize: 13 } },
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 } },
      h('select', {
        'aria-label': '工具',
        value: selected,
        onChange: (event: any) => setName(event.target.value)
      },
        (tools.length === 0 ? [selected] : tools.map((tool) => tool.name)).map((item: string) =>
          h('option', { key: item, value: item }, item))),
      h('input', {
        placeholder: 'target（域名 / URL / IP）',
        value: target,
        onChange: (event: any) => setTarget(event.target.value),
        style: { minWidth: 260 }
      }),
      h('input', {
        placeholder: '额外参数（JSON，可选）',
        value: extra,
        onChange: (event: any) => setExtra(event.target.value),
        style: { minWidth: 200, fontFamily: 'var(--vx-mono)' }
      }),
      h('button', { type: 'button', onClick: run, disabled: busy || !target.trim(), style: { cursor: 'pointer' } },
        busy ? '执行中…' : '执行'),
      h('span', { style: { fontSize: 12, color: 'var(--vx-text-dim)' } },
        taskID ? `结果记入任务 #${taskID}` : '未选任务：结果不落库')),
    spec ? h('div', { style: { fontSize: 12, color: 'var(--vx-text-dim)', marginBottom: 8 } }, spec.description) : null,
    catalog.error ? h('div', { role: 'alert', style: { fontSize: 12, color: '#dc2626', marginBottom: 6 } }, `工具目录读取失败：${catalog.error}`) : null,
    error ? h('div', { role: 'alert', style: { fontSize: 12, color: '#dc2626', marginBottom: 6 } }, error) : null,
    output ? h('pre', { style: { fontSize: 12, whiteSpace: 'pre-wrap', background: 'var(--vx-code, #f8fafc)', padding: 10, borderRadius: 8, minHeight: 120, maxHeight: 420, overflow: 'auto' } }, output) : null)
}

/**
 * 该任务的执行流。
 *
 * 这正是原先「日志」面板展示的那批 activity 行：planner / main / intent 的每一步，
 * 其中 kind=tool_use / tool_result 的行就是一次工具执行。它过去有独立入口，但看的
 * 是同一批数据，所以并进任务详情——任务就是它的范围，不用再选一次任务。
 *
 * 分页沿用后端反向游标：首屏是最新一页，「加载更早」用 before=<当前最早 seq> 往前翻，
 * has_more 说明还有更早的记录，长任务不会只剩最后 100 行。
 */
function ExecStream({ taskID }: { taskID: string }) {
  const [session, setSession] = useState('plan')
  const [rows, setRows] = useState<any[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)

  const load = useCallback(async (before: number) => {
    const query = new URLSearchParams({ task: taskID, session, limit: '100' })
    if (before > 0) query.set('before', String(before))
    const response = await fetch(CORE_BASE + `/api/exploration/activity/history?${query.toString()}`)
    if (!response.ok) throw await responseError(response)
    return await response.json() as { items?: any[]; has_more?: boolean }
  }, [taskID, session])

  useEffect(() => {
    if (!taskID) { setRows([]); setHasMore(false); setError(''); return }
    let alive = true
    setError('')
    setLoading(true)
    load(0)
      .then((data: { items?: any[]; has_more?: boolean }) => {
        if (!alive) return
        setRows(data.items ?? [])
        setHasMore(Boolean(data.has_more))
      })
      .catch((e: unknown) => { if (alive) { setError(errText(e)); setRows([]); setHasMore(false) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [taskID, session, tick, load])

  const loadEarlier = async () => {
    const earliest = rows.length > 0 ? Number(rows[0].seq) : 0
    if (!earliest) return
    setLoading(true)
    setError('')
    try {
      const data = await load(earliest)
      setRows((current) => [...(data.items ?? []), ...current])
      setHasMore(Boolean(data.has_more))
    } catch (e) { setError(errText(e)) } finally { setLoading(false) }
  }

  return h('div', null,
    h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' } },
      h('span', { style: { fontSize: 12, fontWeight: 600, color: 'var(--vx-text-dim)' } }, `执行记录 · 任务 #${taskID}`),
      h('select', { 'aria-label': '会话', value: session, onChange: (event: any) => setSession(event.target.value) },
        [['plan', 'planner'], ['main', 'main']].map(([value, label]) => h('option', { key: value, value }, label))),
      h('button', { type: 'button', onClick: () => setTick((value) => value + 1), disabled: loading, style: { cursor: 'pointer' } },
        loading ? '加载中…' : '刷新'),
      hasMore
        ? h('button', { type: 'button', onClick: loadEarlier, disabled: loading, style: { cursor: 'pointer' } }, '加载更早')
        : rows.length > 0 ? h('span', { style: { fontSize: 12, color: 'var(--vx-text-dim)' } }, '已到最早') : null,
      h('span', { style: { fontSize: 12, color: 'var(--vx-text-dim)', marginLeft: 'auto' } }, `${rows.length} 行`)),
    error ? h('div', { role: 'alert', style: { color: '#dc2626', fontSize: 12 } }, error) : null,
    rows.length === 0 && !error && !loading ? h('p', { style: { fontSize: 12, color: 'var(--vx-text-dim)' } }, '该会话还没有执行记录。') : null,
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

/** 发现清单：严重度 / 状态 / 任务 / 关键字筛选，分页由 core 的 page+limit 承担。 */
function FindingsTab({ scope, onScope, onOpen }: {
  scope: string
  onScope: (taskID: string) => void
  onOpen: (findingID: string) => void
}) {
  // 选项只取前 200 个任务名做补全提示；超出范围仍可直接键入任务 id（见 TaskScopePicker）。
  const tasks = useApi('/api/tasks?page=1&size=200')
  const [severity, setSeverity] = useState('all')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1) }, 300)
    return () => window.clearTimeout(timer)
  }, [search])

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
  if (scope) params.set('task_id', scope)
  if (severity !== 'all') params.set('severity', severity)
  if (status !== 'all') params.set('status', status)
  if (query) params.set('q', query)
  const url = `/api/exploration/findings?${params.toString()}`
  const { data, error, loading } = useApi(url, [url])

  const rows: any[] = data?.items ?? []
  const total = Number(data?.total ?? 0)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const options: any[] = tasks.data?.tasks ?? []

  return h('div', null,
    h(Toolbar, null,
      h('input', {
        placeholder: '搜索摘要 / 证据 / 漏洞类',
        value: search,
        onChange: (event: any) => setSearch(event.target.value),
        style: { minWidth: 240 }
      }),
      h('select', {
        'aria-label': '严重度',
        value: severity,
        onChange: (event: any) => { setSeverity(event.target.value); setPage(1) }
      },
        h('option', { key: 'all', value: 'all' }, '全部严重度'),
        SEVERITY_LABELS.map(([value, label]) => h('option', { key: value, value }, label))),
      h('select', {
        'aria-label': '处置状态',
        value: status,
        onChange: (event: any) => { setStatus(event.target.value); setPage(1) }
      },
        h('option', { key: 'all', value: 'all' }, '全部状态'),
        FINDING_STATUS_LABELS.map(([value, label]) => h('option', { key: value, value }, label))),
      h(TaskScopePicker, { scope, onScope: (taskID: string) => { onScope(taskID); setPage(1) }, options })),
    loading && rows.length === 0 ? h('div', null, '加载中…') : null,
    error ? h('div', { role: 'alert', style: { color: '#dc2626' } }, error) : null,
    !loading && !error && rows.length === 0
      ? h('p', { style: { fontSize: 12, color: 'var(--vx-text-dim)' } },
          scope ? `任务 #${scope} 下没有符合筛选条件的发现。` : '没有符合筛选条件的发现。')
      : rows.length > 0 && h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
          h('thead', null, h('tr', null,
            ['ID', '任务', '漏洞类', '严重度', '状态', '摘要'].map((title) => h('th', {
              key: title, style: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--vx-border, #e5e7eb)' }
            }, title)))),
          h('tbody', null, rows.map((finding: any) => h('tr', {
            key: finding.finding_id, onClick: () => onOpen(String(finding.finding_id)), style: { cursor: 'pointer' }
          },
            h('td', { style: { padding: '6px 8px', fontFamily: 'var(--vx-mono)' } }, finding.finding_id),
            h('td', { style: { padding: '6px 8px', fontFamily: 'var(--vx-mono)', color: 'var(--vx-text-dim)' } }, finding.task_id ?? '—'),
            h('td', { style: { padding: '6px 8px' } }, finding.vulnclass ?? ''),
            h('td', { style: { padding: '6px 8px' } }, labelOf(SEVERITY_LABELS, finding.severity)),
            h('td', { style: { padding: '6px 8px' } }, labelOf(FINDING_STATUS_LABELS, finding.status)),
            h('td', { style: { padding: '6px 8px', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
              finding.summary ?? ''))))),
    h(Pager, { page: Math.min(page, pageCount) - 1, pageCount, total, unit: '条发现', onPage: (next) => setPage(next + 1) }))
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

type TasksTab = 'tasks' | 'findings'

const TASKS_TABS: ReadonlyArray<readonly [TasksTab, string]> = [
  ['tasks', '任务'],
  ['findings', '发现']
]

/**
 * 任务面板：清单 + 发现两页签。
 *
 * 任务是对象，发现是它的产出，两者共用一个「任务范围」；工具执行与执行记录属于任务的
 * 从属数据，放在任务详情里（选中任务就能跑工具、看它调过什么），不占顶层页签。
 */
function TasksPanel() {
  const [tab, setTab] = useState<TasksTab>('tasks')
  const [findingID, setFindingID] = useState('')
  const [scope, setScope] = useState('')

  const tabButton = (id: TasksTab, label: string): ReactNode =>
    h('button', { key: id, type: 'button', 'aria-pressed': tab === id, onClick: () => setTab(id) }, label)


  let body: ReactNode
  if (tab === 'tasks') {
    // 任务页签整体交给复刻版工作区：清单 + 详情十页（与 Web 控制台同一组接口）。
    body = h(TasksWorkspace, null)
  } else {
    body = findingID
      ? h(FindingDetail, { id: findingID, onBack: () => setFindingID('') })
      : h(FindingsTab, { scope, onScope: setScope, onOpen: setFindingID })
  }

  return h(PanelShell, { title: '任务', desc: '任务清单、发现，以及每个任务的执行记录' },
    h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 } },
      h('div', { className: 'vx-seg', role: 'group', 'aria-label': '任务视图' },
        TASKS_TABS.map(([id, label]) => tabButton(id, label))),
      tab === 'findings' && scope
        ? h('span', { style: { fontSize: 12, color: 'var(--vx-text-dim)' } }, `任务范围 #${scope}`)
        : null),
    body)
}

function TrafficPanel() {
  return h(PanelShell, { title: '流量 History' }, h(YakHistory))
}

function NotifySettings() {
  return h(PanelShell, { title: '通知推送', desc: '渠道与投递' }, h(NotifyPage))
}

function InterceptSettings() {
  return h(PanelShell, { title: '拦截规则', desc: '工具执行前先按拦截规则匹配；未命中的命令可交由模型兜底判定' }, h(InterceptPanel))
}

// 侧边栏入口：任务是对象视图（清单 + 发现），工具执行与执行记录在任务详情里。
const PANELS = [
  { id: 'vexnar-overview', label: '概览', order: 99, component: OverviewPanel, icon: OverviewIcon },
  { id: 'vexnar-tasks', label: '任务', order: 100, component: TasksPanel },
  { id: 'vexnar-traffic', label: '流量', order: 102, component: TrafficPanel }
]

// Agent 名册不在这里：引擎的每个角色都是 app/vexnar/cordis.patch.yml 里一条
// `@deepseek-ai/dsh-agent-preset`，所以名册、名称、描述与能力组合只有 dsh 自己
// 的「设置 → Agent 预设」一处；再开一节 VEXNAR 的 Agent 管理就是第二份真相。
const SETTINGS = [
  { id: 'vexnar-notify', label: '通知推送', order: 43, component: NotifySettings },
  { id: 'vexnar-intercept', label: '拦截规则', order: 44, component: InterceptSettings }
]

/**
 * 工具与 MCP 是「内置插件」分区的标签页，不是并列的一节设置。
 *
 * 两者回答的是同一个问题——「这个工具从哪来」：内置工具由插件提供，MCP server 由
 * 插件挂载。dsh 已经把插件、它的配置和它的启停收在同一个分区里，另开一节只会让
 * 用户在两个页面之间对照来源，而权限又是第三处（dsh 的权限预设）。所以这里只贡献
 * 标签页，清单只读，启停与调用权限留给 dsh 统一管理。
 */
const PLUGIN_TABS = [
  { id: 'vexnar-plugin-tools', label: '工具', order: 20, component: ToolsTab },
  { id: 'vexnar-plugin-mcp', label: 'MCP server', order: 30, component: McpTab }
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
  slots.inject('conversation.session.header.actions', () =>
    slots.register({ name: 'conversation.session.header.actions', id: 'vexnar-yak-history' }, SessionTrafficAction))
  // 抓包按会话发起：开关放在 chat 头部，只作用于当前会话的 scope。
  slots.inject('conversation.session.header.actions', () =>
    slots.register({ name: 'conversation.session.header.actions', id: 'vexnar-session-capture', order: 40 }, SessionCaptureAction))
  slots.inject('conversation.hero.options', () =>
    slots.register({ name: 'conversation.hero.options', id: 'vexnar-yak-history' }, SessionTrafficAction))
  for (const panel of PANELS) {
    slots.inject('main', () => slots.register({ name: 'main', key: panel.id }, panel.component))
    slots.inject('sidebar.panellist', () => slots.register({ name: 'sidebar.panellist', id: panel.id, order: panel.order, label: () => panel.label }, panel.icon ?? ConsoleIcon))
  }
  for (const section of SETTINGS) {
    slots.inject('settings.section', () => slots.register({ name: 'settings.section', id: section.id, label: () => section.label, order: section.order }, section.component))
  }
  // 工具与 MCP 归入 dsh 的「内置插件」分区：清单是标签页，权限归 dsh。
  for (const tab of PLUGIN_TABS) {
    slots.inject('settings.plugins.tab', () => slots.register({ name: 'settings.plugins.tab', id: tab.id, label: () => tab.label, order: tab.order }, tab.component))
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
