// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// 探索域路由模块（Go server/findings_groups.go · finding_retests.go · goals.go ·
// intent_intervention.go · conv_live.go 的 TS 迁移）。
//
// 持久层：SQLite kv store（不连 PostgreSQL，不新开端口）。图 / 血缘 / 复测 / 导出
// 语义对齐 Go：
//   · graph            = 本任务全部 nodes(2000) + edges(5000)，id 升序
//   · frontier         = kind=intent & state=open，priority DESC, id ASC
//   · lineage          = finding 节点 + 沿 edges 反向可达的全部祖先 + 祖先集内的边
//   · groups           = findings LEFT JOIN tasks 按任务分桶（未归属/任务已删共一桶）
//   · asset-tree       = 有发现的资产 + 补齐的祖先链 + 企业层，子树按 finding 去重计数
//   · retests          = 一个 finding 同时只有一条 pending/running 会话，重复点击复用
//   · activity/stream  = SSE，先补 backlog 再追增量，事件 id 单调递增
//
// 注册顺序要求：Hono 按注册顺序匹配，`/api/exploration/findings/groups`、`export`、
// `asset-tree` 与 `/api/exploration/findings/:id` 同深度，本模块必须在定义
// `/api/exploration/findings/:id` 的代码之前 register()（模块内部已先注册静态路由）。
// ─────────────────────────────────────────────────────────────────────────────

import { crc32, deflateRawSync } from 'node:zlib'
import type { Hono } from 'hono'
import { activityDto } from './read-views.ts'
export { activityDto } from './read-views.ts'
import { meta, operations, parseJson, store } from '../context.ts'

// ── 常量（对齐 Go 侧上限）────────────────────────────────────────────────────
const MAX_FOLLOW_UP_RUNES = 4000
const MAX_RETEST_NOTES_RUNES = 4000
const FINDING_RETEST_AGENT_KEY = 'retester'
const FINDING_RETEST_TOOLS = ['get_finding_retest_context', 'record_finding_retest_result']
const RETEST_ACTIVE_STATUSES = ['pending', 'running']
const GRAPH_NODE_LIMIT = 2000
const GRAPH_EDGE_LIMIT = 5000
const ASSET_TREE_MAX_NODES = 3000
const UNASSIGNED_ASSET = '__none__'
const STREAM_POLL_MS = 800
const STREAM_PING_MS = 15_000
const EXPORT_SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

const FINDINGS = 'findings'
const NODES = 'nodes'
const EDGES = 'edges'
const ACTIVITY = 'activity'
const TASKS = 'tasks'
const ASSETS = 'assets'
const ANCHORS = 'anchors'
const MAIN_SESSIONS = 'main_sessions'
const FINDING_RETESTS = 'finding_retests'
const CONVERSATIONS = 'conversations'
const CONVERSATION_ACTIVITIES = 'conversation_activities'

// ── 通用工具 ─────────────────────────────────────────────────────────────────
/** 错误约定：StoreConflict→409，其余按 e.status → 400（与 routes.ts / conversations.ts 一致）。 */
function err(c: any, e: any) {
  return c.json({ error: String(e?.message ?? e) }, e?.name === 'StoreConflict' ? 409 : e?.status ?? 400)
}

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

function rfc3339(date: Date) {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = (value: number) => String(Math.floor(Math.abs(value))).padStart(2, '0')
  return `${date.toISOString().slice(0, 23)}${sign}${pad(offset / 60)}:${pad(offset % 60)}`.replace('Z', '')
}

function stamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function runeCount(value: string) {
  return [...value].length
}

/** Go 侧 findingPaginationParam：<=0 回落默认值，超过上界就截断。 */
function paginationParam(raw: string | undefined, fallback: number, upperBound: number) {
  let value = Math.floor(Number(raw ?? fallback))
  if (!Number.isFinite(value) || value <= 0) value = fallback
  if (upperBound > 0 && value > upperBound) value = upperBound
  return value
}

/** 前端的 "all" 哨兵与空值都表示「不筛」。 */
function normFilter(value: string | undefined) {
  const text = String(value ?? '').trim()
  return text === 'all' ? '' : text
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function payloadOf(row: any): any {
  const payload = parseJson(row?.payload)
  return payload && typeof payload === 'object' ? payload : {}
}

function sliceRunes(text: string, max: number) {
  const chars = [...text]
  return chars.length > max ? chars.slice(0, max).join('') : text
}

// ── 任务解析（Go m.ResolveTask：只认在册、未删除的任务）──────────────────────
async function resolveTask(raw: string | undefined) {
  const key = String(raw ?? '').trim()
  if (!key) return null
  const tasks = await operations.writer.list(TASKS)
  const live = tasks.filter((row) => !row.deleted_at_text && !row.archived_at_text)
  const byId = live.find((row) => String(row.id) === key)
  if (byId) return byId
  return live.find((row) => String(row.name ?? '') === key) ?? null
}

// ── DTO（对齐 dto.go TaskNodeDTO / EdgeDTO / ActivityDTO / FindingGroup）─────
function nodeDto(row: any) {
  return {
    id: String(row.id),
    type: String(row.kind),
    payload: JSON.stringify(parseJson(row.payload) ?? {}),
    priority: Number(row.priority ?? 0),
    state: String(row.state ?? ''),
    origin: String(row.origin ?? ''),
    ts: String(row.created_at ?? '')
  }
}

function edgeDto(row: any) {
  return { src: String(row.src), dst: String(row.dst), rel: String(row.rel) }
}

/** 边的稳定顺序：src / dst 数值升序，再按关系名，便于逐条比对。 */
function compareEdges(a: any, b: any) {
  const numeric = (value: unknown) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER
  }
  return (
    numeric(a.src) - numeric(b.src) ||
    numeric(a.dst) - numeric(b.dst) ||
    String(a.rel ?? '').localeCompare(String(b.rel ?? ''))
  )
}

/** 与 routes.ts 的 findingDto 保持同一份字段集（导出 JSON 也用它）。 */
function findingDto(row: any) {
  return {
    traffic_count: 0,
    evidence_version: Number(row.evidence_version ?? 0),
    report_evidence_version: Number(row.report_evidence_version ?? 0),
    report_stale: Boolean(row.report) && Number(row.evidence_version ?? 0) !== Number(row.report_evidence_version ?? 0),
    id: String(row.id),
    finding_id: String(row.id),
    vulnclass: row.vulnclass,
    ...(row.name ? { name: row.name } : {}),
    severity: row.severity,
    status: row.status,
    summary: row.summary,
    evidence: row.evidence,
    ...(row.task_id == null ? {} : { task_id: String(row.task_id) }),
    ts: row.created_at_text
  }
}

