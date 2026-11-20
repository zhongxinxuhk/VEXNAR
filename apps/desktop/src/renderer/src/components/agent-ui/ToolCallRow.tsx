// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pattern adapted from Motif's Tool Call (MIT). See ./NOTICE.md.

import { useEffect, useState } from 'react'
import { BookOpen, Check, ChevronDown, CircleHelp, Loader2, SquareTerminal, Wrench, X } from 'lucide-react'
import { conversations } from '@/lib/conversations'
import { executionGroup } from '@/lib/execution-groups'
import { useI18n, useT } from '@/lib/i18n'
import type { ToolCall } from '@/store/app'
import { cn } from '@/lib/utils'
import { MAX_COPY_TEXT_LENGTH } from '@shared/contracts'

export type ToolCallStatus = 'running' | 'done' | 'error' | 'unreported'

const statusDisplay = {
  running: { tone: 'text-warn', icon: Loader2, label: 'chat.toolRunning' },
  done: { tone: 'text-accent-2', icon: Check, label: 'chat.toolDone' },
  error: { tone: 'text-danger', icon: X, label: 'chat.toolError' },
  unreported: { tone: 'text-muted', icon: CircleHelp, label: 'chat.toolUnreported' }
} as const

/**
 * One call, one row: what the tool is, the gist of what it was given, where it
 * stands, and the arguments and result behind a disclosure. The row carries no
 * container of its own so a transcript with a dozen calls still reads as a
 * transcript rather than a stack of cards.
 */
export function ToolCallRow({
  conversationId,
  call,
  status
}: {
  conversationId: string
  call: ToolCall
  status: ToolCallStatus
}): React.JSX.Element {
  const t = useT()
  const locale = useI18n((state) => state.locale)
  const [open, setOpen] = useState(false)
  const { name, worker, started, finished } = call
  const [payload, setPayload] = useState<{ key: string; input: string; output: string } | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const callSequence = started.sequence
  const resultSequence = finished?.sequence
  const key = `${conversationId}:${callSequence}:${resultSequence ?? ''}`
  const current = payload?.key === key ? payload : null
  const failed = failedKey === key
  useEffect(() => {
    if (!open || current || failed) return
    let cancelled = false
    Promise.all([
      conversations.traceDetail(conversationId, callSequence),
      resultSequence === undefined ? Promise.resolve('') : conversations.traceDetail(conversationId, resultSequence)
    ]).then(([input, output]) => {
      if (!cancelled) setPayload({ key, input, output })
    }, () => {
      if (!cancelled) setFailedKey(key)
    })
    return () => { cancelled = true }
  }, [open, current, failed, conversationId, callSequence, resultSequence, key])

  const Icon = executionGroup(name).category === 'terminal'
    ? SquareTerminal
    : name === 'read_file' || name === 'list_files' ? BookOpen : Wrench
  const { tone, icon: StatusIcon, label } = statusDisplay[status]

  const elapsedMs = finished ? Date.parse(finished.timestamp) - Date.parse(started.timestamp) : NaN
  const elapsed = open && Number.isFinite(elapsedMs) && elapsedMs >= 0
    ? new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: elapsedMs < 1000 ? 'millisecond' : 'second',
        maximumFractionDigits: 3
      }).format(elapsedMs < 1000 ? elapsedMs : elapsedMs / 1000)
    : null

  return (
    <details data-call-sequence={callSequence} className="group" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-panel-2/60">
        <Icon className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-soft" title={name}>{name}</span>
        {worker ? <span className="max-w-24 shrink-0 truncate text-[10px] text-muted" title={worker}>{worker}</span> : null}
        <span className={cn('flex shrink-0 items-center gap-1 font-mono text-[9px]', tone)}>
          <StatusIcon className={cn('size-2.5', status === 'running' && 'motion-safe:animate-spin')} aria-hidden="true" />
          {t(label)}
        </span>
        <ChevronDown className="size-3 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      {open ? (
        <div className="my-1 ml-6 overflow-hidden rounded-lg border border-line-soft bg-panel">
          <dl aria-label={t('chat.toolTrace')} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-line-soft px-2.5 py-2 text-[11px] text-ink-soft">
            {worker ? (
              <>
                <dt className="text-muted">{t('chat.toolWorker')}</dt>
                <dd className="break-all">{worker}</dd>
              </>
            ) : null}
            <dt className="text-muted">{t('chat.toolStarted')}</dt>
            <dd className="font-mono">#{started.sequence} <ToolEventTime timestamp={started.timestamp} /></dd>
            {finished ? (
              <>
                <dt className="text-muted">{t('chat.toolFinished')}</dt>
                <dd className="font-mono">#{finished.sequence} <ToolEventTime timestamp={finished.timestamp} /></dd>
              </>
            ) : null}
            {elapsed === null ? null : (
              <>
                <dt className="text-muted">{t('chat.toolRecordedElapsed')}</dt>
                <dd className="font-mono">{elapsed}</dd>
              </>
            )}
          </dl>
          {current ? (
            <>
              {current.input ? <ToolPayload key={`input-${key}`} label={t('chat.toolInput')} value={current.input} /> : null}
              {current.output ? (
                <ToolPayload
                  key={`output-${key}`}
                  label={t(status === 'error' ? 'chat.toolErrorDetail' : 'chat.toolOutput')}
                  value={current.output}
                  error={status === 'error'}
                />
              ) : (
                <p className="px-2.5 py-2 text-[11px] text-muted">
                  {t(status === 'running' ? 'chat.toolWaiting' : 'chat.toolEmpty')}
                </p>
              )}
            </>
          ) : failed ? (
            <div role="status" className="flex items-center justify-between gap-2 px-2.5 py-2 text-[11px] text-danger">
              {t('chat.toolPayloadFailed')}
              <button type="button" onClick={() => setFailedKey(null)} className="rounded px-2 py-1 hover:bg-panel-2">
                {t('chat.toolPayloadRetry')}
              </button>
            </div>
          ) : (
            <p role="status" className="px-2.5 py-2 text-[11px] text-muted">{t('chat.toolPayloadLoading')}</p>
          )}
        </div>
      ) : null}
    </details>
  )
}

