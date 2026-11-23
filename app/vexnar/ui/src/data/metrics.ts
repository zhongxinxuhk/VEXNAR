// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 派生指标：所有「比率/分布/健康度」只在这里算一次。
 *
 * 之前概览与各领域页各算各的（成功率一处按节点数平均、一处按请求数加权），
 * 于是同一个代理池在两个页面上能给出两个数。这里的规则是：
 *   - 比率一律给出分子分母，页面要展示什么自己挑，但不许重新算；
 *   - 样本范围写在字段名里（`sampleSize`），避免把「最近 100 条」说成「全部」；
 *   - 空数据返回 0 而不是 NaN，页面不必再判空。
 */
import { statusClass } from './format.ts'
import type {
  CaptureSummary,
  FindingStats,
  ProxyState,
  TrafficHostRow,
  TrafficRow,
  TrafficTotals,
  WebSession
} from './resources.ts'
import type { TaskSummary } from '../tasks/api.ts'

// ── 流量 ───────────────────────────────────────────────────────────────────
export interface TrafficDistribution {
  key: string
  label: string
  count: number
}

export interface TrafficMetrics {
  /** 采集面 + 本机 kv 的全部条数（来自 totals，不是当前页）。 */
  total: number
  local: number
  archived: number
  /** Web 测试引擎里累计的请求数（另一个库，单独计数）。 */
  web: number
  /** 去重站点数。 */
  hosts: number
  /** 当前页样本的条数：下面几个比率都只描述这批样本。 */
  sampleSize: number
  errors: number
  errorRate: number
  bytes: number
  byStatus: TrafficDistribution[]
  byMethod: TrafficDistribution[]
  topHosts: Array<{ host: string; count: number }>
  captureActive: boolean
  captureSessions: number
  lastTs: number
}

const METHOD_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const STATUS_ORDER = ['2xx', '3xx', '4xx', '5xx', 'other']

/**
 * 流量指标。
 *
 * `total/local/archived` 取 `/api/traffic` 的全量计数，`errors/bytes/byStatus`
 * 取当前样本 —— 样本范围由 `sampleSize` 明示，页面据此标注「近 N 条」。
 */
export function trafficMetrics(input: {
  totals?: TrafficTotals | undefined
  rows?: TrafficRow[] | undefined
  hosts?: TrafficHostRow[] | undefined
  webSessions?: WebSession[] | undefined
  capture?: CaptureSummary | undefined
}): TrafficMetrics {
  const rows = input.rows ?? []
  const totals = input.totals
  const hostRows = input.hosts ?? []
  const webSessions = input.webSessions ?? []

  const statusBuckets = new Map<string, number>(STATUS_ORDER.map((key) => [key, 0]))
  const methodBuckets = new Map<string, number>(METHOD_ORDER.map((key) => [key, 0]))
  let errors = 0
  let bytes = 0

  for (const row of rows) {
    const key = statusClass(row.status)
    statusBuckets.set(key, (statusBuckets.get(key) ?? 0) + 1)
    methodBuckets.set(row.method, (methodBuckets.get(row.method) ?? 0) + 1)
    if (key === '4xx' || key === '5xx') errors += 1
    bytes += row.bytes
  }

  const statusLabel: Record<string, string> = { '2xx': '2xx 成功', '3xx': '3xx 跳转', '4xx': '4xx 客户端', '5xx': '5xx 服务端', other: '无状态' }

  return {
    total: totals?.total ?? rows.length,
    local: totals?.local ?? rows.filter((row) => row.source === 'local').length,
    archived: totals?.archived ?? rows.filter((row) => row.source === 'archive').length,
    web: webSessions.reduce((sum, session) => sum + session.requestCount, 0),
    hosts: hostRows.length,
    sampleSize: rows.length,
    errors,
    errorRate: rows.length === 0 ? 0 : errors / rows.length,
    bytes,
    byStatus: STATUS_ORDER
      .map((key) => ({ key, label: statusLabel[key] ?? key, count: statusBuckets.get(key) ?? 0 }))
      .filter((row) => row.count > 0),
    byMethod: [...methodBuckets.entries()]
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({ key, label: key, count }))
      .sort((left, right) => right.count - left.count),
    topHosts: hostRows.slice(0, 8).map((row) => ({ host: row.host, count: row.count })),
    captureActive: input.capture?.active === true,
    captureSessions: input.capture?.sessions.length ?? 0,
    lastTs: input.capture?.lastTs ?? 0
  }
}

