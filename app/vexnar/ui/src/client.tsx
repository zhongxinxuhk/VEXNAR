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

async function callApi(path: string, method = 'GET', body?: unknown) {
  const base = (localStorage.getItem('vexnar.coreUrl') || 'http://127.0.0.1:8790').replace(/\/$/, '')
  const token = localStorage.getItem('vexnar.coreToken') || ''
  const response = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-vexnar-token': token },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 160)}`)
  return response.json()
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

function TaskList({ onSelect }: { onSelect?: (id: string) => void }) {
  const { data, error, loading } = useApi('/api/tasks')
  if (loading) return h('div', null, '加载中…')
  if (error) return h('div', { style: { color: '#dc2626' } }, error)
  const rows = (data?.tasks ?? []).slice(0, 30)
  return h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
    h('thead', null, h('tr', null, ['ID', '名称', '状态', '目标'].map((title) => h('th', { key: title, style: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--vx-border, #e5e7eb)' } }, title)))),
    h('tbody', null, rows.map((task: any) => h('tr', { key: task.id, onClick: () => onSelect?.(String(task.id)), style: { cursor: onSelect ? 'pointer' : 'default' } },
      h('td', { style: { padding: '6px 8px' } }, task.id),
      h('td', { style: { padding: '6px 8px' } }, task.name || '—'),
      h('td', { style: { padding: '6px 8px' } }, task.status),
      h('td', { style: { padding: '6px 8px', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, task.goal)))))
}

function TaskDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const task = useApi(`/api/tasks/${id}`)
  const goals = useApi(`/api/tasks/${id}/goals`)
  const intents = useApi(`/api/exploration/intents?task=${id}&limit=20`)
  const coverage = useApi(`/api/tasks/${id}/coverage`)
  const nodes = useApi(`/api/exploration/nodes?task=${id}&size=20`)
  const [tick, setTick] = useState(0)
  const act = async (action: 'pause' | 'resume' | 'archive') => {
    try {
      if (action === 'archive') await callApi(`/api/tasks/${id}/archive`, 'POST')
      else await callApi(`/api/tasks/${id}/control`, 'POST', { action })
      setTick(tick + 1)
    } catch (error: any) { window.alert(String(error?.message ?? error)) }
  }
  const row = task.data ?? {}
  const section = (title: string, children: ReactNode) => h('div', { style: { marginBottom: 18 } },
    h('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 6 } }, title), children)
  if (task.loading) return h('div', null, '加载中…')
  if (task.error) return h('div', { style: { color: '#dc2626' } }, task.error)
  const bindings = traffic.data?.bindings ?? []
  const bodyBlock = body.title
    ? h('div', null,
        h('div', { style: { fontSize: 12, margin: '8px 0 4px', color: 'var(--vx-muted, #6b7280)' } }, body.title),
        body.error
          ? h('div', { style: { color: '#dc2626', fontSize: 12 } }, body.error)
          : h('pre', { style: { fontSize: 12, whiteSpace: 'pre-wrap', background: 'var(--vx-code, #f8fafc)', padding: 10, borderRadius: 8, maxHeight: 280, overflow: 'auto' } }, body.text))
    : null
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
    bodyBlock)
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

function ToolRunPage() {
  const [name, setName] = useState<'nmap' | 'httpx' | 'ffuf' | 'sqlmap'>('nmap')
  const [target, setTarget] = useState('')
  const [taskId, setTaskId] = useState('')
  const [findingId, setFindingId] = useState('')
  const [output, setOutput] = useState('')
  const run = async () => {
    setOutput('执行中…')
    try {
      const data = await callApi('/api/engine/tools/run', 'POST', { name, target, task_id: taskId || undefined })
      setOutput([`code=${data.code} truncated=${data.truncated}`, data.parsed ? JSON.stringify(data.parsed, null, 2) : '', data.stdout, data.stderr].filter(Boolean).join('\n'))
    } catch (error: any) { setOutput(String(error?.message ?? error)) }
  }
  return h('div', { style: { fontSize: 13 } },
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 } },
      h('select', { value: name, onChange: (event: any) => setName(event.target.value) }, ['nmap', 'httpx', 'ffuf', 'sqlmap'].map((item) => h('option', { key: item, value: item }, item))),
      h('input', { placeholder: 'target（域名 / URL / IP）', value: target, onChange: (event: any) => setTarget(event.target.value), style: { minWidth: 260 } }),
      h('input', { placeholder: 'task_id（可选，用于落库）', value: taskId, onChange: (event: any) => setTaskId(event.target.value) }),
      h('button', { type: 'button', onClick: run, style: { cursor: 'pointer' } }, '执行')),
    h('pre', { style: { fontSize: 12, whiteSpace: 'pre-wrap', background: 'var(--vx-code, #f8fafc)', padding: 10, borderRadius: 8, minHeight: 120, maxHeight: 420, overflow: 'auto' } }, output))
}

function TrafficPage() {
  const { data, error, loading } = useApi('/api/traffic?page=1&size=50')
  if (loading) return h('div', null, '加载中…')
  if (error) return h('div', { style: { color: '#dc2626', fontSize: 12 } }, `${error}（需要以 VEXNAR_GO_FALLBACK 启动 core 才能代理 Go 流量接口）`)
  const rows = data?.items ?? data?.exchanges ?? []
  return h('div', { style: { fontSize: 13 } },
    h('div', { style: { color: 'var(--vx-muted, #6b7280)', marginBottom: 8 } }, `共 ${data?.count ?? data?.total ?? rows.length} 条抓包`),
    h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
      h('thead', null, h('tr', null, ['时间', '方法', 'URL', '状态', '来源'].map((t) => h('th', { key: t, style: { textAlign: 'left', padding: '6px 8px' } }, t)))),
      h('tbody', null, rows.slice(0, 50).map((row: any, index: number) => h('tr', { key: row.id ?? index },
        h('td', { style: { padding: '6px 8px' } }, String(row.ts ?? row.time ?? '')),
        h('td', { style: { padding: '6px 8px' } }, row.method ?? ''),
        h('td', { style: { padding: '6px 8px', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, row.url ?? row.host ?? ''),
        h('td', { style: { padding: '6px 8px' } }, String(row.status ?? row.status_code ?? '')),
        h('td', { style: { padding: '6px 8px' } }, row.source ?? row.client ?? ''))))))
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
  if (error) return h('div', { style: { color: '#dc2626', fontSize: 12 } }, `${error}（需要 VEXNAR_GO_FALLBACK 代理 Go 拦截接口）`)
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

function AssetSyncSettings() {
  return h(PanelShell, { title: '资产同步', desc: '外部资产源同步' },
    h('div', { style: { border: '1px dashed var(--vx-border, #e5e7eb)', borderRadius: 12, padding: 20, fontSize: 13, color: 'var(--vx-muted, #6b7280)' } },
      '资产同步后端尚未迁移（Go 侧无独立 REST 契约）。接入时复用资产的 journal 写路径，并在此提供同步源配置与最近一次结果。'))
}

function LogsPanel() {
  const tasks = useApi('/api/tasks')
  const [taskId, setTaskId] = useState('')
  const [session, setSession] = useState('plan')
  const [rows, setRows] = useState<any[]>([])
  const [error, setError] = useState('')
  const load = async (id: string, sess: string) => {
    setError('')
    try {
      const data = await callApi(`/api/exploration/activity/history?task=${id}&session=${sess}&limit=100`)
      setRows(data.items ?? [])
    } catch (e: any) { setError(String(e?.message ?? e)); setRows([]) }
  }
  useEffect(() => {
    if (!taskId && tasks.data?.tasks?.[0]) { const id = String(tasks.data.tasks[0].id); setTaskId(id); void load(id, session) }
  }, [tasks.data])
  return h(PanelShell, { title: '日志', desc: '任务活动流（planner / main / intent）' },
    h('div', { style: { display: 'flex', gap: 8, marginBottom: 10 } },
      h('select', { value: taskId, onChange: (event: any) => { setTaskId(event.target.value); void load(event.target.value, session) } },
        (tasks.data?.tasks ?? []).slice(0, 50).map((task: any) => h('option', { key: task.id, value: task.id }, `${task.id} · ${task.name || '未命名'}`))),
      h('select', { value: session, onChange: (event: any) => { setSession(event.target.value); if (taskId) void load(taskId, event.target.value) } },
        ['plan', 'main'].map((item) => h('option', { key: item, value: item }, item))),
      h('button', { type: 'button', onClick: () => taskId && load(taskId, session), style: { cursor: 'pointer' } }, '刷新')),
    error ? h('div', { style: { color: '#dc2626', fontSize: 12 } }, error) : null,
    h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
      h('thead', null, h('tr', null, ['seq', 'ts', 'worker', 'kind', 'summary'].map((t) => h('th', { key: t, style: { textAlign: 'left', padding: '4px 6px' } }, t)))),
      h('tbody', null, rows.slice().reverse().map((row: any) => h('tr', { key: row.seq },
        h('td', { style: { padding: '4px 6px' } }, row.seq),
        h('td', { style: { padding: '4px 6px' } }, row.ts),
        h('td', { style: { padding: '4px 6px' } }, row.worker ?? ''),
        h('td', { style: { padding: '4px 6px' } }, row.kind ?? ''),
        h('td', { style: { padding: '4px 6px', maxWidth: 460, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, row.summary ?? ''))))))
}

function PanelShell({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  const connect = () => {
    const url = window.prompt('vexnar-core 地址', localStorage.getItem('vexnar.coreUrl') || 'http://127.0.0.1:8790')
    if (url) localStorage.setItem('vexnar.coreUrl', url.replace(/\/$/, ''))
    const token = window.prompt('core 访问 token（VEXNAR_API_TOKEN）', localStorage.getItem('vexnar.coreToken') || '')
    if (token) localStorage.setItem('vexnar.coreToken', token)
    window.location.reload()
  }
  return h('div', { style: { height: '100%', overflowY: 'auto', padding: 24 } },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 } },
      h('h1', { style: { fontSize: 22, margin: 0 } }, title),
      h('button', { type: 'button', onClick: connect, style: { border: '1px solid var(--vx-border, #e5e7eb)', background: 'transparent', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12 } }, '连接 core')),
    desc ? h('p', { style: { color: 'var(--vx-muted, #6b7280)', margin: '0 0 18px' } }, desc) : h('div', { style: { height: 12 } }),
    children)
}

function FindingList({ onSelect }: { onSelect?: (id: string) => void }) {
  const { data, error, loading } = useApi('/api/exploration/findings?page=1&limit=30')
  if (loading) return h('div', null, '加载中…')
  if (error) return h('div', { style: { color: '#dc2626' } }, error)
  const rows = data?.items ?? []
  return h('div', null,
    h('div', { style: { fontSize: 12, color: 'var(--vx-muted, #6b7280)', marginBottom: 8 } }, `共 ${data?.total ?? 0} 条`),
    h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
      h('thead', null, h('tr', null, ['ID', '漏洞类', '严重度', '状态', '摘要'].map((title) => h('th', { key: title, style: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--vx-border, #e5e7eb)' } }, title)))),
      h('tbody', null, rows.map((row: any) => h('tr', { key: row.finding_id, onClick: () => onSelect?.(String(row.finding_id)), style: { cursor: onSelect ? 'pointer' : 'default' } },
        h('td', { style: { padding: '6px 8px' } }, row.finding_id),
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

function TasksPanel() {
  const [taskId, setTaskId] = useState('')
  return h(PanelShell, { title: '任务', desc: '任务列表、目标、意图与覆盖度' },
    taskId ? h(TaskDetail, { id: taskId, onBack: () => setTaskId('') }) : h('div', null, h(Dashboard), h(TaskList, { onSelect: setTaskId })))
}

function FindingsPanel() {
  const [findingId, setFindingId] = useState('')
  return h(PanelShell, { title: '发现', desc: '漏洞列表、证据与流量绑定' },
    findingId ? h(FindingDetail, { id: findingId, onBack: () => setFindingId('') }) : h(FindingList, { onSelect: setFindingId }))
}

function AssetsPanel() {
  const { data, error, loading } = useApi('/api/assets?limit=50')
  return h(PanelShell, { title: '资产', desc: '域名 / IP / 服务 / 端点' },
    loading ? h('div', null, '加载中…')
      : error ? h('div', { style: { color: '#dc2626' } }, error)
        : h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
            h('thead', null, h('tr', null, ['ID', '类型', '域名/IP', '端口', '最后发现'].map((t) => h('th', { key: t, style: { textAlign: 'left', padding: '6px 8px' } }, t)))),
            h('tbody', null, (data?.assets ?? []).map((row: any) => h('tr', { key: row.id },
              h('td', { style: { padding: '6px 8px' } }, row.id),
              h('td', { style: { padding: '6px 8px' } }, row.type),
              h('td', { style: { padding: '6px 8px' } }, row.domain || row.ip || row.url || ''),
              h('td', { style: { padding: '6px 8px' } }, row.port ?? ''),
              h('td', { style: { padding: '6px 8px' } }, row.last_seen ?? ''))))))
}

function TrafficPanel() {
  return h(PanelShell, { title: '流量', desc: '抓包列表（经 core 代理 Go 流量接口）' }, h(TrafficPage))
}

function ToolRunPanel() {
  return h(PanelShell, { title: '工具执行', desc: 'nmap / httpx / ffuf / sqlmap' }, h(ToolRunPage))
}

function AgentSettings() {
  return h(PanelShell, { title: 'Agent 管理', desc: '名称、描述与触发配置' }, h(AgentsPage))
}

function McpSettings() {
  return h(PanelShell, { title: 'MCP', desc: 'MCP server 启停与删除' }, h(McpPage))
}

function ToolSettings() {
  return h(PanelShell, { title: '工具', desc: '内置与自定义工具' }, h(ToolsPage))
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

const PANELS = [
  { id: 'vexnar-tasks', label: '任务', order: 100, component: TasksPanel },
  { id: 'vexnar-findings', label: '发现', order: 101, component: FindingsPanel },
  { id: 'vexnar-traffic', label: '流量', order: 102, component: TrafficPanel },
  { id: 'vexnar-assets', label: '资产', order: 103, component: AssetsPanel },
  { id: 'vexnar-tool-run', label: '工具执行', order: 104, component: ToolRunPanel },
  { id: 'vexnar-logs', label: '日志', order: 105, component: LogsPanel }
]

const SETTINGS = [
  { id: 'vexnar-agents', label: 'Agent 管理', order: 40, component: AgentSettings },
  { id: 'vexnar-mcp', label: 'MCP', order: 41, component: McpSettings },
  { id: 'vexnar-tools', label: '工具', order: 42, component: ToolSettings },
  { id: 'vexnar-notify', label: '通知推送', order: 43, component: NotifySettings },
  { id: 'vexnar-intercept', label: '拦截规则', order: 44, component: InterceptSettings },
  { id: 'vexnar-asset-sync', label: '资产同步', order: 45, component: AssetSyncSettings },
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
    slots.inject('sidebar.panellist', () => slots.register({ name: 'sidebar.panellist', id: panel.id, order: panel.order, label: () => panel.label }, ConsoleIcon))
  }
  for (const section of SETTINGS) {
    slots.inject('settings.section', () => slots.register({ name: 'settings.section', id: section.id, label: section.label, order: section.order }, section.component))
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
