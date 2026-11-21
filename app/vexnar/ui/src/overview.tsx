// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 概览（Overview）—— Web 控制台 `/dashboard` 在 dsh 客户端里的复刻。
 *
 * 两处落点共用同一套数据与图形：
 *   - `conversation.hero.frame`：新会话首屏最上方的概览卡片；
 *   - `main` + `sidebar.panellist`：侧边栏「概览」整页，布局对齐 Web 仪表盘。
 *
 * 图形全部手绘 SVG：没有额外图表依赖，色板走 `--vx-chart-*` 令牌桥接 dsh
 * 的静态色阶，浅色/深色、皮肤换色都自动跟随。数值用 tabular-nums 保证列对齐。
 *
 * 数据只读：一律走 vexnar-core 的同源代理（与其它面板同一 base/token），
 * 轮询在页面隐藏时暂停，卸载后 abort，避免首屏常驻带来后台请求。
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

function coreBase(): string {
  return (storeGet('vexnar.coreUrl') || CORE_PATH).replace(/\/$/, '')
}

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const token = storeGet('vexnar.coreToken')
  const response = await fetch(coreBase() + path, {
    headers: token === '' ? {} : { 'x-vexnar-token': token },
    signal
  })
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
  activity: ActivityRow[]
  sys: SysCounts
  capture: boolean
  updated: number
}

const EMPTY_DATA: OverviewData = {
  tasks: [],
  stats: { total: 0, pending: 0, critical: 0, high: 0, medium: 0, low: 0 },
  findings: [],
  assets: {},
  daily: [],
  traffic: [],
  activity: [],
  sys: { agents: 0, agentsOn: 0, mcp: 0, mcpOn: 0, tools: 0, toolsOn: 0 },
  capture: false,
  updated: 0
}

function pick<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback
}

/** 一次概览抓取：全部接口并行，单个失败只降级那一块，不拖垮整屏。 */
async function loadOverview(signal: AbortSignal): Promise<{ data: OverviewData; error: string }> {
  const settled = await Promise.allSettled([
    getJson<{ tasks?: TaskRow[] }>('/api/tasks', signal),
    getJson<Partial<SevCounts>>('/api/exploration/findings/stats', signal),
    getJson<{ items?: FindingRow[] }>('/api/exploration/findings?page=1&limit=24', signal),
    getJson<Record<string, number>>('/api/assets/counts', signal),
    getJson<DayBucket[]>('/api/tokens/daily?days=90', signal),
    getJson<{ exchanges?: Exchange[] }>('/api/traffic?page=0&size=60', signal),
    getJson<{ items?: ActivityRow[] }>('/api/exploration/activity?limit=12', signal),
    getJson<{ traffic_capture?: boolean }>('/api/settings', signal),
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
  const traffic = pick(settled[5] as PromiseSettledResult<{ exchanges?: Exchange[] }>, {})
  const activity = pick(settled[6] as PromiseSettledResult<{ items?: ActivityRow[] }>, {})
  const settings = pick(settled[7] as PromiseSettledResult<{ traffic_capture?: boolean }>, {})
  const agents = pick(settled[8] as PromiseSettledResult<{ agents?: Array<{ enabled?: boolean }> }>, {})
  const mcp = pick(settled[9] as PromiseSettledResult<{ servers?: Array<{ enabled?: boolean }> }>, {})
  const tools = pick(settled[10] as PromiseSettledResult<{ tools?: Array<{ enabled?: boolean }> }>, {})

  const countOn = (rows: Array<{ enabled?: boolean }> | undefined): number =>
    (rows ?? []).filter((row) => row.enabled !== false).length

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
      traffic: Array.isArray(traffic.exchanges) ? traffic.exchanges : [],
      activity: Array.isArray(activity.items) ? activity.items : [],
      sys: {
        agents: agents.agents?.length ?? 0,
        agentsOn: countOn(agents.agents),
        mcp: mcp.servers?.length ?? 0,
        mcpOn: countOn(mcp.servers),
        tools: tools.tools?.length ?? 0,
        toolsOn: countOn(tools.tools)
      },
      capture: settings.traffic_capture === true,
      updated: Date.now()
    }
  }
}

