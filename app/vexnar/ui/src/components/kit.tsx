// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * VEXNAR 控制台组件库（`vx-ui-*`）。
 *
 * 之前四页各有一套外壳：概览用 `vx-ov-card`、流量用 `vx-cat-card`、代理池用
 * `vx-cat-*`、任务用 `vx-task-card`，圆角/间距/字号都差一两像素，凑在一个侧边栏
 * 里就像四个产品。这里给出**唯一**的一套：
 *
 *   PageShell  页面骨架（标题 + 说明 + 动作 + 内容）
 *   Kpi        指标卡（同一页最多一行，数值用等宽数字）
 *   Card       区块容器（标题 + 说明 + 右侧动作）
 *   Toolbar    过滤/操作条
 *   Segmented  视图切换（可访问的 aria-pressed，不是伪按钮）
 *   DataTable  表格（表头固定、可排序、行可选中）
 *   Drawer     右侧检查器（详情一律在这里，不挤占列表）
 *   Modal      居中弹窗（顶层 `<dialog>`，遮罩盖满视口）
 *   Empty/Skeleton/Banner  三态（空/加载/错误）
 *
 * 所有颜色走 `--vx-*` 桥，深色与换皮不额外写第二份。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useModalLayer } from '@deepseek-ai/dsh-client-ui-primitives'

// ── 页面骨架 ────────────────────────────────────────────────────────────────
export interface PageShellProps {
  title: string
  desc?: string | undefined
  /** 标题右侧的动作区（刷新、导出等）。 */
  actions?: ReactNode
  /** 标题下方的状态条（活跃抓包、引擎状态）。 */
  status?: ReactNode
  children: ReactNode
}

export function PageShell({ title, desc, actions, status, children }: PageShellProps): ReactNode {
  return (
    <div className="vx-ui-page">
      <header className="vx-ui-head">
        <div className="vx-ui-head-main">
          <h1 className="vx-ui-title">{title}</h1>
          {desc === undefined ? null : <p className="vx-ui-desc">{desc}</p>}
        </div>
        {actions === undefined ? null : <div className="vx-ui-head-actions">{actions}</div>}
      </header>
      {status === undefined ? null : <div className="vx-ui-statusline">{status}</div>}
      {children}
    </div>
  )
}

// ── KPI ────────────────────────────────────────────────────────────────────
export type Tone = 'neutral' | 'blue' | 'violet' | 'green' | 'amber' | 'red'

export interface KpiProps {
  label: string
  value: ReactNode
  unit?: string | undefined
  hint?: ReactNode
  tone?: Tone | undefined
  /** 可点击的 KPI（当作过滤器用）。 */
  onClick?: (() => void) | undefined
  active?: boolean | undefined
  /** 右上角的补充标记（如「近 100 条」）。 */
  corner?: ReactNode
}

export function Kpi({ label, value, unit, hint, tone = 'neutral', onClick, active, corner }: KpiProps): ReactNode {
  const className = [
    'vx-ui-kpi',
    `vx-ui-tone-${tone}`,
    onClick === undefined ? '' : 'vx-ui-kpi--action',
    active === true ? 'is-active' : ''
  ].filter(Boolean).join(' ')
  const body = (
    <>
      <div className="vx-ui-kpi-top">
        <span className="vx-ui-kpi-label">{label}</span>
        {corner === undefined ? null : <span className="vx-ui-kpi-corner">{corner}</span>}
      </div>
      <div className="vx-ui-kpi-value">
        {value}
        {unit === undefined ? null : <em>{unit}</em>}
      </div>
      {hint === undefined ? null : <div className="vx-ui-kpi-hint">{hint}</div>}
    </>
  )
  if (onClick === undefined) return <div className={className}>{body}</div>
  return (
    <button type="button" className={className} onClick={onClick} aria-pressed={active === true}>
      {body}
    </button>
  )
}

export function KpiGrid({ children, min = 148 }: { children: ReactNode; min?: number }): ReactNode {
  // 自定义属性不在 CSSProperties 的键集合里，只能整体断言。
  return <div className="vx-ui-kpis" style={{ '--vx-kpi-min': `${min}px` } as CSSProperties}>{children}</div>
}

// ── 区块 ───────────────────────────────────────────────────────────────────
export interface CardProps {
  title?: ReactNode
  hint?: ReactNode
  actions?: ReactNode
  children: ReactNode
  /** 内容区自带滚动（长列表）。 */
  scroll?: boolean | undefined
  className?: string | undefined
}

