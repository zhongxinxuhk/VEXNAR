// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

export interface BillingMethod {
  id: string
  name: string
  minimum: number
  subscriptions: boolean
  products?: { id: string; name: string }[]
}

export interface BillingOptions {
  amounts: number[]
  methods: BillingMethod[]
  plans: { id: number; title: string; price: number; currency: string }[]
}

export type BillingSelection =
  | { kind: 'topup'; method: string; amount: number; product?: string }
  | { kind: 'subscription'; method: string; plan: number }

export interface BillingQuote {
  total: string
  currency: string
}

export interface BillingOrder {
  checkout: { url: string; fields?: Record<string, string> }
  canCheckStatus: boolean
}

export type BillingStatus = 'pending' | 'paid' | 'closed'
