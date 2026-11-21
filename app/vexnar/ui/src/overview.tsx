// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 概览（Overview）—— Web 控制台 `/dashboard` 在 dsh 客户端里的整页复刻与加强。
 *
 * 页面只保留一个日期筛选（7/30/90 天）；其余全部是数据本身：KPI 环比、Token
 * 构成与走势、缓存效率、漏洞严重度/状态/类目、任务健康度、90 天活跃热力图、
 * 活动流、最新发现、任务表、资产构成、流量健康度与系统状态。
 *
 * 图形全部手绘 SVG：没有图表依赖，色板走 `--vx-chart-*` 令牌桥接 dsh 的静态
 * 色阶，浅色/深色、皮肤换色都自动跟随；宽度用 ResizeObserver 实测像素绘制，
 * 轴标签不随容器拉伸变形。所有数值 tabular-nums，百分比统一一位小数。
 *
 * 数据只读：走 vexnar-core 同源代理（与其它面板同一 base/token）；轮询在页面
 * 隐藏时暂停，卸载 abort，单接口失败只降级对应区块。
 *
 * 两张卡的口径与后端一致，不要退回旧语义：
 *   - 流量：读 `/api/traffic/capture`。抓包由 chat 会话发起（conv- / session-
 *     scope），`active` 表示“有会话正在抓”，不是站点级 settings 开关；
 *   - 活动流：读 `/api/exploration/activity`（不带 task = 全站最近活动）。
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/* ══════════════════════════════════════════════════════════════════════════
   数据层
   ══════════════════════════════════════════════════════════════════════════ */

const CORE_PATH = '/vexnar-api'

function storeGet(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function storeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* 存储被禁用时只保留内存状态 */
  }
}

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(CORE_PATH + path, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as T
}

interface TaskRow {
  id?: string
  name?: string
  description?: string
  goal?: string
  status?: string
  engine_mode?: string
  goals_met?: number
  goals_total?: number
  in_flight?: number
  last_activity_unix?: number
  created_unix?: number
  completed_unix?: number
}

interface FindingRow {
  id?: string
  finding_id?: string
  vulnclass?: string
  severity?: string
  status?: string
  summary?: string
  ts?: string
  task_description?: string
}

interface Exchange {
  id?: string
  ts?: string
  host?: string
  method?: string
  url?: string
  status?: number
}

/** `/api/traffic/capture`：会话发起的抓包态 + 最近流量样本。 */
interface CaptureSummary {
  active?: boolean
  sessions?: Array<{ conv_id?: number; scope?: string; source?: string; started_at?: number; items?: number; last_ts?: number }>
  total?: number
  last_ts?: number
  recent?: Exchange[]
}

interface ActivityRow {
  seq?: number
  ts?: string
  kind?: string
  worker?: string
  tool?: string
  summary?: string
}

interface DayBucket {
  day?: string
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
}

interface SevCounts {
  total: number
  pending: number
  critical: number
  high: number
  medium: number
  low: number
}

interface SysCounts {
  agents: number
  agentsOn: number
  mcp: number
  mcpOn: number
  tools: number
  toolsOn: number
}

interface OverviewData {
  tasks: TaskRow[]
  stats: SevCounts
  findings: FindingRow[]
  assets: Record<string, number>
  daily: DayBucket[]
  traffic: Exchange[]
  trafficTotal: number
  activity: ActivityRow[]
  sys: SysCounts
  /** A chat conversation has capture armed right now. */
  capture: boolean
  captureSessions: number
  captureLastTs: number
  updated: number
}

const EMPTY_DATA: OverviewData = {
  tasks: [],
  stats: { total: 0, pending: 0, critical: 0, high: 0, medium: 0, low: 0 },
  findings: [],
  assets: {},
  daily: [],
  traffic: [],
  trafficTotal: 0,
  activity: [],
  sys: { agents: 0, agentsOn: 0, mcp: 0, mcpOn: 0, tools: 0, toolsOn: 0 },
  capture: false,
  captureSessions: 0,
  captureLastTs: 0,
  updated: 0
}

function pick<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback
}

/** 一次概览抓取：全部接口并行，单个失败只降级那一块。 */
async function loadOverview(signal: AbortSignal): Promise<{ data: OverviewData; error: string }> {
  const settled = await Promise.allSettled([
    getJson<{ tasks?: TaskRow[] }>('/api/tasks', signal),
    getJson<Partial<SevCounts>>('/api/exploration/findings/stats', signal),
    getJson<{ items?: FindingRow[] }>('/api/exploration/findings?page=1&limit=60', signal),
    getJson<Record<string, number>>('/api/assets/counts', signal),
    getJson<DayBucket[]>('/api/tokens/daily?days=365', signal),
    getJson<CaptureSummary>('/api/traffic/capture', signal),
    getJson<{ items?: ActivityRow[] }>('/api/exploration/activity?limit=14', signal),
    getJson<{ agents?: Array<{ enabled?: boolean }> }>('/api/agents', signal),
    getJson<{ servers?: Array<{ enabled?: boolean }> }>('/api/mcp', signal),
    getJson<{ tools?: Array<{ enabled?: boolean }> }>('/api/tools', signal)
  ])

  // 只有主数据源（任务/发现/资产/Token）失败才算“数据不可用”。流量与活动流走 Go
  // 回退接口，未配置回退时降级为空图，不影响其余指标。
  const rejected = settled.slice(0, 5).filter((item) => item.status === 'rejected')[0] as PromiseRejectedResult | undefined
  const failure = rejected === undefined ? undefined : (rejected.reason as Error | undefined)
  const error = failure === undefined ? '' : String(failure.message ?? failure)

  const tasks = pick(settled[0] as PromiseSettledResult<{ tasks?: TaskRow[] }>, {})
  const stats = pick(settled[1] as PromiseSettledResult<Partial<SevCounts>>, {})
  const findings = pick(settled[2] as PromiseSettledResult<{ items?: FindingRow[] }>, {})
  const assets = pick(settled[3] as PromiseSettledResult<Record<string, number>>, {})
  const daily = pick(settled[4] as PromiseSettledResult<DayBucket[]>, [])
  const capture = pick(settled[5] as PromiseSettledResult<CaptureSummary>, {})
  const activity = pick(settled[6] as PromiseSettledResult<{ items?: ActivityRow[] }>, {})
  const agents = pick(settled[7] as PromiseSettledResult<{ agents?: Array<{ enabled?: boolean }> }>, {})
  const mcp = pick(settled[8] as PromiseSettledResult<{ servers?: Array<{ enabled?: boolean }> }>, {})
  const tools = pick(settled[9] as PromiseSettledResult<{ tools?: Array<{ enabled?: boolean }> }>, {})

  const countOn = (rows: Array<{ enabled?: boolean }> | undefined): number =>
    (rows ?? []).filter((row) => row.enabled !== false).length

  // Capture is armed per chat conversation, so the overview reports the armed
  // sessions instead of the station-wide `settings.traffic_capture` flag.
  const sessions = Array.isArray(capture.sessions) ? capture.sessions : []
  const recent = Array.isArray(capture.recent) ? capture.recent : []

  return {
    error,
    data: {
      tasks: Array.isArray(tasks.tasks) ? tasks.tasks : [],
      stats: {
        total: Number(stats.total ?? 0),
        pending: Number(stats.pending ?? 0),
        critical: Number(stats.critical ?? 0),
        high: Number(stats.high ?? 0),
        medium: Number(stats.medium ?? 0),
        low: Number(stats.low ?? 0)
      },
      findings: Array.isArray(findings.items) ? findings.items : [],
      assets: assets !== null && typeof assets === 'object' ? assets : {},
      daily: Array.isArray(daily) ? daily : [],
      traffic: recent,
      trafficTotal: Number(capture.total ?? 0),
      activity: Array.isArray(activity.items) ? activity.items : [],
      sys: {
        agents: agents.agents?.length ?? 0,
        agentsOn: countOn(agents.agents),
        mcp: mcp.servers?.length ?? 0,
        mcpOn: countOn(mcp.servers),
        tools: tools.tools?.length ?? 0,
        toolsOn: countOn(tools.tools)
      },
      // Only the capture aggregate decides: `settings.traffic_capture` is the
      // collector's own switch and says nothing about an armed conversation.
      capture: capture.active === true || sessions.length > 0,
      captureSessions: sessions.length,
      captureLastTs: Number(capture.last_ts ?? 0),
      updated: Date.now()
    }
  }
}

