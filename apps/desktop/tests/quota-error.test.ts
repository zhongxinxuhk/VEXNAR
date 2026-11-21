// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import {
  formatQuotaAmount,
  isInsufficientQuota,
  parseQuotaShortfall,
  quotaFailureBody,
  stripFailureText,
  unwrapFailureText
} from '@/lib/quota-error'

const RELAY_403 =
  'openai-responses: status 403: {"error":{"message":"Not enough quota to pre-consume for this request: ¥0.006750 remaining, ¥0.007596 required (request id: 202611201751338829204078268d9d6daIgPr6F)","type":"new_api_error","param":"","code":"insufficient_user_quota"}}'

// The wording the relay currently sends from this workspace (an account in
// arrears): only the remaining quota is quoted, and it is negative.
const RELAY_403_ARREARS =
  'openai-responses: status 403: {"error":{"message":"Insufficient user quota, remaining quota: ¥-0.117364 (request id: 202611210810093003724528268d9d6DDwg8PhK)","type":"new_api_error","param":"","code":"insufficient_user_quota"}}'

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

  it('reads a remaining-only rejection, including a negative balance', () => {
    expect(parseQuotaShortfall(RELAY_403_ARREARS)).toEqual({
      currency: '¥',
      remaining: -0.117364,
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

describe('unwrapFailureText', () => {
  it('drops the wrapper the backend puts around an appended failure row', () => {
    expect(unwrapFailureText(`（出错：${RELAY_403_ARREARS}）`)).toBe(RELAY_403_ARREARS)
    expect(unwrapFailureText(RELAY_403_ARREARS)).toBe(RELAY_403_ARREARS)
    expect(unwrapFailureText('')).toBe('')
  })
})

describe('quotaFailureBody', () => {
  const terminal =
    '（无文字总结，终态 model_error：模型或 API 调用失败（网络、鉴权、限流、供应商 5xx 等）…）\n\n- **底层错误**: `' +
    RELAY_403_ARREARS +
    '`'

  it('drops the terminal diagnostic of a turn that never narrated anything', () => {
    expect(quotaFailureBody(terminal, terminal, terminal)).toBe('')
  })

  it('keeps narration the model had already streamed', () => {
    expect(quotaFailureBody(`我先看一下目录。\n\n${RELAY_403_ARREARS}`, terminal, RELAY_403_ARREARS)).toBe(
      '我先看一下目录。'
    )
  })
})
