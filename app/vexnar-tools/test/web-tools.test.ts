// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 6 个 web_* 工具的契约：只映射到固定 `/api/web/*` 路径，agentSession 走
 * `x-vexnar-session` 头，不把 dsh 会话当成 REST 的 `local`。
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, type ToolContext } from '../index.ts'

interface RegisteredTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (args: unknown, execution: unknown) => Promise<unknown>
}

interface CoreCall {
  path: string
  init?: Record<string, any>
}

const tools = new Map<string, RegisteredTool>()
const calls: CoreCall[] = []

const core = {
  async request(path: string, init?: Record<string, any>): Promise<unknown> {
    calls.push({ path, init })
    if (path === '/api/web/sessions' && init?.method === 'POST') {
      return {
        session: { sessionId: 'ws-test', origin: 'https://web.example', status: 'active' },
        policy: {
          allowedOrigins: ['https://web.example'], allowPrivateNetwork: false,
          maxRequestsPerSession: 12, maxRequestsPerWindow: 3, windowSeconds: 60,
          minIntervalMs: 0, maxResponseBytes: 1048576, requestTimeoutMs: 15000,
          allowWrite: false, followRedirects: 'never', aggressivePayloads: false,
          maxRedirects: 0, egressMode: 'sticky', adversarial: {}
        }
      }
    }
    if (path.endsWith('/requests')) return { record: { requestId: 'rq-1', status: 200 }, budgetLeft: 11 }
    if (path.endsWith('/analyze')) return { mode: 'structure', requestId: 'rq-1', structure: { forms: 1 } }
    if (path.includes('/evasion')) return { totals: { attempts: 1 }, mutations: [] }
    if (path.endsWith('/control')) return { session: { sessionId: 'ws-test', status: 'paused' } }
    if (path.startsWith('/api/web/sessions/ws-test')) return { session: { sessionId: 'ws-test' }, history: [], stats: {} }
    return { error: 'unexpected' }
  }
}

const ctx = {
  tools: {
    register(tool: RegisteredTool): () => void {
      tools.set(tool.name, tool)
      return () => tools.delete(tool.name)
    }
  },
  vexnarCore: core
}

apply(ctx as unknown as ToolContext)

async function run(name: string, args: Record<string, unknown>, execution: Record<string, unknown> = {}): Promise<any> {
  const tool = tools.get(name)
  assert.ok(tool, `${name} 未注册`)
  return await tool.execute(args, execution)
}

const execution = { agent: { session: { id: 'session-harness-a' } } }

test('6 个 web 工具注册，描述与参数非空', () => {
  assert.deepEqual(
    [...tools.keys()].filter((name) => name.startsWith('web_')).sort(),
    ['web_evasion_report', 'web_request_execute', 'web_response_analyze', 'web_session_control', 'web_session_create', 'web_session_inspect']
  )
  for (const name of [...tools.keys()].filter((item) => item.startsWith('web_'))) {
    const tool = tools.get(name)!
    assert.ok(tool.description.length > 0)
    assert.equal(tool.parameters.type, 'object')
    assert.equal(tool.parameters.additionalProperties, false)
  }
})

test('web_session_create 只发送白名单字段并过滤 policy', async () => {
  calls.length = 0
  const result = await run('web_session_create', {
    origin: ' https://web.example ',
    label: ' demo ',
    request_budget: 12,
    auth_profile_id: 'prod',
    auth: { Authorization: 'Bearer SECRET' },
    adversarial: true,
    session: 'other-session'
  }, execution)
  assert.equal(result.session.sessionId, 'ws-test')
  assert.equal(result.policy.allowed_origins[0], 'https://web.example')
  assert.equal('egressMode' in result.policy, false)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, '/api/web/sessions')
  assert.equal(calls[0].init?.method, 'POST')
  assert.deepEqual(calls[0].init?.headers, { 'x-vexnar-session': 'session-harness-a' })
  assert.deepEqual(calls[0].init?.body, {
    origin: 'https://web.example',
    label: 'demo',
    request_budget: 12,
    auth_profile_id: 'prod',
    auth: { Authorization: 'Bearer SECRET' },
    adversarial: true
  })
  assert.equal(JSON.stringify(result).includes('SECRET'), false)
})

