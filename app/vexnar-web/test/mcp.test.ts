// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { MockAgent, fetch as undiciFetch } from 'undici'

import { WebTestingEngine } from '../src/engine.ts'
import { startMcpServer } from '../src/mcp.ts'

const ORIGIN = 'https://mcp.example'

async function rpc(url: string, token: string, payload: unknown): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-vexnar-session': 'harness-a' },
    body: JSON.stringify(payload)
  })
  return { status: response.status, body: await response.json().catch(() => null) }
}

test('MCP：令牌校验、工具清单、四步闭环可跑通', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vexnar-web-mcp-'))
  const mock = new MockAgent()
  mock.disableNetConnect()
  const engine = new WebTestingEngine({
    root,
    policy: { minIntervalMs: 0 },
    fetchImpl: (url, init) => undiciFetch(url, { ...init, dispatcher: mock } as never) as unknown as Promise<Response>
  })
  const pool = mock.get(ORIGIN)
  pool.intercept({ path: '/', method: 'GET' }).reply(200, '<html><head><title>首页</title></head><body><form action="/s" method="get"><input name="q"></form></body></html>', {
    headers: { 'content-type': 'text/html' }
  })

  const server = await startMcpServer({ engine, token: 'test-token', port: 0 })
  try {
    const unauthorized = await fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })
    })
    assert.equal(unauthorized.status, 401)

    const init = await rpc(server.url, 'test-token', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    assert.equal(init.body.result.protocolVersion, '2025-06-18')

    const list = await rpc(server.url, 'test-token', { jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const names = list.body.result.tools.map((tool: any) => tool.name)
    assert.deepEqual(names.sort(), [
      'web_evasion_report', 'web_request_execute', 'web_response_analyze',
      'web_session_control', 'web_session_create', 'web_session_inspect'
    ])

    const created = await rpc(server.url, 'test-token', {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'web_session_create', arguments: { origin: ORIGIN, label: 'mcp-test' } }
    })
    const sessionId = created.body.result.structuredContent.session.sessionId
    assert.ok(sessionId.startsWith('ws-'))
    assert.ok(!JSON.stringify(created.body).includes('SUPER-SECRET'))

    const executed = await rpc(server.url, 'test-token', {
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'web_request_execute', arguments: { session_id: sessionId, method: 'GET', path: '/' } }
    })
    const record = executed.body.result.structuredContent.record
    assert.equal(record.status, 200)
    assert.equal(executed.body.result.isError, false)
    assert.match(executed.body.result.content[0].text, /200 \(normal\)/)

    const analyzed = await rpc(server.url, 'test-token', {
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'web_response_analyze', arguments: { session_id: sessionId, request_id: record.requestId } }
    })
    assert.match(analyzed.body.result.content[0].text, /表单 1/)

    const inspected = await rpc(server.url, 'test-token', {
      jsonrpc: '2.0', id: 6, method: 'tools/call',
      params: { name: 'web_session_inspect', arguments: { session_id: sessionId } }
    })
    assert.equal(inspected.body.result.structuredContent.stats.total, 1)

    // 另一个 Harness 会话不能接管：MCP 头固定 harness-a，这里显式传别的 session 走工具参数。
    const denied = await rpc(server.url, 'test-token', {
      jsonrpc: '2.0', id: 7, method: 'tools/call',
      params: { name: 'web_session_inspect', arguments: { session_id: sessionId, session: 'harness-b' } }
    })
    assert.equal(denied.body.result.isError, true)
    assert.match(denied.body.result.content[0].text, /另一个 Harness 会话/)
  } finally {
    await server.close()
    await engine.close()
    mock.close()
    rmSync(root, { recursive: true, force: true })
  }
})
