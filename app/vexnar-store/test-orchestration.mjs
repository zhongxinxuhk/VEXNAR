// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createScheduler } from './src/scheduler.ts'
import { createNotifier } from './src/notify.ts'

const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })

const scheduler = createScheduler({ concurrency: 2 })
let running = 0
let maxRunning = 0
const jobs = Array.from({ length: 6 }, () => scheduler.enqueue(async () => {
  running++
  maxRunning = Math.max(maxRunning, running)
  await new Promise((resolve) => setTimeout(resolve, 20))
  running--
}))
await Promise.all(jobs)
check('queue respects concurrency', maxRunning === 2, `max=${maxRunning}`)

let ticks = 0
const stop = scheduler.every(20, async () => { ticks++ }, true)
await new Promise((resolve) => setTimeout(resolve, 90))
stop()
check('interval fires', ticks >= 2, `ticks=${ticks}`)

let seen = null
scheduler.on('finding', (payload) => { seen = payload })
await scheduler.emit('finding', { id: '1' })
check('event handlers', seen?.id === '1', JSON.stringify(seen))
scheduler.stop()

const channels = [
  { id: 1, kind: 'webhook', enabled: true, config: { url: 'http://x' } },
  { id: 2, kind: 'webhook', enabled: false, config: { url: 'http://x' } },
  { id: 3, kind: 'webhook', enabled: true, config: { url: 'http://x' }, filter: { events: ['other'] } }
]
const sent = []
const notifier = createNotifier(channels, async (channel, event) => { sent.push([channel.id, event.kind]); return { ok: true } })
const dispatch = await notifier.dispatch({ kind: 'finding_created', title: 't', text: 'x' })
check('notifier filters', sent.length === 1 && sent[0][0] === 1 && dispatch.length === 1, JSON.stringify(dispatch))

let failed = false
for (const item of results) { if (!item.ok) failed = true; console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`) }
process.exit(failed ? 1 : 0)
