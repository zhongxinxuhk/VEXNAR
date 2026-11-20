// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useLayoutEffect, useRef, useState } from 'react'
import { useI18n, useT } from '@/lib/i18n'
import type { ToolCall, ToolTraceEvent } from '@/store/app'
import { cn } from '@/lib/utils'
import { executionCategories, executionGroup, type ExecutionCategory } from '@/lib/execution-groups'
import { BookOpen, ClipboardList, Globe, Monitor, Plug, SquareTerminal, Unplug, Wrench } from 'lucide-react'
import { ToolCallRow, ToolEventTime, type ToolCallStatus } from './ToolCallRow'

const PAGE_SIZE = 25
const traceViews = {
  groups: 'chat.toolGroupsView',
  calls: 'chat.toolCallsView',
  timeline: 'chat.toolTimeline'
} as const

const categoryIcons = {
  planning: ClipboardList, skill: BookOpen, mcp: Plug, browser: Globe,
  terminal: SquareTerminal, software: Monitor, api: Unplug, other: Wrench
}
type TraceView = keyof typeof traceViews
type CallRow = { call: ToolCall; status: ToolCallStatus } & ReturnType<typeof executionGroup>

function duration(call: ToolCall): number | undefined {
  if (!call.finished) return
  const elapsed = Date.parse(call.finished.timestamp) - Date.parse(call.started.timestamp)
  if (Number.isFinite(elapsed) && elapsed >= 0) return elapsed
}
const statusFilters = {
  all: 'chat.toolFilterAll',
  error: 'chat.toolError',
  unreported: 'chat.toolUnreported',
  running: 'chat.toolRunning',
  done: 'chat.toolDone'
} as const

type StatusFilter = keyof typeof statusFilters

