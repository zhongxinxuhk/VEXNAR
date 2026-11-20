// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pattern adapted from Motif's Tool Call (MIT). See ./NOTICE.md.

import { useState } from 'react'
import { BookOpen, Check, ChevronDown, CircleHelp, Loader2, SquareTerminal, Wrench, X } from 'lucide-react'
import { useI18n, useT } from '@/lib/i18n'
import type { ToolCall } from '@/store/app'
import { cn } from '@/lib/utils'

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
  call,
  summary,
  turnRunning
}: {
  call: ToolCall
  summary: string
  turnRunning: boolean
}): React.JSX.Element {
  const t = useT()
  const locale = useI18n((state) => state.locale)
  const [open, setOpen] = useState(false)
  const { name, worker, started, finished, input, output } = call
  const status = call.status === 'running' && !turnRunning ? 'unreported' : call.status
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : null
  const command = typeof record?.command === 'string' ? record.command : ''
  const inputText = open && input != null ? (command ? `$ ${command}` : JSON.stringify(input, null, 2)) : ''
  const outputText = output || (status === 'running' ? t('chat.toolWaiting') : t('chat.toolEmpty'))
  const Icon = command ? SquareTerminal : name === 'read_file' || name === 'list_files' ? BookOpen : Wrench
  const { tone, icon: StatusIcon, label } = statusDisplay[status]

  const elapsedMs = finished ? Date.parse(finished.timestamp) - Date.parse(started.timestamp) : NaN
  const elapsed = open && Number.isFinite(elapsedMs) && elapsedMs >= 0
    ? new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: elapsedMs < 1000 ? 'millisecond' : 'second',
        maximumFractionDigits: 3
      }).format(elapsedMs < 1000 ? elapsedMs : elapsedMs / 1000)
    : null

  const eventTime = (timestamp: string): React.JSX.Element | null => {
    const date = new Date(timestamp)
    if (!Number.isFinite(date.getTime())) return null
    return (
      <time dateTime={timestamp} title={timestamp}>
        {date.toLocaleString(locale)}
      </time>
    )
  }

  return (
    <details className="group" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-panel-2/60">
        <Icon className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span className="max-w-[120px] shrink-0 truncate text-[9.5px] font-medium uppercase tracking-[0.08em] text-muted">{name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink-soft" title={summary}>
          {summary}
        </span>
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
            <dd className="font-mono">#{started.sequence} {eventTime(started.timestamp)}</dd>
            {finished ? (
              <>
                <dt className="text-muted">{t('chat.toolFinished')}</dt>
                <dd className="font-mono">#{finished.sequence} {eventTime(finished.timestamp)}</dd>
              </>
            ) : null}
            {elapsed === null ? null : (
              <>
                <dt className="text-muted">{t('chat.toolRecordedElapsed')}</dt>
                <dd className="font-mono">{elapsed}</dd>
              </>
            )}
          </dl>
          {inputText ? (
            <section className="border-b border-line-soft px-2.5 py-2">
              <div className="mb-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted/80">{t('chat.toolInput')}</div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10.5px] leading-5 text-ink-soft">
                {inputText}
              </pre>
            </section>
          ) : null}
          <section className="px-2.5 py-2">
            <div className="mb-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted/80">{t('chat.toolOutput')}</div>
            <pre
              className={cn(
                'max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[10.5px] leading-5',
                status === 'error' ? 'text-danger/90' : 'text-ink-soft'
              )}
            >
              {outputText}
            </pre>
          </section>
        </div>
      ) : null}
    </details>
  )
}
