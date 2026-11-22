// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from 'hono'
import { isIP } from 'node:net'
import { meta, operations, parseJson, store } from '../context.ts'

// ─────────────────────────────────────────────────────────────────────────────
// 审批拦截模块（Go server/intercept.go · asset_intercept.go · task_intercept.go
// 的 TS 迁移）。持久层复用 store 的 meta（配置域）+ writer（pending 记录域），
// 不连 PostgreSQL、不开新端口。规则字段/JSON 契约与 Go 完全一致。
// ─────────────────────────────────────────────────────────────────────────────

const TABLE_RULES = 'intercept_rules'
const TABLE_ASSET_RULES = 'asset_intercept_rules'
const TABLE_TASK_RULES = 'task_intercept_rules'
const TABLE_PENDING = 'intercept_pending'
const TABLE_TOOL_CONFIG = 'intercept_tool_config'
const TABLE_JUDGE_CONFIG = 'intercept_judge_config'

/** 与 Go 的 intercept.defaultEnabledTools 同一份清单（没保存过设置时生效）。 */
const DEFAULT_INTERCEPT_TOOLS = [
  'Bash',
  'WebFetch',
  'web_search',
  'shell_open',
  'shell_send',
  'Write',
  'Edit',
  'MultiEdit'
]

// ── helpers ─────────────────────────────────────────────────────────────────

function rfc3339(date: Date): string {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = (value: number) => String(Math.floor(Math.abs(value))).padStart(2, '0')
  return `${date.toISOString().slice(0, 23)}${sign}${pad(offset / 60)}:${pad(offset % 60)}`.replace('Z', '')
}

function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status })
}

function errResponse(c: any, error: any) {
  return c.json({ error: String(error?.message ?? error) }, error?.name === 'StoreConflict' ? 409 : (error?.status ?? 400))
}

/** 载入全部 meta 表 → 取出目标表（缺省 []）→ 返回可整体回写 { tables, rows }。 */
async function metaTable(name: string) {
  meta.reload()
  const tables = (await meta.load()) as Record<string, any[] | Record<string, unknown>>
  const rows = (tables[name] ?? []) as any[]
  tables[name] = rows
  return { tables, rows }
}

function nextId(rows: any[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

/** 解析路径里的正整数 id；非法/<=0 抛 400。 */
function pathId(value: string, label: string): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) fail(400, `bad ${label}`)
  return id
}

function isCidr(pattern: string): boolean {
  if (!/^[0-9a-fA-F:.]+\/\d{1,3}$/.test(pattern)) return false
  const [addr, bits] = pattern.split('/')
  const n = Number(bits)
  const version = isIP(addr)
  if (version === 4) return n >= 0 && n <= 32
  if (version === 6) return n >= 0 && n <= 128
  return false
}

// ── validators（与 Go 等价）─────────────────────────────────────────────────

/**
 * 模式是否「看起来能编译」。
 *
 * 规则的真正编译器在 Go（regexp / RE2），TS core 只负责存。JS 的 RegExp 不认识
 * RE2 的内联 flag（`(?i)`、`(?s:...)`、`(?-i)`），内建规则里到处都是这种写法；
 * 直接拿 JS 语法当门禁会把合法规则全部拒掉。所以先把内联 flag 中和成 JS 认识的
 * 形状(作用域版本换成 `(?:`)，再让 JS 挡真正的结构错误——括号不配对、孤立的反斜杠。
 * 仍然无法解析的 RE2 特有写法（如 `[[:alpha:]]` 的语义差异）放行：Go 侧加载规则时
 * 编译失败会跳过该条，行为与 Go 一致，不会把用户的合法规则挡在门外。
 */
