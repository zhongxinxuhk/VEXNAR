// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type {
  NewApiPaymentResult,
  NewApiPlan,
  NewApiSubscription,
  NewApiTopupInfo,
  NewApiTopupMethod
} from '@shared/contracts'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null
}

/** 服务端部分版本把数组/对象字段序列化成了 JSON 字符串。 */
function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function asObject(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonRecord
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as JsonRecord)
        : {}
    } catch {
      return {}
    }
  }
  return {}
}

function finiteNumber(value: unknown, fallback = 0): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function positiveNumbers(value: unknown): number[] {
  return asArray(value)
    .map((item) => finiteNumber(item))
    .filter((item) => item > 0)
}

function parseMethods(value: unknown): NewApiTopupMethod[] {
  return asArray(value)
    .map((item) => asRecord(item))
    .filter((item): item is JsonRecord => Boolean(item))
    .map((item) => ({
      name: String(item.name ?? '').trim(),
      type: String(item.type ?? '').trim(),
      icon: String(item.icon ?? '').trim(),
      minTopup: Math.max(0, finiteNumber(item.min_topup))
    }))
    .filter((item) => item.name && item.type)
}

function parseDiscount(value: unknown): Record<string, number> {
  const record = asObject(value)
  const result: Record<string, number> = {}
  for (const [key, raw] of Object.entries(record)) {
    const amount = Number(key)
    const rate = Number(raw)
    if (!Number.isFinite(amount) || amount <= 0) continue
    if (!Number.isFinite(rate) || rate <= 0) continue
    result[String(amount)] = rate
  }
  return result
}

/** /api/subscription/self → 当前生效的订阅额度。 */
export function parseSubscriptionSelf(payload: unknown): NewApiSubscription[] {
  const root = asRecord(payload)
  if (!root || root.success === false) return []
  const data = asObject(root.data)
  const subscriptions: NewApiSubscription[] = []
  for (const item of asArray(data.subscriptions)) {
    const wrapper = asRecord(item)
    if (!wrapper) continue
    const subscription = asRecord(wrapper.subscription) ?? wrapper
    const status = String(subscription.status ?? '').trim()
    if (status && status !== 'active') continue
    const id = Math.trunc(finiteNumber(subscription.id))
    const planId = Math.trunc(finiteNumber(subscription.plan_id))
    if (id <= 0 && planId <= 0) continue
    subscriptions.push({
      id,
      planId,
      amountTotal: Math.max(0, finiteNumber(subscription.amount_total)),
      amountUsed: Math.max(0, finiteNumber(subscription.amount_used)),
      status,
      upgradeGroup: String(subscription.upgrade_group ?? '').trim(),
      endTime: Math.max(0, finiteNumber(subscription.end_time))
    })
  }
  return subscriptions
}

/** /api/user/topup/info → 归一化充值配置。 */
export function parseTopupInfo(payload: unknown): NewApiTopupInfo {
  const root = asRecord(payload)
  if (!root) throw new Error('充值配置为空')
  if (root.success === false) {
    throw new Error(String(root.message ?? '无法读取充值配置'))
  }
  const data = asRecord(root.data) ?? root
  return {
    onlineEnabled: data.enable_online_topup === true,
    redemptionEnabled: data.enable_redemption !== false,
    complianceConfirmed: data.payment_compliance_confirmed !== false,
    minTopup: Math.max(1, finiteNumber(data.min_topup, 1)),
    amountOptions: positiveNumbers(data.amount_options),
    discount: parseDiscount(data.discount),
    methods: parseMethods(data.pay_methods)
  }
}

