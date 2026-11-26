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
    init?: { method?: string; body?: unknown; headers?: Record<string, string> }
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

/**
 * 插件入口。
 *
 * P1-1 先保留空实现：领域工具注册在 P1-2 起接入。保留这个函数而不是让入口只导出
 * 常量，是为了让 dsh 真正完成 `tools`/`vexnarCore` 注入并在后续增量里直接扩展。
 *
 * @param ctx - 已注入 tools 与 vexnarCore 的插件上下文。
 */
export function apply(ctx: ToolContext): void {
  void ctx
}