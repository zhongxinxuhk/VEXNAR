// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * vexnar-meta: the `single` layout domain. One readable document holds the
 * low-churn configuration tables (agents, tools, mcp, notify, llm profiles,
 * settings, task categories and templates). Writes replace the whole file,
 * which is acceptable at this size and keeps the file inspectable.
 */
export interface MetaStore {
  backend: 'json'
  load(): Promise<Record<string, any[] | Record<string, unknown>>>
  table<T = any[]>(name: string): Promise<T>
  save(next: Record<string, any[] | Record<string, unknown>>): Promise<void>
}

export function metaStore(root: string): MetaStore {
  const file = join(root, 'meta.json')
  let cache: Record<string, any[] | Record<string, unknown>> | null = null

  async function load() {
    if (cache) return cache
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'))
      cache = parsed.tables ?? parsed
    } catch {
      cache = {}
    }
    return cache!
  }

  return {
    backend: 'json',
    load,
    async table(name) {
      const tables = await load()
      return (tables[name] ?? []) as any
    },
    async save(next) {
      cache = next
      await mkdir(dirname(file), { recursive: true, mode: 0o700 })
      const temp = `${file}.tmp`
      await writeFile(temp, `${JSON.stringify({ version: 1, tables: next }, null, 2)}\n`, { mode: 0o600 })
      await rename(temp, file)
    }
  }
}
