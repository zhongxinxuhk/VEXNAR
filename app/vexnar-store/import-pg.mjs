// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pgStore } from './src/pg-store.ts'
import { openWriter, openMeta, dbPath } from './src/backend.ts'

/**
 * Import an existing PostgreSQL deployment into the SQLite store.
 * One-time migration: read every domain table from PG and write it into the
 * single `vexnar.sqlite` kv/meta schema. PG is read-only here.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const cfg = JSON.parse(readFileSync(join(repo, 'config.json'), 'utf8')).database

const pg = pgStore({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.dbname, ssl: false })
await pg.init()
const writer = openWriter()
const meta = openMeta()

const numericKey = (row: any, field = 'id') => String(row[field])
const putAll = async (table: string, rows: any[], keyOf = numericKey) => {
  let n = 0
  for (const row of rows) {
    const key = keyOf(row)
    if (!key) continue
    await writer.put({ table, key, record: row })
    n += 1
  }
  console.log(`  ${table}: ${n}`)
}

console.log(`importing into ${dbPath()}`)

// Domain tables (keyed by id unless noted).
const q = (sql: string) => pg.pool.query(sql)

putAll('tasks', await pg.tasks.list())
putAll('findings', await pg.findings.list(100000))
putAll('assets', (await q(`SELECT id, type, company_id, task_ids, domain, root_domain, ip, c_segment, port, icp, bound_domains, open_ports, record_type, record_value, bundle_id, app_name, category, app_description, app_icp, url, service_type, service_name, favicon_mmh3, status_code, content_length, page_title, technologies, auth, method, params, extra, last_seen::text AS last_seen FROM assets`)).rows.map((r) => ({ ...r, task_ids: (r.task_ids ?? []).map(Number), company_id: r.company_id == null ? null : Number(r.company_id) })))
putAll('companies', (await pg.companies.list()))
putAll('task_scope', (await q("SELECT id, task_id, kind, company_id, COALESCE(domain,'') AS domain, COALESCE(net::text,'') AS net, COALESCE(value,'') AS value, COALESCE(source,'manual') AS source, COALESCE(reason,'') AS reason FROM task_scope")).rows)
putAll('task_relations', (await q('SELECT task_id, source_task_id FROM task_relations')).rows, (r) => `${r.task_id}-${r.source_task_id}`)
putAll('task_asset_links', (await q('SELECT task_id, asset_id, source, source_summary, source_node_id, created_at::text AS created_at FROM task_asset_links')).rows, (r) => `${r.task_id}-${r.asset_id}`)
putAll('anchors', (await q('SELECT node_id, asset_id FROM exploration_anchors')).rows, (r) => `${r.node_id}-${r.asset_id}`)
putAll('nodes', (await q(`SELECT id::text AS id, exploration_id, kind, state, payload, priority, origin, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') || to_char(created_at, 'OF') || ':00' AS created_at FROM exploration_nodes ORDER BY id`)).rows)
putAll('edges', (await q('SELECT exploration_id, src_id::text AS src, dst_id::text AS dst, rel FROM exploration_edges')).rows, (r) => `${r.src}-${r.rel}-${r.dst}`)
putAll('activity', (await q(`SELECT id::text AS id, exploration_id, node_id, worker, kind, tool, tool_use_id, is_error, summary, metadata, main_seg, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') || to_char(created_at, 'OF') || ':00' AS created_at, extract(epoch from created_at)::bigint AS created_unix FROM activity`)).rows)
putAll('constraints', (await q(`SELECT id, exploration_id, kind, text, COALESCE(origin,'') AS origin, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') || to_char(created_at, 'OF') || ':00' AS created_at FROM task_constraints`)).rows)
putAll('traffic_evidence_snapshots', (await q('SELECT id, to_jsonb(s) AS snapshot FROM traffic_evidence_snapshots s')).rows.map((r) => ({ id: r.id, snapshot: r.snapshot })))
putAll('finding_traffic_bindings', (await q(`SELECT id, finding_id, snapshot_id, role, note, position, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') || to_char(created_at, 'OF') || ':00' AS created_at FROM finding_traffic_bindings`)).rows)
putAll('schedules', (await q(`SELECT id, name, prompt, frequency, time_of_day, run_on_device, notify, new_chat_each_run, model, effort, agent_key, enabled, created_at::text AS created_at, COALESCE(last_fired_at::text,'') AS last_fired_at, COALESCE(next_fire_at::text,'') AS next_fire_at FROM schedules`)).rows)
putAll('agent_triggers', (await q(`SELECT id, agent_key, enabled, interval_sec, on_finding, on_goal_met, on_task_timeout, on_tool_call, on_task_create, interval_message, finding_message, goal_message, task_timeout_message, tool_call_message, task_create_message, tool_names, COALESCE(last_fire::text,'') AS last_fire FROM agent_triggers`)).rows)

// Meta domain (low-churn configuration).
const metaTables: Record<string, string> = {
  agents: 'SELECT * FROM agents',
  tools: 'SELECT * FROM tools',
  mcp: 'SELECT * FROM mcp_servers',
  notify: 'SELECT * FROM notification_channels',
  llmProfiles: 'SELECT * FROM llm_profiles',
  taskCategories: 'SELECT * FROM task_categories',
  taskTemplates: 'SELECT * FROM task_templates',
  settings: `SELECT key, value FROM settings`
}
const next: Record<string, any[]> = {}
for (const [name, sql] of Object.entries(metaTables)) {
  next[name] = (await q(sql)).rows
  console.log(`  meta:${name}: ${next[name].length}`)
}
await meta.save(next)

await pg.pool.end()
console.log('done')
