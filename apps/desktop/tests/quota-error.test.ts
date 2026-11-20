// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import {
  formatQuotaAmount,
  isInsufficientQuota,
  parseQuotaShortfall,
  stripFailureText
} from '@/lib/quota-error'

const RELAY_403 =
  'openai-responses: status 403: {"error":{"message":"Not enough quota to pre-consume for this request: ¥0.006750 remaining, ¥0.007596 required (request id: 202611201751338829204078268d9d6daIgPr6F)","type":"new_api_error","param":"","code":"insufficient_user_quota"}}'

describe('parseQuotaShortfall', () => {
  it('reads the remaining/required tail from a relay 403', () => {
    expect(parseQuotaShortfall(RELAY_403)).toEqual({
      currency: '¥',
      remaining: 0.00675,
      required: 0.007596
    })
  })

  it('classifies an OpenAI-style insufficient_quota without amounts', () => {
    expect(parseQuotaShortfall('insufficient_quota: You exceeded your current quota')).toEqual({
      currency: '',
      remaining: null,
      required: null
    })
  })

  it('reads a localised Chinese shortfall', () => {
    expect(
      parseQuotaShortfall('执行出错: 余额不足，剩余 ¥1.20，本次需要 ¥2.00')
    ).toEqual({ currency: '¥', remaining: 1.2, required: 2 })
  })

  it('leaves unrelated failures alone', () => {
    expect(parseQuotaShortfall('context length exceeded: 200000 > 128000')).toBeNull()
    expect(parseQuotaShortfall('429 rate limit reached for requests')).toBeNull()
    expect(parseQuotaShortfall('')).toBeNull()
    expect(parseQuotaShortfall(undefined)).toBeNull()
  })
})

describe('isInsufficientQuota', () => {
  it('matches the relay quota code', () => {
    expect(isInsufficientQuota(RELAY_403)).toBe(true)
    expect(isInsufficientQuota('余额已用完')).toBe(true)
    expect(isInsufficientQuota('permission denied')).toBe(false)
  })
})

describe('formatQuotaAmount', () => {
  it('keeps four decimals for sub-yuan balances', () => {
    expect(formatQuotaAmount('¥', 0.00675)).toBe('¥0.0068')
  })

  it('uses two decimals for normal amounts', () => {
    expect(formatQuotaAmount('¥', 12.5)).toBe('¥12.50')
    expect(formatQuotaAmount('¥', 0)).toBe('¥0.00')
  })
})

describe('stripFailureText', () => {
  it('removes only the raw error the backend also wrote as a text row', () => {
    expect(stripFailureText(`先看一下当前改动。\n\n${RELAY_403}`, RELAY_403)).toBe(
      '先看一下当前改动。'
    )
  })

  it('returns the narration unchanged when the failure text is elsewhere', () => {
    expect(stripFailureText('只写了叙述', RELAY_403)).toBe('只写了叙述')
    expect(stripFailureText(RELAY_403, '')).toBe(RELAY_403)
  })
})