// ── findings 筛选（findingFilterFromQuery 的同构实现）────────────────────────
interface FindingFilter {
  severity: string
  status: string
  vulnclass: string
  taskId: string
  query: string
  sort: string
  assetScope: string
}

function filterFromQuery(q: (name: string) => string | undefined): FindingFilter {
  return {
    severity: normFilter(q('severity')).toLowerCase(),
    status: normFilter(q('status')).toLowerCase(),
    vulnclass: normFilter(q('vulnclass')),
    taskId: normFilter(q('task_id')),
    query: String(q('q') ?? '').trim(),
    sort: String(q('sort') ?? '').trim(),
    assetScope: String(q('asset_scope') ?? '').trim()
  }
}

async function loadFindings() {
  const rows = await operations.writer.list(FINDINGS)
  return [...rows].sort((a, b) => String(b.created_at_text ?? '').localeCompare(String(a.created_at_text ?? '')) || Number(b.id) - Number(a.id))
}

function matchesFilter(row: any, f: FindingFilter) {
  if (f.severity && String(row.severity ?? '').toLowerCase() !== f.severity) return false
  if (f.status && String(row.status ?? '').toLowerCase() !== f.status) return false
  if (f.vulnclass && String(row.vulnclass ?? '') !== f.vulnclass) return false
  if (f.taskId && String(row.task_id ?? '') !== f.taskId) return false
  if (f.query) {
    const needle = f.query.toLowerCase()
    const haystack = [row.name, row.vulnclass, row.summary, row.evidence, row.report]
    if (!haystack.some((value) => String(value ?? '').toLowerCase().includes(needle))) return false
  }
  return true
}

/**
 * asset_scope 选中一个节点等于选中它整棵子树（applyAssetScope 语义）：
 * 未关联资产桶 = 没有任何可解析资产的发现；选中节点已不在当前筛选里 → 结果为空。
 */
function scopeFiltered(rows: any[], f: FindingFilter, tree: FindingAssetTree) {
  if (!f.assetScope) return rows
  const known = new Set<number>()
  for (const node of tree.nodes) if (node.asset_id) known.add(Number(node.asset_id))
  const assetIDsOf = (row: any) => asArray<number>(row.asset_ids).map(Number).filter((id) => id > 0)
  if (f.assetScope === UNASSIGNED_ASSET) {
    return rows.filter((row) => !assetIDsOf(row).some((id) => known.has(id)))
  }
  if (!tree.byKey.has(f.assetScope)) return []
  const children = new Map<string, FindingAssetNode[]>()
  for (const node of tree.nodes) {
    const list = children.get(node.parent ?? '') ?? []
    list.push(node)
    children.set(node.parent ?? '', list)
  }
  const seen = new Set<string>([f.assetScope])
  const ids = new Set<number>()
  const queue = [f.assetScope]
  while (queue.length) {
    const key = queue.shift()!
    const node = tree.byKey.get(key)
    if (node?.asset_id) ids.add(Number(node.asset_id))
    for (const child of children.get(key) ?? []) {
      if (seen.has(child.key)) continue
      seen.add(child.key)
      queue.push(child.key)
    }
  }
  if (!ids.size) return []
  return rows.filter((row) => assetIDsOf(row).some((id) => ids.has(id)))
}

// ── 资产树（db/finding_assets.go 的移植）─────────────────────────────────────
interface FindingAssetNode {
  key: string
  parent?: string
  kind: string
  label: string
  asset_id?: number
  company_id?: number
  self: number
  total: number
  critical: number
  high: number
  medium: number
  low: number
  last_found_at: string
}

interface FindingAssetTree {
  nodes: FindingAssetNode[]
  byKey: Map<string, FindingAssetNode>
  finding_total: number
  truncated: boolean
  dropped_kinds: string[]
}

const assetKey = (id: number) => `a:${id}`
const companyKey = (id: number) => `c:${id}`

function urlHostPort(raw: string): { host: string; port: number } {
  if (!raw) return { host: '', port: 0 }
  try {
    const url = new URL(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `http://${raw}`)
    return { host: url.hostname, port: Number(url.port || 0) }
  } catch {
    return { host: '', port: 0 }
  }
}

/** hostPortOf：domain → URL 里的 host → ip。 */
function hostPortOf(row: any): { host: string; port: number } {
  let host = String(row.domain ?? '')
  let port = Number(row.port ?? 0)
  if (!host && row.url) {
    const parsed = urlHostPort(String(row.url))
    host = parsed.host
    if (!port) port = parsed.port
  }
  if (!host) host = String(row.ip ?? '')
  return { host, port }
}

function assetLabel(row: any) {
  const kind = String(row.type ?? '')
  const url = String(row.url ?? '')
  const domain = String(row.domain ?? '')
  const ip = String(row.ip ?? '')
  const appName = String(row.app_name ?? '')
  const rootDomain = String(row.root_domain ?? '')
  if (kind === 'service' && !url) {
    const { host, port } = hostPortOf(row)
    if (host && port > 0) return `${host}:${port}`
  }
  if ((kind === 'endpoint' || kind === 'service') && url) return url
  if (kind === 'app' && appName) return appName
  for (const value of [url, domain, ip, appName, rootDomain]) if (value) return value
  return assetKey(Number(row.id))
}

function isIPLiteral(host: string) {
  if (!host) return false
  if (host.includes(':')) return true
  const parts = host.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => part !== '' && /^\d+$/.test(part))
}

function countFinding(node: FindingAssetNode | undefined, hit: { severity: string; ts: string }) {
  if (!node) return
  node.total += 1
  if (hit.severity === 'critical') node.critical += 1
  else if (hit.severity === 'high') node.high += 1
  else if (hit.severity === 'medium') node.medium += 1
  else if (hit.severity === 'low') node.low += 1
  if (!node.last_found_at || hit.ts > node.last_found_at) node.last_found_at = hit.ts
}

