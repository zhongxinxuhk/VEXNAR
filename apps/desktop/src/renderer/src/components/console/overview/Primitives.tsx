// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ReactNode } from 'react'
import type { MessageKey } from '@/lib/i18n'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// ── surfaces ────────────────────────────────────────────────────────────────

export function Panel({
  className,
  children
}: {
  className?: string
  children: ReactNode
}): React.JSX.Element {
  return <section className={cn('rounded-xl border border-line bg-panel/40', className)}>{children}</section>
}

export function PanelHeader({
  icon,
  title,
  meta,
  actions,
  className
}: {
  icon: ReactNode
  title: string
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5', className)}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-md border border-line bg-panel-2/70 text-muted">{icon}</span>
        <span className="truncate text-[11.5px] font-semibold text-ink">{title}</span>
        {meta ? <span className="truncate font-mono text-[9.5px] font-normal tracking-wide text-muted">{meta}</span> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function PanelAction({ label, icon, onClick }: { label: string; icon?: ReactNode; onClick?: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:bg-panel-2 hover:text-ink"
    >
      {label}
      {icon}
    </button>
  )
}

// ── live indicators ─────────────────────────────────────────────────────────

export function LiveDot({ className, tone = 'accent' }: { className?: string; tone?: 'accent' | 'emerald' }): React.JSX.Element {
  return (
    <span className={cn('relative inline-flex size-1.5 shrink-0', className)} aria-hidden="true">
      <span
        className={cn(
          'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none',
          tone === 'emerald' ? 'bg-emerald-400' : 'bg-accent'
        )}
      />
      <span className={cn('relative inline-flex size-1.5 rounded-full', tone === 'emerald' ? 'bg-emerald-500' : 'bg-accent')} />
    </span>
  )
}

// ── stat cards ──────────────────────────────────────────────────────────────

export type StatTone = 'accent' | 'danger' | 'violet' | 'cyan' | 'warn'

const STAT_TONE: Record<StatTone, string> = {
  accent: 'border-accent/20 bg-accent/10 text-accent',
  danger: 'border-danger/20 bg-danger/10 text-danger',
  violet: 'border-violet-500/20 bg-violet-500/10 text-violet-500',
  cyan: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-500',
  warn: 'border-warn/20 bg-warn/10 text-warn'
}

export function StatCard({
  label,
  icon,
  tone,
  value,
  suffix,
  live,
  children
}: {
  label: string
  icon: ReactNode
  tone: StatTone
  value: ReactNode
  suffix?: ReactNode
  live?: boolean
  children?: ReactNode
}): React.JSX.Element {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-line bg-panel/40 p-3.5 transition-colors hover:bg-panel/60">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('grid size-6 shrink-0 place-items-center rounded-md border', STAT_TONE[tone])}>{icon}</span>
          <span className="truncate text-[10.5px] font-medium tracking-wide text-muted">{label}</span>
        </div>
        {live ? <LiveDot /> : null}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-[26px] font-semibold leading-none tracking-tight tabular-nums text-ink">{value}</span>
        {suffix ? <span className="text-[11px] tabular-nums text-muted">{suffix}</span> : null}
      </div>
      <div className="mt-3 flex min-h-[18px] flex-col justify-end gap-1.5">{children}</div>
    </div>
  )
}

export function SegmentedBar({
  segments,
  className
}: {
  segments: Array<{ value: number; className: string }>
  className?: string
}): React.JSX.Element {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0)
  return (
    <div className={cn('flex h-1.5 w-full overflow-hidden rounded-full bg-panel-3', className)}>
      {total > 0
        ? segments
            .filter((segment) => segment.value > 0)
            .map((segment, index) => (
              <span
                key={index}
                className={cn('h-full transition-[width] duration-500', segment.className)}
                style={{ width: `${(segment.value / total) * 100}%` }}
              />
            ))
        : null}
    </div>
  )
}

export function BreakdownChip({
  value,
  label,
  dot,
  className
}: {
  value: number
  label: string
  dot: string
  className?: string
}): React.JSX.Element {
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] tabular-nums', className)}>
      <span className={cn('size-1.5 rounded-full', dot)} />
      <span className="text-muted">{label}</span>
      {value}
    </span>
  )
}

// ── status pills ────────────────────────────────────────────────────────────

function taskTone(status: string): string {
  if (status === 'running') return 'border-accent/25 bg-accent/10 text-accent'
  if (status === 'queued' || status === 'paused' || status === 'timeout') return 'border-warn/25 bg-warn/10 text-warn'
  if (status === 'done') return 'border-accent-2/25 bg-accent-2/10 text-accent-2'
  if (status === 'failed') return 'border-danger/25 bg-danger/10 text-danger'
  return 'border-line bg-panel-2 text-muted'
}

function taskDot(status: string): string {
  if (status === 'running') return 'bg-accent'
  if (status === 'queued' || status === 'paused' || status === 'timeout') return 'bg-warn'
  if (status === 'done') return 'bg-accent-2'
  if (status === 'failed') return 'bg-danger'
  return 'bg-muted'
}

export function TaskStatusPill({ status }: { status: string }): React.JSX.Element {
  const t = useT()
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 font-mono text-[10px] leading-4', taskTone(status))}>
      {status === 'running' ? <LiveDot /> : <span className={cn('size-1.5 rounded-full', taskDot(status))} />}
      {t(`status.${status}` as MessageKey)}
    </span>
  )
}

const ENGINE_TONE: Record<string, string> = {
  exploring: 'border-accent/25 bg-accent/10 text-accent',
  paused: 'border-warn/25 bg-warn/10 text-warn',
  stalled: 'border-danger/25 bg-danger/10 text-danger',
  idle: 'border-line bg-panel-2 text-muted'
}

const ENGINE_DOT: Record<string, string> = {
  exploring: 'bg-accent',
  paused: 'bg-warn',
  stalled: 'bg-danger',
  idle: 'bg-muted'
}

export function EnginePill({ mode, compact = false }: { mode: string; compact?: boolean }): React.JSX.Element {
  const t = useT()
  const engine = mode in ENGINE_TONE ? mode : 'idle'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border font-mono leading-4',
        compact ? 'px-1 py-0 text-[9px]' : 'px-1.5 py-0.5 text-[10px]',
        ENGINE_TONE[engine]
      )}
    >
      {engine === 'exploring' ? <LiveDot /> : <span className={cn('size-1.5 rounded-full', ENGINE_DOT[engine])} />}
      {t(`engine.${engine}` as MessageKey)}
    </span>
  )
}

// ── misc ────────────────────────────────────────────────────────────────────

export function MiniProgress({ value, className }: { value: number; className?: string }): React.JSX.Element {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('h-1 w-14 overflow-hidden rounded-full bg-panel-3', className)}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function EmptyState({ icon, label, className }: { icon?: ReactNode; label: string; className?: string }): React.JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-1.5 py-8 text-center text-[11px] text-muted', className)}>
      {icon ? <span className="text-muted/50">{icon}</span> : null}
      {label}
    </div>
  )
}

export function RuntimeMetric({ label, value }: { label: string; value: ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-[9.5px] uppercase tracking-[0.1em] text-muted/80">{label}</span>
      <span className="min-w-0 truncate text-[11px] font-medium text-ink-soft">{value}</span>
    </div>
  )
}
