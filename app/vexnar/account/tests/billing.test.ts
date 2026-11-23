// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBilling } from '../src/billing.js'
import type { Account } from '../src/platform-account.js'

test('configured recharge quotes, reconciles signed orders and polls by trade number', async (t) => {
  const account: Account = {
    user_id: 42,
    username: 'fixture',
    display_name: 'Fixture',
    avatar_url: '',
    request_count: null,
    access_token: 'fixture-only',
    credential_version: 1,
    expires_at: Date.now() + 120_000,
    providers: []
  }
  const tradeNo = 'test-fixture-trade'
  const paymentURL = 'https://checkout.example.test/submit.php'
  let charged = '4.80'
  let upstreamOrders = 0
  let balanceStatus = 'pending'
  let paidBy = ''
  t.mock.method(globalThis, 'fetch', async (input: string, init: RequestInit) => {
    const url = new URL(input)
    const headers = new Headers(init.headers)
    assert.equal(headers.get('Authorization'), 'Bearer fixture-only')
    assert.equal(init.redirect, 'error')
    if (url.pathname === '/api/user/topup/info') {
      return Response.json({
        success: true,
        data: {
          enable_online_topup: true, enable_stripe_topup: false, min_topup: 1, amount_options: [5, 10, 5, -1],
          pay_methods: [{ name: '支付宝', type: 'alipay', min_topup: '3' }, { name: 'Stripe', type: 'stripe' }]
        }
      })
    }
    if (url.pathname === '/api/subscription/plans') {
      return Response.json({ success: true, data: [{ plan: {
        enabled: true, id: 2, price_amount: 20, currency: 'CNY', title: '开发套餐'
      } }] })
    }
    if (url.pathname === '/api/user/amount') {
      assert.equal(JSON.parse(String(init.body)).amount, 5)
      return Response.json({ message: 'success', data: charged })
    }
    if (url.pathname === '/api/user/pay' || url.pathname === '/api/subscription/epay/pay') {
      upstreamOrders++
      const body = JSON.parse(String(init.body))
      paidBy = body.payment_method
      if (url.pathname === '/api/subscription/epay/pay') assert.equal(body.plan_id, 2)
      return Response.json({ message: 'success', url: paymentURL, data: {
        out_trade_no: tradeNo, money: body.plan_id ? '20.00' : charged, sign: 'test-sign', type: 'alipay'
      } })
    }
    assert.equal(url.pathname, '/api/user/topup/self')
    assert.equal(url.searchParams.get('keyword'), tradeNo)
    return Response.json({ success: true, data: { items: [
      { trade_no: 'another-order', status: 'success' }, { trade_no: tradeNo, status: balanceStatus }
    ] } })
  })
  const billing = createBilling(async () => account)
  const config = await billing.options()
  assert.deepEqual(config.amounts, [5, 10])
  assert.deepEqual(config.methods, [{ id: 'alipay', name: '支付宝', minimum: 3, subscriptions: true }])
  assert.equal(config.plans[0]?.title, '开发套餐')

  const selection = { kind: 'topup', method: 'alipay', amount: 5 }
  await assert.rejects(() => billing.quote({ ...selection, method: 'stripe' }), { status: 422 })
  await assert.rejects(() => billing.quote({ ...selection, amount: 2 }), { status: 422 })
  const quote = await billing.quote(selection)
  assert.deepEqual(quote, { total: '4.80', currency: 'CNY' })

  charged = '4.90'
  const requestID = '12345678-1234-1234-1234-123456789012'
  await assert.rejects(() => billing.order({ ...selection, ...quote, request_id: requestID }), { status: 409 })
  assert.equal(upstreamOrders, 0)

  const secondID = '22345678-1234-1234-1234-123456789012'
  const command = { ...selection, ...await billing.quote(selection), request_id: secondID }
  const [order, duplicate] = await Promise.all([billing.order(command), billing.order(command)])
  assert.deepEqual(order, duplicate)
  assert.equal(order.checkout.url, paymentURL)
  assert.equal(order.checkout.fields?.out_trade_no, tradeNo)
  assert.equal(upstreamOrders, 1)
  assert.equal(paidBy, 'alipay')
  await assert.rejects(() => billing.order({ ...command, amount: 10 }), { status: 409 })
  assert.deepEqual(await billing.status(secondID), { status: 'pending' })
  balanceStatus = 'success'
  assert.deepEqual(await billing.status(secondID), { status: 'paid' })

  const subscription = { kind: 'subscription', method: 'alipay', plan: 2 }
  const subQuote = await billing.quote(subscription)
  assert.equal(subQuote.total, '20.00')
  await billing.order({ ...subscription, ...subQuote, request_id: '32345678-1234-1234-1234-123456789012' })
  assert.equal(upstreamOrders, 2)

  account.user_id = 43
  await assert.rejects(() => billing.status(secondID), { status: 404 })
  account.expires_at = 0
  await assert.rejects(() => billing.options(), { status: 401 })
})
