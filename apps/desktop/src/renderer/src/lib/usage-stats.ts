// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { NewApiUsageRecord } from '@shared/contracts'

export type SessionLike = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export type UsageSummary = {
  /** relay：统计口径来自中转平台消费日志；local：只用了本机会话数据 */
  source: 'relay' | 'local'
  totalTokens: number | null
  peakDayTokens: number | null
  peakDay: number | null
  requests: number | null
  truncated: boolean
  longestTaskMs: number | null
  longestTaskTitle: string
  longestStreakDays: number
  currentStreakDays: number
  activeDays: number
  lastActiveAt: number | null
}

const DAY_MS = 86_400_000

/** 本地时区的“第几天”，避免用 UTC 切日导致跨时区统计错位。 */
export function dayOrdinal(timestamp: number): number {
  const date = new Date(timestamp)
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS
}

function streaks(days: Set<number>, today: number): { longest: number; current: number } {
  if (days.size === 0) return { longest: 0, current: 0 }
  const sorted = Array.from(days).sort((left, right) => left - right)
  let longest = 1
  let run = 1
  for (let index = 1; index < sorted.length; index += 1) {
    run = sorted[index] === sorted[index - 1] + 1 ? run + 1 : 1
    longest = Math.max(longest, run)
  }
  const last = sorted[sorted.length - 1]
  // 今天或昨天还在活跃，连续天数才算延续；断档两天以上归零。
  const current = last >= today - 1 ? countTail(sorted) : 0
  return { longest, current }
}

function countTail(sorted: number[]): number {
  let run = 1
  for (let index = sorted.length - 1; index > 0; index -= 1) {
    if (sorted[index] !== sorted[index - 1] + 1) break
    run += 1
  }
  return run
}

function longestSession(sessions: SessionLike[]): {
  ms: number | null
  title: string
} {
  let ms: number | null = null
  let title = ''
  for (const session of sessions) {
    // 会话的首条消息到最近一条消息之间的跨度近似一次任务的耗时。
    const span = session.updatedAt - session.createdAt
    if (!Number.isFinite(span) || span <= 0) continue
    if (ms === null || span > ms) {
      ms = span
      title = session.title
    }
  }
  return { ms, title }
}

export function summarizeUsage({
  records,
  supported,
  sessions,
  truncated = false,
  now = Date.now()
}: {
  records: NewApiUsageRecord[]
  supported: boolean
  sessions: SessionLike[]
  truncated?: boolean
  now?: number
}): UsageSummary {
  const today = dayOrdinal(now)
  const relayActive = supported && records.length > 0
  const days = new Set<number>()
  let totalTokens = 0
  let peakDayTokens: number | null = null
  let peakDay: number | null = null
  const perDay = new Map<number, number>()
  let lastActiveAt: number | null = null

  if (relayActive) {
    for (const record of records) {
      const tokens = record.promptTokens + record.completionTokens
      totalTokens += tokens
      const day = dayOrdinal(record.at)
      perDay.set(day, (perDay.get(day) ?? 0) + tokens)
      days.add(day)
      if (lastActiveAt === null || record.at > lastActiveAt) lastActiveAt = record.at
    }
    for (const [day, tokens] of perDay) {
      if (peakDayTokens === null || tokens > peakDayTokens) {
        peakDayTokens = tokens
        peakDay = day * DAY_MS
      }
    }
  } else {
    // 平台没有日志接口时，退化为本机会话活跃天数，指标仍然真实可解释。
    for (const session of sessions) {
      const at = session.updatedAt || session.createdAt
      if (!Number.isFinite(at) || at <= 0) continue
      days.add(dayOrdinal(at))
      if (lastActiveAt === null || at > lastActiveAt) lastActiveAt = at
    }
  }

  const { longest, current } = streaks(days, today)
  const task = longestSession(sessions)

  return {
    source: relayActive ? 'relay' : 'local',
    totalTokens: relayActive ? totalTokens : null,
    peakDayTokens,
    peakDay,
    requests: relayActive && !truncated ? records.length : null,
    truncated,
    longestTaskMs: task.ms,
    longestTaskTitle: task.title,
    longestStreakDays: longest,
    currentStreakDays: current,
    activeDays: days.size,
    lastActiveAt
  }
}

export type ActivityBucket = { at: number; tokens: number }

/**
 * Token 活动序列：按天 / 按周 / 累计总量。
 * 全部由本地聚合，没有日志时返回空数组。
 */
export function tokenActivity(
  records: NewApiUsageRecord[],
  mode: 'day' | 'week' | 'total',
  now = Date.now(),
  points = 14
): ActivityBucket[] {
  if (records.length === 0) return []
  const perDay = new Map<number, number>()
  for (const record of records) {
    const day = dayOrdinal(record.at)
    perDay.set(day, (perDay.get(day) ?? 0) + record.promptTokens + record.completionTokens)
  }
  const today = dayOrdinal(now)
  const span = mode === 'week' ? 7 : 1
  const buckets: ActivityBucket[] = []
  for (let index = points - 1; index >= 0; index -= 1) {
    const end = today - index * span
    let tokens = 0
    for (let offset = 0; offset < span; offset += 1) {
      tokens += perDay.get(end - offset) ?? 0
    }
    buckets.push({ at: end * DAY_MS, tokens })
  }
  if (mode !== 'total') return buckets
  // 累计总量：把窗口之前的历史也算进基线，再逐日累加。
  let running = 0
  for (const [day, tokens] of perDay) {
    if (day < today - (points - 1)) running += tokens
  }
  return buckets.map((bucket) => {
    running += bucket.tokens
    return { at: bucket.at, tokens: running }
  })
}