function regexLooksParsable(pattern: string): boolean {
  const neutral = pattern.replace(/\(\?[imsUx-]+\)/g, '').replace(/\(\?[imsUx-]+:/g, '(?:')
  try {
    new RegExp(neutral)
    return true
  } catch {
    return false
  }
}

function validateInterceptRule(body: any) {
  const req = {
    name: String(body.name ?? '').trim(),
    enabled: Boolean(body.enabled),
    priority: Number(body.priority ?? 0) || 0,
    match_target: String(body.match_target ?? ''),
    match_type: String(body.match_type ?? ''),
    pattern: String(body.pattern ?? ''),
    action: String(body.action ?? ''),
    message: String(body.message ?? ''),
    timeout_enabled: Boolean(body.timeout_enabled),
    timeout_seconds: Number(body.timeout_seconds ?? 0) || 0,
    timeout_action: String(body.timeout_action ?? '')
  }
  if (!req.name) fail(400, 'name 不能为空')
  if (req.match_target !== 'tool_name' && req.match_target !== 'tool_input') fail(400, 'match_target 必须是 tool_name 或 tool_input')
  if (req.match_type !== 'string' && req.match_type !== 'regex') fail(400, 'match_type 必须是 string 或 regex')
  if (!req.pattern) fail(400, 'pattern 不能为空')
  if (req.action !== 'allow' && req.action !== 'deny' && req.action !== 'ask') fail(400, 'action 必须是 allow、deny 或 ask')
  if (req.match_type === 'regex' && !regexLooksParsable(req.pattern)) fail(400, 'pattern 不是有效正则')
  return req
}

function validateAssetRule(body: any) {
  const req = {
    enabled: Boolean(body.enabled),
    kind: String(body.kind ?? ''),
    pattern: String(body.pattern ?? '').trim(),
    note: String(body.note ?? '')
  }
  if (!req.pattern) fail(400, 'pattern 不能为空')
  switch (req.kind) {
    case 'exact_domain':
    case 'exact_url':
    case 'fuzzy_domain':
    case 'fuzzy_ip':
    case 'fuzzy_url':
      break
    case 'exact_ip':
      if (!isIP(req.pattern)) fail(400, `exact_ip 不是有效 IP 地址：${req.pattern}`)
      break
    case 'cidr':
      if (!isCidr(req.pattern)) fail(400, `cidr 不是有效网段（形如 192.168.0.0/16）：${req.pattern}`)
      break
    default:
      fail(400, `kind 无效：${req.kind}`)
  }
  return req
}

function validateTaskRule(body: any) {
  const action = body.action === '' || body.action == null ? 'block' : String(body.action)
  if (action !== 'block' && action !== 'allow') fail(400, 'action 必须是 block 或 allow')
  const asset = validateAssetRule(body)
  return { ...asset, action }
}

// ── DTO（JSON 字段与 Go 一致）──────────────────────────────────────────────

function ruleDto(row: any) {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    enabled: Boolean(row.enabled),
    priority: Number(row.priority ?? 0),
    match_target: String(row.match_target ?? ''),
    match_type: String(row.match_type ?? ''),
    pattern: String(row.pattern ?? ''),
    action: String(row.action ?? ''),
    message: String(row.message ?? ''),
    timeout_enabled: Boolean(row.timeout_enabled),
    timeout_seconds: Number(row.timeout_seconds ?? 0),
    timeout_action: String(row.timeout_action ?? ''),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? '')
  }
}

function assetRuleDto(row: any) {
  return {
    id: Number(row.id),
    enabled: Boolean(row.enabled),
    kind: String(row.kind ?? ''),
    pattern: String(row.pattern ?? ''),
    note: String(row.note ?? ''),
    builtin: Boolean(row.builtin),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? '')
  }
}

function taskRuleDto(row: any) {
  return {
    id: Number(row.id),
    enabled: Boolean(row.enabled),
    action: row.action === 'allow' ? 'allow' : 'block',
    kind: String(row.kind ?? ''),
    pattern: String(row.pattern ?? ''),
    note: String(row.note ?? ''),
    builtin: false,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? '')
  }
}

function pendingDto(row: any) {
  return {
    id: Number(row.id),
    rule_id: row.rule_id == null ? null : Number(row.rule_id),
    conversation_id: row.conversation_id == null ? null : Number(row.conversation_id),
    task_id: row.task_id == null ? null : String(row.task_id),
    agent_name: String(row.agent_name ?? ''),
    tool_name: String(row.tool_name ?? ''),
    tool_input: parseJson(row.tool_input) ?? {},
    status: String(row.status ?? 'pending'),
    reason: String(row.reason ?? ''),
    decision_source: String(row.decision_source ?? ''),
    decided_at: row.decided_at ?? null,
    created_at: String(row.created_at ?? '')
  }
}

function approvalRowDto(row: any, ruleName: string) {
  return { ...pendingDto(row), conv_title: '', conv_agent_key: '', rule_name: ruleName }
}

