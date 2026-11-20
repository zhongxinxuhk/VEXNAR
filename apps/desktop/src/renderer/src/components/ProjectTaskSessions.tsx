// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { consoleRequest } from '@/lib/console'
import { useT } from '@/lib/i18n'
import { projectTaskRoute, type ProjectTaskFocus } from '@/lib/project-task'
import { useAppStore } from '@/store/app'
import { Button } from '@/components/ui'
import { StatusBadge } from './console/common'

type Branch = { id: string; key: string; title: string; status: string }
type SessionsPage = { main_segments: number[]; branches: Branch[]; next_before: string | null }

export function ProjectTaskSessions({ focus }: { focus: ProjectTaskFocus }): React.JSX.Element {
  const t = useT()
  const selectSession = useAppStore((state) => state.setProjectTaskSession)
  const [page, setPage] = useState<SessionsPage | null>(null)
  const [before, setBefore] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState('')
  const { projectId, task } = focus

  useEffect(() => {
    let active = true
    setPending(true)
    setError('')
    const route = `${projectTaskRoute(projectId, task.id)}/sessions`
    void consoleRequest<SessionsPage>(before ? `${route}?before=${before}` : route).then((next) => {
      if (active) setPage((previous) => before && previous ? { ...next, branches: [...previous.branches, ...next.branches] } : next)
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : String(err))
    }).finally(() => {
      if (active) setPending(false)
    })
    return () => { active = false }
  }, [projectId, task.id, before, retry])

  const row = 'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-ink-soft hover:bg-panel-2 aria-[pressed=true]:bg-panel-3 aria-[pressed=true]:text-ink'
  return (
    <section className="space-y-2 border-t border-line-soft pt-3" aria-label={t('app.projectSessions')}>
      <button type="button" className={row} aria-pressed={focus.sessionKey === 'main'} onClick={() => selectSession('main')}>
        {t('panel.mainAgent')}
      </button>
      {page?.main_segments.slice(1).map((segment) => {
        const key = `main:${segment}`
        const title = t('panel.mainAgentSegment', { number: String(segment + 1) })
        return <button key={key} type="button" className={row} aria-pressed={focus.sessionKey === key} onClick={() => selectSession(key, title)}>{title}</button>
      })}
      <h3 className="px-2 text-xs font-medium text-muted">{t('panel.taskBranches')}</h3>
      {page?.branches.map((branch) => {
        const title = branch.title || t('panel.taskBranch', { id: branch.id })
        return (
          <button key={branch.key} type="button" className={row} aria-pressed={focus.sessionKey === branch.key} title={title} onClick={() => selectSession(branch.key, title)}>
            <span className="min-w-0 flex-1 truncate">{title}</span><StatusBadge status={branch.status} />
          </button>
        )
      })}
      {pending ? <p role="status" className="px-2 text-xs text-muted">{t('panel.taskHistoryLoading')}</p> : null}
      {!pending && page && !page.branches.length && !page.next_before ? <p className="px-2 text-xs text-muted">{t('panel.taskBranchesEmpty')}</p> : null}
      {error ? (
        <div className="space-y-2 px-2 text-xs text-danger">
          <p role="alert">{error}</p>
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => setRetry((value) => value + 1)}>{t('panel.projectRetry')}</Button>
        </div>
      ) : page?.next_before ? (
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => setBefore(page.next_before)}>{t('panel.projectTasksMore')}</Button>
      ) : null}
    </section>
  )
}
