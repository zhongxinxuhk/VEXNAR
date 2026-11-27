// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

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
  init?: Record<string, unknown>
}

const tools = new Map<string, RegisteredTool>()
const calls: CoreCall[] = []

const core = {
  async request(path: string, init?: Record<string, unknown>): Promise<unknown> {
    calls.push({ path, init })
    if (path.startsWith('/api/sessions/')) {
      const action = String((init?.body as { action?: string } | undefined)?.action ?? 'status')
      const active = action !== 'stop'
      return {
        ok: action !== 'status',
        enabled: active,
        scope: 'session-chat-abc',
        proxy: active ? 'http://127.0.0.1:12345' : '',
        ca_pem_url: '/api/traffic/mitm/ca.pem',
        capture: {
          source: 'yakit',
          started_at: active ? 1700000000 : 0,
          stopped_at: active ? 0 : 1700000001
        },
        summary: { active, items: 2, last_ts: 1700000000 },
        ingest_url: 'http://127.0.0.1:3099/api/traffic/ingest',
        hook: 'hook-script'
      }
    }
    if (path.startsWith('/api/traffic/blob?')) {
      return { base64: Buffer.from('hello').toString('base64'), bytes: 5, content_type: 'application/octet-stream' }
    }
    if (path.startsWith('/api/traffic/exchange?')) {
      return { req: 'GET / HTTP/1.1', resp: 'HTTP/1.1 200 OK' }
    }
    return { total: 1, exchanges: [{ id: 'ex-1', source: 'local' }] }
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

async function run(name: string, args: Record<string, unknown>, execution: unknown = {}): Promise<unknown> {
  const tool = tools.get(name)
  assert.ok(tool, `${name} 未注册`)
  return await tool.execute(args, execution)
}

test('apply 注册流量三件套与 capture_control', () => {
  assert.deepEqual([...tools.keys()].sort(), ['capture_control', 'traffic_blob', 'traffic_get', 'traffic_search'])
  for (const tool of tools.values()) {
    assert.ok(tool.description.length > 0)
    assert.equal(tool.parameters.type, 'object')
  }
})

test('traffic_search 只把白名单过滤字段转成 /api/traffic query', async () => {
  calls.length = 0
  const result = await run('traffic_search', {
    host: 'Example.com',
    method: 'get',
    q: 'token',
    status: '4xx',
    resp_min: 10,
    resp_max: 20,
    sort: 'resp_len',
    order: 'asc',
    page: 2,
    size: 50,
    path: '/etc/passwd'
  })
  assert.deepEqual(result, { total: 1, exchanges: [{ id: 'ex-1', source: 'local' }] })
  assert.equal(calls.length, 1)
  const url = new URL(calls[0].path, 'http://127.0.0.1')
  assert.equal(url.pathname, '/api/traffic')
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    host: 'Example.com',
    method: 'get',
    q: 'token',
    status: '4xx',
    resp_min: '10',
    resp_max: '20',
    sort: 'resp_len',
    order: 'asc',
    page: '2',
    size: '50'
  })
  assert.equal(url.searchParams.has('path'), false)
})

test('traffic_get 读取单条原文并回填 id', async () => {
  calls.length = 0
  const result = await run('traffic_get', { id: 'a b' })
  assert.deepEqual(result, {
    id: 'a b',
    req: 'GET / HTTP/1.1',
    resp: 'HTTP/1.1 200 OK'
  })
  const url = new URL(calls[0].path, 'http://127.0.0.1')
  assert.equal(url.pathname, '/api/traffic/exchange')
  assert.equal(url.searchParams.get('id'), 'a b')
})

test('traffic_blob 用 base64 通道读取超限正文', async () => {
  calls.length = 0
  const result = await run('traffic_blob', { hash: 'A'.repeat(64) })
  assert.deepEqual(result, {
    hash: 'a'.repeat(64),
    bytes: 5,
    content_type: 'application/octet-stream',
    encoding: 'base64',
    data: Buffer.from('hello').toString('base64')
  })
  assert.deepEqual(calls[0].init, { response: 'base64' })
  const url = new URL(calls[0].path, 'http://127.0.0.1')
  assert.equal(url.pathname, '/api/traffic/blob')
  assert.equal(url.searchParams.get('hash'), 'a'.repeat(64))
})

test('capture_control 用当前 dsh 会话映射 status/start/stop', async () => {
  calls.length = 0
  const execution = { agent: { session: { id: 'session-chat-abc' } } }
  const status = await run('capture_control', { action: 'status' }, execution) as Record<string, unknown>
  assert.equal(status.scope, 'session-chat-abc')
  assert.equal(status.active, true)
  assert.equal(calls[0].path, '/api/sessions/chat-abc/traffic/endpoint')
  assert.equal(calls[0].init, undefined)

  const started = await run('capture_control', { action: 'start' }, execution) as Record<string, unknown>
  assert.equal(started.active, true)
  assert.equal(started.proxy, 'http://127.0.0.1:12345')
  assert.equal(started.started_at, 1700000000)
  assert.equal(started.items, 2)
  assert.equal(started.last_ts, 1700000000)
  assert.deepEqual(calls[1].init, { method: 'POST', body: { action: 'start' } })

  const stopped = await run('capture_control', { action: 'stop' }, execution) as Record<string, unknown>
  assert.equal(stopped.active, false)
  assert.equal(stopped.proxy, '')
  assert.equal(stopped.stopped_at, 1700000001)
  assert.deepEqual(calls[2].init, { method: 'POST', body: { action: 'stop' } })
  assert.equal(calls[2].path, '/api/sessions/chat-abc/traffic/capture')
})

test('缺失或非法参数在本地拒绝，不触碰 core', async () => {
  calls.length = 0
  await assert.rejects(async () => await run('traffic_get', { id: '   ' }), /id 不能为空/u)
  await assert.rejects(async () => await run('traffic_blob', { hash: 'nope' }), /64 位十六进制/u)
  await assert.rejects(async () => await run('capture_control', { action: 'start' }), /dsh 会话 id/u)
  await assert.rejects(async () => await run('capture_control', { action: 'start' }, { agent: { session: { id: 'bad id' } } }), /不能映射/u)
  await assert.rejects(async () => await run('capture_control', { action: 'bogus' }, { agent: { session: { id: 'ok' } } }), /status、start 或 stop/u)
  assert.equal(calls.length, 0)
})