// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Hono } from 'hono'
import { meta, operations } from '../context.ts'

// ─────────────────────────────────────────────────────────────────────────────
// 可见性 + 命令目录（移植自 Go server/server_mgmt.go 的 visibility 段、
// server/commands.go 与 server/platform_tools.go）。
//
// 存储（meta 域，低写入频率，整体替换即可）：
//   visibility      [{ agent, kind, resource_id, enabled }]   agent × 资源（mcp/tool/...）
//   skillVisibility [{ agent, skill, enabled }]               agent × skill 目录名
// 语义与 Go 的 agent_visibility / agent_skill_visibility 一致：visible=true 写入
// （幂等 upsert），visible=false 删除该行；两个方向的读写走同一批行。
//
// 命令：commands 列表由 meta 的 tools 表与内置命令（引擎动作 / 内置侦察工具 /
// 平台操作工具）聚合而成，并叠加 activity 账本里的真实执行次数——PG 的
// activity 表在这里对应 writer 的 activity 表，不连 PostgreSQL。
// ─────────────────────────────────────────────────────────────────────────────

const VIS_TABLE = 'visibility'
const SKILL_VIS_TABLE = 'skillVisibility'
const TOOLS_TABLE = 'tools'

function errResponse(c: any, e: any) {
  return c.json({ error: String(e?.message ?? e) }, e?.name === 'StoreConflict' ? 409 : e?.status ?? 400)
}

function bad(message: string, status = 400) {
  return Object.assign(new Error(message), { status })
}

// ─────────────────────────────────────────────────────────────────────────────
// meta 表读写（与 routes/skills.ts 同一套模式：载入整份文档 → 改一张表 → 回写）
// ─────────────────────────────────────────────────────────────────────────────

async function loadTables(): Promise<Record<string, any>> {
  meta.reload()
  return (await meta.load()) as Record<string, any>
}

function tableRows(tables: Record<string, any>, name: string): any[] {
  const rows = tables[name]
  if (Array.isArray(rows)) return rows as any[]
  const fresh: any[] = []
  tables[name] = fresh
  return fresh
}

async function commitTable(tables: Record<string, any>, name: string, rows: any[]) {
  tables[name] = rows
  await meta.save(tables)
  meta.reload()
}

// ─────────────────────────────────────────────────────────────────────────────
// 入参归一化
// ─────────────────────────────────────────────────────────────────────────────

const kindRe = /^[a-z][a-z0-9_-]{0,31}$/

function normAgentId(value: unknown): string {
  const agent = String(value ?? '').trim()
  if (!agent) throw bad('agent_id 不能为空')
  if (agent.length > 64) throw bad('agent_id 过长（≤64）')
  return agent
}

function normKind(value: unknown): string {
  const kind = (String(value ?? '').trim() || 'mcp').toLowerCase()
  if (!kindRe.test(kind)) throw bad('kind 需为小写字母开头的标识符（字母/数字/-/_，≤32）')
  return kind
}

function normResourceId(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  if (!Number.isInteger(n) || n < 0) throw bad('resource_id 需为非负整数')
  return n
}

function normSkillName(value: unknown): string {
  const name = String(value ?? '').trim()
  if (!name) throw bad('skill name 不能为空')
  if (name.length > 64) throw bad('skill name 过长（≤64）')
  if (name === '.' || name === '..' || name.includes('/') || name.includes('\\')) throw bad('skill name 非法')
  return name
}

function normVisible(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  throw bad('visible 需为布尔值')
}

/** 数字 agent_id 若能对上 agents 表的 id，就落成它的 key（store 以 key 为准）。 */
function resolveAgent(agents: any[], raw: string): string {
  const exact = agents.find((row) => String(row?.key ?? '') === raw)
  if (exact) return String(exact.key)
  if (/^\d+$/.test(raw)) {
    const byId = agents.find((row) => Number(row?.id) === Number(raw))
    if (byId && byId.key != null) return String(byId.key)
  }
  return raw
}

// ─────────────────────────────────────────────────────────────────────────────
// 可见性行
// ─────────────────────────────────────────────────────────────────────────────

function sortedAgents(agents: string[]): string[] {
  return [...new Set(agents.filter(Boolean))].sort()
}

