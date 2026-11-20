// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Recognise the relay's "out of balance" rejection.
 *
 * The Go backend forwards the upstream provider error verbatim
 * (`openai-responses: status 403: {"code":"insufficient_user_quota",…}`), so the
 * app only classifies the message; it never re-runs the turn locally. When the
 * rejection carries the relay's `¥x remaining, ¥y required` tail we surface the
 * numbers, which is what makes the notice useful instead of a raw JSON dump.
 */

export type QuotaShortfall = {
  /** Currency symbol printed by the relay; empty when it could not be read. */
  currency: string
  remaining: number | null
  required: number | null
}

const SIGNALS: RegExp[] = [
  /insufficient_user_quota/i,
  /insufficient_quota/i,
  /not enough quota/i,
  /exceeded your current quota/i,
  /余额不足/,
  /额度不足/,
  /余额已用完/,
  /额度已用完/
]

const EN_AMOUNTS =
  /([¥$€])?\s*([0-9]+(?:\.[0-9]+)?)\s*remaining\s*,?\s*(?:and\s+)?([¥$€])?\s*([0-9]+(?:\.[0-9]+)?)\s*required/i
const ZH_AMOUNTS =
  /剩余\s*([¥$€])?\s*([0-9]+(?:\.[0-9]+)?)[^\d]{0,16}?(?:需要|还需|需)\s*([¥$€])?\s*([0-9]+(?:\.[0-9]+)?)/

function numberOrNull(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** True when the text is an upstream "account is out of balance/plan quota" rejection. */
export function isInsufficientQuota(text?: string | null): boolean {
  if (!text) return false
  return SIGNALS.some((pattern) => pattern.test(text))
}

/**
 * Classify a failed-turn message. Returns null for every other error (context
 * overflow, rate limit on a healthy balance, tool failure, …) so callers can
 * keep their generic error UI.
 */
export function parseQuotaShortfall(text?: string | null): QuotaShortfall | null {
  if (!isInsufficientQuota(text)) return null
  const raw = text ?? ''

  const en = raw.match(EN_AMOUNTS)
  if (en) {
    return {
      currency: en[1] || en[3] || '',
      remaining: numberOrNull(en[2]),
      required: numberOrNull(en[4])
    }
  }

  const zh = raw.match(ZH_AMOUNTS)
  if (zh) {
    return {
      currency: zh[1] || zh[3] || '',
      remaining: numberOrNull(zh[2]),
      required: numberOrNull(zh[4])
    }
  }

  return { currency: '', remaining: null, required: null }
}

/**
 * Money on the relay is quoted in CNY with up to six decimals; tiny balances
 * read better as ¥0.0068 than as ¥0.01, so keep four decimals below one yuan.
 */
export function formatQuotaAmount(currency: string, value: number): string {
  const decimals = value !== 0 && Math.abs(value) < 1 ? 4 : 2
  const body = value.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
  return `${currency}${body}`
}

/**
 * The backend also appends the failure as a `text` row, so a turn that streamed
 * narration ends up with `narration + raw error`. Drop just the error segment:
 * the notice card already explains it and offers the details disclosure.
 */
export function stripFailureText(content: string, error?: string | null): string {
  const text = content ?? ''
  const needle = (error ?? '').trim()
  if (!needle) return text.trim()
  const index = text.indexOf(needle)
  if (index < 0) return text.trim()
  return `${text.slice(0, index)}${text.slice(index + needle.length)}`.trim()
}
