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

const PANEL_ID = 'vexnar-console'

const NAV_GROUPS: Array<{ title: string; items: Array<{ id: string; label: string; desc: string; badge?: number }> }> = [
  { title: '功能', items: [
    { id: 'dashboard', label: '仪表盘', desc: '任务、发现、资产与 Token 总览' },
    { id: 'chat', label: '对话', desc: '主 Agent 会话与上下文' },
    { id: 'tasks', label: '任务', desc: '任务列表、意图与目标' },
    { id: 'findings', label: '发现', desc: '漏洞列表、分组与详情' },
    { id: 'traffic', label: '流量', desc: '抓包、证据绑定与正文' },
    { id: 'tools-run', label: '工具执行', desc: 'nmap / httpx / ffuf / sqlmap' },
    { id: 'llm-record', label: 'LLM 录制', desc: '请求与响应记录' },
    { id: 'assets', label: '资产', desc: '域名 / IP / 服务 / 端点' },
    { id: 'assets-sync', label: '资产同步', desc: '外部资产源同步' },
    { id: 'workspace', label: '工作空间', desc: '文件与产物' }
  ] },
  { title: '系统', items: [
    { id: 'llm', label: 'LLM', desc: '模型配置与网关' },
    { id: 'agents', label: 'Agent', desc: '规划者 / 执行者 / 触发' },
    { id: 'mcp', label: 'MCP', desc: 'MCP server 与工具目录' },
    { id: 'skill', label: 'Skill', desc: '技能包与可见性' },
    { id: 'tools', label: '工具', desc: '内置与自定义工具' },
    { id: 'notify', label: '通知推送', desc: '渠道与投递记录' },
    { id: 'intercept', label: '拦截规则', desc: '请求拦截与改写' },
    { id: 'asset-intercept', label: '资产拦截', desc: '资产范围与自动认领' },
    { id: 'approvals', label: '审批记录', desc: '人工审批与操作日志', badge: 2 },
    { id: 'logs', label: '日志', desc: '引擎与工具日志' },
    { id: 'settings', label: '系统配置', desc: '运行参数与偏好' }
  ] }
]

