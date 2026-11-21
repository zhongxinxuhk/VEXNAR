// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { blobStore, buildReport, buildReportHtml, listReports, saveReport, createEngine, createNotifier, createRunner, createScheduler, createTaskQueue, openMeta, openStore, persistToolResult, runTool, spawnTriggerTask, startSchedules, startTriggers, storeOperations, storeRoot, toolSpecs } from '../../vexnar-store/src/index.ts'
import { gatewayComplete } from './gateway.ts'
import { queryDSL } from './dsl.ts'
import { registerCatalogDefaults } from './catalog/register.ts'

/** JSONB columns arrive as objects from the store and as strings from legacy rows. */
export function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export const store = await openStore()
export const meta = openMeta()

// 首次启动把默认工具目录与默认 MCP server 灌进空库：装好即用，之后不再自动补
// （用户删掉的 MCP server 不该在下一次启动时复活；显式「重新注册」走接口）。
try {
  const seeded = await registerCatalogDefaults(meta, { firstRunOnly: true })
  if (seeded.toolsAdded > 0 || seeded.serversAdded > 0) {
    console.log(`[catalog] 默认目录已注册：工具 +${seeded.toolsAdded}，MCP server +${seeded.serversAdded}`)
  }
} catch (error: any) {
  console.warn('[catalog] 默认目录注册失败：', String(error?.message ?? error))
}
export const operations = storeOperations(storeRoot())
export const engine = createEngine(store as any, operations as any, { runner: createRunner({ concurrency: 2 }) })
export const scheduler = createScheduler({ concurrency: 4 })
export const taskQueue = createTaskQueue({ concurrency: Math.max(Number(process.env.VEXNAR_TASK_CONCURRENCY ?? 2) || 2, 1) })

const triggerStops: Array<() => void> = []
for (const agent of await meta.table<any[]>('agents')) {
  try {
    const stop = await startTriggers(store, scheduler, operations, agent.key, async (fire) => {
      const task = await spawnTriggerTask(operations, agent.key, fire)
      store.invalidate?.(['tasks'])
      if (process.env.VEXNAR_GATEWAY_TOKEN) {
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
    triggerStops.push(stop)
  } catch {
    // a broken trigger row must not stop the API
  }
}
const stopSchedules = startSchedules(store, scheduler, operations, async (schedule) => {
  const task = await operations.createTask({ name: String(schedule.name), description: String(schedule.prompt), goal: String(schedule.prompt) })
  store.invalidate?.(['tasks'])
  if (process.env.VEXNAR_GATEWAY_TOKEN) {
    const taskId = String(task.id)
    await taskQueue.enqueue(taskId, async () => {
      await engine.plan(taskId, gatewayComplete)
      await engine.workMany(taskId, gatewayComplete, 1)
    })
  }
}, 30_000)
process.once('SIGTERM', () => { for (const stop of triggerStops) stop(); stopSchedules(); scheduler.stop() })
await operations.writer.recover().catch(() => {})
const releaseStoreLock = await operations.writer.lock()
process.once('SIGINT', () => { void releaseStoreLock(); process.exit(0) })
process.once('SIGTERM', () => { void releaseStoreLock(); process.exit(0) })

export { storeRoot, gatewayComplete, queryDSL, createNotifier, blobStore, buildReport, buildReportHtml, listReports, saveReport, persistToolResult, runTool, toolSpecs, createRunner }
