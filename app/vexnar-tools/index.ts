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
 * 插件入口：注册只读流量三件套与当前会话的抓包开关。
 *
 * 流量检索走 `/api/traffic` 的既有过滤字段；抓包控制按真实 core 路由走
 * `/api/sessions/:id/traffic/endpoint`（status）和 `/traffic/capture`（start/stop）。
 * 后者不是站点级 `/api/traffic/capture` 的 POST（该路由不存在），scope 由当前
 * dsh 会话推导，工具不接受任意 session id 或路径。
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
}
