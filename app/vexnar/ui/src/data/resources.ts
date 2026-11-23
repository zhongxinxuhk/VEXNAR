// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 领域资源：接口形状 → 视图模型。
 *
 * 约定（四页共用，改一处即全局生效）：
 *   1. 只有这里知道后端字段名（snake_case）；页面只见到 camelCase 的视图模型；
 *   2. 每个资源一个 `key`，key 里编码了全部影响结果的参数，因此「同 key 同数据」；
 *   3. 缺字段一律补默认值，不让 `undefined` 漏到渲染层（表格/百分比只处理数字）；
 *   4. 取数函数是纯的（吃 signal），hooks 只是把它们接到缓存上。
 */
import { api } from './client.ts'
import { ensure, useQuery, type QueryResult } from './query.ts'
import type { Task, TaskPage, TaskSummary } from '../tasks/api.ts'

// ── 通用 ───────────────────────────────────────────────────────────────────
const num = (value: unknown, fallback = 0): number => {
  const parsed = Number(value ?? NaN)
  return Number.isFinite(parsed) ? parsed : fallback
}
const str = (value: unknown, fallback = ''): string => (value == null ? fallback : String(value))
const bool = (value: unknown): boolean => value === true || value === 'true' || value === 1

function rowsOf<T>(value: unknown, key: string): T[] {
  if (Array.isArray(value)) return value as T[]
  const inner = (value as Record<string, unknown> | null)?.[key]
  return Array.isArray(inner) ? (inner as T[]) : []
}

// ── 流量 ───────────────────────────────────────────────────────────────────
/** 采集来源：会话抓包（本机 kv）／采集面归档（Go 索引）／Web 测试引擎。 */
export type TrafficSource = 'local' | 'archive' | 'web'

export interface TrafficRow {
  id: string
  ts: number
  host: string
  method: string
  url: string
  status: number
  contentType: string
  bytes: number
  source: TrafficSource
}

export interface TrafficList {
  rows: TrafficRow[]
  /** 过滤后的总数（分页基数）。 */
  total: number
  /** 未过滤的全部条数（本地 + 归档）。 */
  count: number
  archived: number
  capturing: boolean
  page: number
  size: number
}

export interface TrafficFilter {
  host?: string
  method?: string
  status?: string
  q?: string
  sort?: 'ts' | 'status' | 'resp_len'
  order?: 'asc' | 'desc'
  page?: number
  size?: number
}

export interface TrafficTotals {
  total: number
  archived: number
  local: number
  capturing: boolean
}

export interface TrafficHostRow {
  host: string
  count: number
}

export interface CaptureSession {
  scope: string
  proxy: string
  convId: string
  sessionId: string
  source: string
  startedAt: number
  items: number
  lastTs: number
}

export interface CaptureSummary {
  active: boolean
  total: number
  lastTs: number
  sessions: CaptureSession[]
  recent: TrafficRow[]
}

function trafficRow(row: Record<string, unknown>): TrafficRow {
  const source = str(row['source'], 'local')
  return {
    id: str(row['id']),
    ts: Date.parse(str(row['ts'])) / 1000 || num(row['ts']),
    host: str(row['host']),
    method: str(row['method'], 'GET').toUpperCase(),
    url: str(row['url']),
    status: num(row['status']),
    contentType: str(row['content_type']),
    bytes: num(row['resp_len']),
    source: source === 'archive' || source === 'web' ? source : 'local'
  }
}

export async function fetchTrafficList(filter: TrafficFilter, signal?: AbortSignal): Promise<TrafficList> {
  const payload = await api.get<Record<string, unknown>>('/api/traffic', signal, {
    host: filter.host ?? '',
    method: filter.method ?? '',
    status: filter.status ?? '',
    q: filter.q ?? '',
    sort: filter.sort ?? 'ts',
    order: filter.order ?? 'desc',
    page: filter.page ?? 0,
    size: filter.size ?? 100
  })
  return {
    rows: rowsOf<Record<string, unknown>>(payload, 'exchanges').map(trafficRow),
    total: num(payload['total']),
    count: num(payload['count']),
    archived: num(payload['archived']),
    capturing: bool(payload['enabled']),
    page: num(payload['page']),
    size: num(payload['size'], 100)
  }
}

