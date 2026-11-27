// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * @vexnar/dsh-tools — VEXNAR 领域工具在 dsh 进程内的注册面。
 *
 * P1-1 只建立插件入口、依赖注入和注册助手；流量、finding、复测与 web 工具从
 * P1-2 起按同一份 `ToolContext` 注册。工具实现走 `vexnarCore.request()`，不新开
 * HTTP 端口，也不复制 core 的存储或业务逻辑。
 *
 * `index.ts` 在构建时转成真正的 `index.js`：dsh 从 profile 的 `node_modules`
 * 加载插件，Node 不会为那里的 TypeScript 做类型擦除。
 */

export const name = 'vexnar-tools'

/** dsh 在调用 apply 前先注入工具面与同进程 core 桥。 */
export const inject = ['tools', 'vexnarCore'] as const

/** 同进程 core 的最小调用面；由 @vexnar/dsh-account 的 `ctx.provide('vexnarCore')` 提供。 */
export interface CoreBridge {
  request(
    path: string,
    init?: { method?: string; body?: unknown; headers?: Record<string, string>; response?: 'json' | 'base64' }
  ): Promise<unknown>
}

/** dsh 传给工具执行器的上下文；这里只声明工具面需要的字段。 */
export interface ToolExecution {
  signal?: AbortSignal
  agent?: { session?: { id?: string } }
  [key: string]: unknown
}

/** 工具参数 JSON Schema；具体字段由各工具自己声明。 */
export type ToolSchema = Record<string, unknown>

/** 工具处理函数；参数已经由 dsh 解析，返回值由默认 renderer 转成文本。 */
export type ToolHandler = (
  args: Record<string, unknown>,
  execution: ToolExecution
) => unknown | Promise<unknown>

/** 插件拿到的 dsh 上下文切片。 */
export interface ToolContext {
  tools: {
    register(tool: {
      name: string
      description: string
      parameters: ToolSchema
      output: {
        schema: ToolSchema
        render: (args: unknown, value: unknown) => Array<{ type: 'text'; text: string }>
      }
      execute: (args: unknown, execution: ToolExecution) => Promise<unknown>
    }): () => void
  }
  vexnarCore: CoreBridge
}

const toolName = /^[a-z][a-z0-9_]*$/u

function text(value: unknown): Array<{ type: 'text'; text: string }> {
  return [{
    type: 'text',
    text: typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  }]
}

/**
 * 注册一个领域工具。
 *
 * 工具名限定为小写 snake_case，避免不同来源的工具在 dsh 的全局工具表里靠大小写
 * 区分；描述必须非空，因为它是模型选择工具的唯一依据。
 *
 * @param ctx - 插件上下文（含 tools 与 vexnarCore）。
 * @param name - 工具名，例如 `traffic_search`。
 * @param description - 给模型看的能力说明。
 * @param schema - 参数 JSON Schema。
 * @param handler - 工具实现；返回对象或字符串。
 * @returns 反注册函数，插件卸载时由 dsh 调用。
 */
export function registerTool(
  ctx: ToolContext,
  name: string,
  description: string,
  schema: ToolSchema,
  handler: ToolHandler
): () => void {
  if (!toolName.test(name)) throw new Error(`工具名不合法：${name}`)
  if (description.trim() === '') throw new Error(`工具 ${name} 缺少描述`)
  return ctx.tools.register({
    name,
    description,
    parameters: schema,
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => text(value)
    },
    async execute(args, execution) {
      const input = typeof args === 'object' && args !== null ? args as Record<string, unknown> : {}
      return await handler(input, execution)
    }
  })
}

const trafficSearchSchema: ToolSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    host: { type: 'string', description: 'Host 子串，例如 example.com。' },
    method: { type: 'string', description: 'HTTP 方法，精确匹配，例如 GET / POST。' },
    q: { type: 'string', description: '关键字；匹配 host/url/method/content-type/status；本地行还匹配内联正文（归档只索引元数据）。' },
    status: { type: 'string', description: '状态过滤：精确码 404，或 2xx/4xx 范围。' },
    resp_min: { type: 'integer', minimum: 0, description: '响应长度下限（字节）。' },
    resp_max: { type: 'integer', minimum: 0, description: '响应长度上限（字节）。' },
    sort: { type: 'string', enum: ['ts', 'status', 'resp_len'], description: '排序字段，默认 ts。' },
    order: { type: 'string', enum: ['asc', 'desc'], description: '排序方向，默认 desc。' },
    page: { type: 'integer', minimum: 0, description: '页码，从 0 开始。' },
    size: { type: 'integer', minimum: 1, maximum: 500, description: '每页条数，默认 100，最大 500。' }
  }
}