/** 旧行可能没有 decision_source；按 Go 的 interceptSource 规则回填。 */
function effectiveDecisionSource(row: any): string {
  const src = String(row.decision_source ?? '')
  if (src) return src
  if (row.rule_id != null) return 'rule'
  if (String(row.reason ?? '').startsWith('[模型]')) return 'model'
  return 'unknown'
}

// ── judge config（模型兜底审批，全局配置）───────────────────────────────────

const DEFAULT_JUDGE_PROMPT = `# 角色
你是一次「已获授权的渗透测试」中的操作安全裁判。系统已用规则过滤过命令，你对「规则没有覆盖到」的这一次工具调用做上下文审查。判断当前动作的直接效果：是否对目标真实资产造成难以恢复的破坏，或使真实用户不可用。
会 → deny；显然不会（正常攻击/侦察/读取）→ allow；信息不足且判错代价是真实破坏 → ask。
纯只读操作一律 allow；「可能被利用」「疑似危险」「属于攻击行为」不是 deny 理由。
# 输出
只输出一个 JSON 对象，第一个字符必须是 {、最后一个字符必须是 }，键名为 decision 与 comment。decision ∈ allow|ask|deny；comment 严格为「实际操作：…；成功后的后果：…；命中规则：…」三段。`

function defaultJudgeConfig() {
  return {
    enabled: false,
    profile_id: 0,
    prompt: DEFAULT_JUDGE_PROMPT,
    timeout_seconds: 15,
    fail_action: 'allow',
    ask_timeout_seconds: 300,
    ask_timeout_action: 'deny'
  }
}

function resolveJudgeConfig(stored: any) {
  const base = defaultJudgeConfig()
  if (!stored || typeof stored !== 'object') return base
  const prompt = String(stored.prompt ?? '').trim() ? String(stored.prompt) : DEFAULT_JUDGE_PROMPT
  return {
    enabled: Boolean(stored.enabled),
    profile_id: Number(stored.profile_id ?? 0) || 0,
    prompt,
    timeout_seconds: Number(stored.timeout_seconds ?? 0) > 0 ? Number(stored.timeout_seconds) : base.timeout_seconds,
    fail_action: ['allow', 'ask', 'deny'].includes(String(stored.fail_action)) ? String(stored.fail_action) : base.fail_action,
    ask_timeout_seconds: Number(stored.ask_timeout_seconds ?? 0) > 0 ? Number(stored.ask_timeout_seconds) : base.ask_timeout_seconds,
    ask_timeout_action: ['allow', 'deny'].includes(String(stored.ask_timeout_action)) ? String(stored.ask_timeout_action) : base.ask_timeout_action
  }
}

function validateJudgeConfig(body: any) {
  const failAction = String(body.fail_action ?? 'allow')
  const askTimeoutAction = String(body.ask_timeout_action ?? 'deny')
  if (!['allow', 'ask', 'deny'].includes(failAction)) fail(400, 'fail_action 必须是 allow、ask 或 deny')
  if (!['allow', 'deny'].includes(askTimeoutAction)) fail(400, 'ask_timeout_action 必须是 allow 或 deny')
  return {
    enabled: Boolean(body.enabled),
    profile_id: Number(body.profile_id ?? 0) || 0,
    prompt: String(body.prompt ?? ''),
    timeout_seconds: Number(body.timeout_seconds ?? 15) || 15,
    fail_action: failAction,
    ask_timeout_seconds: Number(body.ask_timeout_seconds ?? 300) || 300,
    ask_timeout_action: askTimeoutAction
  }
}

// ── pending / history 读取 ──────────────────────────────────────────────────

async function loadRuleNames(): Promise<Map<number, string>> {
  const rules = await meta.table<any[]>(TABLE_RULES)
  return new Map(rules.map((row) => [Number(row.id), String(row.name ?? '')]))
}

interface ApprovalFilter {
  status?: string
  decisionSource?: string
  taskId?: string
}

function sortByCreatedDesc<T extends { created_at: string; id: number }>(rows: T[]): T[] {
  return rows.sort((a, b) => {
    const byTime = String(b.created_at).localeCompare(String(a.created_at))
    if (byTime !== 0) return byTime
    return Number(b.id) - Number(a.id)
  })
}

