// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { exchange, gateOpen, PlatformError, platformOrigin } from './platform-account.js'
import type { Account } from './platform-account.js'
import type { BillingMethod, BillingOptions, BillingOrder, BillingQuote, BillingSelection, BillingStatus } from './billing-types.js'

type Fields = Record<string, unknown>
type Provider = 'epay' | 'stripe' | 'waffo' | 'waffo-pancake' | 'creem'
type Product = { id: string; name: string; price: string; currency: string }
type Method = Omit<BillingMethod, 'products'> & { provider: Provider; products?: Product[]; index?: number }
type OrderEntry = {
  selection: string
  expires: number
  result: Promise<BillingOrder>
  trade?: string
}

const record = (value: unknown): Fields => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Fields : {}
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const positiveInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0

function money(value: unknown): string {
  const raw = typeof value === 'number' ? String(value) : text(value)
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) return ''
  return Number(raw).toFixed(2)
}

function methods(config: Fields): Method[] {
  const minimum = (value: unknown): number => positiveInt(Number(value)) ? Number(value) : 1
  const gateways: Record<string, { provider: Provider; enabled: boolean }> = {
    stripe: { provider: 'stripe', enabled: config.enable_stripe_topup === true },
    waffo: { provider: 'waffo', enabled: config.enable_waffo_topup === true },
    'waffo-pancake': { provider: 'waffo-pancake', enabled: config.enable_waffo_pancake_topup === true },
    waffo_pancake: { provider: 'waffo-pancake', enabled: config.enable_waffo_pancake_topup === true }
  }
  const result: Method[] = []
  for (const value of array(config.pay_methods)) {
    const row = record(value)
    const id = text(row.type)
    const name = text(row.name)
    if (!id || !name || id === 'creem' || result.some(method => method.id === id)) continue
    const gateway = Object.hasOwn(gateways, id) ? gateways[id] : undefined
    if (gateway ? !gateway.enabled : config.enable_online_topup !== true) continue
    const provider = gateway?.provider ?? 'epay'
    const floor = provider === 'epay' ? Math.max(minimum(row.min_topup), minimum(config.min_topup))
      : minimum(row.min_topup)
    if (provider === 'waffo') {
      const channels = array(config.waffo_pay_methods)
      if (channels.length > 0) {
        channels.forEach((channel, index) => {
          const label = text(record(channel).paymentMethodName) || text(record(channel).name)
          if (label) result.push({ id: `waffo:${index}`, name: label, minimum: floor, provider, subscriptions: false, index })
        })
        if (result.some(method => method.provider === 'waffo')) continue
      }
    }
    result.push({ id, name, minimum: floor, provider, subscriptions: provider === 'epay' })
  }
  if (config.enable_creem_topup === true) {
    let values: unknown = config.creem_products
    if (typeof values === 'string') {
      try { values = JSON.parse(values) } catch { values = [] }
    }
    const products = array(values).flatMap((item) => {
      const row = record(item)
      const id = text(row.productId)
      const name = text(row.name)
      const price = money(row.price)
      const currency = text(row.currency).toUpperCase()
      return id && name && price && /^[A-Z]{3}$/.test(currency) ? [{ id, name, price, currency }] : []
    })
    if (products.length) result.push({ id: 'creem', name: 'Creem', minimum: 1, provider: 'creem', subscriptions: false, products })
  }
  return result
}

function selectionFrom(input: Fields): BillingSelection {
  const method = text(input.method)
  if (!method || method.length > 80) throw new PlatformError(400, '请选择支付渠道')
  if (input.kind === 'subscription' && positiveInt(input.plan)) return { kind: 'subscription', method, plan: input.plan }
  if (input.kind === 'topup' && positiveInt(input.amount)) {
    const product = text(input.product)
    return { kind: 'topup', method, amount: input.amount, ...(product ? { product } : {}) }
  }
  throw new PlatformError(400, '请选择有效的充值金额或订阅套餐')
}

function safeCheckoutURL(value: unknown): string {
  try {
    const url = new URL(text(value))
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href
  } catch { /* malformed gateway response */ }
  throw new PlatformError(502, '支付渠道未返回有效的收银台地址')
}