const PAYLOAD_PAGE = 8192

function ToolPayload({ label, value, error }: { label: string; value: string; error?: boolean }): React.JSX.Element {
  const t = useT()
  const [page, setPage] = useState(0)
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null)
  let text = value
  if (text.length < PAYLOAD_PAGE * 4 && /^[\s]*[\[{]/.test(text)) {
    try { text = JSON.stringify(JSON.parse(text), null, 2) } catch { /* retain plain text */ }
  }
  const start = page * PAYLOAD_PAGE
  const end = Math.min(start + PAYLOAD_PAGE, text.length)
  const copyFull = value.length <= MAX_COPY_TEXT_LENGTH
  const copy = async (): Promise<void> => {
    try {
      setCopied((await window.vexnar.app.copyText(copyFull ? value : text.slice(start, end))).ok ? 'done' : 'failed')
    } catch {
      setCopied('failed')
    }
  }
  return (
    <section className="border-b border-line-soft px-2.5 py-2 last:border-b-0">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
        <h4>{label}</h4>
        <button type="button" onClick={() => void copy()} className="rounded px-2 py-1 hover:bg-panel-2">
          {t(copied === 'done' ? 'chat.toolPayloadCopied' : copyFull ? 'chat.toolPayloadCopy' : 'chat.toolPayloadCopyPage')}
        </button>
      </div>
      {copied === 'failed' ? <p role="status" className="text-[11px] text-danger">{t('chat.toolPayloadCopyFailed')}</p> : null}
      <pre className={cn(
        'max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10.5px] leading-5',
        error ? 'text-danger' : 'text-ink-soft'
      )}>{text.slice(start, end)}</pre>
      {text.length > PAYLOAD_PAGE ? (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span aria-live="polite">{t('chat.toolPage', { start: start + 1, end, total: text.length })}</span>
          <button type="button" disabled={page === 0} onClick={() => { setPage(page - 1); setCopied(null) }} className="rounded px-2 py-1 hover:bg-panel-2 disabled:opacity-50">
            {t('chat.toolPrevious')}
          </button>
          <button type="button" disabled={end === text.length} onClick={() => { setPage(page + 1); setCopied(null) }} className="rounded px-2 py-1 hover:bg-panel-2 disabled:opacity-50">
            {t('chat.toolNext')}
          </button>
        </div>
      ) : null}
    </section>
  )
}

export function ToolEventTime({ timestamp }: { timestamp: string }): React.JSX.Element | null {
  const locale = useI18n((state) => state.locale)
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return null
  return (
    <time dateTime={timestamp} title={timestamp}>
      {date.toLocaleString(locale)}
    </time>
  )
}