/** 中文口径的 token 计数：亿 / 万 / 原值。 */
export function formatTokenCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const trim = (amount: number, digits: number): string => {
    const text = amount.toFixed(digits)
    return text.endsWith('.0') ? text.slice(0, -2) : text
  }
  if (value >= 100_000_000) return `${trim(value / 100_000_000, 1)}亿`
  if (value >= 10_000) {
    const wan = value / 10_000
    return `${wan >= 100 ? trim(wan, 0) : trim(wan, 1)}万`
  }
  return value.toLocaleString()
}

/** 2 小时 21 分 / 45 分 / 12 秒 */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return '—'
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) return minutes > 0 ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`
  if (minutes > 0) return `${minutes} 分`
  return `${Math.max(1, totalSeconds)} 秒`
}

export function formatDayCount(value: number): string {
  return value > 0 ? `${value} 天` : '—'
}

export function formatRelativeTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '—'
  const diff = Date.now() - timestamp
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < DAY_MS) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < DAY_MS * 30) return `${Math.floor(diff / DAY_MS)} 天前`
  return new Date(timestamp).toLocaleDateString()
}

export type HeatCell = {
  at: number
  tokens: number
  level: 0 | 1 | 2 | 3 | 4
}

export type Heatmap = {
  /** 每列 7 格（周日 → 周六），最后一列是本周。 */
  columns: HeatCell[][]
  /** 月份标签：label 显示在第 index 列下方。 */
  months: Array<{ index: number; label: string }>
  maxTokens: number
}

/**
 * GitHub / ChatGPT 风格的活动热力图：按周分列、按天分行。
 * 强度用四档阈值（相对窗口内峰值），没有日志时整张图全为 0 档。
 */
export function tokenHeatmap(
  records: NewApiUsageRecord[],
  {
    weeks = 53,
    now = Date.now(),
    mode = 'day'
  }: { weeks?: number; now?: number; mode?: 'day' | 'week' | 'total' } = {}
): Heatmap {
  const perDay = new Map<number, number>()
  for (const record of records) {
    const day = dayOrdinal(record.at)
    perDay.set(day, (perDay.get(day) ?? 0) + record.promptTokens + record.completionTokens)
  }
  const today = now
  const todayDate = new Date(today)
  const todayOrdinal = dayOrdinal(today)
  // 让最后一列覆盖本周，列首是周日。
  const lastColumnStart = todayOrdinal - todayDate.getDay()
  const firstColumnStart = lastColumnStart - (weeks - 1) * 7

  // 三种口径：每天（当日值）/ 每周（整周合计铺满该周 7 格）/ 累计总量（截至当日的累计）。
  const valueAt = (ordinal: number): number => {
    if (ordinal > todayOrdinal) return 0
    if (mode === 'day') return perDay.get(ordinal) ?? 0
    if (mode === 'week') {
      const weekStart = ordinal - new Date(ordinal * DAY_MS).getDay()
      let sum = 0
      for (let offset = 0; offset < 7; offset += 1) {
        const day = weekStart + offset
        if (day <= todayOrdinal) sum += perDay.get(day) ?? 0
      }
      return sum
    }
    let sum = 0
    for (const [day, tokens] of perDay) {
      if (day <= ordinal) sum += tokens
    }
    return sum
  }

  const values = new Map<number, number>()
  let maxTokens = 0
  for (let column = 0; column < weeks; column += 1) {
    for (let row = 0; row < 7; row += 1) {
      const ordinal = firstColumnStart + column * 7 + row
      const value = valueAt(ordinal)
      values.set(ordinal, value)
      maxTokens = Math.max(maxTokens, value)
    }
  }

  const level = (tokens: number): HeatCell['level'] => {
    if (tokens <= 0) return 0
    if (maxTokens <= 0) return 0
    const ratio = tokens / maxTokens
    if (ratio >= 0.75) return 4
    if (ratio >= 0.5) return 3
    if (ratio >= 0.25) return 2
    return 1
  }

  const columns: HeatCell[][] = []
  const months: Array<{ index: number; label: string }> = []
  for (let column = 0; column < weeks; column += 1) {
    const cells: HeatCell[] = []
    for (let row = 0; row < 7; row += 1) {
      const ordinal = firstColumnStart + column * 7 + row
      const at = ordinal * DAY_MS
      const tokens = values.get(ordinal) ?? 0
      cells.push({ at, tokens, level: level(tokens) })
      const date = new Date(at)
      if (ordinal <= todayOrdinal && date.getDate() <= 7) {
        if (!months.some((item) => item.label === `${date.getMonth() + 1}月`)) {
          months.push({ index: column, label: `${date.getMonth() + 1}月` })
        }
      }
    }
    columns.push(cells)
  }
  return { columns, months, maxTokens }
}
