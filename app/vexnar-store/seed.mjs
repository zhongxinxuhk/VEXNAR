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
const nodes = (await pg.nodes.page({ taskId: '0', page: 1, size: 1 })).items // shape probe only
void nodes

// Nodes and edges are exported per exploration in one pass through SQL.
const allNodes = await pg.pool.query(`SELECT id::text AS id, exploration_id, kind, state, payload, priority, origin,
  to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') || to_char(created_at, 'OF') AS created_at
  FROM exploration_nodes ORDER BY id`)
const allEdges = await pg.pool.query('SELECT src_id::text AS src, dst_id::text AS dst, rel FROM exploration_edges')

for (const [name, rows] of [
  ['tasks', tasks],
  ['findings', findings],
  ['assets', assets],
  ['nodes', allNodes.rows],
  ['edges', allEdges.rows]
]) {
  await writeFile(join(root, `${name}.json`), `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600 })
  console.log(`${name}: ${rows.length}`)
}
console.log(`store: ${root}`)
await pg.pool.end()