export function Card({ title, hint, actions, children, scroll, className }: CardProps): ReactNode {
  return (
    <section className={`vx-ui-card${className === undefined ? '' : ` ${className}`}`}>
      {title === undefined && actions === undefined ? null : (
        <header className="vx-ui-card-head">
          <div className="vx-ui-card-titles">
            {title === undefined ? null : <h2 className="vx-ui-card-title">{title}</h2>}
            {hint === undefined ? null : <span className="vx-ui-card-hint">{hint}</span>}
          </div>
          {actions === undefined ? null : <div className="vx-ui-card-actions">{actions}</div>}
        </header>
      )}
      <div className={scroll === true ? 'vx-ui-card-body vx-ui-card-body--scroll' : 'vx-ui-card-body'}>{children}</div>
    </section>
  )
}

export function Split({ main, rail }: { main: ReactNode; rail: ReactNode }): ReactNode {
  return (
    <div className="vx-ui-split">
      <div className="vx-ui-split-main">{main}</div>
      <aside className="vx-ui-split-rail">{rail}</aside>
    </div>
  )
}

// ── 工具条 ─────────────────────────────────────────────────────────────────
export function Toolbar({ children }: { children: ReactNode }): ReactNode {
  return <div className="vx-ui-toolbar">{children}</div>
}

export function Spacer(): ReactNode {
  return <span className="vx-ui-spacer" />
}

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  count?: number | undefined
  hint?: string | undefined
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T
  options: ReadonlyArray<SegmentedOption<T>>
  onChange: (next: T) => void
  label?: string | undefined
}): ReactNode {
  return (
    <div className="vx-ui-seg" role="group" aria-label={label ?? '视图'}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          title={option.hint}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count === undefined ? null : <em>{option.count}</em>}
        </button>
      ))}
    </div>
  )
}

// ── 徽标 ───────────────────────────────────────────────────────────────────
export function Chip({ tone = 'neutral', dot, children, title }: {
  tone?: Tone | undefined
  dot?: boolean | undefined
  children: ReactNode
  title?: string | undefined
}): ReactNode {
  return (
    <span className={`vx-ui-chip vx-ui-tone-${tone}`} title={title}>
      {dot === true ? <i className="vx-ui-chip-dot" /> : null}
      {children}
    </span>
  )
}

const METHOD_TONE: Record<string, Tone> = {
  GET: 'blue', POST: 'green', PUT: 'amber', PATCH: 'violet', DELETE: 'red', HEAD: 'neutral', OPTIONS: 'violet'
}

export function MethodBadge({ method }: { method: string }): ReactNode {
  const key = (method || 'GET').toUpperCase()
  return <span className={`vx-ui-method vx-ui-tone-${METHOD_TONE[key] ?? 'neutral'}`}>{key}</span>
}

export function StatusBadge({ status }: { status: number }): ReactNode {
  const tone: Tone = status >= 500 ? 'red' : status >= 400 ? 'amber' : status >= 300 ? 'violet' : status >= 200 ? 'green' : 'neutral'
  return <span className={`vx-ui-badge vx-ui-tone-${tone}`}>{status === 0 ? '—' : status}</span>
}

// ── 表格 ───────────────────────────────────────────────────────────────────
export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  width?: string | undefined
  align?: 'left' | 'right' | 'center' | undefined
  mono?: boolean | undefined
  sortable?: boolean | undefined
  /** 悬停全文（被截断的列用）。 */
  title?: ((row: T) => string) | undefined
  /** 粘在表格右侧（操作列），横向滚动时保持可见。 */
  sticky?: boolean | undefined
}

export interface DataTableProps<T> {
  columns: ReadonlyArray<Column<T>>
  rows: ReadonlyArray<T>
  rowKey: (row: T) => string
  onRowClick?: ((row: T) => void) | undefined
  selectedKey?: string | undefined
  loading?: boolean | undefined
  empty?: ReactNode
  sort?: { key: string; dir: 'asc' | 'desc' } | undefined
  onSort?: ((key: string) => void) | undefined
  dense?: boolean | undefined
  /** 表格最大高度（超出滚动，表头固定）。 */
  maxHeight?: number | undefined
}

