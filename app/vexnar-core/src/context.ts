// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { blobStore, buildReport, buildReportHtml, listReports, saveReport, createEngine, createNotifier, createRunner, createScheduler, createTaskQueue, openMeta, openStore, persistToolResult, runTool, spawnTriggerTask, startSchedules, startTriggers, storeOperations, storeRoot, toolSpecs } from '../../vexnar-store/src/index.ts'
import { gatewayComplete, modelCompletionReady } from './gateway.ts'
import { queryDSL } from './dsl.ts'
import { registerCatalogDefaults } from './catalog/register.ts'

/**
 * 底座对象注册表：只创建、不启动。
 *
 * 触发器、定时任务、store 恢复与独占锁都在 `runtime.ts` 的 `startRuntime()` 里，
 * 这样单测和对账脚本 `import` 本文件时不会拉起后台循环，也不会锁住数据库。
 */

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

// 下面这些导出只给「需要自己起后台循环」的调用方（runtime.ts）复用，别再放回顶层执行。
export { spawnTriggerTask, startSchedules, startTriggers }
export { storeRoot, gatewayComplete, modelCompletionReady, queryDSL, createNotifier, blobStore, buildReport, buildReportHtml, listReports, saveReport, persistToolResult, runTool, toolSpecs, createRunner }