const trafficGetSchema: ToolSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string', description: 'traffic_search 返回的 exchange id。' }
  }
}

const trafficBlobSchema: ToolSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['hash'],
  properties: {
    hash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$', description: '正文 SHA256（64 位十六进制，大小写均可）。' }
  }
}

const captureControlSchema: ToolSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: {
      type: 'string',
      enum: ['status', 'start', 'stop'],
      description: 'status 查看当前会话抓包状态；start 开启；stop 停止并释放端口。'
    }
  }
}

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const
const TRAFFIC_ROLES = ['baseline', 'proof', 'verification', 'supporting'] as const

const reportFindingSchema: ToolSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['task_id', 'vulnclass', 'severity', 'summary', 'evidence'],
  properties: {
    task_id: { type: 'string', description: '当前 VEXNAR 任务 id（数字字符串）。' },
    vulnclass: { type: 'string', description: '漏洞类别，例如 SQL注入。' },
    name: { type: 'string', description: '漏洞名称。' },
    severity: { type: 'string', enum: [...SEVERITIES], description: '严重度。' },
    summary: { type: 'string', description: '发现摘要。' },
    evidence: { type: 'string', description: '可验证证据/PoC 文本；不能为空。' },
    intent_id: { type: 'integer', minimum: 1, description: '可选：当前任务的意图 id。' },
    worker: { type: 'string', description: '可选：执行者标识。' },
    asset_ids: {
      type: 'array',
      items: { type: 'integer', minimum: 1 },
      description: '可选：受影响资产 id。'
    }
  }
}

const bindFindingTrafficSchema: ToolSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['finding_id', 'traffic_refs'],
  properties: {
    finding_id: { type: 'string', pattern: '^[0-9]+$', description: '独立漏洞记录 ID，不是探索节点 ID。' },
    traffic_refs: {
      type: 'array',
      minItems: 1,
      maxItems: 50,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['traffic_id'],
        properties: {
          traffic_id: { type: 'string', description: 'traffic_search 返回的真实流量 ID。' },
          role: { type: 'string', enum: [...TRAFFIC_ROLES], description: '默认 supporting。' },
          note: { type: 'string', description: '该流量支持什么结论。' }
        }
      },
      description: '已核实的真实流量引用；按复现顺序提交。'
    }
  }
}

const webSessionCreateSchema: ToolSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['origin'],
  properties: {
    origin: { type: 'string', description: '授权目标，单个站点，例如 https://target.example。' },
    label: { type: 'string', maxLength: 120, description: '人类可读名字。' },
    request_budget: { type: 'integer', minimum: 1, maximum: 5000, description: '本会话请求预算，默认取策略上限。' },
    auth_profile_id: { type: 'string', maxLength: 120, description: '服务端定义的身份配置 id（推荐）。' },
    auth: { type: 'object', additionalProperties: { type: 'string' }, description: '显式身份头，只写 Vault，不回显。' },
    adversarial: { type: 'boolean', description: '开启对抗升级（需平台授权与 origin 白名单）。' }
  }
}

const WEB_METHODS = ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
const webRequestExecuteSchema: ToolSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['session_id', 'path'],
  properties: {
    session_id: { type: 'string', description: 'web_session_create 返回的会话 id。' },
    method: { type: 'string', enum: [...WEB_METHODS], description: '默认 GET。' },
    path: { type: 'string', description: '相对路径或同源绝对 URL。' },
    headers: { type: 'object', additionalProperties: { type: 'string' }, description: '额外请求头。' },
    body: { type: 'string', maxLength: 262144, description: '请求正文，最大 256 KiB。' },
    approved_write: { type: 'boolean', description: '写方法必须显式 true。' },
    aggressive: { type: 'boolean', description: '标记为攻击性测试（需策略授权）。' },
    evade: { type: 'boolean', description: '本次启用对抗升级（需会话已开对抗模式）。' },
    test_case_id: { type: 'string', maxLength: 120, description: '测试用例 id。' },
    parent_request_id: { type: 'string', maxLength: 120, description: '父请求 id。' },
    note: { type: 'string', maxLength: 500, description: '备注。' }
  }
}

