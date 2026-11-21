// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { storeOperations } from './src/operations.ts'
import { createScheduler } from './src/scheduler.ts'
import { startTriggers } from './src/triggers.ts'

const root = await mkdtemp(join(tmpdir(), 'vexnar-triggers-'))
const ops = storeOperations(root)
const scheduler = createScheduler({ concurrency: 4 })
const store = { triggers: { list: async (agentKey) => {
  const rows = []
  const { readdir, readFile } = await import('node:fs/promises')
  for (const name of await readdir(join(root, 'agent_triggers')).catch(() => [])) {
    if (name.endsWith('.json')) rows.push(JSON.parse(await readFile(join(root, 'agent_triggers', name), 'utf8')).record)
  }
  return rows.filter((row) => row.agent_key === agentKey)
} } }

const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })
const fired = []
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

let failed = false
for (const item of results) { if (!item.ok) failed = true; console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`) }
process.exit(failed ? 1 : 0)
