// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pattern adapted from Motif's Tool Call (MIT). See ./NOTICE.md.

import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Check, ChevronDown, CircleHelp, ClipboardList, Globe, Loader2, Monitor, Plug, SquareTerminal, Unplug, Wrench, X } from 'lucide-react'
import { conversations } from '@/lib/conversations'
import { describeToolPayload } from '@/lib/tool-inspection'
import { executionCategories, executionGroup } from '@/lib/execution-groups'
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

function useTracePayload(open: boolean, conversationId: string, sequence?: number): {
  value?: string
  failed: boolean
  retry: () => void
} {
  const key = sequence === undefined ? '' : `${conversationId}:${sequence}`
  const [loaded, setLoaded] = useState<{ key: string; value: string } | null>(null)
  const [failure, setFailure] = useState('')
  const value = loaded?.key === key ? loaded.value : undefined
  const failed = key !== '' && failure === key

  useEffect(() => {
    if (!open || sequence === undefined || value !== undefined || failed) return
    let active = true
    void conversations.traceDetail(conversationId, sequence).then((detail) => {
      if (active) setLoaded({ key, value: detail })
    }, () => {
      if (active) setFailure(key)
    })
    return () => { active = false }
  }, [open, conversationId, sequence, key, value, failed])

  return { value, failed, retry: () => setFailure('') }
}

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
  const callSequence = started.sequence
  const resultSequence = finished?.sequence
  const input = useTracePayload(open, conversationId, callSequence)
  const output = useTracePayload(open, conversationId, resultSequence)
  const inspection = useMemo(
    () => describeToolPayload(name, input.value ?? '', output.value ?? ''),
    [name, input.value, output.value]
  )
  const { category } = inspection
  const Icon = {
    planning: ClipboardList,
    skill: BookOpen,
    mcp: Plug,
    browser: Globe,
    terminal: SquareTerminal,
    software: Monitor,
    api: Unplug,
    other: Wrench
  }[category]
  const command = inspection.fields.find((field) => field.key === 'command')?.value
  const recordedTarget = inspection.fields.find((field) => field.key === 'delegatedTool')?.value
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
    <details data-call-sequence={callSequence} data-tool-category={category} className="group" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-panel-2/60">
        <Icon className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-soft" title={name}>{recordedTarget || name}</span>
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
          <ToolInspection
            inspection={inspection}
            input={input}
            output={output}
            status={status}
            hasResult={resultSequence !== undefined}
            command={typeof command === 'string' ? command : undefined}
            label={label}
          />
        </div>
      ) : null}
    </details>
  )
}

function PendingPayload({ payload, label }: {
  payload: ReturnType<typeof useTracePayload>
  label: string
}): React.JSX.Element {
  const t = useT()
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-2.5 py-2 text-[11px] text-muted">
      <span>{label} · {t(payload.failed ? 'chat.toolPayloadFailed' : 'chat.toolPayloadLoading')}</span>
      {payload.failed ? (
        <button type="button" onClick={payload.retry} className="rounded px-2 py-1 text-accent hover:bg-panel-2">
          {t('chat.toolPayloadRetry')}
        </button>
      ) : null}
    </div>
  )
}

function ToolInspection({ inspection, input, output, status, hasResult, command, label }: {
  inspection: ReturnType<typeof describeToolPayload>
  input: ReturnType<typeof useTracePayload>
  output: ReturnType<typeof useTracePayload>
  status: ToolCallStatus
  hasResult: boolean
  command?: string
  label: (typeof statusDisplay)[ToolCallStatus]['label']
}): React.JSX.Element {
  const t = useT()
  const { category, fields, todos, additionalTodos, stdout, stderr } = inspection
  const overview = fields.filter((field) => field.key !== 'command')
  const outputLabel = t(status === 'error' ? 'chat.toolErrorDetail' : 'chat.toolOutput')

  return (
    <>
      {command ? (
        <section aria-label={t('chat.inspectShell')} className="border-b border-line-soft bg-bg/70">
          <ToolPayload label={t('chat.inspectCommand')} value={command} command />
        </section>
      ) : null}
      {overview.length || todos.length ? (
        <section aria-label={t(executionCategories[category])} className="space-y-2 border-b border-line-soft px-3 py-2">
          {overview.length > 0 ? (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[11px] leading-5">
              {overview.map(({ key, label, value }) => (
                <div key={key} className="contents">
                  <dt className="text-muted">{t(label)}</dt>
                  <dd className="min-w-0 whitespace-pre-wrap break-words text-ink-soft">
                    {String(value).length > 4096 ? String(value).slice(0, 4096) + '…' : value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {todos.length > 0 ? (
            <ul className="divide-y divide-line-soft">
              {todos.map((todo, index) => (
                <li key={index} className="flex items-baseline justify-between gap-2 py-1 text-[11px]">
                  <span className="min-w-0 break-words text-ink-soft">{todo.text}</span>
                  <span className="shrink-0 text-muted">{t(todo.status)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {additionalTodos > 0 ? <p className="text-xs text-muted">{t('chat.planAdditional', { count: additionalTodos })}</p> : null}
        </section>
      ) : null}
      {input.value === undefined ? <PendingPayload payload={input} label={t('chat.toolInput')} /> :
        input.value ? command ? (
          <details className="px-2.5 py-1 text-xs text-muted">
            <summary className="cursor-pointer">{t('chat.toolInput')}</summary>
            <ToolPayload label={t('chat.toolInput')} value={input.value} />
          </details>
        ) : <ToolPayload label={t('chat.toolInput')} value={input.value} /> :
          <p className="px-2.5 py-2 text-xs text-muted">{t('chat.toolInputEmpty')}</p>}
      {hasResult && output.value === undefined ? <PendingPayload payload={output} label={outputLabel} /> :
        output.value ? (
          stdout !== undefined || stderr !== undefined ? (
            <>
              {stdout ? <ToolPayload label={t('chat.inspectStdout')} value={stdout} /> : null}
              {stderr ? <ToolPayload label={t('chat.inspectStderr')} value={stderr} error /> : null}
              <details className="px-2.5 py-1 text-xs text-muted">
                <summary className="cursor-pointer">{t('chat.inspectRawOutput')}</summary>
                <ToolPayload label={t('chat.inspectRawOutput')} value={output.value} error={status === 'error'} />
              </details>
            </>
          ) : <ToolPayload label={outputLabel} value={output.value} error={status === 'error'} />
        ) : (
          <p className="px-2.5 py-2 text-xs text-muted">
            {t(status === 'running' ? 'chat.toolWaiting' : hasResult ? 'chat.toolEmpty' : 'chat.toolUnreported')}
          </p>
        )}
      <footer className={cn('flex justify-end border-t border-line-soft px-3 py-1.5 text-xs', statusDisplay[status].tone)}>{t(label)}</footer>
    </>
  )
}

const PAYLOAD_PAGE = 8192

function ToolPayload({ label, value, error, command }: { label: string; value: string; error?: boolean; command?: boolean }): React.JSX.Element {
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
      )}>{command && page === 0 ? <span aria-hidden="true" className="text-muted">$ </span> : null}{text.slice(start, end)}</pre>
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
