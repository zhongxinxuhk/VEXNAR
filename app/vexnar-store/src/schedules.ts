// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Scheduler } from './scheduler.js'
import type { Store } from './types.js'
import type { storeOperations } from './operations.js'

type Ops = ReturnType<typeof storeOperations>

function nextFire(frequency: string, timeOfDay: string, from = new Date()) {
  const [hour, minute] = String(timeOfDay || '09:00').split(':').map(Number)
  const next = new Date(from)
  next.setSeconds(0, 0)
  next.setHours(Number.isFinite(hour) ? hour : 9, Number.isFinite(minute) ? minute : 0, 0, 0)
  const stepDays = frequency === 'weekly' ? 7 : frequency === 'monthly' ? 30 : 1
  if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + stepDays)
  return next.toISOString()
}

/** Poll due schedules and hand each to the handler exactly once per fire. */
export function startSchedules(store: Store, scheduler: Scheduler, ops: Ops, handler: (schedule: any) => Promise<void>, intervalMs = 30_000) {
  const firing = new Set<string>()
  const stop = scheduler.every(intervalMs, async () => {
    const now = Date.now()
    for (const schedule of await store.schedules.list()) {
      if (schedule.enabled === false || firing.has(String(schedule.id))) continue
      const due = schedule.next_fire_at ? Date.parse(schedule.next_fire_at) : NaN
      if (!Number.isFinite(due) || due > now) continue
      firing.add(String(schedule.id))
      try {
        await handler(schedule)
        await ops.markScheduleFired(String(schedule.id), nextFire(String(schedule.frequency), String(schedule.time_of_day)))
      } finally {
        firing.delete(String(schedule.id))
      }
    }
  }, true)
  return stop
}
