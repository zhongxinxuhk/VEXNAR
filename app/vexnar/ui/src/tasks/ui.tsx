// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ReactNode } from 'react'

export function relTime(input?: string | number): string {
  if (!input) return '—'
  const time = typeof input === 'number' ? input * 1000 : new Date(input).getTime()
  if (!Number.isFinite(time)) return '—'
  const diff = Date.now() - time
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return new Date(time).toLocaleDateString('zh-CN')
}

const STATUS_TEXT: Record<string, [label: string, tone: string]> = {
  draft: ['草稿', 'muted'],
  running: ['进行中', 'success'],
  paused: ['已暂停', 'warn'],
  queued: ['排队中', 'redirect'],
  done: ['已完成', 'success'],
  failed: ['失败', 'error'],
  archived: ['已归档', 'muted']
}

export function statusTone(status?: string): string {
  return STATUS_TEXT[status ?? '']?.[1] ?? 'muted'
}

export function statusLabel(status?: string): string {
  return STATUS_TEXT[status ?? '']?.[0] ?? status ?? '—'
}

const SEVERITY: Record<string, [string, string]> = {
  critical: ['严重', 'critical'],
  high: ['高危', 'high'],
  medium: ['中危', 'medium'],
  low: ['低危', 'low'],
  info: ['信息', 'info']
}

export function severityChip(severity?: string) {
  const [label, tone] = SEVERITY[(severity ?? '').toLowerCase()] ?? [severity ?? '—', 'muted']
  return <span className={`vx-chip vx-chip--${tone}`}>{label}</span>
}

export function StatusChip({ status }: { status?: string }) {
  return (
    <span className={`vx-chip vx-chip--${statusTone(status)}`}>
      <i className="vx-chip-dot" />
      {statusLabel(status)}
    </span>
  )
}

export function Card({ title, extra, children, className }: { title?: ReactNode; extra?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={`vx-task-card${className ? ` ${className}` : ''}`}>
      {(title || extra) && (
        <header className="vx-task-card-head">
          <h3>{title}</h3>
          <div className="vx-task-card-extra">{extra}</div>
        </header>
      )}
      <div className="vx-task-card-body">{children}</div>
    </section>
  )
}

export function Empty({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="vx-task-empty">
      <strong>{text}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  )
}

export function ErrorLine({ error }: { error?: string | undefined }) {
  return error ? (
    <p className="vx-task-error" role="alert">
      {error}
    </p>
  ) : null
}

export function Field({
  value,
  onChange,
  placeholder,
  onEnter,
  ariaLabel
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onEnter?: () => void
  ariaLabel?: string
}) {
  return (
    <input
      className="vx-task-input"
      aria-label={ariaLabel ?? placeholder}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && onEnter) {
          event.preventDefault()
          onEnter()
        }
      }}
    />
  )
}

export function Select({
  value,
  onChange,
  options,
  ariaLabel
}: {
  value: string
  onChange: (value: string) => void
  options: Array<[string, string]>
  ariaLabel?: string
}) {
  return (
    <select className="vx-task-select" aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  )
}

export function Button({
  children,
  onClick,
  tone = 'default',
  disabled,
  title
}: {
  children: ReactNode
  onClick?: () => void
  tone?: 'default' | 'primary' | 'danger' | 'ghost'
  disabled?: boolean
  title?: string
}) {
  return (
    <button type="button" className={`vx-task-btn vx-task-btn--${tone}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  )
}

export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="vx-task-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  )
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="vx-task-kv">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  )
}
