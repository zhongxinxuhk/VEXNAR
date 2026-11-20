// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMemo, useState } from 'react'
import { Bot, CircleDot, Loader2, Play, Plus, Search } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { useAppStore } from '@/store/app'
import { formatDate, consoleRequest, type Task } from '@/lib/console'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, ScrollArea, Textarea } from '@/components/ui'
import { BackendGate, ErrorRow, LoadingRow, PageHeader, RefreshButton, StatusBadge, useResource } from './common'

function CreateTaskDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }): React.JSX.Element {
  const t = useT()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [goal, setGoal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    if (!description.trim() || !goal.trim()) return
    setSaving(true)
    setError(null)
    try {
      await consoleRequest('/tasks', 'POST', {
        name: name.trim(),
        description: description.trim(),
        goal: goal.trim(),
        llm_profile_ids: [],
        source_task_ids: [],
        company_ids: [],
        timeout_seconds: 0,
        seed_first_intent: false,
        plan_heartbeat_seconds: 0,
        coverage_enabled: true,
        intercept_rules: []
      })
      setName('')
      setDescription('')
      setGoal('')
      onOpenChange(false)
      onCreated()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('tasks.new')}</DialogTitle>
          <DialogDescription>{t('tasks.createHint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-[11px] text-muted">{t('tasks.name')}<Input value={name} onChange={(event) => setName(event.target.value)} className="mt-1" placeholder={t('tasks.namePlaceholder')} /></label>
          <label className="block text-[11px] text-muted">{t('tasks.description')}<Textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 min-h-[76px]" placeholder={t('tasks.descriptionPlaceholder')} /></label>
          <label className="block text-[11px] text-muted">{t('tasks.goalLabel')}<Textarea value={goal} onChange={(event) => setGoal(event.target.value)} className="mt-1 min-h-[110px]" placeholder={t('tasks.goalPlaceholder')} /></label>
          {error ? <div className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 font-mono text-[10px] text-danger">{error}</div> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('app.cancel')}</Button>
          <Button onClick={() => void submit()} disabled={saving || !description.trim() || !goal.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t('tasks.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TasksView(): React.JSX.Element {
  const t = useT()
  const backend = useAppStore((state) => state.backend)
  const askAgent = useAppStore((state) => state.askAgent)
  const resource = useResource<{ tasks: Task[] }>('/tasks')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const tasks = useMemo(() => {
    const value = query.trim().toLowerCase()
    return (resource.data?.tasks ?? [])
      .filter((task) => !value || [task.name, task.description, task.goal, task.id].some((item) => item?.toLowerCase().includes(value)))
      .sort((a, b) => (b.updated_at ?? b.created_at ?? '').localeCompare(a.updated_at ?? a.created_at ?? ''))
  }, [resource.data, query])
  if (!backend?.connected) return <BackendGate />

  const control = async (task: Task, action: 'pause' | 'resume'): Promise<void> => {
    setBusy(task.id)
    setError(null)
    try {
      await consoleRequest(`/tasks/${encodeURIComponent(task.id)}/control`, 'POST', { action })
      resource.reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title={t('tasks.title')}
        subtitle={t('tasks.subtitle')}
        actions={
          <>
            <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" />{t('tasks.new')}</Button>
            <RefreshButton onClick={resource.reload} loading={resource.loading} />
          </>
        }
      />
      <div className="flex items-center gap-2 border-b border-line-soft px-6 py-2.5">
        <Search className="h-3.5 w-3.5 text-muted" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('tasks.search')} className="h-8 max-w-md border-0 bg-transparent px-1 text-xs" />
        <span className="ml-auto font-mono text-[10px] text-muted">{tasks.length} / {resource.data?.tasks.length ?? 0}</span>
      </div>
      <ScrollArea className="min-h-0 flex-1"><div className="p-6">
        {error ? <ErrorRow message={error} /> : null}
        {resource.error ? <ErrorRow message={resource.error} retry={resource.reload} /> : null}
        {resource.loading && !resource.data ? <LoadingRow label={t('tasks.loading')} /> : tasks.length === 0 ? <div className="py-16 text-center text-xs text-muted">{t('tasks.empty')}</div> : (
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="grid grid-cols-[minmax(0,2fr)_100px_120px_170px] gap-3 border-b border-line bg-panel-2/60 px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-muted"><span>{t('tasks.goal')}</span><span>{t('tasks.status')}</span><span>{t('tasks.findings')}</span><span>{t('tasks.updated')}</span></div>
            {tasks.map((task) => (
              <div key={task.id} className="grid grid-cols-[minmax(0,2fr)_100px_120px_170px] items-center gap-3 border-b border-line-soft px-4 py-3 last:border-0 hover:bg-panel-2/30">
                <div className="min-w-0"><div className="truncate text-xs font-medium text-ink">{task.name || task.description || task.id}</div><div className="mt-0.5 truncate font-mono text-[10px] text-muted">{task.goal || task.id}</div></div>
                <StatusBadge status={task.status} />
                <div className="flex gap-2 font-mono text-[10px] text-muted"><span className="text-danger">{task.findings?.critical ?? 0}</span><span className="text-warn">{task.findings?.high ?? 0}</span><span>{task.findings?.medium ?? 0}</span><span>{task.findings?.low ?? 0}</span></div>
                <div className="flex items-center gap-1"><span className="mr-auto font-mono text-[10px] text-muted">{formatDate(task.updated_at || task.last_activity)}</span>
                  {task.status === 'running' || task.status === 'queued' ? <Button size="sm" variant="ghost" disabled={busy === task.id} onClick={() => void control(task, 'pause')} aria-label={t('tasks.pause')}><CircleDot className="h-3.5 w-3.5" /></Button> : task.status === 'paused' ? <Button size="sm" variant="ghost" disabled={busy === task.id} onClick={() => void control(task, 'resume')} aria-label={t('tasks.resume')}><Play className="h-3.5 w-3.5" /></Button> : null}
                  <Button size="sm" variant="ghost" onClick={() => void askAgent(t('tasks.askPrompt', { name: task.name || task.description || task.id }))} aria-label={t('tasks.ask')}><Bot className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div></ScrollArea>
      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={resource.reload} />
    </div>
  )
}
