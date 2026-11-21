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
      list: async ({ type, taskId, limit = 20, offset = 0 }) => {
        let rows = await load('assets', assetRow)
        if (type) rows = rows.filter((row) => row.type === type)
        if (taskId) {
          rows = rows.filter((row) => Array.isArray(row.task_ids) && row.task_ids.map(Number).includes(Number(taskId)))
          const links = await load('task_asset_links', { parse: (value) => value })
          rows = rows.map((row) => {
            const link = links.find((item) => String(item.task_id) === String(taskId) && String(item.asset_id) === String(row.id))
            return link ? { ...row, task_source: link.source, task_source_summary: link.source_summary, task_source_node_id: link.source_node_id } : row
          })
        }
        rows = [...rows].sort((a, b) => String(b.last_seen ?? '').localeCompare(String(a.last_seen ?? '')) || b.id - a.id)
        return { rows: rows.slice(offset, offset + limit), total: rows.length }
      },
      counts: async (taskId?: string) => {
        let rows = await load('assets', assetRow)
        if (taskId) rows = rows.filter((row) => Array.isArray(row.task_ids) && row.task_ids.map(Number).includes(Number(taskId)))
        const out: Record<string, number> = {}
        for (const row of rows) out[row.type] = (out[row.type] ?? 0) + 1
        return out
      }
    },
    companies: {
      list: async () => [...(await load('companies', companyRow))]
    },
    traffic: async (findingId) => {
      const finding = (await load('findings', findingRow)).find((row) => String(row.id) === String(findingId))
      if (!finding) return null
      const bindings = (await load('finding_traffic_bindings', { parse: (value) => value })).filter((row) => String(row.finding_id) === String(findingId)).sort((a, b) => Number(a.position) - Number(b.position) || Number(a.id) - Number(b.id))
      const snapshots = await load('traffic_evidence_snapshots', { parse: (value) => value })
      const byId = new Map(snapshots.map((row) => [String(row.id), row.snapshot]))
      return {
        finding_id: String(finding.id),
        version: Number(finding.evidence_version ?? 0),
        report_version: Number(finding.report_evidence_version ?? 0),
        bindings: bindings.map((row) => ({
          id: String(row.id), finding_id: String(row.finding_id), snapshot_id: String(row.snapshot_id),
          role: row.role, note: row.note ?? '', position: Number(row.position), created_at: row.created_at,
          snapshot: byId.get(String(row.snapshot_id)) ?? null
        }))
      }
    },
    schedules: {
      list: async () => (await load('schedules', { parse: (value) => value })).sort((a, b) => Number(a.id) - Number(b.id))
    },
    triggers: {
      list: async (agentKey) => (await load('agent_triggers', { parse: (value) => value })).filter((row) => row.agent_key === agentKey).sort((a, b) => Number(a.id) - Number(b.id))
    },
    coverage: async (taskId) => {
      const task = (await load('tasks', taskRow)).find((row) => String(row.id) === String(taskId))
      if (!task) return { scope_rows: 0, denominator: 0, tested: 0, pct: null, by_type: [] }
      const relations = await load('task_relations', { parse: (value) => value })
      const contextIds = new Set([String(taskId), ...relations.filter((row) => String(row.task_id) === String(taskId)).map((row) => String(row.source_task_id))])
      const tasks = await load('tasks', taskRow)
      const contextExplorations = new Set(tasks.filter((row) => contextIds.has(String(row.id))).map((row) => Number(row.exploration_id)))
      const scopes = (await load('task_scope', { parse: (value) => value })).filter((row) => contextIds.has(String(row.task_id)))
      const assets = await load('assets', assetRow)
      const nodes = await load('nodes', nodeRow)
      const anchors = await load('anchors', { parse: (value) => value })
      const contextNodes = new Map(nodes.filter((node) => contextExplorations.has(Number(node.exploration_id))).map((node) => [String(node.id), node]))
      const factIds = new Set([...contextNodes.values()].filter((node) => node.kind === 'fact').map((node) => String(node.id)))
      const testedIds = new Set(anchors.filter((anchor) => factIds.has(String(anchor.node_id))).map((anchor) => Number(anchor.asset_id)))
      const inCidr = (ip: string, cidr: string) => {
        const [network, bitsRaw] = cidr.split('/')
        const bits = Number(bitsRaw)
        const toInt = (value: string) => value.split('.').reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0)
        if (!ip || !network || !Number.isFinite(bits) || !ip.includes('.') || !network.includes('.')) return false
        const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
        return (toInt(ip) & mask) === (toInt(network) & mask)
      }
      const normalizeIcp = (value: unknown) => String(value ?? '').toLowerCase().replace(/\s+/g, '')
      const targets = new Map<number, string>()
      for (const asset of assets) {
        const anchored = anchors.some((anchor) => Number(anchor.asset_id) === Number(asset.id) && contextNodes.has(String(anchor.node_id)))
        if (anchored) targets.set(Number(asset.id), asset.type)
        const matched = scopes.some((scope) => {
          if (scope.kind === 'company') return asset.company_id != null && Number(asset.company_id) === Number(scope.company_id)
          if (scope.kind === 'root_domain') return String(asset.root_domain ?? '') === String(scope.domain)
          if (scope.kind === 'subdomain') return String(asset.domain ?? '') === String(scope.domain)
          if (scope.kind === 'ip' || scope.kind === 'cidr') return inCidr(String(asset.ip ?? ''), String(scope.net))
          if (scope.kind === 'icp') return normalizeIcp(asset.icp) === normalizeIcp(scope.value) || normalizeIcp(asset.app_icp) === normalizeIcp(scope.value)
          return false
        })
        if (matched) targets.set(Number(asset.id), asset.type)
      }
      const byType = new Map<string, { type: string; total: number; tested: number }>()
      for (const [id, type] of targets) {
        const entry = byType.get(type) ?? { type, total: 0, tested: 0 }
        entry.total += 1
        if (testedIds.has(id)) entry.tested += 1
        byType.set(type, entry)
      }
      const list = [...byType.values()].sort((a, b) => a.type.localeCompare(b.type))
      const denominator = list.reduce((sum, item) => sum + item.total, 0)
      const tested = list.reduce((sum, item) => sum + item.tested, 0)
      return { scope_rows: scopes.length, denominator, tested, pct: denominator > 0 ? tested / denominator : null, by_type: list }
    },
    constraints: {
      list: async (taskId) => {
        const task = (await load('tasks', taskRow)).find((row) => String(row.id) === String(taskId))
        if (!task) return []
        const rows = await load('constraints', { parse: (value) => value })
        return rows
          .filter((row) => Number(row.exploration_id) === Number(task.exploration_id))
          .sort((a, b) => (a.kind === 'deny' ? 1 : 0) - (b.kind === 'deny' ? 1 : 0) || Number(a.id) - Number(b.id))
      }
    },
    activity: {
      history: async ({ taskId, session = '', before = 0, limit = 200 }) => {
        const task = (await load('tasks', taskRow)).find((row) => String(row.id) === String(taskId))
        if (!task) return { items: [], snapshot: 0, hasMore: false }
        const all = (await load('activity', { parse: (value) => value })).filter((row) => Number(row.exploration_id) === Number(task.exploration_id))
        const snapshot = all.reduce((max, row) => Math.max(max, Number(row.id)), 0)
        let rows = all
        if (session.startsWith('intent:')) rows = rows.filter((row) => String(row.node_id) === session.slice(7))
        else if (session === 'plan') rows = rows.filter((row) => row.worker === 'planner')
        else { rows = rows.filter((row) => row.worker === 'mainagent'); if (session.startsWith('main:')) rows = rows.filter((row) => String(row.main_seg ?? 0) === session.slice(5)) }
        const filtered = rows.filter((row) => !before || Number(row.id) < before).sort((a, b) => Number(b.id) - Number(a.id))
        const page = filtered.slice(0, Math.min(limit, 500)).reverse()
        return { items: page, snapshot, hasMore: filtered.length > limit }
      },
      dailyTokens: async (days) => {
        const rows = (await load('activity', { parse: (value) => value })).filter((row) => row.kind === 'result')
        const cutoff = Date.now() / 1000 - Math.max(days, 1) * 86400
        const buckets = new Map<string, any>()
        for (const row of rows) {
          const at = Number(row.created_unix ?? 0)
          if (at < cutoff) continue
          const day = new Date(String(row.created_at)).toISOString().slice(0, 10)
          const bucket = buckets.get(day) ?? { day, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 }
          bucket.input_tokens += Number(row.input_tokens ?? 0)
          bucket.output_tokens += Number(row.output_tokens ?? 0)
          bucket.cache_read_tokens += Number(row.cache_read_tokens ?? 0)
          buckets.set(day, bucket)
        }
        return [...buckets.values()].sort((a, b) => a.day.localeCompare(b.day))
      },
      tokenStats: async (taskId) => {
        const task = (await load('tasks', taskRow)).find((row) => String(row.id) === String(taskId))
        if (!task) return { workers: [], sessions: [], total: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 } }
        const rows = (await load('activity', { parse: (value) => value })).filter((row) => Number(row.exploration_id) === Number(task.exploration_id) && row.kind === 'result')
        const byWorker = new Map<string, any>()
        const total = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }
        for (const row of rows) {
          const worker = row.worker ?? ''
          const entry = byWorker.get(worker) ?? { worker, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }
          for (const key of ['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens'] as const) {
            entry[key] += Number(row[key] ?? 0)
            total[key] += Number(row[key] ?? 0)
          }
          byWorker.set(worker, entry)
        }
        const workers = [...byWorker.values()].sort((a, b) => {
          if (a.worker === b.worker) return 0
          if (a.worker === '') return 1
          if (b.worker === '') return -1
          return String(a.worker).localeCompare(String(b.worker))
        })
        const intentIds = new Set((await load('nodes', nodeRow)).filter((node) => Number(node.exploration_id) === Number(task.exploration_id) && node.kind === 'intent').map((node) => String(node.id)))
        const bySession = new Map<string, any>()
        for (const row of rows) {
          const key = row.worker === 'mainagent' ? `main:${Number(row.main_seg ?? 0)}` : row.worker === 'planner' ? 'plan' : row.node_id != null && intentIds.has(String(row.node_id)) ? `intent:${row.node_id}` : ''
          if (!key) continue
          const entry = bySession.get(key) ?? { session: key, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }
          for (const field of ['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens'] as const) entry[field] += Number(row[field] ?? 0)
          bySession.set(key, entry)
        }
        const sessions = [...bySession.values()].sort((a, b) => String(a.session).localeCompare(String(b.session)))
        return { workers, sessions, total }
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
