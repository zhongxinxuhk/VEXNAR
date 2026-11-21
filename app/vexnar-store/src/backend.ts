// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { homedir } from 'node:os'
import { join } from 'node:path'
import { storeWriter } from './writer.js'
import { metaStore as jsonMetaStore } from './meta-store.js'
import { jsonStore } from './json-store.js'
import { sqliteWriter, sqliteMetaStore, sqliteStore } from './sqlite.js'
import type { Store } from './types.js'

export type Backend = 'json' | 'sqlite'

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

export function openWriter(root = storeRoot()) {
  return backend() === 'sqlite' ? sqliteWriter(dbPath(root)) : storeWriter(root)
}

export function openMeta(root = storeRoot()) {
  return backend() === 'sqlite' ? sqliteMetaStore(dbPath(root)) : jsonMetaStore(root)
}

export async function openStore(root = storeRoot()): Promise<Store> {
  const store = backend() === 'sqlite' ? sqliteStore(dbPath(root)) : jsonStore(root)
  await store.init()
  return store
}
