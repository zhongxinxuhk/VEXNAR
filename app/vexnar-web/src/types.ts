// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Web 测试域的公共类型。
 *
 * 一句话分工：**Harness 决定测什么，Engine 负责怎么发**。所以这里的每个结构都
 * 只为"受策略约束的一次 HTTP 交互"服务，不描述任何抓包概念。
 */

export type SessionStatus = 'active' | 'paused' | 'blocked' | 'closed'

/** 响应分类：决定是否继续、是否熔断。 */
export type Classification =
  | 'normal'
  | 'auth_denied'
  | 'rate_limited'
  | 'waf_blocked'
  | 'server_error'
  | 'unknown'

/** 对抗模式配额：平台级开总闸，会话级再开一次，两把都开才生效。 */
export interface AdversarialPolicy {
  enabled: boolean
  maxAttempts: number
  maxRotations: number
  perLevel: number
  jitterMs: number
}

export interface WebTestSession {
  sessionId: string
  /** 该会话是否开启对抗模式（升级载荷/出口/身份）。 */
  adversarial: boolean
  scopeId: string
  /** 已授权 origin（scheme://host:port），会话内所有请求都必须落在它下面。 */
  origin: string
  label: string
  authProfileId: string
  status: SessionStatus
  requestCount: number
  requestBudget: number
  createdAt: number
  updatedAt: number
  lastRequestAt: number
  meta: Record<string, unknown>
}

/** 策略：所有字段都有默认值，会话创建时快照一份，之后可收紧不可放宽。 */
export interface PolicyConfig {
  /** 允许的目标 origin 白名单；空表示"创建会话时逐个授权"。 */
  allowedOrigins: string[]
  /** 是否允许访问私网/回环地址（默认 false，防 SSRF）。 */
  allowPrivateNetwork: boolean
  maxRequestsPerSession: number
  maxRequestsPerWindow: number
  windowSeconds: number
  /** 两次请求之间的最小间隔（毫秒）。 */
  minIntervalMs: number
  maxResponseBytes: number
  requestTimeoutMs: number
  /** 是否允许写方法（POST/PUT/PATCH/DELETE）；即使为 true，单次仍需 approvedWrite。 */
  allowWrite: boolean
  /** 重定向策略：never = 不跟随；same-origin = 只跟同源，且逐跳复查范围。 */
  followRedirects: 'never' | 'same-origin'
  /** 是否允许攻击性载荷（注入/穿越类参数）。 */
  aggressivePayloads: boolean
  maxRedirects: number
  adversarial: AdversarialPolicy
  egressMode: 'sticky' | 'on_block' | 'per_attempt'
}

export interface SessionCreateInput {
  origin: string
  label?: string
  scopeId?: string
  requestBudget?: number
  authProfileId?: string
  /** 显式身份头（Bearer/Cookie 等）。写进 Vault，不回显、不进对话记录。 */
  auth?: Record<string, string>
  /** 是否开启对抗模式（需平台级 VEXNAR_WEB_ADVERSARIAL=on 且存在 origin 白名单）。 */
  adversarial?: boolean
}

export interface RequestInput {
  method: string
  /** 相对路径或同源绝对 URL。跨源一律拒绝。 */
  path: string
  headers?: Record<string, string>
  body?: string
  /** 写方法必须显式置 true，否则拒绝。 */
  approvedWrite?: boolean
  testCaseId?: string
  parentRequestId?: string
  note?: string
  /** 该请求是否属于攻击性测试（需要策略 aggressivePayloads=true）。 */
  aggressive?: boolean
  /** 本次是否启用对抗升级（需会话已开对抗模式）。 */
  evade?: boolean
}

export interface EvidenceRef {
  ref: string
  kind: 'request' | 'response' | 'extract'
  hash: string
  bytes: number
  stored: boolean
  truncated: boolean
}

/** 一条可回溯的交互记录（脱敏后）。对应 spec 的 HttpExchangeRecord。 */
export interface HttpExchangeRecord {
  sessionId: string
  testCaseId: string
  requestId: string
  parentRequestId?: string
  sequence: number
  /** 同一逻辑请求的第几次尝试（1 = 首次）。 */
  attempt: number
  /** 本次尝试使用的载荷变异 id。 */
  mutation: string
  /** 本次尝试使用的出口 id / 身份 id（审计与对比用）。 */
  egressId: string
  identityId: string
  method: string
  /** 已脱敏：敏感查询参数值替换为 ***。 */
  url: string
  path: string
  status: number
  classification: Classification
  durationMs: number
  requestHeaders: Record<string, string>
  requestBodyHash?: string
  requestBytes: number
  responseHeaders: Record<string, string>
  responseBodyHash?: string
  responseBytes: number
  contentType: string
  truncated: boolean
  title: string
  deduplicated: boolean
  timestamp: number
  note: string
  evidence: EvidenceRef[]
}

/** 引擎执行一次请求后的对外结果（Agent 看到的就是这个）。 */
export interface ExchangeOutcome {
  record: HttpExchangeRecord
  /** 本次逻辑请求一共尝试了几次（含首次）。 */
  attempts: number
  /** 对抗升级轨迹：仅开启对抗模式时出现。 */
  evasion?: {
    rotations: number
    actions: string[]
    stoppedReason: string
  }
  /** 脱敏后的响应片段（限长），足够判断业务语义，不搬整页。 */
  excerpt: string
  /** 结构化摘要：表单/链接/JSON 顶层键/是否含挑战页标记。 */
  signals: ResponseSignals
  budgetLeft: number
  paused: boolean
}

export interface ResponseSignals {
  contentType: string
  title: string
  forms: number
  links: number
  scripts: number
  jsonKeys: string[]
  wafMarkers: string[]
  serverTech: string[]
  setCookieNames: string[]
  redirectTo: string
}

export interface AnalyzeResult {
  requestId: string
  mode: 'structure' | 'diff'
  structure?: StructureSummary
  diff?: ExchangeDiff
  excerpt: string
}

export interface StructureSummary {
  title: string
  forms: Array<{ action: string; method: string; inputs: Array<{ name: string; type: string; hasValue: boolean }> }>
  links: Array<{ href: string; text: string }>
  scripts: string[]
  jsonKeys: string[]
  comments: string[]
}

export interface ExchangeDiff {
  baseline: string
  candidate: string
  statusChanged: boolean
  status: { from: number; to: number }
  lengthDelta: number
  bodyChanged: boolean
  headerChanges: Array<{ name: string; from: string; to: string }>
  /** 候选响应里是否出现了基线中的某个标记（回显判定用）。 */
  reflected: boolean
  /** 分类变化，如 normal → waf_blocked。 */
  classification: { from: Classification; to: Classification }
}

export interface VaultBundle {
  sessionId: string
  cookies: unknown
  secrets: Record<string, string>
  updatedAt: number
}
