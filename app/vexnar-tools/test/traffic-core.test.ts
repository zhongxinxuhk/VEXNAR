// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 工具面到真实 core 路由的契约：用临时 SQLite + 临时归档索引启动一份 Hono
 * app，再把 `@vexnar/dsh-tools` 的流量工具接到它上面。
 *
 * 这里不启动 dsh，也不经过 HTTP 端口；桥的形状与 `@vexnar/dsh-account` 的
 * `vexnarCore.request` 一致（JSON 走 text，blob 走 base64）。目的是钉住四件
 * 容易漂移的事：host 过滤同时命中 local/archive、q 不把归档元数据当正文、
 * traffic_get 能取两侧原文、traffic_blob 能还原超限正文。
 */

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test, { after } from 'node:test'
import { Hono } from 'hono'
import { apply } from '../index.ts'

interface RegisteredTool {
  name: string
  execute: (args: Record<string, unknown>, execution: unknown) => Promise<unknown>
}

interface BridgeInit {
  method?: string
  response?: 'json' | 'base64'
}

const root = await mkdtemp(join(tmpdir(), 'vexnar-tools-core-'))
process.env.VEXNAR_HOME = root
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_STORE_ROOT = join(root, 'store')
process.env.VEXNAR_SQLITE_PATH = join(root, 'store', 'vexnar.sqlite')
process.env.VEXNAR_TRAFFIC_DIR = join(root, 'traffic')
await mkdir(join(root, 'traffic', '_index'), { recursive: true })

const archive = new DatabaseSync(join(root, 'traffic', '_index', 'index.sqlite'))
archive.exec(`CREATE TABLE exchanges (
  id TEXT PRIMARY KEY, ts INTEGER, host TEXT, method TEXT, url_template TEXT, url TEXT,
  status INTEGER, content_type TEXT, req_len INTEGER, resp_len INTEGER, path TEXT)`)
archive.exec(`CREATE TABLE exchange_bodies (
  id TEXT PRIMARY KEY, req_head TEXT NOT NULL DEFAULT '', req_body BLOB, req_blob TEXT,
  resp_head TEXT NOT NULL DEFAULT '', resp_body BLOB, resp_blob TEXT)`)
archive.prepare('INSERT INTO exchanges VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
  'arch-1', 1700000000, 'shared.test', 'GET', '/history', 'https://shared.test/history',
  200, 'text/plain', 22, 24, '/history'
)
archive.prepare('INSERT INTO exchange_bodies VALUES (?,?,?,?,?,?,?)').run(
  'arch-1', 'GET /history HTTP/1.1\nHost: shared.test', Buffer.from('archive request'),
  '', 'HTTP/1.1 200 OK\nContent-Type: text/plain', Buffer.from('archive response'), ''
)
archive.close()

const core = await import(new URL('../../vexnar-core/src/routes/traffic.ts', import.meta.url).href) as {
  register: (app: Hono) => void
  recordExchange: (exchange: Record<string, unknown>) => Promise<{ id: string }>
}
const app = new Hono()
core.register(app)

const calls: string[] = []
const bridge = {
  async request(path: string, init: BridgeInit = {}): Promise<unknown> {
    calls.push(path)
    const response = await app.request(path, { method: init.method ?? 'GET' })
    if (init.response === 'base64') {
      const buffer = Buffer.from(await response.arrayBuffer())
      if (!response.ok) throw new Error(buffer.toString('utf8'))
      return {
        base64: buffer.toString('base64'),
        bytes: buffer.length,
        content_type: response.headers.get('content-type') ?? 'application/octet-stream'
      }
    }
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

const big = Buffer.alloc(300 * 1024, 97)
const local = await core.recordExchange({
  id: 'local-1', ts: 1700000100, host: 'shared.test', method: 'POST', url: 'https://shared.test/api',
  status: 201, content_type: 'application/octet-stream',
  req_head: 'POST /api HTTP/1.1\nHost: shared.test',
  resp_head: 'HTTP/1.1 201 Created', req_body: 'request-body', resp_body: big
})

async function run(name: string, args: Record<string, unknown>): Promise<any> {
  const tool = registered.get(name)
  assert.ok(tool, `${name} 未注册`)
  return await tool.execute(args, {})
}

test('流量三件套能读真实 local + archive，并还原 blob', async () => {
  assert.deepEqual([...registered.keys()].sort(), ['bind_finding_traffic', 'capture_control', 'report_finding', 'traffic_blob', 'traffic_get', 'traffic_search'])

  const list = await run('traffic_search', { host: 'shared.test', size: 10, path: '/api/secret' })
  assert.equal(list.total, 2)
  assert.deepEqual(list.exchanges.map((row: any) => [row.id, row.source]), [
    ['local-1', 'local'],
    ['arch-1', 'archive']
  ])
  assert.ok(calls.at(-1)?.startsWith('/api/traffic?'))
  assert.equal(calls.at(-1)?.includes('/api/secret'), false)

  const byUrl = await run('traffic_search', { q: 'history', size: 10 })
  assert.equal(byUrl.total, 1)
  assert.equal(byUrl.exchanges[0].id, 'arch-1')

  const byStatus = await run('traffic_search', { status: '2xx', size: 10 })
  assert.equal(byStatus.total, 2)

  const localRaw = await run('traffic_get', { id: 'local-1' })
  assert.ok(localRaw.req.includes('POST /api'))
  assert.ok(localRaw.resp.includes('@blob sha256:'))
  const hash = /@blob sha256:([0-9a-f]{64})/u.exec(localRaw.resp)?.[1]
  assert.ok(hash)

  const archiveRaw = await run('traffic_get', { id: 'arch-1' })
  assert.ok(archiveRaw.req.includes('archive request'))
  assert.ok(archiveRaw.resp.includes('archive response'))

  const blob = await run('traffic_blob', { hash: hash!.toUpperCase() })
  assert.equal(blob.bytes, big.length)
  assert.equal(blob.encoding, 'base64')
  const decoded = Buffer.from(blob.data, 'base64')
  assert.equal(decoded.length, big.length)
  assert.equal(decoded[0], 97)
  assert.equal(calls.at(-1), `/api/traffic/blob?hash=${hash}`)
  assert.ok(local.id === 'local-1')

  const missing = await run('traffic_search', { host: 'nope.test' })
  assert.equal(missing.total, 0)
})

after(async () => {
  await rm(root, { recursive: true, force: true })
})