async function buildFindingAssetTree(rows: any[], maxNodes = ASSET_TREE_MAX_NODES): Promise<FindingAssetTree> {
  const hits = rows.map((row) => ({
    severity: String(row.severity ?? ''),
    ts: String(row.created_at_text ?? ''),
    assetIDs: asArray<number>(row.asset_ids).map(Number).filter((id) => id > 0)
  }))
  const wanted = new Set<number>()
  for (const hit of hits) for (const id of hit.assetIDs) wanted.add(id)

  const assets = await operations.writer.list(ASSETS)
  const all = new Map<number, any>(assets.map((row) => [Number(row.id), row]))
  const byID = new Map<number, any>()
  for (const id of wanted) {
    const row = all.get(id)
    if (row) byID.set(id, row)
  }

  // 全局索引：同一资产集合的父子规则与覆盖图一致。
  const rootByDomain = new Map<string, number>()
  const subByDomain = new Map<string, number>()
  const ipByAddr = new Map<string, number>()
  const svcByHost = new Map<string, number>()
  const svcByHostPort = new Map<string, number>()
  for (const row of assets) {
    const id = Number(row.id)
    const kind = String(row.type ?? '')
    const domain = String(row.domain ?? '')
    const ip = String(row.ip ?? '')
    if (kind === 'root_domain' && domain) rootByDomain.set(domain, id)
    else if (kind === 'subdomain' && domain) subByDomain.set(domain, id)
    else if (kind === 'ip' && ip) ipByAddr.set(ip, id)
    else if (kind === 'service') {
      const { host, port } = hostPortOf(row)
      if (host) {
        if (!svcByHost.has(host)) svcByHost.set(host, id)
        svcByHostPort.set(`${host}|${port}`, id)
      }
    }
  }

  const parentKeyCache = new Map<number, string>()
  const parentKeyOf = (row: any): string => {
    const id = Number(row.id)
    const cached = parentKeyCache.get(id)
    if (cached !== undefined) return cached
    const kind = String(row.type ?? '')
    const domain = String(row.domain ?? '')
    const ip = String(row.ip ?? '')
    const rootDomain = String(row.root_domain ?? '')
    const { host, port } = hostPortOf(row)
    const pick = (...ids: Array<number | undefined>) => {
      for (const candidate of ids) if (candidate && candidate !== id) return assetKey(candidate)
      return ''
    }
    let parent = ''
    if (kind === 'subdomain') {
      parent = pick(rootByDomain.get(rootDomain))
    } else if (kind === 'service') {
      parent = pick(
        subByDomain.get(domain), subByDomain.get(host),
        ipByAddr.get(ip), ipByAddr.get(host),
        rootByDomain.get(rootDomain), rootByDomain.get(host)
      )
    } else if (kind === 'endpoint') {
      parent = pick(
        svcByHostPort.get(`${host}|${port}`), svcByHost.get(host),
        subByDomain.get(host), subByDomain.get(domain),
        ipByAddr.get(host), ipByAddr.get(ip),
        rootByDomain.get(rootDomain), rootByDomain.get(host)
      )
    }
    parentKeyCache.set(id, parent)
    return parent
  }

  // 补齐祖先链：祖先自身可能没有任何发现，但树需要它才能成形。
  for (let round = 0; round < 4; round++) {
    let added = 0
    for (const row of [...byID.values()]) {
      const parentKey = parentKeyOf(row)
      if (!parentKey.startsWith('a:')) continue
      const parentId = Number(parentKey.slice(2))
      if (byID.has(parentId)) continue
      const parentRow = all.get(parentId)
      if (!parentRow) continue
      byID.set(parentId, parentRow)
      added += 1
    }
    if (!added) break
  }

  const nodes = new Map<string, FindingAssetNode>()
  for (const row of byID.values()) {
    const key = assetKey(Number(row.id))
    const node: FindingAssetNode = {
      key,
      kind: String(row.type ?? ''),
      label: assetLabel(row),
      asset_id: Number(row.id),
      self: 0,
      total: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      last_found_at: ''
    }
    const companyId = Number(row.company_id ?? 0)
    if (companyId > 0) node.company_id = companyId
    nodes.set(key, node)
  }

  const parentOf = new Map<string, string>()
  for (const row of byID.values()) {
    const key = assetKey(Number(row.id))
    const parentKey = parentKeyOf(row)
    if (!parentKey || parentKey === key || !nodes.has(parentKey)) continue
    parentOf.set(key, parentKey)
    nodes.get(key)!.parent = parentKey
  }

  // 企业层：只有资产确实归属企业、且自己就是顶层时才挂上去。
  const topLevel = [...nodes.values()].filter(
    (node) => !node.parent && node.company_id && ['root_domain', 'ip', 'app'].includes(node.kind)
  )
  if (topLevel.length) {
    const companies = await store.companies.list()
    const names = new Map<number, string>(companies.map((row: any) => [Number(row.id), String(row.name ?? '')]))
    for (const node of topLevel) {
      const companyId = Number(node.company_id)
      const key = companyKey(companyId)
      if (!nodes.has(key)) {
        nodes.set(key, {
          key,
          kind: 'company',
          label: names.get(companyId) || `企业 #${companyId}`,
          company_id: companyId,
          self: 0,
          total: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          last_found_at: ''
        })
      }
      node.parent = key
      parentOf.set(node.key, key)
    }
  }

  const unassigned: FindingAssetNode = {
    key: UNASSIGNED_ASSET, kind: 'none', label: '未关联资产',
    self: 0, total: 0, critical: 0, high: 0, medium: 0, low: 0, last_found_at: ''
  }

  for (const hit of hits) {
    const direct: FindingAssetNode[] = []
    const touched = new Set<string>()
    for (const id of hit.assetIDs) {
      const node = nodes.get(assetKey(id))
      if (!node) continue
      direct.push(node)
      for (let key: string | undefined = node.key; key; key = parentOf.get(key)) touched.add(key)
    }
    if (!direct.length) {
      countFinding(unassigned, hit)
      unassigned.self += 1
      continue
    }
    for (const node of direct) node.self += 1
    for (const key of touched) countFinding(nodes.get(key), hit)
  }

  const out = [...nodes.values()].filter((node) => node.total > 0)
  if (unassigned.total > 0) out.push(unassigned)
  out.sort((a, b) => {
    if ((a.kind === 'none') !== (b.kind === 'none')) return b.kind === 'none' ? -1 : 1
    if (a.total !== b.total) return b.total - a.total
    return a.label.localeCompare(b.label)
  })

  const tree: FindingAssetTree = {
    nodes: out,
    byKey: new Map(),
    finding_total: hits.length,
    truncated: false,
    dropped_kinds: []
  }
  for (const node of tree.nodes) tree.byKey.set(node.key, node)
  if (maxNodes > 0 && tree.nodes.length > maxNodes) {
    for (const kind of ['endpoint', 'service']) {
      tree.nodes = tree.nodes.filter((node) => node.kind !== kind)
      tree.truncated = true
      tree.dropped_kinds.push(kind)
      if (tree.nodes.length <= maxNodes) break
    }
  }
  return tree
}

// ── findings 导出（report/findings.go 的移植）────────────────────────────────
function exportOrder(rows: any[]) {
  return [...rows].sort((a, b) => {
    const ra = EXPORT_SEVERITY_RANK[String(a.severity ?? '')] ?? 4
    const rb = EXPORT_SEVERITY_RANK[String(b.severity ?? '')] ?? 4
    if (ra !== rb) return ra - rb
    return String(b.created_at_text ?? '').localeCompare(String(a.created_at_text ?? ''))
  })
}

