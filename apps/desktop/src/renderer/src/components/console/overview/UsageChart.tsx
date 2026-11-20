// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useMemo, useRef, useState } from 'react'
import type { DailyTokenPoint } from '@/lib/dashboard'
import { compactNumber } from '@/lib/dashboard'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * Stacked daily token chart, drawn natively in SVG (no extra chart dependency).
 * Series order matches the web dashboard: input at the bottom, output above it
 * and cache reads at the top — together they add up to the per-day total.
 */
export const TOKEN_SERIES = [
  { key: 'input', color: 'hsl(217 91% 60%)' },
  { key: 'output', color: 'hsl(263 70% 60%)' },
  { key: 'cacheRead', color: 'hsl(160 60% 45%)' }
] as const

const SERIES = TOKEN_SERIES

const PAD = { left: 46, right: 8, top: 12, bottom: 26 }

function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1000
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 3 ? 3 : normalized <= 5 ? 5 : 10
  return nice * magnitude
}

function roundedTopBar(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height))
  if (r <= 0) return `M${x},${y} h${width} v${height} h${-width} Z`
  return [
    `M${x},${y + height}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + width - r},${y}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `L${x + width},${y + height}`,
    'Z'
  ].join(' ')
}

export function UsageChart({ data, className }: { data: DailyTokenPoint[]; className?: string }): React.JSX.Element {
  const t = useT()
  const hostRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const element = hostRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0
      if (next > 0) setWidth(next)
    })
    observer.observe(element)
    setWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [])

  const height = 214
  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = height - PAD.top - PAD.bottom
  const maxTotal = useMemo(
    () => data.reduce((max, point) => Math.max(max, point.input + point.output + point.cacheRead), 0),
    [data]
  )
  const yMax = niceMax(maxTotal)
  const band = data.length > 0 ? plotW / data.length : plotW
  const barW = Math.max(1.5, Math.min(34, band * 0.56))
  const labels = useMemo(() => {
    if (data.length === 0) return []
    const count = Math.min(data.length, Math.max(2, Math.floor(plotW / 92)))
    const step = Math.max(1, Math.ceil(data.length / count))
    const positions = new Set<number>()
    for (let index = 0; index < data.length; index += step) positions.add(index)
    const last = data.length - 1
    const previous = Math.max(...positions)
    // Keep the final date readable: if it would collide with the previous tick,
    // replace that tick instead of drawing two overlapping labels.
    if (previous !== last) {
      if (last - previous < step) positions.delete(previous)
      positions.add(last)
    }
    return [...positions].sort((a, b) => a - b)
  }, [data, plotW])

  const hovered = hover !== null ? data[hover] : null
  const tooltipWidth = 172
  const tooltipLeft = hover !== null ? Math.min(Math.max(4, PAD.left + (hover + 0.5) * band - tooltipWidth / 2), Math.max(4, width - tooltipWidth - 4)) : 0

  const legend = SERIES.map((series) => ({
    ...series,
    label: t(
      series.key === 'input' ? 'overview.seriesInput' : series.key === 'output' ? 'overview.seriesOutput' : 'overview.seriesCache'
    )
  }))

  return (
    <div ref={hostRef} className={cn('relative w-full', className)} style={{ height }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={t('overview.tokenPanel')} className="block overflow-visible">
          {/* horizontal grid + y-axis labels */}
          {[0, 1, 2, 3, 4].map((step) => {
            const value = (yMax / 4) * step
            const y = PAD.top + plotH - (value / yMax) * plotH
            return (
              <g key={step}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y}
                  y2={y}
                  stroke="var(--color-line-soft)"
                  strokeDasharray={step === 0 ? undefined : '3 4'}
                />
                <text
                  x={PAD.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                  fill="var(--color-muted)"
                >
                  {compactNumber(value)}
                </text>
              </g>
            )
          })}

          {/* bars */}
          {data.map((point, index) => {
            const x = PAD.left + index * band + (band - barW) / 2
            const visible = SERIES.map((series) => ({ color: series.color, value: point[series.key] })).filter(
              (segment) => segment.value > 0
            )
            let stacked = 0
            return (
              <g key={point.date} opacity={hover === null || hover === index ? 1 : 0.55}>
                {visible.map((segment, segmentIndex) => {
                  const rawHeight = (segment.value / yMax) * plotH
                  const barHeight = Math.max(1, rawHeight)
                  const y = PAD.top + plotH - stacked - barHeight
                  stacked += rawHeight
                  const isTop = segmentIndex === visible.length - 1
                  return isTop ? (
                    <path key={segmentIndex} d={roundedTopBar(x, y, barW, barHeight, 3)} fill={segment.color} />
                  ) : (
                    <rect key={segmentIndex} x={x} y={y} width={barW} height={barHeight} fill={segment.color} />
                  )
                })}
              </g>
            )
          })}

          {/* x-axis labels */}
          {labels.map((index) => (
            <text
              key={index}
              x={PAD.left + index * band + band / 2}
              y={height - 8}
              textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'}
              fontSize={9}
              fontFamily="var(--font-mono)"
              fill="var(--color-muted)"
            >
              {data[index]?.date.slice(5)}
            </text>
          ))}

          {/* hover capture + highlight */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={Math.max(0, plotW)}
            height={plotH}
            fill="transparent"
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              const offset = event.clientX - rect.left
              const index = Math.floor(offset / Math.max(1, band))
              setHover(Math.max(0, Math.min(data.length - 1, index)))
            }}
            onMouseLeave={() => setHover(null)}
          />
          {hover !== null ? (
            <rect
              x={PAD.left + hover * band}
              y={PAD.top}
              width={Math.max(1, band)}
              height={plotH}
              fill="var(--color-ink)"
              opacity={0.045}
              pointerEvents="none"
            />
          ) : null}
        </svg>
      ) : null}

      {hovered && hover !== null ? (
        <div
          className="pointer-events-none absolute z-10 w-[172px] rounded-lg border border-line bg-panel px-2.5 py-2 text-[10px] codex-popover"
          style={{ left: tooltipLeft, top: 4 }}
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-[9.5px] text-muted">{hovered.date}</span>
            <span className="font-mono text-[9.5px] font-semibold tabular-nums text-ink">
              {compactNumber(hovered.input + hovered.output + hovered.cacheRead)}
            </span>
          </div>
          {legend.map((series) => (
            <div key={series.key} className="flex items-center justify-between gap-2 py-[1px]">
              <span className="flex items-center gap-1.5 text-muted">
                <span className="size-1.5 rounded-sm" style={{ background: series.color }} />
                {series.label}
              </span>
              <span className="font-mono tabular-nums text-ink-soft">{compactNumber(hovered[series.key])}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function UsageLegend(): React.JSX.Element {
  const t = useT()
  return (
    <div className="flex flex-wrap items-center gap-3 text-[9.5px] text-muted">
      {SERIES.map((series) => (
        <span key={series.key} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ background: series.color }} />
          {t(
            series.key === 'input'
              ? 'overview.seriesInput'
              : series.key === 'output'
                ? 'overview.seriesOutput'
                : 'overview.seriesCache'
          )}
        </span>
      ))}
    </div>
  )
}
