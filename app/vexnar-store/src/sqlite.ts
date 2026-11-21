// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createStore } from './json-store.js'
import { StoreConflict } from './writer.js'
import type { Store } from './types.js'

/**
 * Single-file SQLite backend (`node:sqlite`, no native dependency). Replaces
 * PostgreSQL: the same `kv` table holds every per-record domain (tasks, nodes,
 * findings, assets, edges, …) and the `meta` table holds the low-churn
 * configuration domain (agents, tools, mcp, notify, llm profiles, settings).
 *
 * Layout:
 *   kv   (tbl TEXT, key TEXT, record TEXT, PRIMARY KEY(tbl, key))
 *   meta (tbl TEXT PRIMARY KEY, record TEXT)
 *
 * The `record` column stores the same JSON document the JSON backend stores,
 * including its optimistic `rev`. Transactions give the atomicity the JSON
 * backend got from its journal, so `recover()` is a no-op.
 */

interface WriterOp {
  table: string
  key: string
  record: Record<string, unknown>
  expectedRev?: number
}

function open(path: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('CREATE TABLE IF NOT EXISTS kv (tbl TEXT NOT NULL, key TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY (tbl, key))')
  db.exec('CREATE TABLE IF NOT EXISTS meta (tbl TEXT PRIMARY KEY, record TEXT NOT NULL)')
  return db
}

const parse = (json: string) => JSON.parse(json) as Record<string, unknown>

export function sqliteWriter(path: string) {
  const db = open(path)
  const getRec = db.prepare('SELECT record FROM kv WHERE tbl = ? AND key = ?')
  const setRec = db.prepare('INSERT INTO kv (tbl, key, record) VALUES (?, ?, ?) ON CONFLICT(tbl, key) DO UPDATE SET record = excluded.record')
  const delRec = db.prepare('DELETE FROM kv WHERE tbl = ? AND key = ?')
  const listRec = db.prepare('SELECT key, record FROM kv WHERE tbl = ?')

  function readSync(table: string, key: string): Record<string, unknown> | null {
    const row = getRec.get(table, key) as { record: string } | undefined
    return row ? parse(row.record) : null
  }

  function applySync(op: WriterOp): Record<string, unknown> {
    const current = readSync(op.table, op.key)
    const actual = Number(current?.rev ?? 0)
    if (op.expectedRev !== undefined && actual !== op.expectedRev) {
      throw new StoreConflict(op.table, op.key, op.expectedRev, actual)
    }
    const next = { ...op.record, rev: actual + 1 }
    setRec.run(op.table, op.key, JSON.stringify(next))
    return next
  }

  return {
    async readRecord(table: string, key: string) {
      return readSync(table, key)
    },
    async put(op: WriterOp) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const written = applySync(op)
        db.exec('COMMIT')
        return written
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    async commit(ops: WriterOp[]) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const written: Record<string, unknown>[] = []
        for (const op of ops) written.push(applySync(op))
        db.exec('COMMIT')
        return written
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    async list(table: string): Promise<Record<string, unknown>[]> {
      const rows = listRec.all(table) as Array<{ key: string; record: string }>
      return rows.map((row) => parse(row.record))
    },
    async maxKey(table: string): Promise<number> {
      let max = 0
      for (const row of listRec.all(table) as Array<{ key: string; record: string }>) {
        const key = Number(row.key)
        if (Number.isFinite(key)) max = Math.max(max, key)
      }
      return max
    },
    async remove(table: string, key: string) {
      delRec.run(table, key)
    },
    async recover() {
      return { replayed: 0 }
    },
    async lock() {
      return () => {}
    }
  }
}

export type SqliteWriter = ReturnType<typeof sqliteWriter>

export function sqliteMetaStore(path: string) {
  const db = open(path)
  const getMeta = db.prepare('SELECT record FROM meta WHERE tbl = ?')
  const setMeta = db.prepare('INSERT INTO meta (tbl, record) VALUES (?, ?) ON CONFLICT(tbl) DO UPDATE SET record = excluded.record')
  const listMeta = db.prepare('SELECT tbl, record FROM meta')

  return {
    backend: 'sqlite' as const,
    async load(): Promise<Record<string, any[] | Record<string, unknown>>> {
      const out: Record<string, any> = {}
      for (const row of listMeta.all() as Array<{ tbl: string; record: string }>) out[row.tbl] = parse(row.record)
      return out
    },
    reload() {},
    async table<T = any[]>(name: string): Promise<T> {
      const row = getMeta.get(name) as { record: string } | undefined
      return (row ? parse(row.record) : []) as T
    },
    async save(next: Record<string, any[] | Record<string, unknown>>) {
      db.exec('BEGIN IMMEDIATE')
      try {
        for (const [tbl, rows] of Object.entries(next)) setMeta.run(tbl, JSON.stringify(rows))
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    }
  }
}

export function sqliteStore(path: string): Store {
  const db = open(path)
  const listRec = db.prepare('SELECT record FROM kv WHERE tbl = ?')
  return createStore('sqlite', async (table, schema) => {
    const rows = listRec.all(table) as Array<{ record: string }>
    const out: any[] = []
    for (const row of rows) {
      try {
        out.push(schema.parse(parse(row.record)))
      } catch {
        // unreadable record reads as absent, matching the JSON backend
      }
    }
    return out
  }, async () => {}, false)
}
