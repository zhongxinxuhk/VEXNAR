// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import pg from 'pg'
import { assetRow, findingRow, nodeRow, taskRow, type Store } from './types.js'

/**
 * Optional PostgreSQL adapter. This is the bridge for existing deployments and
 * for importing their rows into the dsh-style JSON store.
 */
pg.types.setTypeParser(20, (value: string) => Number(value))

export function pgStore(connection: {
  host: string
  port: number
  user: string
  password: string
  database: string
  ssl?: boolean
}): Store & { pool: pg.Pool; edges(explorationId: number): Promise<any[]> } {
  const pool = new pg.Pool({ ...connection, ssl: connection.ssl === false ? false : { rejectUnauthorized: false }, max: 8 })
  const q = async (text: string, values: unknown[] = []) => (await pool.query(text, values)).rows
  const rfc = (column: string) => `to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.US') || to_char(${column}, 'OF') || ':00'`
  const ts = (column: string) => `to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS') || to_char(${column}, 'OF') || ':00'`

  return {
    backend: 'postgres',
    pool,
    async init() {
      await pool.query('select 1')
    },
    tasks: {
      list: async () => {
        const rows = await q(`SELECT id::text AS id, exploration_id, name, description, goal, status, paused, queued,
          category_id, pinned_at, llm_profile_id, active_llm_profile_id, coverage_enabled,
          ${rfc('created_at')} AS created_at_text, floor(extract(epoch from created_at))::bigint AS created_unix,
          ${rfc('completed_at')} AS completed_at_text, coalesce(floor(extract(epoch from completed_at)),0)::bigint AS completed_unix
          FROM tasks ORDER BY tasks.id DESC`)
        return rows.map((row) => taskRow.parse({ ...row, exploration_id: Number(row.exploration_id) }))
      },
      get: async (id) => {
        const rows = await q(`SELECT id::text AS id, exploration_id, name, description, goal, status, paused, queued,
          category_id, pinned_at, llm_profile_id, active_llm_profile_id, coverage_enabled,
          ${rfc('created_at')} AS created_at_text, floor(extract(epoch from created_at))::bigint AS created_unix,
          ${rfc('completed_at')} AS completed_at_text, coalesce(floor(extract(epoch from completed_at)),0)::bigint AS completed_unix
          FROM tasks WHERE id = $1`, [id])
        return rows[0] ? taskRow.parse({ ...rows[0], exploration_id: Number(rows[0].exploration_id) }) : undefined
      }
    },
    findings: {
      list: async (limit = 500) => {
        const rows = await q(`SELECT id::text AS id, node_id::text AS node_id, vulnclass, name, severity, status, summary, evidence,
          task_id::text AS task_id, ${rfc('created_at')} AS created_at_text
          FROM findings ORDER BY created_at DESC LIMIT $1`, [limit])
        return rows.map((row) => findingRow.parse(row))
      },
      get: async (id) => {
        const rows = await q(`SELECT id::text AS id, node_id::text AS node_id, vulnclass, name, severity, status, summary, evidence, report,
          task_id::text AS task_id, ${rfc('created_at')} AS created_at_text
          FROM findings WHERE id = $1 OR node_id = $1 LIMIT 1`, [id])
        return rows[0] ? findingRow.parse(rows[0]) : undefined
      },
      stats: async () => {
        const [row] = await q(`SELECT count(*)::int AS total,
          count(*) FILTER (WHERE status = 'pending')::int AS pending,
          count(*) FILTER (WHERE severity = 'critical')::int AS critical,
          count(*) FILTER (WHERE severity = 'high')::int AS high,
          count(*) FILTER (WHERE severity = 'medium')::int AS medium,
          count(*) FILTER (WHERE severity = 'low')::int AS low FROM findings`)
        const classes = await q(`SELECT DISTINCT vulnclass FROM findings WHERE vulnclass <> '' ORDER BY vulnclass`)
        const tasks = await q(`SELECT f.task_id AS id, coalesce(t.name,'') AS name, coalesce(t.description,'') AS description,
          count(*)::int AS count FROM findings f LEFT JOIN tasks t ON t.id = f.task_id
          WHERE f.task_id IS NOT NULL GROUP BY f.task_id, t.name, t.description ORDER BY max(f.created_at) DESC`)
        return { ...row, vulnclasses: classes.map((c) => c.vulnclass), tasks }
      }
    },
    assets: {
      list: async ({ type, limit = 20, offset = 0 }) => {
        const where = type ? 'WHERE type = $3' : ''
        const values: unknown[] = type ? [limit, offset, type] : [limit, offset]
        const rows = await q(`SELECT id, type, company_id, task_ids, domain, root_domain, ip, port, url, last_seen::text AS last_seen
          FROM assets ${where} ORDER BY last_seen DESC, id DESC LIMIT $1 OFFSET $2`, values)
        const [count] = await q(`SELECT count(*)::int AS n FROM assets ${type ? 'WHERE type = $1' : ''}`, type ? [type] : [])
        return { rows: rows.map((row) => assetRow.parse({ ...row, task_ids: (row.task_ids ?? []).map(Number), company_id: row.company_id == null ? null : Number(row.company_id) })), total: Number(count.n) }
      },
      counts: async () => {
        const rows = await q(`SELECT type, count(*)::int AS n FROM assets GROUP BY type`)
        return Object.fromEntries(rows.map((row) => [row.type, Number(row.n)]))
      }
    },
    nodes: {
      page: async ({ taskId, page, size, order = 'desc', kinds = [], states = [] }) => {
        const [task] = await q('SELECT exploration_id FROM tasks WHERE id = $1', [taskId])
        if (!task) return { items: [], total: 0, edges: [] }
        const filters: string[] = ['exploration_id = $1']
        const values: unknown[] = [task.exploration_id]
        if (kinds.length) {
          values.push(kinds)
          filters.push(`kind = ANY($${values.length})`)
        }
        if (states.length) {
          values.push(states)
          filters.push(`state = ANY($${values.length})`)
        }
        const where = filters.join(' AND ')
        const [count] = await q(`SELECT count(*)::int AS n FROM exploration_nodes WHERE ${where}`, values)
        const rows = await q(`SELECT id::text AS id, exploration_id, kind, state, payload, priority, origin,
          ${ts('created_at')} AS created_at FROM exploration_nodes WHERE ${where}
          ORDER BY id ${order.toUpperCase()} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
          [...values, size, (page - 1) * size])
        const items = rows.map((row) => nodeRow.parse(row))
        const ids = items.map((row) => row.id)
        const edges = ids.length
          ? await q('SELECT src_id::text AS src, dst_id::text AS dst, rel FROM exploration_edges WHERE exploration_id = $2 AND (src_id = ANY($1::bigint[]) OR dst_id = ANY($1::bigint[]))', [ids, task.exploration_id])
          : []
        return { items, total: Number(count.n), edges }
      }
    },
    async edges(explorationId) {
      return q('SELECT src_id::text AS src, dst_id::text AS dst, rel FROM exploration_edges WHERE exploration_id = $1', [explorationId])
    }
  }
}