function visibleAgents(rows: any[], kind: string, resourceId: number): string[] {
  const out: string[] = []
  for (const row of rows) {
    if (row?.enabled === false) continue
    if (String(row?.kind ?? '') !== kind) continue
    if (Number(row?.resource_id ?? -1) !== resourceId) continue
    out.push(String(row?.agent ?? ''))
  }
  return sortedAgents(out)
}

function skillVisibleAgents(rows: any[], skill: string): string[] {
  const out: string[] = []
  for (const row of rows) {
    if (row?.enabled === false) continue
    if (String(row?.skill ?? '') !== skill) continue
    out.push(String(row?.agent ?? ''))
  }
  return sortedAgents(out)
}

async function toggleResource(agent: string, kind: string, resourceId: number, visible: boolean) {
  const tables = await loadTables()
  const rows = tableRows(tables, VIS_TABLE)
  const kept = rows.filter((row) =>
    !(String(row?.kind ?? '') === kind && Number(row?.resource_id ?? -1) === resourceId && String(row?.agent ?? '') === agent))
  if (visible) kept.push({ agent, kind, resource_id: resourceId, enabled: true })
  await commitTable(tables, VIS_TABLE, kept)
}

async function toggleSkill(agent: string, skill: string, visible: boolean) {
  const tables = await loadTables()
  const rows = tableRows(tables, SKILL_VIS_TABLE)
  const kept = rows.filter((row) => !(String(row?.skill ?? '') === skill && String(row?.agent ?? '') === agent))
  if (visible) kept.push({ agent, skill, enabled: true })
  await commitTable(tables, SKILL_VIS_TABLE, kept)
}

// ─────────────────────────────────────────────────────────────────────────────
// 内置命令目录（镜像 server/platform_tools.go 的平台工具、engine 的动作集合，
// 以及 vexnar-store/src/tools.ts 里封装的侦察命令）。
// ─────────────────────────────────────────────────────────────────────────────

interface BuiltinCommand { tool: string; kind: string; description: string }

const builtinCommands: BuiltinCommand[] = [
  { tool: 'run_command', kind: 'engine', description: '在沙箱里执行一条 shell 命令，回填 stdout/stderr 与退出码' },
  { tool: 'run_tool', kind: 'engine', description: '用内置工具封装执行侦察命令（nmap/httpx/ffuf 等），输出结构化结果' },
  { tool: 'add_fact', kind: 'engine', description: '把一条结论写入任务知识图（fact 节点）' },
  { tool: 'report_finding', kind: 'engine', description: '上报一个漏洞发现，纳入 finding 工作流' },
  { tool: 'add_asset', kind: 'engine', description: '登记一个资产（域名/IP/服务/接口）到资产库' },
  { tool: 'link_assets', kind: 'engine', description: '在两个资产之间建立关系边' },
  { tool: 'list_assets', kind: 'engine', description: '列出当前任务的可用资产' },
  { tool: 'graph_overview', kind: 'engine', description: '查看任务知识图概览（节点/边统计）' },
  { tool: 'finish', kind: 'engine', description: '声明当前 intent 完成，交回调度器' },

  { tool: 'nmap', kind: 'cli', description: '端口与服务识别' },
  { tool: 'httpx', kind: 'cli', description: 'URL 存活与指纹' },
  { tool: 'ffuf', kind: 'cli', description: '目录/接口爆破' },
  { tool: 'sqlmap', kind: 'cli', description: 'SQL 注入检测' },
  { tool: 'nuclei', kind: 'cli', description: '模板化漏洞扫描' },
  { tool: 'katana', kind: 'cli', description: '爬虫与 URL 收集' },
  { tool: 'subfinder', kind: 'cli', description: '子域枚举' },
  { tool: 'gobuster', kind: 'cli', description: '目录/DNS 爆破' },
  { tool: 'nikto', kind: 'cli', description: 'Web 服务器扫描' },
  { tool: 'openssl', kind: 'cli', description: 'TLS/证书检查' },

  { tool: 'create_skill', kind: 'platform', description: '创建一个 skill（写 SKILL.md）' },
  { tool: 'update_skill_file', kind: 'platform', description: '写/覆盖 skill 内的一个文件' },
  { tool: 'create_custom_tool', kind: 'platform', description: '安装自定义工具（shell/command/script/http）' },
  { tool: 'update_custom_tool', kind: 'platform', description: '修改一个已有的自定义工具' },
  { tool: 'create_mcp', kind: 'platform', description: '创建一个 MCP 服务器（stdio/http/sse）' },
  { tool: 'update_mcp', kind: 'platform', description: '修改一个已有的 MCP 服务器' },
  { tool: 'delete_assets_by_host', kind: 'platform', description: '按 host 精确删除资产（跨任务、不可撤销）' }
]