function findingTitle(row: any) {
  return String(row.name ?? '').trim() || String(row.vulnclass ?? '').trim() || '未分类'
}

function findingsMarkdown(rows: any[], taskNames: Map<string, string>, generatedAt: Date) {
  const items = exportOrder(rows)
  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const row of items) if (counts[String(row.severity ?? '')] != null) counts[String(row.severity)] += 1
  const pad = (value: number) => String(value).padStart(2, '0')
  const at = `${generatedAt.getFullYear()}-${pad(generatedAt.getMonth() + 1)}-${pad(generatedAt.getDate())} ${pad(generatedAt.getHours())}:${pad(generatedAt.getMinutes())}:${pad(generatedAt.getSeconds())}`
  const lines: string[] = ['# 漏洞发现汇总报告', '', `- **生成时间**：${at}`, `- **发现总数**：${items.length} 个`, '', '## 摘要', '', '| 严重等级 | 数量 |', '| --- | --- |']
  for (const [key, label] of [['critical', '严重'], ['high', '高危'], ['medium', '中危'], ['low', '低危']] as const) {
    lines.push(`| ${label} | ${counts[key]} |`)
  }
  lines.push('')
  if (!items.length) {
    lines.push('_无匹配的漏洞。_', '')
    return lines.join('\n')
  }
  lines.push('## 漏洞明细', '')
  items.forEach((row, index) => {
    lines.push(`### ${index + 1}. [${String(row.severity || 'info').toUpperCase()}] ${findingTitle(row)}`, '')
    if (row.vulnclass) lines.push(`- **类别**：${row.vulnclass}`)
    lines.push(`- **状态**：${String(row.status || 'pending')}`)
    const description = taskNames.get(String(row.task_id ?? '')) ?? ''
    if (description.trim()) lines.push(`- **所属任务**：${description}`)
    lines.push(`- **发现时间**：${String(row.created_at_text ?? '')}`, '')
    if (String(row.summary ?? '').trim()) lines.push(`${String(row.summary).trim()}`, '')
    if (String(row.evidence ?? '').trim()) lines.push('**证据：**', '', '```', String(row.evidence).trim(), '```', '')
    if (String(row.report ?? '').trim()) lines.push('**详细报告：**', '', String(row.report).trim(), '')
    lines.push('---', '')
  })
  return lines.join('\n')
}

function singleFindingMarkdown(row: any, taskNames: Map<string, string>, generatedAt: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  const at = `${generatedAt.getFullYear()}-${pad(generatedAt.getMonth() + 1)}-${pad(generatedAt.getDate())} ${pad(generatedAt.getHours())}:${pad(generatedAt.getMinutes())}:${pad(generatedAt.getSeconds())}`
  const lines = [`# [${String(row.severity || 'info').toUpperCase()}] ${findingTitle(row)}`, '']
  if (row.vulnclass) lines.push(`- **类别**：${row.vulnclass}`)
  lines.push(`- **严重等级**：${String(row.severity || 'info')}`)
  lines.push(`- **状态**：${String(row.status || 'pending')}`)
  const description = taskNames.get(String(row.task_id ?? '')) ?? ''
  if (description.trim()) lines.push(`- **所属任务**：${description}`)
  lines.push(`- **发现时间**：${String(row.created_at_text ?? '')}`)
  lines.push(`- **生成时间**：${at}`, '')
  if (String(row.summary ?? '').trim()) lines.push('## 概述', '', String(row.summary).trim(), '')
  if (String(row.evidence ?? '').trim()) lines.push('## 证据', '', '```', String(row.evidence).trim(), '```', '')
  if (String(row.report ?? '').trim()) lines.push('## 详细报告', '', String(row.report).trim(), '')
  return lines.join('\n')
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function findingsCsv(rows: any[], taskNames: Map<string, string>) {
  const items = exportOrder(rows)
  const lines = ['ID,名称,类别,严重等级,状态,所属任务,发现时间,概述,流量证据数量,流量证据ID']
  for (const row of items) {
    lines.push([
      row.id,
      findingTitle(row),
      row.vulnclass,
      row.severity || 'info',
      row.status || 'pending',
      taskNames.get(String(row.task_id ?? '')) ?? '',
      row.created_at_text,
      String(row.summary ?? '').trim(),
      0,
      ''
    ].map(csvCell).join(','))
  }
  return `\ufeff${lines.join('\r\n')}\r\n`
}

function buildZip(entries: Array<{ name: string; data: Buffer }>) {
  const chunks: Buffer[] = []
  const central: Array<{ name: string; crc: number; size: number; compressed: Buffer; offset: number }> = []
  let offset = 0
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const crc = crc32(entry.data) >>> 0
    const compressed = deflateRawSync(entry.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0x21, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    chunks.push(local, nameBuf, compressed)
    central.push({ name: entry.name, crc, size: entry.data.length, compressed, offset })
    offset += 30 + nameBuf.length + compressed.length
  }
  const centralStart = offset
  for (const item of central) {
    const nameBuf = Buffer.from(item.name, 'utf8')
    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(0x0800, 8)
    header.writeUInt16LE(8, 10)
    header.writeUInt16LE(0, 12)
    header.writeUInt16LE(0x21, 14)
    header.writeUInt32LE(item.crc, 16)
    header.writeUInt32LE(item.compressed.length, 20)
    header.writeUInt32LE(item.size, 24)
    header.writeUInt16LE(nameBuf.length, 28)
    header.writeUInt16LE(0, 30)
    header.writeUInt16LE(0, 32)
    header.writeUInt16LE(0, 34)
    header.writeUInt16LE(0, 36)
    header.writeUInt32LE(0, 38)
    header.writeUInt32LE(item.offset, 42)
    chunks.push(header, nameBuf)
    offset += 46 + nameBuf.length
  }
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(central.length, 8)
  end.writeUInt16LE(central.length, 10)
  end.writeUInt32LE(offset - centralStart, 12)
  end.writeUInt32LE(centralStart, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...chunks, end])
}

async function taskNameMap() {
  const tasks = await operations.writer.list(TASKS)
  return new Map<string, string>(tasks.map((row) => [String(row.id), String(row.description || row.name || '')]))
}

// ── 主会话（db/exploration.go ListMainSessions / NewMainSession）────────────
async function listMainSessions(explorationId: number) {
  const rows = (await operations.writer.list(MAIN_SESSIONS))
    .filter((row) => Number(row.exploration_id) === explorationId)
    .sort((a, b) => Number(b.seq) - Number(a.seq))
  const sessions = rows.map((row) => ({ seq: Number(row.seq), created_at: String(row.created_at ?? '') }))
  // 隐式原始会话（seq=0）恒定存在，Go 用零值 time 表示。
  sessions.push({ seq: 0, created_at: '0001-01-01T00:00:00Z' })
  return sessions
}

