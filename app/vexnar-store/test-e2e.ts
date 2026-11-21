// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Store } from './src/types.ts'
import { storeOperations } from './src/operations.ts'
import { createEngine } from './src/engine.ts'
import { createScheduler } from './src/scheduler.ts'
import { startSchedules } from './src/schedules.ts'
import { createNotifier } from './src/notify.ts'

type CheckResult = { name: string; ok: boolean; detail: string }
type Delivery = { event: string; ok: boolean }

const root = await mkdtemp(join(tmpdir(), 'vexnar-e2e-'))
const ops = storeOperations(root)
const records = (table: string) => ops.writer.list(table)
/** Only tasks/nodes/assets/schedules are exercised here; the rest of Store is never called. */
const store = {
  tasks: { get: async (id: string) => ops.writer.readRecord('tasks', id) },
  nodes: { page: async ({ taskId, kinds = [] }: { taskId: string; kinds?: string[] }) => {
    const task = await ops.writer.readRecord('tasks', taskId)
    const rows = (await records('nodes')).filter((row) => Number(row.exploration_id) === Number(task?.exploration_id)).filter((row) => !kinds.length || kinds.includes(String(row.kind)))
    return { items: rows, total: rows.length, edges: [] }
  } },
  assets: { list: async ({ taskId, type, limit = 20, offset = 0 }: { taskId: string; type?: string; limit?: number; offset?: number }) => {
    let rows = (await records('assets')).filter((row) => (Array.isArray(row.task_ids) ? row.task_ids : []).map(Number).includes(Number(taskId)))
    if (type) rows = rows.filter((row) => row.type === type)
    return { rows: rows.slice(offset, offset + limit), total: rows.length }
  } },
  schedules: { list: async () => records('schedules') }
} as unknown as Store

const fakeRunner = { async run(command: string) {
  const output = command === 'nmap'
    ? 'Nmap scan report for shop.example (10.0.0.5)\nPORT STATE SERVICE VERSION\n443/tcp open https nginx'
    : command === 'httpx'
      ? JSON.stringify({ url: 'https://shop.example', status_code: 200, title: 'Shop', tech: ['nginx'], host: 'shop.example' })
      : "Parameter: id (GET)\n[INFO] GET parameter 'id' is vulnerable"
  return { command, args: [], code: 0, signal: null, stdout: output, stderr: '', truncated: false, timed_out: false, duration_ms: 1 }
}, allowed: () => [] }
const engine = createEngine(store, ops, { runner: fakeRunner })

const replies = [
  JSON.stringify({ intents: [{ text: 'scan shop', priority: 9 }] }),
  JSON.stringify({ tool: 'run_tool', args: { name: 'nmap', target: 'shop.example' } }),
  JSON.stringify({ tool: 'run_tool', args: { name: 'httpx', target: 'shop.example' } }),
  JSON.stringify({ tool: 'run_tool', args: { name: 'sqlmap', target: 'https://shop.example/?id=1' } }),
  JSON.stringify({ tool: 'finish', args: { summary: 'reported' } })
]
const complete = async () => replies.shift() ?? JSON.stringify({ tool: 'finish', args: {} })

const scheduler = createScheduler({ concurrency: 2 })
const delivered: Delivery[] = []
const notifier = createNotifier([{ id: 1, kind: 'webhook', enabled: true, config: {} }], async () => ({ ok: true }), async (channel, event, result) => { delivered.push({ event: event.kind, ok: result.ok }) })
startSchedules(store, scheduler, ops, async (schedule) => {
  const task = await ops.createTask({ name: schedule.name, description: schedule.prompt, goal: schedule.prompt })
  await engine.plan(String(task.id), complete)
  await engine.workMany(String(task.id), complete, 1)
  await notifier.dispatch({ kind: 'schedule_created', title: String(task.name), text: String(task.goal), task_id: String(task.id) })
}, 30)

const schedule = await ops.createSchedule({ name: 'nightly', prompt: 'audit shop.example', frequency: 'daily', time_of_day: '00:00' })
const current = await ops.writer.readRecord('schedules', String(schedule.id))
await ops.writer.put({ table: 'schedules', key: String(schedule.id), record: { ...current, next_fire_at: new Date(Date.now() - 60_000).toISOString() }, expectedRev: Number(current.rev ?? 0) })
await new Promise((resolve) => setTimeout(resolve, 150))
scheduler.stop()

const tasks = await records('tasks')
const assets = await records('assets')
const findings = await records('findings')
const nodes = await records('nodes')
const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail })
check('schedule created task', tasks.length === 1 && tasks[0].goal === 'audit shop.example', JSON.stringify(tasks.map((task) => task.goal)))
check('engine planned intent', nodes.some((node) => node.kind === 'intent'), JSON.stringify(nodes.map((node) => node.kind)))
check('tool assets persisted', assets.some((asset) => asset.type === 'endpoint') && assets.some((asset) => asset.type === 'service'), JSON.stringify(assets.map((asset) => asset.type)))
check('sqlmap finding persisted', findings.length === 1 && findings[0].vulnclass === 'SQL注入', JSON.stringify(findings.map((finding) => finding.vulnclass)))
check('notification delivered', delivered.length === 1 && delivered[0].ok === true, JSON.stringify(delivered))

let failed = false
for (const item of results) { if (!item.ok) failed = true; console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`) }
console.log(`root: ${root}`)
process.exit(failed ? 1 : 0)