/** 概览数据；轮询在标签页隐藏时跳过，回到前台立刻补一次。 */
function useOverview(intervalMs: number): { data: OverviewData; error: string; reload: () => void } {
  const [data, setData] = useState<OverviewData>(EMPTY_DATA)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let alive = true
    let busy = false

    const load = async (): Promise<void> => {
      if (busy || document.visibilityState === 'hidden') return
      busy = true
      try {
        const next = await loadOverview(controller.signal)
        if (!alive) return
        setData(next.data)
        setError(next.error)
      } catch (reason) {
        if (alive && !controller.signal.aborted) setError(String((reason as Error)?.message ?? reason))
      } finally {
        busy = false
      }
    }

    void load()
    const timer = window.setInterval(() => { void load() }, intervalMs)
    const onVisible = (): void => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs, nonce])

  return { data, error, reload: () => setNonce((value) => value + 1) }
}

/* ══════════════════════════════════════════════════════════════════════════
   格式化
   ══════════════════════════════════════════════════════════════════════════ */

const pad2 = (value: number): string => (value < 10 ? `0${value}` : String(value))

function fmtNum(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 1000) return `${(value / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k`
  return String(Math.round(value))
}

function fmtInt(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString('zh-CN') : '—'
}

function fmtPct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(digits)}%`
}

function fmtRel(ts?: string | number): string {
  if (ts === undefined || ts === null || ts === '') return '—'
  const ms = Date.now() - (typeof ts === 'number' ? ts * 1000 : Date.parse(ts))
  if (!Number.isFinite(ms) || ms < 0) return '刚刚'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s 前`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m 前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h 前`
  const days = Math.floor(hours / 24)
  return days < 30 ? `${days}d 前` : `${Math.floor(days / 30)}mo 前`
}

/** 环比：上一周期为 0 时没有意义，返回 null（显示“新”）。 */
function deltaOf(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null
  return ((current - previous) / previous) * 100
}

const ASSET_LABELS: Record<string, string> = {
  root_domain: '根域名',
  ip: 'IP',
  subdomain: '子域名',
  app: '应用',
  service: '服务',
  endpoint: '端点'
}

const SEVERITY_META: Array<{ key: 'critical' | 'high' | 'medium' | 'low'; label: string; tone: string }> = [
  { key: 'critical', label: '严重', tone: 'var(--vx-chart-5)' },
  { key: 'high', label: '高危', tone: 'var(--vx-chart-4)' },
  { key: 'medium', label: '中危', tone: 'var(--vx-chart-1)' },
  { key: 'low', label: '低危', tone: 'var(--vx-chart-3)' }
]

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  in_progress: '处理中',
  confirmed: '已确认',
  resolved: '已解决',
  fixed: '已修复',
  false_positive: '误报',
  ignored: '忽略',
  duplicate: '重复',
  risk_accepted: '接受风险'
}

const TASK_STATUS: Record<string, { label: string; tone: string }> = {
  created: { label: '待启动', tone: 'var(--vx-text-faint)' },
  queued: { label: '排队', tone: 'var(--vx-chart-2)' },
  running: { label: '运行中', tone: 'var(--vx-chart-1)' },
  paused: { label: '已暂停', tone: 'var(--vx-chart-4)' },
  done: { label: '已完成', tone: 'var(--vx-chart-3)' },
  failed: { label: '失败', tone: 'var(--vx-chart-5)' }
}

/* ══════════════════════════════════════════════════════════════════════════
   图形基元
   ══════════════════════════════════════════════════════════════════════════ */

/** 实测容器宽度（像素），图表按真实像素绘制。 */
function useWidth<T extends HTMLElement>(): [(node: T | null) => void, number] {
  const [width, setWidth] = useState(0)
  const observer = useRef<ResizeObserver | null>(null)
  const attach = useCallback((node: T | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (node === null) return
    setWidth(node.clientWidth)
    if (typeof ResizeObserver !== 'function') return
    const resize = new ResizeObserver(() => { setWidth(node.clientWidth) })
    resize.observe(node)
    observer.current = resize
  }, [])
  useEffect(() => () => { observer.current?.disconnect() }, [])
  return [attach, width]
}

function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 10
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const ratio = value / magnitude
  const step = ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 2.5 ? 2.5 : ratio <= 5 ? 5 : 10
  return step * magnitude
}

/** Catmull-Rom → 三次贝塞尔：平滑折线，不越过数据点。 */
function smoothPath(points: ReadonlyArray<readonly [number, number]>): string {
  if (points.length === 0) return ''
  const first = points[0]
  if (first === undefined) return ''
  if (points.length === 1) return `M${first[0]},${first[1]}`
  let d = `M${first[0]},${first[1]}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const p1 = points[index]
    const p2 = points[index + 1]
    if (p1 === undefined || p2 === undefined) break
    const p0 = points[index - 1] ?? p1
    const p3 = points[index + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`
  }
  return d
}

type IconName =
  | 'gauge' | 'target' | 'bug' | 'network' | 'activity' | 'zap' | 'shield' | 'clock'
  | 'calendar' | 'arrowUp' | 'arrowDown' | 'minus' | 'layers' | 'flame'

const ICON_PATHS: Record<IconName, ReactNode> = {
  gauge: (
    <>
      <path d="M12 13.5 16 9" />
      <path d="M5.5 19a8.5 8.5 0 1 1 13 0" />
      <circle cx="12" cy="14" r="1.4" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  bug: (
    <>
      <path d="M8 6a4 4 0 0 1 8 0" />
      <rect x="6.5" y="8" width="11" height="11" rx="5.5" />
      <path d="M3 12h3.5M17.5 12H21M4.5 17h2.2M17.3 17h2.2M6 7.5 4 5.5M18 7.5l2-2" />
    </>
  ),
  network: (
    <>
      <rect x="9" y="3" width="6" height="5" rx="1.4" />
      <rect x="3" y="16" width="6" height="5" rx="1.4" />
      <rect x="15" y="16" width="6" height="5" rx="1.4" />
      <path d="M12 8v5M6 16v-3h12v3" />
    </>
  ),
  activity: <path d="M3 12h4l2.5-6 4 12L16 12h5" />,
  zap: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />,
  shield: (
    <>
      <path d="M12 3l7 3v6c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6l7-3Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.4" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </>
  ),
  arrowUp: <path d="M12 19V5m0 0-5.5 5.5M12 5l5.5 5.5" />,
  arrowDown: <path d="M12 5v14m0 0 5.5-5.5M12 19l-5.5-5.5" />,
  minus: <path d="M5 12h14" />,
  layers: <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3ZM3 12.5 12 17l9-4.5M3 17 12 21.5 21 17" />,
  flame: <path d="M12 3c3.5 4 6 6.4 6 10a6 6 0 0 1-12 0c0-2.2 1.2-3.9 3-5.6.4 1.6 1.3 2.4 2.4 2.6C11 8.4 11.2 5.6 12 3Z" />
}

function Icon({ name, size = 14 }: { name: IconName; size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  )
}

/** 分段筛选：滑块随选中项平移，去掉了页面标题与刷新按钮。 */
function Segmented({
  value,
  options,
  onChange
}: {
  value: string
  options: ReadonlyArray<{ key: string; label: string }>
  onChange: (key: string) => void
}): ReactNode {
  const index = Math.max(0, options.findIndex((option) => option.key === value))
  return (
    <div className="vx-ov-seg" role="group" aria-label="统计范围">
      <span
        className="vx-ov-seg-thumb"
        style={{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
        aria-hidden="true"
      />
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={option.key === value}
          onClick={() => { onChange(option.key) }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Delta({ value, suffix }: { value: number | null; suffix?: string }): ReactNode {
  if (value === null) return null
  const dir = value > 0.05 ? 'up' : value < -0.05 ? 'down' : 'flat'
  return (
    <span className="vx-ov-delta" data-dir={dir}>
      <Icon name={dir === 'up' ? 'arrowUp' : dir === 'down' ? 'arrowDown' : 'minus'} size={11} />
      {fmtPct(Math.abs(value))}
      {suffix !== undefined ? <em>{suffix}</em> : null}
    </span>
  )
}

function Spark({ values, height = 16 }: { values: number[]; height?: number }): ReactNode {
  const uid = useId().replace(/:/g, '')
  const w = 74
  const h = 24
  const data = values.length > 1 ? values : [0, 0]
  const max = Math.max(...data, 1)
  const step = w / (data.length - 1)
  const points = data.map((value, index) => [index * step, h - 2 - (value / max) * (h - 5)] as const)
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`
  return (
    <svg className="vx-ov-spark" width="100%" height={height} viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-spark`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--vx-tone, var(--vx-chart-1))', stopOpacity: 0.32 }} />
          <stop offset="100%" style={{ stopColor: 'var(--vx-tone, var(--vx-chart-1))', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${uid}-spark)`} />
      <path d={line} fill="none" stroke="var(--vx-tone, var(--vx-chart-1))" strokeWidth="1.4"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

interface TrendPoint {
  day: string
  input: number
  output: number
  cache: number
  total: number
  prev: number
}

/** 平滑面积图：本期实线 + 上期虚线，悬停十字准星与浮层。 */
function AreaChart({ points, height }: { points: TrendPoint[]; height: number }): ReactNode {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const uid = useId().replace(/:/g, '')
  const w = Math.max(width, 300)
  const pad = { top: 14, right: 10, bottom: 20, left: 40 }
  const plotW = Math.max(w - pad.left - pad.right, 40)
  const plotH = Math.max(height - pad.top - pad.bottom, 40)
  const max = niceMax(points.reduce((high, point) => Math.max(high, point.total, point.prev), 0))
  const x = (index: number): number => pad.left + (points.length <= 1 ? plotW / 2 : (plotW * index) / (points.length - 1))
  const y = (value: number): number => pad.top + plotH - (value / max) * plotH
  const current = points.map((point, index) => [x(index), y(point.total)] as const)
  const previous = points.map((point, index) => [x(index), y(point.prev)] as const)
  const line = smoothPath(current)
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(pad.top + plotH).toFixed(1)} L${pad.left},${(pad.top + plotH).toFixed(1)} Z`
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const labelStep = Math.max(1, Math.ceil(points.length / 6))
  const active = hover !== null ? points[hover] : undefined
  const tipLeft = hover !== null ? Math.min(Math.max(x(hover), 84), w - 84) : 0

  return (
    <div className="vx-ov-plot" ref={ref}>
      <svg width={w} height={height} role="img" aria-label="每日 Token 消耗趋势">
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--vx-chart-1)', stopOpacity: 0.32 }} />
            <stop offset="70%" style={{ stopColor: 'var(--vx-chart-1)', stopOpacity: 0.06 }} />
            <stop offset="100%" style={{ stopColor: 'var(--vx-chart-1)', stopOpacity: 0 }} />
          </linearGradient>
          <linearGradient id={`${uid}-stroke`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: 'var(--vx-chart-1)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--vx-chart-2)' }} />
          </linearGradient>
        </defs>
        {ticks.map((ratio) => {
          const ty = pad.top + plotH * (1 - ratio)
          return (
            <g key={ratio}>
              <line x1={pad.left} x2={pad.left + plotW} y1={ty} y2={ty}
                stroke="var(--vx-chart-grid)" strokeDasharray={ratio === 0 ? undefined : '1 4'} />
              <text x={pad.left - 8} y={ty + 3} textAnchor="end" className="vx-ov-axis">{fmtNum(max * ratio)}</text>
            </g>
          )
        })}
        <path d={area} fill={`url(#${uid}-fill)`} />
        <path d={smoothPath(previous)} fill="none" stroke="var(--vx-chart-6)" strokeWidth="1.2"
          strokeDasharray="4 4" strokeOpacity="0.55" />
        <path d={line} fill="none" stroke={`url(#${uid}-stroke)`} strokeWidth="2" strokeLinecap="round"
          className="vx-ov-draw" />
        {points.map((point, index) => {
          const last = index === points.length - 1
          if (!last && index % labelStep !== 0) return null
          return (
            <text key={`x-${point.day}`} x={x(index)} y={height - 5}
              textAnchor={last ? 'end' : index === 0 ? 'start' : 'middle'} className="vx-ov-axis">
              {point.day.slice(5)}
            </text>
          )
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotH}
              stroke="var(--vx-chart-1)" strokeOpacity="0.4" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(points[hover]?.total ?? 0)} r="3.4" fill="var(--vx-chart-1)"
              stroke="var(--vx-surface)" strokeWidth="1.6" />
          </g>
        )}
        {points.map((point, index) => (
          <rect key={`hit-${point.day}`} x={x(index) - plotW / Math.max(points.length, 1) / 2}
            y={pad.top} width={plotW / Math.max(points.length, 1)} height={plotH} fill="transparent"
            onPointerEnter={() => { setHover(index) }}
            onPointerLeave={() => { setHover((value) => (value === index ? null : value)) }} />
        ))}
      </svg>
      {active !== undefined && (
        <div className="vx-ov-tip" style={{ left: tipLeft, top: 2 }}>
          <div className="vx-ov-tip-day">{active.day}</div>
          <div className="vx-ov-tip-row"><span><i className="vx-ov-dot" style={{ background: 'var(--vx-chart-1)' }} />本期</span><b>{fmtNum(active.total)}</b></div>
          <div className="vx-ov-tip-row"><span><i className="vx-ov-dot" style={{ background: 'var(--vx-chart-6)' }} />上期</span><b>{fmtNum(active.prev)}</b></div>
          <div className="vx-ov-tip-row vx-ov-tip-total">
            <span><i className="vx-ov-dot" style={{ background: 'var(--vx-chart-3)' }} />缓存</span><b>{fmtNum(active.cache)}</b>
          </div>
        </div>
      )}
    </div>
  )
}

