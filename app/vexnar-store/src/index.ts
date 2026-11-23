// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { pgStore } from './pg-store.js'
import type { Store } from './types.js'
import { backend, dbPath, openStore as openDefaultStore, openMeta, openStoreSync, openWriter, pgConnection, storeRoot } from './backend.js'

export type { Store } from './types.js'
export { storeRoot, dbPath, backend, openWriter, openMeta, openStoreSync, pgConnection } from './backend.js'
export { storeOperations } from './operations.js'
export { createEngine } from './engine.js'
export { createRunner } from './exec.js'
export { runTool, persistToolResult, toolSpecs } from './tools.js'
export { blobStore } from './blobs.js'
export { createScheduler } from './scheduler.js'
export { createNotifier } from './notify.js'
export { startTriggers, spawnTriggerTask } from './triggers.js'
export { startSchedules } from './schedules.js'
export { createTaskQueue } from './queue.js'
export { buildReport, buildReportHtml, escapeHtml, saveReport, listReports } from './report.js'
export { storeWriter, StoreConflict } from './writer.js'
export { TASK_LIFECYCLE, TASK_STATUS_KEYS, isTaskStatus, isTerminalTaskStatus, resolveTaskStatus, summarizeTasks, taskStatusMeta } from './task-status.js'
export type { TaskStatusKey, TaskStatusMeta, TaskSummary, TaskSummaryRow, TaskSummaryMetrics } from './task-status.js'
export { metaStore } from './meta-store.js'

/**
 * Default backend is SQLite (single file). `VEXNAR_STORE=json` falls back to the
 * dsh-style per-record files, and `VEXNAR_STORE=postgres` keeps the legacy
 * adapter for one-time imports only. `root` overrides the store directory.
 *
 * 只要给了 PG 连接串（`VEXNAR_PG_DSN` 是 Go 那边的变量名，`VEXNAR_PG_URL` 是本包
 * 历史名字），就默认走 PostgreSQL：客户端与 `web/` 控制台、Go 服务读同一份数据，
 * 不会出现"同一个任务在两个界面里不一样"。显式设 `VEXNAR_STORE=sqlite` 可以压回去。
 * 配置域（agents/tools/mcp/settings）由 `openMeta` 按同一规则选择后端。
 */
export async function openStore(root?: string): Promise<Store> {
  const explicit = process.env.VEXNAR_STORE?.trim().toLowerCase()
  const connection = pgConnection()
  const mode = explicit || (connection ? 'postgres' : 'sqlite')
  if (mode === 'postgres') {
    if (connection === undefined) throw new Error('VEXNAR_STORE=postgres requires VEXNAR_PG_DSN or VEXNAR_PG_URL')
    const store = pgStore(connection)
    await store.init()
    return store
  }
  return openDefaultStore(root)
}

void backend
void dbPath
