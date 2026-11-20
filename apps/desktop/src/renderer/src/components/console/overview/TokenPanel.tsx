// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { ChartColumn, Grid3X3, Zap } from 'lucide-react'
import {
  activeProfileId,
  compactNumber,
  type DailyTokenPoint,
  formatTokens,
  TOKEN_RANGES,
  type TokenBucket,
  type TokenRangeDays,
  type TokenSource,
  type TokenTab,
  type LLMProfileRow
} from '@/lib/dashboard'
import type { MessageKey } from '@/lib/i18n'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { ActivityHeatmap } from '@/components/agent-ui/ActivityHeatmap'
import { Breakdown, type BreakdownRow } from '@/components/agent-ui/Breakdown'
import { EmptyState, Panel } from './Primitives'
import { TOKEN_SERIES, UsageChart, UsageLegend } from './UsageChart'

const RANGE_LABEL: Record<TokenRangeDays, MessageKey> = {
  7: 'overview.range7',
  30: 'overview.range30',
  90: 'overview.range90',
  180: 'overview.range180',
  365: 'overview.range365'
}

const PROFILE_COLORS = [
  'hsl(217 91% 60%)',
  'hsl(263 70% 60%)',
  'hsl(160 60% 45%)',
  'hsl(38 92% 50%)',
  'hsl(330 70% 55%)',
  'hsl(190 80% 45%)'
]

const UNASSIGNED_COLOR = 'hsl(220 9% 55%)'

function CacheRing({ value, tone }: { value: number; tone: string }): React.JSX.Element {
  const radius = 15
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.max(0, Math.min(100, value)) / 100)
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" className={cn('-rotate-90', tone)} aria-hidden="true">
      <circle cx="19" cy="19" r={radius} fill="none" stroke="var(--color-panel-3)" strokeWidth="3.5" />
      <circle
        cx="19"
        cy="19"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  )
}

