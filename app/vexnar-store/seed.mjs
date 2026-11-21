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
import { clearPerRecord, writePerRecord } from './src/per-record.ts'
import { rm } from 'node:fs/promises'

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
const assets = (await pg.pool.query(`SELECT id, type, company_id, task_ids, domain, root_domain, ip, c_segment, port, icp,
  bound_domains, open_ports, record_type, record_value, bundle_id, app_name, category, app_description, app_icp,
  url, service_type, service_name, favicon_mmh3, status_code, content_length, page_title, technologies, auth, method, params, extra,
  last_seen::text AS last_seen FROM assets`)).rows.map((row) => ({ ...row, task_ids: (row.task_ids ?? []).map(Number), company_id: row.company_id == null ? null : Number(row.company_id) }))
const companies = await pg.companies.list()
const assetLinks = (await pg.pool.query('SELECT task_id, asset_id, source, source_summary, source_node_id, created_at::text AS created_at FROM task_asset_links')).rows
const activity = (await pg.pool.query(`SELECT id::text AS id, exploration_id, node_id, worker, kind, tool, tool_use_id, is_error, summary, metadata, main_seg, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') || to_char(created_at, 'OF') || ':00' AS created_at, extract(epoch from created_at)::bigint AS created_unix FROM activity`)).rows
const nodes = (await pg.nodes.page({ taskId: '0', page: 1, size: 1 })).items // shape probe only
void nodes

// Nodes and edges are exported per exploration in one pass through SQL.
const allNodes = await pg.pool.query(`SELECT id::text AS id, exploration_id, kind, state, payload, priority, origin,
  to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') || to_char(created_at, 'OF') || ':00' AS created_at
  FROM exploration_nodes ORDER BY id`)
const allEdges = await pg.pool.query('SELECT exploration_id, src_id::text AS src, dst_id::text AS dst, rel FROM exploration_edges')

const tables = [
  ['tasks', tasks, (row) => String(row.id)],
  ['findings', findings, (row) => String(row.id)],
  ['assets', assets, (row) => String(row.id)],
  ['companies', companies, (row, index) => `${String(index).padStart(4, '0')}-${row.id}`],
  ['nodes', allNodes.rows, (row) => String(row.id)],
  ['activity', activity, (row) => String(row.id)],
  ['task_asset_links', assetLinks, (row) => `${row.task_id}-${row.asset_id}`],
  ['edges', allEdges.rows, (row) => `${row.src}-${row.rel}-${row.dst}`]
]
for (const [name, rows, keyOf] of tables) {
  await clearPerRecord(root, name)
  await rm(`${root}/${name}.json`, { force: true })
  await writePerRecord(root, name, rows.map((row, index) => ({ key: keyOf(row, index), record: row })))
  console.log(`${name}: ${rows.length} (per-record)`)
}

console.log(`store: ${root}`)
await pg.pool.end()
