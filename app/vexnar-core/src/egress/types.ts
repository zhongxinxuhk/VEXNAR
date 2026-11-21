// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/** Egress（代理池）在 TS 侧的领域类型；与 proxy-contract.ts 的 DTO 一一对应。 */

export type Mode = 'sticky' | 'rotate' | 'fanout'
export type Fallback = 'block' | 'direct'

export interface NodeConfig {
  name: string
  protocol: string
  server: string
  port: number
  /** clash proxies 条目，去掉密钥字段。 */
  config: Record<string, unknown>
  /** password / uuid / psk / private-key 等，加密存放。 */
  secrets: Record<string, string>
}

export interface StoredNode extends NodeConfig {
  id: number
  fingerprint: string
  tags: string[]
  weight: number
  maxConns: number
  enabled: boolean
  note: string
  egressIp: string
  /** '' = 手动添加；'sub:<id>' = 订阅导入。 */
  source: string
  createdAt: number
  updatedAt: number
}

export interface Pool {
  id: number
  name: string
  strategy: string
  modeDefault: Mode
  fallback: Fallback
  fanoutK: number
  maxConns: number
  healthUrl: string
  ipProbeUrl: string
  checkSeconds: number
  stickyTtl: number
  note: string
  createdAt: number
}

export interface Binding {
  taskId: number
  poolId: number
  mode: Mode
  fanoutK: number
  fallback: Fallback
  maxConns: number
}

export interface Health {
  nodeId: number
  state: 'unknown' | 'up' | 'degraded' | 'down' | 'cooldown'
  latencyMs: number
  successRate: number
  failStreak: number
  checkedAt: number
  cooldownUntil: number
  lastError: string
}

export interface Subscription {
  id: number
  name: string
  url: string
  poolId: number
  tags: string[]
  intervalSeconds: number
  enabled: boolean
  lastFetchAt: number
  lastError: string
  lastAdded: number
  lastRemoved: number
  lastChanged: number
  lastDiff: string
  createdAt: number
}

export interface SessionSpec {
  key: string
  taskId?: number
  role?: string
  poolId?: number
  mode?: Mode
  fanoutK?: number
  fallback?: Fallback
  maxConns?: number
}

export interface Endpoint {
  url: string
  session: string
  poolId: number
  poolName: string
  mode: Mode
}

export interface Lease {
  key: string
  poolId: number
  nodeId: number
  expires: number
}

export interface HealthSettings {
  /** 0 = 未配置默认池。 */
  defaultPool: number
  /** 回环出口端口是否强制代理认证（浏览器无法携带，开启后浏览器出口失效）。 */
  listenerAuth: boolean
}

export const SECRET_KEYS = new Set(['password', 'uuid', 'psk', 'private-key', 'auth-str', 'token'])
