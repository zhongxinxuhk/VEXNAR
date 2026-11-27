// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 工具面注册契约：12 个工具名、每个工具允许访问的 core 路径，以及桥对
 * 未登记路径的 404。
 *
 * 这里刻意不经过 HTTP 端口，也不复制 core 业务：`apply()` 收到的是记录调用的
 * 假桥，生产代码里的 `guardedCore()` 会在调用假桥之前先按显式白名单拦一次。
 * 这样任何“从参数拼出任意 core 路由”的回归都会在断言里露出来。
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  apply,
  CORE_ROUTES,
  CorePathNotFoundError,
  guardedCore,
  type CoreBridge,
  type ToolContext
} from '../index.ts'

interface RegisteredTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (args: unknown, execution: unknown) => Promise<unknown>
}

interface BridgeInit {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  response?: 'json' | 'base64'
}

interface CoreCall {
  path: string
  init?: BridgeInit
}

interface Case {
  name: string
  args: Record<string, unknown>
  path: string
  method: 'GET' | 'POST'
}

const EXPECTED_TOOLS = [
  'bind_finding_traffic',
  'capture_control',
  'report_finding',
  'traffic_blob',
  'traffic_get',
  'traffic_search',
  'web_evasion_report',
  'web_request_execute',
  'web_response_analyze',
  'web_session_control',
  'web_session_create',
  'web_session_inspect'
]

const EXECUTION = { agent: { session: { id: 'session-chat-abc' } } }
const WEB_HEADER = { 'x-vexnar-session': 'session-chat-abc' }

const calls: CoreCall[] = []
const core: CoreBridge = {
  async request(path: string, init: BridgeInit = {}): Promise<unknown> {
    calls.push({ path, init })
    if (path.startsWith('/api/traffic/blob?')) {
      return { base64: Buffer.from('ok').toString('base64'), bytes: 2, content_type: 'text/plain' }
    }
    if (path === '/api/web/sessions' && init.method === 'POST') {
      return {
        session: { sessionId: 'ws-1', origin: 'https://web.example', status: 'active' },
        policy: {}
      }
    }
    return { ok: true }
  }
}

const tools = new Map<string, RegisteredTool>()
apply({
  tools: {
    register(tool: RegisteredTool): () => void {
      tools.set(tool.name, tool)
      return () => tools.delete(tool.name)
    }
  },
  vexnarCore: core
} as unknown as ToolContext)

const CASES: Case[] = [
  {
    name: 'traffic_search',
    method: 'GET',
    args: {
      host: 'target.test',
      method: 'GET',
      q: 'login',
      status: '2xx',
      resp_min: 1,
      resp_max: 999,
      sort: 'ts',
      order: 'asc',
      page: 0,
      size: 10
    },
    path: '/api/traffic?host=target.test&method=GET&q=login&status=2xx&resp_min=1&resp_max=999&sort=ts&order=asc&page=0&size=10'
  },
  {
    name: 'traffic_get',
    method: 'GET',
    args: { id: 'ex-1' },
    path: '/api/traffic/exchange?id=ex-1'
  },
  {
    name: 'traffic_blob',
    method: 'GET',
    args: { hash: 'a'.repeat(64) },
    path: `/api/traffic/blob?hash=${'a'.repeat(64)}`
  },
  {
    name: 'capture_control',
    method: 'GET',
    args: { action: 'status' },
    path: '/api/sessions/chat-abc/traffic/endpoint'
  },
  {
    name: 'capture_control',
    method: 'POST',
    args: { action: 'start' },
    path: '/api/sessions/chat-abc/traffic/capture'
  },
  {
    name: 'capture_control',
    method: 'POST',
    args: { action: 'stop' },
    path: '/api/sessions/chat-abc/traffic/capture'
  },
  {
    name: 'report_finding',
    method: 'POST',
    args: {
      task_id: '7',
      vulnclass: 'XSS',
      severity: 'high',
      summary: '反射型 XSS',
      evidence: '<script>alert(1)</script>'
    },
    path: '/api/exploration/findings'
  },
  {
    name: 'bind_finding_traffic',
    method: 'POST',
    args: { finding_id: '42', traffic_refs: [{ traffic_id: 'ex-1', role: 'proof' }] },
    path: '/api/exploration/findings/42/traffic'
  },
  {
    name: 'web_session_create',
    method: 'POST',
    args: { origin: 'https://web.example', label: 'registration' },
    path: '/api/web/sessions'
  },
  {
    name: 'web_request_execute',
    method: 'POST',
    args: { session_id: 'ws-1', method: 'POST', path: '/login', body: 'user=admin' },
    path: '/api/web/sessions/ws-1/requests'
  },
  {
    name: 'web_response_analyze',
    method: 'POST',
    args: { session_id: 'ws-1', request_id: 'rq-1', mode: 'diff' },
    path: '/api/web/sessions/ws-1/analyze'
  },
  {
    name: 'web_session_inspect',
    method: 'GET',
    args: { session_id: 'ws-1', limit: 20, request_id: 'rq-1' },
    path: '/api/web/sessions/ws-1?limit=20&request_id=rq-1'
  },
  {
    name: 'web_evasion_report',
    method: 'GET',
    args: { session_id: 'ws-1', test_case_id: 'tc-1', limit: 300 },
    path: '/api/web/sessions/ws-1/evasion?test_case_id=tc-1&limit=300'
  },
  {
    name: 'web_session_control',
    method: 'POST',
    args: { session_id: 'ws-1', action: 'reset_budget', budget: 30 },
    path: '/api/web/sessions/ws-1/control'
  }
]

