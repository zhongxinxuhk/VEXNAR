// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { homedir } from 'node:os'
import { join } from 'node:path'
import { storeWriter } from './writer.js'
import { metaStore as jsonMetaStore } from './meta-store.js'
import type { MetaStore } from './meta-store.js'
import { jsonStore } from './json-store.js'
import { sqliteWriter, sqliteMetaStore, sqliteStore } from './sqlite.js'
import { pgStore } from './pg-store.js'
import { pgMetaStore, type PgConnection } from './pg-meta.js'
import type { Store } from './types.js'

export type Backend = 'json' | 'sqlite' | 'postgres'

/** Base directory for the store (file blobs, reports, and the SQLite file). */
export function storeRoot(): string {
  return process.env.VEXNAR_STORE_ROOT || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'vexnar', 'store')
}

/** Single SQLite file under `root`. Override with `VEXNAR_SQLITE_PATH`. */
export function dbPath(root = storeRoot()): string {
  return process.env.VEXNAR_SQLITE_PATH || join(root, 'vexnar.sqlite')
}

export function backend(): Backend {
  return (process.env.VEXNAR_STORE || 'sqlite').toLowerCase() === 'json' ? 'json' : 'sqlite'
}

/**
 * The PostgreSQL the Go service owns, or undefined when no DSN is configured.
 *
 * `VEXNAR_PG_DSN` is the Go-side variable name; `VEXNAR_PG_URL` is this package's
 * historical one. A deploy that sets either one is talking to the same database
 * as the console, so the configuration domain has to be read from it too —
 * otherwise the client reports 0 agents/tools/MCP while the console lists them.
 */
export function pgConnection(): PgConnection | undefined {
  const dsn = process.env.VEXNAR_PG_DSN?.trim() || process.env.VEXNAR_PG_URL?.trim()
  if (!dsn) return undefined
  try {
    const parsed = new URL(dsn)
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 5432),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, '') || 'postgres',
      ssl: parsed.searchParams.get('sslmode') !== 'disable'
    }
  } catch {
    return undefined
  }
}

export function openWriter(root = storeRoot()) {
  return backend() === 'sqlite' ? sqliteWriter(dbPath(root)) : storeWriter(root)
}

/**
 * Configuration domain reader. Follows the same backend selection as
 * `openStore`: an explicit `VEXNAR_STORE` wins, otherwise a PostgreSQL DSN
 * decides. Tables PostgreSQL does not have (client-owned state such as
 * `trafficCaptures`) stay in the local SQLite meta store.
 */
export function openMeta(root = storeRoot()): MetaStore {
  const explicit = process.env.VEXNAR_STORE?.trim().toLowerCase()
  const connection = pgConnection()
  const wantsPg = explicit === 'postgres' || (explicit !== 'json' && explicit !== 'sqlite' && connection !== undefined)
  if (wantsPg && connection !== undefined) return pgMetaStore(connection, sqliteMetaStore(dbPath(root)))
  return explicit === 'json' ? jsonMetaStore(root) : sqliteMetaStore(dbPath(root))
}

/**
 * Store 对象的同步构造：选后端、开文件，不做 `await`。
 *
 * 嵌入 bundle（`core-embedded.js`）的模块图里不允许顶层 await：esbuild 会把含
 * TLA 的模块包成异步 init，环形 import 的两个模块就会互相等待，整个 core 永远
 * 停在加载中。把异步初始化（JSON 目录、PG 连通性）留给 `startRuntime()`，
 * 模块图就能同步求值。
 */
export function openStoreSync(root = storeRoot()): Store {
  const explicit = process.env.VEXNAR_STORE?.trim().toLowerCase()
  const connection = pgConnection()
  const mode = explicit || (connection ? 'postgres' : 'sqlite')
  if (mode === 'postgres') {
    if (connection === undefined) throw new Error('VEXNAR_STORE=postgres requires VEXNAR_PG_DSN or VEXNAR_PG_URL')
    return pgStore(connection)
  }
  return backend() === 'sqlite' ? sqliteStore(dbPath(root)) : jsonStore(root)
}

export async function openStore(root = storeRoot()): Promise<Store> {
  const store = openStoreSync(root)
  await store.init()
  return store
}
