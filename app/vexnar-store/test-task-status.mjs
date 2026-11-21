// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 任务生命周期与统计口径的回归测试。
 *
 * 断言的是「定义」本身，不是某个界面：七个状态、折叠规则、各比率的分母。
 * Go 侧 server/task_summary_test.go 钉同一份契约；两边一起跑才算对齐。
 *
 *   pnpm --filter @vexnar/store exec tsx test-task-status.mjs
 */
import assert from 'node:assert/strict'

import { TASK_LIFECYCLE, resolveTaskStatus, summarizeTasks } from './src/task-status.ts'

const DAY = 86400
const now = Date.UTC(2026, 10, 22, 12, 0, 0) / 1000

assert.deepEqual(
  TASK_LIFECYCLE.map((entry) => entry.key),
  ['created', 'queued', 'running', 'paused', 'done', 'failed', 'timeout'],
  '生命周期键集合必须与 Go 的 TaskLifecycle 一致'
)

// 解析顺序：终态 > 排队 > 暂停 > running > created。
assert.equal(resolveTaskStatus({ status: 'done', paused: true }), 'done', '终态不能被暂停开关改写')
assert.equal(resolveTaskStatus({ status: 'timeout' }), 'timeout')
assert.equal(resolveTaskStatus({ status: 'created', queued: true }), 'queued')
assert.equal(resolveTaskStatus({ status: 'created', paused: true }), 'paused', '暂停任务不能显示成待启动')
assert.equal(resolveTaskStatus({ status: 'running' }), 'running')
assert.equal(resolveTaskStatus({ status: '' }), 'created')
assert.equal(resolveTaskStatus({ status: 'archived' }), 'created', '归档不是状态')

const row = (status, createdAgo, explorationID) => ({
  id: status,
  exploration_id: explorationID,
  status,
  created_unix: now - createdAgo * DAY
})

const rows = [
  row('created', 0, 101),
  row('queued', 1, 102),
  row('running', 2, 103),
  row('paused', 3, 104),
  row('done', 40, 105),
  row('done', 41, 106),
  row('timeout', 42, 107),
  row('failed', 45, 108)
]
const taskMetrics = new Map([
  [101, { goals_total: 3, goals_met: 1 }],
  [103, { in_flight: 2 }],
  [104, { in_flight: 1 }],
  [105, { goals_total: 5, goals_met: 5, findings: { critical: 2, high: 3, medium: 1, low: 4 }, input_tokens: 100, output_tokens: 20 }]
])

const summary = summarizeTasks(rows, taskMetrics, { days: 30, now: now * 1000 })

assert.equal(summary.total, 8)
assert.deepEqual(summary.by_status, { created: 1, queued: 1, running: 1, paused: 1, done: 2, failed: 1, timeout: 1 })
assert.equal(summary.active, 2, 'active = queued + running')
assert.equal(summary.paused, 1)
assert.equal(summary.terminal, 4, 'terminal = done + failed + timeout')
assert.equal(summary.completion_rate, 25, '完成率分母是全量任务')
assert.equal(summary.goals_total, 8)
assert.equal(summary.goals_met, 6)
assert.equal(summary.goal_rate, 75)
assert.equal(summary.in_flight, 3)
assert.deepEqual(summary.findings, { total: 10, critical: 2, high: 3, medium: 1, low: 4 })
assert.deepEqual(summary.tokens, { input_tokens: 100, output_tokens: 20, cache_read_tokens: 0, cache_write_tokens: 0, total: 120 })
assert.equal(summary.created_window, 4, '窗口内新建 = 0..3 天前')
assert.equal(summary.created_prev, 4, '上一窗口新建 = 4 个 40+ 天前的任务')
assert.equal(summary.throughput.length, 30)
assert.deepEqual(summary.throughput.slice(26), [1, 1, 1, 1], '0/1/2/3 天前各新建 1 个')
assert.equal(summary.throughput[29], 1, '最后一天是今天')
assert.equal(summary.throughput.reduce((sum, value) => sum + value, 0), summary.created_window)

// 未知状态折叠进 created，各档之和恒等于 total：卡片数字永远加得回来。
const folded = summarizeTasks([{ status: 'mystery' }, { status: '' }], new Map(), { days: 7, now: now * 1000 })
assert.equal(folded.by_status.created, 2)
assert.equal(Object.values(folded.by_status).reduce((sum, value) => sum + value, 0), folded.total)

// 空清单：比率为 0 而不是 NaN，窗口长度仍然成立。
const empty = summarizeTasks([], new Map(), { days: 90, now: now * 1000 })
assert.equal(empty.total, 0)
assert.equal(empty.completion_rate, 0)
assert.equal(empty.goal_rate, 0)
assert.equal(empty.throughput.length, 90)
assert.equal(empty.lifecycle.length, 7, 'summary 必须随数据下发生命周期定义')

console.log('task-status: ok')
