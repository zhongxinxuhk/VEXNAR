// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Store } from './src/types.ts'
import { storeOperations } from './src/operations.ts'
import { createScheduler } from './src/scheduler.ts'
import { spawnTriggerTask, startTriggers } from './src/triggers.ts'

type CheckResult = { name: string; ok: boolean; detail: string }

const root = await mkdtemp(join(tmpdir(), 'vexnar-triggers-'))
const ops = storeOperations(root)
const scheduler = createScheduler({ concurrency: 4 })
/** Only triggers is exercised here; the rest of Store is never called. */
const store = { triggers: { list: async (agentKey: string) => {
  const rows: Array<Record<string, unknown>> = []
  rows.push(...await ops.writer.list('agent_triggers'))
  return rows.filter((row) => row.agent_key === agentKey)
} } } as unknown as Store

const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail })
const fired: string[] = []
await ops.createTrigger('goals', { interval_sec: 0.05, interval_message: 'tick' })
await ops.createTrigger('goals', { on_finding: true, finding_message: 'finding!', tool_names: [] })
const stop = await startTriggers(store, scheduler, ops, 'goals', (fire) => { fired.push(`${fire.event}:${fire.message}`) })

await scheduler.emit('finding_created', { id: '9' })
await new Promise((resolve) => setTimeout(resolve, 130))
stop()
check('event trigger fires', fired.some((item) => item === 'finding_created:finding!'), JSON.stringify(fired))
check('interval trigger fires', fired.filter((item) => item === 'interval:tick').length >= 1, JSON.stringify(fired))
const rows = await store.triggers.list('goals')
check('last_fire persisted', rows.every((row) => row.last_fire), JSON.stringify(rows.map((row) => row.last_fire)))
scheduler.stop()

const spawned = await spawnTriggerTask(ops, 'goals', { trigger: { id: 1 }, event: 'finding_created', message: 'check finding' })
const spawnedRecord = await ops.writer.readRecord('tasks', String(spawned.id))
check('trigger spawns task', spawnedRecord?.goal === 'check finding' && spawnedRecord?.name === 'trigger:finding_created', JSON.stringify({ id: spawned.id, goal: spawnedRecord?.goal }))

let failed = false
for (const item of results) { if (!item.ok) failed = true; console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`) }
process.exit(failed ? 1 : 0)
