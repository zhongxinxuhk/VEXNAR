// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { z } from 'zod'

/**
 * `per-record` layout: one document per record under `<root>/<table>/<key>.json`,
 * matching dsh-storage-json's per-record unit. Keys are restricted to the same
 * safe alphabet; each write replaces one document atomically.
 */
const KEY = /^[a-zA-Z0-9_-]+$/

export function recordKey(value: string) {
  const key = String(value)
  if (!KEY.test(key)) throw new Error(`per-record key ${JSON.stringify(key)} is not [a-zA-Z0-9_-]+`)
  return key
}

export async function readPerRecord<T>(root: string, table: string, schema: z.ZodType<T>): Promise<T[]> {
  const dir = join(root, table)
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const rows: T[] = []
  names.sort()
  for (const name of names) {
    if (!name.endsWith('.json') || name.endsWith('.tmp')) continue
    try {
      const doc = JSON.parse(await readFile(join(dir, name), 'utf8'))
      rows.push(schema.parse(doc.record ?? doc))
    } catch {
      // Unreadable record reads as absent, like the dsh backend.
    }
  }
  return rows
}

/** Remove a table's directory before a full import, so stale keys cannot duplicate rows. */
export async function clearPerRecord(root: string, table: string) {
  await rm(join(root, table), { recursive: true, force: true })
}

export async function writePerRecord(root: string, table: string, rows: Array<{ key: string; record: unknown }>) {
  const dir = join(root, table)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  for (const row of rows) {
    const key = recordKey(row.key)
    const file = join(dir, `${key}.json`)
    const temp = `${file}.tmp`
    await writeFile(temp, `${JSON.stringify({ version: 1, record: row.record }, null, 2)}\n`, { mode: 0o600 })
    await rename(temp, file)
  }
}