const POISON = { route: '/api/secret', url: 'https://evil.example/api/secret', core_path: '/api/secret' }

test('注册的工具名精确等于 12 个白名单工具，描述不承诺任意路径', () => {
  assert.equal(tools.size, 12, `实际注册 ${tools.size} 个工具`)
  assert.deepEqual([...tools.keys()].sort(), EXPECTED_TOOLS)
  assert.deepEqual([...new Set(CORE_ROUTES.map((route) => route.tool))].sort(), EXPECTED_TOOLS)

  for (const [name, tool] of tools) {
    assert.ok(tool.description.trim().length > 0, `${name} 缺少描述`)
    assert.equal(tool.parameters.type, 'object', `${name} 参数不是 object schema`)
    assert.equal(tool.parameters.additionalProperties, false, `${name} 未关闭额外参数`)
    const promptText = JSON.stringify({ description: tool.description, parameters: tool.parameters })
    assert.doesNotMatch(promptText, /任意\s*(?:URL|路径)/iu, `${name} 的描述暗示可以走任意路径`)
  }
})

test('每个工具只访问白名单 pathname/method，伪造参数不会进入 core 路径', async () => {
  for (const item of CASES) {
    const tool = tools.get(item.name)
    assert.ok(tool, `${item.name} 未注册`)
    calls.length = 0

    await tool.execute({ ...item.args, ...POISON }, EXECUTION)

    assert.equal(calls.length, 1, `${item.name} 应只调用一次 core`)
    const call = calls[0]!
    assert.equal(call.path, item.path, `${item.name} 的 core 路径漂移`)
    assert.equal(call.init?.method ?? 'GET', item.method, `${item.name} 的 method 漂移`)
    assert.equal(call.path.includes('/api/secret'), false, `${item.name} 把伪造 route 拼进了 core 路径`)
    assert.equal(call.path.includes('evil.example'), false, `${item.name} 把伪造 url 拼进了 core 路径`)
    if (item.name.startsWith('web_')) {
      assert.deepEqual(call.init?.headers, WEB_HEADER, `${item.name} 未带 dsh 会话隔离头`)
    } else {
      assert.equal(call.init?.headers?.['x-vexnar-session'], undefined, `${item.name} 不应带 Web 会话头`)
    }
    if (call.init?.body !== undefined) {
      const body = JSON.stringify(call.init.body)
      assert.equal(body.includes('/api/secret'), false, `${item.name} 把伪造路径写进了 body`)
    }
  }

  const covered = new Set(CASES.map((item) => `${item.method} ${new URL(item.path, 'http://core.local').pathname}`))
  assert.equal(covered.size, CORE_ROUTES.length, '白名单与测试覆盖的 pathname/method 数量不一致')
  for (const key of covered) {
    const [method, pathname] = key.split(' ')
    assert.ok(
      CORE_ROUTES.some((route) => route.method === method && route.pattern.test(pathname!)),
      `测试路径不在白名单：${key}`
    )
  }
})

test('guardedCore 对未登记路径返回 404，且不触达底层 core', async () => {
  let reached = 0
  const bridge = guardedCore({
    async request(): Promise<unknown> {
      reached += 1
      return { ok: true }
    }
  })

  await assert.rejects(
    bridge.request('/api/secret?x=1'),
    (error: unknown) => error instanceof CorePathNotFoundError &&
      error.status === 404 &&
      error.path === '/api/secret' &&
      error.method === 'GET'
  )
  await assert.rejects(
    bridge.request('/api/traffic', { method: 'POST' }),
    (error: unknown) => error instanceof CorePathNotFoundError && error.status === 404
  )
  await assert.rejects(
    bridge.request('https://evil.example/api/traffic'),
    (error: unknown) => error instanceof CorePathNotFoundError && error.status === 404
  )
  assert.equal(reached, 0, '未登记路径不能触达底层 core')

  const allowed = await bridge.request('/api/traffic?host=target.test')
  assert.deepEqual(allowed, { ok: true })
  assert.equal(reached, 1, '白名单路径应正常过桥')
})