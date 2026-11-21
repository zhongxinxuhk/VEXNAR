// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { ChevronDown, CircleAlert, RotateCw, Sparkles, Wallet } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { formatQuotaAmount, parseQuotaShortfall } from '@/lib/quota-error'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'
import { Button } from '@/components/ui'

/**
 * Inline "out of balance" notice for a failed turn.
 *
 * Replaces the raw `403 insufficient_user_quota` payload with a short
 * explanation and two deep links into the wallet dialog: top-up (余额充值) and
 * subscription (订阅套餐). The raw text stays available behind 错误详情 so the
 * failure is still diagnosable without shouting JSON at the operator.
 */
export function QuotaNotice({
  error,
  onRetry,
  retrying
}: {
  error: string
  onRetry?: () => void
  retrying?: boolean
}): React.JSX.Element {
  const t = useT()
  const openWallet = useAppStore((state) => state.openWallet)
  const [showDetails, setShowDetails] = useState(false)
  const shortfall = parseQuotaShortfall(error)
  const remaining =
    shortfall && shortfall.remaining !== null
      ? formatQuotaAmount(shortfall.currency, shortfall.remaining)
      : null
  const required =
    shortfall && shortfall.required !== null
      ? formatQuotaAmount(shortfall.currency, shortfall.required)
      : null
  const body =
    remaining && required
      ? t('quota.exhausted.body', { remaining, required })
      : remaining
        ? t('quota.exhausted.bodyRemaining', { remaining })
        : t('quota.exhausted.bodyPlain')

  return (
    <div
      data-testid="quota-notice"
      className="mt-3 overflow-hidden rounded-2xl border border-line bg-panel/45"
    >
      <div className="flex gap-3 px-4 py-3.5">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-warn/12 text-warn">
          <CircleAlert className="size-[15px]" strokeWidth={1.9} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13px] font-semibold leading-5 text-ink">
              {t('quota.exhausted.title')}
            </h3>
            {remaining ? (
              <span className="rounded-full border border-line-soft bg-bg px-2 py-px text-[10px] tabular-nums text-muted">
                {t('quota.exhausted.remaining')} {remaining}
              </span>
            ) : null}
          </div>
          <p className="mt-1 max-w-[560px] text-[12px] leading-[1.7] text-muted">{body}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5 px-3 text-[11.5px]"
              onClick={() => openWallet('topup')}
            >
              <Wallet className="size-3.5" strokeWidth={1.9} />
              {t('quota.exhausted.topup')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="gap-1.5 px-3 text-[11.5px]"
              onClick={() => openWallet('plans')}
            >
              <Sparkles className="size-3.5" strokeWidth={1.9} />
              {t('quota.exhausted.upgrade')}
            </Button>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                disabled={retrying}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-muted transition-colors hover:bg-panel-2 hover:text-ink disabled:opacity-50"
              >
                <RotateCw className={cn('size-3', retrying && 'animate-spin')} strokeWidth={1.9} />
                {t('quota.exhausted.retry')}
              </button>
            ) : null}
            <button
              type="button"
              aria-expanded={showDetails}
              onClick={() => setShowDetails((value) => !value)}
              className="ml-auto inline-flex items-center gap-0.5 text-[10.5px] text-muted/80 transition-colors hover:text-ink"
            >
              {showDetails ? t('quota.exhausted.hideDetails') : t('quota.exhausted.details')}
              <ChevronDown
                className={cn('size-3 transition-transform', showDetails && 'rotate-180')}
                strokeWidth={2}
              />
            </button>
          </div>
          {showDetails ? (
            <pre className="mt-2.5 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line-soft bg-bg/70 px-2.5 py-2 font-mono text-[10.5px] leading-4 text-muted">
              {error}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  )
}
