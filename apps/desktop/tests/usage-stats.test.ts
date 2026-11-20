// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import {
  dayOrdinal,
  tokenHeatmap,
  formatDayCount,
  formatDuration,
  formatTokenCount,
  summarizeUsage
} from '../src/renderer/src/lib/usage-stats'
import type { NewApiUsageRecord } from '../src/shared/contracts'

const DAY = 86_400_000

function record(at: number, prompt: number, completion: number): NewApiUsageRecord {
  return { at, model: 'gpt-5-codex', promptTokens: prompt, completionTokens: completion, quota: 1 }
}

describe('summarizeUsage', () => {
  const now = new Date(2026, 10, 20, 12, 0, 0).getTime()

  it('聚合中转平台日志：总量、单日峰值、连续天数', () => {
    const records = [
      record(now - 2 * DAY, 1000, 500),
      record(now - 1 * DAY, 2000, 1000),
      record(now - 1 * DAY + 3600_000, 500, 500),
      record(now, 300, 200)
    ]
    const summary = summarizeUsage({ records, supported: true, sessions: [], now })
    expect(summary.source).toBe('relay')
    expect(summary.totalTokens).toBe(6000)
    expect(summary.peakDayTokens).toBe(4000)
    expect(summary.requests).toBe(4)
    expect(summary.longestStreakDays).toBe(3)
    expect(summary.currentStreakDays).toBe(3)
    expect(summary.activeDays).toBe(3)
  })

  it('连续天数在断档两天后归零，但最长记录保留', () => {
    const records = [
      record(now - 10 * DAY, 100, 0),
      record(now - 9 * DAY, 100, 0),
      record(now - 8 * DAY, 100, 0),
      record(now - 7 * DAY, 100, 0),
      record(now - 5 * DAY, 100, 0)
    ]
    const summary = summarizeUsage({ records, supported: true, sessions: [], now })
    expect(summary.longestStreakDays).toBe(4)
    expect(summary.currentStreakDays).toBe(0)
  })

  it('平台不支持日志时降级为本机会话，Token 指标为空', () => {
    const summary = summarizeUsage({
      records: [],
      supported: false,
      sessions: [
        { id: 'a', title: '任务 A', createdAt: now - 2 * 3600_000, updatedAt: now - 3600_000 },
        { id: 'b', title: '任务 B', createdAt: now - 5 * DAY, updatedAt: now - 4 * DAY }
      ],
      now
    })
    expect(summary.source).toBe('local')
    expect(summary.totalTokens).toBeNull()
    expect(summary.peakDayTokens).toBeNull()
    expect(summary.requests).toBeNull()
    expect(summary.longestTaskMs).toBe(DAY)
    expect(summary.longestTaskTitle).toBe('任务 B')
    expect(summary.activeDays).toBe(2)
  })

  it('会话时长为空或负值时不计入最长任务', () => {
    const summary = summarizeUsage({
      records: [],
      supported: false,
      sessions: [
        { id: 'a', title: '空会话', createdAt: now, updatedAt: now },
        { id: 'b', title: '异常会话', createdAt: now, updatedAt: now - 1000 }
      ],
      now
    })
    expect(summary.longestTaskMs).toBeNull()
    expect(summary.longestTaskTitle).toBe('')
  })

  it('日志被截断时请求次数不冒充总量', () => {
    const summary = summarizeUsage({
      records: [record(now, 10, 10)],
      supported: true,
      truncated: true,
      sessions: [],
      now
    })
    expect(summary.requests).toBeNull()
    expect(summary.totalTokens).toBe(20)
  })
})

describe('formatting', () => {
  it('token 使用中文亿/万口径', () => {
    expect(formatTokenCount(3_130_000_000)).toBe('31.3亿')
    expect(formatTokenCount(220_000_000)).toBe('2.2亿')
    expect(formatTokenCount(124_000)).toBe('12.4万')
    expect(formatTokenCount(38_760_000)).toBe('3876万')
    expect(formatTokenCount(9_800)).toBe('9,800')
    expect(formatTokenCount(null)).toBe('—')
  })

  it('时长与天数格式化', () => {
    expect(formatDuration((2 * 60 + 21) * 60_000)).toBe('2 小时 21 分')
    expect(formatDuration(45 * 60_000)).toBe('45 分')
    expect(formatDuration(12_000)).toBe('12 秒')
    expect(formatDuration(null)).toBe('—')
    expect(formatDayCount(17)).toBe('17 天')
    expect(formatDayCount(0)).toBe('—')
  })

  it('按本地时区切日', () => {
    expect(dayOrdinal(new Date(2026, 10, 20, 0, 30).getTime())).toBe(
      dayOrdinal(new Date(2026, 10, 20, 23, 30).getTime())
    )
    expect(dayOrdinal(new Date(2026, 10, 21, 0, 1).getTime())).toBe(
      dayOrdinal(new Date(2026, 10, 20, 0, 1).getTime()) + 1
    )
  })
})

describe('tokenHeatmap', () => {
  const now = new Date(2026, 10, 20, 12, 0, 0).getTime() // 周五

  it('固定 53 列 × 7 行，最后一列覆盖本周', () => {
    const heat = tokenHeatmap([], { now })
    expect(heat.columns).toHaveLength(53)
    expect(heat.columns.every((column) => column.length === 7)).toBe(true)
    const lastColumn = heat.columns[52]
    const todayOrdinal = dayOrdinal(now)
    expect(lastColumn.some((cell) => dayOrdinal(cell.at) === todayOrdinal)).toBe(true)
    // 本周之后的日期不参与统计
    expect(lastColumn.every((cell) => dayOrdinal(cell.at) <= todayOrdinal ? cell.tokens === 0 : cell.tokens === 0)).toBe(true)
  })

  it('按峰值分四档强度', () => {
    const records = [
      { at: now, model: 'm', promptTokens: 1000, completionTokens: 0, quota: 0 },
      { at: now - 86_400_000, model: 'm', promptTokens: 750, completionTokens: 0, quota: 0 },
      { at: now - 2 * 86_400_000, model: 'm', promptTokens: 500, completionTokens: 0, quota: 0 },
      { at: now - 3 * 86_400_000, model: 'm', promptTokens: 250, completionTokens: 0, quota: 0 },
      { at: now - 4 * 86_400_000, model: 'm', promptTokens: 100, completionTokens: 0, quota: 0 }
    ]
    const heat = tokenHeatmap(records, { now })
    const levels = new Map<number, number>()
    for (const column of heat.columns) {
      for (const cell of column) levels.set(dayOrdinal(cell.at), cell.level)
    }
    const today = dayOrdinal(now)
    expect(levels.get(today)).toBe(4)
    expect(levels.get(today - 1)).toBe(4) // 0.75 → 4 档
    expect(levels.get(today - 2)).toBe(3)
    expect(levels.get(today - 3)).toBe(2)
    expect(levels.get(today - 4)).toBe(1)
    expect(levels.get(today - 40)).toBe(0)
    expect(heat.maxTokens).toBe(1000)
  })

  it('月份标签按月推进且不重复', () => {
    const heat = tokenHeatmap([], { now })
    expect(heat.months.length).toBeGreaterThanOrEqual(12)
    const labels = heat.months.map((month) => month.label)
    expect(new Set(labels).size).toBe(labels.length)
    expect(heat.months.every((month) => month.index >= 0 && month.index < 53)).toBe(true)
  })
})
