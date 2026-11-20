// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Pin } from 'lucide-react'
import { consoleRequest } from '@/lib/console'
import { useT } from '@/lib/i18n'
import { projectTaskRoute, projectTaskStatus, projectTaskTitle, type ProjectTask } from '@/lib/project-task'
import { useAppStore } from '@/store/app'
import { Button, Input, ScrollArea } from '@/components/ui'
import { ProjectTaskSessions } from './ProjectTaskSessions'
import { StatusBadge } from './console/common'

type Project = { id: string; name: string }
type ProjectTaskPage = { tasks: ProjectTask[]; next_before: string | null }

export function ProjectTasks({ workspace }: { workspace: string }): React.JSX.Element {
  const t = useT()
  const [project, setProject] = useState<Project | null>(null)
  const [page, setPage] = useState<ProjectTaskPage | null>(null)
  const focus = useAppStore((state) => state.taskFocus)
  const openTask = useAppStore((state) => state.openProjectTask)
  const closeTask = useAppStore((state) => state.closeProjectTask)
  const selected = focus?.workspace === workspace ? focus.task : null
  const mounted = useRef(false)
  const [taskId, setTaskId] = useState('')
  const [pending, setPending] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if (!workspace) return
    let active = true
    void (async () => {
      setPending(true)
      setError('')
      try {
        const registered = await consoleRequest<Project>('/desktop/projects', 'POST', { root_path: workspace })
        if (!active) return
        const firstPage = await consoleRequest<ProjectTaskPage>(projectTaskRoute(registered.id))
        if (!active) return
        setProject(registered)
        setPage(firstPage)
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (active) setPending(false)
      }
    })()
    return () => { active = false }
  }, [workspace, reload])

  async function bindTask(): Promise<void> {
    const id = taskId.trim()
    if (!project || pending || !/^[1-9]\d{0,18}$/.test(id)) return
    setPending(true)
    setError('')
    try {
      const route = projectTaskRoute(project.id, id)
      await consoleRequest(route, 'PUT')
      const task = await consoleRequest<ProjectTask>(route)
      const firstPage = await consoleRequest<ProjectTaskPage>(projectTaskRoute(project.id))
      setPage(firstPage)
      if (mounted.current) openTask({ workspace, projectId: project.id, projectName: project.name, task, sessionKey: 'main' })
      setTaskId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  async function loadMore(): Promise<void> {
    if (!project || !page?.next_before || pending) return
    setPending(true)
    setError('')
    try {
      const next = await consoleRequest<ProjectTaskPage>(`${projectTaskRoute(project.id)}?before=${page.next_before}`)
      setPage({ ...next, tasks: [...page.tasks, ...next.tasks] })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  if (!workspace) return <p className="p-4 text-xs text-muted">{t('panel.selectFolder')}</p>

  return (
    <div className="flex h-full flex-col" data-testid="project-tasks" aria-busy={pending}>
      <div className="border-b border-line-soft px-3 py-2">
        <div className="truncate text-xs font-medium text-ink" title={workspace}>{project?.name || workspace}</div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          {error ? (
            <div role="alert" className="space-y-2 break-words text-xs text-danger">
              <p>{error}</p>
              {!project ? <Button size="sm" variant="secondary" onClick={() => setReload((value) => value + 1)}>{t('panel.projectRetry')}</Button> : null}
            </div>
          ) : null}
          {pending && !page ? <p role="status" className="text-xs text-muted">{t('panel.projectTasksLoading')}</p> : null}
          {selected ? (
            <div className="space-y-2">
              <Button variant="ghost" size="sm" onClick={closeTask}>
                <ArrowLeft className="size-3.5" />{t('panel.projectTasks')}
              </Button>
              <h2 className="break-words text-sm font-medium text-ink">{projectTaskTitle(selected)}</h2>
              <div className="flex items-center gap-2 text-xs text-muted">
                #{selected.id}<StatusBadge status={projectTaskStatus(selected)} />
              </div>
              {selected.goal ? (
                <div className="space-y-1 text-xs">
                  <h3 className="font-medium text-ink">{t('tasks.goalLabel')}</h3>
                  <p className="whitespace-pre-wrap break-words text-ink-soft">{selected.goal}</p>
                </div>
              ) : null}
              {focus ? <ProjectTaskSessions key={focus.task.id} focus={focus} /> : null}
              {selected.name && selected.description ? <p className="whitespace-pre-wrap break-words text-xs text-ink-soft">{selected.description}</p> : null}
            </div>
          ) : page ? (
            <>
              <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void bindTask() }}>
                <label className="min-w-24 flex-1 text-xs text-muted">
                  {t('panel.projectTaskId')}
                  <Input value={taskId} onChange={(event) => setTaskId(event.target.value)} inputMode="numeric" maxLength={19}
                    className="mt-1" />
                </label>
                <Button size="sm" variant="secondary" disabled={pending || !/^[1-9]\d{0,18}$/.test(taskId.trim())} type="submit">
                  {t('panel.bindProjectTask')}
                </Button>
              </form>
              {page.tasks.length === 0 ? <p className="text-xs text-muted">{t('panel.projectTasksEmpty')}</p> : null}
              <ul className="space-y-1">
                {page.tasks.map((task) => (
                  <li key={task.id}>
                    <button type="button" onClick={() => {
                      if (project) openTask({ workspace, projectId: project.id, projectName: project.name, task, sessionKey: 'main' })
                    }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-panel-2">
                      <span className="text-xs text-muted">#{task.id}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-ink">{projectTaskTitle(task)}</span>
                      {task.pinned ? <Pin className="size-3.5 text-muted" /> : null}
                    </button>
                  </li>
                ))}
              </ul>
              {page.next_before ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => void loadMore()}>{t('panel.projectTasksMore')}</Button> : null}
            </>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
