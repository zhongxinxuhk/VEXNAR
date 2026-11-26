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

/**
 * 插件入口：注册只读流量三件套。
 *
 * 三条路径都对应 core 已有路由，过滤字段与 `/api/traffic` 的 query 完全一致；
 * 不提供任意 URL 或任意路径调用。
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
}