export function TokenPanel({
  profiles,
  buckets,
  totals,
  daily,
  heatmapDays,
  source,
  tab,
  days,
  loading,
  onSourceChange,
  onTabChange,
  onDaysChange
}: {
  profiles: LLMProfileRow[]
  buckets: Map<number | null, TokenBucket>
  totals: TokenBucket
  daily: DailyTokenPoint[]
  /** Always the trailing year, independent of the chart range switch. */
  heatmapDays: DailyTokenPoint[]
  source: TokenSource
  tab: TokenTab
  days: TokenRangeDays
  loading?: boolean
  onSourceChange: (source: TokenSource) => void
  onTabChange: (tab: TokenTab) => void
  onDaysChange: (days: TokenRangeDays) => void
}): React.JSX.Element {
  const t = useT()
  const [view, setView] = useState<'bars' | 'heatmap'>('bars')
  const defaultProfileId = activeProfileId(profiles)
  const total = totals.input + totals.output
  const hitRate = totals.input > 0 ? Math.round((totals.cacheRead / totals.input) * 100) : 0
  const hasDaily = daily.some((point) => point.input + point.output + point.cacheRead > 0)

  const breakdown = [
    {
      label: t('overview.inputMiss'),
      value: Math.max(0, totals.input - totals.cacheRead),
      color: TOKEN_SERIES[0].color
    },
    { label: t('overview.cacheHit'), value: totals.cacheRead, color: TOKEN_SERIES[2].color },
    { label: t('overview.output'), value: totals.output, color: TOKEN_SERIES[1].color }
  ]

  // Input already includes cache reads, so cache is not added a second time
  // here; the calendar counts tokens spent, not cache hits.
  const heatValues = heatmapDays.map((point) => ({
    date: point.date,
    value: point.input + point.output
  }))
  const heatTotal = heatValues.reduce((sum, point) => sum + point.value, 0)
  const heatPeak = heatValues.reduce<{ date: string; value: number }>(
    (best, point) => (point.value > best.value ? point : best),
    { date: '', value: 0 }
  )
  const hasHeat = heatTotal > 0

  // Profile shares are independent of the selected tab: the bar is the whole
  // cut, while the tabs filter the headline number and the chart.
  const profileRowsAll = [...buckets.entries()]
    .map(([id, bucket]) => {
      const profile = id === null ? undefined : profiles.find((item) => Number(item.id) === id)
      const index = profile ? profiles.indexOf(profile) : -1
      return {
        id,
        key: String(id ?? 'unassigned'),
        label: profile?.name ?? (id === null ? t('overview.profileUnassigned') : `#${id}`),
        value: bucket.input + bucket.output,
        color: id === null ? UNASSIGNED_COLOR : PROFILE_COLORS[Math.max(0, index) % PROFILE_COLORS.length],
        selected: id !== null && tab === id
      }
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)

  const profileRows: BreakdownRow[] = profileRowsAll.slice(0, 5).map((row) => ({
    id: row.key,
    label: row.label,
    value: row.value,
    color: row.color,
    selected: row.selected,
    ...(row.id === null ? {} : { onSelect: () => onTabChange(row.id as number) })
  }))
  const restValue = profileRowsAll.slice(5).reduce((sum, row) => sum + row.value, 0)
  if (restValue > 0) {
    profileRows.push({
      id: 'other',
      label: t('overview.profileOther'),
      value: restValue,
      color: 'hsl(220 9% 65%)'
    })
  }
  const profileTotal = profileRowsAll.reduce((sum, row) => sum + row.value, 0)

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line-soft px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md border border-warn/20 bg-warn/10 text-warn">
            <Zap className="h-3.5 w-3.5" />
          </span>
          <span className="text-[11.5px] font-semibold text-ink">{t('overview.tokenPanel')}</span>
          <div className="flex gap-0.5 rounded-md border border-line bg-panel-2/50 p-0.5">
            {(['old', 'new'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onSourceChange(value)}
                title={value === 'new' ? t('overview.sourceNewHint') : t('overview.sourceOldHint')}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors',
                  source === value ? 'bg-bg text-ink shadow-sm' : 'text-muted hover:text-ink'
                )}
              >
                {t(value === 'new' ? 'overview.sourceNew' : 'overview.sourceOld')}
              </button>
            ))}
          </div>
          <span className="font-mono text-[9px] text-muted/80">{source === 'new' ? 'llm_usage' : 'activity'}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => onTabChange('all')}
            className={cn(
              'rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors',
              tab === 'all' ? 'bg-ink text-bg' : 'bg-panel-2/60 text-muted hover:text-ink'
            )}
          >
            {t('overview.profileAll')}
          </button>
          {profiles.map((profile) => {
            const key = Number(profile.id)
            if (!Number.isFinite(key)) return null
            const resolved = buckets.has(key) ? key : profile.is_default ? defaultProfileId ?? key : key
            const hasData = buckets.has(key) || (Boolean(profile.is_default) && defaultProfileId !== null && buckets.has(defaultProfileId))
            const selected = tab === resolved
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => onTabChange(resolved)}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors',
                  selected ? 'bg-ink text-bg' : 'bg-panel-2/60 text-muted hover:text-ink',
                  !hasData && 'opacity-40'
                )}
              >
                {profile.name}
                {profile.is_default ? (
                  <span
                    className={cn(
                      'rounded px-1 py-px text-[8px] leading-3',
                      selected ? 'bg-bg/20 text-bg' : 'bg-accent-2/15 text-accent-2'
                    )}
                  >
                    {t('overview.profileDefault')}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-5 p-4 lg:grid-cols-[228px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <div className="text-[10px] text-muted">{t('overview.totalTokens')}</div>
            <div className="mt-1 text-[30px] font-semibold leading-none tracking-tight tabular-nums text-ink">
              {formatTokens(total)}
            </div>
            <div className="mt-1.5 text-[10px] text-muted">{t('overview.taskUnit', { count: totals.tasks })}</div>
          </div>

          <div className="space-y-3">
            {breakdown.map((row) => {
              const pct = total > 0 ? (row.value / total) * 100 : 0
              return (
                <div key={row.label}>
                  <div className="mb-1 flex items-center justify-between text-[10px]">
                    <span className="text-muted">{row.label}</span>
                    <span className="font-mono font-semibold tabular-nums" style={{ color: row.color }}>
                      {formatTokens(row.value)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-panel-3">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: row.color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-panel-2/40 px-3 py-2">
            <CacheRing value={hitRate} tone={hitRate > 50 ? 'text-accent-2' : 'text-warn'} />
            <div className="min-w-0">
              <div className="text-[10px] text-muted">{t('overview.cacheRate')}</div>
              <div className={cn('text-sm font-semibold tabular-nums', hitRate > 50 ? 'text-accent-2' : 'text-warn')}>
                {hitRate}%
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {view === 'bars' ? (
              <UsageLegend />
            ) : (
              <span className="text-[9.5px] text-muted">{t('overview.viewHeatmap')}</span>
            )}
            <div className="flex items-center gap-1.5">
              <div className="flex gap-0.5 rounded-md border border-line bg-panel-2/50 p-0.5">
                <button
                  type="button"
                  aria-label={t('overview.viewBars')}
                  aria-pressed={view === 'bars'}
                  title={t('overview.viewBars')}
                  onClick={() => setView('bars')}
                  className={cn(
                    'grid h-5 w-5 place-items-center rounded transition-colors',
                    view === 'bars' ? 'bg-bg text-ink shadow-sm' : 'text-muted hover:text-ink'
                  )}
                >
                  <ChartColumn className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  aria-label={t('overview.viewHeatmap')}
                  aria-pressed={view === 'heatmap'}
                  title={t('overview.viewHeatmap')}
                  onClick={() => setView('heatmap')}
                  className={cn(
                    'grid h-5 w-5 place-items-center rounded transition-colors',
                    view === 'heatmap' ? 'bg-bg text-ink shadow-sm' : 'text-muted hover:text-ink'
                  )}
                >
                  <Grid3X3 className="h-3 w-3" />
                </button>
              </div>
              {view === 'bars' ? (
                <div className="flex gap-0.5 rounded-md border border-line bg-panel-2/50 p-0.5">
                  {TOKEN_RANGES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onDaysChange(value)}
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors',
                        days === value ? 'bg-bg text-ink shadow-sm' : 'text-muted hover:text-ink'
                      )}
                    >
                      {t(RANGE_LABEL[value])}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-2 min-h-[214px]">
            {view === 'bars' ? (
              hasDaily ? (
                <UsageChart key={`${source}-${tab}-${days}`} data={daily} />
              ) : (
                <EmptyState
                  label={loading ? t('app.loading') : t('overview.noData')}
                  className="h-[214px] rounded-xl border border-dashed border-line bg-panel-2/20 py-0"
                />
              )
            ) : hasHeat ? (
              <div className="flex min-h-[214px] flex-col justify-center">
                <div className="mx-auto w-full max-w-[760px]">
                  <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-[10px] text-muted">{t('overview.heatmapYear')}</span>
                    <span className="font-mono text-[9.5px] text-muted">
                      {t('overview.heatmapSummary', {
                        total: compactNumber(heatTotal),
                        peak: compactNumber(heatPeak.value),
                        date: heatPeak.date.slice(5)
                      })}
                    </span>
                  </div>
                  <ActivityHeatmap days={heatValues} />
                </div>
              </div>
            ) : (
              <EmptyState
                label={loading ? t('app.loading') : t('overview.heatmapEmpty')}
                className="h-[214px] rounded-xl border border-dashed border-line bg-panel-2/20 py-0"
              />
            )}
          </div>
        </div>
      </div>

      {profileRows.length > 0 ? (
        <div className="border-t border-line-soft px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-semibold text-ink">{t('overview.profileBreakdown')}</span>
            <span className="font-mono text-[9px] text-muted">
              {t('overview.profileTotal', { count: profileRowsAll.length })}
            </span>
          </div>
          <Breakdown rows={profileRows} total={profileTotal} />
        </div>
      ) : null}
    </Panel>
  )
}
