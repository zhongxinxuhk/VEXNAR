// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 临时 SQLite 根目录必须在 import 模块（其顶层会 openStore/openMeta）之前设置。
const root = await mkdtemp(join(tmpdir(), 'vexnar-seed-'))
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_STORE_ROOT = root

const { builtinSeedRows, ensureInterceptRulesSeeded } = await import('./src/intercept-seed.ts')
const { meta } = await import('./src/context.ts')
const { Hono } = await import('hono')
const { register } = await import('./src/routes/intercept.ts')

const api = new Hono()
register(api)

/** 拦截规则一行；接口与迁移源共用同一形状。 */
type RuleRow = {
  id: number
  name: string
  enabled: boolean
  priority: number
  match_target: string
  match_type: string
  pattern: string
  action: string
  message?: string
  timeout_enabled: boolean
  timeout_seconds: number
  timeout_action: string
  created_at?: string
  updated_at?: string
}
type RulesBody = { rules: RuleRow[] }
/** 增删改的响应：只声明断言真正读的字段。 */
type MutationBody = {
  id?: number
  name?: string
  enabled?: boolean
  action?: string
  timeout_seconds?: number
  deleted?: number
  error?: unknown
}

type CheckResult = { name: string; ok: boolean; detail: string }
const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail = ''): number => results.push({ name, ok, detail })
const getJson = async <T = RulesBody>(path: string): Promise<T> => (await api.request(path)).json() as T

const pgRow = (over: Partial<RuleRow>) => ({
  id: 1,
  name: '[内置] 递归强制删除 rm -rf',
  enabled: false,
  priority: 100,
  match_target: 'tool_input',
  match_type: 'regex',
  pattern: '(?i)\\brm\\b',
  action: 'deny',
  message: '禁止执行递归强制删除',
  timeout_enabled: false,
  timeout_seconds: 60,
  timeout_action: 'deny',
  created_at: '2026-10-27T18:36:09+08:00',
  updated_at: '2026-11-12T00:52:13+08:00',
  ...over
})

// ── 内置种子本身与 Go 的 20 条同形 ─────────────────────────────────────────
const builtin = builtinSeedRows(new Date('2026-11-22T00:00:00+08:00'))
check('内置种子 20 条', builtin.length === 20, String(builtin.length))
check(
  '启用位与 Go 种子一致（只有数据外泄管道默认关闭）',
  builtin.filter((rule) => rule.enabled).length === 19 && builtin.find((rule) => rule.name.includes('数据外泄'))?.enabled === false,
  JSON.stringify(builtin.map((rule) => [rule.id, rule.enabled]))
)
check('id 从 1 连续，优先级 100/90/80 三档', builtin.every((rule, index) => rule.id === index + 1) && new Set(builtin.map((rule) => rule.priority)).size === 3)
check('全部是 tool_input + regex + deny', builtin.every((rule) => rule.match_target === 'tool_input' && rule.match_type === 'regex' && rule.action === 'deny'))

// ── 迁移：从 PostgreSQL 行原样落地（含启用位与时间戳）─────────────────────
const pgRows = [
  pgRow({ id: 7, name: '[内置] 磁盘擦除 shred / wipe', priority: 100 }),
  pgRow({ id: 19, name: '[内置] 数据外泄管道', priority: 80 }),
  pgRow({ id: 42, name: '我自己的规则', priority: 55, enabled: true, match_type: 'string', pattern: 'example.com' })
]
let outcome = await ensureInterceptRulesSeeded(async () => pgRows)
check('迁移来源 = postgres，条数 3', outcome.seeded === 3 && outcome.source === 'postgres', JSON.stringify(outcome))

let list = await getJson<RulesBody>('/api/intercept/rules')
check('接口按优先级读出迁移结果', list.rules.length === 3 && list.rules[0].id === 7, JSON.stringify(list.rules.map((r) => r.id)))
check(
  '启用/禁用位原样保留（含默认关闭的那条）',
  list.rules.find((rule) => rule.id === 7)?.enabled === false &&
    list.rules.find((rule) => rule.id === 19)?.enabled === false &&
    list.rules.find((rule) => rule.id === 42)?.enabled === true,
  JSON.stringify(list.rules.map((rule) => [rule.id, rule.enabled]))
)
check(
  '名称 / 优先级 / 时间戳一起搬过来',
  list.rules.find((rule) => rule.id === 42)?.name === '我自己的规则' &&
    list.rules.find((rule) => rule.id === 42)?.priority === 55 &&
    list.rules.some((rule) => rule.updated_at === '2026-11-12T00:52:13+08:00'),
  JSON.stringify(list.rules[0])
)

// ── 幂等：再跑一次不重复、不改动已迁移的行 ─────────────────────────────────
outcome = await ensureInterceptRulesSeeded(async () => {
  throw new Error('不该再读 PostgreSQL')
})
list = await getJson<RulesBody>('/api/intercept/rules')
check('二次调用直接跳过', outcome.source === 'done' && outcome.seeded === 0, JSON.stringify(outcome))
check('二次调用没有重复行', list.rules.length === 3, String(list.rules.length))