/**
 * 全局计数：只取一条，避免为了显示总数把整页拉下来。
 *
 * 概览与流量页都读这一个 key —— 这就是「两个页面数字对不上」的修法。
 */
export async function fetchTrafficTotals(signal?: AbortSignal): Promise<TrafficTotals> {
  const payload = await api.get<Record<string, unknown>>('/api/traffic', signal, { page: 0, size: 1 })
  const count = num(payload['count'])
  const archived = num(payload['archived'])
  return { total: count, archived, local: Math.max(0, count - archived), capturing: bool(payload['enabled']) }
}

export async function fetchTrafficHosts(signal?: AbortSignal): Promise<TrafficHostRow[]> {
  const payload = await api.get<Record<string, unknown>>('/api/traffic/hosts', signal)
  return rowsOf<Record<string, unknown>>(payload, 'hosts')
    .map((row) => ({ host: str(row['host']), count: num(row['count']) }))
    .filter((row) => row.host !== '')
}

export async function fetchCaptureSummary(signal?: AbortSignal): Promise<CaptureSummary> {
  const payload = await api.get<Record<string, unknown>>('/api/traffic/capture', signal).catch(() => ({}) as Record<string, unknown>)
  const sessions = rowsOf<Record<string, unknown>>(payload, 'sessions').map((row) => ({
    scope: str(row['scope']),
    proxy: str(row['proxy']),
    convId: str(row['conv_id']),
    sessionId: str(row['session_id']),
    source: str(row['source']),
    startedAt: num(row['started_at']),
    items: num(row['items']),
    lastTs: num(row['last_ts'])
  }))
  return {
    active: bool(payload['active']) || sessions.length > 0,
    total: num(payload['total']),
    lastTs: num(payload['last_ts']),
    sessions,
    recent: rowsOf<Record<string, unknown>>(payload, 'recent').map(trafficRow)
  }
}

/** 流量详情：core 用同一对字段返回请求/响应原文。 */
export interface TrafficDetail {
  req: string
  resp: string
}

export async function fetchTrafficDetail(id: string, signal?: AbortSignal): Promise<TrafficDetail> {
  const payload = await api.get<Record<string, unknown>>('/api/traffic/exchange', signal, { id })
  return { req: str(payload['req']), resp: str(payload['resp']) }
}

// ── Web 测试引擎（会话感知 HTTP） ──────────────────────────────────────────
export interface WebSession {
  sessionId: string
  origin: string
  label: string
  status: string
  adversarial: boolean
  requestCount: number
  requestBudget: number
  createdAt: number
  lastRequestAt: number
}

export interface WebExchange {
  requestId: string
  method: string
  path: string
  host: string
  status: number
  classification: string
  durationMs: number
  responseBytes: number
  attempt: number
  mutation: string
  egressId: string
  identityId: string
  timestamp: number
  title: string
}

export interface WebSessionDetail {
  session: WebSession
  budgetLeft: number
  history: WebExchange[]
  policyEvents: Array<{ at?: string; kind?: string; detail?: string; message?: string }>
}

function webSession(row: Record<string, unknown>): WebSession {
  return {
    sessionId: str(row['sessionId'] ?? row['session_id']),
    origin: str(row['origin']),
    label: str(row['label']),
    status: str(row['status'], 'active'),
    adversarial: bool(row['adversarial']),
    requestCount: num(row['requestCount'] ?? row['request_count']),
    requestBudget: num(row['requestBudget'] ?? row['request_budget']),
    createdAt: num(row['createdAt'] ?? row['created_at']),
    lastRequestAt: num(row['lastRequestAt'] ?? row['last_request_at'])
  }
}