function ConsoleIcon({ size }: { size?: number }): ReactNode {
  return h('svg', { width: size ?? 16, height: size ?? 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
    h('path', { d: 'M12 3 3 7l9 4 9-4-9-4Z' }),
    h('path', { d: 'm3 12 9 4 9-4' }),
    h('path', { d: 'm3 17 9 4 9-4' }))
}

function useApi(path: string, deps: unknown[] = []): { data: any; error: string; loading: boolean } {
  const [state, setState] = useState<{ data: any; error: string; loading: boolean }>({ data: null, error: '', loading: true })
  useEffect(() => {
    let alive = true
    const base = (localStorage.getItem('vexnar.coreUrl') || 'http://127.0.0.1:8790').replace(/\/$/, '')
    const token = localStorage.getItem('vexnar.coreToken') || ''
    if (!token) { setState({ data: null, error: '未配置 vexnar.coreToken', loading: false }); return }
    fetch(base + path, { headers: { 'x-vexnar-token': token } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
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
    h('div', { style: { fontSize: 12, color: 'var(--vx-muted, #6b7280)' } }, tasks.error || findings.error || assets.error || tokens.error || '数据来自 vexnar-core'))
}

function TaskList() {
  const { data, error, loading } = useApi('/api/tasks')
  if (loading) return h('div', null, '加载中…')
  if (error) return h('div', { style: { color: '#dc2626' } }, error)
  const rows = (data?.tasks ?? []).slice(0, 30)
  return h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
    h('thead', null, h('tr', null, ['ID', '名称', '状态', '目标'].map((title) => h('th', { key: title, style: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--vx-border, #e5e7eb)' } }, title)))),
    h('tbody', null, rows.map((task: any) => h('tr', { key: task.id },
      h('td', { style: { padding: '6px 8px' } }, task.id),
      h('td', { style: { padding: '6px 8px' } }, task.name || '—'),
      h('td', { style: { padding: '6px 8px' } }, task.status),
      h('td', { style: { padding: '6px 8px', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, task.goal)))))
}

function FindingList() {
  const { data, error, loading } = useApi('/api/exploration/findings?page=1&limit=30')
  if (loading) return h('div', null, '加载中…')
  if (error) return h('div', { style: { color: '#dc2626' } }, error)
  const rows = data?.items ?? []
  return h('div', null,
    h('div', { style: { fontSize: 12, color: 'var(--vx-muted, #6b7280)', marginBottom: 8 } }, `共 ${data?.total ?? 0} 条`),
    h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
      h('thead', null, h('tr', null, ['ID', '漏洞类', '严重度', '状态', '摘要'].map((title) => h('th', { key: title, style: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--vx-border, #e5e7eb)' } }, title)))),
      h('tbody', null, rows.map((row: any) => h('tr', { key: row.finding_id },
        h('td', { style: { padding: '6px 8px' } }, row.finding_id),
        h('td', { style: { padding: '6px 8px' } }, row.vulnclass),
        h('td', { style: { padding: '6px 8px' } }, row.severity),
        h('td', { style: { padding: '6px 8px' } }, row.status),
        h('td', { style: { padding: '6px 8px', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, row.summary))))))
}

function VexnarConsole(): ReactNode {
  const [active, setActive] = useState('dashboard')
  const items = NAV_GROUPS.flatMap((group) => group.items)
  const current = items.find((item) => item.id === active) ?? items[0]
  return h('div', { style: { display: 'flex', height: '100%', minHeight: 0, background: 'var(--vx-bg, #fff)' } },
    h('aside', { style: { width: 240, flex: '0 0 240px', borderRight: '1px solid var(--vx-border, #e5e7eb)', overflowY: 'auto', padding: '12px 8px' } },
      NAV_GROUPS.map((group) => h('div', { key: group.title, style: { marginBottom: 14 } },
        h('div', { style: { fontSize: 12, color: 'var(--vx-muted, #6b7280)', padding: '6px 10px' } }, group.title),
        group.items.map((item) => h('button', {
          key: item.id,
          type: 'button',
          onClick: () => setActive(item.id),
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
            padding: '8px 10px', border: 0, borderRadius: 8, cursor: 'pointer', textAlign: 'left',
            background: item.id === active ? 'var(--vx-active, #eef2ff)' : 'transparent',
            color: 'var(--vx-fg, #111827)', fontSize: 14
          }
        }, h('span', null, item.label), item.badge ? h('span', { style: { minWidth: 18, height: 18, borderRadius: 9, background: '#f59e0b', color: '#fff', fontSize: 11, lineHeight: '18px', textAlign: 'center' } }, String(item.badge)) : null)))),
      h('div', { style: { fontSize: 11, color: 'var(--vx-muted, #9ca3af)', padding: '8px 10px' } }, '数据源：vexnar-core')),
    h('section', { style: { flex: 1, minWidth: 0, overflowY: 'auto', padding: 24 } },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 } },
        h('h1', { style: { fontSize: 22, margin: 0 } }, current.label),
        h('button', {
          type: 'button',
          onClick: () => {
            const url = window.prompt('vexnar-core 地址', localStorage.getItem('vexnar.coreUrl') || 'http://127.0.0.1:8790')
            if (url) localStorage.setItem('vexnar.coreUrl', url.replace(/\/$/, ''))
            const token = window.prompt('core 访问 token（VEXNAR_API_TOKEN）', localStorage.getItem('vexnar.coreToken') || '')
            if (token) localStorage.setItem('vexnar.coreToken', token)
            window.location.reload()
          },
          style: { border: '1px solid var(--vx-border, #e5e7eb)', background: 'transparent', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }
        }, '连接 core')),
      h('p', { style: { color: 'var(--vx-muted, #6b7280)', margin: '0 0 20px' } }, current.desc),
      current.id === 'dashboard' ? h(Dashboard)
        : current.id === 'tasks' ? h(TaskList)
        : current.id === 'findings' ? h(FindingList)
        : h('div', { style: { border: '1px dashed var(--vx-border, #e5e7eb)', borderRadius: 12, padding: 20, fontSize: 13, color: 'var(--vx-muted, #6b7280)' } },
            '该面板由 vexnar-core 的 /api 提供数据；当前为接入骨架，列表与详情按域逐步开放。')))
}

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
  slots.inject('main', () =>
    slots.register({ name: 'main', key: PANEL_ID }, VexnarConsole))
  slots.inject('sidebar.panellist', () =>
    slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 50, label: () => 'VEXNAR' }, ConsoleIcon))
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
