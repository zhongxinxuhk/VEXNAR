// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdir } from 'node:fs/promises'
import { assetRow, companyRow, findingRow, nodeRow, taskRow, type Store, type TaskMetrics } from './types.js'
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
    invalidate(tables) {
      if (!tables) {
        for (const key of Object.keys(cache)) delete cache[key]
        return
      }
      for (const key of tables) delete cache[key]
    },
    tasks: {
      list: async () => [...(await load('tasks', taskRow))].filter((row) => !row.deleted_at_text && !row.archived_at_text).sort((a, b) => Number(b.id) - Number(a.id)),
      get: async (id) => (await load('tasks', taskRow)).find((row) => String(row.id) === String(id) && !row.deleted_at_text)
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
    activity: {
      history: async ({ taskId, before = 0, limit = 200 }) => {
        const tasks = await load('tasks', taskRow)
        const task = tasks.find((row) => String(row.id) === String(taskId))
        if (!task) return { items: [], snapshot: 0, hasMore: false }
        const rows = (await load('activity', { parse: (value) => value })).filter((row) => Number(row.exploration_id) === Number(task.exploration_id))
        const snapshot = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0)
        const filtered = rows.filter((row) => !before || Number(row.id) < before).sort((a, b) => Number(b.id) - Number(a.id))
        return { items: filtered.slice(0, Math.min(limit, 500)), snapshot, hasMore: filtered.length > limit }
      }
    },
    async taskMetrics() {
      const activity = await load('activity', { parse: (value) => value })
      const nodes = await load('nodes', nodeRow)
      const findings = await load('findings', findingRow)
      const out = new Map<number, TaskMetrics>()
      const ensure = (explorationId: number) => {
        let entry = out.get(explorationId)
        if (!entry) {
          entry = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, last_activity_unix: 0, goals_total: 0, goals_met: 0, in_flight: 0, findings: { critical: 0, high: 0, medium: 0, low: 0 } }
          out.set(explorationId, entry)
        }
        return entry
      }
      for (const row of activity) {
        const entry = ensure(Number(row.exploration_id))
        if (row.kind === 'result') {
          entry.input_tokens += Number(row.input_tokens ?? 0)
          entry.output_tokens += Number(row.output_tokens ?? 0)
          entry.cache_read_tokens += Number(row.cache_read_tokens ?? 0)
          entry.cache_write_tokens += Number(row.cache_write_tokens ?? 0)
        }
        entry.last_activity_unix = Math.max(entry.last_activity_unix, Number(row.created_unix ?? 0))
      }
      for (const node of nodes) {
        const entry = ensure(Number(node.exploration_id))
        if (node.kind === 'goal') {
          entry.goals_total += 1
          if (node.state === 'met') entry.goals_met += 1
        }
        if (node.kind === 'intent' && node.state === 'running') entry.in_flight += 1
      }
      const taskByExploration = new Map((await load('tasks', taskRow)).map((task) => [Number(task.exploration_id), String(task.id)]))
      for (const finding of findings) {
        if (!finding.task_id) continue
        const task = (await load('tasks', taskRow)).find((row) => String(row.id) === String(finding.task_id))
        if (!task) continue
        const entry = ensure(Number(task.exploration_id))
        if (finding.severity === 'critical') entry.findings.critical += 1
        if (finding.severity === 'high') entry.findings.high += 1
        if (finding.severity === 'medium') entry.findings.medium += 1
        if (finding.severity === 'low') entry.findings.low += 1
      }
      void taskByExploration
      return out
    },
    nodes: {
      page: async ({ taskId, page, size, order = 'desc', kinds = [], states = [], before }) => {
        const tasks = await load('tasks', taskRow)
        const task = tasks.find((row) => String(row.id) === String(taskId))
        if (!task) return { items: [], total: 0, edges: [] }
        let rows = (await load('nodes', nodeRow)).filter((row) => Number(row.exploration_id) === Number(task.exploration_id))
        if (kinds.length) rows = rows.filter((row) => kinds.includes(row.kind))
        if (states.length) rows = rows.filter((row) => states.includes(row.state))
        if (before) rows = rows.filter((row) => Number(row.id) < Number(before))
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
