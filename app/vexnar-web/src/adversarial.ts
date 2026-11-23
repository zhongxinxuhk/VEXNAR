// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 对抗升级阶梯（adversarial escalation）。
 *
 * 这是"遇阻怎么办"的唯一决策点。原则：
 *   1. **有界**：三个维度（载荷 / 出口 / 身份）各给固定配额，总量还有硬上限；
 *   2. **停得下来**：授权失败（401/403 无 WAF 特征）不升级——那不是 WAF，是没权限；
 *      配额耗尽一定停，绝不无限试探；
 *   3. **可解释**：每一步升级都产出一条 policy event，说明"因为什么、做了什么"；
 *   4. **不浪费**：429 优先换出口并尊重 Retry-After，而不是刷载荷（刷载荷只会加重限流）。
 *
 * 明确不做：不伪造 TLS 指纹、不模拟浏览器行为轨迹、不做"猜测式"随机探针。
 */

import type { Classification } from './types.ts'
import { nextMutation, type TamperId } from './tamper.ts'

export interface EvasionLimits {
  /** 单次逻辑请求最多尝试几次（含首次）。 */
  maxAttempts: number
  /** 最多升级几次。 */
  maxRotations: number
  /** 每个等级内允许换几个载荷。 */
  perLevel: number
  /** 升级之间的抖动上限（毫秒），降低"机器节奏"特征。 */
  jitterMs: number
}

export const DEFAULT_LIMITS: EvasionLimits = {
  maxAttempts: 8,
  maxRotations: 6,
  perLevel: 2,
  jitterMs: 600
}

export interface EvasionPlan {
  level: 0 | 1 | 2 | 3
  attemptsInLevel: number
  rotations: number
  attempts: number
  mutation: TamperId
  egressIndex: number
  identityIndex: number
}

export type EvasionAction = 'retry_payload' | 'retry_egress' | 'retry_identity' | 'stop'

export interface EvasionDecision {
  action: EvasionAction
  plan: EvasionPlan
  reason: string
  waitMs: number
}

export function initialPlan(): EvasionPlan {
  return { level: 0, attemptsInLevel: 0, rotations: 0, attempts: 0, mutation: 'none', egressIndex: 0, identityIndex: 0 }
}

function jitter(seed: number, max: number): number {
  if (max <= 0) return 0
  let x = seed || 7
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  return Math.abs(x >>> 0) % max
}

/**
 * 决定下一步。
 *
 * @param plan 当前计划（已包含本次尝试的 mutation/egress/identity）
 * @param classification 本次响应分类
 * @param limits 配额
 * @param context 可用的出口数与身份数（>=2 才值得轮换）
 * @param retryAfterMs 服务端 Retry-After（若有）
 */
export function decide(
  plan: EvasionPlan,
  classification: Classification,
  limits: EvasionLimits,
  context: { egressCount: number; identityCount: number },
  retryAfterMs = 0
): EvasionDecision {
  const stop = (reason: string): EvasionDecision => ({ action: 'stop', plan, reason, waitMs: 0 })

  if (classification !== 'waf_blocked' && classification !== 'rate_limited' && classification !== 'server_error') {
    // normal / auth_denied / unknown 都不值得升级：正常就不必；没权限换编码也没用。
    return stop(
      classification === 'auth_denied'
        ? '授权失败（无 WAF 特征），属于权限问题，不升级'
        : `分类为 ${classification}，不触发升级`
    )
  }

  if (plan.attempts >= limits.maxAttempts) return stop(`达到尝试上限 ${limits.maxAttempts}`)
  if (plan.rotations >= limits.maxRotations) return stop(`达到升级上限 ${limits.maxRotations}`)

  const next: EvasionPlan = { ...plan }
  const bump = (reason: string): EvasionDecision => ({
    action: reason.startsWith('换出口') ? 'retry_egress'
      : reason.startsWith('换身份') ? 'retry_identity'
        : 'retry_payload',
    plan: next,
    reason,
    waitMs: Math.max(retryAfterMs, jitter(plan.attempts + plan.rotations + 3, limits.jitterMs))
  })

  // 429：先换出口（换载荷对限流无效）；出口用尽再考虑换身份重开会话。
  if (classification === 'rate_limited') {
    if (context.egressCount > 1 && plan.egressIndex + 1 < context.egressCount) {
      next.egressIndex = plan.egressIndex + 1
      next.attemptsInLevel = 0
      next.rotations += 1
      next.attempts += 1
      next.mutation = nextMutation(plan.mutation, 0)
      next.level = 2
      return bump(`换出口（429 限流，出口 #${next.egressIndex + 1}）`)
    }
    if (context.identityCount > 1 && plan.identityIndex + 1 < context.identityCount) {
      next.identityIndex = plan.identityIndex + 1
      next.egressIndex = 0
      next.attemptsInLevel = 0
      next.rotations += 1
      next.attempts += 1
      next.level = 3
      return bump(`换身份（限流且出口已用尽，身份 #${next.identityIndex + 1}）`)
    }
    return stop('429 且无可轮换出口/身份，停止以免加重限流')
  }

  // WAF 拦截 / 5xx：先用载荷变异打规则覆盖，再换出口，最后换身份。
  if (plan.attemptsInLevel < limits.perLevel) {
    const mutation = nextMutation(plan.mutation, plan.attemptsInLevel)
    if (mutation !== plan.mutation) {
      next.mutation = mutation
      next.attemptsInLevel += 1
      next.rotations += 1
      next.attempts += 1
      next.level = plan.level === 0 ? 1 : plan.level
      return bump(`换载荷（mutation=${mutation}）`)
    }
  }
  if (context.egressCount > 1 && plan.egressIndex + 1 < context.egressCount) {
    next.egressIndex = plan.egressIndex + 1
    next.attemptsInLevel = 0
    next.rotations += 1
    next.attempts += 1
    next.mutation = nextMutation(plan.mutation, 0)
    next.level = 2
    return bump(`换出口（WAF 拦截，出口 #${next.egressIndex + 1}）`)
  }
  if (context.identityCount > 1 && plan.identityIndex + 1 < context.identityCount) {
    next.identityIndex = plan.identityIndex + 1
    // 换身份等于换一个"人"：出口也要从头再走一遍，否则等于用旧出口的新身份，差异不彻底。
    next.egressIndex = 0
    next.attemptsInLevel = 0
    next.rotations += 1
    next.attempts += 1
    next.level = 3
    return bump(`换身份（载荷与出口均已用尽，身份 #${next.identityIndex + 1}）`)
  }
  return stop('载荷、出口、身份配额均已用尽')
}

/** 升级动作的中文说明，用于事件与报告（对外统一口径）。 */
export function describeAction(action: EvasionAction): string {
  switch (action) {
    case 'retry_payload': return '换载荷重试'
    case 'retry_egress': return '换出口重试'
    case 'retry_identity': return '换身份重试'
    default: return '停止升级'
  }
}