export function DataTable<T>({
  columns, rows, rowKey, onRowClick, selectedKey, loading, empty, sort, onSort, dense, maxHeight
}: DataTableProps<T>): ReactNode {
  if (loading === true && rows.length === 0) return <Skeleton rows={6} />
  if (rows.length === 0) return <>{empty ?? <EmptyState title="没有数据" hint="调整筛选条件后重试" />}</>
  return (
    <div
      className={dense === true ? 'vx-ui-table-wrap vx-ui-table-wrap--dense' : 'vx-ui-table-wrap'}
      style={maxHeight === undefined ? undefined : { maxHeight }}
    >
      <table className="vx-ui-table">
        <thead>
          <tr>
            {columns.map((column) => {
              const sorted = sort?.key === column.key
              const sortable = column.sortable === true && onSort !== undefined
              return (
                <th
                  key={column.key}
                  style={column.width === undefined ? undefined : { width: column.width }}
                  data-align={column.align ?? 'left'}
                  data-sticky={column.sticky === true ? 'right' : undefined}
                  aria-sort={sorted ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  {sortable ? (
                    <button type="button" className="vx-ui-th-btn" onClick={() => onSort?.(column.key)}>
                      {column.header}
                      <i data-dir={sorted ? sort?.dir : 'none'} aria-hidden="true">↕</i>
                    </button>
                  ) : column.header}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row)
            return (
              <tr
                key={key}
                data-selected={selectedKey === key ? 'true' : undefined}
                data-clickable={onRowClick === undefined ? undefined : 'true'}
                onClick={onRowClick === undefined ? undefined : () => onRowClick(row)}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    data-align={column.align ?? 'left'}
                    data-sticky={column.sticky === true ? 'right' : undefined}
                    className={column.mono === true ? 'is-mono' : undefined}
                    title={column.title?.(row)}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * 接口错误：把「哪个方法、哪条路径、后端怎么说」一次说清。
 *
 * 501 的正文带 `path/method/hint`，之前只显示 error 文案，于是"接口没实现"与
 * "参数不对"在界面上长得一样，排障只能去翻服务端日志。
 */
export function ApiErrorLine({ error, detail, onRetry }: {
  error: string
  detail?: unknown
  onRetry?: (() => void) | undefined
}): ReactNode {
  const info = detail !== null && typeof detail === 'object' ? detail as Record<string, unknown> : {}
  const path = typeof info['path'] === 'string' ? info['path'] : ''
  const method = typeof info['method'] === 'string' ? info['method'] : ''
  const hint = typeof info['hint'] === 'string' ? info['hint'] : ''
  return (
    <Banner tone="red">
      <strong>{error}</strong>
      {path === '' ? null : <span className="vx-ui-muted"> · {method} {path}</span>}
      {hint === '' ? null : <span className="vx-ui-muted"> · {hint}</span>}
      {onRetry === undefined ? null : (
        <button type="button" className="vx-ui-banner-link" onClick={onRetry}>重试</button>
      )}
    </Banner>
  )
}

// ── 三态 ───────────────────────────────────────────────────────────────────
export function EmptyState({ title, hint, action }: { title: string; hint?: string | undefined; action?: ReactNode }): ReactNode {
  return (
    <div className="vx-ui-empty">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="M3 10h18M8 15h3" strokeLinecap="round" />
      </svg>
      <strong>{title}</strong>
      {hint === undefined ? null : <small>{hint}</small>}
      {action === undefined ? null : <div className="vx-ui-empty-action">{action}</div>}
    </div>
  )
}

export function Skeleton({ rows = 4 }: { rows?: number }): ReactNode {
  return (
    <div className="vx-ui-skeleton" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }, (_, index) => <i key={index} />)}
    </div>
  )
}

export function Banner({ tone = 'amber', children, onDismiss }: {
  tone?: Tone | undefined
  children: ReactNode
  onDismiss?: (() => void) | undefined
}): ReactNode {
  return (
    <div className={`vx-ui-banner vx-ui-tone-${tone}`} role="alert">
      <span className="vx-ui-banner-text">{children}</span>
      {onDismiss === undefined ? null : (
        <button type="button" className="vx-ui-banner-close" onClick={onDismiss} aria-label="关闭提示">×</button>
      )}
    </div>
  )
}

// ── 表单 ───────────────────────────────────────────────────────────────────
export function Field({ label, hint, children, inline }: {
  label: string
  hint?: string | undefined
  children: ReactNode
  inline?: boolean | undefined
}): ReactNode {
  return (
    <label className={inline === true ? 'vx-ui-field vx-ui-field--inline' : 'vx-ui-field'}>
      <span className="vx-ui-field-label">{label}</span>
      {children}
      {hint === undefined ? null : <span className="vx-ui-field-hint">{hint}</span>}
    </label>
  )
}

export function TextInput(props: {
  value: string
  onChange: (next: string) => void
  placeholder?: string | undefined
  ariaLabel?: string | undefined
  width?: number | undefined
  mono?: boolean | undefined
  disabled?: boolean | undefined
  type?: 'text' | 'url' | 'number' | 'password' | undefined
}): ReactNode {
  return (
    <input
      className={props.mono === true ? 'vx-ui-input is-mono' : 'vx-ui-input'}
      type={props.type ?? 'text'}
      value={props.value}
      placeholder={props.placeholder}
      aria-label={props.ariaLabel ?? props.placeholder ?? '输入'}
      disabled={props.disabled === true}
      style={props.width === undefined ? undefined : { width: props.width }}
      onChange={(event) => props.onChange(event.target.value)}
    />
  )
}

export function TextArea(props: {
  value: string
  onChange: (next: string) => void
  placeholder?: string | undefined
  rows?: number | undefined
  mono?: boolean | undefined
}): ReactNode {
  return (
    <textarea
      className={props.mono === true ? 'vx-ui-textarea is-mono' : 'vx-ui-textarea'}
      rows={props.rows ?? 4}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(event) => props.onChange(event.target.value)}
    />
  )
}

export function Select<T extends string>({ value, options, onChange, label }: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (next: T) => void
  label: string
}): ReactNode {
  return (
    <select
      className="vx-ui-select"
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  )
}

export type ButtonVariant = 'primary' | 'default' | 'ghost' | 'danger'

export function Button({ variant = 'default', busy, disabled, onClick, children, title, size }: {
  variant?: ButtonVariant | undefined
  busy?: boolean | undefined
  disabled?: boolean | undefined
  onClick?: (() => void) | undefined
  children: ReactNode
  title?: string | undefined
  size?: 'sm' | undefined
}): ReactNode {
  const className = [
    'vx-ui-btn',
    `vx-ui-btn--${variant}`,
    size === 'sm' ? 'vx-ui-btn--sm' : '',
    busy === true ? 'is-busy' : ''
  ].filter(Boolean).join(' ')
  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled === true || busy === true} title={title}>
      {busy === true ? <i className="vx-ui-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

// ── 指示器 ─────────────────────────────────────────────────────────────────
export function Meter({ value, tone = 'green', label }: { value: number; tone?: Tone | undefined; label?: string | undefined }): ReactNode {
  const ratio = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  return (
    <div className="vx-ui-meter" title={label}>
      <i style={{ width: `${ratio * 100}%`, background: `var(--vx-tone)` }} className={`vx-ui-tone-${tone}`} />
    </div>
  )
}

export function StackedBar({ segments }: { segments: ReadonlyArray<{ key: string; value: number; tone: Tone }> }): ReactNode {
  const total = segments.reduce((sum, item) => sum + item.value, 0)
  if (total === 0) return <div className="vx-ui-bar vx-ui-bar--empty" aria-hidden="true" />
  return (
    <div className="vx-ui-bar" role="img" aria-label={segments.map((item) => `${item.key} ${item.value}`).join('，')}>
      {segments.filter((item) => item.value > 0).map((item) => (
        <i
          key={item.key}
          className={`vx-ui-tone-${item.tone}`}
          style={{ width: `${(item.value / total) * 100}%`, background: 'var(--vx-tone)' }}
        />
      ))}
    </div>
  )
}

export function KeyValue({ rows }: { rows: ReadonlyArray<{ label: string; value: ReactNode }> }): ReactNode {
  return (
    <dl className="vx-ui-kv">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

// ── 分页 ───────────────────────────────────────────────────────────────────
export function Pager({ page, pageCount, total, unit, onPage }: {
  page: number
  pageCount: number
  total: number
  unit: string
  onPage: (next: number) => void
}): ReactNode {
  return (
    <div className="vx-ui-pager">
      <span className="vx-ui-pager-total">共 {total.toLocaleString('zh-CN')} {unit}</span>
      <Spacer />
      <Button size="sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>上一页</Button>
      <span className="vx-ui-pager-page">{pageCount === 0 ? 0 : page + 1} / {pageCount}</span>
      <Button size="sm" disabled={page + 1 >= pageCount} onClick={() => onPage(page + 1)}>下一页</Button>
    </div>
  )
}

// ── 浮层（顶层对话框） ─────────────────────────────────────────────────────
/**
 * 所有浮层的唯一底座：原生 `<dialog>` + `showModal()`。
 *
 * 遮罩由 `::backdrop` 绘制，面板进浏览器顶层（top layer）。顶层不参与
 * z-index 比较，也不受祖先 `transform` 影响——这两条正是之前
 * `position: fixed; inset: 0` 的死穴：外壳把抽屉侧栏放在 71、底栏状态条也
 * 各有层级，遮罩只要更低就被压在下面，弹窗底部于是永远留一条不暗的缝。
 *
 * 键盘归属（Esc / Tab 循环 / 焦点归还）交给 dsh 的模态栈，与设置弹窗同一套
 * 规则，避免两套 Esc 处理器各关一次。
 */
function Overlay({ open, onClose, variant, label, children }: {
  open: boolean
  onClose: () => void
  variant: 'sheet' | 'modal'
  label: string
  children: ReactNode
}): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null)
  useModalLayer(dialog, open, onClose)

  useLayoutEffect(() => {
    const element = dialog.current
    if (element === null) return
    // showModal 对已打开的 dialog 会抛 InvalidStateError，重渲染时不能重复调。
    if (!element.open) element.showModal()
    // 原生 showModal 会把焦点交给面板里第一个可聚焦控件（顶栏的 ×），
    // 于是在刚打开的一瞬间多出一圈描边。焦点先留在面板本身，按 Tab
    // 再由模态栈交给第一个控件。
    element.focus()
    return () => {
      if (element.open) element.close()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <dialog
      ref={dialog}
      tabIndex={-1}
      className={`vx-ui-layer vx-ui-layer--${variant}`}
      aria-label={label}
      // Esc：原生 cancel 事件与模态栈都会走到同一个 onClose，这里只拦默认行为。
      onCancel={(event) => { event.preventDefault(); onClose() }}
      // 点空白处关闭；点面板内部由子元素自己处理。
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      {children}
    </dialog>,
    document.body
  )
}

interface LayerChromeProps {
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

function LayerChrome({ title, subtitle, meta, onClose, children, footer }: LayerChromeProps): ReactNode {
  return (
    <>
      <header className="vx-ui-layer-head">
        <div className="vx-ui-layer-titles">
          <strong>{title}</strong>
          {subtitle === undefined ? null : <span>{subtitle}</span>}
        </div>
        {meta === undefined ? null : <div className="vx-ui-layer-meta">{meta}</div>}
        <button type="button" className="vx-ui-layer-close" onClick={onClose} aria-label="关闭">×</button>
      </header>
      <div className="vx-ui-layer-body">{children}</div>
      {footer === undefined ? null : <footer className="vx-ui-layer-foot">{footer}</footer>}
    </>
  )
}

/** 右侧检查器：详情一律在这里，不挤占列表。 */
export function Drawer({ open, title, subtitle, meta, onClose, children, footer, width = 780 }: {
  open: boolean
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}): ReactNode {
  return (
    <Overlay open={open} onClose={onClose} variant="sheet" label={typeof title === 'string' ? title : '详情'}>
      <div className="vx-ui-sheet" style={{ width: `min(${width}px, 100%)` }}>
        <LayerChrome title={title} subtitle={subtitle} meta={meta} onClose={onClose} footer={footer}>
          {children}
        </LayerChrome>
      </div>
    </Overlay>
  )
}

/** 居中弹窗：需要一眼看全的检查器用它，而不是贴边的抽屉。 */
export function Modal({ open, title, subtitle, meta, onClose, children, footer, width = 720, height }: {
  open: boolean
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
  /** 固定高度（CSS 长度，如 `min(84vh, 760px)`）；不给就按内容自适应。 */
  height?: string | undefined
}): ReactNode {
  return (
    <Overlay open={open} onClose={onClose} variant="modal" label={typeof title === 'string' ? title : '弹窗'}>
      <div className="vx-ui-modal" style={{ width: `min(${width}px, 100%)`, height }}>
        <LayerChrome title={title} subtitle={subtitle} meta={meta} onClose={onClose} footer={footer}>
          {children}
        </LayerChrome>
      </div>
    </Overlay>
  )
}

// ── 复制 ───────────────────────────────────────────────────────────────────
export function useCopy(): { copy: (text: string, label?: string) => void; copied: string } {
  const [copied, setCopied] = useState('')
  const timer = useRef(0)
  const copy = useCallback((text: string, label = '内容'): void => {
    const done = (): void => {
      setCopied(label)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(''), 1600)
    }
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(done).catch(() => done())
    } else {
      done()
    }
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return { copy, copied }
}

/** 报文块：等宽、可滚动、默认限高。 */
export function CodeBlock({ text, maxHeight = 320, empty = '（空）' }: { text: string; maxHeight?: number; empty?: string | undefined }): ReactNode {
  const content = text === '' ? empty : text
  return <pre className="vx-ui-code" style={{ maxHeight }}>{content}</pre>
}