const webResponseAnalyzeSchema: ToolSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['session_id', 'request_id'],
  properties: {
    session_id: { type: 'string', description: '会话 id。' },
    request_id: { type: 'string', description: '要分析的请求 id。' },
    baseline_request_id: { type: 'string', maxLength: 120, description: 'diff 模式的基线请求。' },
    mode: { type: 'string', enum: ['structure', 'diff', 'auto'], description: '默认 auto。' }
  }
}

const webSessionInspectSchema: ToolSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['session_id'],
  properties: {
    session_id: { type: 'string', description: '会话 id。' },
    include: { type: 'string', enum: ['history', 'stats', 'both'], description: '默认 both。' },
    limit: { type: 'integer', minimum: 1, maximum: 200, description: '历史条数，默认 20。' },
    request_id: { type: 'string', maxLength: 120, description: '只查一条请求。' }
  }
}

const webEvasionReportSchema: ToolSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['session_id'],
  properties: {
    session_id: { type: 'string', description: '会话 id。' },
    test_case_id: { type: 'string', maxLength: 120, description: '只看该测试用例。' },
    limit: { type: 'integer', minimum: 1, maximum: 500, description: '读取的交换记录上限，默认 300。' }
  }
}

const webSessionControlSchema: ToolSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['session_id', 'action'],
  properties: {
    session_id: { type: 'string', description: '会话 id。' },
    action: { type: 'string', enum: ['pause', 'resume', 'close', 'reset_budget'], description: '会话动作。' },
    budget: { type: 'integer', minimum: 1, maximum: 5000, description: 'reset_budget 的新预算。' }
  }
}

/** core 的 capture scope 只接受这种 host chat session id。 */
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u

/** 只把白名单字段写进 query，避免工具参数变成任意 core 路由代理。 */
function trafficQuery(args: Record<string, unknown>, keys: readonly string[]): string {
  const query = new URLSearchParams()
  for (const key of keys) {
    const value = args[key]
    if (value === undefined || value === null) continue
    const text = String(value).trim()
    if (text !== '') query.set(key, text)
  }
  return query.toString()
}

function requiredText(args: Record<string, unknown>, key: string): string {
  const value = String(args[key] ?? '').trim()
  if (value === '') throw new Error(`${key} 不能为空`)
  return value
}

/** Web 引擎按 agentSession 隔离会话；不能退化成可以跨会话的 `local`。 */
const WEB_AGENT_SESSION = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u
const WEB_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u

function webAgentSession(execution: ToolExecution): string {
  const raw = String(execution.agent?.session?.id ?? '').trim()
  if (raw === '') return 'dsh'
  if (!WEB_AGENT_SESSION.test(raw)) throw new Error('当前 dsh 会话 id 不能作为 Web agent session')
  return raw
}

function webSessionId(args: Record<string, unknown>): string {
  const value = requiredText(args, 'session_id')
  if (!WEB_SESSION_ID.test(value)) throw new Error('session_id 格式不合法')
  return value
}

function webHeaders(execution: ToolExecution): Record<string, string> {
  return { 'x-vexnar-session': webAgentSession(execution) }
}

function optionalText(args: Record<string, unknown>, key: string, maxLength: number): string | undefined {
  const value = String(args[key] ?? '').trim()
  if (value === '') return undefined
  if (value.length > maxLength) throw new Error(`${key} 过长`)
  return value
}

function optionalInteger(args: Record<string, unknown>, key: string, min: number, max: number): number | undefined {
  if (args[key] === undefined || args[key] === null || String(args[key]).trim() === '') return undefined
  const value = Number(args[key])
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} 必须是 ${min}..${max} 的整数`)
  return value
}

function stringRecord(args: Record<string, unknown>, key: string): Record<string, string> | undefined {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${key} 必须是字符串对象`)
  const out: Record<string, string> = {}
  for (const [name, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item !== 'string') throw new Error(`${key}.${name} 必须是字符串`)
    out[name] = item
  }
  return out
}