export async function fetchWebSessions(signal?: AbortSignal): Promise<WebSession[]> {
  const payload = await api.get<Record<string, unknown>>('/api/web/sessions', signal).catch(() => ({}) as Record<string, unknown>)
  return rowsOf<Record<string, unknown>>(payload, 'sessions').map(webSession)
}

export async function fetchWebSession(sessionId: string, signal?: AbortSignal): Promise<WebSessionDetail> {
  const payload = await api.get<Record<string, unknown>>(`/api/web/sessions/${encodeURIComponent(sessionId)}`, signal)
  const session = webSession((payload['session'] ?? {}) as Record<string, unknown>)
  return {
    session,
    budgetLeft: num(payload['budgetLeft'] ?? payload['budget_left']),
    history: rowsOf<Record<string, unknown>>(payload, 'history').map((row) => ({
      requestId: str(row['requestId'] ?? row['request_id']),
      method: str(row['method']).toUpperCase(),
      path: str(row['path']),
      host: str(row['host']),
      status: num(row['status']),
      classification: str(row['classification'], 'unknown'),
      durationMs: num(row['durationMs'] ?? row['duration_ms']),
      responseBytes: num(row['responseBytes'] ?? row['response_bytes']),
      attempt: num(row['attempt'], 1),
      mutation: str(row['mutation'], 'none'),
      egressId: str(row['egressId'] ?? row['egress_id'], 'direct'),
      identityId: str(row['identityId'] ?? row['identity_id'], 'api-client'),
      timestamp: num(row['timestamp']),
      title: str(row['title'])
    })),
    policyEvents: rowsOf<Record<string, unknown>>(payload, 'policyEvents').map((row) => ({
      at: str(row['at']),
      kind: str(row['kind']),
      detail: str(row['detail'] ?? row['message'])
    }))
  }
}

// ── 会话流量（按 scope 归属，抓包按会话发起） ─────────────────────────────
/**
 * 一条会话的流量窗口。
 *
 * 数据来自 `/api/sessions/:id/traffic`（Go 时代是 Yakit 的 History），
 * 归属键是 `session-<id>`：只有这个 scope 抓到的报文会出现在这里。
 */
export interface SessionTrafficRow {
  id: string
  seq: number
  ts: number
  source: string
  method: string
  url: string
  host: string
  status: number
  reqBytes: number
  respBytes: number
  durationMs: number
  contentType: string
}

export interface SessionTrafficWindow {
  enabled: boolean
  scope: string
  rows: SessionTrafficRow[]
  nextSeq: number
  hasMore: boolean
}

/** 采集端点：代理地址、CA、条数，以及可选的 Yakit 注入脚本。 */
export interface SessionEndpoint {
  enabled: boolean
  scope: string
  proxy: string
  caPemUrl: string
  items: number
  lastTs: number
  source: string
  hook: string
}

export interface SessionExchangeRaw {
  req: string
  resp: string
}

/**
 * 会话 id → URL 段。
 *
 * 宿主 slot 给的 id 已经带 `session-` 前缀（`session-3fe9…`），而 core 侧会再拼一次
 * → `session-session-3fe9…`，scope 就对不上抓包记录。这里统一剥一层，两个入口
 * （头部开关、流量弹窗）共用，避免只修一处。
 */
export function sessionKey(sessionId: string): string {
  const raw = String(sessionId ?? '').trim()
  return raw.startsWith('session-') ? raw.slice('session-'.length) : raw
}

function sessionRow(row: Record<string, unknown>): SessionTrafficRow {
  return {
    id: str(row['id']),
    seq: num(row['seq']),
    ts: num(row['ts']),
    source: str(row['source']),
    method: str(row['method'], 'GET').toUpperCase(),
    url: str(row['url']),
    host: str(row['host']),
    status: num(row['status']),
    reqBytes: num(row['req_len']),
    respBytes: num(row['resp_len']),
    durationMs: num(row['duration_ms']),
    contentType: str(row['content_type'])
  }
}