// ─────────────────────────────────────────────────────────────────────────────
// 执行账本（writer 的 activity 表，对应 Go 的 activity）
// ─────────────────────────────────────────────────────────────────────────────

interface Usage { total: number; errors: number; last_used: string | null }

async function usageIndex(exploration?: number): Promise<Map<string, Usage>> {
  const map = new Map<string, Usage>()
  let rows: any[] = []
  try {
    rows = await operations.writer.list('activity')
  } catch {
    rows = []
  }
  for (const row of rows) {
    const tool = String(row?.tool ?? '').trim()
    if (!tool) continue
    if (exploration !== undefined && Number(row?.exploration_id ?? -1) !== exploration) continue
    const entry = map.get(tool) ?? { total: 0, errors: 0, last_used: null }
    entry.total += 1
    if (row?.is_error) entry.errors += 1
    const ts = String(row?.created_at ?? '')
    if (ts && (!entry.last_used || ts > entry.last_used)) entry.last_used = ts
    map.set(tool, entry)
  }
  return map
}

function parseExploration(value: string | undefined): number | undefined {
  if (!value) return undefined
  const n = Number(String(value).trim())
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

function normPage(value: string | undefined): number {
  const n = Number(String(value ?? '').trim())
  return Number.isInteger(n) && n > 0 ? n : 0
}

function normSize(value: string | undefined): number {
  const n = Number(String(value ?? '').trim())
  if (!Number.isInteger(n) || n <= 0) return 50
  return Math.min(n, 200)
}

// ─────────────────────────────────────────────────────────────────────────────
// 命令目录聚合
// ─────────────────────────────────────────────────────────────────────────────

interface CommandEntry {
  tool: string
  kind: string
  description: string
  system: boolean
  enabled: boolean
  agents: string[]
  deferred: boolean
  source: string
  calls: number
  exec_total: number
  exec_errors: number
  last_used: string | null
}

async function commandCatalog(exploration?: number): Promise<CommandEntry[]> {
  const tables = await meta.load()
  const toolRows = tableRows(tables, TOOLS_TABLE)
  const usage = await usageIndex(exploration)
  const catalog = new Map<string, CommandEntry>()

  for (const builtin of builtinCommands) {
    catalog.set(builtin.tool, {
      tool: builtin.tool, kind: builtin.kind, description: builtin.description,
      system: true, enabled: true, agents: [], deferred: false, source: 'builtin',
      calls: 0, exec_total: 0, exec_errors: 0, last_used: null
    })
  }

  for (const row of toolRows) {
    const tool = String(row?.key ?? '').trim()
    if (!tool) continue
    const base = catalog.get(tool)
    catalog.set(tool, {
      tool,
      kind: String(row?.kind ?? base?.kind ?? 'command'),
      description: String(row?.description ?? base?.description ?? ''),
      system: row?.system !== undefined ? Boolean(row.system) : Boolean(base?.system),
      enabled: row?.enabled !== false,
      agents: Array.isArray(row?.agents) ? row.agents.map((a: any) => String(a)) : (base?.agents ?? []),
      deferred: Boolean(row?.deferred),
      source: 'meta',
      calls: Number(row?.calls ?? 0) || 0,
      exec_total: 0,
      exec_errors: 0,
      last_used: row?.last_used == null ? null : String(row.last_used)
    })
  }

  // activity 里出现过、但目录里没有的工具照样列出来（否则执行历史会被吞掉）。
  for (const [tool, entry] of usage) {
    if (!catalog.has(tool)) {
      catalog.set(tool, {
        tool, kind: 'ledger', description: '', system: false, enabled: true, agents: [],
        deferred: false, source: 'activity', calls: 0, exec_total: 0, exec_errors: 0, last_used: null
      })
    }
    const target = catalog.get(tool)!
    target.exec_total = entry.total
    target.exec_errors = entry.errors
    const ts = entry.last_used ?? ''
    target.last_used = ts && (!target.last_used || ts > target.last_used) ? ts : target.last_used
  }

  return [...catalog.values()].sort((a, b) => (a.tool < b.tool ? -1 : a.tool > b.tool ? 1 : 0))
}

function matchCommand(entry: CommandEntry, needle: string): boolean {
  if (!needle) return true
  const q = needle.toLowerCase()
  return entry.tool.toLowerCase().includes(q) || entry.description.toLowerCase().includes(q) || entry.kind.toLowerCase().includes(q)
}

// ─────────────────────────────────────────────────────────────────────────────
// 路由
// ─────────────────────────────────────────────────────────────────────────────

export function register(api: Hono) {
  // ── 可见性：资源侧（mcp/tool/...）──────────────────────────────────────────
  // POST /api/visibility/toggle  { agent_id, kind, resource_id, visible }
  api.post('/api/visibility/toggle', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const raw = normAgentId(body.agent_id)
      const kind = normKind(body.kind)
      const resourceId = normResourceId(body.resource_id)
      const visible = normVisible(body.visible)
      const agents = await meta.table<any[]>('agents').catch(() => [])
      const agent = resolveAgent(agents, raw)
      await toggleResource(agent, kind, resourceId, visible)
      return c.json({ ok: true, agent_id: agent, kind, resource_id: resourceId, visible })
    } catch (e: any) { return errResponse(c, e) }
  })

  // ── 可见性：skill 侧（先注册，避免被 /:kind/:id 抢走）────────────────────
  // GET /api/visibility/skill/:name
  api.get('/api/visibility/skill/:name', async (c) => {
    try {
      const skill = normSkillName(c.req.param('name'))
      const tables = await loadTables()
      const rows = tableRows(tables, SKILL_VIS_TABLE)
      return c.json({ agents: skillVisibleAgents(rows, skill) })
    } catch (e: any) { return errResponse(c, e) }
  })

  // POST /api/visibility/skill/toggle  { agent_id, skill_name, visible }
  api.post('/api/visibility/skill/toggle', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const raw = normAgentId(body.agent_id)
      const skill = normSkillName(body.skill_name ?? body.skill ?? body.name)
      const visible = normVisible(body.visible)
      const agents = await meta.table<any[]>('agents').catch(() => [])
      const agent = resolveAgent(agents, raw)
      await toggleSkill(agent, skill, visible)
      return c.json({ ok: true, agent_id: agent, skill_name: skill, visible })
    } catch (e: any) { return errResponse(c, e) }
  })

  // GET /api/visibility/:kind/:id
  api.get('/api/visibility/:kind/:id', async (c) => {
    try {
      const kind = normKind(c.req.param('kind'))
      const resourceId = normResourceId(c.req.param('id'))
      const tables = await loadTables()
      const rows = tableRows(tables, VIS_TABLE)
      return c.json({ agents: visibleAgents(rows, kind, resourceId) })
    } catch (e: any) { return errResponse(c, e) }
  })

  // ── 命令：目录 + 执行统计 ─────────────────────────────────────────────────
  // GET /api/commands?q=&task=&page=&size=
  api.get('/api/commands', async (c) => {
    try {
      const q = String(c.req.query('q') ?? '').trim()
      const exploration = parseExploration(c.req.query('task'))
      const page = normPage(c.req.query('page'))
      const size = normSize(c.req.query('size'))
      const all = (await commandCatalog(exploration)).filter((entry) => matchCommand(entry, q))
      const start = page * size
      const commands = all.slice(start, start + size)
      return c.json({ commands, total: all.length, page, size })
    } catch (e: any) { return errResponse(c, e) }
  })

  // GET /api/commands/stats?q=&task=
  api.get('/api/commands/stats', async (c) => {
    try {
      const q = String(c.req.query('q') ?? '').trim()
      const exploration = parseExploration(c.req.query('task'))
      const stats = (await commandCatalog(exploration))
        .filter((entry) => matchCommand(entry, q))
        .map((entry) => ({
          tool: entry.tool,
          total: entry.exec_total,
          errors: entry.exec_errors,
          calls: entry.calls,
          kind: entry.kind,
          system: entry.system,
          enabled: entry.enabled,
          last_used: entry.last_used
        }))
        .sort((a, b) => b.total - a.total || (a.tool < b.tool ? -1 : a.tool > b.tool ? 1 : 0))
      return c.json({ stats, total: stats.length })
    } catch (e: any) { return errResponse(c, e) }
  })
}
