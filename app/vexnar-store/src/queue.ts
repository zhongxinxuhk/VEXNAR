// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

type Entry = {
  taskId: string
  job: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
  state: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
}

/** Per-task queue with pause/resume and a global concurrency limit. */
export function createTaskQueue(options: { concurrency?: number } = {}) {
  const concurrency = Math.max(options.concurrency ?? 2, 1)
  const entries: Entry[] = []
  const paused = new Set<string>()
  const cancelled = new Set<string>()
  let active = 0

  function pump() {
    while (active < concurrency) {
      const next = entries.find((entry) => entry.state === 'queued' && !paused.has(entry.taskId))
      if (!next) return
      next.state = 'running'
      active++
      Promise.resolve()
        .then(next.job)
        .then((value) => { next.state = 'done'; next.resolve(value) }, (error) => { next.state = 'error'; next.reject(error) })
        .finally(() => { active--; pump() })
    }
  }

  return {
    enqueue(taskId: string, job: () => Promise<unknown>) {
      cancelled.delete(taskId)
      return new Promise((resolve, reject) => {
        entries.push({ taskId, job, resolve, reject, state: 'queued' })
        pump()
      })
    },
    pause(taskId: string) { paused.add(taskId) },
    resume(taskId: string) { paused.delete(taskId); pump() },
    cancel(taskId: string) {
      cancelled.add(taskId)
      let queued = 0
      let running = 0
      for (const entry of entries) {
        if (entry.taskId !== taskId) continue
        if (entry.state === 'queued') {
          entry.state = 'cancelled'
          entry.reject(new Error('task cancelled'))
          queued++
        } else if (entry.state === 'running') running++
      }
      return { queued, running }
    },
    isCancelled(taskId: string) { return cancelled.has(taskId) },
    status() {
      return entries.map((entry) => ({ taskId: entry.taskId, state: entry.state }))
    },
    get active() { return active },
    get pausedTasks() { return [...paused] }
  }
}

export type TaskQueue = ReturnType<typeof createTaskQueue>
