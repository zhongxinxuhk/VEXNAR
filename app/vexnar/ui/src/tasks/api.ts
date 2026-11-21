// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 任务面板的数据面：同源 /vexnar-api（由账户插件转给本机 Go 服务）。
 *
 * 这里只放任务面板要用的接口，字段按 Go 的 JSON 取子集；写操作与 Web 控制台
 * （web/src/lib/api.ts）逐条对齐，保证两个客户端改的是同一行数据。
 */

const BASE = '/vexnar-api/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...(init?.headers ?? {}) },
    cache: 'no-store'
  })
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!response.ok) {
    const message = (body as { error?: string } | null)?.error ?? `HTTP ${response.status}`
    throw new Error(message)
  }
  return body as T
}

const get = <T>(path: string) => request<T>(path)
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, body === undefined ? { method: 'POST' } : { method: 'POST', body: JSON.stringify(body) })
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
const del = <T>(path: string) => request<T>(path, { method: 'DELETE' })

/** Go 的列表接口有的直接回数组，有的包一层 {xxx:[...]}；统一在这里收口。 */
function listOf<T>(value: unknown, key: string): T[] {
  if (Array.isArray(value)) return value as T[]
  const inner = (value as Record<string, unknown> | null)?.[key]
  return Array.isArray(inner) ? (inner as T[]) : []
}

const query = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

/**
 * 任务状态：created | queued | running | paused | done | failed | timeout。
 * 这是服务端 `TaskLifecycle` 的镜像（Go server/task_summary.go、
 * app/vexnar-store/src/task-status.ts）；归档不是状态，是 `archived_at` 标记，
 * 归档任务不在活动清单里。
 */
export type TaskStatus = 'created' | 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'timeout' | (string & {})

export interface TaskLifecycleEntry {
  key: TaskStatus
  label: string
  tone: 'muted' | 'info' | 'success' | 'warn' | 'error' | (string & {})
  terminal?: boolean
  active?: boolean
  hint?: string
}

/**
 * `GET /api/tasks/summary`：任务清单的聚合口径。概览 KPI、健康度、任务面板的
 * 筛选计数都读这一条——分页结果算出来的计数只描述当前页，那是数字对不上的根因。
 */
export interface TaskSummary {
  total: number
  by_status: Record<string, number | undefined>
  active: number
  paused: number
  terminal: number
  done: number
  failed: number
  timeout: number
  completion_rate: number
  goals_total: number
  goals_met: number
  goal_rate: number
  in_flight: number
  findings: { total: number; critical: number; high: number; medium: number; low: number }
  tokens: { input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; total: number }
  window_days: number
  created_window: number
  created_prev: number
  throughput: number[]
  lifecycle: TaskLifecycleEntry[]
  generated_unix: number
}

export type Task = {
  id: string
  name?: string
  description: string
  goal: string
  status: TaskStatus
  created_at: string
  completed_at?: string
  paused?: boolean
  queued?: boolean
  in_flight?: number
  findings?: { critical: number; high: number; medium: number; low: number }
  last_activity?: string
  goals_total?: number
  goals_met?: number
  tokens?: { total?: number; prompt?: number; completion?: number }
  source_task_ids?: string[]
  coverage_enabled?: boolean
  pinned?: boolean
}

export type TaskPage = { tasks: Task[]; total: number; page: number; size: number; active?: string }

export type Goal = { id: number; text: string; vulnclass?: string; met?: boolean; created_at?: string }
export type Constraint = { id: number; text: string; kind: 'allow' | 'deny' | string }
export type ScopeRow = { id: number; kind: string; value: string; reason?: string; manual?: boolean }
export type TaskRule = {
  id: number
  kind: 'allow' | 'deny' | string
  match: string
  pattern: string
  note?: string
  enabled: boolean
  priority?: number
}
export type Finding = {
  id: number | string
  title: string
  severity: string
  status: string
  vulnclass?: string
  host?: string
  url?: string
  created_at?: string
  task_id?: string
}
export type FindingsPage = { items: Finding[]; total: number; page?: number; limit?: number }
export type Asset = {
  id: number
  type: string
  /** Go 的资产行按类型给值：域名在 domain/root_domain，IP 在 ip，服务在 host:port。 */
  domain?: string
  root_domain?: string
  ip?: string
  host?: string
  port?: number
  url?: string
  icp?: string
  task_source?: string
  task_source_summary?: string
}
export type Coverage = {
  total?: number
  tested?: number
  percent?: number
  by_type?: Array<{ type: string; total: number; tested: number }>
}
export type CoverageGraph = {
  nodes?: Array<{ id: string; label: string; type: string; tested?: boolean }>
  edges?: Array<{ src: string; dst: string }>
}
export type ActivityItem = {
  id: number
  ts: string
  kind?: string
  actor?: string
  title?: string
  summary?: string
  tool?: string
}
export type Intent = {
  id: number
  text?: string
  status?: string
  kind?: string
  created_at?: string
  blocked?: boolean
}
export type ModelTokens = { models: Array<{ model: string; total: number; prompt?: number; completion?: number }> }
export type ApprovalRow = {
  id: number
  tool?: string
  action?: string
  decision?: string
  status?: string
  created_at?: string
  conversation_id?: number
  reason?: string
}
export type MainSessions = { sessions: Array<{ seq: number; created_at: string }>; current: number }

