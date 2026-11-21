// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import pg from 'pg'
import { resolveTaskStatus } from './task-status.js'
import { assetRow, companyRow, findingRow, nodeRow, taskRow, type Store } from './types.js'

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

  // 任务行一律走同一个投影 + 同一个状态解析：原始 status 只是存储事实，
  // 对外发布的 status 必须是生命周期状态（task-status.ts）。
  const TASK_SELECT = `SELECT id::text AS id, exploration_id, name, description, goal, status, paused, queued,
          category_id, pinned_at, llm_profile_id, active_llm_profile_id, coverage_enabled,
          ${rfc('created_at')} AS created_at_text, floor(extract(epoch from created_at))::bigint AS created_unix,
          ${rfc('completed_at')} AS completed_at_text, coalesce(floor(extract(epoch from completed_at)),0)::bigint AS completed_unix,
          ${rfc('archived_at')} AS archived_at_text`
  const parseTaskRow = (row: any) => taskRow.parse({
    ...row,
    exploration_id: Number(row.exploration_id),
    stored_status: String(row.status ?? ''),
    status: resolveTaskStatus(row)
  })

  return {
    backend: 'postgres',
    pool,
    async init() {
      await pool.query('select 1')
    },
    tasks: {
      // 活动清单 = 未删除、未归档。归档任务在数据库里同时写 archived_at 与 deleted_at，
      // 因此这里两个条件都要给；只按 deleted_at 过滤会让归档任务重新出现在列表里。
      list: () => q(TASK_SELECT + ' FROM tasks WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY tasks.id DESC')
        .then((rows) => rows.map(parseTaskRow)),
      get: (id) => q(TASK_SELECT + ' FROM tasks WHERE id = $1', [id]).then((rows) => (rows[0] ? parseTaskRow(rows[0]) : undefined))
    },
    findings: {
      list: async (limit = 500) => {
        const rows = await q(`SELECT id::text AS id, node_id::text AS node_id, vulnclass, name, severity, status, summary, evidence, evidence_version, report_evidence_version,
          task_id::text AS task_id, ${rfc('created_at')} AS created_at_text
          FROM findings ORDER BY created_at DESC LIMIT $1`, [limit])
        return rows.map((row) => findingRow.parse(row))
      },
      get: async (id) => {
        const rows = await q(`SELECT id::text AS id, node_id::text AS node_id, vulnclass, name, severity, status, summary, evidence, report, evidence_version, report_evidence_version,
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
      list: async ({ type, taskId, limit = 20, offset = 0 }) => {
        const filters: string[] = []
        const values: unknown[] = [limit, offset]
        if (type) { values.push(type); filters.push(`a.type = $${values.length}`) }
        let linkIndex = 0
        if (taskId) { values.push(taskId); linkIndex = values.length; filters.push(`$${linkIndex}::bigint = ANY(a.task_ids)`) }
        const linkSelect = taskId ? ', l.source AS task_source, l.source_summary AS task_source_summary, l.source_node_id AS task_source_node_id' : ''
        const join = taskId ? `LEFT JOIN task_asset_links l ON l.asset_id = a.id AND l.task_id = $${linkIndex}` : ''
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
        const rows = await q(`SELECT a.id, a.type, a.company_id, a.task_ids, a.domain, a.root_domain, a.ip, a.port, a.url,
          a.last_seen::text AS last_seen${linkSelect}
          FROM assets a ${join} ${where} ORDER BY a.last_seen DESC, a.id DESC LIMIT $1 OFFSET $2`, values)
        const countValues: unknown[] = []
        const countFilters: string[] = []
        if (type) { countValues.push(type); countFilters.push(`type = $${countValues.length}`) }
        if (taskId) { countValues.push(taskId); countFilters.push(`$${countValues.length}::bigint = ANY(task_ids)`) }
        const [count] = await q(`SELECT count(*)::int AS n FROM assets ${countFilters.length ? `WHERE ${countFilters.join(' AND ')}` : ''}`, countValues)
        return { rows: rows.map((row) => assetRow.parse({ ...row, task_ids: (row.task_ids ?? []).map(Number), company_id: row.company_id == null ? null : Number(row.company_id), task_source_node_id: row.task_source_node_id == null ? undefined : Number(row.task_source_node_id) })), total: Number(count.n) }
      },
      counts: async (taskId?: string) => {
        const rows = await q(`SELECT type, count(*)::int AS n FROM assets ${taskId ? 'WHERE $1::bigint = ANY(task_ids)' : ''} GROUP BY type`, taskId ? [taskId] : [])
        return Object.fromEntries(rows.map((row) => [row.type, Number(row.n)]))
      }
    },
    companies: {
      list: async () => {
        const rows = await q(`SELECT c.id, c.name, c.nkey, c.created_at::text AS created_at, c.updated_at::text AS updated_at,
          (SELECT count(*)::int FROM assets a WHERE a.company_id = c.id) AS asset_count
          FROM companies c ORDER BY c.name`)
        const scopes = await q('SELECT id, company_id, kind, domain, net, value, raw, reason FROM company_scope')
        const byCompany = new Map<number, unknown[]>()
        for (const scope of scopes) {
          const list = byCompany.get(Number(scope.company_id)) ?? []
          list.push({
            id: Number(scope.id), company_id: Number(scope.company_id), kind: scope.kind,
            ...(scope.domain ? { domain: scope.domain } : {}),
            ...(scope.net ? { net: scope.net } : {}),
            ...(scope.value ? { value: scope.value } : {}),
            raw: scope.raw,
            ...(scope.reason ? { reason: scope.reason } : {})
          })
          byCompany.set(Number(scope.company_id), list)
        }
        return rows.map((row) => companyRow.parse({ ...row, scope: byCompany.get(Number(row.id)) ?? [] }))
      }
    },
    traffic: async (findingId) => {
      const [finding] = await q('SELECT id, evidence_version, report_evidence_version FROM findings WHERE id = $1', [findingId])
      if (!finding) return null
      const rows = await q(`SELECT b.id, b.finding_id, b.snapshot_id, b.role, b.note, b.position,
        to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') || to_char(b.created_at, 'OF') || ':00' AS created_at,
        to_jsonb(s) AS snapshot FROM finding_traffic_bindings b JOIN traffic_evidence_snapshots s ON s.id=b.snapshot_id
        WHERE b.finding_id=$1 ORDER BY b.position, b.id`, [findingId])
      return {
        finding_id: String(finding.id), version: Number(finding.evidence_version), report_version: Number(finding.report_evidence_version),
        bindings: rows.map((row) => ({ id: String(row.id), finding_id: String(row.finding_id), snapshot_id: String(row.snapshot_id), role: row.role, note: row.note ?? '', position: Number(row.position), created_at: row.created_at, snapshot: row.snapshot }))
      }
    },
    schedules: {
      list: async () => q(`SELECT id, name, prompt, frequency, time_of_day, run_on_device, notify, new_chat_each_run, model, effort, agent_key, enabled,
        created_at::text AS created_at, COALESCE(last_fired_at::text,'') AS last_fired_at, COALESCE(next_fire_at::text,'') AS next_fire_at FROM schedules ORDER BY id`)
    },
    triggers: {
      list: async (agentKey) => (await q(`SELECT id, agent_key, enabled, interval_sec, on_finding, on_goal_met, on_task_timeout, on_tool_call, on_task_create,
        interval_message, finding_message, goal_message, task_timeout_message, tool_call_message, task_create_message, tool_names,
        COALESCE(last_fire::text,'') AS last_fire FROM agent_triggers WHERE agent_key=$1 ORDER BY id`, [agentKey]))
    },
    coverage: async (taskId) => {
      const [task] = await q('SELECT exploration_id FROM tasks WHERE id = $1', [taskId])
      if (!task) return { scope_rows: 0, denominator: 0, tested: 0, pct: null, by_type: [] }
      const [scope] = await q(`SELECT count(*)::int AS n FROM task_scope ts JOIN (SELECT $1::bigint AS task_id UNION ALL SELECT source_task_id FROM task_relations WHERE task_id=$1) ctx ON ctx.task_id=ts.task_id`, [taskId])
      const rows = await q(`WITH context_tasks AS (
        SELECT t.id AS task_id, t.exploration_id FROM tasks t WHERE t.id=$1 AND t.deleted_at IS NULL
        UNION ALL
        SELECT source.id, source.exploration_id FROM task_relations relation
        JOIN tasks source ON source.id=relation.source_task_id AND source.deleted_at IS NULL WHERE relation.task_id=$1),
        target AS (
          SELECT DISTINCT a.id, a.type FROM assets a JOIN task_scope ts ON (
            (ts.kind='company' AND a.company_id = ts.company_id)
            OR (ts.kind='root_domain' AND a.root_domain = ts.domain)
            OR (ts.kind='subdomain' AND a.domain = ts.domain)
            OR (ts.kind IN ('ip','cidr') AND ts.net >>= try_inet(a.ip))
            OR (ts.kind='icp' AND (lower(regexp_replace(COALESCE(a.icp,''), '[[:space:]]+', '', 'g')) = ts.value
              OR lower(regexp_replace(COALESCE(a.app_icp,''), '[[:space:]]+', '', 'g')) = ts.value)))
          JOIN context_tasks ctx ON ctx.task_id=ts.task_id
          UNION
          SELECT a.id, a.type FROM assets a
          JOIN exploration_anchors ea ON ea.asset_id=a.id
          JOIN exploration_nodes en ON en.id=ea.node_id
          JOIN context_tasks ctx ON ctx.exploration_id=en.exploration_id),
        tested AS (
          SELECT DISTINCT ea.asset_id FROM exploration_anchors ea
          JOIN exploration_nodes en ON en.id=ea.node_id AND en.kind='fact'
          JOIN context_tasks ctx ON ctx.exploration_id=en.exploration_id)
        SELECT t.type, count(*)::int AS total, count(*) FILTER (WHERE t.id IN (SELECT asset_id FROM tested))::int AS tested
        FROM target t GROUP BY t.type ORDER BY t.type`, [taskId])
      const denominator = rows.reduce((sum, row) => sum + Number(row.total), 0)
      const tested = rows.reduce((sum, row) => sum + Number(row.tested), 0)
      return { scope_rows: Number(scope.n), denominator, tested, pct: denominator > 0 ? tested / denominator : null,
        by_type: rows.map((row) => ({ type: row.type, total: Number(row.total), tested: Number(row.tested) })) }
    },
    constraints: {
      list: async (taskId) => {
        const [task] = await q('SELECT exploration_id FROM tasks WHERE id = $1', [taskId])
        if (!task) return []
        return q("SELECT id, kind, text, COALESCE(origin,'') AS origin, created_at::text AS created_at FROM task_constraints WHERE exploration_id = $1 ORDER BY (kind='deny'), id", [task.exploration_id])
      }
    },
    activity: {
      history: async ({ taskId, session = '', before = 0, limit = 200 }) => {
        const [task] = await q('SELECT exploration_id FROM tasks WHERE id = $1', [taskId])
        if (!task) return { items: [], snapshot: 0, hasMore: false }
        const [max] = await q('SELECT coalesce(max(id),0)::bigint AS n FROM activity WHERE exploration_id = $1', [task.exploration_id])
        const filters = ['exploration_id = $1']
        const values: unknown[] = [task.exploration_id, limit + 1]
        if (session.startsWith('intent:')) { values.push(Number(session.slice(7))); filters.push(`node_id = $${values.length}`) }
        else if (session === 'plan') filters.push("worker = 'planner'")
        else {
          filters.push("worker = 'mainagent'")
          if (session.startsWith('main:')) { values.push(Number(session.slice(5))); filters.push(`coalesce(main_seg,0) = $${values.length}`) }
        }
        if (before) { values.push(before); filters.push(`id < $${values.length}`) }
        const rows = await q(`SELECT id, node_id, worker, kind, tool, tool_use_id, is_error, summary, metadata,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, main_seg,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') || to_char(created_at, 'OF') || ':00' AS created_at
          FROM activity WHERE ${filters.join(' AND ')} ORDER BY id DESC LIMIT $2`, values)
        return { items: rows.slice(0, limit).reverse(), snapshot: Number(max.n), hasMore: rows.length > limit }
      },
      // Cross-task feed for whole-station surfaces. Same column list as
      // `history`, so one DTO serves both routes; a taskId narrows it.
      recent: async ({ taskId = '', before = 0, limit = 200 } = {}) => {
        const capped = Math.min(Math.max(Number(limit) || 200, 1), 500)
        const filters: string[] = []
        const values: unknown[] = [capped + 1]
        if (taskId !== '') {
          const [task] = await q('SELECT exploration_id FROM tasks WHERE id = $1', [taskId])
          if (!task) return { items: [], snapshot: 0, hasMore: false }
          values.push(task.exploration_id)
          filters.push(`exploration_id = $${values.length}`)
        }
        if (before) { values.push(before); filters.push(`id < $${values.length}`) }
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
        const rows = await q(`SELECT id, node_id, worker, kind, tool, tool_use_id, is_error, summary, metadata,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, main_seg,
          to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') || to_char(created_at, 'OF') || ':00' AS created_at
          FROM activity ${where} ORDER BY id DESC LIMIT $1`, values)
        const [max] = await q(`SELECT coalesce(max(id),0)::bigint AS n FROM activity ${where}`, values.slice(1))
        return { items: rows.slice(0, capped).reverse(), snapshot: Number(max?.n ?? 0), hasMore: rows.length > capped }
      },
      dailyTokens: async (days) => {
        const rows = await q(`SELECT TO_CHAR(DATE_TRUNC('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
          COALESCE(SUM(input_tokens),0)::bigint AS input_tokens,
          COALESCE(SUM(output_tokens),0)::bigint AS output_tokens,
          COALESCE(SUM(cache_read_tokens),0)::bigint AS cache_read_tokens
          FROM activity WHERE kind='result' AND created_at >= NOW() - ($1 * INTERVAL '1 day')
          GROUP BY day ORDER BY day`, [Math.max(Number(days) || 30, 1)])
        return rows.map((row) => ({ day: row.day, input_tokens: Number(row.input_tokens), output_tokens: Number(row.output_tokens), cache_read_tokens: Number(row.cache_read_tokens) }))
      },
      tokenStats: async (taskId) => {
        const [task] = await q('SELECT exploration_id FROM tasks WHERE id = $1', [taskId])
        if (!task) return { workers: [], sessions: [], total: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 } }
        const workers = await q(`SELECT COALESCE(worker,'') AS worker,
          COALESCE(SUM(input_tokens),0)::bigint AS input_tokens,
          COALESCE(SUM(output_tokens),0)::bigint AS output_tokens,
          COALESCE(SUM(cache_read_tokens),0)::bigint AS cache_read_tokens,
          COALESCE(SUM(cache_write_tokens),0)::bigint AS cache_write_tokens
          FROM activity WHERE exploration_id = $1 AND kind = 'result' GROUP BY worker ORDER BY worker`, [task.exploration_id])
        const total = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }
        for (const row of workers) for (const key of Object.keys(total) as (keyof typeof total)[]) total[key] += Number(row[key])
        const sessions = await q(`SELECT CASE
            WHEN COALESCE(a.worker,'')='mainagent' THEN 'main:' || COALESCE(a.main_seg,0)::text
            WHEN COALESCE(a.worker,'')='planner' THEN 'plan'
            WHEN n.id IS NOT NULL THEN 'intent:' || n.id::text
            ELSE '' END AS session,
          COALESCE(SUM(a.input_tokens),0)::bigint AS input_tokens,
          COALESCE(SUM(a.output_tokens),0)::bigint AS output_tokens,
          COALESCE(SUM(a.cache_read_tokens),0)::bigint AS cache_read_tokens,
          COALESCE(SUM(a.cache_write_tokens),0)::bigint AS cache_write_tokens
          FROM activity a LEFT JOIN exploration_nodes n ON n.id=a.node_id AND n.exploration_id=a.exploration_id AND n.kind='intent'
          WHERE a.exploration_id=$1 AND a.kind='result' AND (COALESCE(a.worker,'') IN ('mainagent','planner') OR n.id IS NOT NULL)
          GROUP BY session ORDER BY session`, [task.exploration_id])
        return { workers: workers.map((row) => ({ ...row, input_tokens: Number(row.input_tokens), output_tokens: Number(row.output_tokens), cache_read_tokens: Number(row.cache_read_tokens), cache_write_tokens: Number(row.cache_write_tokens) })), sessions: sessions.map((row) => ({ ...row, input_tokens: Number(row.input_tokens), output_tokens: Number(row.output_tokens), cache_read_tokens: Number(row.cache_read_tokens), cache_write_tokens: Number(row.cache_write_tokens) })), total }
      }
    },
    async taskMetrics() {
      const rows = await q(`
        SELECT task.exploration_id,
          COALESCE(token_metrics.input_tokens,0)::bigint AS input_tokens,
          COALESCE(token_metrics.output_tokens,0)::bigint AS output_tokens,
          COALESCE(token_metrics.cache_read_tokens,0)::bigint AS cache_read_tokens,
          COALESCE(token_metrics.cache_write_tokens,0)::bigint AS cache_write_tokens,
          COALESCE(latest_activity.created_at,0)::bigint AS last_activity_unix,
          COALESCE(goal_metrics.total,0)::int AS goals_total,
          COALESCE(goal_metrics.met,0)::int AS goals_met,
          COALESCE(intent_metrics.running,0)::int AS in_flight,
          COALESCE(finding_metrics.critical,0)::int AS critical,
          COALESCE(finding_metrics.high,0)::int AS high,
          COALESCE(finding_metrics.medium,0)::int AS medium,
          COALESCE(finding_metrics.low,0)::int AS low
        FROM tasks task
        LEFT JOIN LATERAL (
          SELECT SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
                 SUM(cache_read_tokens) AS cache_read_tokens, SUM(cache_write_tokens) AS cache_write_tokens
          FROM activity WHERE exploration_id = task.exploration_id AND kind = 'result'
        ) token_metrics ON true
        LEFT JOIN LATERAL (
          SELECT EXTRACT(EPOCH FROM created_at)::bigint AS created_at FROM activity
          WHERE exploration_id = task.exploration_id ORDER BY created_at DESC LIMIT 1
        ) latest_activity ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE state = 'met') AS met
          FROM exploration_nodes WHERE exploration_id = task.exploration_id AND kind = 'goal'
        ) goal_metrics ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS running FROM exploration_nodes
          WHERE exploration_id = task.exploration_id AND kind = 'intent' AND state = 'running'
        ) intent_metrics ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) FILTER (WHERE severity = 'critical') AS critical,
                 COUNT(*) FILTER (WHERE severity = 'high') AS high,
                 COUNT(*) FILTER (WHERE severity = 'medium') AS medium,
                 COUNT(*) FILTER (WHERE severity = 'low') AS low
          FROM findings WHERE task_id = task.id
        ) finding_metrics ON true
        WHERE task.deleted_at IS NULL`)
      const out = new Map<number, any>()
      for (const row of rows) {
        out.set(Number(row.exploration_id), {
          input_tokens: Number(row.input_tokens), output_tokens: Number(row.output_tokens),
          cache_read_tokens: Number(row.cache_read_tokens), cache_write_tokens: Number(row.cache_write_tokens),
          last_activity_unix: Number(row.last_activity_unix),
          goals_total: Number(row.goals_total), goals_met: Number(row.goals_met), in_flight: Number(row.in_flight),
          findings: { critical: Number(row.critical), high: Number(row.high), medium: Number(row.medium), low: Number(row.low) }
        })
      }
      return out
    },
    nodes: {
      page: async ({ taskId, page, size, order = 'desc', kinds = [], states = [], before }) => {
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
        if (before) {
          values.push(Number(before))
          filters.push(`id < $${values.length}`)
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
          ? await q('SELECT exploration_id, src_id::text AS src, dst_id::text AS dst, rel FROM exploration_edges WHERE exploration_id = $2 AND (src_id = ANY($1::bigint[]) OR dst_id = ANY($1::bigint[]))', [ids, task.exploration_id])
          : []
        return { items, total: Number(count.n), edges }
      }
    },
    async edges(explorationId) {
      return q('SELECT src_id::text AS src, dst_id::text AS dst, rel FROM exploration_edges WHERE exploration_id = $1', [explorationId])
    }
  }
}