export async function fetchSessionTraffic(
  sessionId: string,
  options: { limit?: number; afterSeq?: number } = {},
  signal?: AbortSignal
): Promise<SessionTrafficWindow> {
  const payload = await api.get<Record<string, unknown>>(
    `/api/sessions/${encodeURIComponent(sessionKey(sessionId))}/traffic`,
    signal,
    { limit: options.limit ?? 200, after_seq: options.afterSeq ?? 0 }
  )
  const rows = rowsOf<Record<string, unknown>>(payload, 'items').map(sessionRow)
  // 接口按 seq 升序给"最近一窗"，界面要最新在上。
  rows.sort((left, right) => right.seq - left.seq)
  return {
    enabled: bool(payload['enabled']),
    scope: str(payload['scope']),
    rows,
    nextSeq: num(payload['next_seq']),
    hasMore: bool(payload['has_more'])
  }
}

export async function fetchSessionEndpoint(sessionId: string, signal?: AbortSignal): Promise<SessionEndpoint> {
  const payload = await api.get<Record<string, unknown>>(
    `/api/sessions/${encodeURIComponent(sessionKey(sessionId))}/traffic/endpoint`,
    signal
  )
  const capture = (payload['capture'] ?? {}) as Record<string, unknown>
  return {
    enabled: bool(payload['enabled']),
    scope: str(payload['scope']),
    proxy: str(payload['proxy']),
    caPemUrl: str(payload['ca_pem_url']),
    items: num(capture['items']),
    lastTs: num(capture['last_ts']),
    source: str(capture['source']),
    hook: str(payload['hook'])
  }
}

export async function fetchSessionExchange(sessionId: string, exchangeId: string, signal?: AbortSignal): Promise<SessionExchangeRaw> {
  const payload = await api.get<Record<string, unknown>>(
    `/api/sessions/${encodeURIComponent(sessionKey(sessionId))}/traffic/exchange`,
    signal,
    { id: exchangeId }
  )
  return { req: str(payload['req']), resp: str(payload['resp']) }
}

/** 开始/停止本会话抓包。返回新的端点状态，调用方据此刷新。 */
export async function setSessionCapture(sessionId: string, action: 'start' | 'stop'): Promise<{ enabled: boolean }> {
  const payload = await api.post<Record<string, unknown>>(
    `/api/sessions/${encodeURIComponent(sessionKey(sessionId))}/traffic/capture`,
    { action }
  )
  return { enabled: bool(payload['enabled']) }
}

/**
 * Yak 流量来源（可选项）。
 *
 * 未配置时接口会失败或返回空数组——这两种情况都等价于"没有 Yak"，
 * 调用方不该把它渲染成红色错误：Yak 只是本地采集之外的第二来源。
 */
export async function fetchYakSources(signal?: AbortSignal): Promise<string[]> {
  const payload = await api.get<Record<string, unknown>>('/api/yak/sources', signal).catch(() => null)
  if (payload === null) return []
  const rows = Array.isArray(payload['sources']) ? payload['sources'] : []
  return rows.map((row) => str(row)).filter((name) => name !== '')
}

// ── 代理池 ─────────────────────────────────────────────────────────────────
export type NodeHealth = 'up' | 'degraded' | 'down' | 'cooldown' | 'unknown'

export interface ProxyNode {
  id: number
  name: string
  protocol: string
  server: string
  port: number
  enabled: boolean
  state: NodeHealth
  latencyMs: number
  successRate: number
  requests: number
  failures: number
  inflight: number
  egressIp: string
  source: string
  tags: string[]
  weight: number
  maxConns: number
  note: string
  viaNodeId: number
}