/** 与 MCP 的 publicPolicy 保持同一组字段，避免把内部策略整包透给模型。 */
function publicWebPolicy(value: unknown): Record<string, unknown> {
  const policy = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  return {
    allowed_origins: Array.isArray(policy.allowedOrigins) ? policy.allowedOrigins : [],
    allow_private_network: policy.allowPrivateNetwork === true,
    max_requests_per_session: Number(policy.maxRequestsPerSession ?? 0),
    max_requests_per_window: Number(policy.maxRequestsPerWindow ?? 0),
    window_seconds: Number(policy.windowSeconds ?? 0),
    min_interval_ms: Number(policy.minIntervalMs ?? 0),
    max_response_bytes: Number(policy.maxResponseBytes ?? 0),
    request_timeout_ms: Number(policy.requestTimeoutMs ?? 0),
    allow_write: policy.allowWrite === true,
    follow_redirects: String(policy.followRedirects ?? ''),
    aggressive_payloads: policy.aggressivePayloads === true
  }
}

/** 抓包归属当前 dsh 会话；没有会话时不能猜一个 scope。 */
function currentSession(execution: ToolExecution): string {
  const raw = String(execution.agent?.session?.id ?? '').trim()
  if (raw === '') throw new Error('capture_control 需要当前 dsh 会话 id')
  // dsh slot 给的 id 已带 `session-` 前缀；core 会再拼一次，必须与 UI 的
  // sessionKey() 一样先剥一层，否则 scope 会变成 session-session-…。
  const id = raw.startsWith('session-') ? raw.slice('session-'.length) : raw
  if (!SESSION_ID.test(id)) throw new Error('当前 dsh 会话 id 不能映射到 capture scope')
  return id
}

interface CaptureSnapshot {
  source?: unknown
  started_at?: unknown
  stopped_at?: unknown
  items?: unknown
  last_ts?: unknown
}

interface CapturePayload {
  ok?: unknown
  scope?: unknown
  enabled?: unknown
  proxy?: unknown
  ca_pem_url?: unknown
  capture?: CaptureSnapshot | null
  summary?: CaptureSnapshot | null
  ingest_url?: unknown
  hook?: unknown
}

/** 把会话 endpoint 与 start/stop 两种响应收成同一组字段。 */
function captureResult(action: 'status' | 'start' | 'stop', payload: CapturePayload) {
  // start/stop 的 `capture` 是 capture-state 行（无 items/last_ts），条数在
  // `summary`；status 的 endpoint 则把条数放在 `capture`。两者互补，不能只取一个。
  const state = payload.capture ?? {}
  const sample = payload.summary ?? {}
  return {
    action,
    ok: payload.ok !== false,
    scope: String(payload.scope ?? ''),
    active: payload.enabled === true,
    proxy: String(payload.proxy ?? ''),
    ca_pem_url: String(payload.ca_pem_url ?? ''),
    source: String(state.source ?? sample.source ?? ''),
    started_at: Number(state.started_at ?? sample.started_at ?? 0) || 0,
    stopped_at: Number(state.stopped_at ?? sample.stopped_at ?? 0) || 0,
    items: Number(sample.items ?? state.items ?? 0) || 0,
    last_ts: Number(sample.last_ts ?? state.last_ts ?? 0) || 0,
    ingest_url: String(payload.ingest_url ?? ''),
    hook: String(payload.hook ?? '')
  }
}

/**
 * 插件入口：注册流量、抓包和 finding 证据工具。
 *
 * 流量检索走 `/api/traffic` 的既有过滤字段；抓包控制按真实 core 路由走
 * `/api/sessions/:id/traffic/endpoint`（status）和 `/traffic/capture`（start/stop）。
 * finding 上报走 `POST /api/exploration/findings`，流量补绑走
 * `POST /api/exploration/findings/:id/traffic`（body `traffic_refs`）。
 * 所有路由和 id 形状都是固定的，工具不接受任意路径参数。
 *
 * @param ctx - 已注入 tools 与 vexnarCore 的插件上下文。
 */
