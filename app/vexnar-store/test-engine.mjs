// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { storeOperations } from './src/operations.ts'
import { createEngine } from './src/engine.ts'

const root = await mkdtemp(join(tmpdir(), 'vexnar-engine-'))
const ops = storeOperations(root)
const engine = createEngine({
  tasks: { get: async (id) => (await ops.writer.readRecord('tasks', id)) },
  nodes: { page: async ({ taskId, kinds = [] }) => {
    const task = await ops.writer.readRecord('tasks', taskId)
    const rows = []
    for (const name of await (await import('node:fs/promises')).readdir(join(root, 'nodes')).catch(() => [])) {
      if (name.endsWith('.json')) rows.push(JSON.parse(await (await import('node:fs/promises')).readFile(join(root, 'nodes', name), 'utf8')).record)
    }
    const items = rows.filter((row) => Number(row.exploration_id) === Number(task?.exploration_id)).filter((row) => !kinds.length || kinds.includes(row.kind))
    return { items, total: items.length, edges: [] }
  } }
}, ops)

const task = await ops.createTask({ description: 'engine test', goal: 'find web issues' })
await ops.addNode(task.id, { kind: 'fact', state: 'origin', payload: { text: 'root' } })

const replies = [
  JSON.stringify({ intents: [{ text: 'probe web', priority: 5 }] }),
  JSON.stringify({ tool: 'add_fact', args: { text: 'server is nginx' } }),
  JSON.stringify({ tool: 'add_asset', args: { type: 'root_domain', domain: 'engine.example' } }),
  JSON.stringify({ tool: 'link_assets', args: {} }),
  JSON.stringify({ tool: 'finish', args: { summary: 'done' } })
]
const complete = async () => replies.shift() ?? JSON.stringify({ tool: 'finish', args: {} })

const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })
const intents = await engine.plan(task.id, complete)
check('planner creates intent', intents.length === 1 && intents[0].state === 'open', JSON.stringify(intents.map((intent) => intent.id)))
const work = await engine.work(task.id, complete, 'work#1')
check('worker finishes intent', work?.state === 'done', JSON.stringify(work))
const fact = (await ops.writer.readRecord('nodes', String(Number(work.intent) + 1)))
check('worker fact written', fact?.kind === 'fact' && fact?.payload.text === 'server is nginx', JSON.stringify(fact?.payload))
const anchored = await ops.writer.readRecord('anchors', `${work.intent}-1`)
check('worker asset linked', anchored?.asset_id === 1, JSON.stringify(anchored))

let failed = false
for (const item of results) { if (!item.ok) failed = true; console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`) }
console.log(`root: ${root}`)
process.exit(failed ? 1 : 0)