/** /api/subscription/plans → 可购买的套餐列表。 */
export function parseSubscriptionPlans(payload: unknown): NewApiPlan[] {
  const root = asRecord(payload)
  if (!root) return []
  if (root.success === false) {
    throw new Error(String(root.message ?? '无法读取订阅套餐'))
  }
  const items = Array.isArray(root.data) ? root.data : []
  const plans: NewApiPlan[] = []
  for (const item of items) {
    const wrapper = asRecord(item)
    if (!wrapper) continue
    const plan = asRecord(wrapper.plan) ?? wrapper
    const id = Math.trunc(finiteNumber(plan.id))
    const title = String(plan.title ?? '').trim()
    if (id <= 0 || !title) continue
    if (plan.enabled === false) continue
    plans.push({
      id,
      title,
      subtitle: String(plan.subtitle ?? '').trim(),
      priceAmount: Math.max(0, finiteNumber(plan.price_amount)),
      currency: String(plan.currency ?? 'CNY').trim() || 'CNY',
      durationUnit: String(plan.duration_unit ?? 'month').trim() || 'month',
      durationValue: Math.max(1, Math.trunc(finiteNumber(plan.duration_value, 1))),
      totalAmount: Math.max(0, finiteNumber(plan.total_amount)),
      quotaResetPeriod: String(plan.quota_reset_period ?? 'never').trim() || 'never',
      allowBalancePay: plan.allow_balance_pay !== false,
      upgradeGroup: String(plan.upgrade_group ?? '').trim()
    })
  }
  return plans.sort((a, b) => a.priceAmount - b.priceAmount)
}

export type PaymentTarget = {
  url: string
  params: Record<string, string>
}

/** 把表单参数拼成可直接扫码打开的 GET 收银台地址（ePay / ZPay 均支持 GET）。 */
export function paymentUrl(url: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString()
  try {
    const target = new URL(url)
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value)
    return target.toString()
  } catch {
    if (!query) return url
    return `${url}${url.includes('?') ? '&' : '?'}${query}`
  }
}

/**
 * 把 ePay 下单结果归一化成应用内二维码支付会话。
 *
 * 扫码打开的是平台后端生成的已签名收银台地址；ZPay/ePay 的异步通知由平台服务端接收并
 * 入账。桌面端不持有商户密钥、不伪造回调，只负责展示二维码和轮询账户结果。
 */
export function buildPaymentSession(
  target: PaymentTarget,
  fallback: { amount: number; method: string; currency?: string }
): NewApiPaymentResult {
  const params = target.params
  const amount = Number(params.money ?? params.amount)
  return {
    status: 'qr',
    amount: Number.isFinite(amount) && amount > 0 ? amount : fallback.amount,
    currency: fallback.currency ?? 'CNY',
    method: fallback.method,
    orderId: String(params.out_trade_no ?? params.trade_no ?? ''),
    merchantId: String(params.pid ?? params.mch_id ?? ''),
    paymentUrl: paymentUrl(target.url, params),
    expiresAt: Date.now() + 5 * 60 * 1000
  }
}

/** /api/user/pay 与 /api/subscription/epay/pay：返回需要 POST 的收银台地址和表单参数。 */
export function parsePaymentTarget(payload: unknown): PaymentTarget {
  const root = asRecord(payload)
  if (!root) throw new Error('支付接口返回为空')
  const url = String(root.url ?? '').trim()
  if (root.success === false || !url) {
    throw new Error(String(root.message ?? '未能创建支付订单'))
  }
  const params: Record<string, string> = {}
  const raw = asObject(root.data)
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) continue
    if (typeof value === 'object') continue
    params[key] = String(value)
  }
  return { url, params }
}

/** Stripe / Waffo Pancake 等托管收银台：返回可直接在外部浏览器打开的链接。 */
export function parseHostedCheckoutUrl(payload: unknown): string {
  const root = asRecord(payload)
  if (!root) throw new Error('支付接口返回为空')
  const data = asObject(root.data)
  const url = String(data.pay_link ?? data.checkout_url ?? root.url ?? '').trim()
  if (root.success === false || !url) {
    throw new Error(String(root.message ?? '未能创建支付订单'))
  }
  return url
}

/** /api/user/topup 兑换码：成功时 data 为到账额度（平台额度单位）。 */
export function parseRedeemResult(payload: unknown): number {
  const root = asRecord(payload)
  if (!root) throw new Error('兑换接口返回为空')
  if (root.success === false) {
    throw new Error(String(root.message ?? '兑换失败'))
  }
  return Math.max(0, finiteNumber(root.data))
}

/** /api/user/amount：返回该充值额度的实际应付金额。 */
export function parseTopupQuote(payload: unknown): number {
  const root = asRecord(payload)
  if (!root) throw new Error('金额计算失败')
  if (root.success === false) {
    throw new Error(String(root.message ?? '金额计算失败'))
  }
  const value = finiteNumber(root.data, Number.NaN)
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(String(root.message ?? '金额计算失败'))
  }
  return value
}