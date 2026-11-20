// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { Activity, Bug, ChevronRight, CircleDot, Network, Target } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { useAppStore } from '@/store/app'
import { cn } from '@/lib/utils'
import { Button, ScrollArea } from '@/components/ui'
import { consoleRequest, type Finding, type FindingsPage, type FindingStats, type Severity, type Stats, type Task, type TrafficPage } from '@/lib/console'
import { BackendGate, ErrorRow, LoadingRow, PageHeader, RefreshButton, SeverityBadge, StatusBadge } from './common'

function Metric({ label, value, icon, hint }: { label: string; value: React.ReactNode; icon: React.ReactNode; hint?: string }): React.JSX.Element {
  return <div className="rounded-xl border border-line bg-panel-2/50 p-4"><div className="flex items-center gap-2 text-muted">{icon}<span className="text-[11px]">{label}</span></div><div className="mt-3 text-2xl font-semibold tracking-tight text-ink">{value}</div>{hint ? <div className="mt-1 font-mono text-[10px] text-muted/70">{hint}</div> : null}</div>
}

export function OverviewView(): React.JSX.Element {
  const t = useT()
  const backend = useAppStore((state) => state.backend)
  const setView = useAppStore((state) => state.setView)
  const [state, setState] = useState<{ stats: Stats | null; tasks: Task[]; findings: FindingStats | null; recentFindings: Finding[]; assets: number; traffic: number; loading: boolean; error: string | null }>({ stats: null, tasks: [], findings: null, recentFindings: [], assets: 0, traffic: 0, loading: true, error: null })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!backend?.connected) return
    let active = true
    setState((previous) => ({ ...previous, loading: true, error: null }))
    Promise.all([
      consoleRequest<Stats>('/stats'),
      consoleRequest<{ tasks: Task[] }>('/tasks'),
      consoleRequest<FindingStats>('/exploration/findings/stats'),
      consoleRequest<Record<string, number>>('/assets/counts'),
      consoleRequest<TrafficPage>('/traffic?page=0&size=1'),
      consoleRequest<FindingsPage>('/exploration/findings?page=1&limit=5')
    ])
      .then(([stats, tasks, findings, assets, traffic, recent]) => {
        if (!active) return
        setState({ stats, tasks: tasks.tasks ?? [], findings, recentFindings: recent.items ?? [], assets: Object.values(assets ?? {}).reduce((sum, value) => sum + Number(value || 0), 0), traffic: traffic.total ?? traffic.count ?? 0, loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (active) setState((previous) => ({ ...previous, loading: false, error: error instanceof Error ? error.message : String(error) }))
      })
    return () => { active = false }
  }, [backend?.connected, nonce])

  if (!backend?.connected) return <BackendGate />
  const activeTasks = state.tasks.filter((task) => ['running', 'queued', 'paused'].includes(task.status)).length
  const recent = [...state.tasks].sort((a, b) => (b.updated_at ?? b.created_at ?? '').localeCompare(a.updated_at ?? a.created_at ?? '')).slice(0, 6)
  const max = Math.max(1, ...(['critical', 'high', 'medium', 'low'] as Severity[]).map((item) => state.findings?.[item] ?? 0))

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title={t('overview.title')} subtitle={t('overview.subtitle')} actions={<RefreshButton onClick={() => setNonce((value) => value + 1)} loading={state.loading} />} />
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-6">
          {state.error ? <ErrorRow message={state.error} retry={() => setNonce((value) => value + 1)} /> : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label={t('overview.activeTasks')} value={activeTasks} icon={<Target className="h-3.5 w-3.5" />} hint={t('overview.taskTotal', { count: state.tasks.length })} />
            <Metric label={t('overview.findings')} value={state.findings?.total ?? 0} icon={<Bug className="h-3.5 w-3.5" />} hint={t('overview.criticalCount', { count: state.findings?.critical ?? 0 })} />
            <Metric label={t('overview.assets')} value={state.assets} icon={<Network className="h-3.5 w-3.5" />} />
            <Metric label={t('overview.traffic')} value={state.traffic} icon={<Activity className="h-3.5 w-3.5" />} />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
            <section className="rounded-xl border border-line bg-panel/40">
              <div className="flex items-center justify-between border-b border-line-soft px-4 py-3"><h2 className="text-xs font-semibold text-ink">{t('overview.recentTasks')}</h2><Button variant="ghost" size="sm" onClick={() => setView('tasks')}>{t('nav.tasks')}</Button></div>
              {state.loading && recent.length === 0 ? <LoadingRow label={t('app.loading')} /> : recent.length === 0 ? <div className="px-4 py-10 text-center text-xs text-muted">{t('overview.noData')}</div> : (
                <div className="divide-y divide-line-soft">
                  {recent.map((task) => (
                    <button key={task.id} type="button" onClick={() => setView('tasks')} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-panel-2/60">
                      <CircleDot className="h-3.5 w-3.5 shrink-0 text-muted" />
                      <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium text-ink-soft">{task.name || task.description || task.id}</div><div className="mt-0.5 truncate font-mono text-[10px] text-muted">{task.goal || task.id}</div></div>
                      <StatusBadge status={task.status} />
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-line bg-panel/40">
              <div className="border-b border-line-soft px-4 py-3"><h2 className="text-xs font-semibold text-ink">{t('overview.severity')}</h2></div>
              {state.findings ? <div className="space-y-3 p-4">
                {(['critical', 'high', 'medium', 'low'] as Severity[]).map((severity) => {
                  const value = state.findings?.[severity] ?? 0
                  return <div key={severity}><div className="mb-1 flex items-center justify-between"><SeverityBadge severity={severity} /><span className="font-mono text-[11px] text-muted">{value}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-panel-3"><div className={cn('h-full rounded-full', severity === 'critical' ? 'bg-danger' : severity === 'high' ? 'bg-warn' : severity === 'medium' ? 'bg-accent' : 'bg-muted/50')} style={{ width: `${Math.max(4, (value / max) * 100)}%` }} /></div></div>
                })}
              </div> : <LoadingRow label={t('app.loading')} />}
            </section>
          </div>

          <section className="mt-5 overflow-hidden rounded-xl border border-line bg-panel/40">
            <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
              <h2 className="text-xs font-semibold text-ink">{t('overview.recentFindings')}</h2>
              <Button variant="ghost" size="sm" onClick={() => setView('findings')}>{t('nav.findings')}</Button>
            </div>
            {state.recentFindings.length === 0 ? <div className="px-4 py-8 text-center text-xs text-muted">{t('overview.noData')}</div> : (
              <div className="divide-y divide-line-soft">
                {state.recentFindings.map((finding) => (
                  <button key={finding.id} type="button" onClick={() => setView('findings')} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-panel-2/60">
                    <SeverityBadge severity={finding.severity} />
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">{finding.name || finding.vulnclass}</span>
                    <span className="hidden max-w-[40%] truncate font-mono text-[10px] text-muted sm:block">{finding.assets?.[0]?.label ?? finding.vulnclass}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