/** ZPay supports GET with the same signed parameters as its submit.php form. */
function epayCheckout(url: string, fields: Record<string, string>): BillingOrder['checkout'] {
  const target = new URL(url)
  if (!/(^|\.)(zpayz\.cn|z-pay\.cn)$/.test(target.hostname) || !target.pathname.endsWith('/submit.php')) {
    return { url, fields }
  }
  for (const [name, value] of Object.entries(fields)) target.searchParams.set(name, value)
  return { url, scanURL: target.href }
}

export function createBilling(readAccount: () => Promise<Account>) {
  const orders = new Map<string, OrderEntry>()
  const account = async (): Promise<Account> => {
    const state = await readAccount()
    if (!gateOpen(state)) throw new PlatformError(401, '请先登录希灵 AI')
    if (!state.access_token) throw new PlatformError(403, '当前账户缺少可用的访问令牌')
    return state
  }

  async function upstream(state: Account, path: string, body?: Fields, ordering = false): Promise<Fields> {
    const result = await exchange(body ? 'POST' : 'GET', platformOrigin() + path, {
      headers: { Authorization: `Bearer ${state.access_token}`, 'New-Api-User': String(state.user_id) },
      body,
      unavailable: ordering ? '未能确认订单是否创建，请先核对平台账单再重试' : '无法连接希灵 AI 支付接口'
    })
    const payload = record(result.data)
    if (result.status === 401 || result.status === 403) {
      throw new PlatformError(403, '希灵 AI 未授权此操作，请检查访问令牌的账单权限')
    }
    if (!result.ok || (payload.success !== true && payload.message !== 'success')) {
      throw new PlatformError(result.status >= 500 ? 502 : 422, '希灵 AI 未能完成请求，请检查支付配置和账户权限')
    }
    return payload
  }

  const configuration = async (state: Account) => record((await upstream(state, '/api/user/topup/info')).data)
  const plans = async (state: Account): Promise<BillingOptions['plans']> => {
    const result = await upstream(state, '/api/subscription/plans')
    return array(result.data).flatMap((item) => {
      const row = record(record(item).plan)
      const title = text(row.title)
      const price = money(row.price_amount)
      const quota = row.total_amount === 0 || positiveInt(row.total_amount) ? row.total_amount : null
      return row.enabled === true && positiveInt(row.id) && title && price
        ? [{ id: row.id, title, price: Number(price), currency: 'CNY' as const, quota }] : []
    })
  }

  async function options(): Promise<BillingOptions> {
    const state = await account()
    const config = await configuration(state)
    const available = methods(config)
    const [subscriptions, status] = available.some(method => method.subscriptions)
      ? await Promise.all([plans(state).catch(() => []), upstream(state, '/api/status').catch(() => undefined)])
      : [[], undefined]
    const settings = record(status?.data)
    const perUnit = settings.quota_per_unit
    const rate = settings.usd_exchange_rate
    const quotaScale = positiveInt(perUnit) && typeof rate === 'number' && Number.isFinite(rate) && rate > 0
      ? rate / perUnit : null
    const amounts = [...new Set(array(config.amount_options).filter(positiveInt))]
    const discounts = record(config.discount)
    return {
      amounts,
      discounts: Object.fromEntries(amounts.flatMap((amount) => {
        const ratio = discounts[amount]
        return typeof ratio === 'number' && ratio > 0 && ratio < 1 ? [[amount, ratio]] : []
      })),
      methods: available.map(({ id, name, minimum, subscriptions, products }) => ({
        id, name, minimum, subscriptions, ...(products ? { products: products.map(({ id, name }) => ({ id, name })) } : {})
      })),
      plans: subscriptions,
      quotaScale
    }
  }

  async function price(state: Account, input: BillingSelection) {
    const selected = methods(await configuration(state)).find(method => method.id === input.method)
    if (!selected) throw new PlatformError(422, '此支付渠道已停用，请重新选择')
    const { provider, index } = selected
    if (input.kind === 'subscription') {
      const plan = (await plans(state)).find(candidate => candidate.id === input.plan)
      if (!selected.subscriptions || !plan) throw new PlatformError(422, '此套餐或支付渠道当前不可用')
      return { provider, path: '/api/subscription/epay/pay', payment: { plan_id: plan.id, payment_method: selected.id },
        quote: { total: money(plan.price), currency: plan.currency } }
    }
    if (provider === 'creem') {
      const product = selected.products?.find(item => item.id === input.product)
      if (!product) throw new PlatformError(422, '请选择当前可用的充值商品')
      return { provider, path: '/api/user/creem/pay', payment: { product_id: product.id, payment_method: 'creem' },
        quote: { total: product.price, currency: product.currency } }
    }
    if (input.amount < selected.minimum) throw new PlatformError(422, `此渠道最低充值金额为 ${selected.minimum}`)
    const prefix = provider === 'epay' ? '/api/user' : `/api/user/${provider}`
    const payment = {
      amount: input.amount,
      ...(provider === 'epay' || provider === 'stripe' ? { payment_method: selected.id } : {}),
      ...(index === undefined ? {} : { pay_method_index: index })
    }
    const result = await upstream(state, prefix + '/amount', payment)
    const total = money(result.data)
    if (!total) throw new PlatformError(502, '平台返回的实付金额无效')
    return { provider, path: prefix + '/pay', payment, quote: { total, currency: provider === 'epay' ? 'CNY' : '' } }
  }

  async function order(input: Fields): Promise<BillingOrder> {
    const state = await account()
    const selection = selectionFrom(input)
    const requestID = text(input.request_id)
    const accepted = money(input.total)
    const acceptedCurrency = text(input.currency)
    if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(requestID) || !accepted) {
      throw new PlatformError(400, '请先确认实付金额')
    }
    const key = `${state.user_id}/${requestID}`
    const fingerprint = JSON.stringify([selection, accepted, acceptedCurrency])
    const now = Date.now()
    for (const [id, entry] of orders) if (entry.expires <= now) orders.delete(id)
    const existing = orders.get(key)
    if (existing) {
      if (existing.selection !== fingerprint) throw new PlatformError(409, '订单选项已变更，请重新确认')
      return existing.result
    }

    const result = (async (): Promise<BillingOrder> => {
      const current = await price(state, selection)
      if (current.quote.total !== accepted || current.quote.currency !== acceptedCurrency) {
        throw new PlatformError(409, '实付金额已变化，请重新获取报价并确认')
      }
      const upstreamOrder = await upstream(state, current.path, current.payment, true)
      const data = record(upstreamOrder.data)
      if (current.provider === 'epay') {
        const fields = Object.fromEntries(Object.entries(data).filter((entry): entry is [string, string] =>
          typeof entry[1] === 'string'))
        const trade = fields.out_trade_no ?? ''
        if (!fields.sign || !trade || money(fields.money) !== accepted) {
          throw new PlatformError(502, '收银台返回的订单信息与报价不一致')
        }
        const entry = orders.get(key)
        if (entry) entry.trade = trade
        return { checkout: epayCheckout(safeCheckoutURL(upstreamOrder.url), fields), canCheckStatus: true }
      }
      const trade = text(data.order_id)
      const entry = orders.get(key)
      if (trade && entry && selection.kind === 'topup') entry.trade = trade
      return { checkout: { url: safeCheckoutURL(data.pay_link ?? data.checkout_url ?? data.payment_url) },
        canCheckStatus: !!trade && selection.kind === 'topup' }
    })()
    orders.set(key, { selection: fingerprint, expires: now + 30 * 60_000, result })
    return result
  }

  async function status(requestID: string): Promise<{ status: BillingStatus }> {
    const state = await account()
    const entry = orders.get(`${state.user_id}/${requestID}`)
    const trade = entry?.trade
    if (!trade || entry.expires <= Date.now()) throw new PlatformError(404, '找不到此支付订单')
    const result = await upstream(state, '/api/user/topup/self?p=0&page_size=10&keyword=' + encodeURIComponent(trade))
    const row = array(record(result.data).items).map(record).find(item => item.trade_no === trade)
    return { status: row?.status === 'success' ? 'paid'
      : row?.status === 'expired' || row?.status === 'failed' ? 'closed' : 'pending' }
  }

  return { options, order, status, quote: async (input: Fields): Promise<BillingQuote> => (await price(await account(), selectionFrom(input))).quote }
}
