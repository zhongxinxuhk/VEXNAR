// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * capture_control 的真实生命周期：用临时 store 启动 core 的 session-traffic
 * 路由，工具只通过当前 dsh 会话 id 访问。这里钉住三件事：
 *
 *   1. status 读的是同会话 endpoint，不是站点级概览；
 *   2. start 打开该 scope 的回环代理并写 trafficCaptures；
 *   3. stop 写入 stopped_at，并从 mitm 的 scope 表移除端口。
 */

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { Hono } from 'hono'
import { apply } from '../index.ts'

interface RegisteredTool {
  name: string
  execute: (args: Record<string, unknown>, execution: unknown) => Promise<unknown>
}

interface BridgeInit {
  method?: string
  body?: unknown
}

const root = await mkdtemp(join(tmpdir(), 'vexnar-capture-control-'))
process.env.VEXNAR_HOME = root
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_STORE_ROOT = join(root, 'store')
process.env.VEXNAR_SQLITE_PATH = join(root, 'store', 'vexnar.sqlite')
process.env.VEXNAR_TRAFFIC_DIR = join(root, 'traffic')

const routeModule = await import(new URL('../../vexnar-core/src/routes/session-traffic.ts', import.meta.url).href) as {
  register: (app: Hono) => void
}
const captureState = await import(new URL('../../vexnar-core/src/capture-state.ts', import.meta.url).href) as {
  captureOf: (scope: string) => Promise<{ started_at: number; stopped_at: number } | null>
}
const mitmModule = await import(new URL('../../vexnar-core/src/traffic-proxy/index.ts', import.meta.url).href) as {
  mitmProxy: () => { status: () => { scopes: Array<{ scope: string; proxy: string }> } }
  stopMitmProxy: () => void
}

const app = new Hono()
routeModule.register(app)

const bridge = {
  async request(path: string, init: BridgeInit = {}): Promise<unknown> {
    const response = await app.request(path, {
      method: init.method ?? 'GET',
      headers: { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    })
    const text = await response.text()
    const data = text ? JSON.parse(text) as { error?: string } : null
    if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`)
    return data
  }
}

const registered = new Map<string, RegisteredTool>()
apply({
  tools: {
    register(tool: RegisteredTool): () => void {
      registered.set(tool.name, tool)
      return () => undefined
    }
  },
  vexnarCore: bridge
} as never)

const execution = { agent: { session: { id: 'session-chat-abc' } } }

async function run(action: 'status' | 'start' | 'stop'): Promise<Record<string, any>> {
  const tool = registered.get('capture_control')
  assert.ok(tool, 'capture_control 未注册')
  return await tool.execute({ action }, execution) as Record<string, any>
}

test('capture_control 管理当前会话的 scope 与端口', async () => {
  const idle = await run('status')
  assert.equal(idle.scope, 'session-chat-abc')
  assert.equal(idle.active, false)
  assert.equal(idle.proxy, '')

  const started = await run('start')
  assert.equal(started.active, true)
  assert.equal(started.scope, 'session-chat-abc')
  assert.match(started.proxy, /^http:\/\/127\.0\.0\.1:\d+$/u)
  assert.ok(started.started_at > 0)
  assert.equal(started.stopped_at, 0)
  assert.ok(String(started.hook).includes('"X-Flow-Scope":        "session-chat-abc"'))
  assert.ok(mitmModule.mitmProxy().status().scopes.some((row) => row.scope === 'session-chat-abc' && row.proxy === started.proxy))
  const armed = await captureState.captureOf('session-chat-abc')
  assert.ok(armed && armed.started_at > 0 && armed.stopped_at === 0)

  const active = await run('status')
  assert.equal(active.active, true)
  assert.equal(active.proxy, started.proxy)
  assert.equal(active.started_at, started.started_at)

  const stopped = await run('stop')
  assert.equal(stopped.active, false)
  assert.equal(stopped.scope, 'session-chat-abc')
  assert.equal(stopped.proxy, '')
  assert.ok(stopped.stopped_at > 0)
  assert.equal(mitmModule.mitmProxy().status().scopes.some((row) => row.scope === 'session-chat-abc'), false)
  const disarmed = await captureState.captureOf('session-chat-abc')
  assert.ok(disarmed && disarmed.stopped_at > 0)

  const idleAgain = await run('status')
  assert.equal(idleAgain.active, false)
  assert.equal(idleAgain.proxy, '')
  assert.equal(idleAgain.stopped_at, stopped.stopped_at)
})

after(async () => {
  mitmModule.stopMitmProxy()
  await rm(root, { recursive: true, force: true })
})