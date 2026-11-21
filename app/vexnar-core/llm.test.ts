// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert'

const root = mkdtempSync(join(tmpdir(), 'vexnar-llm-'))
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_STORE_ROOT = root

const { Hono } = await import('hono')
const { register } = await import('./src/routes/llm.ts')
const { operations } = await import('./src/context.ts')
const writer = operations.writer

const app = new Hono()
register(app)

/** 自测用的极简请求器：body 缺省表示无请求体（仅 GET/DELETE）。 */
async function req(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, json }
}

// 1. profiles 初始为空
let r = await req('GET', '/api/llm/profiles')
assert.equal(r.status, 200)
assert.deepEqual(r.json, { profiles: [] })

// 2. 创建两个 profile
r = await req('POST', '/api/llm/profiles', { name: 'p1', format: 'openai', model: 'gpt-4o', api_key: 'sk-1234', priority: 5 })
assert.equal(r.status, 200)
const id1 = r.json.id
assert.ok(id1 > 0)

r = await req('POST', '/api/llm/profiles', { name: 'p2', format: 'anthropic', model: 'claude', priority: 9 })
assert.equal(r.status, 200)
const id2 = r.json.id

// 3. 列表 + api_key 不泄漏
r = await req('GET', '/api/llm/profiles')
assert.equal(r.status, 200)
assert.equal(r.json.profiles.length, 2)
assert.ok(!JSON.stringify(r.json).includes('sk-1234'))

// 4. 激活 p2
r = await req('POST', '/api/llm/profiles/active', { id: id2 })
assert.equal(r.status, 200)
r = await req('GET', '/api/llm/profiles')
assert.equal(r.json.profiles.find((p: { id: string; is_default: boolean }) => p.id === String(id2)).is_default, true)
assert.equal(r.json.profiles.find((p: { id: string; is_default: boolean }) => p.id === String(id1)).is_default, false)

// 5. 删除激活配置 → 409
r = await req('DELETE', `/api/llm/profiles/${id2}`)
assert.equal(r.status, 409)

// 6. 删除非激活配置 → 200
r = await req('DELETE', `/api/llm/profiles/${id1}`)
assert.equal(r.status, 200)
r = await req('GET', '/api/llm/profiles')
assert.equal(r.json.profiles.length, 1)

// 7. records 列表：先空，再写入两条
r = await req('GET', '/api/llm/records')
assert.equal(r.status, 200)
assert.deepEqual(r.json, { records: [], total: 0 })

await writer.put({ table: 'llm_records', key: '1', record: { id: '1', ts: '2026-11-21T10:00:00Z', model: 'm', profile_name: 'p', session_id: 's', task_id: '7', worker: 'work#1', latency_ms: 10, input_tokens: 3, output_tokens: 4, cache_read: 1, cache_write: 2, status: 'ok', error: '' } })
await writer.put({ table: 'llm_records', key: '2', record: { id: '2', ts: '2026-11-21T11:00:00Z', model: 'm', profile_name: 'p', session_id: 's', task_id: '7', worker: 'work#2', latency_ms: 5, input_tokens: 1, output_tokens: 2, cache_read: 0, cache_write: 0, status: 'ok', error: '' } })

r = await req('GET', '/api/llm/records')
assert.equal(r.status, 200)
assert.equal(r.json.total, 2)
assert.equal(r.json.records.length, 2)

r = await req('GET', '/api/llm/records/tasks')
assert.equal(r.status, 200)
assert.deepEqual(r.json.tasks, [{ task_id: '7', count: 2 }])

// 8. tokens/daily：写入 activity result 后聚合
await writer.put({ table: 'activity', key: '1', record: { id: '1', exploration_id: 1, kind: 'result', worker: 'work#1', input_tokens: 10, output_tokens: 20, cache_read_tokens: 1, cache_write_tokens: 2, created_at: new Date().toISOString(), created_unix: Math.floor(Date.now() / 1000) } })

r = await req('GET', '/api/tokens/daily?days=30')
assert.equal(r.status, 200)
assert.ok(Array.isArray(r.json))
assert.ok(r.json.length >= 1)
assert.equal(r.json[0].input_tokens, 10)
assert.equal(r.json[0].output_tokens, 20)
assert.equal(r.json[0].cache_read_tokens, 1)

console.log('LLM routes self-test: ALL PASS')

rmSync(root, { recursive: true, force: true })
