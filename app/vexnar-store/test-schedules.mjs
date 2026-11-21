// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { storeOperations } from './src/operations.ts'
import { createScheduler } from './src/scheduler.ts'
import { startSchedules } from './src/schedules.ts'

const root = await mkdtemp(join(tmpdir(), 'vexnar-schedules-'))
const ops = storeOperations(root)
const scheduler = createScheduler({ concurrency: 2 })
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })

const schedule = await ops.createSchedule({ name: 'due', prompt: 'run', frequency: 'daily', time_of_day: '00:00' })
const current = await ops.writer.readRecord('schedules', String(schedule.id))
await ops.writer.put({ table: 'schedules', key: String(schedule.id), record: { ...current, next_fire_at: new Date(Date.now() - 60_000).toISOString() }, expectedRev: Number(current.rev ?? 0) })

const store = { schedules: { list: async () => {
  const { readdir, readFile } = await import('node:fs/promises')
  const rows = []
  for (const name of await readdir(join(root, 'schedules')).catch(() => [])) {
    if (name.endsWith('.json')) rows.push(JSON.parse(await readFile(join(root, 'schedules', name), 'utf8')).record)
  }
  return rows
} } }

let fired = 0
const stop = startSchedules(store, scheduler, ops, async () => { fired++ }, 30)
await new Promise((resolve) => setTimeout(resolve, 120))
stop()
scheduler.stop()
const after = await ops.writer.readRecord('schedules', String(schedule.id))
check('due schedule fires once', fired === 1, `fired=${fired}`)
check('schedule reschedules', Date.parse(after.next_fire_at) > Date.now(), JSON.stringify({ next: after.next_fire_at, last: after.last_fired_at }))

let failed = false
for (const item of results) { if (!item.ok) failed = true; console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`) }
process.exit(failed ? 1 : 0)