test('web_request_execute 映射固定会话请求路由和字段', async () => {
  calls.length = 0
  const result = await run('web_request_execute', {
    session_id: 'ws-test',
    method: 'POST',
    path: '/api/login',
    headers: { 'content-type': 'application/json' },
    body: '{"a":1}',
    approved_write: true,
    aggressive: false,
    evade: true,
    test_case_id: 'tc-1',
    parent_request_id: 'rq-0',
    note: 'login',
    session: 'other-session'
  }, execution)
  assert.equal(result.record.requestId, 'rq-1')
  assert.equal(calls[0].path, '/api/web/sessions/ws-test/requests')
  assert.deepEqual(calls[0].init?.body, {
    method: 'POST',
    path: '/api/login',
    headers: { 'content-type': 'application/json' },
    body: '{"a":1}',
    approved_write: true,
    aggressive: false,
    evade: true,
    test_case_id: 'tc-1',
    parent_request_id: 'rq-0',
    note: 'login'
  })
  assert.deepEqual(calls[0].init?.headers, { 'x-vexnar-session': 'session-harness-a' })
})

test('analyze / inspect / evasion / control 映射 query 与 body', async () => {
  calls.length = 0
  await run('web_response_analyze', {
    session_id: 'ws-test', request_id: 'rq-1', baseline_request_id: 'rq-0', mode: 'diff'
  }, execution)
  assert.equal(calls[0].path, '/api/web/sessions/ws-test/analyze')
  assert.deepEqual(calls[0].init?.body, {
    request_id: 'rq-1', baseline_request_id: 'rq-0', mode: 'diff'
  })

  await run('web_session_inspect', {
    session_id: 'ws-test', limit: 5, request_id: 'rq-1', include: 'stats'
  }, execution)
  const inspect = new URL(calls[1].path, 'http://127.0.0.1')
  assert.equal(inspect.pathname, '/api/web/sessions/ws-test')
  assert.deepEqual(Object.fromEntries(inspect.searchParams), { limit: '5', request_id: 'rq-1' })
  assert.deepEqual(calls[1].init?.headers, { 'x-vexnar-session': 'session-harness-a' })

  await run('web_evasion_report', {
    session_id: 'ws-test', test_case_id: 'tc 1', limit: 20
  }, execution)
  const evasion = new URL(calls[2].path, 'http://127.0.0.1')
  assert.equal(evasion.pathname, '/api/web/sessions/ws-test/evasion')
  assert.deepEqual(Object.fromEntries(evasion.searchParams), { test_case_id: 'tc 1', limit: '20' })

  await run('web_session_control', {
    session_id: 'ws-test', action: 'reset_budget', budget: 30
  }, execution)
  assert.equal(calls[3].path, '/api/web/sessions/ws-test/control')
  assert.deepEqual(calls[3].init?.body, { action: 'reset_budget', budget: 30 })
})

test('web 工具本地拒绝非法参数，不触碰 core', async () => {
  calls.length = 0
  await assert.rejects(async () => await run('web_request_execute', { session_id: 'ws-test', path: '' }, execution), /path 不能为空/u)
  await assert.rejects(async () => await run('web_request_execute', { session_id: 'bad/id', path: '/' }, execution), /session_id 格式不合法/u)
  await assert.rejects(async () => await run('web_request_execute', { session_id: 'ws-test', path: '/', method: 'post' }, execution), /method 不合法/u)
  await assert.rejects(async () => await run('web_request_execute', { session_id: 'ws-test', path: '/', method: 'TRACE' }, execution), /method 不合法/u)
  await assert.rejects(async () => await run('web_request_execute', { session_id: 'ws-test', path: '/', body: 1 }, execution), /body 必须是字符串/u)
  await assert.rejects(async () => await run('web_session_control', { session_id: 'ws-test', action: 'destroy' }, execution), /action 只能是/u)
  await assert.rejects(async () => await run('web_session_inspect', { session_id: 'ws-test', limit: 0 }, execution), /limit 必须是/u)
  await assert.rejects(async () => await run('web_session_inspect', { session_id: 'ws-test', include: 'all' }, execution), /include/u)
  await assert.rejects(async () => await run('web_session_create', { origin: 'https://web.example', auth: { x: 1 } }, execution), /auth.x 必须是字符串/u)
  assert.equal(calls.length, 0)
})