// ── 迁移后删光规则：不再被重新种回来 ───────────────────────────────────────
for (const rule of list.rules) await api.request(`/api/intercept/rules/${rule.id}`, { method: 'DELETE' })
outcome = await ensureInterceptRulesSeeded(async () => pgRows)
list = await getJson<RulesBody>('/api/intercept/rules')
check('删光后不会被复活', outcome.source === 'done' && list.rules.length === 0, JSON.stringify({ outcome, rules: list.rules.length }))

// ── 迁移源不可用时退回内置种子 ─────────────────────────────────────────────
await meta.save({ ...(await meta.load()), intercept_rules: [], intercept_seed: [] })
outcome = await ensureInterceptRulesSeeded(async () => {
  throw new Error('connect ECONNREFUSED 127.0.0.1:7432')
})
list = await getJson<RulesBody>('/api/intercept/rules')
check('PG 连不上时用内置种子', outcome.source === 'builtin' && outcome.seeded === 20, JSON.stringify(outcome))
check('内置种子写入后有 19 条启用', list.rules.filter((rule) => rule.enabled).length === 19, String(list.rules.filter((rule) => rule.enabled).length))
check('内置规则可按优先级排序读出', list.rules[0].priority === 100 && list.rules[list.rules.length - 1].priority === 80, JSON.stringify(list.rules.map((r) => r.priority)))

// ── 迁移之后 CRUD 照常工作（新建 id 接着最大 id）───────────────────────────
const created = await (await api.request('/api/intercept/rules', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    name: '迁移后新增', enabled: true, priority: 70, match_target: 'tool_tool', match_type: 'string',
    pattern: 'x', action: 'deny', message: '', timeout_enabled: false, timeout_seconds: 60, timeout_action: 'deny'
  })
})).json() as MutationBody
check('迁移后新增被校验拦住（match_target 非法）', created.error != null, JSON.stringify(created))

const ok = await (await api.request('/api/intercept/rules', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    name: '迁移后新增', enabled: true, priority: 70, match_target: 'tool_input', match_type: 'string',
    pattern: 'example.com', action: 'deny', message: '', timeout_enabled: false, timeout_seconds: 60, timeout_action: 'deny'
  })
})).json() as MutationBody
check('迁移后新增 id 接在最大值之后', ok.id === 21, JSON.stringify({ id: ok.id }))

const toggled = await (await api.request(`/api/intercept/rules/${ok.id}/toggle`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: false })
})).json() as MutationBody
check('迁移后启停可用', toggled.enabled === false, JSON.stringify(toggled))

const updated = await (await api.request(`/api/intercept/rules/${ok.id}`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    name: '迁移后改名', enabled: true, priority: 65, match_target: 'tool_name', match_type: 'regex',
    pattern: '^Bash$', action: 'ask', message: '确认', timeout_enabled: true, timeout_seconds: 30, timeout_action: 'allow'
  })
})).json() as MutationBody
check('迁移后编辑可用', updated.name === '迁移后改名' && updated.action === 'ask' && updated.timeout_seconds === 30, JSON.stringify(updated))

const removed = await (await api.request(`/api/intercept/rules/${ok.id}`, { method: 'DELETE' })).json() as MutationBody
check('迁移后删除可用', removed.deleted === ok.id, JSON.stringify(removed))

// 用 dsh 实际加载的构建产物验证独立启动路径和底层记录一致性。
const settingsBundle = new URL('../vexnar/account/lib/settings-embedded.js', import.meta.url)
const { handleSettings } = await import(settingsBundle.href) as typeof import('./src/settings-embedded.ts')
const settingsRequest = (path: string) => handleSettings(new Request(new URL(path, 'http://127.0.0.1')))
const settingsRules = await settingsRequest('/api/intercept/rules')
check('设置构建产物读取同一份规则', settingsRules.status === 200 &&
  JSON.stringify(await settingsRules.json()) === JSON.stringify(await getJson('/api/intercept/rules')))
const settingsScope = await settingsRequest('/api/intercept/tool-config')
check('设置构建产物加载范围', settingsScope.status === 200 &&
  JSON.stringify(await settingsScope.json()) === JSON.stringify(await getJson('/api/intercept/tool-config')))
// 默认工具 / MCP 目录由 `startRuntime()` 播种（context.ts 只创建对象）。这里
// 显式播一次，验证设置产物读的是同一份存储，而不是它自己的常量表。
const { seedCatalogDefaults } = await import('./src/context.ts')
await seedCatalogDefaults()
const storedServers = await meta.table<unknown[]>('mcp')
const settingsMcp = await settingsRequest('/api/mcp')
check('设置构建产物读取存储中的 MCP Server', storedServers.length > 0 && settingsMcp.status === 200 &&
  JSON.stringify(await settingsMcp.json()) === JSON.stringify({ servers: storedServers }))
const settingsMcpWrite = await handleSettings(new Request('http://127.0.0.1/api/mcp', { method: 'POST' }))
check('设置构建产物的 MCP Server 目录只读', settingsMcpWrite.status === 404)
check('设置构建产物不挂载任务创建', (await handleSettings(new Request('http://127.0.0.1/api/tasks', { method: 'POST' }))).status === 404)

// ── 汇总 ───────────────────────────────────────────────────────────────────
let failed = false
for (const item of results) {
  if (!item.ok) failed = true
  console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`)
}
console.log(`root: ${root}`)
console.log(`checks: ${results.length} passed=${results.filter((r) => r.ok).length} failed=${results.filter((r) => !r.ok).length}`)
process.exit(failed ? 1 : 0)
