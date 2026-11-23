// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Web 测试域的 REST 面（给控制台/CLI 用；Harness 走 MCP）。
 *
 * 裸 `Request → Response`，core 用一行 `api.all` 挂上去；单测可直接喂 Request 断言。
 * 与 MCP 共用同一个引擎实例与同一套策略——REST 不放宽任何限制。
 */

import { PolicyError } from './policy.ts'
import type { WebTestingEngine } from './engine.ts'

export interface WebHttpOptions {
  mcpUrl?: string
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  })
}

function fail(error: unknown): Response {
  if (error instanceof PolicyError) return json({ error: error.message, code: error.code }, error.status)
  const status = Number((error as { status?: number })?.status ?? 500)
  return json({ error: String((error as Error)?.message ?? error) }, status >= 400 && status < 600 ? status : 500)
}

function sessionOf(request: Request, url: URL): string {
  return String(request.headers.get('x-vexnar-session') ?? '').trim()
    || String(url.searchParams.get('session') ?? '').trim()
    || 'local'
}

/** 处理 `/api/web*`；返回 undefined 表示不是本域的路径。 */
export async function handleWebHttp(
  request: Request,
  engine: WebTestingEngine,
  options: WebHttpOptions = {}
): Promise<Response | undefined> {
  const url = new URL(request.url)
  if (url.pathname !== '/api/web' && !url.pathname.startsWith('/api/web/')) return undefined
  const method = request.method.toUpperCase()
  const agentSession = sessionOf(request, url)
  const tail = url.pathname.split('/').filter(Boolean).slice(2) // api, web, ...
  const body = (method === 'POST' || method === 'PATCH')
    ? await request.json().catch(() => ({})) as Record<string, unknown>
    : {}

  try {
    if (!tail.length || tail[0] === 'status') {
      return json({
        ok: true,
        mcp: options.mcpUrl ?? null,
        policy: {
          allowed_origins: engine.policy.allowedOrigins,
          allow_private_network: engine.policy.allowPrivateNetwork,
          allow_write: engine.policy.allowWrite,
          aggressive_payloads: engine.policy.aggressivePayloads,
          min_interval_ms: engine.policy.minIntervalMs,
          max_requests_per_window: engine.policy.maxRequestsPerWindow,
          window_seconds: engine.policy.windowSeconds
        },
        sessions: engine.listSessions(agentSession).length
      })
    }

    if (tail[0] === 'sessions' && tail.length === 1 && method === 'GET') {
      return json({ sessions: engine.listSessions(agentSession) })
    }

    if (tail[0] === 'sessions' && tail.length === 1 && method === 'POST') {
      const created = await engine.createSession({
        origin: String(body.origin ?? ''),
        label: body.label === undefined ? undefined : String(body.label),
        scopeId: body.scope_id === undefined ? undefined : String(body.scope_id),
        requestBudget: body.request_budget === undefined ? undefined : Number(body.request_budget),
        authProfileId: body.auth_profile_id === undefined ? undefined : String(body.auth_profile_id),
        auth: body.auth as Record<string, string> | undefined,
        adversarial: body.adversarial === true
      }, agentSession)
      return json(created, 201)
    }

    const sessionId = String(tail[1] ?? '')
    const action = String(tail[2] ?? '')
    if (!sessionId) return json({ error: '缺少 session_id' }, 400)

    if (!action && method === 'GET') return json(engine.inspect(sessionId, {}, agentSession))
    if (action === 'requests' && method === 'POST') {
      const outcome = await engine.execute(sessionId, {
        method: String(body.method ?? 'GET'),
        path: String(body.path ?? ''),
        headers: body.headers as Record<string, string> | undefined,
        body: body.body === undefined ? undefined : String(body.body),
        approvedWrite: body.approved_write === true,
        aggressive: body.aggressive === true,
        evade: body.evade === true,
        testCaseId: body.test_case_id === undefined ? undefined : String(body.test_case_id),
        parentRequestId: body.parent_request_id === undefined ? undefined : String(body.parent_request_id),
        note: body.note === undefined ? undefined : String(body.note)
      }, agentSession)
      return json(outcome)
    }
    if (action === 'analyze' && method === 'POST') {
      const result = engine.analyze(sessionId, String(body.request_id ?? ''), {
        baselineRequestId: body.baseline_request_id === undefined ? undefined : String(body.baseline_request_id),
        mode: (body.mode === undefined ? 'auto' : String(body.mode)) as 'structure' | 'diff' | 'auto'
      }, agentSession)
      return json(result)
    }
    if (action === 'evasion' && method === 'GET') {
      return json(engine.evasionReport(sessionId, {
        testCaseId: url.searchParams.get('test_case_id') || undefined,
        limit: Number(url.searchParams.get('limit') ?? 300) || 300
      }, agentSession))
    }
    if (action === 'control' && method === 'POST') {
      const session = engine.control(sessionId, String(body.action ?? '') as never, {
        budget: body.budget === undefined ? undefined : Number(body.budget)
      }, agentSession)
      return json({ session })
    }
    if (action === 'evidence' && method === 'GET') {
      const requestId = String(url.searchParams.get('request_id') ?? '')
      const kind = String(url.searchParams.get('kind') ?? 'response')
      const stored = engine.store.evidence(`ev-${requestId}-${kind === 'request' ? 'req' : 'resp'}`)
      if (!stored) return json({ error: '证据不存在' }, 404)
      return new Response(new Uint8Array(stored.bytes), {
        headers: {
          'content-type': 'application/octet-stream',
          'content-disposition': `attachment; filename="${requestId}-${kind}.bin"`,
          'cache-control': 'no-store'
        }
      })
    }
    return json({ error: `未知动作：${method} ${url.pathname}` }, 404)
  } catch (error) {
    return fail(error)
  }
}
