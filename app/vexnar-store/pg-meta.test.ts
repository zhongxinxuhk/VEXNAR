// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * PostgreSQL 配置域（agents / tools / MCP / settings）的契约测试。
 *
 * 这几张表把 dsh 客户端的“系统状态”与 `web/` 控制台接到同一份行上，所以断言
 * 三件事：形状与 Go 的 JSON 一致（布尔/enabled 可计数）、密钥不出网、没有
 * PostgreSQL 对应表的本地状态（trafficCaptures）仍走本地兜底。
 *
 * 需要一个可连的 PostgreSQL；连不上就跳过，而不是让整包测试变红。
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MetaStore } from './src/meta-store.ts'

/** A configuration row as the adapter hands it over: shape is per table. */
type Row = Record<string, unknown>
/** One assertion result, printed as PASS/FAIL at the end. */
type CheckResult = { name: string; ok: boolean; detail: string }

const here = dirname(fileURLToPath(import.meta.url))
const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`, detail)
}

function connection() {
  const dsn = process.env.VEXNAR_TEST_PG_DSN?.trim()
  if (dsn) {
    const parsed = new URL(dsn)
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 5432),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, '') || 'postgres',
      ssl: parsed.searchParams.get('sslmode') !== 'disable'
    }
  }
  try {
    const cfg = JSON.parse(readFileSync(join(here, '..', '..', 'config.json'), 'utf8')).database
    if (!cfg?.host || !cfg?.dbname) return null
    return {
      host: cfg.host,
      port: Number(cfg.port ?? 5432),
      user: cfg.user,
      password: cfg.password,
      database: cfg.dbname,
      ssl: cfg.sslmode !== 'disable'
    }
  } catch {
    return null
  }
}

const target = connection()
const { pgMetaStore } = await import('./src/pg-meta.ts')

if (target === null) {
  console.log('[SKIP] 没有可用的 PostgreSQL 连接（设 VEXNAR_TEST_PG_DSN 或 config.json）')
  process.exit(0)
}

// Minimal stand-in for the local SQLite meta store: the adapter must hand every
// table it does not map straight through.
const local: Map<string, Row[] | Record<string, unknown>> = new Map([['trafficCaptures', [{ scope: 'conv-1', source: 'yakit', started_at: 1, stopped_at: 0 }]]])
const fallback: MetaStore = {
  backend: 'sqlite',
  async load() {
    return Object.fromEntries(local)
  },
  reload() {},
  async table<T = Row[]>(name: string): Promise<T> {
    return (local.get(name) ?? []) as T
  },
  async save(next) {
    for (const [name, rows] of Object.entries(next)) local.set(name, rows)
  }
}

const meta = pgMetaStore(target, fallback)

const agents = await meta.table<Row[]>('agents')
check('agents 非空', Array.isArray(agents) && agents.length > 0, `n=${agents.length}`)
check('agent 形状与 Go 一致', agents.every((row) => typeof row.key === 'string' && typeof row.enabled === 'boolean'))
check('agent 可计数启用数', agents.filter((row) => row.enabled !== false).length === agents.length)

const tools = await meta.table<Row[]>('tools')
check('tools 非空', Array.isArray(tools) && tools.length > 0, `n=${tools.length}`)
check('tool.schema 是对象', tools.every((row) => row.schema !== null && typeof row.schema === 'object'))
check('tool.agents 是数组', tools.every((row) => Array.isArray(row.agents)))

const mcp = await meta.table<Row[]>('mcp')
check('mcp 非空', Array.isArray(mcp) && mcp.length > 0, `n=${mcp.length}`)
check('mcp.args/env/tools 是数组或对象', mcp.every((row) => Array.isArray(row.args) && typeof row.env === 'object' && Array.isArray(row.tools)))

const profiles = await meta.table<Row[]>('llmProfiles')
check('llmProfiles 去掉 api_key', profiles.every((row) => !('api_key' in row)))
check('llmProfiles 带 api_key_hint', profiles.every((row) => 'api_key_hint' in row))

const settings = await meta.table<Row>('settings')
check('settings 是扁平对象', settings !== null && typeof settings === 'object' && !Array.isArray(settings))
check('settings 不含 password', !Object.keys(settings).some((key) => /password/i.test(key)))
check('settings 不含密钥', !Object.keys(settings).some((key) => /(secret|credential|api_?key|(^|_)token)/i.test(key)))

const captures = await meta.table<Row[]>('trafficCaptures')
check('本地表走兜底', Array.isArray(captures) && captures[0]?.scope === 'conv-1', JSON.stringify(captures[0] ?? null))

const loaded = await meta.load()
check('load 合并 PG + 本地', 'agents' in loaded && 'settings' in loaded && 'trafficCaptures' in loaded)

// A settings write must be a partial upsert: the sensitive rows this adapter
// never returns have to survive a save of the filtered object.
await meta.save({ settings: { ...settings } })
const settingsAfter = await meta.table<Row>('settings')
check('设置回写后键数不缩水', Object.keys(settingsAfter).length === Object.keys(settings).length)

const failed = results.filter((item) => !item.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
if (failed > 0) process.exit(1)
