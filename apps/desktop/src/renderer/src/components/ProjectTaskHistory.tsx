// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { consoleRequest } from '@/lib/console'
import { useT } from '@/lib/i18n'
import { projectTaskRoute, projectTaskStatus, projectTaskTitle, type ProjectTaskFocus } from '@/lib/project-task'
import { useAppStore } from '@/store/app'
import { Button, ScrollArea } from '@/components/ui'
import { StatusBadge } from './console/common'

type HistoryItem = {
  id: string
  kind: 'user' | 'text' | 'result' | 'tool_use' | 'tool_result'
  tool?: string
  text: string
  is_error: boolean
  at: string
}

type HistoryPage = { items: HistoryItem[]; next_before: string | null }

export function ProjectTaskHistory({ focus }: { focus: ProjectTaskFocus }): React.JSX.Element {
  const t = useT()
  const closeTask = useAppStore((state) => state.closeProjectTask)
  const [history, setHistory] = useState<HistoryPage | null>(null)
  const [before, setBefore] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState('')
  const { projectId, sessionKey, task } = focus

  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ session: sessionKey })
    if (before) params.set('before', before)
    setPending(true)
    setError('')
    void consoleRequest<HistoryPage>(`${projectTaskRoute(projectId, task.id)}/history?${params}`).then((page) => {
      if (active) setHistory((previous) => before && previous ? { ...page, items: [...page.items, ...previous.items] } : page)
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : String(err))
    }).finally(() => {
      if (active) setPending(false)
    })
    return () => { active = false }
  }, [projectId, task.id, sessionKey, before, refresh])

  return (
    <section className="flex min-w-0 flex-1 flex-col pt-11" data-testid="project-task-history" aria-busy={pending}>
      <header className="flex items-start gap-3 border-b border-line-soft px-4 py-3">
        <Button size="icon" variant="ghost" aria-label={t('panel.backToDesktopChat')} onClick={closeTask}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted">{focus.projectName} / #{task.id}</p>
          <h1 className="truncate text-sm font-semibold text-ink" title={projectTaskTitle(task)}>{projectTaskTitle(task)}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
            <span>{focus.sessionTitle || t('panel.mainAgent')}</span>
            <StatusBadge status={projectTaskStatus(task)} />
          </div>
        </div>
        <Button size="icon" variant="ghost" disabled={pending} aria-label={t('panel.refreshTaskHistory')} onClick={() => { setBefore(null); setRefresh((value) => value + 1) }}>
          <RefreshCw className="size-4" />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-3xl space-y-3 p-4">
          {task.goal ? <p className="whitespace-pre-wrap break-words rounded-md bg-panel-2 px-3 py-2 text-sm text-ink-soft">{task.goal}</p> : null}
          {error ? <p role="alert" className="break-words text-sm text-danger">{error}</p> : null}
          {pending ? <p role="status" className="text-xs text-muted">{t('panel.taskHistoryLoading')}</p> : null}
          {!pending && !error && !history?.items.length ? <p className="text-xs text-muted">{t('panel.taskHistoryEmpty')}</p> : null}
          {history?.next_before ? (
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => {
              if (before === history.next_before) setRefresh((value) => value + 1)
              else setBefore(history.next_before)
            }}>{t('panel.taskHistoryOlder')}</Button>
          ) : null}
          <ol className="space-y-2">
            {history?.items.map((item) => {
              const label = item.kind === 'user' ? t('panel.taskHistoryUser')
                : item.kind === 'tool_use' ? t('panel.taskHistoryToolCall')
                : item.kind === 'tool_result' ? t(item.is_error ? 'panel.taskHistoryToolError' : 'panel.taskHistoryToolResult')
                : focus.sessionTitle || t('panel.mainAgent')
              return (
                <li key={item.id} className="rounded-md border border-line-soft px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className={item.is_error ? 'text-danger' : 'text-ink-soft'}>{label}{item.tool ? ` · ${item.tool}` : ''}</span>
                    <time dateTime={item.at} className="ml-auto">{new Date(item.at).toLocaleString()}</time>
                  </div>
                  {item.text ? <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{item.text}</p> : null}
                </li>
              )
            })}
          </ol>
        </div>
      </ScrollArea>
    </section>
  )
}
