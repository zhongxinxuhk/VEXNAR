// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 第一层：Policy Gate。
 *
 * 这里是"能不能发"的唯一裁决点。所有判断都在 Engine 内部完成，**不依赖 Agent
 * 自觉**——模型说"这是授权的"不算数，策略说算才算。
 *
 * 明确不做的事（与 spec 一致）：
 *   - 不做 WAF 绕过：遇到拦截就停，换载荷/换出口/伪装客户端指纹都不在本层能力内；
 *   - 不把 403 一律当 WAF：分类在 observer 里按响应特征判定。
 */

import { z } from 'zod'

import type { PolicyConfig, RequestInput, WebTestSession } from './types.ts'

export type PolicyCode =
  | 'ADVERSARIAL_NOT_ENABLED'
  | 'ADVERSARIAL_REQUIRES_ALLOWLIST'
  | 'OUT_OF_SCOPE'
  | 'WRITE_NOT_APPROVED'
  | 'AGGRESSIVE_NOT_ALLOWED'
  | 'BUDGET_EXHAUSTED'
  | 'WINDOW_LIMIT'
  | 'SESSION_PAUSED'
  | 'SESSION_BLOCKED'
  | 'SESSION_CLOSED'
  | 'BAD_REQUEST'

export class PolicyError extends Error {
  constructor(public readonly code: PolicyCode, message: string, public readonly status = 403) {
    super(message)
    this.name = 'PolicyError'
  }
}

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function envList(name: string): string[] {
  return String(process.env[name] ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function defaultPolicy(): PolicyConfig {
  return {
    // 空数组 = 创建会话时按传入 origin 逐个授权；非空 = 只允许名单内 origin。
    allowedOrigins: envList('VEXNAR_WEB_ALLOWED_ORIGINS'),
    allowPrivateNetwork: process.env.VEXNAR_WEB_ALLOW_PRIVATE === 'on',
    maxRequestsPerSession: envInt('VEXNAR_WEB_MAX_REQUESTS', 200),
    maxRequestsPerWindow: envInt('VEXNAR_WEB_MAX_PER_WINDOW', 20),
    windowSeconds: envInt('VEXNAR_WEB_WINDOW_SECONDS', 60),
    minIntervalMs: envInt('VEXNAR_WEB_MIN_INTERVAL_MS', 800),
    maxResponseBytes: envInt('VEXNAR_WEB_MAX_RESPONSE_BYTES', 256 * 1024),
    requestTimeoutMs: envInt('VEXNAR_WEB_TIMEOUT_MS', 15_000),
    allowWrite: process.env.VEXNAR_WEB_ALLOW_WRITE === 'on',
    followRedirects: 'same-origin',
    aggressivePayloads: process.env.VEXNAR_WEB_AGGRESSIVE === 'on',
    maxRedirects: 3,
    adversarial: {
      // 平台级总闸：关着就完全不能开对抗，避免"随手一开就在生产站点上轮换身份"。
      enabled: process.env.VEXNAR_WEB_ADVERSARIAL === 'on',
      maxAttempts: envInt('VEXNAR_WEB_EVASION_MAX_ATTEMPTS', 8),
      maxRotations: envInt('VEXNAR_WEB_EVASION_MAX_ROTATIONS', 6),
      perLevel: envInt('VEXNAR_WEB_EVASION_PER_LEVEL', 2),
      jitterMs: envInt('VEXNAR_WEB_EVASION_JITTER_MS', 600)
    },
    egressMode: (() => {
      const raw = String(process.env.VEXNAR_WEB_EGRESS_MODE ?? 'on_block').toLowerCase()
      return raw === 'sticky' || raw === 'per_attempt' ? raw : 'on_block'
    })() as 'sticky' | 'on_block' | 'per_attempt'
  }
}

/**
 * 对抗模式的双开关裁决。
 *
 * 两把锁都开才放行：
 *   1. 平台级 `VEXNAR_WEB_ADVERSARIAL=on`；
 *   2. 会话级 `adversarial: true`。
 * 并且要求**存在显式 origin 白名单**——不允许对"任意站点"开对抗轮换，
 * 这是把"授权范围"从口头承诺变成配置事实的最后一道闸。
 */
export function assertAdversarialAllowed(options: {
  requested: boolean
  policy: PolicyConfig
  origin: string
}): void {
  if (!options.requested) return
  if (!options.policy.adversarial.enabled) {
    throw new PolicyError(
      'ADVERSARIAL_NOT_ENABLED',
      '对抗模式未开启：需要平台级 VEXNAR_WEB_ADVERSARIAL=on（仅限已授权的测试环境）',
      403
    )
  }
  if (!options.policy.allowedOrigins.length) {
    throw new PolicyError(
      'ADVERSARIAL_REQUIRES_ALLOWLIST',
      '对抗模式要求显式 origin 白名单（VEXNAR_WEB_ALLOWED_ORIGINS），不接受"任意站点"',
      403
    )
  }
  if (!isOriginAllowed(options.origin, options.policy)) {
    throw new PolicyError('OUT_OF_SCOPE', `目标 ${options.origin} 不在授权白名单内`, 403)
  }
}

/** origin 归一化：只允许 http/https，去掉路径与凭据，端口保持默认省略形式。 */
export function normalizeOrigin(raw: string): string {
  let url: URL
  try {
    url = new URL(String(raw).trim())
  } catch {
    throw new PolicyError('BAD_REQUEST', `origin 不是合法 URL：${raw}`, 400)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PolicyError('BAD_REQUEST', `只支持 http/https，收到 ${url.protocol}`, 400)
  }
  if (url.username || url.password) {
    throw new PolicyError('BAD_REQUEST', 'origin 不允许携带凭据', 400)
  }
  return url.origin
}

export function isOriginAllowed(origin: string, policy: PolicyConfig): boolean {
  if (!policy.allowedOrigins.length) return true
  return policy.allowedOrigins.some((allowed) => {
    if (allowed === origin) return true
    try {
      const rule = new URL(allowed.includes('://') ? allowed : `https://${allowed}`)
      return rule.origin === origin
    } catch {
      return false
    }
  })
}

const PRIVATE_V4 = [
  /^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./
]

/** 私网/回环/链路本地判定：DNS 解析结果逐个过，防 SSRF 与 DNS Rebinding。 */
export function isPrivateAddress(address: string): boolean {
  const value = String(address).trim().toLowerCase()
  if (value === '::1' || value === '::') return true
  if (value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd')) return true
  if (value.startsWith('::ffff:')) return isPrivateAddress(value.slice(7))
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value)
  if (!v4) return false
  return PRIVATE_V4.some((rule) => rule.test(value))
}

/** 写方法判定：GET/HEAD/OPTIONS 之外都算写，需要单独批准。 */
export function isWriteMethod(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())
}

export function checkSessionUsable(session: WebTestSession): void {
  if (session.status === 'closed') throw new PolicyError('SESSION_CLOSED', '会话已关闭，请新建会话', 409)
  if (session.status === 'blocked') {
    throw new PolicyError('SESSION_BLOCKED', '会话因限流/拦截被自动暂停，需人工确认后 resume', 409)
  }
  if (session.status === 'paused') throw new PolicyError('SESSION_PAUSED', '会话已暂停，请先 resume', 409)
}

/** 单次请求的策略裁决（预算与窗口计数由 Engine 传进来，避免策略层持有状态）。 */
export function checkRequest(options: {
  policy: PolicyConfig
  session: WebTestSession
  input: RequestInput
  windowCount: number
}): void {
  const { policy, session, input, windowCount } = options
  checkSessionUsable(session)
  const method = String(input.method ?? '').toUpperCase()
  if (!method) throw new PolicyError('BAD_REQUEST', 'method 不能为空', 400)

  if (isWriteMethod(method)) {
    if (!policy.allowWrite) {
      throw new PolicyError('WRITE_NOT_APPROVED', `策略未开启写操作，拒绝 ${method}`, 403)
    }
    if (input.approvedWrite !== true) {
      throw new PolicyError('WRITE_NOT_APPROVED', `${method} 需要 approvedWrite=true 显式批准`, 403)
    }
  }

  if (input.aggressive && !policy.aggressivePayloads) {
    throw new PolicyError('AGGRESSIVE_NOT_ALLOWED', '攻击性载荷未获授权（需 VEXNAR_WEB_AGGRESSIVE=on 或测试方案审批）', 403)
  }

  if (session.requestCount >= Math.min(session.requestBudget, policy.maxRequestsPerSession)) {
    throw new PolicyError('BUDGET_EXHAUSTED', `请求预算已用尽（${session.requestCount}/${Math.min(session.requestBudget, policy.maxRequestsPerSession)}）`, 429)
  }
  if (windowCount >= policy.maxRequestsPerWindow) {
    throw new PolicyError('WINDOW_LIMIT', `${policy.windowSeconds}s 窗口内已发 ${windowCount} 个请求，达到上限`, 429)
  }
}

// ── 工具参数校验（zod）：MCP 层的输入不信任，字段名用 snake_case 对齐工具面 ──
export const sessionCreateSchema = z.object({
  origin: z.string().min(1, 'origin 必填'),
  label: z.string().max(120).optional(),
  scope_id: z.string().max(120).optional(),
  request_budget: z.number().int().min(1).max(5000).optional(),
  auth_profile_id: z.string().max(120).optional(),
  auth: z.record(z.string(), z.string()).optional(),
  adversarial: z.boolean().optional(),
  session: z.string().max(160).optional()
})

export const requestExecuteSchema = z.object({
  session_id: z.string().min(1),
  method: z.enum(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  path: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().max(256 * 1024).optional(),
  approved_write: z.boolean().optional(),
  aggressive: z.boolean().optional(),
  /** 本次请求是否启用对抗升级（需会话已开对抗模式且平台级已授权）。 */
  evade: z.boolean().optional(),
  test_case_id: z.string().max(120).optional(),
  parent_request_id: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
  session: z.string().max(160).optional()
})

export const responseAnalyzeSchema = z.object({
  session_id: z.string().min(1),
  request_id: z.string().min(1),
  baseline_request_id: z.string().max(120).optional(),
  mode: z.enum(['structure', 'diff', 'auto']).default('auto'),
  session: z.string().max(160).optional()
})

export const sessionInspectSchema = z.object({
  session_id: z.string().min(1),
  include: z.enum(['history', 'stats', 'both']).default('both'),
  limit: z.number().int().min(1).max(200).optional(),
  request_id: z.string().max(120).optional(),
  session: z.string().max(160).optional()
})

export const sessionControlSchema = z.object({
  session_id: z.string().min(1),
  action: z.enum(['pause', 'resume', 'close', 'reset_budget']),
  budget: z.number().int().min(1).max(5000).optional(),
  session: z.string().max(160).optional()
})