export interface ProxyPool {
  id: number
  name: string
  strategy: string
  mode: string
  fallback: string
  fanoutK: number
  maxConns: number
  note: string
  nodeCount: number
  healthyCount: number
  members: number[]
  checkSeconds: number
  stickyTtl: number
  healthUrl: string
}

export interface ProxyLease {
  session: string
  taskId: number
  role: string
  poolId: number
  poolName: string
  mode: string
  fallback: string
  nodeId: number
  nodeName: string
  expiresAt: string
  requests: number
  failures: number
  lastError: string
}

export interface ProxyState {
  enabled: boolean
  gateway: string
  socks: string
  engineAvailable: boolean
  engineError: string
  defaultPool: number
  pools: ProxyPool[]
  nodes: ProxyNode[]
  leases: ProxyLease[]
}

export interface ProxySubscription {
  id: number
  name: string
  url: string
  poolId: number
  intervalSeconds: number
  enabled: boolean
  lastError: string
  lastAdded: number
  lastRemoved: number
}

const HEALTH = new Set(['up', 'degraded', 'down', 'cooldown', 'unknown'])

function proxyNode(row: Record<string, unknown>): ProxyNode {
  const state = str(row['state'], 'unknown')
  return {
    id: num(row['id']),
    name: str(row['name'], `#${num(row['id'])}`),
    protocol: str(row['protocol']),
    server: str(row['server']),
    port: num(row['port']),
    enabled: bool(row['enabled']),
    state: (HEALTH.has(state) ? state : 'unknown') as NodeHealth,
    latencyMs: num(row['latency_ms']),
    successRate: num(row['success_rate'], 1),
    requests: num(row['requests']),
    failures: num(row['failures']),
    inflight: num(row['inflight']),
    egressIp: str(row['egress_ip']),
    source: str(row['source']),
    tags: Array.isArray(row['tags']) ? (row['tags'] as unknown[]).map((tag) => str(tag)) : [],
    weight: num(row['weight'], 1),
    maxConns: num(row['max_conns'], 0),
    note: str(row['note']),
    viaNodeId: num(row['via_node_id'])
  }
}

/**
 * `/api/proxy/state` 的规范化；SSE 首帧也是同一个结构，所以提到外面复用。
 * 两处各自解析就会出现「首帧刷新后 KPI 闪一下」的经典问题。
 */
export function normalizeProxyState(payload: Record<string, unknown>): ProxyState {
  const engine = (payload['engine'] ?? {}) as Record<string, unknown>
  return {
    enabled: bool(payload['enabled']),
    gateway: str(payload['gateway']),
    socks: str(payload['socks']),
    engineAvailable: bool(engine['available']),
    engineError: str(engine['error']),
    defaultPool: num(payload['default_pool']),
    pools: rowsOf<Record<string, unknown>>(payload, 'pools').map((row) => ({
      id: num(row['id']),
      name: str(row['name'], `#${num(row['id'])}`),
      strategy: str(row['strategy'], 'weighted'),
      mode: str(row['mode_default'] ?? row['mode'], 'sticky'),
      fallback: str(row['fallback'], 'block'),
      fanoutK: num(row['fanout_k'], 3),
      maxConns: num(row['max_conns']),
      note: str(row['note']),
      nodeCount: num(row['node_count']),
      healthyCount: num(row['healthy_count']),
      members: Array.isArray(row['members']) ? (row['members'] as unknown[]).map((id) => num(id)) : [],
      checkSeconds: num(row['check_interval']),
      stickyTtl: num(row['sticky_ttl']),
      healthUrl: str(row['health_url'])
    })),
    nodes: rowsOf<Record<string, unknown>>(payload, 'nodes').map(proxyNode),
    leases: rowsOf<Record<string, unknown>>(payload, 'sessions').map((row) => ({
      session: str(row['session']),
      taskId: num(row['task_id']),
      role: str(row['role']),
      poolId: num(row['pool_id']),
      poolName: str(row['pool_name']),
      mode: str(row['mode']),
      fallback: str(row['fallback']),
      nodeId: num(row['node_id']),
      nodeName: str(row['node_name']),
      expiresAt: str(row['expires_at']),
      requests: num(row['requests']),
      failures: num(row['failures']),
      lastError: str(row['last_error'])
    }))
  }
}