/**
 * 概览数据。`intervalMs <= 0` 表示停用（未处于新会话首屏时不发请求）。
 * 轮询在标签页隐藏时跳过，回到前台立刻补一次。
 */
function useOverview(intervalMs: number): { data: OverviewData; error: string; reload: () => void } {
  const [data, setData] = useState<OverviewData>(EMPTY_DATA)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (intervalMs <= 0) return
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
   派生数据与格式化
   ══════════════════════════════════════════════════════════════════════════ */

interface TrendPoint {
  day: string
  input: number
  output: number
  cache: number
}

const pad2 = (value: number): string => (value < 10 ? `0${value}` : String(value))

/** 以 UTC 日期建立连续日轴，缺失日记 0，避免柱状图出现断档。 */
function buildTrend(daily: DayBucket[], days: number): TrendPoint[] {
  const byDay = new Map<string, TrendPoint>()
  for (const row of daily) {
    const key = String(row.day ?? '')
    if (key === '') continue
    byDay.set(key, {
      day: key,
      input: Number(row.input_tokens ?? 0),
      output: Number(row.output_tokens ?? 0),
      cache: Number(row.cache_read_tokens ?? 0)
    })
  }
  const out: TrendPoint[] = []
  const now = new Date()
  for (let index = days - 1; index >= 0; index -= 1) {
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    cursor.setUTCDate(cursor.getUTCDate() - index)
    const key = `${cursor.getUTCFullYear()}-${pad2(cursor.getUTCMonth() + 1)}-${pad2(cursor.getUTCDate())}`
    out.push(byDay.get(key) ?? { day: key, input: 0, output: 0, cache: 0 })
  }
  return out
}

function fmtNum(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 1000) return `${(value / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k`
  return String(Math.round(value))
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
  return `${Math.floor(hours / 24)}d 前`
}

