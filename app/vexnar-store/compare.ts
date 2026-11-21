// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pgStore } from './src/pg-store.ts'
import { jsonStore } from './src/json-store.ts'

/** One comparison result: a name, pass/fail, and a printable difference. */
type CheckResult = { name: string; ok: boolean; detail: string }

const here = dirname(fileURLToPath(import.meta.url))
const cfg = JSON.parse(readFileSync(join(here, '..', '..', 'config.json'), 'utf8')).database
const root = process.env.VEXNAR_STORE_ROOT || join(process.env.DSH_HOME || join(process.env.HOME!, '.dsh'), 'vexnar', 'store')

const pg = pgStore({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.dbname, ssl: false })
const json = jsonStore(root)
await json.init()

/** The paginated node listing both stores answer with. */
type NodesPage = Awaited<ReturnType<typeof json.nodes.page>>

const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail })
/** Key order is an implementation detail of both backends, so sort it away. */
const canon = (value: unknown): unknown => Array.isArray(value) ? value.map(canon) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canon((value as Record<string, unknown>)[key])]))
  : value
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))
function diff(left: unknown, right: unknown, path = ''): string[] {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return [`${path}.length ${left.length}/${right.length}`]
    for (let i = 0; i < left.length; i++) { const d = diff(left[i], right[i], `${path}[${i}]`); if (d.length) return d }
    return []
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const l = left as Record<string, unknown>
    const r = right as Record<string, unknown>
    for (const key of new Set([...Object.keys(l), ...Object.keys(r)])) {
      const d = diff(l[key], r[key], `${path}.${key}`)
      if (d.length) return d
    }
    return []
  }
  return JSON.stringify(left) === JSON.stringify(right) ? [] : [`${path}: ${JSON.stringify(left)} vs ${JSON.stringify(right)}`]
}

const pgTasks = await pg.tasks.list()
const jsonTasks = await json.tasks.list()
check('tasks row count', pgTasks.length === jsonTasks.length, `${pgTasks.length} vs ${jsonTasks.length}`)
check('tasks sample equal', same(pgTasks.slice(0, 20), jsonTasks.slice(0, 20)), JSON.stringify(diff(canon(pgTasks.slice(0,20)), canon(jsonTasks.slice(0,20))).slice(0,2)))

const pgFindings = await pg.findings.list(500)
const jsonFindings = await json.findings.list(500)
check('findings sample equal', same(pgFindings, jsonFindings))

const pgAssets = await pg.assets.list({ limit: 300 })
const jsonAssets = await json.assets.list({ limit: 300 })
check('assets sample equal', same(pgAssets, jsonAssets))

const [busiest] = (await pg.pool.query(`SELECT t.id::text AS id FROM tasks t JOIN exploration_nodes n ON n.exploration_id = t.exploration_id GROUP BY t.id ORDER BY count(*) DESC LIMIT 1`)).rows
if (busiest) {
  const a = await pg.nodes.page({ taskId: busiest.id, page: 1, size: 100, order: 'asc' })
  const b = await json.nodes.page({ taskId: busiest.id, page: 1, size: 100, order: 'asc' })
  const sortEdges = (rows: NodesPage['edges']) => [...rows].sort((x, y) => `${x.src}>${x.dst}:${x.rel}`.localeCompare(`${y.src}>${y.dst}:${y.rel}`))
  const norm = (page: NodesPage) => ({ ...page, edges: sortEdges(page.edges) })
  check('nodes page equal', same(norm(a), norm(b)), `${busiest.id} ${JSON.stringify(diff(canon(norm(a)), canon(norm(b))).slice(0,2))}`)
}

const pgCompanies = await pg.companies.list()
const jsonCompanies = await json.companies.list()
check('companies equal', same(pgCompanies, jsonCompanies), JSON.stringify(diff(canon(pgCompanies), canon(jsonCompanies)).slice(0,2)))

const pgStats = await pg.findings.stats()
const jsonStats = await json.findings.stats()
check('findings stats equal', same(pgStats, jsonStats))

let failed = false
for (const item of results) { if (!item.ok) failed = true; console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`) }
await pg.pool.end()
process.exit(failed ? 1 : 0)