export function apply(ctx: ToolContext): void {
  registerTool(
    ctx,
    'traffic_search',
    '搜索已采集流量，支持 host/method/关键字/状态码/响应长度过滤；结果带 source=local|archive。',
    trafficSearchSchema,
    async args => await ctx.vexnarCore.request(
      `/api/traffic?${trafficQuery(args, ['host', 'method', 'q', 'status', 'resp_min', 'resp_max', 'sort', 'order', 'page', 'size'])}`
    )
  )

  registerTool(
    ctx,
    'traffic_get',
    '按 exchange id 读取单条流量的原始请求与响应文本。',
    trafficGetSchema,
    async args => {
      const id = requiredText(args, 'id')
      const raw = await ctx.vexnarCore.request(`/api/traffic/exchange?${trafficQuery({ id }, ['id'])}`)
      return typeof raw === 'object' && raw !== null ? { id, ...(raw as Record<string, unknown>) } : raw
    }
  )

  registerTool(
    ctx,
    'traffic_blob',
    '按 SHA256 读取超限正文；返回 base64 数据与字节数，供调用方解码保存。',
    trafficBlobSchema,
    async args => {
      const hash = requiredText(args, 'hash').toLowerCase()
      if (!/^[0-9a-f]{64}$/u.test(hash)) throw new Error('hash 必须是 64 位十六进制')
      const blob = await ctx.vexnarCore.request(
        `/api/traffic/blob?${trafficQuery({ hash }, ['hash'])}`,
        { response: 'base64' }
      ) as { base64: string; bytes: number; content_type: string }
      return {
        hash,
        bytes: blob.bytes,
        content_type: blob.content_type,
        encoding: 'base64',
        data: blob.base64
      }
    }
  )

  registerTool(
    ctx,
    'capture_control',
    '控制当前 dsh 会话的流量抓包：status 查看状态，start 开启该 scope 的 MITM 回环端口，stop 停止并释放端口。卸载插件前先 stop。',
    captureControlSchema,
    async (args, execution) => {
      const action = String(args.action ?? '').trim() as 'status' | 'start' | 'stop'
      if (action !== 'status' && action !== 'start' && action !== 'stop') {
        throw new Error('action 只能是 status、start 或 stop')
      }
      const session = currentSession(execution)
      const base = `/api/sessions/${encodeURIComponent(session)}/traffic`
      const payload = action === 'status'
        ? await ctx.vexnarCore.request(`${base}/endpoint`)
        : await ctx.vexnarCore.request(`${base}/capture`, { method: 'POST', body: { action } })
      return captureResult(action, payload as CapturePayload)
    }
  )

  registerTool(
    ctx,
    'report_finding',
    '记录一条已确认漏洞。必须给当前 task_id、vulnclass、severity、summary 和非空 evidence；返回 finding_id。流量证据用 bind_finding_traffic 补绑。',
    reportFindingSchema,
    async args => {
      const taskId = requiredText(args, 'task_id')
      const vulnclass = requiredText(args, 'vulnclass')
      const severity = requiredText(args, 'severity')
      if (!(SEVERITIES as readonly string[]).includes(severity)) throw new Error('severity 只能是 critical、high、medium 或 low')
      const summary = requiredText(args, 'summary')
      const evidence = requiredText(args, 'evidence')
      const body: Record<string, unknown> = { task_id: taskId, vulnclass, severity, summary, evidence }
      for (const key of ['name', 'worker'] as const) {
        const value = String(args[key] ?? '').trim()
        if (value !== '') body[key] = value
      }
      if (args.intent_id !== undefined && args.intent_id !== null && String(args.intent_id).trim() !== '') {
        const intentId = Number(args.intent_id)
        if (!Number.isInteger(intentId) || intentId <= 0) throw new Error('intent_id 必须是正整数')
        body.intent_id = String(intentId)
      }
      if (args.asset_ids !== undefined && args.asset_ids !== null) {
        if (!Array.isArray(args.asset_ids)) throw new Error('asset_ids 必须是数组')
        const ids = args.asset_ids.map((value) => Number(value))
        if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw new Error('asset_ids 必须是正整数数组')
        body.asset_ids = ids
      }
      return await ctx.vexnarCore.request('/api/exploration/findings', { method: 'POST', body })
    }
  )

  registerTool(
    ctx,
    'bind_finding_traffic',
    '把已核实的真实流量补绑到已登记漏洞。finding_id 是独立漏洞记录 ID；traffic_refs 来自 traffic_search/traffic_get，按复现顺序提交。同批原子，重复绑定不覆盖已有说明。',
    bindFindingTrafficSchema,
    async args => {
      const findingId = requiredText(args, 'finding_id')
      if (!/^\d+$/u.test(findingId)) throw new Error('finding_id 必须是数字字符串')
      if (!Array.isArray(args.traffic_refs) || args.traffic_refs.length === 0) throw new Error('traffic_refs 至少一条')
      const refs: Array<{ traffic_id: string; role: string; note: string }> = []
      const seen = new Set<string>()
      for (const raw of args.traffic_refs) {
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('traffic_refs 每条必须是对象')
        const item = raw as Record<string, unknown>
        const trafficId = requiredText(item, 'traffic_id')
        if (trafficId.length > 512) throw new Error('traffic_id 过长')
        if (seen.has(trafficId)) continue
        seen.add(trafficId)
        const role = String(item.role ?? 'supporting').trim() || 'supporting'
        if (!(TRAFFIC_ROLES as readonly string[]).includes(role)) throw new Error('role 只能是 baseline、proof、verification 或 supporting')
        refs.push({ traffic_id: trafficId, role, note: String(item.note ?? '') })
      }
      return await ctx.vexnarCore.request(
        `/api/exploration/findings/${encodeURIComponent(findingId)}/traffic`,
        { method: 'POST', body: { traffic_refs: refs } }
      )
    }
  )

  registerTool(
    ctx,
    'web_session_create',
    '为一次授权测试创建隔离的 HTTP 会话（独立 CookieJar / 身份 / 预算）。origin 必须是单个站点；凭据只进 Vault，不回显。',
    webSessionCreateSchema,
    async (args, execution) => {
      const payload: Record<string, unknown> = { origin: requiredText(args, 'origin') }
      const label = optionalText(args, 'label', 120)
      if (label !== undefined) payload.label = label
      const requestBudget = optionalInteger(args, 'request_budget', 1, 5000)
      if (requestBudget !== undefined) payload.request_budget = requestBudget
      const authProfileId = optionalText(args, 'auth_profile_id', 120)
      if (authProfileId !== undefined) payload.auth_profile_id = authProfileId
      const auth = stringRecord(args, 'auth')
      if (auth !== undefined) payload.auth = auth
      if (args.adversarial !== undefined) {
        if (typeof args.adversarial !== 'boolean') throw new Error('adversarial 必须是布尔值')
        payload.adversarial = args.adversarial
      }
      const created = await ctx.vexnarCore.request('/api/web/sessions', {
        method: 'POST', headers: webHeaders(execution), body: payload
      }) as Record<string, unknown>
      return { session: created?.session, policy: publicWebPolicy(created?.policy) }
    }
  )

  registerTool(
    ctx,
    'web_request_execute',
    '在 web 会话内执行一次受控 HTTP 请求。跨 origin、超预算、超窗口、未批准的写方法会被策略拒绝；返回脱敏记录、响应片段与结构信号。',
    webRequestExecuteSchema,
    async (args, execution) => {
      const sessionId = webSessionId(args)
      const method = String(args.method ?? 'GET')
      if (!(WEB_METHODS as readonly string[]).includes(method)) throw new Error('method 不合法')
      const payload: Record<string, unknown> = { method, path: requiredText(args, 'path') }
      const headers = stringRecord(args, 'headers')
      if (headers !== undefined) payload.headers = headers
      if (args.body !== undefined) {
        if (typeof args.body !== 'string') throw new Error('body 必须是字符串')
        if (args.body.length > 256 * 1024) throw new Error('body 过长')
        payload.body = args.body
      }
      for (const key of ['approved_write', 'aggressive', 'evade'] as const) {
        if (args[key] !== undefined) {
          if (typeof args[key] !== 'boolean') throw new Error(`${key} 必须是布尔值`)
          payload[key] = args[key]
        }
      }
      const testCaseId = optionalText(args, 'test_case_id', 120)
      if (testCaseId !== undefined) payload.test_case_id = testCaseId
      const parentRequestId = optionalText(args, 'parent_request_id', 120)
      if (parentRequestId !== undefined) payload.parent_request_id = parentRequestId
      const note = optionalText(args, 'note', 500)
      if (note !== undefined) payload.note = note
      return await ctx.vexnarCore.request(
        `/api/web/sessions/${encodeURIComponent(sessionId)}/requests`,
        { method: 'POST', headers: webHeaders(execution), body: payload }
      )
    }
  )

  registerTool(
    ctx,
    'web_response_analyze',
    '对已采集的响应做本地分析：structure 提取结构，diff 与基线比较。只读本地证据，不发新请求。',
    webResponseAnalyzeSchema,
    async (args, execution) => {
      const sessionId = webSessionId(args)
      const payload: Record<string, unknown> = { request_id: requiredText(args, 'request_id') }
      const baseline = optionalText(args, 'baseline_request_id', 120)
      if (baseline !== undefined) payload.baseline_request_id = baseline
      const mode = optionalText(args, 'mode', 20) ?? 'auto'
      if (!['structure', 'diff', 'auto'].includes(mode)) throw new Error('mode 只能是 structure、diff 或 auto')
      payload.mode = mode
      return await ctx.vexnarCore.request(
        `/api/web/sessions/${encodeURIComponent(sessionId)}/analyze`,
        { method: 'POST', headers: webHeaders(execution), body: payload }
      )
    }
  )

  registerTool(
    ctx,
    'web_session_inspect',
    '查 web 会话状态、预算余额、请求历史、分类统计与策略事件。可用 request_id 精查一条，按 limit 限制历史条数。',
    webSessionInspectSchema,
    async (args, execution) => {
      const sessionId = webSessionId(args)
      if (args.include !== undefined && !['history', 'stats', 'both'].includes(String(args.include))) {
        throw new Error('include 只能是 history、stats 或 both')
      }
      const query = new URLSearchParams()
      const limit = optionalInteger(args, 'limit', 1, 200)
      if (limit !== undefined) query.set('limit', String(limit))
      const requestId = optionalText(args, 'request_id', 120)
      if (requestId !== undefined) query.set('request_id', requestId)
      const suffix = query.toString() ? `?${query.toString()}` : ''
      return await ctx.vexnarCore.request(
        `/api/web/sessions/${encodeURIComponent(sessionId)}${suffix}`,
        { headers: webHeaders(execution) }
      )
    }
  )

  registerTool(
    ctx,
    'web_evasion_report',
    '汇总 web 会话的拦截→升级→结果：各变异/出口/身份的尝试与通过次数、升级样本、最终仍被拦的请求。只陈述观测结果。',
    webEvasionReportSchema,
    async (args, execution) => {
      const sessionId = webSessionId(args)
      const query = new URLSearchParams()
      const testCaseId = optionalText(args, 'test_case_id', 120)
      if (testCaseId !== undefined) query.set('test_case_id', testCaseId)
      const limit = optionalInteger(args, 'limit', 1, 500)
      if (limit !== undefined) query.set('limit', String(limit))
      const suffix = query.toString() ? `?${query.toString()}` : ''
      return await ctx.vexnarCore.request(
        `/api/web/sessions/${encodeURIComponent(sessionId)}/evasion${suffix}`,
        { headers: webHeaders(execution) }
      )
    }
  )

  registerTool(
    ctx,
    'web_session_control',
    '暂停、恢复、关闭 web 会话，或重置预算。关闭会销毁 Vault 凭据并释放连接池。',
    webSessionControlSchema,
    async (args, execution) => {
      const sessionId = webSessionId(args)
      const action = requiredText(args, 'action')
      if (!['pause', 'resume', 'close', 'reset_budget'].includes(action)) {
        throw new Error('action 只能是 pause、resume、close 或 reset_budget')
      }
      const payload: Record<string, unknown> = { action }
      const budget = optionalInteger(args, 'budget', 1, 5000)
      if (budget !== undefined) payload.budget = budget
      return await ctx.vexnarCore.request(
        `/api/web/sessions/${encodeURIComponent(sessionId)}/control`,
        { method: 'POST', headers: webHeaders(execution), body: payload }
      )
    }
  )
}