function clockLabel(ms: number): string {
  if (ms === 0) return '同步中…'
  return `更新于 ${new Date(ms).toLocaleTimeString('zh-CN', { hour12: false })}`
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

/* ══════════════════════════════════════════════════════════════════════════
   图形基元（手绘 SVG）
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * 实测容器宽度（像素）。图表按真实像素绘制，文字与柱宽不随容器拉伸变形；
 * 用回调 ref 而不是 RefObject，React 19 的类型下才能直接挂到 DOM 节点上。
 */
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

function topRoundedPath(x: number, top: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height))
  const bottom = top + height
  return [
    `M${x},${bottom}`,
    `L${x},${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `L${x + width - r},${top}`,
    `Q${x + width},${top} ${x + width},${top + r}`,
    `L${x + width},${bottom}`,
    'Z'
  ].join(' ')
}

const trendSeries = [
  { key: 'input' as const, label: '输入', color: 'var(--vx-chart-1)' },
  { key: 'output' as const, label: '输出', color: 'var(--vx-chart-2)' },
  { key: 'cache' as const, label: '缓存读', color: 'var(--vx-chart-3)' }
]

/** 堆叠柱 + 渐变填充 + 十字准星浮层。宽度按容器实测像素绘制，文字不随拉伸变形。 */
function TrendChart({ points, height }: { points: TrendPoint[]; height: number }): ReactNode {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const uid = useId().replace(/:/g, '')
  const w = Math.max(width, 260)
  const pad = { top: 10, right: 6, bottom: 16, left: 32 }
  const plotW = Math.max(w - pad.left - pad.right, 20)
  const plotH = Math.max(height - pad.top - pad.bottom, 20)
  const max = niceMax(
    points.reduce((high, point) => Math.max(high, point.input + point.output + point.cache), 0)
  )
  const slot = plotW / Math.max(points.length, 1)
  const barW = Math.max(2, Math.min(18, slot * 0.58))
  const baseY = pad.top + plotH
  // 20% 一档：50M 这类最大值读成 10M/20M/30M，而不是 13M/38M。
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1]
  const labelStep = Math.max(1, Math.ceil(points.length / 6))
  const active = hover !== null ? points[hover] : undefined
  const tipLeft = hover !== null ? Math.min(Math.max(pad.left + slot * hover + slot / 2, 74), w - 74) : 0

  return (
    <div className="vx-ov-plot" ref={ref}>
      <svg width={w} height={height} role="img" aria-label="每日 Token 消耗堆叠柱状图">
        <defs>
          {trendSeries.map((series) => (
            <linearGradient key={series.key} id={`${uid}-${series.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: series.color, stopOpacity: 0.95 }} />
              <stop offset="100%" style={{ stopColor: series.color, stopOpacity: 0.42 }} />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((ratio) => {
          const y = pad.top + plotH * (1 - ratio)
          return (
            <g key={ratio}>
              <line
                x1={pad.left}
                x2={pad.left + plotW}
                y1={y}
                y2={y}
                stroke="var(--vx-chart-grid)"
                strokeDasharray={ratio === 0 ? undefined : '1 4'}
              />
              <text x={pad.left - 6} y={y + 3} textAnchor="end" className="vx-ov-axis">
                {fmtNum(max * ratio)}
              </text>
            </g>
          )
        })}
        {points.map((point, index) => {
          const stack = [
            { key: 'input', value: point.input },
            { key: 'output', value: point.output },
            { key: 'cache', value: point.cache }
          ]
          let cursor = baseY
          const topIndex = stack.reduce((top, item, itemIndex) => (item.value > 0 ? itemIndex : top), -1)
          const x = pad.left + slot * index + (slot - barW) / 2
          return (
            <g key={point.day} className="vx-ov-bar" style={{ animationDelay: `${Math.min(index * 12, 220)}ms` }}>
              {stack.map((item, itemIndex) => {
                const h = max > 0 ? (item.value / max) * plotH : 0
                if (h <= 0) return null
                cursor -= h
                return itemIndex === topIndex
                  ? (
                    <path
                      key={item.key}
                      d={topRoundedPath(x, cursor, barW, h, 3)}
                      fill={`url(#${uid}-${item.key})`}
                    />
                  )
                  : (
                    <rect
                      key={item.key}
                      x={x}
                      y={cursor}
                      width={barW}
                      height={h}
                      fill={`url(#${uid}-${item.key})`}
                    />
                  )
              })}
            </g>
          )
        })}
        {points.map((point, index) => {
          const last = index === points.length - 1
          // 末端标签右对齐：既不与前一个标签挤在一起，也不会被右边框裁掉。
          if (!last && index % labelStep !== 0) return null
          return (
            <text
              key={`label-${point.day}`}
              x={pad.left + slot * index + (last ? slot - 2 : slot / 2)}
              y={height - 4}
              textAnchor={last ? 'end' : index === 0 ? 'start' : 'middle'}
              className="vx-ov-axis"
            >
              {point.day.slice(5)}
            </text>
          )
        })}
        {hover !== null && (
          <line
            x1={pad.left + slot * hover + slot / 2}
            x2={pad.left + slot * hover + slot / 2}
            y1={pad.top}
            y2={baseY}
            stroke="var(--vx-chart-1)"
            strokeOpacity="0.45"
            strokeDasharray="3 3"
          />
        )}
        {points.map((point, index) => (
          <rect
            key={`hit-${point.day}`}
            x={pad.left + slot * index}
            y={pad.top}
            width={slot}
            height={plotH}
            fill="transparent"
            onPointerEnter={() => { setHover(index) }}
            onPointerLeave={() => { setHover((current) => (current === index ? null : current)) }}
          />
        ))}
      </svg>
      {active !== undefined && (
        <div className="vx-ov-tip" style={{ left: tipLeft, top: 2 }}>
          <div className="vx-ov-tip-day">{active.day}</div>
          {trendSeries.map((series) => (
            <div key={series.key} className="vx-ov-tip-row">
              <span>
                <i className="vx-ov-dot" style={{ background: series.color }} />
                {series.label}
              </span>
              <b>{fmtNum(active[series.key])}</b>
            </div>
          ))}
          <div className="vx-ov-tip-row vx-ov-tip-total">
            <span>合计</span>
            <b>{fmtNum(active.input + active.output + active.cache)}</b>
          </div>
        </div>
      )}
    </div>
  )
}

/** 迷你趋势线：KPI 卡片里的火花图。 */
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
    <svg
      className="vx-ov-spark"
      width="100%"
      height={height}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}-spark`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--vx-tone, var(--vx-chart-1))', stopOpacity: 0.34 }} />
          <stop offset="100%" style={{ stopColor: 'var(--vx-tone, var(--vx-chart-1))', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${uid}-spark)`} />
      <path d={line} fill="none" stroke="var(--vx-tone, var(--vx-chart-1))" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/** 资产分布：横向渐变条。 */
