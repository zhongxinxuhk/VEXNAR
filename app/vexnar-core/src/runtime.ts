// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createNotifier, spawnTriggerTask, startSchedules, startTriggers } from '../../vexnar-store/src/index.ts'
import { engine, gatewayComplete, meta, modelCompletionReady, operations, scheduler, store, taskQueue } from './context.ts'
import { runtimeMode, storeBackend } from './mode.ts'

export { runtimeMode, storeBackend }
export type { RuntimeMode } from './mode.ts'

/**
 * 运行时底座：进程从「导入即生效」改成显式启动。
 *
 * 以前触发器、定时任务、store 恢复与独占锁都在 `context.ts` 的模块顶层执行，
 * 于是任何 `import`（包括单测、对账脚本）都会拉起后台循环并锁库。现在这些
 * 副作用只在 `startRuntime()` 里发生一次，进程入口（`server.ts`）与 dsh 宿主
 * （`embedded.ts` 第一次请求）各自决定什么时候起。
 */

type RuntimeState = {
  started: boolean
  startedAt: number
  triggers: number
  schedules: boolean
  storeLocked: boolean
  released: boolean
}

const state: RuntimeState = {
  started: false, startedAt: 0, triggers: 0, schedules: false, storeLocked: false, released: false
}

const stops: Array<() => void> = []
let releaseStoreLock: (() => void) | null = null
let booting: Promise<void> | null = null
let signalHooks = false
async function boot() {
  // 触发器的回调与任务队列：命中触发器 → 建任务 → 有模型网关才自动规划并执行。
  for (const agent of await meta.table<any[]>('agents')) {
    try {
      const stop = await startTriggers(store, scheduler, operations, agent.key, async (fire) => {
        const task = await spawnTriggerTask(operations, agent.key, fire)
        store.invalidate?.(['tasks'])
        if (modelCompletionReady()) {
          const taskId = String(task.id)
          await taskQueue.enqueue(taskId, async () => {
            await engine.plan(taskId, gatewayComplete)
            await engine.workMany(taskId, gatewayComplete, 1)
          })
        }
        const channels = await meta.table<any[]>('notify')
        if (!channels.length) return
        await createNotifier(channels, undefined, async (channel, event, result) => {
          await operations.recordDelivery({
            channel_id: channel.id, event_kind: event.kind, title: event.title,
            status: result.ok ? 'ok' : 'failed', attempts: result.attempts, error: result.detail
          })
        }).dispatch({
          kind: `trigger:${fire.event}`,
          title: `agent ${agent.key} · ${fire.event}`,
          text: fire.message || fire.event,
          task_id: (fire.payload as any)?.task_id ? String((fire.payload as any).task_id) : undefined,
          finding_id: (fire.payload as any)?.finding_id ? String((fire.payload as any).finding_id) : undefined
        })
      })
      stops.push(stop)
      state.triggers += 1
    } catch {
      // 坏掉的触发器行不该拖垮整个 API
    }
  }

  const stopSchedules = startSchedules(store, scheduler, operations, async (schedule) => {
    const task = await operations.createTask({ name: String(schedule.name), description: String(schedule.prompt), goal: String(schedule.prompt) })
    store.invalidate?.(['tasks'])
    if (modelCompletionReady()) {
      const taskId = String(task.id)
      await taskQueue.enqueue(taskId, async () => {
        await engine.plan(taskId, gatewayComplete)
        await engine.workMany(taskId, gatewayComplete, 1)
      })
    }
  }, 30_000)
  stops.push(stopSchedules)
  state.schedules = true

  await operations.writer.recover().catch(() => {})
  releaseStoreLock = await operations.writer.lock()
  state.storeLocked = true

  state.started = true
  state.startedAt = Date.now()
}

/**
 * 启动底座（幂等）。`signals` 只给独立进程用：dsh 宿主里注册 SIGINT/SIGTERM
 * 会把宿主自己的退出流程抢走。
 */
export function startRuntime(options: { signals?: boolean } = {}): Promise<void> {
  if (options.signals && !signalHooks) {
    signalHooks = true
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => { void stopRuntime().then(() => process.exit(0)) })
    }
  }
  if (!booting) {
    booting = boot().catch((error) => {
      booting = null
      throw error
    })
  }
  return booting
}

export async function stopRuntime(): Promise<void> {
  if (state.released) return
  state.released = true
  for (const stop of stops.splice(0)) {
    try { stop() } catch { /* 停不掉的后台循环不该阻断退出 */ }
  }
  scheduler.stop()
  if (releaseStoreLock) {
    try { releaseStoreLock() } catch { /* 释放锁失败不该阻断退出 */ }
  }
  state.storeLocked = false
  state.started = false
}

/** 供 `/api/_runtime` 与启动日志用：一眼看出底座跑的是哪一套。 */
export function runtimeInfo() {
  return {
    mode: runtimeMode(),
    store: storeBackend(),
    started: state.started,
    started_at: state.startedAt,
    triggers: state.triggers,
    schedules: state.schedules,
    store_locked: state.storeLocked,
    engine: modelCompletionReady() ? 'ready' : 'idle',
    task_concurrency: Number(process.env.VEXNAR_TASK_CONCURRENCY ?? 2) || 2
  }
}
