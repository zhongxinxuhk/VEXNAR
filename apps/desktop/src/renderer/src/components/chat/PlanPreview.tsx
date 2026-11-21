// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { Check, ChevronRight, Circle, ClipboardList, Loader2 } from 'lucide-react'
import { conversations } from '@/lib/conversations'
import { useT } from '@/lib/i18n'
import { describeToolPayload } from '@/lib/tool-inspection'
import { cn } from '@/lib/utils'
import type { ToolCall } from '@/store/app'

const columns = [
  'chat.inspectTodoPending', 'chat.inspectTodoRunning', 'chat.inspectTodoDone'
] as const

export function PlanPreview({ conversationId, call }: {
  conversationId: string
  call: ToolCall
}): React.JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [board, setBoard] = useState(false)
  const [snapshot, setSnapshot] = useState<ReturnType<typeof describeToolPayload> | null>(null)
  const [failed, setFailed] = useState(false)
  const sequence = call.started.sequence
  useEffect(() => {
    if (!open || snapshot || failed) return
    let active = true
    void conversations.traceDetail(conversationId, sequence).then((input) => {
      if (active) setSnapshot(describeToolPayload('TodoWrite', input, ''))
    }, () => {
      if (active) setFailed(true)
    })
    return () => { active = false }
  }, [open, snapshot, failed, conversationId, sequence])

  const completed = snapshot?.todos.filter((task) => task.status === 'chat.inspectTodoDone').length
  const renderTask = (task: NonNullable<typeof snapshot>['todos'][number], index: number): React.JSX.Element => {
    const Icon = task.status === 'chat.inspectTodoDone' ? Check : task.status === 'chat.inspectTodoRunning' ? Loader2 : Circle
    return (
      <li key={index} className="flex items-start gap-2 rounded-md border border-line-soft bg-bg px-2.5 py-2 text-xs">
        <Icon className={cn('mt-0.5 size-3.5 shrink-0', task.status === 'chat.inspectTodoDone' ? 'text-accent-2' : 'text-muted')} aria-hidden="true" />
        <span className="min-w-0 flex-1 break-words leading-5 text-ink-soft">{task.text}</span>
        {!board ? <span className="shrink-0 text-[11px] text-muted">{t(task.status)}</span> : null}
      </li>
    )
  }

  return (
    <details className="group/plan rounded-lg border border-line-soft bg-panel/50" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-xs text-ink-soft">
        <ClipboardList className="size-3.5 text-accent" aria-hidden="true" />
        <span className="font-medium">{t('chat.planPreview')}</span>
        <span className="text-muted">{t('chat.planRevision', { sequence })}</span>
        {snapshot && snapshot.additionalTodos === 0 && snapshot.todos.length > 0 ? (
          <span className="text-muted">{t('chat.planProgress', { done: completed ?? 0, count: snapshot.todos.length })}</span>
        ) : null}
        <ChevronRight className="ml-auto size-3.5 text-muted group-open/plan:rotate-90" aria-hidden="true" />
      </summary>
      {open ? (
        <div className="border-t border-line-soft p-2.5">
          {snapshot ? (
            snapshot.todos.length > 0 ? (
              <>
                <div role="group" aria-label={t('chat.planViews')} className="mb-2 flex gap-1">
                  {([false, true] as const).map((mode) => (
                    <button key={String(mode)} type="button" aria-pressed={board === mode} onClick={() => setBoard(mode)}
                      className="rounded px-2 py-1 text-xs text-muted hover:bg-panel-2 aria-pressed:bg-panel-2 aria-pressed:text-ink">
                      {t(mode ? 'chat.planBoard' : 'chat.planTasks')}
                    </button>
                  ))}
                </div>
                {board ? (
                  <div aria-label={t('chat.planBoard')} className="grid gap-2 sm:grid-cols-3">
                    {columns.map((status) => {
                      const tasks = snapshot.todos.filter((task) => task.status === status)
                      return (
                        <section key={status} className="min-w-0 rounded-lg bg-panel-2/45 p-2">
                          <h4 className="mb-1.5 text-xs font-medium text-ink-soft">{t(status)} · {tasks.length}</h4>
                          <ul className="grid gap-1.5">{tasks.map(renderTask)}</ul>
                        </section>
                      )
                    })}
                  </div>
                ) : <ul className="grid gap-1.5">{snapshot.todos.map(renderTask)}</ul>}
                {snapshot.additionalTodos > 0 ? <p className="mt-2 text-xs text-muted">{t('chat.planAdditional', { count: snapshot.additionalTodos })}</p> : null}
              </>
            ) : <p className="text-xs text-muted">{t('chat.planEmpty')}</p>
          ) : failed ? (
            <button type="button" className="text-xs text-danger hover:underline" onClick={() => setFailed(false)}>
              {t('chat.toolPayloadFailed')} · {t('chat.toolPayloadRetry')}
            </button>
          ) : <p role="status" className="text-xs text-muted">{t('chat.toolPayloadLoading')}</p>}
        </div>
      ) : null}
    </details>
  )
}