export async function fetchProxyState(signal?: AbortSignal): Promise<ProxyState> {
  return normalizeProxyState(await api.get<Record<string, unknown>>('/api/proxy/state', signal))
}

export async function fetchProxySubscriptions(signal?: AbortSignal): Promise<ProxySubscription[]> {
  const payload = await api.get<unknown>('/api/proxy/subscriptions', signal)
  return rowsOf<Record<string, unknown>>(payload, 'subscriptions').map((row) => ({
    id: num(row['id']),
    name: str(row['name'], `#${num(row['id'])}`),
    url: str(row['url']),
    poolId: num(row['pool_id'] ?? row['poolId']),
    intervalSeconds: num(row['interval_seconds'] ?? row['intervalSeconds'], 3600),
    enabled: bool(row['enabled']),
    lastError: str(row['last_error'] ?? row['lastError']),
    lastAdded: num(row['last_added'] ?? row['lastAdded']),
    lastRemoved: num(row['last_removed'] ?? row['lastRemoved'])
  }))
}

export interface ProxySettings {
  defaultPool: number
  listenerAuth: boolean
  fanoutBudgetPerHour: number
}

export async function fetchProxySettings(signal?: AbortSignal): Promise<ProxySettings> {
  const payload = await api.get<Record<string, unknown>>('/api/proxy/settings', signal)
  return {
    defaultPool: num(payload['default_pool']),
    listenerAuth: bool(payload['egress_listener_auth']),
    fanoutBudgetPerHour: num(payload['fanout_budget_per_hour'])
  }
}

// ── 任务 ───────────────────────────────────────────────────────────────────
export async function fetchTaskSummary(days = 30, signal?: AbortSignal): Promise<TaskSummary> {
  return api.get<TaskSummary>('/api/tasks/summary', signal, { days })
}

export async function fetchTasks(
  params: { q?: string; status?: string; page?: number; size?: number },
  signal?: AbortSignal
): Promise<TaskPage> {
  return api.get<TaskPage>('/api/tasks', signal, {
    q: params.q ?? '',
    status: params.status ?? '',
    page: params.page ?? 1,
    size: params.size ?? 20
  })
}

// ── 概览（图文指标的同源读法） ─────────────────────────────────────────────
export interface FindingStats {
  total: number
  pending: number
  critical: number
  high: number
  medium: number
  low: number
}

export async function fetchFindingStats(signal?: AbortSignal): Promise<FindingStats> {
  const payload = await api.get<Record<string, unknown>>('/api/exploration/findings/stats', signal)
  return {
    total: num(payload['total']),
    pending: num(payload['pending']),
    critical: num(payload['critical']),
    high: num(payload['high']),
    medium: num(payload['medium']),
    low: num(payload['low'])
  }
}

// ── hooks ──────────────────────────────────────────────────────────────────
const LIVE_MS = 5000

/** 流量列表；`live` 打开时按 5s 轮询（只在该页签可见时）。 */
export function useTrafficList(filter: TrafficFilter, live = false): QueryResult<TrafficList> {
  return useQuery(
    `traffic:list:${JSON.stringify(filter)}`,
    (signal) => fetchTrafficList(filter, signal),
    { ttlMs: live ? LIVE_MS : 2000, pollMs: live ? LIVE_MS : 0 }
  )
}

export function useTrafficTotals(live = true): QueryResult<TrafficTotals> {
  return useQuery('traffic:totals', fetchTrafficTotals, { ttlMs: LIVE_MS, pollMs: live ? LIVE_MS : 0 })
}

