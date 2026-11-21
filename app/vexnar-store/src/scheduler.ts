// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

export type Job = () => Promise<unknown>

/**
 * Minimal scheduler for engine triggers: bounded job queue plus interval and
 * event subscriptions. Timers are unref'd so a CLI/test process can exit.
 */
export function createScheduler(options: { concurrency?: number } = {}) {
  const concurrency = Math.max(options.concurrency ?? 2, 1)
  const queue: Array<{ job: Job; resolve: (value: unknown) => void; reject: (error: unknown) => void }> = []
  const timers = new Set<NodeJS.Timeout>()
  const listeners = new Map<string, Array<(payload: unknown) => void | Promise<void>>>()
  let active = 0
  let stopped = false

  function pump() {
    while (!stopped && active < concurrency && queue.length) {
      const item = queue.shift()!
      active++
      Promise.resolve()
        .then(item.job)
        .then(item.resolve, item.reject)
        .finally(() => { active--; pump() })
    }
  }

  return {
    enqueue(job: Job) {
      if (stopped) return Promise.reject(new Error('scheduler stopped'))
      return new Promise((resolve, reject) => { queue.push({ job, resolve, reject }); pump() })
    },
    every(intervalMs: number, job: Job, immediate = false) {
      const tick = () => { void this.enqueue(job).catch(() => {}) }
      const timer = setInterval(tick, Math.max(intervalMs, 1))
      timer.unref?.()
      timers.add(timer)
      if (immediate) tick()
      return () => { clearInterval(timer); timers.delete(timer) }
    },
    on(event: string, handler: (payload: unknown) => void | Promise<void>) {
      const list = listeners.get(event) ?? []
      list.push(handler)
      listeners.set(event, list)
      return () => {
        const current = listeners.get(event) ?? []
        listeners.set(event, current.filter((item) => item !== handler))
      }
    },
    async emit(event: string, payload?: unknown) {
      const handlers = listeners.get(event) ?? []
      for (const handler of handlers) await handler(payload)
    },
    get pending() { return queue.length + active },
    stop() {
      stopped = true
      for (const timer of timers) clearInterval(timer)
      timers.clear()
      listeners.clear()
    }
  }
}

export type Scheduler = ReturnType<typeof createScheduler>
