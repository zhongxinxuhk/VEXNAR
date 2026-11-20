// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { useT } from '@/lib/i18n'
import type { ToolCall, ToolTraceEvent } from '@/store/app'
import { cn } from '@/lib/utils'
import { ToolCallRow, ToolEventTime, type ToolCallStatus } from './ToolCallRow'

const PAGE_SIZE = 25
const statusFilters = {
  all: 'chat.toolFilterAll',
  error: 'chat.toolError',
  unreported: 'chat.toolUnreported',
  running: 'chat.toolRunning',
  done: 'chat.toolDone'
} as const

type StatusFilter = keyof typeof statusFilters

const traceEventLabels = {
  invoked: 'chat.toolInvoked',
  done: 'chat.toolResultDone',
  error: 'chat.toolResultError'
} as const

const toolLabels: Record<string, string> = {
  read_file: '读取文件',
  list_files: '列出文件',
  git_status: 'Git 状态'
}

function toolTitle(tool: ToolCall): string {
  const args =
    tool.input && typeof tool.input === 'object' ? (tool.input as Record<string, unknown>) : {}
  const command =
    tool.name === 'git_status'
      ? 'git status --short --branch'
      : typeof args.command === 'string'
        ? args.command
        : ''
  return (
    command ||
    [toolLabels[tool.name] || tool.name, typeof args.path === 'string' ? args.path : '']
      .filter(Boolean)
      .join(' · ')
  )
}

export function ToolActivity({
  calls,
  events,
  running
}: {
  calls: ToolCall[]
  events: ToolTraceEvent[]
  running: boolean
}): React.JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [showTimeline, setShowTimeline] = useState(false)
  const timeline = showTimeline || calls.length === 0
  const counts: Record<ToolCallStatus, number> = { running: 0, done: 0, error: 0, unreported: 0 }
  const visible: { call: ToolCall; status: ToolCallStatus }[] = []
  for (const call of calls) {
    const status = call.status === 'running' && !running ? 'unreported' : call.status
    counts[status]++
    if (open && !timeline && (filter === 'all' || filter === status)) visible.push({ call, status })
  }
  const total = timeline ? events.length : visible.length
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)
  const currentPage = Math.min(page, lastPage)
  const start = currentPage * PAGE_SIZE
  const end = Math.min(start + PAGE_SIZE, total)

  return (
    <details
      className="mt-2 rounded-xl border border-line-soft bg-panel/45 px-2 py-1"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer px-2 py-1.5 text-xs text-muted">
        {calls.length > 0
          ? t('chat.toolActivity', { count: calls.length })
          : t('chat.toolEventCount', { count: events.length })}
        {counts.running > 0 ? ` · ${t('chat.toolActiveCount', { count: counts.running })}` : ''}
        {counts.error > 0 ? ` · ${t('chat.toolFailedCount', { count: counts.error })}` : ''}
        {counts.unreported > 0 ? ` · ${t('chat.toolUnreportedCount', { count: counts.unreported })}` : ''}
      </summary>
      {open ? (
        <>
          {calls.length > 0 ? (
            <div role="group" aria-label={t('chat.toolTraceView')} className="flex gap-1 px-2 py-1.5">
              {([false, true] as const).map((isTimeline) => (
                <button
                  key={String(isTimeline)}
                  type="button"
                  aria-pressed={timeline === isTimeline}
                  onClick={() => {
                    setShowTimeline(isTimeline)
                    setPage(0)
                  }}
                  className="rounded-md px-2 py-1 text-[11px] text-muted hover:bg-panel-2 aria-pressed:bg-panel-2 aria-pressed:text-ink"
                >
                  {t(isTimeline ? 'chat.toolTimeline' : 'chat.toolCallsView')}
                </button>
              ))}
            </div>
          ) : null}
          {!timeline ? (
            <label className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-muted">
              {t('chat.toolFilterStatus')}
              <select
                value={filter}
                onChange={(event) => {
                  setFilter(event.currentTarget.value as StatusFilter)
                  setPage(0)
                }}
                className="rounded-md border border-line-soft bg-bg px-2 py-1 text-ink-soft"
              >
                {(Object.keys(statusFilters) as StatusFilter[]).map((status) => (
                  <option key={status} value={status}>
                    {t(statusFilters[status])} ({status === 'all' ? calls.length : counts[status]})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {timeline ? (
            <ol
              key={`timeline-${currentPage}`}
              tabIndex={0}
              aria-label={t('chat.toolTimeline')}
              className="ml-2 max-h-80 overflow-y-auto overscroll-contain border-l border-line-soft"
            >
              {events.slice(start, end).map((event) => (
                <li
                  key={event.sequence}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-line-soft px-2 py-1.5 text-[11px] last:border-b-0"
                >
                  <span className="shrink-0 font-mono text-muted">#{event.sequence}</span>
                  <span className={cn('font-medium', event.outcome === 'error' ? 'text-danger' : 'text-ink-soft')}>
                    {t(traceEventLabels[event.outcome])}
                  </span>
                  <span className="min-w-0 break-all font-mono text-ink">{event.tool}</span>
                  {event.worker ? <span className="min-w-0 break-all text-muted">{event.worker}</span> : null}
                  {event.relatedCallSequence != null ? (
                    <span className="text-muted">
                      {t('chat.toolRelatedCall', { sequence: event.relatedCallSequence })}
                    </span>
                  ) : null}
                  <span className="ml-auto text-muted">
                    <ToolEventTime timestamp={event.timestamp} />
                  </span>
                </li>
              ))}
            </ol>
          ) : visible.length === 0 ? (
            <p role="status" className="px-2 py-2 text-[11px] text-muted">
              {t('chat.toolFilterEmpty')}
            </p>
          ) : (
            <div
              key={`${filter}-${currentPage}`}
              tabIndex={0}
              aria-label={t('chat.toolActivity', { count: visible.length })}
              className="ml-2 max-h-80 overflow-y-auto overscroll-contain border-l border-line-soft pl-2"
            >
              {visible.slice(start, end).map(({ call, status }) => (
                <ToolCallRow
                  key={call.id}
                  call={call}
                  summary={toolTitle(call)}
                  status={status}
                />
              ))}
            </div>
          )}
          {lastPage > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 text-[11px] text-muted">
              <span aria-live="polite">{t('chat.toolPage', { start: start + 1, end, total })}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                  className="rounded-md px-2 py-1 hover:bg-panel-2 disabled:opacity-40"
                >
                  {t('chat.toolPrevious')}
                </button>
                <button
                  type="button"
                  disabled={currentPage === lastPage}
                  onClick={() => setPage(currentPage + 1)}
                  className="rounded-md px-2 py-1 hover:bg-panel-2 disabled:opacity-40"
                >
                  {t('chat.toolNext')}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </details>
  )
}
