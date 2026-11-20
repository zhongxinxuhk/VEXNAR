// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pattern adapted from Motif's Activity Heatmap (MIT). See ./NOTICE.md.

import { useMemo } from 'react'
import { compactNumber } from '@/lib/dashboard'
import { useI18n, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export type HeatmapDay = {
  /** Calendar day, either `YYYY-MM-DD` or an ISO timestamp. */
  date: string
  /** What happened that day; 0 still occupies its own square. */
  value: number
}

type Props = {
  days: HeatmapDay[]
  /** Columns of history. 53 is a year and a day. */
  weeks?: number
  /** Last day drawn; defaults to today. */
  end?: Date
  cellSize?: number
  gap?: number
  className?: string
}

function atMidnight(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function addDays(value: Date, amount: number): Date {
  const next = new Date(value)
  next.setDate(next.getDate() + amount)
  return next
}

function dayKey(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${value.getFullYear()}-${month}-${day}`
}

function quantile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * sorted.length)))
  return sorted[index]
}

/**
 * GitHub-style calendar grid: one column per week, one row per weekday.
 * Missing days are drawn as empty squares, and future days stay invisible so
 * "this week so far" reads as a partial column rather than a fake plateau.
 */
export function ActivityHeatmap({
  days,
  weeks: requestedWeeks = 53,
  end,
  cellSize = 11,
  gap = 3,
  className
}: Props): React.JSX.Element {
  const t = useT()
  const locale = useI18n((state) => state.locale)
  const weeks = Math.max(1, Math.floor(requestedWeeks))

  const model = useMemo(() => {
    const endDay = atMidnight(end ?? new Date())
    const lastColumnStart = addDays(endDay, -endDay.getDay())
    const gridStart = addDays(lastColumnStart, -(weeks - 1) * 7)
    const values = new Map<string, number>()
    for (const day of days) {
      const key = day.date.slice(0, 10)
      const value = Number(day.value)
      if (!Number.isFinite(value)) continue
      values.set(key, (values.get(key) ?? 0) + Math.max(0, value))
    }

    const cells: Array<{ key: string; value: number; future: boolean }> = []
    for (let column = 0; column < weeks; column += 1) {
      for (let row = 0; row < 7; row += 1) {
        const date = addDays(gridStart, column * 7 + row)
        const key = dayKey(date)
        cells.push({
          key,
          value: values.get(key) ?? 0,
          future: date.getTime() > endDay.getTime()
        })
      }
    }

    const positives = cells
      .filter((cell) => !cell.future && cell.value > 0)
      .map((cell) => cell.value)
      .sort((a, b) => a - b)
    const cuts = [
      quantile(positives, 0.25),
      quantile(positives, 0.5),
      quantile(positives, 0.75),
      quantile(positives, 0.9)
    ]
    const level = (value: number): 0 | 1 | 2 | 3 | 4 => {
      if (value <= 0) return 0
      if (value <= cuts[0]) return 1
      if (value <= cuts[1]) return 2
      if (value <= cuts[2]) return 3
      return 4
    }

    const months: Array<{ column: number; label: string }> = []
    const seen = new Set<string>()
    for (let column = 0; column < weeks; column += 1) {
      for (let row = 0; row < 7; row += 1) {
        const date = addDays(gridStart, column * 7 + row)
        if (date.getDate() !== 1 || date.getTime() > endDay.getTime()) continue
        const month = `${date.getFullYear()}-${date.getMonth()}`
        if (seen.has(month)) continue
        seen.add(month)
        months.push({
          column,
          label:
            locale === 'zh'
              ? `${date.getMonth() + 1}月`
              : date.toLocaleString('en-US', { month: 'short' })
        })
      }
    }

    const total = cells.reduce((sum, cell) => sum + cell.value, 0)
    return { cells, level, months, total }
  }, [days, weeks, end, locale])

  const weekdays =
    locale === 'zh'
      ? ['', '一', '', '三', '', '五', '']
      : ['', 'M', '', 'W', '', 'F', '']

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex gap-2">
        <div className="flex shrink-0 flex-col pt-4" style={{ gap }}>
          {weekdays.map((label, index) => (
            <span
              key={index}
              aria-hidden="true"
              className="flex items-center justify-end text-[8px] leading-none text-muted/70"
              style={{ height: cellSize, width: 10 }}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div style={{ width: weeks * (cellSize + gap) }}>
            <div className="relative h-4">
              {model.months.map((month) => (
                <span
                  key={`${month.column}-${month.label}`}
                  className="absolute top-0 whitespace-nowrap text-[8.5px] leading-4 text-muted/80"
                  style={{ left: month.column * (cellSize + gap) }}
                >
                  {month.label}
                </span>
              ))}
            </div>
            <div
              role="img"
              aria-label={t('overview.heatmapAria', { total: compactNumber(model.total) })}
              className="grid"
              style={{
                gridAutoFlow: 'column',
                gridTemplateRows: `repeat(7, ${cellSize}px)`,
                gridAutoColumns: `${cellSize}px`,
                gap
              }}
            >
              {model.cells.map((cell) => {
                const level = model.level(cell.value)
                return (
                  <span
                    key={cell.key}
                    aria-hidden="true"
                    title={`${cell.key} · ${cell.value > 0 ? compactNumber(cell.value) : t('overview.heatmapNone')}`}
                    className={cn(
                      'rounded-[2px] transition-colors',
                      cell.future ? 'pointer-events-none bg-transparent' : `heat-${level}`,
                      !cell.future && 'hover:ring-1 hover:ring-ink/25'
                    )}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-end gap-1 text-[8.5px] text-muted">
        <span>{t('overview.heatmapLess')}</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} aria-hidden="true" className={cn('size-2 rounded-[2px]', `heat-${level}`)} />
        ))}
        <span>{t('overview.heatmapMore')}</span>
      </div>
    </div>
  )
}