function AssetRows({ rows, total }: { rows: Array<[string, number]>; total: number }): ReactNode {
  if (rows.length === 0) return <div className="vx-ov-empty">暂无资产数据</div>
  const max = rows[0]?.[1] ?? 1
  return (
    <div className="vx-ov-rows">
      {rows.map(([type, count]) => (
        <div className="vx-ov-row" key={type}>
          <span className="vx-ov-row-label">{ASSET_LABELS[type] ?? type}</span>
          <span className="vx-ov-row-track">
            <i style={{ width: `${Math.max((count / Math.max(max, 1)) * 100, 3)}%` }} />
          </span>
          <span className="vx-ov-row-value">{count}</span>
        </div>
      ))}
      <div className="vx-ov-row-foot">共 {total} 个节点</div>
    </div>
  )
}

/** 流量状态码：按 1xx–5xx 分档的窄柱。 */
function StatusBars({ codes }: { codes: Array<{ code: number; count: number }> }): ReactNode {
  if (codes.length === 0) return <div className="vx-ov-empty">暂无流量数据</div>
  const max = Math.max(...codes.map((item) => item.count), 1)
  const tone = (code: number): string =>
    code < 300 ? 'var(--vx-chart-3)' : code < 400 ? 'var(--vx-chart-1)' : code < 500 ? 'var(--vx-chart-4)' : 'var(--vx-chart-5)'
  return (
    <div className="vx-ov-codes">
      {codes.map((item) => (
        <div className="vx-ov-code" key={item.code}>
          <span className="vx-ov-code-num">{item.count}</span>
          <span className="vx-ov-code-track">
            <i style={{ height: `${Math.max((item.count / max) * 100, 6)}%`, background: tone(item.code) }} />
          </span>
          <span className="vx-ov-code-label" style={{ color: tone(item.code) }}>{item.code}</span>
        </div>
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   图标与小组件
   ══════════════════════════════════════════════════════════════════════════ */

type IconName = 'gauge' | 'target' | 'bug' | 'network' | 'activity' | 'zap' | 'shield' | 'clock' | 'chevron' | 'refresh'

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
  chevron: <path d="m6 9 6 6 6-6" />,
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4h-4" />
    </>
  )
}

function Icon({ name, size = 14 }: { name: IconName; size?: number }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  )
}

type Tone = 'blue' | 'violet' | 'green' | 'amber' | 'red'

function Kpi({
  tone,
  icon,
  label,
  value,
  unit,
  detail,
  spark
}: {
  tone: Tone
  icon: IconName
  label: string
  value: string
  unit?: string
  detail: ReactNode
  spark?: number[]
}): ReactNode {
  return (
    <article className={`vx-ov-kpi vx-ov-tone-${tone}`}>
      <div className="vx-ov-kpi-top">
        <Icon name={icon} size={13} />
        <span>{label}</span>
      </div>
      <div className="vx-ov-kpi-mid">
        <span className="vx-ov-num">
          {value}
          {unit !== undefined && unit !== '' ? <em>{unit}</em> : null}
        </span>
      </div>
      <div className="vx-ov-kpi-foot">{detail}</div>
      {spark !== undefined ? <Spark values={spark} /> : null}
    </article>
  )
}

function SeverityChips({ counts }: { counts: SevCounts }): ReactNode {
  return (
    <span className="vx-ov-chips">
      {SEVERITY_META.map((meta) => (
        <span key={meta.key} className="vx-ov-chip" style={{ color: meta.tone }}>
          <i className="vx-ov-dot" style={{ background: meta.tone }} />
          {meta.label} {counts[meta.key]}
        </span>
      ))}
    </span>
  )
}

function StatusPill({ status }: { status: string }): ReactNode {
  const tone =
    status === 'running' ? 'blue' : status === 'paused' ? 'amber' : status === 'done' ? 'green' : status === 'failed' ? 'red' : 'muted'
  return <span className={`vx-ov-pill vx-ov-pill--${tone}`}>{status === '' ? '—' : status}</span>
}

function WorkerChip({ worker }: { worker: string }): ReactNode {
  const tone = worker === 'planner' ? 'violet' : worker === 'mainagent' ? 'blue' : 'green'
  return <span className={`vx-ov-worker vx-ov-tone-${tone}`}>{worker === '' ? 'agent' : worker}</span>
}

function kindLabel(row: ActivityRow): string {
  if (row.kind === 'tool_use') return row.tool !== undefined && row.tool !== '' ? row.tool : 'tool_use'
  return row.kind ?? 'activity'
}

/* ══════════════════════════════════════════════════════════════════════════
   组合：派生视图
   ══════════════════════════════════════════════════════════════════════════ */

interface View {
  tasks: TaskRow[]
  counts: { running: number; paused: number; done: number; failed: number }
  totalAssets: number
  assetRows: Array<[string, number]>
  sev: SevCounts
  trend: TrendPoint[]
  totals: { input: number; output: number; cache: number }
  hitRate: number
  codes: Array<{ code: number; count: number }>
  createdSeries: number[]
  findings: FindingRow[]
  activity: ActivityRow[]
}

function derive(data: OverviewData, days: number): View {
  const counts = { running: 0, paused: 0, done: 0, failed: 0 }
  for (const task of data.tasks) {
    const status = task.status ?? ''
    if (status === 'running') counts.running += 1
    else if (status === 'paused') counts.paused += 1
    else if (status === 'done') counts.done += 1
    else if (status === 'failed') counts.failed += 1
  }

  const assetRows = Object.entries(data.assets)
    .filter(([, value]) => Number(value) > 0)
    .map(([type, value]) => [type, Number(value)] as [string, number])
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
  const totalAssets = Object.values(data.assets).reduce((sum, value) => sum + Number(value), 0)

  const trend = buildTrend(data.daily, days)
  const totals = trend.reduce(
    (acc, point) => ({ input: acc.input + point.input, output: acc.output + point.output, cache: acc.cache + point.cache }),
    { input: 0, output: 0, cache: 0 }
  )
  const hitRate = totals.input > 0 ? (totals.cache / totals.input) * 100 : 0

  const buckets = new Map<number, number>()
  for (const exchange of data.traffic) {
    const status = Number(exchange.status ?? 0)
    if (status <= 0) continue
    const bucket = Math.floor(status / 100) * 100
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1)
  }
  const codes = [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([code, count]) => ({ code, count }))

  const createdSeries = trend.map((point) => {
    const dayStart = Date.parse(`${point.day}T00:00:00Z`) / 1000
    const dayEnd = dayStart + 86400
    return data.tasks.filter((task) => {
      const created = Number(task.created_unix ?? 0)
      return created >= dayStart && created < dayEnd
    }).length
  })

  const findings = [...data.findings]
    .sort((left, right) => (Date.parse(right.ts ?? '') || 0) - (Date.parse(left.ts ?? '') || 0))
  const activity = [...data.activity]
    .sort((left, right) => Number(right.seq ?? 0) - Number(left.seq ?? 0))

  return {
    tasks: data.tasks,
    counts,
    totalAssets,
    assetRows,
    sev: data.stats,
    trend,
    totals,
    hitRate,
    codes,
    createdSeries,
    findings,
    activity
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   新会话首屏上方的概览卡片
   ══════════════════════════════════════════════════════════════════════════ */

const RANGES = [
  { key: '7', days: 7, label: '7天' },
  { key: '30', days: 30, label: '30天' },
  { key: '90', days: 90, label: '90天' }
] as const

type RangeKey = (typeof RANGES)[number]['key']

function rangeLabel(key: RangeKey): string {
  return RANGES.find((item) => item.key === key)?.label ?? key
}

/** 概览整页：布局对齐 Web 控制台 `/dashboard`，图形换成手绘 SVG。 */
export function OverviewPanel(): ReactNode {
  const [rangeKey, setRangeKey] = useState<RangeKey>(() => {
    const raw = storeGet('vexnar.overview.range.page')
    return raw === '7' || raw === '30' || raw === '90' ? raw : '30'
  })
  const days = RANGES.find((item) => item.key === rangeKey)?.days ?? 30
  const { data, error, reload } = useOverview(9000)
  const view = useMemo(() => derive(data, days), [data, days])

  const tokenSpark = view.trend.map((point) => point.input + point.output + point.cache)
  const recentTasks = [...view.tasks]
    .sort((left, right) => Number(right.last_activity_unix ?? right.created_unix ?? 0) - Number(left.last_activity_unix ?? left.created_unix ?? 0))
    .slice(0, 6)

  return (
    <div className="vx-ov-page">
      <header className="vx-ov-page-head">
        <div>
          <h1>概览</h1>
          <p>系统全局状态 · 实时刷新</p>
        </div>
        <div className="vx-ov-page-tools">
          <div className="vx-ov-seg" role="group" aria-label="统计范围">
            {RANGES.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={rangeKey === item.key}
                onClick={() => { setRangeKey(item.key); storeSet('vexnar.overview.range.page', item.key) }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="vx-ov-updated">{clockLabel(data.updated)}</span>
          <button type="button" className="vx-ov-icon" onClick={reload} title="立即刷新" aria-label="立即刷新">
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </header>

      {error !== '' && (
        <div className="vx-ov-error">
          <span>概览数据不可用：{error}</span>
          <button type="button" onClick={reload}>重试</button>
        </div>
      )}

      <div className="vx-ov-kpis vx-ov-kpis--page">
        <Kpi
          tone="blue"
          icon="target"
          label="活跃任务"
          value={String(view.counts.running)}
          unit={`/ ${view.tasks.length}`}
          spark={view.createdSeries}
          detail={(
            <span className="vx-ov-chips">
              {view.counts.paused > 0 ? <span className="vx-ov-chip" style={{ color: 'var(--vx-chart-4)' }}>暂停 {view.counts.paused}</span> : null}
              {view.counts.done > 0 ? <span className="vx-ov-chip" style={{ color: 'var(--vx-chart-3)' }}>完成 {view.counts.done}</span> : null}
              {view.counts.failed > 0 ? <span className="vx-ov-chip" style={{ color: 'var(--vx-chart-5)' }}>失败 {view.counts.failed}</span> : null}
              {view.tasks.length === 0 ? <span className="vx-ov-chip">暂无任务</span> : null}
            </span>
          )}
        />
        <Kpi tone="red" icon="bug" label="确认发现" value={String(view.sev.total)} detail={<SeverityChips counts={view.sev} />} />
        <Kpi
          tone="violet"
          icon="network"
          label="资产节点"
          value={String(view.totalAssets)}
          detail={(
            <span className="vx-ov-chips">
              {view.assetRows.slice(0, 2).map(([type, count]) => (
                <span className="vx-ov-chip" key={type}>{ASSET_LABELS[type] ?? type} {count}</span>
              ))}
            </span>
          )}
        />
        <Kpi
          tone="green"
          icon="activity"
          label="流量交互"
          value={String(data.traffic.length)}
          detail={data.capture
            ? <span className="vx-ov-chip" style={{ color: 'var(--vx-chart-3)' }}><i className="vx-ov-dot" style={{ background: 'var(--vx-chart-3)' }} />录制中</span>
            : <span className="vx-ov-chip">捕获未开启</span>}
        />
        <Kpi
          tone="amber"
          icon="zap"
          label={`Token（${rangeLabel(rangeKey)}）`}
          value={fmtNum(view.totals.input + view.totals.output)}
          spark={tokenSpark}
          detail={(
            <span className="vx-ov-chips">
              <span className="vx-ov-chip">入 {fmtNum(view.totals.input)}</span>
              <span className="vx-ov-chip">缓存 {fmtNum(view.totals.cache)}</span>
              <span className="vx-ov-chip">出 {fmtNum(view.totals.output)}</span>
            </span>
          )}
        />
      </div>

      <section className="vx-ov-card vx-ov-card--wide">
        <div className="vx-ov-h">
          <Icon name="zap" size={13} />
          LLM Token 消耗
          <span className="vx-ov-legend">
            {trendSeries.map((series) => (
              <span key={series.key}><i className="vx-ov-dot" style={{ background: series.color }} />{series.label}</span>
            ))}
          </span>
        </div>
        <div className="vx-ov-split">
          <div className="vx-ov-metrics">
            <div className="vx-ov-metric-total">
              <span>合计（输入+输出）</span>
              <strong>{fmtNum(view.totals.input + view.totals.output)}</strong>
              <em>{view.tasks.length} 个任务 · {rangeLabel(rangeKey)}</em>
            </div>
            {[
              { label: '输入（未命中）', value: Math.max(view.totals.input - view.totals.cache, 0), tone: 'var(--vx-chart-1)' },
              { label: '缓存命中', value: view.totals.cache, tone: 'var(--vx-chart-3)' },
              { label: '输出', value: view.totals.output, tone: 'var(--vx-chart-2)' }
            ].map((item) => {
              const total = view.totals.input + view.totals.output
              const pct = total > 0 ? (item.value / total) * 100 : 0
              return (
                <div className="vx-ov-meter" key={item.label}>
                  <div className="vx-ov-meter-top">
                    <span>{item.label}</span>
                    <b style={{ color: item.tone }}>{fmtNum(item.value)}</b>
                  </div>
                  <span className="vx-ov-meter-track">
                    <i style={{ width: `${Math.max(pct, 1)}%`, background: item.tone }} />
                  </span>
                </div>
              )
            })}
            <div className="vx-ov-hitr">
              <span>缓存命中率</span>
              <b>{Math.round(view.hitRate)}%</b>
            </div>
          </div>
          <div className="vx-ov-chart-tall">
            <TrendChart points={view.trend} height={228} />
          </div>
        </div>
      </section>

      <div className="vx-ov-two">
        <section className="vx-ov-card">
          <div className="vx-ov-h">
            <Icon name="activity" size={13} />
            活动流
            <span className="vx-ov-sub">{view.activity.length} 条事件</span>
          </div>
          {view.activity.length === 0 ? <div className="vx-ov-empty">暂无活动记录</div> : (
            <ul className="vx-ov-feed">
              {view.activity.slice(0, 6).map((row, index) => (
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
        </section>

        <section className="vx-ov-card">
          <div className="vx-ov-h">
            <Icon name="bug" size={13} />
            发现
            <span className="vx-ov-sub">共 {view.sev.total} 条</span>
          </div>
          {view.findings.length === 0 ? <div className="vx-ov-empty">暂无发现</div> : (
            <ul className="vx-ov-feed">
              {view.findings.slice(0, 6).map((row, index) => {
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
        </section>
      </div>

      <section className="vx-ov-card vx-ov-card--table">
        <div className="vx-ov-h">
          <Icon name="clock" size={13} />
          任务
          <span className="vx-ov-sub">{view.tasks.length} 个任务</span>
        </div>
        <div className="vx-ov-table-wrap">
          <table className="vx-ov-table">
            <thead>
              <tr>
                {['任务', '状态', '引擎', '目标进度', '在途', '最近活动'].map((title) => <th key={title}>{title}</th>)}
              </tr>
            </thead>
            <tbody>
              {recentTasks.length === 0 ? (
                <tr><td colSpan={6} className="vx-ov-empty">暂无任务</td></tr>
              ) : recentTasks.map((task, index) => {
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
                      {pct === null
                        ? <span className="vx-ov-muted">—</span>
                        : (
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
      </section>

      <div className="vx-ov-three">
        <section className="vx-ov-card">
          <div className="vx-ov-h"><Icon name="network" size={13} />资产分布<span className="vx-ov-sub">按类型</span></div>
          <AssetRows rows={view.assetRows} total={view.totalAssets} />
        </section>
        <section className="vx-ov-card">
          <div className="vx-ov-h"><Icon name="activity" size={13} />流量状态码<span className="vx-ov-sub">近 {data.traffic.length} 次</span></div>
          <StatusBars codes={view.codes} />
        </section>
        <section className="vx-ov-card">
          <div className="vx-ov-h"><Icon name="shield" size={13} />系统状态</div>
          <ul className="vx-ov-sys">
            <li><span>流量捕获</span><b data-on={data.capture ? '1' : '0'}>{data.capture ? '开启' : '关闭'}</b></li>
            <li><span>MCP</span><b>{data.sys.mcpOn}/{data.sys.mcp}</b></li>
            <li><span>工具</span><b>{data.sys.toolsOn}/{data.sys.tools}</b></li>
            <li><span>Agent</span><b>{data.sys.agentsOn}/{data.sys.agents}</b></li>
          </ul>
        </section>
      </div>
    </div>
  )
}
