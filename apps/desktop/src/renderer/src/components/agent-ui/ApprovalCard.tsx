// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pattern adapted from Motif's Approval Card (MIT). See ./NOTICE.md.

import { Loader2, ShieldAlert } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'

/**
 * A tool call held at a gate, shown as it will run. Approving is one press
 * because the gate — not the model — is asking; rejecting does not need a note
 * because the backend's decide endpoint has no place to carry one.
 */
export function ApprovalCard({
  agent,
  tool,
  target,
  reason,
  input,
  busy = false,
  disabled = false,
  error,
  onApprove,
  onReject,
  className
}: {
  agent: string
  tool: string
  target?: string
  reason?: string
  input?: Record<string, unknown>
  busy?: boolean
  disabled?: boolean
  error?: string | null
  onApprove: () => void
  onReject: () => void
  className?: string
}): React.JSX.Element {
  const t = useT()
  const agentLabel = agent.trim() || t('approval.agentUnknown')
  const inputText = input ? JSON.stringify(input, null, 2) : ''

  return (
    <div
      aria-busy={busy}
      className={cn('rounded-xl border border-warn/25 bg-warn/5 p-3.5', className)}
    >
      <div className="flex items-start gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-warn/25 bg-warn/10 text-warn">
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[11px] font-semibold text-ink">{t('approval.statusPending')}</span>
            <span className="font-mono text-[11px] text-ink-soft">{tool}</span>
            <span className="font-mono text-[9px] text-muted">{agentLabel}</span>
          </div>
          <p className="mt-1 text-[10.5px] leading-5 text-muted">{t('approval.heldHint')}</p>
          {target ? (
            <div className="mt-1.5 min-w-0">
              <code
                title={target}
                className="inline-block max-w-full truncate rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[10.5px] text-ink-soft"
              >
                {target}
              </code>
            </div>
          ) : null}
          {reason ? (
            <p className="mt-1.5 text-[10px] leading-4 text-muted">
              <span className="text-muted/80">{t('approval.reason')}: </span>
              {reason}
            </p>
          ) : null}
        </div>
      </div>

      {inputText ? (
        <details className="mt-2 rounded-lg border border-line-soft bg-panel/50">
          <summary className="cursor-pointer px-2.5 py-1.5 font-mono text-[9px] text-muted hover:text-ink">
            {t('approval.input')}
          </summary>
          <pre className="max-h-48 overflow-auto border-t border-line-soft px-2.5 py-2 font-mono text-[10.5px] leading-5 text-ink-soft">
            {inputText}
          </pre>
        </details>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 rounded-md border border-danger/20 bg-danger/5 px-2 py-1 font-mono text-[10px] text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={busy || disabled} onClick={onReject}>
          {t('approval.reject')}
        </Button>
        <Button size="sm" disabled={busy || disabled} onClick={onApprove}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {busy ? t('approval.submitting') : t('approval.approve')}
        </Button>
      </div>
    </div>
  )
}
