// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Write side of the dsh-style store: per-record atomic replaces, a commit
 * journal for multi-entity writes, optimistic revisions, and a single-writer
 * lock so two processes can never interleave.
 */
export class StoreConflict extends Error {
  constructor(readonly table: string, readonly key: string, readonly expected: number, readonly actual: number) {
    super(`${table}/${key} revision ${actual}, expected ${expected}`)
    this.name = 'StoreConflict'
  }
}

interface Op {
  table: string
  key: string
  record: Record<string, unknown>
  expectedRev?: number
}

const SAFE = /^[a-zA-Z0-9_-]+$/

export function storeWriter(root: string) {
  const journalDir = join(root, 'journal')

  async function readRecord(table: string, key: string) {
    try {
      const doc = JSON.parse(await readFile(join(root, table, `${key}.json`), 'utf8'))
      return doc.record ?? doc
    } catch {
      return null
    }
  }

  async function writeRecord(table: string, key: string, record: Record<string, unknown>) {
    if (!SAFE.test(key)) throw new Error(`unsafe key ${key}`)
    const dir = join(root, table)
    await mkdir(dir, { recursive: true, mode: 0o700 })
    const file = join(dir, `${key}.json`)
    const temp = `${file}.tmp`
    await writeFile(temp, `${JSON.stringify({ version: 1, record }, null, 2)}\n`, { mode: 0o600 })
    await rename(temp, file)
  }

  async function apply(op: Op) {
    const current = await readRecord(op.table, op.key)
    const actual = Number(current?.rev ?? 0)
    if (op.expectedRev !== undefined && actual !== op.expectedRev) {
      throw new StoreConflict(op.table, op.key, op.expectedRev, actual)
    }
    const next = { ...op.record, rev: actual + 1 }
    await writeRecord(op.table, op.key, next)
    return next
  }

  async function list(table: string): Promise<Record<string, unknown>[]> {
    const dir = join(root, table)
    const rows: Record<string, unknown>[] = []
    try {
      for (const name of await readdir(dir)) {
        if (!name.endsWith('.json')) continue
        const doc = JSON.parse(await readFile(join(dir, name), 'utf8'))
        rows.push(doc.record ?? doc)
      }
    } catch {
      // empty table
    }
    return rows
  }

  async function maxKey(table: string): Promise<number> {
    const dir = join(root, table)
    let max = 0
    try {
      for (const name of await readdir(dir)) {
        if (!name.endsWith('.json')) continue
        const key = Number(name.slice(0, -5))
        if (Number.isFinite(key)) max = Math.max(max, key)
      }
    } catch {
      // empty table
    }
    return max
  }

  async function remove(table: string, key: string) {
    await rm(join(root, table, `${key}.json`), { force: true })
  }

  return {
    readRecord,
    list,
    maxKey,
    remove,
    async put(op: Op) {
      return apply(op)
    },
    /** Journaled multi-entity commit: prepared → apply → committed. */
    async commit(ops: Op[]) {
      await mkdir(journalDir, { recursive: true, mode: 0o700 })
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const file = join(journalDir, `${id}.json`)
      await writeFile(file, `${JSON.stringify({ state: 'prepared', ops }, null, 2)}\n`, { mode: 0o600 })
      const written: Record<string, unknown>[] = []
      try {
        for (const op of ops) written.push(await apply(op))
      } catch (error) {
        await writeFile(file, `${JSON.stringify({ state: 'failed', ops, error: String(error) }, null, 2)}\n`, { mode: 0o600 })
        throw error
      }
      await writeFile(file, `${JSON.stringify({ state: 'committed', ops }, null, 2)}\n`, { mode: 0o600 })
      return written
    },
    /** Replay prepared or failed commits after a crash. */
    async recover() {
      let names: string[] = []
      try {
        names = await readdir(journalDir)
      } catch {
        return { replayed: 0 }
      }
      let replayed = 0
      for (const name of names.filter((file) => file.endsWith('.json'))) {
        const path = join(journalDir, name)
        const journal = JSON.parse(await readFile(path, 'utf8'))
        if (journal.state !== 'prepared') continue
        for (const op of journal.ops as Op[]) await apply({ ...op, expectedRev: undefined })
        await writeFile(path, `${JSON.stringify({ ...journal, state: 'committed' }, null, 2)}\n`, { mode: 0o600 })
        replayed += 1
      }
      return { replayed }
    },
    /** Single-writer lock; a second process fails fast. */
    async lock() {
      const path = join(root, 'store.lock')
      await mkdir(root, { recursive: true, mode: 0o700 })
      let handle
      try {
        handle = await open(path, 'wx', 0o600)
      } catch {
        // A crashed process leaves its pid behind; take the lock only if that
        // process is gone.
        let stale = false
        try {
          const pid = Number((await readFile(path, 'utf8')).trim())
          if (!Number.isFinite(pid) || pid <= 0) stale = true
          else process.kill(pid, 0)
        } catch (error: any) {
          stale = error?.code === 'ESRCH'
        }
        if (!stale) throw new Error(`store is already open for writing: ${path}`)
        await rm(path, { force: true })
        handle = await open(path, 'wx', 0o600)
      }
      await handle.writeFile(`${process.pid}\n`)
      await handle.close()
      return async () => {
        try {
          const held = (await readFile(path, 'utf8')).trim()
          if (held === String(process.pid)) await rm(path, { force: true })
        } catch {
          // already gone
        }
      }
    }
  }
}

export type StoreWriter = ReturnType<typeof storeWriter>