async function createMainSession(explorationId: number) {
  const rows = (await operations.writer.list(MAIN_SESSIONS)).filter((row) => Number(row.exploration_id) === explorationId)
  const seq = rows.reduce((max, row) => Math.max(max, Number(row.seq ?? 0)), 0) + 1
  const id = (await operations.writer.maxKey(MAIN_SESSIONS)) + 1
  const record = { id: String(id), exploration_id: explorationId, seq, created_at: rfc3339(new Date()) }
  const [written] = await operations.writer.commit([{ table: MAIN_SESSIONS, key: String(id), record }])
  return written
}

// ── 复测（db/finding_retests.go）────────────────────────────────────────────
function retestDto(row: any) {
  return {
    id: Number(row.id),
    finding_id: Number(row.finding_id),
    conversation_id: row.conversation_id == null ? null : Number(row.conversation_id),
    status: String(row.status ?? ''),
    verdict: String(row.verdict ?? ''),
    notes: String(row.notes ?? ''),
    purpose: String(row.purpose ?? 'retest'),
    summary: String(row.summary ?? ''),
    evidence: String(row.evidence ?? ''),
    error: String(row.error ?? ''),
    created_at: String(row.created_at ?? ''),
    started_at: row.started_at ?? null,
    finished_at: row.finished_at ?? null
  }
}

async function retestAgentReady() {
  const agents = await meta.table<any[]>('agents')
  const agent = agents.find((row) => row.key === FINDING_RETEST_AGENT_KEY)
  if (!agent || !agent.enabled) {
    // 名册在 dsh：设置 → Agent 预设 里有 vexnar-retester 角色。引擎侧的 retester 行
    // 由引擎自己维护（启用 + 工具绑定），不再有 VEXNAR 的 Agent 管理页可跳。
    throw httpError(409, '漏洞复测 Agent 不存在或未启用：请确认 dsh 设置 → Agent 预设 中的 retester 角色，以及引擎侧该 agent 已启用')
  }
  const tools = await meta.table<any[]>('tools')
  for (const key of FINDING_RETEST_TOOLS) {
    const tool = tools.find((row) => row.key === key)
    const bound = asArray<string>(tool?.agents).includes(FINDING_RETEST_AGENT_KEY)
    if (!tool || !tool.enabled || !bound) throw httpError(409, `请为复测 Agent 启用并绑定工具：${key}`)
  }
}

async function enqueueFindingRetest(findingId: number, notes: string) {
  const finding = await operations.writer.readRecord(FINDINGS, String(findingId))
  if (!finding) throw httpError(404, 'finding not found')
  await retestAgentReady()
  const rows = await operations.writer.list(FINDING_RETESTS)
  const existing = rows
    .filter((row) => Number(row.finding_id) === findingId && RETEST_ACTIVE_STATUSES.includes(String(row.status)))
    .sort((a, b) => Number(a.id) - Number(b.id))[0]
  if (existing) return { retest: retestDto(existing), created: false }

  const title = sliceRunes(String(finding.name ?? '').trim() || String(finding.vulnclass ?? '').trim() || '未分类', 100)
  const convId = (await operations.writer.maxKey(CONVERSATIONS)) + 1
  const retestId = (await operations.writer.maxKey(FINDING_RETESTS)) + 1
  const activityId = (await operations.writer.maxKey(CONVERSATION_ACTIVITIES)) + 1
  const now = new Date().toISOString()
  const message = notes
    ? `请复测漏洞 #${findingId}。先调用 get_finding_retest_context 读取本会话关联的原始证据与约束，再执行针对性验证，最后调用 record_finding_retest_result 保存结论。\n\n本次复测补充说明：\n${notes}`
    : `请复测漏洞 #${findingId}。先调用 get_finding_retest_context 读取本会话关联的原始证据与约束，再执行针对性验证，最后调用 record_finding_retest_result 保存结论。`
  const conversation = {
    id: String(convId),
    agent_key: FINDING_RETEST_AGENT_KEY,
    title: `复测 #${findingId} · ${title}`,
    llm_profile_id: null,
    project_id: null,
    workspace: '',
    pinned_at: null,
    created_at: now,
    updated_at: now
  }
  const retest = {
    id: String(retestId),
    finding_id: Number(findingId),
    conversation_id: Number(convId),
    status: 'pending',
    verdict: '',
    notes,
    purpose: 'retest',
    summary: '',
    evidence: '',
    error: '',
    created_at: rfc3339(new Date(now)),
    started_at: null,
    finished_at: null
  }
  const [written] = await operations.writer.commit([
    { table: CONVERSATIONS, key: String(convId), record: conversation },
    {
      table: CONVERSATION_ACTIVITIES, key: String(activityId),
      record: {
        id: String(activityId), conversation_id: String(convId), worker: FINDING_RETEST_AGENT_KEY,
        kind: 'user', tool: '', tool_use_id: '', is_error: false,
        summary: `请复测漏洞 #${findingId}`, detail: message,
        input_tokens: null, output_tokens: null, cache_read_tokens: null, cache_write_tokens: null,
        outcome: '', created_at: now
      }
    },
    { table: FINDING_RETESTS, key: String(retestId), record: retest }
  ])
  void written
  store.invalidate?.(['conversations', 'conversation_activities'])
  return { retest: retestDto(retest), created: true }
}