/** pending 端点返回纯 InterceptPending（不带 conv/rule 富化字段，与 Go 一致）。 */
async function listPendingRows() {
  const rows = (await operations.writer.list(TABLE_PENDING)).map((row) =>
    pendingDto({ ...row, decision_source: effectiveDecisionSource(row) })
  )
  return sortByCreatedDesc(rows).filter((row) => row.status === 'pending')
}

/** history / task 端点返回富化的 InterceptApprovalRow（带 conv/rule 字段）。 */
async function listApprovalRows(filter: ApprovalFilter = {}) {
  const ruleNames = await loadRuleNames()
  const rows = (await operations.writer.list(TABLE_PENDING)).map((row) => {
    const enriched = { ...row, decision_source: effectiveDecisionSource(row) }
    return approvalRowDto(enriched, ruleNames.get(Number(row.rule_id)) ?? '')
  })
  sortByCreatedDesc(rows)
  let out = rows
  if (filter.status) out = out.filter((row) => row.status === filter.status)
  if (filter.decisionSource) out = out.filter((row) => row.decision_source === filter.decisionSource)
  if (filter.taskId != null) out = out.filter((row) => String(row.task_id ?? '') === filter.taskId)
  return out
}

function parseApprovalFilter(query: Record<string, string>) {
  const status = String(query.status ?? '')
  const decisionSource = String(query.decision_source ?? '')
  if (status && !['pending', 'allowed', 'denied', 'timeout'].includes(status)) {
    fail(400, 'status 必须是 pending、allowed、denied 或 timeout')
  }
  if (decisionSource && !['model', 'rule', 'unknown'].includes(decisionSource)) {
    fail(400, 'decision_source 必须是 model、rule 或 unknown')
  }
  return { status, decisionSource }
}

function parsePage(query: Record<string, string>) {
  let page = Math.max(Number(query.page ?? 1) || 1, 1)
  let size = Number(query.size ?? 20) || 20
  if (size < 1) size = 20
  if (size > 100) size = 100
  return { page, size }
}

// ── 路由注册 ────────────────────────────────────────────────────────────────

