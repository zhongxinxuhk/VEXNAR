// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 6 个 web_* 工具对真实 core `/api/web/*` handler 的集成测试。
 *
 * 用 `startWebRuntime({ mcp: false })` 启动真实引擎 + 临时 SQLite + 注入 fetch
 * （不联网），只绕过 core 的 HTTP 监听；`handleWebHttp` 就是 core 挂载的同一个
 * REST 实现。P1-6 后这条路径不再启动 8792，也不再生成 MCP token。
 */

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { startWebRuntime } from '../../vexnar-web/src/index.ts'
import { handleWebHttp } from '../../vexnar-web/src/routes.ts'
import { apply, type ToolContext } from '../index.ts'

const ORIGIN = 'https://web.example'
const HTML = `<!doctype html><html><head><title>控制台</title></head><body>
<form method="post" action="/login"><input name="user"><input name="pass" type="password"></form>
<a href="/inbox">收件箱</a><script src="/app.js"></script></body></html>`

interface RegisteredTool {
  execute: (args: unknown, execution: unknown) => Promise<unknown>
}

async function build() {
  const root = mkdtempSync(join(tmpdir(), 'vexnar-p16-'))
  const fetched: string[] = []
  const runtime = await startWebRuntime({
    root,
    mcp: false,
    policy: {
      allowedOrigins: [ORIGIN],
      minIntervalMs: 0,
      maxRequestsPerWindow: 100,
      maxRequestsPerSession: 20
    },
    fetchImpl: async (url) => {
      fetched.push(String(url))
      return new Response(HTML, { status: 200, headers: { 'content-type': 'text/html' } })
    }
  })
  assert.equal(runtime.mcp, null, 'mcp:false 不能启动 Web MCP')
  assert.equal(runtime.mcpUrl, '')
  assert.equal(runtime.tokenSource, '')
  assert.equal(existsSync(join(root, 'mcp.token')), false, 'mcp:false 不应生成 MCP token')
  const engine = runtime.engine
  const tools = new Map<string, RegisteredTool>()

  const bridge = async (path: string, init: Record<string, any> = {}): Promise<any> => {
    const body = init.body === undefined ? undefined : JSON.stringify(init.body)
    const headers = new Headers(init.headers as Record<string, string> | undefined)
    if (body !== undefined) headers.set('content-type', 'application/json')
    const response = await handleWebHttp(
      new Request(`http://core.local${path}`, { method: init.method ?? 'GET', headers, body }),
      engine
    )
    assert.ok(response, `core 未处理 ${path}`)
    const text = await response.text()
    let payload: unknown = null
    try {
      payload = JSON.parse(text)
    } catch {
      throw new Error(`core 返回非 JSON：${text.slice(0, 200)}`)
    }
    if (!response.ok) throw new Error(`${response.status} ${text}`)
    return payload
  }

  apply({
    tools: {
      register(tool: RegisteredTool) {
        // apply 注册时还带 name；这里只需要 execute。
        const registered = tool as RegisteredTool & { name?: string }
        if (registered.name) tools.set(registered.name, tool)
        return () => undefined
      }
    },
    vexnarCore: { request: bridge }
  } as unknown as ToolContext)

  const call = async (name: string, args: Record<string, unknown>, execution: Record<string, unknown>): Promise<any> => {
    const tool = tools.get(name)
    assert.ok(tool, `${name} 未注册`)
    return await tool.execute(args, execution)
  }

  const done = async () => {
    await runtime.stop().catch(() => undefined)
    rmSync(root, { recursive: true, force: true })
  }

  return { engine, bridge, call, fetched, done }
}