// ── 路由注册 ─────────────────────────────────────────────────────────────────
export function register(api: Hono) {
  // ── 图：整条探索链（nodes + edges）────────────────────────────────────────
  api.get('/api/exploration/graph', async (c) => {
    try {
      const task = await resolveTask(c.req.query('task'))
      if (!task) return c.json({ nodes: [], edges: [] })
      const explorationId = Number(task.exploration_id)
      const nodes = (await operations.writer.list(NODES))
        .filter((row) => Number(row.exploration_id) === explorationId)
        .sort((a, b) => Number(a.id) - Number(b.id))
        .slice(0, GRAPH_NODE_LIMIT)
      const edges = (await operations.writer.list(EDGES))
        .filter((row) => Number(row.exploration_id) === explorationId)
        .sort(compareEdges)
        .slice(0, GRAPH_EDGE_LIMIT)
      return c.json({ nodes: nodes.map(nodeDto), edges: edges.map(edgeDto) })
    } catch (e: any) {
      return err(c, e)
    }
  })

  // ── 前沿：可领的意图（open，priority DESC / id ASC）───────────────────────
  api.get('/api/exploration/frontier', async (c) => {
    try {
      const task = await resolveTask(c.req.query('task'))
      if (!task) return c.json([])
      const raw = Number(c.req.query('limit') ?? 0)
      const limit = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 100
      const explorationId = Number(task.exploration_id)
      const rows = (await operations.writer.list(NODES))
        .filter((row) => Number(row.exploration_id) === explorationId && row.kind === 'intent' && row.state === 'open')
        .sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0) || Number(a.id) - Number(b.id))
        .slice(0, limit)
      return c.json(rows.map(nodeDto))
    } catch (e: any) {
      return err(c, e)
    }
  })

  // ── 主会话分段 ────────────────────────────────────────────────────────────
  api.get('/api/exploration/main-sessions', async (c) => {
    try {
      const task = await resolveTask(c.req.query('task'))
      if (!task) return c.json({ error: 'task not found' }, 404)
      const sessions = await listMainSessions(Number(task.exploration_id))
      return c.json({ sessions, current: sessions.length ? sessions[0].seq : 0 })
    } catch (e: any) {
      return err(c, e)
    }
  })

  api.post('/api/exploration/main-session/new', async (c) => {
    try {
      const task = await resolveTask(c.req.query('task'))
      if (!task) return c.json({ error: 'task not found' }, 404)
      const record = await createMainSession(Number(task.exploration_id))
      return c.json({ seq: Number(record.seq), created_at: String(record.created_at), current: Number(record.seq) })
    } catch (e: any) {
      return err(c, e)
    }
  })

  // ── 发现：分组（按任务）──────────────────────────────────────────────────
  api.get('/api/exploration/findings/groups', async (c) => {
    try {
      const page = paginationParam(c.req.query('page'), 1, 0)
      const limit = paginationParam(c.req.query('limit'), 10, 100)
      const filter = filterFromQuery((name) => c.req.query(name))
      let rows = (await loadFindings()).filter((row) => matchesFilter(row, filter))
      if (filter.assetScope) {
        const tree = await buildFindingAssetTree(rows)
        rows = scopeFiltered(rows, filter, tree)
      }
      const tasks = await operations.writer.list(TASKS)
      const byId = new Map<string, any>(tasks.map((row) => [String(row.id), row]))
      const buckets = new Map<string, { row: any | null; items: any[] }>()
      for (const row of rows) {
        const key = row.task_id == null ? '' : String(row.task_id)
        const bucket = buckets.get(key) ?? { row: key ? byId.get(key) ?? null : null, items: [] }
        bucket.items.push(row)
        buckets.set(key, bucket)
      }
      const groups = [...buckets.entries()].map(([key, bucket]) => {
        const task = bucket.row
        let status = String(task?.status ?? '')
        if (!['done', 'failed', 'timeout'].includes(status)) {
          if (task?.queued) status = 'queued'
          else if (task?.paused) status = 'paused'
        }
        const severity = { critical: 0, high: 0, medium: 0, low: 0 } as Record<string, number>
        let last = ''
        for (const row of bucket.items) {
          const value = String(row.severity ?? '')
          if (severity[value] != null) severity[value] += 1
          const ts = String(row.created_at_text ?? '')
          if (ts > last) last = ts
        }
        return {
          task_id: key ? Number(key) : null,
          task_name: String(task?.name ?? ''),
          task_description: String(task?.description ?? ''),
          task_status: status,
          count: bucket.items.length,
          critical: severity.critical,
          high: severity.high,
          medium: severity.medium,
          low: severity.low,
          last_found_at: last
        }
      })
      const rank = (group: any) => Math.max(0, ...['critical', 'high', 'medium', 'low'].map((key, index) => (group[key] > 0 ? 4 - index : -1)))
      groups.sort((a, b) => {
        if (filter.sort === 'severity') {
          const diff = rank(b) - rank(a)
          if (diff) return diff
        }
        const byTime = String(b.last_found_at).localeCompare(String(a.last_found_at))
        if (byTime) return byTime
        return (b.task_id ?? -1) - (a.task_id ?? -1)
      })
      const items = groups.slice((page - 1) * limit, (page - 1) * limit + limit)
      return c.json({ items, total: groups.length, finding_total: rows.length, page, page_size: limit })
    } catch (e: any) {
      return err(c, e)
    }
  })

  // ── 发现：导出（csv / json / md-single / md-zip）─────────────────────────
  api.get('/api/exploration/findings/export', async (c) => {
    try {
      const scope = String(c.req.query('scope') ?? '').trim()
      const format = String(c.req.query('format') ?? '').trim()
      const filter = filterFromQuery((name) => c.req.query(name))
      let rows: any[]
      if (scope === 'selected') {
        const ids: number[] = []
        for (const part of String(c.req.query('ids') ?? '').split(',')) {
          const text = part.trim()
          if (!text) continue
          const id = Number(text)
          if (!Number.isFinite(id) || id <= 0) return c.json({ error: `bad finding id: ${text}` }, 400)
          ids.push(id)
        }
        if (!ids.length) return c.json({ error: 'no findings selected' }, 400)
        const all = await loadFindings()
        const order = new Map(ids.map((id, index) => [String(id), index]))
        rows = all.filter((row) => order.has(String(row.id))).sort((a, b) => (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0))
      } else if (scope === 'all') {
        rows = await loadFindings()
      } else if (scope === 'filtered' || scope === '') {
        rows = (await loadFindings()).filter((row) => matchesFilter(row, filter))
        if (filter.assetScope) {
          const tree = await buildFindingAssetTree(rows)
          rows = scopeFiltered(rows, filter, tree)
        }
      } else {
        return c.json({ error: `bad scope: ${scope}` }, 400)
      }

      const now = new Date()
      const names = await taskNameMap()
      const base = `findings-${stamp(now)}`
      const download = (contentType: string, filename: string, body: string | Buffer) => {
        const payload = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
        return new Response(new Uint8Array(payload), {
          headers: {
            'content-type': contentType,
            'content-disposition': `attachment; filename="${filename}"`,
            'content-length': String(payload.length)
          }
        })
      }

      switch (format) {
        case 'md-single':
          return download('text/markdown; charset=utf-8', `${base}.md`, findingsMarkdown(rows, names, now))
        case 'csv':
          return download('text/csv; charset=utf-8', `${base}.csv`, findingsCsv(rows, names))
        case 'json':
          return download('application/json; charset=utf-8', `${base}.json`, `${JSON.stringify(rows.map(findingDto), null, 2)}\n`)
        case 'md-zip': {
          const entries = [
            { name: 'findings.md', data: Buffer.from(findingsMarkdown(rows, names, now), 'utf8') },
            { name: 'manifest.json', data: Buffer.from(`${JSON.stringify({ generated_at: now.toISOString(), scope: scope || 'filtered', format, count: rows.length, findings: rows.map(findingDto) }, null, 2)}\n`, 'utf8') }
          ]
          for (const row of exportOrder(rows)) {
            entries.push({ name: `findings/finding-${row.id}.md`, data: Buffer.from(singleFindingMarkdown(row, names, now), 'utf8') })
          }
          const zip = buildZip(entries)
          return new Response(new Uint8Array(zip), {
            headers: {
              'content-type': 'application/zip',
              'content-disposition': `attachment; filename="${base}.zip"`,
              'content-length': String(zip.length)
            }
          })
        }
        default:
          return c.json({ error: `bad format: ${format}` }, 400)
      }
    } catch (e: any) {
      return err(c, e)
    }
  })

  // ── 发现：按资产树 ────────────────────────────────────────────────────────
  api.get('/api/exploration/findings/asset-tree', async (c) => {
    try {
      const filter = filterFromQuery((name) => c.req.query(name))
      // asset_scope 自身不参与构树，否则树会随选中节点塌缩成一条链。
      const rows = (await loadFindings()).filter((row) => matchesFilter(row, { ...filter, assetScope: '' }))
      const tree = await buildFindingAssetTree(rows)
      return c.json({
        nodes: tree.nodes,
        finding_total: tree.finding_total,
        truncated: tree.truncated,
        ...(tree.dropped_kinds.length ? { dropped_kinds: tree.dropped_kinds } : {})
      })
    } catch (e: any) {
      return err(c, e)
    }
  })

  // ── 复测：活跃会话（列表页轮询）───────────────────────────────────────────
  api.get('/api/exploration/findings/retests/active', async (c) => {
    try {
      const rows = (await operations.writer.list(FINDING_RETESTS))
        .filter((row) => RETEST_ACTIVE_STATUSES.includes(String(row.status)) && row.conversation_id != null)
        .sort((a, b) => Number(a.id) - Number(b.id))
      return c.json({
        retests: rows.map((row) => ({
          id: Number(row.id),
          finding_id: String(row.finding_id),
          conversation_id: Number(row.conversation_id),
          status: String(row.status)
        }))
      })
    } catch (e: any) {
      return err(c, e)
    }
  })

  // ── 发现：血缘（根 → 该 finding 节点的子 DAG）────────────────────────────
  api.get('/api/exploration/findings/:id/lineage', async (c) => {
    try {
      const id = Number(c.req.param('id'))
      if (!Number.isFinite(id) || id <= 0) return c.json({ error: 'bad finding id' }, 400)
      const finding = await operations.writer.readRecord(FINDINGS, String(id))
      if (!finding) return c.json({ error: 'finding not found' }, 404)
      const empty = { nodes: [], edges: [] }
      if (finding.node_id == null || finding.task_id == null) return c.json(empty)
      const task = await resolveTask(String(finding.task_id))
      if (!task) return c.json(empty)
      const explorationId = Number(task.exploration_id)
      const allNodes = (await operations.writer.list(NODES)).filter((row) => Number(row.exploration_id) === explorationId)
      const allEdges = (await operations.writer.list(EDGES)).filter((row) => Number(row.exploration_id) === explorationId)
      const nodeId = String(finding.node_id)
      // 反向可达：沿着 dst→src 收全部祖先（含自身）。
      const ancestors = new Set<string>()
      const queue = [nodeId]
      while (queue.length) {
        const current = queue.shift()!
        if (ancestors.has(current)) continue
        ancestors.add(current)
        for (const edge of allEdges) {
          if (String(edge.dst) === current && !ancestors.has(String(edge.src))) queue.push(String(edge.src))
        }
      }
      const nodes = allNodes
        .filter((row) => ancestors.has(String(row.id)))
        .sort((a, b) => Number(a.id) - Number(b.id))
      if (!nodes.length) return c.json(empty)
      const edges = allEdges
        .filter((row) => ancestors.has(String(row.src)) && ancestors.has(String(row.dst)))
        .sort(compareEdges)
      return c.json({ nodes: nodes.map(nodeDto), edges: edges.map(edgeDto) })
    } catch (e: any) {
      return err(c, e)
    }
  })

  // ── 发现：深入利用（人工意图 + 血缘边 + 审计活动，原子提交）──────────────
  api.post('/api/exploration/findings/:id/deepen', async (c) => {
    try {
      const id = Number(c.req.param('id'))
      if (!Number.isFinite(id) || id <= 0) return c.json({ error: 'bad finding id' }, 400)
      const body = await c.req.json().catch(() => ({}))
      const description = String(body?.description ?? '').trim()
      if (!description) return c.json({ error: 'description is required' }, 400)
      if (runeCount(description) > MAX_FOLLOW_UP_RUNES) {
        return c.json({ error: `description must be at most ${MAX_FOLLOW_UP_RUNES} characters` }, 400)
      }
      const finding = await operations.writer.readRecord(FINDINGS, String(id))
      if (!finding) return c.json({ error: 'finding not found' }, 404)
      if (finding.task_id == null || finding.node_id == null) {
        return c.json({ error: 'finding origin task or node is no longer available' }, 409)
      }
      const task = await operations.writer.readRecord(TASKS, String(finding.task_id))
      if (!task || task.deleted_at_text) return c.json({ error: 'finding origin task is no longer available' }, 409)
      const findingNode = await operations.writer.readRecord(NODES, String(finding.node_id))
      if (!findingNode || findingNode.kind !== 'finding' || Number(findingNode.exploration_id) !== Number(task.exploration_id)) {
        return c.json({ error: 'finding origin task or node is no longer available' }, 409)
      }

      const explorationId = Number(task.exploration_id)
      const nodes = await operations.writer.list(NODES)
      const intentId = nodes.reduce((max, row) => Math.max(max, Number(row.id ?? 0)), 0) + 1
      const anchors = (await operations.writer.list(ANCHORS))
        .filter((row) => String(row.node_id) === String(finding.node_id))
        .sort((a, b) => Number(a.asset_id) - Number(b.asset_id))
      const activities = await operations.writer.list(ACTIVITY)
      const activityId = activities.reduce((max, row) => Math.max(max, Number(row.id ?? 0)), 0) + 1
      const now = new Date()
      const intent = {
        id: String(intentId),
        exploration_id: explorationId,
        kind: 'intent',
        state: 'open',
        priority: 10,
        origin: 'human',
        payload: {
          text: description,
          finding_id: String(id),
          ...(anchors.length ? { asset_ids: anchors.map((row) => Number(row.asset_id)) } : {})
        },
        created_at: rfc3339(now)
      }
      const ops: Array<{ table: string; key: string; record: Record<string, unknown> }> = [
        { table: NODES, key: String(intentId), record: intent },
        {
          table: EDGES,
          key: `${finding.node_id}-derived_from-${intentId}`,
          record: { exploration_id: explorationId, src: String(finding.node_id), dst: String(intentId), rel: 'derived_from' }
        },
        {
          table: ACTIVITY,
          key: String(activityId),
          record: {
            id: String(activityId), exploration_id: explorationId, node_id: Number(intentId),
            worker: 'system', kind: 'text', is_error: false,
            summary: '人工提交漏洞深入利用意图', detail: description,
            metadata: {}, created_at: rfc3339(now), created_unix: Math.floor(now.getTime() / 1000)
          }
        }
      ]
      for (const anchor of anchors) {
        const key = `${intentId}-${Number(anchor.asset_id)}`
        ops.push({ table: ANCHORS, key, record: { node_id: Number(intentId), asset_id: Number(anchor.asset_id) } })
      }
      await operations.writer.commit(ops)
      store.invalidate?.(['nodes', 'edges', 'activity'])

      // 任务准入：与并发路径共用 controlTask，队列状态如实回报。
      let queued = Boolean(task.queued)
      try {
        const admitted = await operations.controlTask(String(task.id), 'resume')
        queued = Boolean(admitted?.queued)
      } catch {
        // 任务处于删除等不可准入状态时意图仍然落库，状态以持久化行为准。
      }
      const current = await operations.writer.readRecord(NODES, String(intentId))
      return c.json({
        task_id: Number(task.id),
        intent_id: Number(intentId),
        state: String(current?.state ?? 'open'),
        queued
      })
    } catch (e: any) {
      return err(c, e)
    }
  })

  // ── 复测：某 finding 的历史 ───────────────────────────────────────────────
  api.get('/api/exploration/findings/:id/retests', async (c) => {
    try {
      const id = Number(c.req.param('id'))
      if (!Number.isFinite(id) || id <= 0) return c.json({ error: 'bad finding id' }, 400)
      const finding = await operations.writer.readRecord(FINDINGS, String(id))
      if (!finding) return c.json({ error: 'finding not found' }, 404)
      const rows = (await operations.writer.list(FINDING_RETESTS))
        .filter((row) => Number(row.finding_id) === id)
        .sort((a, b) => Number(b.id) - Number(a.id))
      return c.json({ retests: rows.map(retestDto) })
    } catch (e: any) {
      return err(c, e)
    }
  })

  // ── 复测：发起（已有活跃会话则复用）──────────────────────────────────────
  api.post('/api/exploration/findings/:id/retests', async (c) => {
    try {
      const id = Number(c.req.param('id'))
      if (!Number.isFinite(id) || id <= 0) return c.json({ error: 'bad finding id' }, 400)
      const body = await c.req.json().catch(() => ({}))
      const notes = String(body?.notes ?? '').trim()
      if (runeCount(notes) > MAX_RETEST_NOTES_RUNES) {
        return c.json({ error: `复测补充说明最多 ${MAX_RETEST_NOTES_RUNES} 个字符` }, 400)
      }
      const result = await enqueueFindingRetest(id, notes)
      return c.json(result, result.created ? 202 : 200)
    } catch (e: any) {
      return err(c, e)
    }
  })

  // ── 活动：SSE 实时流（先补 backlog 再追增量，id 单调）────────────────────
  api.get('/api/exploration/activity/stream', async (c) => {
    try {
      const task = await resolveTask(c.req.query('task'))
      if (!task) return c.json({ error: 'task not found' }, 404)
      const explorationId = Number(task.exploration_id)
      const intentRaw = String(c.req.query('intent') ?? '').trim()
      const intentId = intentRaw && Number.isFinite(Number(intentRaw)) ? Number(intentRaw) : null
      // 浏览器自动重连带 Last-Event-ID，优先于 query（与 Go 一致）。
      let since = Math.max(0, Math.floor(Number(c.req.query('since') ?? 0) || 0))
      const lastEventId = c.req.header('last-event-id')
      if (lastEventId && Number.isFinite(Number(lastEventId))) since = Math.max(0, Math.floor(Number(lastEventId)))

      const encoder = new TextEncoder()
      const signal = c.req.raw.signal
      let timer: ReturnType<typeof setInterval> | undefined
      let closed = false
      let lastPing = Date.now()

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const stop = () => {
            if (closed) return
            closed = true
            if (timer) clearInterval(timer)
            timer = undefined
            try {
              controller.close()
            } catch {
              // 已被下游取消
            }
          }
          const send = (chunk: string) => {
            if (closed) return
            try {
              controller.enqueue(encoder.encode(chunk))
            } catch {
              stop()
            }
          }
          const emit = (row: any) => send(`id: ${Number(row.id)}\ndata: ${JSON.stringify(activityDto(row))}\n\n`)
          const pump = async () => {
            const rows = (await operations.writer.list(ACTIVITY))
              .filter((row) => Number(row.exploration_id) === explorationId)
              .filter((row) => Number(row.id) > since)
              .filter((row) => intentId == null || Number(row.node_id) === intentId)
              .sort((a, b) => Number(a.id) - Number(b.id))
            for (const row of rows) {
              if (closed) return
              if (Number(row.id) <= since) continue
              since = Number(row.id)
              emit(row)
            }
          }
          signal?.addEventListener?.('abort', stop, { once: true })
          void (async () => {
            try {
              await pump()
            } catch {
              stop()
              return
            }
            if (closed) return
            timer = setInterval(() => {
              void (async () => {
                if (closed) return
                try {
                  await pump()
                } catch {
                  stop()
                  return
                }
                if (Date.now() - lastPing >= STREAM_PING_MS) {
                  lastPing = Date.now()
                  send(': ping\n\n')
                }
              })()
            }, STREAM_POLL_MS)
            timer.unref?.()
          })()
        },
        cancel() {
          closed = true
          if (timer) clearInterval(timer)
          timer = undefined
        }
      })
      return new Response(stream, {
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
          'x-accel-buffering': 'no'
        }
      })
    } catch (e: any) {
      return err(c, e)
    }
  })

  // ── 活动：单步详情（懒加载 detail）───────────────────────────────────────
  api.get('/api/exploration/activity/:seq', async (c) => {
    try {
      const task = await resolveTask(c.req.query('task'))
      if (!task) return c.json({ error: 'no task' }, 404)
      const seq = Number(c.req.param('seq'))
      if (!Number.isFinite(seq) || seq <= 0) return c.json({ error: 'bad seq' }, 400)
      const row = await operations.writer.readRecord(ACTIVITY, String(seq))
      if (!row || Number(row.exploration_id) !== Number(task.exploration_id)) return c.json({ detail: '' })
      return c.json({ detail: String(row.detail ?? '') })
    } catch (e: any) {
      return err(c, e)
    }
  })
}
