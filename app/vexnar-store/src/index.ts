// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { pgStore } from './pg-store.js'
import type { Store } from './types.js'
import { backend, dbPath, openStore as openDefaultStore, openMeta, openWriter, storeRoot } from './backend.js'

export type { Store } from './types.js'
export { storeRoot, dbPath, backend, openWriter, openMeta } from './backend.js'
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
export { metaStore } from './meta-store.js'

/**
 * Default backend is SQLite (single file). `VEXNAR_STORE=json` falls back to the
 * dsh-style per-record files, and `VEXNAR_STORE=postgres` keeps the legacy
 * adapter for one-time imports only. `root` overrides the store directory.
 *
 * 只要给了 PG 连接串（`VEXNAR_PG_DSN` 是 Go 那边的变量名，`VEXNAR_PG_URL` 是本包
 * 历史名字），就默认走 PostgreSQL：客户端与 `web/` 控制台、Go 服务读同一份数据，
 * 不会出现"同一个任务在两个界面里不一样"。显式设 `VEXNAR_STORE=sqlite` 可以压回去。
 */
export async function openStore(root?: string): Promise<Store> {
  const explicit = process.env.VEXNAR_STORE?.trim().toLowerCase()
  const dsn = process.env.VEXNAR_PG_DSN?.trim() || process.env.VEXNAR_PG_URL?.trim()
  const mode = explicit || (dsn ? 'postgres' : 'sqlite')
  if (mode === 'postgres') {
    const connection = fromUrl(dsn)
    if (!connection) throw new Error('VEXNAR_STORE=postgres requires VEXNAR_PG_DSN or VEXNAR_PG_URL')
    const store = pgStore(connection)
    await store.init()
    return store
  }
  return openDefaultStore(root)
}

void backend
void dbPath

function fromUrl(url?: string) {
  if (!url) return undefined
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, '') || 'postgres',
    ssl: parsed.searchParams.get('sslmode') !== 'disable'
  }
}