export const executionStatusLabels = {
  running: 'chat.executionRunning',
  completed: 'chat.executionCompleted',
  failed: 'chat.executionFailed',
  unknown: 'chat.executionUnknown'
} as const

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
  running,
  executionStatus,
  elapsedMs
}: {
  calls: ToolCall[]
  events: ToolTraceEvent[]
  running: boolean
  executionStatus: keyof typeof executionStatusLabels
  elapsedMs?: number
}): React.JSX.Element {
  const t = useT()
  const locale = useI18n((state) => state.locale)
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [view, setView] = useState<TraceView>('groups')
  const [category, setCategory] = useState<ExecutionCategory | 'all'>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'sequence' | 'duration'>('sequence')
  const [groupsExpanded, setGroupsExpanded] = useState(true)
  const [targetSequence, setTargetSequence] = useState<number | null>(null)
  const targetRow = useRef<HTMLLIElement>(null)
  const timeline = view === 'timeline' || calls.length === 0
  const counts: Record<ToolCallStatus, number> = { running: 0, done: 0, error: 0, unreported: 0 }
  const visible: CallRow[] = []
  const categories = new Set<ExecutionCategory>()
  const search = query.trim().toLowerCase()
  for (const call of calls) {
    const status = call.status === 'running' && !running ? 'unreported' : call.status
    counts[status]++
    if (!open || timeline) continue
    const group = executionGroup(call.name)
    categories.add(group.category)
    if ((category === 'all' || category === group.category) &&
        (filter === 'all' || filter === status) &&
        (!search || [call.name, call.worker, String(call.started.sequence)].some((value) => value.toLowerCase().includes(search)))) {
      visible.push({ call, status, ...group })
    }
  }
  if (sort === 'duration') {
    visible.sort((left, right) => (duration(right.call) ?? -1) - (duration(left.call) ?? -1))
  }
  if (view === 'groups') {
    visible.sort((left, right) =>
      left.category.localeCompare(right.category) || (left.source ?? '').localeCompare(right.source ?? ''))
  }
  const total = timeline ? events.length : visible.length
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)
  const currentPage = Math.min(page, lastPage)
  const start = currentPage * PAGE_SIZE
  const end = Math.min(start + PAGE_SIZE, total)
  const pageCalls = visible.slice(start, end)
  const groups = new Map<ExecutionCategory, Map<string, CallRow[]>>()
  if (!timeline && view === 'groups') {
    for (const row of pageCalls) {
      let sources = groups.get(row.category)
      if (!sources) {
        sources = new Map<string, CallRow[]>()
        groups.set(row.category, sources)
      }
      const name = row.source ?? ''
      const rows = sources.get(name) ?? []
      rows.push(row)
      sources.set(name, rows)
    }
  }

  useLayoutEffect(() => {
    const row = targetRow.current
    if (row) {
      row.focus({ preventScroll: true })
      row.scrollIntoView({ block: 'nearest' })
    }
  }, [targetSequence, currentPage])

  const goToPage = (nextPage: number): void => {
    setTargetSequence(null)
    setPage(nextPage)
  }

  const jumpToCall = (sequence: number): void => {
    const index = events.findIndex((event) => event.sequence === sequence)
    if (index < 0) return
    setPage(Math.floor(index / PAGE_SIZE))
    if (targetSequence === sequence && targetRow.current) {
      targetRow.current.focus({ preventScroll: true })
      targetRow.current.scrollIntoView({ block: 'nearest' })
    }
    setTargetSequence(sequence)
  }

  return (
    <details
      className="mt-2 rounded-xl border border-line-soft bg-panel/45 px-2 py-1"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer px-2 py-1.5 text-xs text-muted">
        {calls.length > 0
          ? t('chat.toolActivity', { count: calls.length })
          : t('chat.toolEventCount', { count: events.length })}
        {executionStatus !== 'unknown' ? ` · ${t(executionStatusLabels[executionStatus])}` : ''}
        {counts.done > 0 ? ` · ${t('chat.toolDoneCount', { count: counts.done })}` : ''}
        {counts.running > 0 ? ` · ${t('chat.toolActiveCount', { count: counts.running })}` : ''}
        {counts.error > 0 ? ` · ${t('chat.toolFailedCount', { count: counts.error })}` : ''}
        {counts.unreported > 0 ? ` · ${t('chat.toolUnreportedCount', { count: counts.unreported })}` : ''}
        {elapsedMs !== undefined ? ` · ${new Intl.NumberFormat(locale, {
          style: 'unit', unit: 'second', maximumFractionDigits: 2
        }).format(elapsedMs / 1000)}` : ''}
      </summary>
      {open ? (
        <>
          {calls.length > 0 ? (
            <div role="group" aria-label={t('chat.toolTraceView')} className="flex gap-1 px-2 py-1.5">
              {(Object.keys(traceViews) as TraceView[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={view === mode}
                  onClick={() => {
                    setView(mode)
                    goToPage(0)
                  }}
                  className="rounded-md px-2 py-1 text-[11px] text-muted hover:bg-panel-2 aria-pressed:bg-panel-2 aria-pressed:text-ink"
                >
                  {t(traceViews[mode])}
                </button>
              ))}
            </div>
          ) : null}
          {!timeline ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2 py-1.5">
              <label className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-muted">
                {t('chat.toolFilterStatus')}
                <select
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.currentTarget.value as StatusFilter)
                    goToPage(0)
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
              <select
                aria-label={t('chat.traceFilterCategory')}
                value={category}
                onChange={(event) => {
                  setCategory(event.currentTarget.value as ExecutionCategory | 'all')
                  goToPage(0)
                }}
                className="rounded-md border border-line-soft bg-bg px-2 py-1 text-[11px] text-ink-soft"
              >
                <option value="all">{t('chat.traceAllCategories')}</option>
                {[...categories].map((key) => <option key={key} value={key}>{t(executionCategories[key])}</option>)}
              </select>
              <input
                type="search"
                aria-label={t('chat.traceSearch')}
                placeholder={t('chat.traceSearch')}
                value={query}
                onChange={(event) => {
                  setQuery(event.currentTarget.value)
                  goToPage(0)
                }}
                className="w-36 rounded-md border border-line-soft bg-bg px-2 py-1 text-[11px] text-ink-soft"
              />
              <select
                aria-label={t('chat.traceSort')}
                value={sort}
                onChange={(event) => {
                  setSort(event.currentTarget.value as 'sequence' | 'duration')
                  goToPage(0)
                }}
                className="rounded-md border border-line-soft bg-bg px-2 py-1 text-[11px] text-ink-soft"
              >
                <option value="sequence">{t('chat.traceSortSequence')}</option>
                <option value="duration">{t('chat.traceSortDuration')}</option>
              </select>
              {view === 'groups' && groups.size > 0 ? (
                <button
                  type="button"
                  onClick={() => setGroupsExpanded((expanded) => !expanded)}
                  className="rounded px-2 py-1 text-[11px] text-muted hover:bg-panel-2"
                >
                  {t(groupsExpanded ? 'chat.traceCollapseGroups' : 'chat.traceExpandGroups')}
                </button>
              ) : null}
            </div>
          ) : null}
          {timeline ? (
            <ol
              key={`timeline-${currentPage}`}
              tabIndex={0}
              aria-label={t('chat.toolTimeline')}
              className="ml-2 max-h-80 overflow-y-auto overscroll-contain border-l border-line-soft"
            >
              {events.slice(start, end).map((event) => {
                const relatedCall = event.relatedCallSequence
                return (
                  <li
                    key={event.sequence}
                    ref={event.sequence === targetSequence ? targetRow : undefined}
                    tabIndex={-1}
                    className={cn(
                      'flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-line-soft px-2 py-1.5 text-[11px] last:border-b-0 focus-visible:outline focus-visible:outline-inset',
                      event.sequence === targetSequence && 'bg-panel-2'
                    )}
                  >
                    <span className="shrink-0 font-mono text-muted">#{event.sequence}</span>
                    <span className={cn('font-medium', event.outcome === 'error' ? 'text-danger' : 'text-ink-soft')}>
                      {t(traceEventLabels[event.outcome])}
                    </span>
                    <span className="min-w-0 break-all font-mono text-ink">{event.tool}</span>
                    {event.worker ? <span className="min-w-0 break-all text-muted">{event.worker}</span> : null}
                    {relatedCall != null ? (
                      <button
                        type="button"
                        onClick={() => jumpToCall(relatedCall)}
                        className="rounded px-1 text-accent underline-offset-2 hover:underline focus-visible:underline"
                      >
                        {t('chat.toolRelatedCall', { sequence: relatedCall })}
                      </button>
                    ) : null}
                    <span className="ml-auto text-muted">
                      <ToolEventTime timestamp={event.timestamp} />
                    </span>
                  </li>
                )
              })}
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
              {view === 'groups' ? (
                [...groups].map(([key, sources]) => {
                  const Icon = categoryIcons[key]
                  const count = [...sources.values()].reduce((sum, rows) => sum + rows.length, 0)
                  return (
                    <details key={`${key}-${groupsExpanded}`} open={groupsExpanded} className="pb-1">
                      <summary className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium text-ink-soft hover:bg-panel-2">
                        <Icon className="size-3.5" aria-hidden="true" />
                        {t(executionCategories[key])}
                        <span className="text-muted">{count}</span>
                      </summary>
                      <div className="ml-3 border-l border-line-soft pl-2">
                        {[...sources].map(([source, rows]) => (
                          <div key={source}>
                            {source ? <p className="px-2 py-1 text-[11px] font-mono text-muted">{source}</p> : null}
                            <div className={source ? 'ml-2 border-l border-line-soft pl-1' : undefined}>
                              {rows.map(({ call, status }) => (
                                <ToolCallRow key={call.id} call={call} summary={toolTitle(call)} status={status} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )
                })
              ) : (
                pageCalls.map(({ call, status }) => (
                  <ToolCallRow key={call.id} call={call} summary={toolTitle(call)} status={status} />
                ))
              )}
            </div>
          )}
          {lastPage > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 text-[11px] text-muted">
              <span aria-live="polite">{t('chat.toolPage', { start: start + 1, end, total })}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={currentPage === 0}
                  onClick={() => goToPage(currentPage - 1)}
                  className="rounded-md px-2 py-1 hover:bg-panel-2 disabled:opacity-40"
                >
                  {t('chat.toolPrevious')}
                </button>
                <button
                  type="button"
                  disabled={currentPage === lastPage}
                  onClick={() => goToPage(currentPage + 1)}
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
