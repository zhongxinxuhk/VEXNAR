// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * core 里的 Web 测试域单例。
 *
 * 引擎随 core 进程内启动；REST `/api/web/*` 与 `@vexnar/dsh-tools` 的六个工具
 * 共用这一份策略、预算、会话与证据。P1-6 起不再启动 8792 的 Web MCP 监听：
 * 工具已经走进程内 `vexnarCore.request`，外部 MCP 只保留 `vexnar-web` 独立启动的
 * 兼容入口（`pnpm --filter @vexnar/web run mcp`），core 默认不拉起。
 */

import { join } from 'node:path'

import { handleWebHttp, startWebRuntime, type WebRuntime } from '@vexnar/web'

import { storeRoot } from './context.ts'

let booting: Promise<WebRuntime | null> | null = null
let lastError = ''

/** 幂等启动；引擎失败不阻断 core 启动（REST 返回 503）。 */
export function webRuntime(): Promise<WebRuntime | null> {
  booting ??= startWebRuntime({
    root: join(storeRoot(), 'web'),
    mcp: false,
    log: (message) => console.log(message)
  }).catch((error) => {
    lastError = (error as Error).message
    console.error('[web] 启动失败（REST 返回 503）：', lastError)
    return null
  })
  return booting
}

export async function webHttp(request: Request): Promise<Response | undefined> {
  const runtime = await webRuntime()
  if (!runtime) {
    return Response.json({ error: `Web 测试引擎尚未就绪：${lastError || 'unknown'}` }, { status: 503 })
  }
  return handleWebHttp(request, runtime.engine, { mcpUrl: runtime.mcpUrl || undefined })
}

export async function webStatus(): Promise<Record<string, unknown>> {
  const runtime = await webRuntime()
  if (!runtime) return { ready: false, mode: 'in-process', mcp: null, error: lastError }
  return {
    ready: true,
    mode: 'in-process',
    mcp: null,
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