export function useTrafficHosts(): QueryResult<TrafficHostRow[]> {
  return useQuery('traffic:hosts', fetchTrafficHosts, { ttlMs: 10_000 })
}

export function useCaptureSummary(live = true): QueryResult<CaptureSummary> {
  return useQuery('traffic:capture', fetchCaptureSummary, { ttlMs: LIVE_MS, pollMs: live ? LIVE_MS : 0 })
}

export function useWebSessions(live = true): QueryResult<WebSession[]> {
  return useQuery('web:sessions', fetchWebSessions, { ttlMs: LIVE_MS, pollMs: live ? 10_000 : 0 })
}

export function useWebSession(sessionId: string | null): QueryResult<WebSessionDetail> {
  return useQuery(
    sessionId === null ? null : `web:session:${sessionId}`,
    (signal) => fetchWebSession(sessionId as string, signal),
    { ttlMs: 3000 }
  )
}

/** 会话流量窗口；`live` 打开时 3s 轮询（只在该页签可见时）。 */
export function useSessionTraffic(sessionId: string | null, live = true): QueryResult<SessionTrafficWindow> {
  return useQuery(
    sessionId === null ? null : `session:traffic:${sessionId}`,
    (signal) => fetchSessionTraffic(sessionId as string, { limit: 300 }, signal),
    { ttlMs: 3000, pollMs: live ? 3000 : 0 }
  )
}

export function useSessionEndpoint(sessionId: string | null): QueryResult<SessionEndpoint> {
  return useQuery(
    sessionId === null ? null : `session:endpoint:${sessionId}`,
    (signal) => fetchSessionEndpoint(sessionId as string, signal),
    { ttlMs: 3000, pollMs: 10_000 }
  )
}

export function useYakSources(): QueryResult<string[]> {
  return useQuery('yak:sources', fetchYakSources, { ttlMs: 60_000 })
}

export function useProxyState(live = true): QueryResult<ProxyState> {
  return useQuery('proxy:state', fetchProxyState, { ttlMs: LIVE_MS, pollMs: live ? 10_000 : 0 })
}

export function useProxySubscriptions(): QueryResult<ProxySubscription[]> {
  return useQuery('proxy:subscriptions', fetchProxySubscriptions, { ttlMs: 10_000 })
}

export function useProxySettings(): QueryResult<ProxySettings> {
  return useQuery('proxy:settings', fetchProxySettings, { ttlMs: 30_000 })
}

export function useTaskSummary(days = 30): QueryResult<TaskSummary> {
  return useQuery(`tasks:summary:${days}`, (signal) => fetchTaskSummary(days, signal), { ttlMs: 5000 })
}

export function useTasks(params: { q?: string; status?: string; page?: number; size?: number }): QueryResult<TaskPage> {
  return useQuery(`tasks:list:${JSON.stringify(params)}`, (signal) => fetchTasks(params, signal), { ttlMs: 3000 })
}

/** 概览的聚合读法：走缓存，未命中才发请求（与各页共用同一份数据）。 */
export const overviewSources = {
  summary: (): Promise<TaskSummary> =>
    ensure('tasks:summary:30', (signal) => fetchTaskSummary(30, signal), 5000),
  tasks: (): Promise<TaskPage> =>
    ensure('tasks:list:{"page":1,"size":200}', (signal) => fetchTasks({ page: 1, size: 200 }, signal), 5000),
  totals: (): Promise<TrafficTotals> => ensure('traffic:totals', fetchTrafficTotals, LIVE_MS),
  hosts: (): Promise<TrafficHostRow[]> => ensure('traffic:hosts', fetchTrafficHosts, 10_000),
  capture: (): Promise<CaptureSummary> => ensure('traffic:capture', fetchCaptureSummary, LIVE_MS),
  findings: (): Promise<FindingStats> => ensure('findings:stats', fetchFindingStats, 10_000)
}

export type { Task, TaskPage, TaskSummary }
