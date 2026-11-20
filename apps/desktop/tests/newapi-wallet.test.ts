// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import {
  buildPaymentSession,
  parseHostedCheckoutUrl,
  parsePaymentTarget,
  parseRedeemResult,
  parseSubscriptionPlans,
  parseSubscriptionSelf,
  parseTopupInfo,
  parseTopupQuote
} from '../src/main/newapi-wallet'

describe('wallet topup info', () => {
  it('normalizes pay methods, presets and discounts', () => {
    const info = parseTopupInfo({
      success: true,
      data: {
        enable_online_topup: true,
        enable_redemption: true,
        payment_compliance_confirmed: true,
        min_topup: 5,
        amount_options: [10, 20, '50', 0],
        discount: '{"10":0.9,"20":1,"bad":0.5}',
        pay_methods:
          '[{"name":"支付宝","type":"alipay","min_topup":"5"},{"name":"","type":"x"}]'
      }
    })

    expect(info.onlineEnabled).toBe(true)
    expect(info.redemptionEnabled).toBe(true)
    expect(info.minTopup).toBe(5)
    expect(info.amountOptions).toEqual([10, 20, 50])
    expect(info.discount).toEqual({ '10': 0.9, '20': 1 })
    expect(info.methods).toEqual([
      { name: '支付宝', type: 'alipay', icon: '', minTopup: 5 }
    ])
  })

  it('surfaces backend failures', () => {
    expect(() =>
      parseTopupInfo({ success: false, message: '支付合规未确认' })
    ).toThrow('支付合规未确认')
  })
})

describe('subscription plans', () => {
  it('unwraps plan envelopes, skips disabled plans and sorts by price', () => {
    const plans = parseSubscriptionPlans({
      success: true,
      data: [
        {
          plan: {
            id: 2,
            title: '高级版',
            price_amount: 99,
            currency: 'CNY',
            duration_unit: 'year',
            duration_value: 1,
            total_amount: 9000000,
            quota_reset_period: 'monthly',
            allow_balance_pay: false
          }
        },
        {
          plan: {
            id: 1,
            title: '标准版',
            price_amount: 19,
            duration_unit: 'month'
          }
        },
        { plan: { id: 3, title: '已下架', enabled: false } }
      ]
    })

    expect(plans.map((plan) => plan.id)).toEqual([1, 2])
    expect(plans[1]).toMatchObject({
      title: '高级版',
      currency: 'CNY',
      durationUnit: 'year',
      totalAmount: 9000000,
      quotaResetPeriod: 'monthly',
      allowBalancePay: false
    })
  })

  it('returns no plans when the platform did not enable subscriptions', () => {
    expect(parseSubscriptionPlans({ success: true, data: [] })).toEqual([])
  })
})

describe('active subscriptions', () => {
  it('unwraps active subscription envelopes and normalizes quota fields', () => {
    expect(
      parseSubscriptionSelf({
        success: true,
        data: {
          subscriptions: [
            {
              subscription: {
                id: 7,
                plan_id: 2,
                amount_total: 8000000,
                amount_used: 1200000,
                status: 'active',
                upgrade_group: 'pro',
                end_time: 1800000000
              }
            },
            { subscription: { id: 8, plan_id: 3, status: 'expired' } },
            { subscription: { id: 0, plan_id: 0 } }
          ]
        }
      })
    ).toEqual([
      {
        id: 7,
        planId: 2,
        amountTotal: 8000000,
        amountUsed: 1200000,
        status: 'active',
        upgradeGroup: 'pro',
        endTime: 1800000000
      }
    ])
  })

  it('returns an empty list when subscriptions are unavailable', () => {
    expect(parseSubscriptionSelf({ success: true, data: {} })).toEqual([])
    expect(parseSubscriptionSelf({ success: false, message: 'forbidden' })).toEqual([])
  })
})

describe('payment target', () => {
  it('keeps the cashier URL and form fields as strings', () => {
    const target = parsePaymentTarget({
      message: 'success',
      url: 'https://pay.example.com/submit',
      data: { pid: '1001', money: 9.9, sign: 'abc' }
    })
    expect(target.url).toBe('https://pay.example.com/submit')
    expect(target.params).toEqual({ pid: '1001', money: '9.9', sign: 'abc' })
  })

  it('throws the platform message when no cashier URL is returned', () => {
    expect(() => parsePaymentTarget({ message: '支付未配置' })).toThrow('支付未配置')
  })

  it('reads hosted checkout links for Stripe-style payments', () => {
    expect(
      parseHostedCheckoutUrl({ success: true, data: { pay_link: 'https://pay.stripe.com/x' } })
    ).toBe('https://pay.stripe.com/x')
    expect(
      parseHostedCheckoutUrl({ success: true, data: { checkout_url: 'https://pancake/x' } })
    ).toBe('https://pancake/x')
    expect(() => parseHostedCheckoutUrl({ success: false, message: '未配置' })).toThrow('未配置')
  })
})

describe('qr payment session', () => {
  it('builds a scannable GET url and exposes order metadata', () => {
    const target = parsePaymentTarget({
      url: 'https://zpayz.cn/submit.php',
      data: {
        pid: '20220726190052',
        money: '9.90',
        out_trade_no: 'VEX202611210001',
        sign: 'abc',
        sign_type: 'MD5'
      }
    })
    const session = buildPaymentSession(target, { amount: 10, method: 'alipay' })
    expect(session.status).toBe('qr')
    expect(session.amount).toBe(9.9)
    expect(session.orderId).toBe('VEX202611210001')
    expect(session.merchantId).toBe('20220726190052')
    expect(session.paymentUrl).toContain('https://zpayz.cn/submit.php?')
    expect(session.paymentUrl).toContain('out_trade_no=VEX202611210001')
    expect(session.paymentUrl).toContain('sign=abc')
    expect(session.expiresAt).toBeGreaterThan(Date.now())
  })
})

describe('redeem and quote', () => {
  it('reads credited quota from the redemption response', () => {
    expect(parseRedeemResult({ success: true, data: 500000 })).toBe(500000)
    expect(() => parseRedeemResult({ success: false, message: '兑换码无效' })).toThrow(
      '兑换码无效'
    )
  })

  it('parses the payable amount as a number', () => {
    expect(parseTopupQuote({ message: 'success', data: '9.00' })).toBe(9)
    expect(() => parseTopupQuote({ data: 'abc' })).toThrow('金额计算失败')
  })
})