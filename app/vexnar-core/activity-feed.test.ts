// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// 活动流自检：任务播报板（含 planner / work#N）与主会话历史的读取口径。
//
// 两条旧缺陷在这里钉住：
//   · `GET /api/exploration/activity?task=` 曾走 `activity.history` 的默认过滤，
//     只返回 worker=mainagent 的行 —— 纯引擎跑出来的任务，播报板永远是空的。
//   · `/api/exploration/activity/history` 曾注册在 `/activity/:seq` 之后，被当成
//     seq 解析，客户端历史面板只能拿到 400 bad seq。
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'

const root = await mkdtemp(join(tmpdir(), 'vexnar-activity-feed-'))
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_STORE_ROOT = root
process.env.VEXNAR_SQLITE_PATH = join(root, 'vexnar.sqlite')

const { register: registerExploration } = await import('./src/routes/exploration.ts')
const { registerReadViews } = await import('./src/routes/read-views.ts')
const { operations } = await import('./src/context.ts')

/** 与 routes.ts 相同的挂载顺序：先探索域（静态 → `:seq`），再读视图。 */
const app = new Hono()
registerExploration(app)
registerReadViews(app)

const get = async (path: string) => {
  const response = await app.request(path)
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

const task = await operations.createTask({ name: 'activity', description: 'd', goal: 'g' })
const taskId = String(task.id)
const mainRow = await operations.appendActivity(taskId, { kind: 'text', worker: 'mainagent', summary: '主会话回复' })
const planRow = await operations.appendActivity(taskId, { kind: 'plan', worker: 'planner', summary: '规划出 2 条意图' })
const workRow = await operations.appendActivity(taskId, { kind: 'tool_result', worker: 'work#1', summary: 'nmap 完成', node_id: '7' })

type FeedBody = { items: Array<{ seq: number; worker?: string; kind?: string; node_id?: number }>; snapshot: number; has_more: boolean }
type HistoryBody = { items: Array<{ seq: number; worker?: string; node_id?: number }>; snapshot_cursor: number; earliest_cursor: number; has_more: boolean }

// ── 1. 任务播报板：planner / work#N 也要出现 ────────────────────────────────
const feed = await get(`/api/exploration/activity?task=${taskId}&limit=150`)
const feedBody = feed.body as FeedBody
assert.equal(feed.status, 200, '任务活动流应返回 200')
assert.equal(feedBody.items.length, 3, `任务活动流应包含三条（含 planner / work#1），实际 ${JSON.stringify(feedBody.items)}`)
assert.deepEqual(feedBody.items.map((item) => item.worker), ['mainagent', 'planner', 'work#1'], '活动应按写入顺序返回三种 worker')
assert.equal(feedBody.snapshot, Number(workRow.id), 'snapshot 应指向最新一条')

// ── 2. 全站活动流：不带 task 时同样包含这些行 ───────────────────────────────
const station = await get('/api/exploration/activity?limit=50')
assert.equal(station.status, 200)
assert.equal((station.body as FeedBody).items.length, 3, '全站活动流应包含同三条')

// ── 3. 分页游标：before 只返回更早的行 ─────────────────────────────────────
const older = await get(`/api/exploration/activity?task=${taskId}&before=${workRow.id}&limit=50`)
assert.equal((older.body as FeedBody).items.length, 2, 'before 游标应排除最新一条')
assert.ok(!(older.body as FeedBody).items.some((item) => item.seq === Number(workRow.id)), 'before 结果不应包含游标行')

// ── 4. 主会话历史：静态路由必须先于 /activity/:seq 命中 ─────────────────────
const history = await get(`/api/exploration/activity/history?task=${taskId}&session=main&before=0&limit=50`)
const historyBody = history.body as HistoryBody
assert.equal(history.status, 200, `history 不应被 :seq 抢走（实际 ${JSON.stringify(history.body)}）`)
assert.equal(historyBody.items.length, 1, '主会话历史只返回 mainagent 的行')
assert.equal(historyBody.items[0].worker, 'mainagent')
assert.equal(historyBody.items[0].seq, Number(mainRow.id))

const planHistory = await get(`/api/exploration/activity/history?task=${taskId}&session=plan`)
assert.deepEqual((planHistory.body as HistoryBody).items.map((item) => item.seq), [Number(planRow.id)], 'session=plan 只返回规划行')

const intentHistory = await get(`/api/exploration/activity/history?task=${taskId}&session=intent:7`)
assert.deepEqual((intentHistory.body as HistoryBody).items.map((item) => item.seq), [Number(workRow.id)], 'session=intent:7 只返回该意图的行')

const badSession = await get(`/api/exploration/activity/history?task=${taskId}&session=bogus`)
assert.equal(badSession.status, 400, '非法 session 仍是 400')

// ── 5. 单步详情路由照常工作（`:seq` 仍在）──────────────────────────────────
const detail = await get(`/api/exploration/activity/${workRow.id}?task=${taskId}`)
assert.equal(detail.status, 200, '数字 seq 仍走详情路由')
assert.equal((detail.body as { detail: string }).detail, '', '没有 detail 字段时返回空串')

console.log('activity feed: 16 checks passed')
