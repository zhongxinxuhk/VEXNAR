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
  /insufficient[_ ]quota/i,
  /insufficient[_ ]user[_ ]quota/i,
  /not enough quota/i,
  /exceeded your current quota/i,
  /余额不足/,
  /额度不足/,
  /余额已用完/,
  /额度已用完/
]

/** A relay amount: `¥-0.117364`, `$1.20`, `0.007596`. */
const AMOUNT = '([¥$€])?\\s*(-?[0-9]+(?:\\.[0-9]+)?)'

const EN_REMAINING = new RegExp(`${AMOUNT}\\s*remaining(?:\\s+quota)?\\b`, 'i')
const EN_REMAINING_SUFFIX = new RegExp(`remaining\\s+quota\\s*[:：]\\s*${AMOUNT}`, 'i')
const EN_AMOUNTS = new RegExp(
  `${AMOUNT}\\s*remaining\\s*,?\\s*(?:and\\s+)?${AMOUNT}\\s*required`,
  'i'
)
const ZH_AMOUNTS =
  /剩余\s*([¥$€])?\s*(-?[0-9]+(?:\.[0-9]+)?)[^\d]{0,16}?(?:需要|还需|需)\s*([¥$€])?\s*(-?[0-9]+(?:\.[0-9]+)?)/
const ZH_REMAINING = /(?:余额|剩余|额度)\s*(?:仅剩|剩余|还有)?\s*[:：]?\s*([¥$€])?\s*(-?[0-9]+(?:\.[0-9]+)?)/

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

  // NewAPI's current wording only reports what is left ("remaining quota: ¥x");
  // an account in arrears quotes a negative balance, which is still a shortfall.
  const enRemaining = raw.match(EN_REMAINING_SUFFIX) ?? raw.match(EN_REMAINING)
  if (enRemaining) {
    return {
      currency: enRemaining[1] || '',
      remaining: numberOrNull(enRemaining[2]),
      required: null
    }
  }

  const zhRemaining = raw.match(ZH_REMAINING)
  if (zhRemaining) {
    return {
      currency: zhRemaining[1] || '',
      remaining: numberOrNull(zhRemaining[2]),
      required: null
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
 * The backend appends the upstream failure as its own `text` row wrapped in
 * `（出错：…）` (server/conversations.go). The wrapper is presentation, not part
 * of the provider's answer, so drop it before the text becomes error evidence.
 */
export function unwrapFailureText(text?: string | null): string {
  let value = (text ?? '').trim()
  if (value.startsWith('（出错：')) value = value.slice('（出错：'.length)
  else if (value.startsWith('(出错：') || value.startsWith('（出错:')) value = value.slice(4)
  value = value.trim()
  if (value.endsWith('）') || value.endsWith(')')) value = value.slice(0, -1)
  return value.trim()
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

/**
 * Body of a turn whose balance ran out. The terminal `result` row only carries a
 * diagnostic summary (`无文字总结，终态 model_error…`), so it is dropped as well:
 * the notice card states the cause and keeps the upstream payload behind 错误详情.
 * Narration the model already streamed stays.
 */
export function quotaFailureBody(
  content: string,
  diagnostic?: string | null,
  error?: string | null
): string {
  return stripFailureText(stripFailureText(content, diagnostic), error)
}
