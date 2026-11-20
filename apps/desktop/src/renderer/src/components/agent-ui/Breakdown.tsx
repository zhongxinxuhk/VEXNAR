// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pattern adapted from Motif's Breakdown (MIT). See ./NOTICE.md.

import { compactNumber } from '@/lib/dashboard'
import { cn } from '@/lib/utils'

export type BreakdownRow = {
  id: string
  label: string
  value: number
  /** Any CSS colour; the same value is used for the segment and the legend dot. */
  color: string
  selected?: boolean
  onSelect?: () => void
}

/**
 * One bar cut into its parts, with a legend that names every part and its
 * amount. The bar is the at-a-glance share; the legend is the exact number.
 */
export function Breakdown({
  rows,
  total,
  className
}: {
  rows: BreakdownRow[]
  total: number
  className?: string
}): React.JSX.Element | null {
  if (rows.length === 0 || total <= 0) return null
  return (
    <div className={cn('min-w-0', className)}>
      {rows.length > 1 ? (
        <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-panel-3">
          {rows.map((row) => (
            <span
              key={row.id}
              className="h-full first:rounded-l-full last:rounded-r-full transition-[width] duration-500"
              style={{ width: `${(Math.max(0, row.value) / total) * 100}%`, background: row.color }}
            />
          ))}
        </div>
      ) : null}
      <div className={cn('flex flex-wrap gap-x-5 gap-y-0.5', rows.length > 1 && 'mt-2')}>
        {rows.map((row) => {
          const percent = Math.round((Math.max(0, row.value) / total) * 100)
          const content = (
            <>
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: row.color }} />
              <span className="min-w-0 truncate text-[10px] text-ink-soft">{row.label}</span>
              <span className="ml-auto shrink-0 font-mono text-[9.5px] tabular-nums text-muted">
                {compactNumber(row.value)}
              </span>
              <span className="w-8 shrink-0 text-right font-mono text-[9px] tabular-nums text-muted/80">
                {percent}%
              </span>
            </>
          )
          return row.onSelect ? (
            <button
              key={row.id}
              type="button"
              onClick={row.onSelect}
              aria-pressed={row.selected}
              title={`${row.label} · ${compactNumber(row.value)}`}
              className={cn(
                'flex min-w-0 max-w-[260px] flex-1 basis-[190px] items-center gap-1.5 rounded-md px-1 py-[2px] text-left transition-colors hover:bg-panel-2/60',
                row.selected && 'bg-panel-2/70'
              )}
            >
              {content}
            </button>
          ) : (
            <div key={row.id} className="flex min-w-0 max-w-[260px] flex-1 basis-[190px] items-center gap-1.5 px-1 py-[2px]" title={`${row.label} · ${compactNumber(row.value)}`}>
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}