test('6 个 web 工具走真实 /api/web/*：创建→执行→分析→巡检→规避报告→控制', async () => {
  const h = await build()
  const execution = { agent: { session: { id: 'session-harness-p15' } } }
  try {
    const created = await h.call('web_session_create', {
      origin: ORIGIN,
      label: 'p1-5',
      request_budget: 5,
      auth: { Authorization: 'Bearer SUPER-SECRET' }
    }, execution)
    const sessionId = created.session.sessionId as string
    assert.match(sessionId, /^ws-/u)
    assert.equal(created.session.agentSession, undefined, 'REST 不把 agentSession 回显给工具')
    assert.equal(created.policy.allowed_origins[0], ORIGIN)
    assert.equal(JSON.stringify(created).includes('SUPER-SECRET'), false)

    const first = await h.call('web_request_execute', {
      session_id: sessionId, method: 'GET', path: '/'
    }, execution)
    assert.equal(first.record.status, 200)
    assert.equal(first.record.requestHeaders.authorization, '***')
    assert.equal(first.signals.forms, 1)
    assert.equal(first.signals.title, '控制台')
    assert.equal(JSON.stringify(first).includes('SUPER-SECRET'), false)
    const firstId = first.record.requestId as string

    const second = await h.call('web_request_execute', {
      session_id: sessionId, method: 'GET', path: '/inbox'
    }, execution)
    assert.equal(second.record.path, '/inbox')
    assert.equal(h.fetched.length, 2)

    const analyzed = await h.call('web_response_analyze', {
      session_id: sessionId, request_id: firstId, mode: 'structure'
    }, execution)
    assert.equal(analyzed.mode, 'structure')
    assert.equal(analyzed.requestId, firstId)
    assert.equal(analyzed.structure.forms.length, 1)
    assert.equal(analyzed.structure.forms[0].method, 'POST')

    const inspected = await h.call('web_session_inspect', {
      session_id: sessionId, limit: 1, request_id: firstId
    }, execution)
    assert.equal(inspected.stats.total, 2)
    assert.equal(inspected.history.length, 1)
    assert.equal(inspected.history[0].requestId, firstId)
    assert.equal(inspected.budgetLeft, 3)

    const evasion = await h.call('web_evasion_report', {
      session_id: sessionId, limit: 10
    }, execution)
    assert.equal(evasion.totals.logical_requests, 2)
    assert.equal(evasion.totals.attempts, 2)
    assert.equal(evasion.session.sessionId, sessionId)

    await assert.rejects(
      h.call('web_session_inspect', { session_id: sessionId }, { agent: { session: { id: 'session-other' } } }),
      /属于另一个 Harness 会话/u
    )

    const paused = await h.call('web_session_control', { session_id: sessionId, action: 'pause' }, execution)
    assert.equal(paused.session.status, 'paused')
    const resumed = await h.call('web_session_control', { session_id: sessionId, action: 'resume' }, execution)
    assert.equal(resumed.session.status, 'active')
    const reset = await h.call('web_session_control', { session_id: sessionId, action: 'reset_budget', budget: 3 }, execution)
    assert.equal(reset.session.requestBudget, 3)
    const closed = await h.call('web_session_control', { session_id: sessionId, action: 'close' }, execution)
    assert.equal(closed.session.status, 'closed')
  } finally {
    await h.done()
  }
})

test('core REST 自行拒绝非法 control.action，并接受 inspect 的 limit/request_id', async () => {
  const h = await build()
  const execution = { agent: { session: { id: 'session-harness-p15-rest' } } }
  try {
    const created = await h.call('web_session_create', { origin: ORIGIN }, execution)
    const sessionId = created.session.sessionId as string
    await assert.rejects(
      h.bridge(`/api/web/sessions/${sessionId}/control`, {
        method: 'POST',
        headers: { 'x-vexnar-session': 'session-harness-p15-rest' },
        body: { action: 'destroy' }
      }),
      /400 .*action 只能是/u
    )
    const inspected = await h.bridge(`/api/web/sessions/${sessionId}?limit=1&request_id=missing`, {
      headers: { 'x-vexnar-session': 'session-harness-p15-rest' }
    })
    assert.equal(inspected.history.length, 0)
  } finally {
    await h.done()
  }
})