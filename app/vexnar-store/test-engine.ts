// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Store } from './src/types.ts'
import { storeOperations } from './src/operations.ts'
import { createEngine } from './src/engine.ts'
import { createRunner } from './src/exec.ts'

type CheckResult = { name: string; ok: boolean; detail: string }

const root = await mkdtemp(join(tmpdir(), 'vexnar-engine-'))
const ops = storeOperations(root)

const records = (table: string) => ops.writer.list(table)

/** Node payload is unknown in the row type: narrow to the shape this test writes. */
const payloadText = (payload: unknown) => (typeof payload === 'object' && payload !== null ? (payload as { text?: unknown }).text : undefined)

/** Only tasks/nodes/assets are exercised here; the rest of Store is never called. */
const store = {
  tasks: { get: async (id: string) => ops.writer.readRecord('tasks', id) },
  nodes: {
    page: async ({ taskId, kinds = [] }: { taskId: string; kinds?: string[] }) => {
      const task = await ops.writer.readRecord('tasks', taskId)
      const rows = (await records('nodes')).filter((row) => Number(row.exploration_id) === Number(task?.exploration_id)).filter((row) => !kinds.length || kinds.includes(String(row.kind)))
      return { items: rows, total: rows.length, edges: [] }
    }
  },
  assets: {
    list: async ({ taskId, type, limit = 20, offset = 0 }: { taskId: string; type?: string; limit?: number; offset?: number }) => {
      let rows = (await records('assets')).filter((row) => (Array.isArray(row.task_ids) ? row.task_ids : []).map(Number).includes(Number(taskId)))
      if (type) rows = rows.filter((row) => row.type === type)
      return { rows: rows.slice(offset, offset + limit), total: rows.length }
    }
  }
} as unknown as Store
const engine = createEngine(store, ops, { runner: createRunner({ timeoutMs: 10000 }) })
const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail })

const task = await ops.createTask({ description: 'engine test', goal: 'find web issues' })
const taskId = String(task.id)
await ops.addNode(taskId, { kind: 'fact', state: 'origin', payload: { text: 'root' } })

const planReplies = [JSON.stringify({ intents: [{ text: 'probe web', priority: 5 }] })]
const plan = await engine.plan(taskId, async () => planReplies.shift() ?? '{}')
check('planner creates intent', plan.length === 1 && plan[0].state === 'open', JSON.stringify(plan.map((intent) => intent.id)))

const planRounds = [
  JSON.stringify({ intents: [{ text: 'PROBE WEB' }, { text: 'probe api' }] }),
  JSON.stringify({ intents: [{ text: 'probe web' }, { text: 'probe api' }] })
]
const secondPlan = await engine.plan(taskId, async () => planRounds.shift() ?? '{}', { rounds: 2 })
check('planner dedupes and rounds', secondPlan.length === 1 && secondPlan[0].payload.text === 'probe api', JSON.stringify(secondPlan.map((intent) => intent.payload.text)))

const workReplies = [
  JSON.stringify({ tool: 'add_fact', args: { text: 'server is nginx' } }),
  JSON.stringify({ tool: 'add_asset', args: { type: 'root_domain', domain: 'engine.example' } }),
  JSON.stringify({ tool: 'link_assets', args: {} }),
  JSON.stringify({ tool: 'list_assets', args: { limit: 5 } }),
  JSON.stringify({ tool: 'graph_overview', args: {} }),
  JSON.stringify({ tool: 'run_command', args: { command: 'curl', args: ['--version'] } }),
  JSON.stringify({ tool: 'finish', args: { summary: 'done' } })
]
const work = await engine.work(taskId, async () => workReplies.shift() ?? JSON.stringify({ tool: 'finish', args: {} }), 'work#1', 8)
check('worker finishes intent', work?.state === 'done', JSON.stringify(work))
const fact = (await records('nodes')).find((node) => node.kind === 'fact' && payloadText(node.payload) === 'server is nginx')
check('worker fact written', fact?.kind === 'fact' && payloadText(fact?.payload) === 'server is nginx', JSON.stringify(fact?.payload))
const anchored = await ops.writer.readRecord('anchors', `${work?.intent}-1`)
check('worker asset linked', anchored?.asset_id === 1, JSON.stringify(anchored))

await ops.addNode(taskId, { kind: 'intent', payload: { text: 'second' }, state: 'open' })
await ops.addNode(taskId, { kind: 'intent', payload: { text: 'third' }, state: 'open' })
const many = await engine.workMany(taskId, async () => JSON.stringify({ tool: 'finish', args: { summary: 'parallel' } }), 2)
check('workMany runs workers', many.filter((item) => item?.state === 'done').length >= 1, JSON.stringify(many))

const blockedIntent = await ops.addNode(taskId, { kind: 'intent', payload: { text: 'blocked' }, state: 'open' })
const blocked = await engine.work(taskId, async () => JSON.stringify({ tool: 'nope', args: {} }), 'work#9', 4, { maxAttempts: 1 })
const retried = await engine.retryBlocked(taskId, async () => JSON.stringify({ tool: 'finish', args: { summary: 'retry' } }))
const retriedResult = retried.results[0]
const reopenedNode = await ops.writer.readRecord('nodes', String(retriedResult && 'intent' in retriedResult ? retriedResult.intent : blockedIntent.id))
check('blocked retry', blocked?.state === 'blocked' && retried.reopened >= 1 && reopenedNode?.state === 'done', JSON.stringify({ blocked, retried, node: reopenedNode?.state }))

let cancelChecks = 0
const cancelIntent = await ops.addNode(taskId, { kind: 'intent', payload: { text: 'cancel me' }, state: 'open' })
const cancelledWork = await engine.work(taskId, async () => JSON.stringify({ tool: 'add_fact', args: { text: 'x' } }), 'work#c', 4, { isCancelled: () => { cancelChecks++; return cancelChecks > 1 } })
check('work observes cancellation', cancelledWork?.state === 'stopped', JSON.stringify(cancelledWork))

const longIntent = await ops.addNode(taskId, { kind: 'intent', payload: { text: 'long run' }, state: 'open' })
const yielded = await engine.work(taskId, async () => JSON.stringify({ tool: 'add_fact', args: { text: 'step' } }), 'work#long', 2)
check('long run yields to queue', yielded?.state === 'open' && yielded?.yielded === true, JSON.stringify(yielded))
const resumed = await engine.work(taskId, async () => JSON.stringify({ tool: 'finish', args: { summary: 'resumed' } }), 'work#long', 2)
check('yielded intent resumes', resumed?.state === 'done', JSON.stringify(resumed))

let failed = false
for (const item of results) { if (!item.ok) failed = true; console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`) }
console.log(`root: ${root}`)
process.exit(failed ? 1 : 0)
