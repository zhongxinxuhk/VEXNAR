// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type ToolDocumentation = { description: string; schema: unknown }
export type EditToolDocumentation = (current: ToolDocumentation) => ToolDocumentation

export function editBuiltinToolRows(rows: unknown, key: string, edit: EditToolDocumentation): boolean {
  const row = Array.isArray(rows) ? rows.find(item => item?.system === true && item.key === key) : undefined
  if (!row) return false
  const { description, schema } = edit({ description: row.description ?? '', schema: row.schema ?? {} })
  row.description = description
  row.schema = schema
  return true
}

/**
 * vexnar-meta: the `single` layout domain. One readable document holds the
 * low-churn configuration tables (agents, tools, mcp, notify, llm profiles,
 * settings, task categories and templates). Writes replace the whole file,
 * which is acceptable at this size and keeps the file inspectable.
 */
export interface MetaStore {
  backend: string
  load(): Promise<Record<string, any[] | Record<string, unknown>>>
  reload(): void
  table<T = any[]>(name: string): Promise<T>
  save(next: Record<string, any[] | Record<string, unknown>>): Promise<void>
  editBuiltinToolDocumentation(key: string, edit: EditToolDocumentation): Promise<boolean>
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

  async function save(next: Record<string, any[] | Record<string, unknown>>) {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 })
    const temp = `${file}.tmp`
    await writeFile(temp, `${JSON.stringify({ version: 1, tables: next }, null, 2)}\n`, { mode: 0o600 })
    await rename(temp, file)
    cache = next
  }
  let documentationWrite = Promise.resolve()
  return {
    backend: 'json',
    load,
    reload() { cache = null },
    async table(name) {
      const tables = await load()
      return (tables[name] ?? []) as any
    },
    save,
    editBuiltinToolDocumentation(key, edit) {
      const next = documentationWrite.then(async () => {
        cache = null
        const tables = structuredClone(await load())
        if (!editBuiltinToolRows(tables.tools, key, edit)) return false
        await save(tables)
        return true
      })
      documentationWrite = next.then(() => {}, () => {})
      return next
    }
  }
}
