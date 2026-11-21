// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { homedir } from 'node:os'
import { join } from 'node:path'
import { jsonStore } from './json-store.js'
import { metaStore } from './meta-store.js'
import { pgStore } from './pg-store.js'
import type { Store } from './types.js'

export type { Store } from './types.js'
export { metaStore } from './meta-store.js'
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

export function storeRoot() {
  return process.env.VEXNAR_STORE_ROOT || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'vexnar', 'store')
}

/**
 * Default backend is the dsh-style JSON store. PostgreSQL is opt-in:
 *   VEXNAR_STORE=postgres VEXNAR_PG_URL=postgres://...
 */
export async function openStore(pgConnection?: Parameters<typeof pgStore>[0]): Promise<Store> {
  const backend = (process.env.VEXNAR_STORE || 'json').toLowerCase()
  if (backend === 'postgres') {
    const connection = pgConnection ?? fromUrl(process.env.VEXNAR_PG_URL)
    if (!connection) throw new Error('VEXNAR_STORE=postgres requires VEXNAR_PG_URL or a pg connection')
    const store = pgStore(connection)
    await store.init()
    return store
  }
  const store = jsonStore(storeRoot())
  await store.init()
  return store
}

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
