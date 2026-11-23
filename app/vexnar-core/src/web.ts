// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * core 里的 Web 测试域单例。
 *
 * 为什么不放在 routes 里直接 new：MCP 端点必须在 Harness 调用工具之前就监听，
 * 而 REST 只是可选入口。所以由 `runtime.ts` 在启动时拉起一次，路由与 MCP 共用
 * 同一个引擎——策略、预算、会话状态只有一份。
 */

import { join } from 'node:path'

import { handleWebHttp, startWebRuntime, type WebRuntime } from '@vexnar/web'

import { storeRoot } from './context.ts'

let booting: Promise<WebRuntime | null> | null = null
let lastError = ''

/** 幂等启动；端口被占等失败不阻断 core 启动（REST 仍可用，MCP 会缺位）。 */
export function webRuntime(): Promise<WebRuntime | null> {
  booting ??= startWebRuntime({
    root: join(storeRoot(), 'web'),
    log: (message) => console.log(message)
  }).catch((error) => {
    lastError = (error as Error).message
    console.error('[web] 启动失败（REST 仍可用）：', lastError)
    return null
  })
  return booting
}

export async function webHttp(request: Request): Promise<Response | undefined> {
  const runtime = await webRuntime()
  if (!runtime) {
    return Response.json({ error: `Web 测试引擎尚未就绪：${lastError || 'unknown'}` }, { status: 503 })
  }
  return handleWebHttp(request, runtime.engine, { mcpUrl: runtime.mcpUrl })
}

export async function webStatus(): Promise<Record<string, unknown>> {
  const runtime = await webRuntime()
  if (!runtime) return { ready: false, error: lastError }
  return {
    ready: true,
    mcp: runtime.mcpUrl,
    token_source: runtime.tokenSource,
    sessions: runtime.engine.listSessions('local').length
  }
}

export async function stopWebRuntime(): Promise<void> {
  const runtime = await booting?.catch(() => null)
  if (!runtime) return
  await runtime.stop()
  booting = null
}
