// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { ArrowUpRight, Clock3 } from 'lucide-react'
import type { Task } from '@/lib/console'
import { formatRelative, taskTimestamp } from '@/lib/dashboard'
import { useI18n, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { EnginePill, MiniProgress, Panel, PanelAction, PanelHeader, TaskStatusPill } from './Primitives'

const HEADERS = ['overview.colTask', 'overview.colStatus', 'overview.colEngine', 'overview.colProgress', 'overview.colInFlight', 'overview.colLastActivity'] as const

export function TaskTable({ tasks, onOpenTasks }: { tasks: Task[]; onOpenTasks: () => void }): React.JSX.Element {
  const t = useT()
  const locale = useI18n((state) => state.locale)
  const recent = [...tasks].sort((a, b) => taskTimestamp(b) - taskTimestamp(a)).slice(0, 5)

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        icon={<Clock3 className="h-3.5 w-3.5" />}
        title={t('overview.taskTable')}
        meta={t('overview.taskCount', { count: tasks.length })}
        actions={<PanelAction label={t('overview.viewAll')} icon={<ArrowUpRight className="h-3 w-3" />} onClick={onOpenTasks} />}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-line-soft">
              {HEADERS.map((key) => (
                <th
                  key={key}
                  className="whitespace-nowrap px-4 py-2 text-left font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-muted/80"
                >
                  {t(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr>
                <td colSpan={HEADERS.length} className="px-4 py-10 text-center text-[11px] text-muted">
                  {t('overview.noTasks')}
                </td>
              </tr>
            ) : (
              recent.map((task) => {
                const pct = task.goals_total ? Math.round(((task.goals_met ?? 0) / task.goals_total) * 100) : null
                return (
                  <tr key={task.id} className="border-b border-line-soft transition-colors last:border-0 hover:bg-panel-2/40">
                    <td className="max-w-[340px] px-4 py-2.5">
                      <button type="button" onClick={onOpenTasks} className="group block w-full text-left">
                        <span className="block truncate text-[11.5px] font-medium text-ink-soft group-hover:text-ink group-hover:underline">
                          {task.name || task.description || task.id}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[9.5px] text-muted">{task.id}</span>
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <TaskStatusPill status={task.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <EnginePill mode={task.engine_mode ?? 'idle'} />
                    </td>
                    <td className="px-4 py-2.5">
                      {pct !== null ? (
                        <div className="flex items-center gap-2">
                          <MiniProgress value={pct} />
                          <span className="font-mono text-[10px] tabular-nums text-muted">
                            {task.goals_met ?? 0}/{task.goals_total}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {(task.in_flight ?? 0) > 0 ? (
                        <span className={cn('font-mono text-[11px] font-semibold text-accent')}>{task.in_flight}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[10px] tabular-nums text-muted">
                      {formatRelative(task.last_activity_unix || task.created_unix, locale)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