// ── 代理池 ─────────────────────────────────────────────────────────────────
export interface ProxyMetrics {
  nodes: number
  enabled: number
  up: number
  degraded: number
  down: number
  cooldown: number
  unknown: number
  /** 健康率 = 可用节点 / 已启用节点。 */
  healthRate: number
  avgLatencyMs: number
  /** 按请求数加权：与大数定律一致，避免一个新节点的 100% 拉高整体。 */
  successRate: number
  requests: number
  failures: number
  inflight: number
  pools: number
  defaultPoolName: string
  leases: number
  /** 未加入任何池的启用节点数（池覆盖率缺口）。 */
  unpooled: number
  subscriptionsDown: number
}

/**
 * 代理池指标。
 *
 * 成功率按请求数加权而不是按节点平均：一个跑过 10 次的全新节点不该和跑了
 * 5000 次的老节点同权，否则「整体成功率」会被新节点带偏。
 */
export function proxyMetrics(state: ProxyState | undefined, options: { subscriptionsDown?: number } = {}): ProxyMetrics {
  const nodes = state?.nodes ?? []
  const pools = state?.pools ?? []
  const enabledNodes = nodes.filter((node) => node.enabled)
  const bucket = (name: string): number => enabledNodes.filter((node) => node.state === name).length
  const pooled = new Set(pools.flatMap((pool) => pool.members))
  const totalRequests = enabledNodes.reduce((sum, node) => sum + node.requests, 0)
  const totalFailures = enabledNodes.reduce((sum, node) => sum + node.failures, 0)
  const latencyNodes = enabledNodes.filter((node) => node.latencyMs > 0)

  return {
    nodes: nodes.length,
    enabled: enabledNodes.length,
    up: bucket('up'),
    degraded: bucket('degraded'),
    down: bucket('down'),
    cooldown: bucket('cooldown'),
    unknown: bucket('unknown'),
    healthRate: enabledNodes.length === 0 ? 0 : bucket('up') / enabledNodes.length,
    avgLatencyMs: latencyNodes.length === 0
      ? 0
      : Math.round(latencyNodes.reduce((sum, node) => sum + node.latencyMs, 0) / latencyNodes.length),
    successRate: totalRequests === 0 ? 0 : Math.max(0, (totalRequests - totalFailures) / totalRequests),
    requests: totalRequests,
    failures: totalFailures,
    inflight: enabledNodes.reduce((sum, node) => sum + node.inflight, 0),
    pools: pools.length,
    defaultPoolName: pools.find((pool) => pool.id === state?.defaultPool)?.name ?? '',
    leases: state?.leases.length ?? 0,
    unpooled: enabledNodes.filter((node) => !pooled.has(node.id)).length,
    subscriptionsDown: options.subscriptionsDown ?? 0
  }
}

// ── 任务 ───────────────────────────────────────────────────────────────────
export interface TaskMetrics {
  total: number
  active: number
  paused: number
  done: number
  failed: number
  timeout: number
  terminal: number
  completionRate: number
  goalRate: number
  goalsMet: number
  goalsTotal: number
  inFlight: number
  tokens: number
  findings: { total: number; critical: number; high: number; medium: number; low: number }
}

export function taskMetrics(summary: TaskSummary | undefined): TaskMetrics {
  const byStatus = summary?.by_status ?? {}
  const done = summary?.done ?? Number(byStatus['done'] ?? 0)
  const failed = summary?.failed ?? Number(byStatus['failed'] ?? 0)
  const timeout = summary?.timeout ?? Number(byStatus['timeout'] ?? 0)
  const terminal = summary?.terminal ?? done + failed + timeout
  return {
    total: summary?.total ?? 0,
    active: summary?.active ?? Number(byStatus['running'] ?? 0) + Number(byStatus['queued'] ?? 0),
    paused: summary?.paused ?? Number(byStatus['paused'] ?? 0),
    done,
    failed,
    timeout,
    terminal,
    completionRate: summary?.completion_rate ?? (terminal === 0 ? 0 : done / terminal),
    goalRate: summary?.goal_rate ?? 0,
    goalsMet: summary?.goals_met ?? 0,
    goalsTotal: summary?.goals_total ?? 0,
    inFlight: summary?.in_flight ?? 0,
    tokens: summary?.tokens?.total ?? 0,
    findings: summary?.findings ?? { total: 0, critical: 0, high: 0, medium: 0, low: 0 }
  }
}

/** 严重度堆叠：概览与任务页共用同一顺序与配色语义。 */
export function severitySeries(stats: FindingStats | undefined): Array<{ key: string; label: string; value: number }> {
  const row = stats ?? { total: 0, pending: 0, critical: 0, high: 0, medium: 0, low: 0 }
  return [
    { key: 'critical', label: '严重', value: row.critical },
    { key: 'high', label: '高危', value: row.high },
    { key: 'medium', label: '中危', value: row.medium },
    { key: 'low', label: '低危', value: row.low }
  ]
}
