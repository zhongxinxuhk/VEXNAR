// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Import an existing PostgreSQL deployment into the dsh-style JSON store.
 * The PG adapter is read-only here; nothing is written back to PostgreSQL.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pgStore } from './src/pg-store.ts'
import { jsonStore } from './src/json-store.ts'
import { metaStore } from './src/meta-store.ts'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const cfg = JSON.parse(readFileSync(join(repo, 'config.json'), 'utf8')).database
const root = process.env.VEXNAR_STORE_ROOT || join(process.env.DSH_HOME || join(process.env.HOME, '.dsh'), 'vexnar', 'store')

const pg = pgStore({
  host: cfg.host,
  port: cfg.port,
  user: cfg.user,
  password: cfg.password,
  database: cfg.dbname,
  ssl: false
})
const json = jsonStore(root)
await json.init()
await mkdir(root, { recursive: true, mode: 0o700 })

const tasks = await pg.tasks.list()
const findings = await pg.findings.list(100000)
const assets = (await pg.assets.list({ limit: 100000 })).rows
const companies = await pg.companies.list()
const nodes = (await pg.nodes.page({ taskId: '0', page: 1, size: 1 })).items // shape probe only
void nodes

// Nodes and edges are exported per exploration in one pass through SQL.
const allNodes = await pg.pool.query(`SELECT id::text AS id, exploration_id, kind, state, payload, priority, origin,
  to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') || to_char(created_at, 'OF') || ':00' AS created_at
  FROM exploration_nodes ORDER BY id`)
const allEdges = await pg.pool.query('SELECT exploration_id, src_id::text AS src, dst_id::text AS dst, rel FROM exploration_edges')

for (const [name, rows] of [
  ['tasks', tasks],
  ['findings', findings],
  ['assets', assets],
  ['companies', companies],
  ['nodes', allNodes.rows],
  ['edges', allEdges.rows]
]) {
  await writeFile(join(root, `${name}.json`), `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600 })
  console.log(`${name}: ${rows.length}`)
}

// ── vexnar-meta（single layout）─────────────────────────────────────────────
const meta = metaStore(root)
const metaTables = {}

const agents = await pg.pool.query(`SELECT id::text AS id, key, name, description, role, builtin, enabled,
  max_turns, run_seconds, web_search, interactive_shell, llm_profile_id,
  trigger_run_mode, trigger_merge_mode, trigger_max_parallel FROM agents ORDER BY agents.id`)
metaTables.agents = agents.rows.map((row) => ({ ...row, mcp_count: 0, skill_count: 0, tool_count: 0 }))

const toolCounts = await pg.pool.query('SELECT tool_key, count(*)::int AS n FROM tool_usage GROUP BY tool_key')
const calls = Object.fromEntries(toolCounts.rows.map((row) => [row.tool_key, Number(row.n)]))
const tools = await pg.pool.query('SELECT key, system, description, schema, agents, enabled, kind, exec, deferred FROM tools ORDER BY key')
metaTables.tools = tools.rows.map((row) => ({ ...row, calls: calls[row.key] ?? 0 }))

const mcp = await pg.pool.query('SELECT id, name, transport, command, args, env, url, enabled, insecure FROM mcp_servers ORDER BY id')
metaTables.mcp = mcp.rows.map((row) => ({
  id: Number(row.id), name: row.name, transport: row.transport,
  ...(row.command == null ? {} : { command: row.command }),
  args: row.args ?? [], env: row.env ?? {},
  ...(row.url == null ? {} : { url: row.url }),
  enabled: row.enabled, insecure: row.insecure, tools: []
}))

const notify = await pg.pool.query('SELECT id, name, kind, enabled, config, mode, filter, rate_per_min FROM notification_channels ORDER BY id')
metaTables.notify = notify.rows.map((row) => ({ ...row, id: Number(row.id) }))

const profiles = await pg.pool.query(`SELECT id::text AS id, name, format, base_url, model, api_key_hint,
  rate_per_second, rate_per_minute, context_window_k, thinking_type, reasoning_effort, is_default, priority,
  pool_exclude, streaming, max_tokens, max_tokens_field, session_header_key,
  retry_connect_attempts, retry_connect_interval_ms, retry_empty_attempts, retry_empty_interval_ms,
  retry_stream_attempts, retry_stream_interval_ms FROM llm_profiles ORDER BY llm_profiles.id`)
metaTables.llmProfiles = profiles.rows.map((row) => ({
  ...row,
  retry: {
    connect: { attempts: row.retry_connect_attempts, interval_ms: row.retry_connect_interval_ms },
    empty: { attempts: row.retry_empty_attempts, interval_ms: row.retry_empty_interval_ms },
    stream: { attempts: row.retry_stream_attempts, interval_ms: row.retry_stream_interval_ms }
  }
}))

const rfc = (col) => `to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.US') || to_char(${col}, 'OF') || ':00'`
const categories = await pg.pool.query(`SELECT c.id, c.name,
  (SELECT count(*)::int FROM tasks t WHERE t.category_id = c.id) AS task_count FROM task_categories c ORDER BY c.id`)
metaTables.taskCategories = categories.rows

const templates = await pg.pool.query(`SELECT id, name, description, goal, category_id, intercept_rules,
  ${rfc('created_at')} AS created_at, ${rfc('updated_at')} AS updated_at FROM task_templates ORDER BY updated_at DESC, id DESC`)
metaTables.taskTemplates = templates.rows

const settingRows = await pg.pool.query('SELECT key, value FROM settings')
const stored = new Map(settingRows.rows.map((row) => [row.key, row.value]))
const defaults = {
  traffic_capture: false, agent_traffic_binding: false, llm_record: false, web_search_enabled: false,
  web_search_backend: 'ddgs', brave_key_set: false, tavily_key_set: false, web_search_proxy: '', global_proxy: '',
  python_interpreter: '', workers: 3, task_concurrency_enabled: false, task_concurrency_limit: 5,
  llm_pool_enabled: false, llm_pool_bind_fallback: false, constraints_inject_planner: false,
  constraints_inject_worker: false, noa_compaction: false, finding_auto_verify: false, notify_enabled: true,
  notify_public_base_url: '', notify_digest_interval_min: 30
}
const bools = new Set(['traffic_capture','agent_traffic_binding','llm_record','web_search_enabled','brave_key_set','tavily_key_set','task_concurrency_enabled','llm_pool_enabled','llm_pool_bind_fallback','constraints_inject_planner','constraints_inject_worker','noa_compaction','finding_auto_verify','notify_enabled'])
const ints = new Set(['workers','task_concurrency_limit','notify_digest_interval_min'])
const settings = {}
for (const [key, fallback] of Object.entries(defaults)) {
  const raw = stored.get(key)
  settings[key] = raw === undefined ? fallback : bools.has(key) ? raw === 'true' : ints.has(key) ? Number(raw) : raw
}
metaTables.settings = settings

await meta.save(metaTables)
console.log(`meta: ${Object.keys(metaTables).map((key) => `${key}=${Array.isArray(metaTables[key]) ? metaTables[key].length : 'obj'}`).join(' ')}`)

console.log(`store: ${root}`)
await pg.pool.end()
