// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Egress（代理池）跨语言契约。
 *
 * 数据面（mihomo 协议核、SOCKS5/HTTP 网关、租约、健康探测、MITM 录制、Agent 出口注入）
 * 只能留在 Go：mihomo 是 Go 库，且这些状态与 Go 的 Agent 运行时共用同一进程。控制面
 * （页面、鉴权、审计展示）在 app 的 TS core 里。两侧唯一的耦合面就是这里的 JSON 契约：
 *
 *   - Go 在 `/api/proxy/*` 每个响应上带 `X-VEXNAR-Egress-Contract: 1`；
 *   - TS 只按本文件的 DTO 消费，不自行解释数据库或节点配置；
 *   - 契约升级只加字段（Go 侧 `egress.ContractVersion` 常量与这里保持一致）。
 */

export const PROXY_CONTRACT_VERSION = 1
export const PROXY_CONTRACT_HEADER = 'x-vexnar-egress-contract'

export type ProxyNodeState = 'unknown' | 'up' | 'degraded' | 'down' | 'cooldown'

export interface ProxyPool {
  id: number
  name: string
  strategy: string
  mode_default: 'sticky' | 'rotate' | 'fanout'
  fallback: 'block' | 'direct'
  fanout_k: number
  max_conns: number
  health_url: string
  ip_probe_url: string
  check_interval: number
  sticky_ttl: number
  note?: string
  node_count?: number
  healthy_count?: number
  node_ids?: number[] | null
  members?: number[] | null
}

export interface ProxyNodeView {
  id: number
  name: string
  protocol: string
  server: string
  port: number
  tags: string[] | null
  weight: number
  max_conns: number
  enabled: boolean
  egress_ip?: string
  note?: string
  source?: string
  config?: Record<string, unknown>
  state: ProxyNodeState
  latency_ms: number
  requests: number
  failures: number
  inflight: number
  success_rate: number
}

export interface ProxySessionSnapshot {
  session: string
  task_id: number
  role: string
  pool_id: number
  pool_name: string
  mode: string
  fallback: string
  node_id?: number
  node_name?: string
  node_ip?: string
  expires_at?: string
  requests: number
  failures: number
  last_error?: string
}

export interface ProxyState {
  enabled: boolean
  gateway: string
  socks?: string
  recordings?: number
  default_pool: number
  pools: ProxyPool[] | null
  nodes: ProxyNodeView[] | null
  sessions: ProxySessionSnapshot[] | null
}

export interface ProxyHealth {
  node_id: number
  state: ProxyNodeState
  latency_ms: number
  success_rate: number
  fail_streak: number
  checked_at: string
  cooldown_until: string
  last_error?: string
}

export interface ProxyParseIssue {
  raw?: string
  error: string
}

export interface ProxyParseResult {
  nodes:
    | {
        name: string
        protocol: string
        server: string
        port: number
        config?: Record<string, unknown>
      }[]
    | null
  issues: ProxyParseIssue[] | null
}

export interface ProxyFanoutAttempt {
  node_id: number
  node_name?: string
  egress_ip?: string
  status?: number
  verdict: 'pass' | 'block' | 'unknown'
  ms?: number
  bytes?: number
  error?: string
}

export interface ProxyFanoutResult {
  status: number
  blocked: boolean
  winner_node: number
  attempts: ProxyFanoutAttempt[] | null
  body?: string
}

export interface ProxySubscription {
  id: number
  name: string
  url: string
  pool_id: number
  tags: string[] | null
  interval_seconds: number
  enabled: boolean
  last_fetch_at: string
  last_error?: string
  last_added: number
  last_removed: number
  last_changed: number
  last_diff?: string
  created_at: string
}

export interface ProxyRefreshResult {
  added: number
  removed: number
  changed: number
  issues?: ProxyParseIssue[] | null
  diff?: { added: string[] | null; removed: string[] | null }
}

export interface TaskProxyBinding {
  task_id: number
  pool_id: number
  mode: string
  fanout_k: number
  fallback: 'block' | 'direct'
  max_conns: number
}

export interface ProxyEvent {
  type: 'node_health' | 'pools_reloaded' | 'session_revoked' | 'subscription_refreshed'
  node_id?: number
  state?: string
  pool_id?: number
  message?: string
  at: string
}

/**
 * 浏览器侧可见的端点清单。TS 只转发这些路径；未知路径直接 404，避免把 bridge
 * 变成任意路径的 Go 代理。
 */
export const PROXY_ENDPOINTS: readonly { method: string; pattern: string }[] = [
  { method: 'GET', pattern: '/api/proxy/state' },
  { method: 'GET', pattern: '/api/proxy/pools' },
  { method: 'POST', pattern: '/api/proxy/pools' },
  { method: 'PATCH', pattern: '/api/proxy/pools/:id' },
  { method: 'DELETE', pattern: '/api/proxy/pools/:id' },
  { method: 'GET', pattern: '/api/proxy/pools/:id/nodes' },
  { method: 'POST', pattern: '/api/proxy/pools/:id/nodes' },
  { method: 'DELETE', pattern: '/api/proxy/pools/:id/nodes/:nodeID' },
  { method: 'POST', pattern: '/api/proxy/pools/:id/check' },
  { method: 'GET', pattern: '/api/proxy/nodes' },
  { method: 'POST', pattern: '/api/proxy/nodes' },
  { method: 'POST', pattern: '/api/proxy/nodes/parse' },
  { method: 'POST', pattern: '/api/proxy/nodes/import' },
  { method: 'POST', pattern: '/api/proxy/nodes/batch' },
  { method: 'PATCH', pattern: '/api/proxy/nodes/:id' },
  { method: 'DELETE', pattern: '/api/proxy/nodes/:id' },
  { method: 'POST', pattern: '/api/proxy/nodes/:id/check' },
  { method: 'POST', pattern: '/api/proxy/leases/reset' },
  { method: 'PUT', pattern: '/api/proxy/default-pool' },
  { method: 'POST', pattern: '/api/proxy/fanout' },
  { method: 'GET', pattern: '/api/proxy/subscriptions' },
  { method: 'POST', pattern: '/api/proxy/subscriptions' },
  { method: 'POST', pattern: '/api/proxy/subscriptions/preview' },
  { method: 'PATCH', pattern: '/api/proxy/subscriptions/:id' },
  { method: 'DELETE', pattern: '/api/proxy/subscriptions/:id' },
  { method: 'POST', pattern: '/api/proxy/subscriptions/:id/refresh' },
  { method: 'GET', pattern: '/api/proxy/events' }
]

/** 运行时校验 `GET /api/proxy/state`，给对账/自检用；缺字段返回问题列表。 */
export function validateProxyState(value: unknown): string[] {
  const problems: string[] = []
  if (typeof value !== 'object' || value === null) return ['state 不是对象']
  const state = value as Record<string, unknown>
  for (const key of ['enabled', 'gateway', 'default_pool', 'pools', 'nodes', 'sessions']) {
    if (!(key in state)) problems.push(`缺少字段 ${key}`)
  }
  if (typeof state.enabled !== 'boolean') problems.push('enabled 不是布尔')
  if (typeof state.gateway !== 'string') problems.push('gateway 不是字符串')
  if (typeof state.default_pool !== 'number') problems.push('default_pool 不是数字')
  if (state.pools !== null && !Array.isArray(state.pools)) problems.push('pools 不是数组或 null')
  return problems
}