export function registerInterceptSettings(api: Hono) {
  // ── 拦截规则（intercept_rules）CRUD / toggle ──────────────────────────────
  api.get('/api/intercept/rules', async (c) => {
    const { rows } = await metaTable(TABLE_RULES)
    rows.sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0) || Number(a.id) - Number(b.id))
    return c.json({ rules: rows.map(ruleDto) })
  })

  api.post('/api/intercept/rules', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const req = validateInterceptRule(body)
      const { tables, rows } = await metaTable(TABLE_RULES)
      const now = rfc3339(new Date())
      const record = { ...req, id: nextId(rows), created_at: now, updated_at: now }
      rows.push(record)
      await meta.save(tables)
      return c.json(ruleDto(record))
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.get('/api/intercept/rules/:id', async (c) => {
    try {
      const id = pathId(c.req.param('id'), 'rule id')
      const { rows } = await metaTable(TABLE_RULES)
      const row = rows.find((r) => Number(r.id) === id)
      if (!row) return c.json({ error: 'not found' }, 404)
      return c.json(ruleDto(row))
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.put('/api/intercept/rules/:id', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const id = pathId(c.req.param('id'), 'rule id')
      const req = validateInterceptRule(body)
      const { tables, rows } = await metaTable(TABLE_RULES)
      const row = rows.find((r) => Number(r.id) === id)
      if (!row) return c.json({ error: 'not found' }, 404)
      Object.assign(row, req, { updated_at: rfc3339(new Date()) })
      await meta.save(tables)
      return c.json(ruleDto(row))
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.delete('/api/intercept/rules/:id', async (c) => {
    try {
      const id = pathId(c.req.param('id'), 'rule id')
      const { tables, rows } = await metaTable(TABLE_RULES)
      const idx = rows.findIndex((r) => Number(r.id) === id)
      if (idx === -1) return c.json({ error: 'not found' }, 404)
      rows.splice(idx, 1)
      await meta.save(tables)
      return c.json({ deleted: id })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.post('/api/intercept/rules/:id/toggle', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const id = pathId(c.req.param('id'), 'rule id')
      const { tables, rows } = await metaTable(TABLE_RULES)
      const row = rows.find((r) => Number(r.id) === id)
      if (!row) return c.json({ error: 'not found' }, 404)
      row.enabled = Boolean(body.enabled)
      row.updated_at = rfc3339(new Date())
      await meta.save(tables)
      return c.json({ ok: true, enabled: row.enabled })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  // ── 全局工具拦截范围（tool-config）────────────────────────────────────────
  //
  // 未保存过设置时回 Go 的默认清单（intercept/intercept.go 的 defaultEnabledTools）：
  // 空数组与"没配过"在语义上不同——前者是用户主动关掉全部工具，后者要走默认值，
  // 页面据此显示"未启用任何工具"还是默认范围。
  api.get('/api/intercept/tool-config', async (c) => {
    try {
      meta.reload()
      const tables = (await meta.load()) as Record<string, unknown>
      const stored = tables[TABLE_TOOL_CONFIG]
      if (stored === undefined) return c.json({ enabled_tools: [...DEFAULT_INTERCEPT_TOOLS] })
      return c.json({ enabled_tools: Array.isArray(stored) ? stored.map((item) => String(item)) : [] })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.put('/api/intercept/tool-config', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const tools = Array.isArray(body.enabled_tools)
        ? [...new Set(body.enabled_tools.map((t: any) => String(t).trim()).filter(Boolean))]
        : []
      const { tables } = await metaTable(TABLE_TOOL_CONFIG)
      tables[TABLE_TOOL_CONFIG] = tools
      await meta.save(tables)
      return c.json({ ok: true })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  // ── LLM 兜底裁判配置（judge）──────────────────────────────────────────────
  api.get('/api/intercept/judge', async (c) => {
    try {
      const stored = await meta.table<Record<string, unknown>>(TABLE_JUDGE_CONFIG)
      return c.json(resolveJudgeConfig(Array.isArray(stored) ? stored[0] : stored))
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.put('/api/intercept/judge', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const cfg = validateJudgeConfig(body)
      const { tables } = await metaTable(TABLE_JUDGE_CONFIG)
      tables[TABLE_JUDGE_CONFIG] = cfg
      await meta.save(tables)
      return c.json({ ok: true })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.get('/api/intercept/judge/usage', async (c) => {
    // TS core 无 judge 通道的 LLM 用量台账；与 Go 在 pg 不可用时同形，返回空。
    return c.json({ calls: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, daily: [] })
  })
}

export function register(api: Hono) {
  registerInterceptSettings(api)

  // ── 审批流：pending / history ─────────────────────────────────────────────
  api.get('/api/intercept/pending', async (c) => {
    try {
      return c.json({ pending: await listPendingRows() })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.get('/api/intercept/pending/:id', async (c) => {
    try {
      const id = pathId(c.req.param('id'), 'pending id')
      const row = await operations.writer.readRecord(TABLE_PENDING, String(id))
      if (!row) return c.json({ error: 'not found' }, 404)
      return c.json(pendingDto({ ...row, decision_source: effectiveDecisionSource(row) }))
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.post('/api/intercept/pending/:id/decide', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const id = pathId(c.req.param('id'), 'pending id')
      const decision = String(body.decision ?? '')
      if (decision !== 'allowed' && decision !== 'denied') return c.json({ error: 'decision 必须是 allowed 或 denied' }, 400)
      const current = await operations.writer.readRecord(TABLE_PENDING, String(id))
      if (!current) return c.json({ error: 'not found' }, 404)
      if (String(current.status ?? 'pending') !== 'pending') return c.json({ error: '审批已被处理' }, 409)
      const next = { ...current, status: decision, decided_at: rfc3339(new Date()) }
      delete next.rev
      await operations.writer.put({ table: TABLE_PENDING, key: String(id), record: next, expectedRev: Number(current.rev ?? 0) })
      return c.json({ ok: true })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.get('/api/intercept/history', async (c) => {
    try {
      const query = c.req.query()
      const filter = parseApprovalFilter(query)
      const { page, size } = parsePage(query)
      const rows = await listApprovalRows(filter)
      if (query.page == null && query.size == null) {
        return c.json({ items: rows, total: rows.length })
      }
      return c.json({ items: rows.slice((page - 1) * size, page * size), total: rows.length, page, page_size: size })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.get('/api/intercept/history/:id', async (c) => {
    try {
      const id = pathId(c.req.param('id'), 'approval id')
      const row = await operations.writer.readRecord(TABLE_PENDING, String(id))
      if (!row) return c.json({ error: 'not found' }, 404)
      const ruleNames = await loadRuleNames()
      const detail = approvalRowDto({ ...row, decision_source: effectiveDecisionSource(row) }, ruleNames.get(Number(row.rule_id)) ?? '')
      const audit = parseJson(row.audit) ?? null
      return c.json({ ...detail, audit })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.get('/api/intercept/history/:id/execution', async (c) => {
    try {
      const id = pathId(c.req.param('id'), 'approval id')
      const row = await operations.writer.readRecord(TABLE_PENDING, String(id))
      if (!row) return c.json({ error: 'not found' }, 404)
      const audit = parseJson(row.audit) as any
      if (!audit || audit.correlation !== 'exact' || !audit.tool_use_id) {
        return c.json({ error: '未找到可唯一关联的原始工具调用；记录可能已删除，或旧审批没有保存关联 ID' }, 409)
      }
      const toolUseId = String(audit.tool_use_id)
      const activities = await operations.writer.list('activity')
      const matches = activities.filter((a) => String(a.tool_use_id ?? '') === toolUseId && (a.kind === 'tool_use' || a.kind === 'tool_result'))
      if (!matches.length) return c.json({ error: '对应会话或执行记录已被删除或不存在' }, 410)
      const call = matches[0]
      const session = call.worker === 'mainagent' ? `main:${call.main_seg ?? 0}` : call.worker === 'planner' ? 'plan' : call.node_id != null ? `intent:${call.node_id}` : ''
      const items = matches.slice(0, 2).map((a: any) => ({
        seq: Number(a.id),
        ...(a.node_id == null ? {} : { intent_id: String(a.node_id) }),
        worker: String(a.worker ?? ''),
        ts: String(a.created_at ?? ''),
        kind: String(a.kind ?? ''),
        ...(a.tool ? { tool: String(a.tool) } : {}),
        ...(a.tool_use_id ? { tool_use_id: String(a.tool_use_id) } : {}),
        is_error: Boolean(a.is_error),
        summary: String(a.summary ?? ''),
        ...(a.main_seg == null ? {} : { main_seg: Number(a.main_seg) })
      }))
      return c.json({
        conversation_id: row.conversation_id == null ? null : Number(row.conversation_id),
        task_id: row.task_id == null ? null : String(row.task_id),
        session,
        seq: Number(call.id),
        items
      })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  // ── 任务级审批记录（task intercept）───────────────────────────────────────
  api.get('/api/intercept/task/:taskID', async (c) => {
    try {
      const taskID = c.req.param('taskID')
      if (!taskID) return c.json({ error: 'bad task id' }, 400)
      const query = c.req.query()
      const filter = parseApprovalFilter(query)
      const { page, size } = parsePage(query)
      const rows = await listApprovalRows({ ...filter, taskId: taskID })
      if (query.page == null && query.size == null) {
        return c.json({ items: rows, total: rows.length })
      }
      return c.json({ items: rows.slice((page - 1) * size, page * size), total: rows.length, page, page_size: size })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  // ── 资产拦截规则（asset-intercept）CRUD / toggle ──────────────────────────
  api.get('/api/asset-intercept/rules', async (c) => {
    try {
      const { rows } = await metaTable(TABLE_ASSET_RULES)
      rows.sort((a, b) => Number(b.builtin ?? false) - Number(a.builtin ?? false) || Number(b.id) - Number(a.id))
      return c.json({ rules: rows.map(assetRuleDto) })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.post('/api/asset-intercept/rules', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const req = validateAssetRule(body)
      const { tables, rows } = await metaTable(TABLE_ASSET_RULES)
      const now = rfc3339(new Date())
      const record = { ...req, id: nextId(rows), builtin: false, created_at: now, updated_at: now }
      rows.push(record)
      await meta.save(tables)
      return c.json(assetRuleDto(record))
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.put('/api/asset-intercept/rules/:id', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const id = pathId(c.req.param('id'), 'rule id')
      const req = validateAssetRule(body)
      const { tables, rows } = await metaTable(TABLE_ASSET_RULES)
      const row = rows.find((r) => Number(r.id) === id)
      if (!row) return c.json({ error: 'not found' }, 404)
      Object.assign(row, req, { updated_at: rfc3339(new Date()) })
      await meta.save(tables)
      return c.json(assetRuleDto(row))
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.delete('/api/asset-intercept/rules/:id', async (c) => {
    try {
      const id = pathId(c.req.param('id'), 'rule id')
      const { tables, rows } = await metaTable(TABLE_ASSET_RULES)
      const idx = rows.findIndex((r) => Number(r.id) === id)
      if (idx === -1) return c.json({ error: 'not found' }, 404)
      rows.splice(idx, 1)
      await meta.save(tables)
      return c.json({ deleted: id })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.post('/api/asset-intercept/rules/:id/toggle', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const id = pathId(c.req.param('id'), 'rule id')
      const { tables, rows } = await metaTable(TABLE_ASSET_RULES)
      const row = rows.find((r) => Number(r.id) === id)
      if (!row) return c.json({ error: 'not found' }, 404)
      row.enabled = Boolean(body.enabled)
      row.updated_at = rfc3339(new Date())
      await meta.save(tables)
      return c.json({ ok: true, enabled: row.enabled })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  // ── 任务级拦截规则（tasks/{id}/intercept-rules）CRUD / toggle ─────────────
  api.get('/api/tasks/:id/intercept-rules', async (c) => {
    try {
      const taskId = pathId(c.req.param('id'), 'task id')
      const { rows } = await metaTable(TABLE_TASK_RULES)
      const rules = rows.filter((r) => String(r.task_id) === String(taskId))
      rules.sort((a, b) => String(a.action).localeCompare(String(b.action)) || Number(a.id) - Number(b.id))
      return c.json({ rules: rules.map(taskRuleDto) })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.post('/api/tasks/:id/intercept-rules', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const taskId = pathId(c.req.param('id'), 'task id')
      const task = await store.tasks.get(String(taskId))
      if (!task) return c.json({ error: 'task 不存在' }, 404)
      const req = validateTaskRule(body)
      const { tables, rows } = await metaTable(TABLE_TASK_RULES)
      const now = rfc3339(new Date())
      const record = { ...req, id: nextId(rows), task_id: String(taskId), created_at: now, updated_at: now }
      rows.push(record)
      await meta.save(tables)
      return c.json(taskRuleDto(record))
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.put('/api/tasks/:id/intercept-rules/:rid', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const taskId = pathId(c.req.param('id'), 'task id')
      const ruleId = pathId(c.req.param('rid'), 'rule id')
      const req = validateTaskRule(body)
      const { tables, rows } = await metaTable(TABLE_TASK_RULES)
      const row = rows.find((r) => String(r.task_id) === String(taskId) && Number(r.id) === ruleId)
      if (!row) return c.json({ error: 'not found' }, 404)
      Object.assign(row, req, { updated_at: rfc3339(new Date()) })
      await meta.save(tables)
      return c.json(taskRuleDto(row))
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.delete('/api/tasks/:id/intercept-rules/:rid', async (c) => {
    try {
      const taskId = pathId(c.req.param('id'), 'task id')
      const ruleId = pathId(c.req.param('rid'), 'rule id')
      const { tables, rows } = await metaTable(TABLE_TASK_RULES)
      const idx = rows.findIndex((r) => String(r.task_id) === String(taskId) && Number(r.id) === ruleId)
      if (idx === -1) return c.json({ error: 'not found' }, 404)
      rows.splice(idx, 1)
      await meta.save(tables)
      return c.json({ deleted: ruleId })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })

  api.post('/api/tasks/:id/intercept-rules/:rid/toggle', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const taskId = pathId(c.req.param('id'), 'task id')
      const ruleId = pathId(c.req.param('rid'), 'rule id')
      const { tables, rows } = await metaTable(TABLE_TASK_RULES)
      const row = rows.find((r) => String(r.task_id) === String(taskId) && Number(r.id) === ruleId)
      if (!row) return c.json({ error: 'not found' }, 404)
      row.enabled = Boolean(body.enabled)
      row.updated_at = rfc3339(new Date())
      await meta.save(tables)
      return c.json({ ok: true, enabled: row.enabled })
    } catch (error: any) {
      return errResponse(c, error)
    }
  })
}
