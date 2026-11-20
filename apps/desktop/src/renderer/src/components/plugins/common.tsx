// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** iOS 风格开关：插件页所有"启用/停用"都用它，避免各自实现两份状态。 */
export function Switch({
  checked,
  onChange,
  disabled,
  label
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[20px] w-[34px] shrink-0 rounded-full transition-colors',
        checked ? 'bg-accent' : 'bg-panel-3',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] h-4 w-4 rounded-full bg-white shadow-sm transition-all',
          checked ? 'left-[16px]' : 'left-[2px]'
        )}
      />
    </button>
  )
}

/** 小标签：来源、传输方式、官方/内置等。 */
export function Chip({
  children,
  tone = 'muted',
  className,
  mono
}: {
  children: React.ReactNode
  tone?: 'muted' | 'accent' | 'success' | 'warn' | 'danger'
  className?: string
  mono?: boolean
}): React.JSX.Element {
  const tones = {
    muted: 'border-line-soft bg-panel-2 text-muted',
    accent: 'border-accent/20 bg-accent/10 text-accent',
    success: 'border-accent-2/25 bg-accent-2/10 text-accent-2',
    warn: 'border-warn/25 bg-warn/10 text-warn',
    danger: 'border-danger/25 bg-danger/10 text-danger'
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-[1px] text-[10.5px] leading-4',
        mono && 'font-mono tracking-tight',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

/** 列表左侧的圆角图标块，统一 36px，保持所有行对齐。 */
export function IconTile({
  children,
  tone,
  size = 36
}: {
  children: React.ReactNode
  tone?: string
  size?: number
}): React.JSX.Element {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[10px] border border-line-soft bg-bg"
      style={{ width: size, height: size }}
    >
      <span className={cn('grid place-items-center', tone ?? 'text-ink-soft')}>{children}</span>
    </span>
  )
}

export function Spinner({ className }: { className?: string }): React.JSX.Element {
  return <Loader2 className={cn('h-3.5 w-3.5 animate-spin text-muted', className)} />
}

export function EmptyState({
  icon,
  title,
  description,
  actions
}: {
  icon: React.ReactNode
  title: string
  description?: string
  actions?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-14 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-xl border border-line-soft bg-panel-2 text-muted">
        {icon}
      </span>
      <div className="mt-3 text-[13px] font-medium text-ink">{title}</div>
      {description ? <div className="mt-1 max-w-[420px] text-[12px] leading-5 text-muted">{description}</div> : null}
      {actions ? <div className="mt-4 flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** 区块标题：一行小标题 + 右侧动作。 */
export function SectionTitle({
  children,
  extra
}: {
  children: React.ReactNode
  extra?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="text-[12px] font-medium text-ink">{children}</div>
      {extra ? <div className="flex items-center gap-1.5">{extra}</div> : null}
    </div>
  )
}

/** 分段筛选（全部 / 已启用 / 已停用）。 */
export function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string; count?: number }[]
  onChange: (next: T) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-panel-2 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'flex h-6 items-center gap-1.5 rounded-md px-2 text-[11.5px] transition-colors',
            value === option.value ? 'bg-bg text-ink shadow-sm' : 'text-muted hover:text-ink'
          )}
        >
          {option.label}
          {typeof option.count === 'number' ? (
            <span className="font-mono text-[10px] text-muted">{option.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

/** 顶部操作按钮（图标 + 可选文字），保持 32px 行高与搜索框对齐。 */
export function IconButton({
  children,
  onClick,
  label,
  active,
  disabled,
  danger
}: {
  children: React.ReactNode
  onClick?: () => void
  label: string
  active?: boolean
  disabled?: boolean
  danger?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'grid h-8 w-8 place-items-center rounded-full text-muted transition-colors',
        'hover:bg-panel-2 hover:text-ink disabled:pointer-events-none disabled:opacity-40',
        active && 'bg-panel-2 text-ink',
        danger && 'hover:bg-danger/10 hover:text-danger'
      )}
    >
      {children}
    </button>
  )
}

export function SearchBox({
  value,
  onChange,
  placeholder
}: {
  value: string
  onChange: (next: string) => void
  placeholder: string
}): React.JSX.Element {
  return (
    <div className="flex h-8 w-[220px] items-center gap-2 rounded-full bg-panel-2 px-3">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-full w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-muted"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-[11px] text-muted transition-colors hover:text-ink"
        >
          清除
        </button>
      ) : null}
    </div>
  )
}

/** 页面右下角的短暂提示（安装成功、同步失败等）。 */
export function Toast({ message, tone }: { message: string; tone: 'ok' | 'error' | 'info' }): React.JSX.Element {
  const tones = {
    ok: 'border-accent-2/30 text-ink',
    error: 'border-danger/30 text-ink',
    info: 'border-line text-ink'
  }
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-none fixed bottom-6 left-1/2 z-[60] max-w-[520px] -translate-x-1/2 rounded-lg border bg-bg px-3.5 py-2 text-[12px] leading-5 shadow-lg',
        tones[tone]
      )}
    >
      {message}
    </div>
  )
}

/** 把后端原始错误翻译成用户能行动的一句话。 */
export function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  if (/404 page not found/i.test(raw)) {
    return '内置后端版本过旧，缺少该接口（HTTP 404）。重新构建后端并重启桌面端即可。'
  }
  if (/Go 后端尚未启动|后端尚未启动/.test(raw)) return 'Go 后端尚未启动，请稍后重试'
  if (/timeout|aborted/i.test(raw)) return '请求超时：操作可能仍在后端执行，稍后刷新查看结果'
  return raw
}

export const transportTone: Record<string, 'muted' | 'accent' | 'warn'> = {
  stdio: 'muted',
  http: 'accent',
  sse: 'warn'
}
