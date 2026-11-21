// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdir } from 'node:fs/promises'
import { assetRow, companyRow, findingRow, nodeRow, taskRow, type Store } from './types.js'
import { readPerRecord } from './per-record.js'

/**
 * dsh-style JSON store. Graph and asset data use the per-record layout
 * (`<root>/<table>/<key>.json`), so a single update replaces one document;
 * metadata lives in the separate `meta.json` single-file domain.
 */
export function jsonStore(root: string): Store {
  const cache: Record<string, any[] | undefined> = {}

  async function load(key: string, schema: { parse: (value: unknown) => any }): Promise<any[]> {
    if (cache[key]) return cache[key]!
    cache[key] = await readPerRecord(root, key, schema as any)
    return cache[key]!
  }

  return {
    backend: 'json',
    async init() {
      await mkdir(root, { recursive: true, mode: 0o700 })
    },
    tasks: {
      list: async () => [...(await load('tasks', taskRow))].sort((a, b) => Number(b.id) - Number(a.id)),
      get: async (id) => (await load('tasks', taskRow)).find((row) => String(row.id) === String(id))
    },
    findings: {
      list: async (limit = 500) =>
        [...(await load('findings', findingRow))]
          .sort((a, b) => String(b.created_at_text).localeCompare(String(a.created_at_text)))
          .slice(0, limit),
      get: async (id) =>
        (await load('findings', findingRow)).find((row) => String(row.id) === String(id) || String(row.node_id) === String(id)),
      stats: async () => {
        const rows = await load('findings', findingRow)
        const taskRows = await load('tasks', taskRow)
        const taskInfo = new Map(taskRows.map((task) => [String(task.id), task]))
        const count = (predicate: (row: any) => boolean) => rows.filter(predicate).length
        const vulnclasses = [...new Set(rows.map((row) => row.vulnclass).filter(Boolean))].sort()
        const byTask = new Map<string, { id: number; name: string; description: string; count: number; last: string }>()
        for (const row of rows) {
          if (!row.task_id) continue
          const key = String(row.task_id)
          const info = taskInfo.get(key)
          const entry = byTask.get(key) ?? { id: Number(key), name: info?.name ?? '', description: info?.description ?? '', count: 0, last: '' }
          entry.count += 1
          entry.last = entry.last > row.created_at_text ? entry.last : row.created_at_text
          byTask.set(key, entry)
        }
        const tasks = [...byTask.values()].sort((a, b) => b.last.localeCompare(a.last)).map(({ last, ...rest }) => rest)
        return {
          total: rows.length,
          pending: count((row) => row.status === 'pending'),
          critical: count((row) => row.severity === 'critical'),
          high: count((row) => row.severity === 'high'),
          medium: count((row) => row.severity === 'medium'),
          low: count((row) => row.severity === 'low'),
          vulnclasses,
          tasks
        }
      }
    },
    assets: {
      list: async ({ type, limit = 20, offset = 0 }) => {
        let rows = await load('assets', assetRow)
        if (type) rows = rows.filter((row) => row.type === type)
        rows = [...rows].sort((a, b) => String(b.last_seen ?? '').localeCompare(String(a.last_seen ?? '')) || b.id - a.id)
        return { rows: rows.slice(offset, offset + limit), total: rows.length }
      },
      counts: async () => {
        const rows = await load('assets', assetRow)
        const out: Record<string, number> = {}
        for (const row of rows) out[row.type] = (out[row.type] ?? 0) + 1
        return out
      }
    },
    companies: {
      list: async () => [...(await load('companies', companyRow))]
    },
    nodes: {
      page: async ({ taskId, page, size, order = 'desc', kinds = [], states = [] }) => {
        const tasks = await load('tasks', taskRow)
        const task = tasks.find((row) => String(row.id) === String(taskId))
        if (!task) return { items: [], total: 0, edges: [] }
        let rows = (await load('nodes', nodeRow)).filter((row) => Number(row.exploration_id) === Number(task.exploration_id))
        if (kinds.length) rows = rows.filter((row) => kinds.includes(row.kind))
        if (states.length) rows = rows.filter((row) => states.includes(row.state))
        rows.sort((a, b) => (order === 'asc' ? Number(a.id) - Number(b.id) : Number(b.id) - Number(a.id)))
        const items = rows.slice((page - 1) * size, (page - 1) * size + size)
        const ids = new Set(items.map((row) => String(row.id)))
        const edges = (await load('edges', { parse: (value) => value })).filter(
          (edge) => Number(edge.exploration_id) === Number(task.exploration_id) && (ids.has(String(edge.src)) || ids.has(String(edge.dst)))
        )
        return { items, total: rows.length, edges }
      }
    }
  }
}
