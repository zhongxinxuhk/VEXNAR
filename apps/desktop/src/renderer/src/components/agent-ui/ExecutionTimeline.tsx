// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { conversations } from '@/lib/conversations'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { ToolCall, ToolTraceEvent } from '@/store/app'
import { ToolCallRow, ToolEventTime } from './ToolCallRow'

const ROW_HEIGHT = 32
const WINDOW_ROWS = 10
const OVERSCAN = 4

const labels = {
  invoked: 'chat.toolInvoked',
  done: 'chat.toolResultDone',
  error: 'chat.toolResultError'
} as const

type CallLookup = {
  resultSequence: number
  status: 'loading' | 'linked' | 'ambiguous' | 'unmatched' | 'error'
  call?: ToolCall
}

export function ExecutionTimeline({ conversationId, events: sourceEvents }: {
  conversationId: string
  events: ToolTraceEvent[]
}): React.JSX.Element {
  const t = useT()
  const viewport = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<number | null>(null)
  const focusedRow = useRef<HTMLLIElement>(null)
  const [highlight, setHighlight] = useState<number | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [lookup, setLookup] = useState<CallLookup | null>(null)
  const lookupRequest = useRef(0)
  const [auditFilter, setAuditFilter] = useState<'all' | ToolTraceEvent['outcome']>('all')
  const events = useMemo(() => auditFilter === 'all' ? sourceEvents : sourceEvents.filter((event) =>
    event.outcome === auditFilter), [sourceEvents, auditFilter])

  const maxOffset = Math.max(0, events.length - WINDOW_ROWS) * ROW_HEIGHT
  const firstVisible = Math.floor(Math.min(scrollTop, maxOffset) / ROW_HEIGHT)
  const firstRendered = Math.max(0, firstVisible - OVERSCAN)
  const lastRendered = Math.min(events.length, firstVisible + WINDOW_ROWS + OVERSCAN + 1)

  useLayoutEffect(() => {
    if (pendingFocus.current !== null && focusedRow.current) {
      focusedRow.current.focus({ preventScroll: true })
      pendingFocus.current = null
    }
  }, [highlight, firstRendered, lastRendered])

  const jumpToCall = (sequence: number): void => {
    const index = events.findIndex((event) => event.sequence === sequence)
    const element = viewport.current
    if (index < 0 || !element) return
    const nextOffset = Math.min(index * ROW_HEIGHT, maxOffset)
    element.scrollTop = nextOffset
    setScrollTop(element.scrollTop)
    if (highlight === sequence && focusedRow.current) {
      focusedRow.current.focus({ preventScroll: true })
      return
    }
    pendingFocus.current = sequence
    setHighlight(sequence)
  }

  const findCall = async (event: ToolTraceEvent): Promise<void> => {
    if (event.outcome === 'invoked') return
    const request = ++lookupRequest.current
    setLookup({ resultSequence: event.sequence, status: 'loading' })
    try {
      const result = await conversations.relatedTraceCall(conversationId, event.sequence)
      if (request !== lookupRequest.current) return
      const call = result.call
      setLookup({
        resultSequence: event.sequence,
        status: result.relation,
        call: call && result.relation === 'linked' ? {
          id: String(call.seq),
          name: call.tool || event.tool,
          worker: call.worker,
          started: { sequence: call.seq, timestamp: call.ts },
          finished: { sequence: event.sequence, timestamp: event.timestamp },
          status: event.outcome
        } : undefined
      })
    } catch {
      if (request === lookupRequest.current) setLookup({ resultSequence: event.sequence, status: 'error' })
    }
  }

  return (
    <div className="ml-2 border-l border-line-soft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-2 py-1.5">
        <span className="text-xs font-medium text-ink-soft">{t('chat.auditLog')}</span>
        <select
          value={auditFilter}
          aria-label={t('chat.auditOutcome')}
          onChange={(event) => {
            setAuditFilter(event.currentTarget.value as typeof auditFilter)
            setHighlight(null)
            pendingFocus.current = null
            lookupRequest.current++
            setLookup(null)
            if (viewport.current) viewport.current.scrollTop = 0
            setScrollTop(0)
          }}
          className="rounded border border-line-soft bg-bg px-2 py-1 text-xs text-ink-soft"
        >
          <option value="all">{t('chat.toolFilterAll')} ({sourceEvents.length})</option>
          {(Object.keys(labels) as ToolTraceEvent['outcome'][]).map((outcome) => (
            <option key={outcome} value={outcome}>{t(labels[outcome])} ({sourceEvents.filter((item) => item.outcome === outcome).length})</option>
          ))}
        </select>
      </div>

      <div
        ref={viewport}
        role="region"
        tabIndex={0}
        aria-label={t('chat.toolTimeline')}
        className="overflow-y-auto overscroll-contain [overflow-anchor:none]"
        style={{ height: Math.min(events.length, WINDOW_ROWS) * ROW_HEIGHT }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <ol className="relative" style={{ height: events.length * ROW_HEIGHT }}>
          {events.slice(firstRendered, lastRendered).map((event, offset) => {
            const related = event.relatedCallSequence
            const index = firstRendered + offset
            return (
              <li
                key={event.sequence}
                ref={event.sequence === highlight ? focusedRow : undefined}
                aria-setsize={events.length}
                aria-posinset={index + 1}
                tabIndex={-1}
                style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
                className={cn(
                  'absolute inset-x-0 flex items-center gap-2 overflow-hidden border-b border-line-soft px-2 text-[11px] focus-visible:outline focus-visible:outline-inset',
                  event.sequence === highlight && 'bg-panel-2'
                )}
              >
                <span className="shrink-0 font-mono text-muted">#{event.sequence}</span>
                <span className={cn('shrink-0 font-medium', event.outcome === 'error' ? 'text-danger' : 'text-ink-soft')}>
                  {t(labels[event.outcome])}
                </span>
                <span title={event.tool} className="min-w-0 flex-1 truncate font-mono text-ink">{event.tool}</span>
                {event.worker ? <span title={event.worker} className="hidden min-w-0 max-w-24 truncate text-muted sm:inline">{event.worker}</span> : null}
                {related !== undefined ? (
                  <button
                    type="button"
                    onClick={() => auditFilter === 'all' ? jumpToCall(related) : void findCall(event)}
                    className="shrink-0 rounded px-1 text-accent underline-offset-2 hover:underline focus-visible:underline"
                  >
                    {t('chat.toolRelatedCall', { sequence: related })}
                  </button>
                ) : event.relation ? (
                  <button
                    type="button"
                    onClick={() => void findCall(event)}
                    className="shrink-0 rounded px-1 text-accent underline-offset-2 hover:underline focus-visible:underline"
                    title={t(event.relation === 'ambiguous' ? 'chat.toolRelationAmbiguous' : 'chat.toolRelationMissing')}
                  >
                    {t('chat.toolFindRelatedCall')}
                  </button>
                ) : null}
                <span className="hidden shrink-0 text-muted md:inline">
                  <ToolEventTime timestamp={event.timestamp} />
                </span>
              </li>
            )
          })}
        </ol>
      </div>
      {lookup ? (
        <section aria-label={t('chat.toolCallLookup')} className="border-t border-line-soft px-2 py-2">
          <div className="flex items-center justify-between gap-2 text-xs text-ink-soft">
            <h4>{t('chat.toolLookupResult', { sequence: lookup.resultSequence })}</h4>
            <button type="button" className="rounded px-2 py-1 hover:bg-panel-2" onClick={() => {
              lookupRequest.current++
              setLookup(null)
            }}>
              {t('chat.toolLookupClose')}
            </button>
          </div>
          {lookup.call ? (
            <ToolCallRow key={lookup.call.started.sequence} conversationId={conversationId} call={lookup.call} status={lookup.call.status} />
          ) : (
            <p role="status" className="px-2 py-1 text-[11px] text-muted">
              {t(lookup.status === 'ambiguous' ? 'chat.toolRelationAmbiguous' :
                lookup.status === 'unmatched' ? 'chat.toolRelationMissing' :
                lookup.status === 'error' ? 'chat.toolPayloadFailed' : 'chat.toolPayloadLoading')}
            </p>
          )}
        </section>
      ) : null}
      <p className="px-2 py-1 text-[11px] text-muted">
        {events.length === 0 ? t('chat.toolFilterEmpty') : t('chat.toolPage', {
          start: firstVisible + 1,
          end: Math.min(firstVisible + WINDOW_ROWS, events.length),
          total: events.length
        })}
      </p>
    </div>
  )
}
