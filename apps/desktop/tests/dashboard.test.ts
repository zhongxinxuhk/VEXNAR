// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Task, TrafficExchange } from '../src/renderer/src/lib/console'
import {
  assetTypeRows,
  buildDayRange,
  dailyFromLedger,
  dailyFromLegacy,
  dayKeyFromString,
  foldLedgerTokens,
  foldLegacyTokens,
  formatRelative,
  formatTokens,
  summarizeBuckets,
  trafficStatusBuckets
} from '../src/renderer/src/lib/dashboard'

function task(overrides: Partial<Task>): Task {
  return { id: 't1', description: 'd', goal: 'g', status: 'running', ...overrides }
}

function exchange(status: number): TrafficExchange {
  return { id: String(status), ts: '2026-11-20T10:00:00+08:00', host: 'h', method: 'GET', url: 'https://h/', status, content_type: '', resp_len: 0 }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('token aggregation', () => {
  it('folds legacy task and conversation tokens into profile buckets', () => {
    const buckets = foldLegacyTokens(
      [
        task({ tokens: { input_tokens: 100, output_tokens: 20, cache_read_tokens: 60, cache_write_tokens: 0 } }),
        task({ id: 't2', llm_profile_id: 7, tokens: { input_tokens: 10, output_tokens: 1, cache_read_tokens: 0, cache_write_tokens: 5 } })
      ],
      [
        { llm_profile_id: null, created_at: '2026-11-20 10:00:00+08', input_tokens: 40, output_tokens: 2, cache_read_tokens: 30, cache_write_tokens: 0 },
        { llm_profile_id: 7, created_at: '2026-11-20 10:00:00+08', input_tokens: 5, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }
      ],
      3
    )
    expect(buckets.get(3)).toEqual({ input: 140, output: 22, cacheRead: 90, cacheWrite: 0, tasks: 1 })
    expect(buckets.get(7)).toEqual({ input: 15, output: 1, cacheRead: 0, cacheWrite: 5, tasks: 1 })
    expect(summarizeBuckets(buckets, 'all')).toEqual({ input: 155, output: 23, cacheRead: 90, cacheWrite: 5, tasks: 2 })
    expect(summarizeBuckets(buckets, 7)?.input).toBe(15)
  })

  it('maps unknown ledger profile names onto the default bucket', () => {
    const buckets = foldLedgerTokens(
      {
        by_profile: [
          { profile_name: 'renamed', calls: 2, tasks: 1, input_tokens: 10, output_tokens: 2, cache_read_tokens: 1, cache_write_tokens: 0 },
          { profile_name: 'known', calls: 1, tasks: 2, input_tokens: 4, output_tokens: 1, cache_read_tokens: 0, cache_write_tokens: 0 }
        ]
      },
      new Map([['known', 9]]),
      3
    )
    expect(buckets.get(3)).toEqual({ input: 10, output: 2, cacheRead: 1, cacheWrite: 0, tasks: 1 })
    expect(buckets.get(9)).toEqual({ input: 4, output: 1, cacheRead: 0, cacheWrite: 0, tasks: 2 })
  })

  it('summarizes an empty selection as zero', () => {
    expect(summarizeBuckets(new Map(), 'all')).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, tasks: 0 })
  })
})

describe('daily token series', () => {
  const now = new Date(2026, 10, 21, 12, 0, 0).getTime()

  it('builds a continuous local-day window including today', () => {
    const days = buildDayRange(7, now)
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-11-15')
    expect(days[days.length - 1]).toBe('2026-11-21')
    expect(dayKeyFromString('2026-11-20T22:35:19+08:00')).toBe('2026-11-20')
    expect(dayKeyFromString('')).toBe('')
  })

  it('fills every day and filters by profile tab', () => {
    const points = dailyFromLegacy(
      [
        task({ created_at: '2026-11-20T10:00:00+08:00', tokens: { input_tokens: 10, output_tokens: 1, cache_read_tokens: 4, cache_write_tokens: 0 } }),
        task({ id: 't2', llm_profile_id: 9, created_at: '2026-11-20T10:00:00+08:00', tokens: { input_tokens: 100, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 } })
      ],
      [],
      3,
      'all',
      3,
      now
    )
    expect(points).toHaveLength(3)
    expect(points[1]).toEqual({ date: '2026-11-20', input: 110, output: 1, cacheRead: 4 })
    const filtered = dailyFromLegacy(
      [task({ created_at: '2026-11-20T10:00:00+08:00', tokens: { input_tokens: 10, output_tokens: 1, cache_read_tokens: 4, cache_write_tokens: 0 } })],
      [],
      3,
      9,
      3,
      now
    )
    expect(filtered[1]).toEqual({ date: '2026-11-20', input: 0, output: 0, cacheRead: 0 })
  })

  it('reads ledger days and ignores dates outside the window', () => {
    const points = dailyFromLedger(
      {
        daily: [
          { profile_name: 'p', date: '2026-11-20', input_tokens: 5, output_tokens: 1, cache_read_tokens: 2 },
          { profile_name: 'p', date: '2026-11-01', input_tokens: 999, output_tokens: 0, cache_read_tokens: 0 }
        ]
      },
      3,
      'all',
      new Map([['p', 1]]),
      1,
      now
    )
    expect(points[1]).toEqual({ date: '2026-11-20', input: 5, output: 1, cacheRead: 2 })
    expect(points.reduce((sum, point) => sum + point.input, 0)).toBe(5)
  })
})

describe('inventory aggregates', () => {
  it('sorts asset types by count and drops empty ones', () => {
    expect(assetTypeRows({ ip: 2, root_domain: 9, app: 0 })).toEqual([
      { type: 'root_domain', count: 9 },
      { type: 'ip', count: 2 }
    ])
    expect(assetTypeRows(undefined)).toEqual([])
  })

  it('buckets traffic by status class', () => {
    expect(trafficStatusBuckets([exchange(200), exchange(204), exchange(302), exchange(500), exchange(0)])).toEqual([
      { code: 0, count: 1 },
      { code: 200, count: 2 },
      { code: 300, count: 1 },
      { code: 500, count: 1 }
    ])
  })
})

describe('formatting', () => {
  it('formats token counts like the web dashboard', () => {
    expect(formatTokens(0)).toBe('—')
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(1500)).toBe('1.5k')
    expect(formatTokens(15_500_000)).toBe('15.5M')
  })

  it('formats relative time from unix seconds', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T12:00:00+08:00'))
    const now = Math.floor(Date.now() / 1000)
    expect(formatRelative(now - 5, 'zh')).toBe('5s 前')
    expect(formatRelative(now - 90, 'zh')).toBe('1m 前')
    expect(formatRelative(now - 7200, 'en')).toBe('2h ago')
    expect(formatRelative(now - 3 * 86400, 'en')).toBe('3d ago')
    expect(formatRelative(undefined, 'zh')).toBe('—')
  })
})
