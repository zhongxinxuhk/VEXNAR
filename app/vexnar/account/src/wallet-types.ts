// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

export interface AccountWallet {
  platform: {
    quota: number | null
    amount: number | null
    currency: string
    methods: string[]
    plans: { id: number; title: string; price: number; currency: string; duration: string }[]
    subscriptions: { id: number; remaining: number | null; ends: number }[]
    url: string
    error: string
  }
  deepseek: {
    status: 'ready' | 'unconfigured' | 'unavailable'
    balances: { currency: string; total: string }[]
  }
}
