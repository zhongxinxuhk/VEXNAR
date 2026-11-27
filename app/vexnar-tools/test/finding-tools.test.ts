// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * finding 工具的端到端契约：临时 SQLite + 真实 core 路由。
 *
 * 这里不启动 dsh，也不经过 HTTP 端口；桥直接调用 `routes.ts` 的 Hono app。
 * 目标是钉住：report_finding 真的新增 findings 行；bind_finding_traffic 通过
 * Go 等价的 `POST /api/exploration/findings/:id/traffic` 落 snapshot/binding；
 * 重复绑定不重复写入，返回的 snapshot 不含原始 head。
 */

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after } from 'node:test'

interface RegisteredTool {
  name: string
  execute: (args: Record<string, unknown>, execution: unknown) => Promise<unknown>
}

interface BridgeInit {
  method?: string
  body?: unknown
}

const root = await mkdtemp(join(tmpdir(), 'vexnar-finding-tools-'))
process.env.VEXNAR_HOME = root
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_STORE_ROOT = join(root, 'store')
process.env.VEXNAR_SQLITE_PATH = join(root, 'store', 'vexnar.sqlite')
process.env.VEXNAR_TRAFFIC_DIR = join(root, 'traffic')

const { api } = await import(new URL('../../vexnar-core/src/routes.ts', import.meta.url).href) as {
  api: { request: (path: string, init?: RequestInit) => Promise<Response> }
}
const { operations } = await import(new URL('../../vexnar-core/src/context.ts', import.meta.url).href) as {
  operations: {
    createTask: (input: { description: string; goal: string; name?: string }) => Promise<{ id: string }>
    writer: { list: (table: string) => Promise<any[]> }
  }
}
const traffic = await import(new URL('../../vexnar-core/src/routes/traffic.ts', import.meta.url).href) as {
  recordExchange: (exchange: Record<string, unknown>) => Promise<{ id: string }>
}
const { apply } = await import('../index.ts')

const bridge = {
  async request(path: string, init: BridgeInit = {}): Promise<unknown> {
    const response = await api.request(path, {
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

async function run(name: string, args: Record<string, unknown>): Promise<Record<string, any>> {
  const tool = registered.get(name)
  assert.ok(tool, `${name} 未注册`)
  return await tool.execute(args, {}) as Record<string, any>
}

test('report_finding 新增 findings，bind_finding_traffic 落 snapshot 且可重复读', async () => {
  const task = await operations.createTask({ description: 'finding 工具集成', goal: '验证证据绑定' })
  const before = (await operations.writer.list('findings')).length

  const reported = await run('report_finding', {
    task_id: task.id,
    vulnclass: 'XSS',
    name: '反射型 XSS',
    severity: 'high',
    summary: 'q 参数反射',
    evidence: '<script>alert(1)</script>'
  })
  assert.ok(reported.finding_id)
  assert.equal((await operations.writer.list('findings')).length, before + 1)

  const exchange = await traffic.recordExchange({
    id: 'finding-tools-1',
    ts: 1700000200,
    host: 'target.test',
    method: 'GET',
    url: 'https://target.test/search?q=%3Cscript%3E',
    status: 200,
    content_type: 'text/html',
    req_head: 'GET /search?q=%3Cscript%3E HTTP/1.1\nHost: target.test\n',
    resp_head: 'HTTP/1.1 200 OK\nContent-Type: text/html\n',
    req_body: '',
    resp_body: '<html><script>alert(1)</script></html>'
  })

  const bound = await run('bind_finding_traffic', {
    finding_id: reported.finding_id,
    traffic_refs: [{ traffic_id: exchange.id, role: 'proof', note: '复现响应' }]
  })
  assert.equal(bound.finding_id, String(reported.finding_id))
  assert.equal(bound.bindings.length, 1)
  const binding = bound.bindings[0]
  assert.equal(binding.role, 'proof')
  assert.equal(binding.note, '复现响应')
  assert.equal(binding.snapshot.source_traffic_id, exchange.id)
  assert.equal(binding.snapshot.method, 'GET')
  assert.equal(binding.snapshot.resp_hash.length, 64)
  assert.equal(binding.snapshot.req_hash, '')
  assert.equal('req_head' in binding.snapshot, false)

  const bindingRows = await operations.writer.list('finding_traffic_bindings')
  const snapshotRows = await operations.writer.list('traffic_evidence_snapshots')
  assert.equal(bindingRows.length, 1)
  assert.equal(snapshotRows.length, 1)
  assert.equal(snapshotRows[0].id, binding.snapshot_id)
  assert.equal(snapshotRows[0].snapshot.resp_hash, binding.snapshot.resp_hash)

  const read = await api.request(`/api/exploration/findings/${reported.finding_id}/traffic`)
  assert.equal(read.status, 200)
  const payload = await read.json() as any
  assert.equal(payload.bindings.length, 1)
  assert.equal(payload.bindings[0].snapshot.source_traffic_id, exchange.id)

  const again = await run('bind_finding_traffic', {
    finding_id: reported.finding_id,
    traffic_refs: [{ traffic_id: exchange.id, role: 'baseline', note: '不覆盖' }]
  })
  assert.equal(again.bindings.length, 1)
  assert.equal(again.bindings[0].role, 'proof')
  assert.equal(again.bindings[0].note, '复现响应')
  assert.equal(again.added, 0)
  assert.equal((await operations.writer.list('finding_traffic_bindings')).length, 1)

  await assert.rejects(
    run('bind_finding_traffic', {
      finding_id: reported.finding_id,
      traffic_refs: [{ traffic_id: 'missing-traffic' }]
    }),
    /流量不存在/u
  )
  assert.equal((await operations.writer.list('finding_traffic_bindings')).length, 1)
})

after(async () => {
  await rm(root, { recursive: true, force: true })
})