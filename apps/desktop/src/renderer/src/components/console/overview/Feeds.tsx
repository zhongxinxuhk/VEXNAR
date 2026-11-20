// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  Activity,
  ArrowUpRight,
  Brain,
  Bug,
  CornerDownRight,
  Flag,
  MessageSquareText,
  Wrench
} from 'lucide-react'
import type { Finding } from '@/lib/console'
import { formatRelative, type ActivityItem } from '@/lib/dashboard'
import { useI18n, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { SeverityBadge } from '../common'
import { EmptyState, Panel, PanelAction, PanelHeader } from './Primitives'

const KIND_ORDER = ['tool_use', 'tool_result', 'text', 'thinking', 'result'] as const

function workerDot(worker: string): string {
  if (worker === 'planner') return 'bg-violet-500'
  if (worker === 'mainagent' || worker === 'main') return 'bg-cyan-400'
  return 'bg-blue-500'
}

function ActivityGlyph({ kind }: { kind: string }): React.JSX.Element {
  const className = 'h-3 w-3 shrink-0'
  if (kind === 'tool_use') return <Wrench className={className} />
  if (kind === 'tool_result') return <CornerDownRight className={className} />
  if (kind === 'thinking') return <Brain className={className} />
  if (kind === 'text') return <MessageSquareText className={className} />
  if (kind === 'result') return <Flag className={className} />
  return <Activity className={className} />
}

function kindLabel(item: ActivityItem): string {
  if (item.kind === 'tool_use') return item.tool ?? 'tool_use'
  return item.kind
}

export function ActivityPanel({
  items,
  onOpenTasks
}: {
  items: ActivityItem[]
  onOpenTasks: () => void
}): React.JSX.Element {
  const t = useT()
  const locale = useI18n((state) => state.locale)
  const events = items.filter((item) => item.kind !== 'usage')
  const recent = [...events].sort((a, b) => b.seq - a.seq).slice(0, 6)
  const counts = KIND_ORDER.map((kind) => ({ kind, count: events.filter((item) => item.kind === kind).length })).filter(
    (entry) => entry.count > 0
  )

  return (
    <Panel className="flex min-w-0 flex-col">
      <PanelHeader
        icon={<Activity className="h-3.5 w-3.5" />}
        title={t('overview.activityFeed')}
        meta={t('overview.events', { count: events.length })}
        actions={<PanelAction label={t('overview.viewTasks')} icon={<ArrowUpRight className="h-3 w-3" />} onClick={onOpenTasks} />}
      />
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-2">
        {counts.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 border-b border-line-soft py-2">
            {counts.map(({ kind, count }) => (
              <span
                key={kind}
                className="rounded border border-line bg-panel-2/40 px-1.5 py-0.5 font-mono text-[9px] text-muted"
              >
                {kind} <strong className="font-semibold text-ink-soft">{count}</strong>
              </span>
            ))}
          </div>
        ) : null}

        {recent.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-8 text-center">
            <Activity className="h-4 w-4 text-muted/40" />
            <div className="text-[11px] text-muted">{t('overview.noActivity')}</div>
            <div className="max-w-[280px] text-[10px] leading-relaxed text-muted/70">{t('overview.noActivityHint')}</div>
          </div>
        ) : (
          <div className="divide-y divide-line-soft">
            {recent.map((item) => (
              <div key={item.seq} className="flex items-start gap-2.5 py-2">
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-panel-2/50 px-1.5 py-0.5 font-mono text-[9px] text-ink-soft">
                  <span className={cn('size-1.5 rounded-full', workerDot(item.worker))} />
                  {item.worker}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-soft">
                    <span className="text-muted/70">
                      <ActivityGlyph kind={item.kind} />
                    </span>
                    <span className="truncate">{kindLabel(item)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-muted">{item.summary}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="rounded border border-line bg-panel-2/40 px-1 py-0 font-mono text-[8.5px] leading-4 text-muted">
                    {item.kind}
                  </span>
                  <span className="font-mono text-[9px] tabular-nums text-muted">{formatRelative(item.ts, locale)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}

export function FindingsPanel({
  findings,
  onOpenAll
}: {
  findings: Finding[]
  onOpenAll: () => void
}): React.JSX.Element {
  const t = useT()
  const locale = useI18n((state) => state.locale)
  const recent = [...findings].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, 8)

  return (
    <Panel className="flex min-w-0 flex-col">
      <PanelHeader
        icon={<Bug className="h-3.5 w-3.5" />}
        title={t('overview.recentFindings')}
        meta={t('overview.findingCount', { count: recent.length })}
        actions={<PanelAction label={t('overview.viewAll')} icon={<ArrowUpRight className="h-3 w-3" />} onClick={onOpenAll} />}
      />
      <div className="min-h-0 flex-1 px-4 pb-2">
        {recent.length === 0 ? (
          <EmptyState label={t('overview.noFindings')} className="flex-1" />
        ) : (
          <div className="divide-y divide-line-soft">
            {recent.map((finding) => (
              <div key={finding.id} className="flex items-start gap-2.5 py-2">
                <SeverityBadge severity={finding.severity} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-baseline gap-1.5">
                    <span className="min-w-0 truncate text-[11px] font-semibold text-ink-soft">{finding.vulnclass}</span>
                    {finding.task_description ? (
                      <span className="max-w-[42%] shrink-0 truncate text-[9.5px] text-muted">{finding.task_description}</span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted">{finding.summary}</div>
                </div>
                <span className="shrink-0 pt-0.5 font-mono text-[9px] tabular-nums text-muted">
                  {formatRelative(finding.ts, locale)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}
