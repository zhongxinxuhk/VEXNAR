// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createTaskQueue } from './src/queue.ts'

const queue = createTaskQueue({ concurrency: 1 })
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })

const order = []
const job = (id, ms = 20) => async () => { order.push(`start:${id}`); await new Promise((resolve) => setTimeout(resolve, ms)); order.push(`end:${id}`); return id }

queue.pause('slow')
const slow = queue.enqueue('slow', job('slow'))
const fast1 = queue.enqueue('fast1', job('fast1'))
const fast2 = queue.enqueue('fast2', job('fast2'))
await Promise.all([fast1, fast2])
check('paused task waits', order.includes('start:fast1') && !order.includes('start:slow'), JSON.stringify(order))

queue.pause('slow2')
const pending = queue.enqueue('slow2', job('slow2'))
const cancelled = queue.cancel('slow2')
let cancelError = null
await pending.catch((error) => { cancelError = error })
check('cancel queued task', cancelled.queued === 1 && cancelError?.message === 'task cancelled', JSON.stringify({ cancelled, error: cancelError?.message }))

queue.resume('slow')
await slow
check('resume runs paused task', order.includes('start:slow'), JSON.stringify(order))

let observed = false
const runningJob = queue.enqueue('live', async () => { await new Promise((resolve) => setTimeout(resolve, 50)); observed = queue.isCancelled('live') })
await new Promise((resolve) => setTimeout(resolve, 10))
const cancelRunning = queue.cancel('live')
await runningJob
check('cancel marks running task', cancelRunning.running === 1 && observed === true, JSON.stringify({ cancelRunning, observed }))

let failed = false
for (const item of results) { if (!item.ok) failed = true; console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`) }
process.exit(failed ? 1 : 0)