export const tasksApi = {
  list: (params: { q?: string; status?: string; page?: number; size?: number }) =>
    get<TaskPage>(`/tasks${query({ q: params.q, status: params.status, page: params.page, size: params.size })}`),
  summary: (days = 30) => get<TaskSummary>(`/tasks/summary${query({ days })}`),
  get: (id: string) => get<Task>(`/tasks/${encodeURIComponent(id)}`),
  create: (input: { name?: string; description: string; goal?: string }) => post<Task>('/tasks', input),
  control: (id: string, action: 'start' | 'pause' | 'resume' | 'stop') =>
    post<{ status: string }>(`/tasks/${encodeURIComponent(id)}/control`, { action }),
  archive: (id: string) => post<unknown>(`/tasks/${encodeURIComponent(id)}/archive`),
  remove: (id: string) => del<unknown>(`/tasks/${encodeURIComponent(id)}`),

  stats: (id: string) => get<Record<string, unknown>>(`/stats${query({ task: id })}`),
  intents: (id: string) => get<unknown>(`/exploration/intents${query({ task: id })}`).then((value) => listOf<Intent>(value, 'intents')),
  intentsRerunBlocked: (id: string) => post<{ reopened: number }>(`/tasks/${encodeURIComponent(id)}/intents/rerun-blocked`),
  activity: (id: string, limit = 80) =>
    get<unknown>(`/exploration/activity${query({ task: id, limit })}`).then((value) => listOf<ActivityItem>(value, 'items')),
  activityHistory: (id: string, session: string, before = 0, limit = 100) =>
    get<{ items?: ActivityItem[]; has_more?: boolean; earliest_cursor?: number }>(
      `/exploration/activity/history${query({ task: id, session, before, limit })}`
    ).then((value) => ({
      items: listOf<ActivityItem>(value, 'items'),
      hasMore: Boolean(value?.has_more),
      earliestCursor: value?.earliest_cursor ?? 0
    })),
  mainSessions: (id: string) => get<MainSessions>(`/exploration/main-sessions${query({ task: id })}`),
  newMainSession: (id: string) => post<{ seq: number; current: number }>(`/exploration/main-session/new${query({ task: id })}`),
  chat: (id: string, message: string, seg?: number) => post<{ reply: string; mode: string }>(`/chat${query({ task: id })}`, { message, seg }),
  chatStop: (id: string) => post<unknown>(`/tasks/${encodeURIComponent(id)}/chat/stop`, {}),

  goals: (id: string) =>
    get<unknown>(`/tasks/${encodeURIComponent(id)}/goals`).then((value) => listOf<Goal>(value, 'goals')),
  addGoal: (id: string, text: string, vulnclass = '') => post<Goal>(`/tasks/${encodeURIComponent(id)}/goals`, { text, vulnclass }),
  updateGoal: (id: string, goalId: number, text: string, vulnclass = '') =>
    patch<Goal>(`/tasks/${encodeURIComponent(id)}/goals/${goalId}`, { text, vulnclass }),
  deleteGoal: (id: string, goalId: number) => del<unknown>(`/tasks/${encodeURIComponent(id)}/goals/${goalId}`),

  constraints: (id: string) =>
    get<unknown>(`/tasks/${encodeURIComponent(id)}/constraints`).then((value) => listOf<Constraint>(value, 'constraints')),
  addConstraint: (id: string, text: string, kind: string) =>
    post<Constraint>(`/tasks/${encodeURIComponent(id)}/constraints`, { text, kind }),
  deleteConstraint: (id: string, constraintId: number) =>
    del<unknown>(`/tasks/${encodeURIComponent(id)}/constraints/${constraintId}`),

  scope: (id: string) => get<unknown>(`/tasks/${encodeURIComponent(id)}/scope`).then((value) => listOf<ScopeRow>(value, 'scope')),
  addScope: (id: string, kind: string, value: string, reason = '') =>
    post<ScopeRow>(`/tasks/${encodeURIComponent(id)}/scope`, { kind, value, reason }),
  deleteScope: (id: string, scopeId: number) => del<unknown>(`/tasks/${encodeURIComponent(id)}/scope/${scopeId}`),

  rules: (id: string) =>
    get<unknown>(`/tasks/${encodeURIComponent(id)}/intercept-rules`).then((value) => listOf<TaskRule>(value, 'rules')),
  addRule: (id: string, rule: Partial<TaskRule>) => post<TaskRule>(`/tasks/${encodeURIComponent(id)}/intercept-rules`, rule),
  toggleRule: (id: string, ruleId: number, enabled: boolean) =>
    post<unknown>(`/tasks/${encodeURIComponent(id)}/intercept-rules/${ruleId}/toggle`, { enabled }),
  deleteRule: (id: string, ruleId: number) => del<unknown>(`/tasks/${encodeURIComponent(id)}/intercept-rules/${ruleId}`),

  coverage: (id: string) => get<Coverage>(`/tasks/${encodeURIComponent(id)}/coverage`),
  coverageGraph: (id: string) => get<CoverageGraph>(`/tasks/${encodeURIComponent(id)}/coverage-graph`),
  tokens: (id: string) =>
    get<unknown>(`/llm/records/by-model${query({ task: id })}`).then((value) => listOf<ModelTokens['models'][number]>(value, 'models')),

  findings: (id: string, page = 1, limit = 20, extra: Record<string, string> = {}) =>
    get<{ items?: Finding[]; total?: number }>(`/exploration/findings${query({ task: id, page, limit, ...extra })}`).then(
      (value) => ({ items: listOf<Finding>(value, 'items'), total: value?.total ?? listOf<Finding>(value, 'items').length })
    ),
  setFindingStatus: (findingId: string | number, status: string) =>
    patch<Finding>(`/exploration/findings/${findingId}`, { status }),
  findingRetests: (findingId: string | number) => get<{ retests: Array<Record<string, unknown>> }>(`/exploration/findings/${findingId}/retests`),
  startRetest: (findingId: string | number, notes: string) =>
    post<{ created: boolean }>(`/exploration/findings/${findingId}/retests`, { notes }),

  assets: (id: string, type = '', limit = 50, offset = 0, dsl = '') =>
    get<{ assets?: Asset[]; total?: number; count?: number }>(`/assets${query({ task_id: id, type, limit, offset, dsl })}`).then(
      (value) => ({
        assets: listOf<Asset>(value, 'assets').map((asset) => ({
          ...asset,
          // 一个展示值：不同资产类型的落点字段不同，统一在这里挑第一个有值的。
          display:
            asset.url ||
            asset.domain ||
            asset.root_domain ||
            asset.host ||
            asset.ip ||
            (asset as unknown as { value?: string }).value ||
            `#${asset.id}`,
          origin: asset.task_source_summary || asset.task_source || '—'
        })),
        total: value?.total ?? value?.count ?? 0
      })
    ),
  detachAsset: (id: string, assetId: number) => del<unknown>(`/tasks/${encodeURIComponent(id)}/assets/${assetId}`),
  attachAssets: (id: string, assetIds: number[]) =>
    post<unknown>(`/tasks/${encodeURIComponent(id)}/assets`, { asset_ids: assetIds, source_summary: 'dsh 手动挂载' }),

  approvals: (id: string, page = 1, size = 20) =>
    get<unknown>(`/intercept/history${query({ task_id: id, page, size })}`).then((value) => listOf<ApprovalRow>(value, 'items')),
  pending: (id: string) => get<unknown>(`/intercept/pending${query({ task: id })}`).then((value) => listOf<ApprovalRow>(value, 'pending')),
  decide: (approvalId: number, decision: 'allowed' | 'denied') =>
    post<unknown>(`/intercept/pending/${approvalId}/decide`, { decision }),

  report: (id: string) => get<string | Record<string, unknown>>(`/report${query({ task: id })}`)
}

export async function reportText(id: string): Promise<string> {
  const value = await tasksApi.report(id)
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}