/** 环形图：分段 + 中心读数。 */
function Donut({
  segments,
  size = 128,
  thickness = 12,
  center,
  caption
}: {
  segments: Array<{ label: string; value: number; tone: string }>
  size?: number
  thickness?: number
  center: string
  caption: string
}): ReactNode {
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  let offset = 0
  return (
    <div className="vx-ov-donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--vx-chart-grid)" strokeWidth={thickness} />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {segments.map((segment) => {
            const length = total > 0 ? (segment.value / total) * circumference : 0
            const drawn = Math.max(length - 2.5, 0)
            const node = length > 0
              ? (
                <circle key={segment.label} cx={size / 2} cy={size / 2} r={radius} fill="none"
                  stroke={segment.tone} strokeWidth={thickness} strokeLinecap="round"
                  strokeDasharray={`${drawn} ${circumference - drawn}`} strokeDashoffset={-offset}
                  className="vx-ov-arc" />
              )
              : null
            offset += length
            return node
          })}
        </g>
      </svg>
      <span className="vx-ov-donut-center">
        <b>{center}</b>
        <em>{caption}</em>
      </span>
    </div>
  )
}

/** 单值进度环。 */
function Ring({ value, label, caption, size = 92 }: { value: number; label: string; caption: string; size?: number }): ReactNode {
  const uid = useId().replace(/:/g, '')
  const thickness = 9
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const ratio = Math.max(0, Math.min(1, value / 100))
  return (
    <div className="vx-ov-ring">
      <div className="vx-ov-ring-box" style={{ width: size, height: size }}>
        <svg width={size} height={size} aria-hidden="true">
          <defs>
            <linearGradient id={`${uid}-ring`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--vx-chart-3)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--vx-chart-1)' }} />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--vx-chart-grid)" strokeWidth={thickness} />
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={`url(#${uid}-ring)`}
            strokeWidth={thickness} strokeLinecap="round"
            strokeDasharray={`${circumference * ratio} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} className="vx-ov-arc" />
        </svg>
        <span className="vx-ov-ring-value">{fmtPct(value, 0)}</span>
      </div>
      <span className="vx-ov-ring-label">{label}</span>
      <span className="vx-ov-ring-caption">{caption}</span>
    </div>
  )
}

/** 横向分布条：标签 + 轨道 + 数量 + 占比。 */
function HBars({ rows }: { rows: Array<{ label: string; value: number; tone?: string }> }): ReactNode {
  if (rows.length === 0) return <Empty label="暂无数据" />
  const max = Math.max(...rows.map((row) => row.value), 1)
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  return (
    <div className="vx-ov-hbars">
      {rows.map((row) => (
        <div className="vx-ov-hbar" key={row.label}>
          <span className="vx-ov-hbar-label">{row.label}</span>
          <span className="vx-ov-hbar-track">
            <i style={{ width: `${Math.max((row.value / max) * 100, 3)}%`, background: row.tone ?? 'var(--vx-chart-6)' }} />
          </span>
          <span className="vx-ov-hbar-value">{fmtInt(row.value)}</span>
          <span className="vx-ov-hbar-pct">{total > 0 ? fmtPct((row.value / total) * 100, 0) : '—'}</span>
        </div>
      ))}
    </div>
  )
}

/** 90 天活跃热力图。 */
function Heatmap({ days }: { days: Array<{ day: string; value: number }> }): ReactNode {
  const max = Math.max(...days.map((item) => item.value), 1)
  const cells = [...days]
  // 补齐到整周，首列从周一开始排。
  while (cells.length % 7 !== 0) cells.unshift({ day: '', value: -1 })
  return (
    <div className="vx-ov-heat-wrap">
      <div className="vx-ov-heat">
        {cells.map((cell, index) => {
          const ratio = cell.value < 0 ? -1 : cell.value / max
          const level = ratio < 0 ? 'pad' : ratio === 0 ? '0' : ratio < 0.25 ? '1' : ratio < 0.5 ? '2' : ratio < 0.75 ? '3' : '4'
          return (
            <span
              key={`${cell.day}-${index}`}
              className="vx-ov-heat-cell"
              data-level={level}
              title={cell.value < 0 ? '' : `${cell.day} · ${fmtNum(cell.value)} tokens`}
            />
          )
        })}
      </div>
      <div className="vx-ov-heat-legend">
        <span>少</span>
        {['0', '1', '2', '3', '4'].map((level) => <i key={level} data-level={level} />)}
        <span>多</span>
      </div>
    </div>
  )
}

/** 状态码构成条：一段一条，宽度按占比。 */
function CodeBar({ codes, total }: { codes: Array<{ label: string; value: number; tone: string }>; total: number }): ReactNode {
  if (total <= 0) return <span className="vx-ov-codebar vx-ov-codebar--empty" />
  return (
    <span className="vx-ov-codebar">
      {codes.map((code) => (
        <i key={code.label} style={{ flexGrow: Math.max(code.value, 0.01), background: code.tone }} title={`${code.label} · ${code.value}`} />
      ))}
    </span>
  )
}

function Empty({ label }: { label: string }): ReactNode {
  return (
    <div className="vx-ov-empty">
      <Icon name="layers" size={18} />
      <span>{label}</span>
    </div>
  )
}

/** 区块外壳：图标 + 标题 + 说明 + 右侧操作。 */
function Section({
  span = 12,
  icon,
  title,
  caption,
  action,
  children
}: {
  span?: 4 | 6 | 8 | 12
  icon: IconName
  title: string
  caption?: string
  action?: ReactNode
  children: ReactNode
}): ReactNode {
  return (
    <section className={`vx-ov-card vx-ov-span-${span}`}>
      <header className="vx-ov-h">
        <Icon name={icon} size={13} />
        <h3>{title}</h3>
        {caption !== undefined ? <span className="vx-ov-sub">{caption}</span> : null}
        {action !== undefined ? <span className="vx-ov-h-action">{action}</span> : null}
      </header>
      <div className="vx-ov-card-body">{children}</div>
    </section>
  )
}

/** KPI 卡：主数值 + 环比 + 迷你趋势 + 注释。 */
function Stat({
  tone,
  icon,
  label,
  value,
  unit,
  delta,
  spark,
  band,
  footer
}: {
  tone: 'blue' | 'violet' | 'green' | 'amber' | 'red'
  icon: IconName
  label: string
  value: string
  unit?: string
  delta?: number | null
  spark?: number[]
  band?: ReactNode
  footer: ReactNode
}): ReactNode {
  return (
    <article className={`vx-ov-stat vx-ov-tone-${tone}`}>
      <div className="vx-ov-stat-top">
        <span className="vx-ov-stat-icon"><Icon name={icon} size={13} /></span>
        <span className="vx-ov-stat-label">{label}</span>
        {delta !== undefined ? <Delta value={delta} suffix="环比" /> : null}
      </div>
      <div className="vx-ov-stat-value">
        {value}
        {unit !== undefined ? <em>{unit}</em> : null}
      </div>
      <div className="vx-ov-stat-foot">{footer}</div>
      {spark !== undefined ? <Spark values={spark} /> : null}
      {band !== undefined ? <div className="vx-ov-stat-band">{band}</div> : null}
    </article>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   派生数据
   ══════════════════════════════════════════════════════════════════════════ */

const RANGES = [
  { key: '7', days: 7, label: '7 天' },
  { key: '30', days: 30, label: '30 天' },
  { key: '90', days: 90, label: '90 天' }
] as const

type RangeKey = (typeof RANGES)[number]['key']

function dateKey(ago: number): string {
  const now = new Date()
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  cursor.setUTCDate(cursor.getUTCDate() - ago)
  return `${cursor.getUTCFullYear()}-${pad2(cursor.getUTCMonth() + 1)}-${pad2(cursor.getUTCDate())}`
}

/** 最近 days 天 + 上一周期同日对比，缺日补 0。 */
function buildRange(daily: DayBucket[], days: number): TrendPoint[] {
  const map = new Map<string, DayBucket>()
  for (const row of daily) {
    const key = String(row.day ?? '')
    if (key !== '') map.set(key, row)
  }
  const out: TrendPoint[] = []
  for (let ago = days - 1; ago >= 0; ago -= 1) {
    const day = dateKey(ago)
    const previous = map.get(dateKey(ago + days))
    const current = map.get(day)
    const input = Number(current?.input_tokens ?? 0)
    const output = Number(current?.output_tokens ?? 0)
    const cache = Number(current?.cache_read_tokens ?? 0)
    const prevInput = Number(previous?.input_tokens ?? 0)
    const prevOutput = Number(previous?.output_tokens ?? 0)
    out.push({ day, input, output, cache, total: input + output, prev: prevInput + prevOutput })
  }
  return out
}

interface View {
  scopeDays: number
  counts: { created: number; queued: number; running: number; paused: number; done: number; failed: number }
  completionRate: number
  goalRate: number
  created: number
  createdPrev: number
  throughput: number[]
  tasks: TaskRow[]
  recentTasks: TaskRow[]
  sev: SevCounts
  sevHighRate: number
  findings: FindingRow[]
  findingsDaily: number[]
  vulnTop: Array<{ label: string; value: number; tone?: string }>
  statusRows: Array<{ label: string; value: number; tone?: string }>
  trend: TrendPoint[]
  tokens: { input: number; output: number; cache: number; total: number; prev: number; cacheRate: number; dailyAvg: number; peak: { day: string; value: number } }
  heat: Array<{ day: string; value: number }>
  codes: Array<{ label: string; value: number; tone: string }>
  /** All recorded exchanges, not just the recent sample. */
  trafficTotal: number
  methods: Array<{ label: string; value: number; tone?: string }>
  hosts: Array<{ label: string; value: number; tone?: string }>
  errorRate: number
  assets: { rows: Array<{ label: string; value: number; tone?: string }>; total: number }
  activity: ActivityRow[]
  sys: SysCounts
  capture: boolean
}

const CODE_TONES = [
  { bucket: 2, label: '2xx', tone: 'var(--vx-chart-3)' },
  { bucket: 3, label: '3xx', tone: 'var(--vx-chart-1)' },
  { bucket: 4, label: '4xx', tone: 'var(--vx-chart-4)' },
  { bucket: 5, label: '5xx', tone: 'var(--vx-chart-5)' }
] as const

function derive(data: OverviewData, days: number): View {
  const cutoff = Date.now() / 1000 - days * 86400
  const prevCutoff = cutoff - days * 86400

  const counts = { created: 0, queued: 0, running: 0, paused: 0, done: 0, failed: 0 }
  let goalsMet = 0
  let goalsTotal = 0
  let created = 0
  let createdPrev = 0
  const throughput = new Array<number>(days).fill(0)
  for (const task of data.tasks) {
    const status = task.status ?? ''
    if (status === 'created') counts.created += 1
    else if (status === 'queued') counts.queued += 1
    else if (status === 'running') counts.running += 1
    else if (status === 'paused') counts.paused += 1
    else if (status === 'done') counts.done += 1
    else if (status === 'failed') counts.failed += 1
    goalsMet += Number(task.goals_met ?? 0)
    goalsTotal += Number(task.goals_total ?? 0)
    const createdUnix = Number(task.created_unix ?? 0)
    if (createdUnix >= cutoff) {
      created += 1
      const index = days - 1 - Math.min(days - 1, Math.floor((Date.now() / 1000 - createdUnix) / 86400))
      throughput[index] = (throughput[index] ?? 0) + 1
    } else if (createdUnix >= prevCutoff) {
      createdPrev += 1
    }
  }

  const trend = buildRange(data.daily, days)
  const tokens = trend.reduce(
    (acc, point) => ({
      input: acc.input + point.input,
      output: acc.output + point.output,
      cache: acc.cache + point.cache,
      total: acc.total + point.total,
      prev: acc.prev + point.prev
    }),
    { input: 0, output: 0, cache: 0, total: 0, prev: 0 }
  )
  const cacheRate = tokens.input > 0 ? (tokens.cache / tokens.input) * 100 : 0
  const peak = trend.reduce((best, point) => (point.total > best.value ? { day: point.day, value: point.total } : best),
    { day: trend[0]?.day ?? '—', value: 0 })

  const sevTotal = data.stats.critical + data.stats.high + data.stats.medium + data.stats.low

  const vulnCounts = new Map<string, number>()
  const statusCounts = new Map<string, number>()
  for (const finding of data.findings) {
    const vuln = finding.vulnclass ?? '未分类'
    vulnCounts.set(vuln, (vulnCounts.get(vuln) ?? 0) + 1)
    const status = finding.status ?? 'unknown'
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1)
  }
  const vulnTop = [...vulnCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value, tone: 'var(--vx-chart-2)' }))
  const statusRows = [...statusCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([status, value]) => ({
      label: STATUS_LABELS[status] ?? status,
      value,
      tone: status === 'confirmed' || status === 'resolved' || status === 'fixed' ? 'var(--vx-chart-3)' : 'var(--vx-chart-1)'
    }))

  const codeCounts = new Map<number, number>()
  const methodCounts = new Map<string, number>()
  const hostCounts = new Map<string, number>()
  for (const exchange of data.traffic) {
    const status = Number(exchange.status ?? 0)
    if (status > 0) {
      const bucket = Math.floor(status / 100)
      codeCounts.set(bucket, (codeCounts.get(bucket) ?? 0) + 1)
    }
    const method = String(exchange.method ?? 'GET')
    methodCounts.set(method, (methodCounts.get(method) ?? 0) + 1)
    const host = String(exchange.host ?? '—')
    hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1)
  }
  const codes = CODE_TONES.map((item) => ({ label: item.label, value: codeCounts.get(item.bucket) ?? 0, tone: item.tone }))
  const trafficTotal = data.traffic.length
  const errorRate = trafficTotal > 0
    ? (((codeCounts.get(4) ?? 0) + (codeCounts.get(5) ?? 0)) / trafficTotal) * 100
    : 0

  const assetRows = Object.entries(data.assets)
    .filter(([, value]) => Number(value) > 0)
    .map(([type, value]) => ({ label: ASSET_LABELS[type] ?? type, value: Number(value), tone: 'var(--vx-chart-6)' }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 6)
  const assetTotal = Object.values(data.assets).reduce((sum, value) => sum + Number(value), 0)

  const heat = buildRange(data.daily, 90).map((point) => ({ day: point.day, value: point.total }))
  const findingsDaily = new Array<number>(days).fill(0)
  for (const finding of data.findings) {
    const stamp = Date.parse(finding.ts ?? '')
    if (!Number.isFinite(stamp)) continue
    const ago = Math.floor((Date.now() - stamp) / 86400000)
    if (ago >= 0 && ago < days) findingsDaily[days - 1 - ago] = (findingsDaily[days - 1 - ago] ?? 0) + 1
  }

  const recentTasks = [...data.tasks]
    .sort((left, right) => Number(right.last_activity_unix ?? right.created_unix ?? 0) - Number(left.last_activity_unix ?? left.created_unix ?? 0))
    .slice(0, 7)
  const findings = [...data.findings].sort((left, right) => (Date.parse(right.ts ?? '') || 0) - (Date.parse(left.ts ?? '') || 0))
  const activity = [...data.activity].sort((left, right) => Number(right.seq ?? 0) - Number(left.seq ?? 0))

  return {
    scopeDays: days,
    counts,
    completionRate: data.tasks.length > 0 ? (counts.done / data.tasks.length) * 100 : 0,
    goalRate: goalsTotal > 0 ? (goalsMet / goalsTotal) * 100 : 0,
    created,
    createdPrev,
    throughput,
    tasks: data.tasks,
    recentTasks,
    sev: data.stats,
    sevHighRate: sevTotal > 0 ? ((data.stats.critical + data.stats.high) / sevTotal) * 100 : 0,
    findings,
    findingsDaily,
    vulnTop,
    statusRows,
    trend,
    tokens: { ...tokens, cacheRate, dailyAvg: days > 0 ? tokens.total / days : 0, peak },
    heat,
    codes,
    trafficTotal: data.trafficTotal,
    methods: [...methodCounts.entries()].sort((l, r) => r[1] - l[1]).slice(0, 4)
      .map(([label, value]) => ({ label, value, tone: 'var(--vx-chart-1)' })),
    hosts: [...hostCounts.entries()].sort((l, r) => r[1] - l[1]).slice(0, 4)
      .map(([label, value]) => ({ label, value, tone: 'var(--vx-chart-2)' })),
    errorRate,
    assets: { rows: assetRows, total: assetTotal },
    activity,
    sys: data.sys,
    capture: data.capture
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   整页
   ══════════════════════════════════════════════════════════════════════════ */

function kindLabel(row: ActivityRow): string {
  if (row.kind === 'tool_use') return row.tool !== undefined && row.tool !== '' ? row.tool : 'tool_use'
  return row.kind ?? 'activity'
}

function WorkerChip({ worker }: { worker: string }): ReactNode {
  const tone = worker === 'planner' ? 'violet' : worker === 'mainagent' ? 'blue' : 'green'
  return <span className={`vx-ov-worker vx-ov-tone-${tone}`}>{worker === '' ? 'agent' : worker}</span>
}

function StatusPill({ status }: { status: string }): ReactNode {
  const meta = TASK_STATUS[status]
  return (
    <span className="vx-ov-pill" style={meta === undefined ? undefined : { color: meta.tone, borderColor: `color-mix(in srgb, ${meta.tone} 38%, transparent)`, background: `color-mix(in srgb, ${meta.tone} 10%, transparent)` }}>
      {meta?.label ?? (status === '' ? '—' : status)}
    </span>
  )
}

/** 概览整页：只保留日期筛选，其余全部是分析视图。 */
export function OverviewPanel(): ReactNode {
  const [rangeKey, setRangeKey] = useState<RangeKey>(() => {
    const raw = storeGet('vexnar.overview.range.page')
    return raw === '7' || raw === '30' || raw === '90' ? raw : '30'
  })
  const days = RANGES.find((item) => item.key === rangeKey)?.days ?? 30
  const { data, error, reload } = useOverview(9000)
  const view = useMemo(() => derive(data, days), [data, days])
  const loading = data.updated === 0

  const tokenSpark = view.trend.map((point) => point.total)
  const tokenShare = view.tokens.total > 0 ? view.tokens.total : 1
  const inputUncached = Math.max(view.tokens.input - view.tokens.cache, 0)
  const shares = [
    { label: '输入（未命中）', value: inputUncached, tone: 'var(--vx-chart-1)' },
    { label: '缓存命中', value: view.tokens.cache, tone: 'var(--vx-chart-3)' },
    { label: '输出', value: view.tokens.output, tone: 'var(--vx-chart-2)' }
  ]

  return (
    <div className="vx-ov-page">
      <div className="vx-ov-toolbar">
        <Segmented
          value={rangeKey}
          options={RANGES.map((item) => ({ key: item.key, label: item.label }))}
          onChange={(key) => {
            setRangeKey(key as RangeKey)
            storeSet('vexnar.overview.range.page', key)
          }}
        />
      </div>

      {error !== '' && (
        <div className="vx-ov-error">
          <span>概览数据不可用：{error}</span>
          <button type="button" onClick={reload}>重试</button>
        </div>
      )}

      <div className="vx-ov-stats">
        <Stat
          tone="blue"
          icon="target"
          label="任务"
          value={String(view.counts.running)}
          unit={`/ ${view.tasks.length}`}
          delta={deltaOf(view.created, view.createdPrev)}
          spark={view.throughput}
          footer={(
            <span className="vx-ov-chips">
              {view.counts.created > 0 ? <span className="vx-ov-chip">待启动 {view.counts.created}</span> : null}
              {view.counts.done > 0 ? <span className="vx-ov-chip">完成 {view.counts.done}</span> : null}
              {view.counts.paused > 0 ? <span className="vx-ov-chip">暂停 {view.counts.paused}</span> : null}
              {view.counts.failed > 0 ? <span className="vx-ov-chip">失败 {view.counts.failed}</span> : null}
              {view.tasks.length === 0 ? <span className="vx-ov-chip">暂无任务</span> : null}
            </span>
          )}
        />
        <Stat
          tone="red"
          icon="bug"
          label="确认发现"
          value={fmtInt(view.sev.total)}
          spark={view.findingsDaily}
          footer={(
            <span className="vx-ov-chips">
              {SEVERITY_META.map((meta) => (
                <span className="vx-ov-chip" key={meta.key} style={{ color: meta.tone }}>
                  <i className="vx-ov-dot" style={{ background: meta.tone }} />
                  {meta.label} {fmtInt(view.sev[meta.key])}
                </span>
              ))}
              <span className="vx-ov-chip vx-ov-chip--muted">高危占比 {fmtPct(view.sevHighRate, 0)}</span>
            </span>
          )}
        />
        <Stat
          tone="amber"
          icon="zap"
          label="Token 消耗"
          value={fmtNum(view.tokens.total)}
          delta={deltaOf(view.tokens.total, view.tokens.prev)}
          spark={tokenSpark}
          footer={(
            <span className="vx-ov-chips">
              <span className="vx-ov-chip">日均 {fmtNum(view.tokens.dailyAvg)}</span>
              <span className="vx-ov-chip">峰值 {fmtNum(view.tokens.peak.value)}</span>
              <span className="vx-ov-chip">缓存 {fmtPct(view.tokens.cacheRate, 0)}</span>
            </span>
          )}
        />
        <Stat
          tone="green"
          icon="activity"
          label="抓包流量"
          value={fmtInt(view.trafficTotal)}
          band={<CodeBar codes={view.codes} total={data.traffic.length} />}
          footer={(
            <span className="vx-ov-chips">
              <span className="vx-ov-chip">
                {view.capture
                  ? `抓包中 ${data.captureSessions} 个会话`
                  : '未发起抓包'}
              </span>
              <span className="vx-ov-chip">错误 {fmtPct(view.errorRate, 0)}</span>
              <span className="vx-ov-chip">资产 {fmtInt(view.assets.total)}</span>
            </span>
          )}
        />
      </div>

      <div className="vx-ov-grid">
        <Section
          span={8}
          icon="zap"
          title="Token 消耗"
          caption={`近 ${days} 天 · 对比上一周期`}
          action={(
            <span className="vx-ov-legend">
              <span><i className="vx-ov-dot" style={{ background: 'var(--vx-chart-1)' }} />本期</span>
              <span><i className="vx-ov-dot" style={{ background: 'var(--vx-chart-6)' }} />上期</span>
            </span>
          )}
        >
          <div className="vx-ov-token">
            <div className="vx-ov-token-metrics">
              <div className="vx-ov-token-total">
                <span>合计（输入 + 输出）</span>
                <strong>{fmtNum(view.tokens.total)}</strong>
                <Delta value={deltaOf(view.tokens.total, view.tokens.prev)} suffix="环比" />
              </div>
              {shares.map((share) => (
                <div className="vx-ov-meter" key={share.label}>
                  <div className="vx-ov-meter-top">
                    <span>{share.label}</span>
                    <b style={{ color: share.tone }}>{fmtNum(share.value)}</b>
                  </div>
                  <span className="vx-ov-meter-track">
                    <i style={{ width: `${Math.max((share.value / tokenShare) * 100, 1.5)}%`, background: share.tone }} />
                  </span>
                </div>
              ))}
              <div className="vx-ov-mini-row">
                <span>日均 {fmtNum(view.tokens.dailyAvg)}</span>
                <span>峰值 {fmtNum(view.tokens.peak.value)}</span>
                <span>命中率 {fmtPct(view.tokens.cacheRate, 0)}</span>
              </div>
            </div>
            <div className="vx-ov-chart">
              {loading ? <div className="vx-ov-skeleton" /> : <AreaChart points={view.trend} height={218} />}
            </div>
          </div>
        </Section>

        <Section span={4} icon="shield" title="缓存效率" caption={`近 ${days} 天`}>
          <div className="vx-ov-efficiency">
            <Ring value={view.tokens.cacheRate} label="缓存命中率" caption={`${fmtNum(view.tokens.cache)} / ${fmtNum(view.tokens.input)}`} />
            <div className="vx-ov-kv-list">
              <div><span>输入总量</span><b>{fmtNum(view.tokens.input)}</b></div>
              <div><span>缓存命中</span><b>{fmtNum(view.tokens.cache)}</b></div>
              <div><span>输出总量</span><b>{fmtNum(view.tokens.output)}</b></div>
              <div><span>节省比例</span><b>{fmtPct(view.tokens.input > 0 ? (view.tokens.cache / view.tokens.input) * 100 : 0, 1)}</b></div>
            </div>
          </div>
        </Section>
      </div>

      <div className="vx-ov-grid">
        <Section span={4} icon="bug" title="漏洞严重度" caption={`共 ${fmtInt(view.sev.total)}`}>
          <div className="vx-ov-donut-row">
            <Donut
              segments={SEVERITY_META.map((meta) => ({ label: meta.label, value: view.sev[meta.key], tone: meta.tone }))}
              center={fmtInt(view.sev.total)}
              caption="确认发现"
            />
            <div className="vx-ov-legend-rows">
              {SEVERITY_META.map((meta) => (
                <div className="vx-ov-legend-row" key={meta.key}>
                  <i className="vx-ov-dot" style={{ background: meta.tone }} />
                  <span>{meta.label}</span>
                  <b>{fmtInt(view.sev[meta.key])}</b>
                  <em>{view.sev.total > 0 ? fmtPct((view.sev[meta.key] / view.sev.total) * 100, 0) : '—'}</em>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section span={4} icon="clock" title="处理状态" caption={`最近 ${data.findings.length} 条`}>
          <HBars rows={view.statusRows} />
        </Section>

        <Section span={4} icon="layers" title="Top 漏洞类" caption={`最近 ${data.findings.length} 条`}>
          <HBars rows={view.vulnTop} />
        </Section>
      </div>

      <div className="vx-ov-grid">
        <Section span={6} icon="target" title="任务健康度" caption={`${view.tasks.length} 个任务`}>
          <div className="vx-ov-health">
            <Ring value={view.completionRate} label="完成率" caption={`${view.counts.done} / ${view.tasks.length}`} />
            <Ring value={view.goalRate} label="目标达成" caption={`${fmtInt(view.tasks.reduce((sum, task) => sum + Number(task.goals_met ?? 0), 0))} 个目标`} />
            <div className="vx-ov-health-side">
              {Object.entries(TASK_STATUS).map(([key, meta]) => (
                <div className="vx-ov-status-row" key={key}>
                  <span className="vx-ov-dot" style={{ background: meta.tone }} />
                  <span>{meta.label}</span>
                  <b>{view.counts[key as keyof typeof view.counts]}</b>
                </div>
              ))}
              <div className="vx-ov-status-row">
                <span className="vx-ov-dot" style={{ background: 'var(--vx-text-faint)' }} />
                <span>在途意图</span>
                <b>{fmtInt(view.tasks.reduce((sum, task) => sum + Number(task.in_flight ?? 0), 0))}</b>
              </div>
            </div>
          </div>
        </Section>

        <Section span={6} icon="flame" title="活跃热力图" caption="近 90 天 Token">
          {loading ? <div className="vx-ov-skeleton" /> : <Heatmap days={view.heat} />}
        </Section>
      </div>

      <div className="vx-ov-grid">
        <Section span={6} icon="activity" title="活动流" caption={`${view.activity.length} 条事件`}>
          {view.activity.length === 0 ? <Empty label="暂无活动记录" /> : (
            <ul className="vx-ov-feed">
              {view.activity.slice(0, 7).map((row, index) => (
                <li key={String(row.seq ?? `activity-${index}`)}>
                  <WorkerChip worker={String(row.worker ?? '')} />
                  <span className="vx-ov-feed-main">
                    <b>{kindLabel(row)}</b>
                    <em>{row.summary ?? ''}</em>
                  </span>
                  <span className="vx-ov-feed-ts">{fmtRel(row.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section span={6} icon="bug" title="最新发现" caption={`共 ${fmtInt(view.sev.total)} 条`}>
          {view.findings.length === 0 ? <Empty label="暂无发现" /> : (
            <ul className="vx-ov-feed">
              {view.findings.slice(0, 7).map((row, index) => {
                const sev = SEVERITY_META.find((meta) => meta.key === row.severity) ?? SEVERITY_META[3]
                return (
                  <li key={row.finding_id ?? row.id ?? `finding-${index}`}>
                    <span className="vx-ov-sev" style={{ color: sev?.tone ?? 'var(--vx-text-dim)' }}>
                      <i className="vx-ov-dot" style={{ background: sev?.tone ?? 'var(--vx-text-faint)' }} />
                      {sev?.label ?? row.severity ?? '—'}
                    </span>
                    <span className="vx-ov-feed-main">
                      <b>{row.vulnclass ?? '未分类'}</b>
                      <em>{row.summary ?? row.task_description ?? ''}</em>
                    </span>
                    <span className="vx-ov-feed-ts">{fmtRel(row.ts)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>
      </div>

      <Section span={12} icon="clock" title="任务" caption={`${view.tasks.length} 个任务 · 按最近活动排序`}>
        <div className="vx-ov-table-wrap">
          <table className="vx-ov-table">
            <thead>
              <tr>
                {['任务', '状态', '引擎', '目标进度', '在途', '最近活动'].map((title) => <th key={title}>{title}</th>)}
              </tr>
            </thead>
            <tbody>
              {view.recentTasks.length === 0 ? (
                <tr><td colSpan={6}><Empty label="暂无任务" /></td></tr>
              ) : view.recentTasks.map((task, index) => {
                const total = Number(task.goals_total ?? 0)
                const met = Number(task.goals_met ?? 0)
                const pct = total > 0 ? (met / total) * 100 : null
                return (
                  <tr key={String(task.id ?? `task-${index}`)}>
                    <td className="vx-ov-td-task">
                      <b>{task.description ?? task.name ?? '未命名任务'}</b>
                      <em>{task.id ?? ''}</em>
                    </td>
                    <td><StatusPill status={String(task.status ?? '')} /></td>
                    <td><span className="vx-ov-engine">{task.engine_mode ?? 'idle'}</span></td>
                    <td>
                      {pct === null ? <span className="vx-ov-muted">—</span> : (
                        <span className="vx-ov-progress">
                          <i><em style={{ width: `${pct}%` }} /></i>
                          <span>{met}/{total}</span>
                        </span>
                      )}
                    </td>
                    <td>{(task.in_flight ?? 0) > 0 ? <b>{task.in_flight}</b> : <span className="vx-ov-muted">—</span>}</td>
                    <td className="vx-ov-muted">{fmtRel(task.last_activity_unix ?? task.created_unix)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="vx-ov-grid">
        <Section span={4} icon="network" title="资产构成" caption={`共 ${fmtInt(view.assets.total)} 节点`}>
          <HBars rows={view.assets.rows} />
        </Section>

        <Section span={4} icon="activity" title="流量健康度" caption={`样本 ${fmtInt(data.traffic.length)} / 共 ${fmtInt(view.trafficTotal)} 次`}>
          {data.traffic.length === 0 ? <Empty label="暂无流量数据" /> : (
            <div className="vx-ov-traffic">
              <Donut
                segments={view.codes}
                size={104}
                thickness={11}
                center={fmtPct(100 - view.errorRate, 0)}
                caption="成功率"
              />
              <div className="vx-ov-legend-rows">
                {view.codes.map((code) => (
                  <div className="vx-ov-legend-row" key={code.label}>
                    <i className="vx-ov-dot" style={{ background: code.tone }} />
                    <span>{code.label}</span>
                    <b>{fmtInt(code.value)}</b>
                    <em>{data.traffic.length > 0 ? fmtPct((code.value / data.traffic.length) * 100, 0) : '—'}</em>
                  </div>
                ))}
                {view.methods.map((method) => (
                  <div className="vx-ov-legend-row" key={`m-${method.label}`}>
                    <i className="vx-ov-dot" style={{ background: method.tone ?? 'var(--vx-chart-1)' }} />
                    <span>{method.label}</span>
                    <b>{fmtInt(method.value)}</b>
                    <em>{data.traffic.length > 0 ? fmtPct((method.value / data.traffic.length) * 100, 0) : '—'}</em>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section span={4} icon="shield" title="系统状态" caption={view.capture ? '有会话在抓包' : '无会话抓包'}>
          <ul className="vx-ov-sys">
            <li>
              <span>会话抓包</span>
              <b data-on={view.capture ? '1' : '0'}>
                {view.capture ? `${data.captureSessions} 个会话` : '未发起'}
              </b>
            </li>
            <li><span>MCP 服务</span><b>{data.sys.mcpOn}/{data.sys.mcp}</b></li>
            <li><span>工具</span><b>{data.sys.toolsOn}/{data.sys.tools}</b></li>
            <li><span>Agent</span><b>{data.sys.agentsOn}/{data.sys.agents}</b></li>
            <li><span>资产节点</span><b>{fmtInt(view.assets.total)}</b></li>
            <li><span>Top 主机</span><b className="vx-ov-ellipsis">{view.hosts[0]?.label ?? '—'}</b></li>
          </ul>
        </Section>
      </div>
    </div>
  )
}
