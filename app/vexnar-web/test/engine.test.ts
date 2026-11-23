// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

import { MockAgent, fetch as undiciFetch } from 'undici'

import { WebTestingEngine } from '../src/engine.ts'
import { PolicyError } from '../src/policy.ts'

const ORIGIN = 'https://target.example'

function harness(policy: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vexnar-web-'))
  const mock = new MockAgent()
  mock.disableNetConnect()
  const engine = new WebTestingEngine({
    root,
    policy: { minIntervalMs: 0, maxRequestsPerWindow: 100, ...policy },
    fetchImpl: (url, init) => undiciFetch(url, { ...init, dispatcher: mock } as never) as unknown as Promise<Response>
  })
  const pool = mock.get(ORIGIN)
  return { engine, mock, pool, root, done: async () => { await engine.close(); mock.close(); rmSync(root, { recursive: true, force: true }) } }
}

const HTML = `<!doctype html><html><head><title>登录</title></head><body>
<form method="post" action="/login"><input name="user"><input name="pass" type="password"><input type="hidden" name="csrf" value="t0ken"></form>
<a href="/inbox">收件箱</a><script src="/app.js"></script><!-- build: dev --></body></html>`

test('创建会话 → 执行 → 落库 → 记录可回溯且不含凭据', async () => {
  const h = harness()
  const { session } = await h.engine.createSession({ origin: ORIGIN, label: 'ctf', auth: { Authorization: 'Bearer SUPER-SECRET' } })
  h.pool.intercept({ path: '/', method: 'GET' }).reply(200, HTML, { headers: { 'content-type': 'text/html' } })

  const outcome = await h.engine.execute(session.sessionId, { method: 'GET', path: '/' })
  assert.equal(outcome.record.status, 200)
  assert.equal(outcome.record.classification, 'normal')
  assert.equal(outcome.signals.forms, 1)
  assert.equal(outcome.signals.title, '登录')
  assert.equal(outcome.signals.links, 1)
  assert.equal(outcome.record.requestHeaders.authorization, '***', 'Authorization 必须脱敏')
  assert.ok(!outcome.excerpt.includes('csrf'), '片段不应包含表单隐藏值所在的原始标签')

  const stored = h.engine.store.getExchange(outcome.record.requestId)
  assert.ok(stored)
  assert.equal(stored!.evidence.length, 0, '回读记录不携带内存证据列表')

  const inspected = h.engine.inspect(session.sessionId)
  assert.equal(inspected.stats.byClassification.normal, 1)
  assert.equal(inspected.budgetLeft, session.requestBudget - 1)

  // 密文落库：SQLite 里不能出现凭空可读的令牌或正文。
  const db = new DatabaseSync(join(h.root, 'web.sqlite'))
  const payloads = db.prepare('SELECT payload FROM web_evidence').all() as Array<{ payload: string }>
  assert.ok(payloads.length >= 2)
  assert.ok(payloads.every((row) => !row.payload.includes('SUPER-SECRET')))
  assert.ok(payloads.every((row) => !row.payload.includes('收件箱')))
  const vault = db.prepare('SELECT payload FROM web_vault').all() as Array<{ payload: string }>
  assert.ok(vault.every((row) => !row.payload.includes('SUPER-SECRET')))
  db.close()
  await h.done()
})

test('凭据留在 Vault：Cookie 由引擎带上，Agent 侧看不到值', async () => {
  const h = harness({ allowWrite: true })
  const { session } = await h.engine.createSession({ origin: ORIGIN })
  let seenCookie = ''
  h.pool.intercept({ path: '/login', method: 'POST' }).reply((options) => {
    const headers = options.headers as Record<string, string>
    seenCookie = String(headers.cookie ?? '')
    return { statusCode: 200, data: 'ok', responseOptions: { headers: { 'set-cookie': 'sid=abc123; Path=/', 'content-type': 'text/plain' } } }
  })
  h.pool.intercept({ path: '/me', method: 'GET' }).reply((options) => {
    const headers = options.headers as Record<string, string>
    seenCookie = String(headers.cookie ?? '')
    return { statusCode: 200, data: '{"ok":true}', responseOptions: { headers: { 'content-type': 'application/json' } } }
  })

  await h.engine.execute(session.sessionId, { method: 'POST', path: '/login', approvedWrite: true })
  const second = await h.engine.execute(session.sessionId, { method: 'GET', path: '/me' })
  assert.ok(seenCookie.includes('sid=abc123'), '第二个请求应自动带上 Set-Cookie 的会话')
  assert.equal(second.record.requestHeaders.cookie, '***', '记录里 Cookie 必须脱敏')
  assert.deepEqual(second.signals.jsonKeys, ['ok'])
  await h.done()
})

test('策略：跨源 / 写批准 / 攻击性载荷 / 预算 都被拒绝', async () => {
  const h = harness({ allowWrite: false })
  const { session } = await h.engine.createSession({ origin: ORIGIN, requestBudget: 2 })
  await assert.rejects(() => h.engine.execute(session.sessionId, { method: 'GET', path: 'https://evil.example/' }), (error: unknown) => {
    assert.ok(error instanceof PolicyError)
    assert.equal(error.code, 'OUT_OF_SCOPE')
    return true
  })
  await assert.rejects(
    () => h.engine.execute(session.sessionId, { method: 'POST', path: '/x', approvedWrite: true }),
    (error: unknown) => (error as { code?: string }).code === 'WRITE_NOT_APPROVED'
  )
  await assert.rejects(
    () => h.engine.execute(session.sessionId, { method: 'GET', path: '/x', aggressive: true }),
    (error: unknown) => (error as { code?: string }).code === 'AGGRESSIVE_NOT_ALLOWED'
  )

  h.pool.intercept({ path: '/a', method: 'GET' }).reply(200, 'a', { headers: { 'content-type': 'text/plain' } })
  h.pool.intercept({ path: '/b', method: 'GET' }).reply(200, 'b', { headers: { 'content-type': 'text/plain' } })
  await h.engine.execute(session.sessionId, { method: 'GET', path: '/a' })
  await h.engine.execute(session.sessionId, { method: 'GET', path: '/b' })
  await assert.rejects(
    () => h.engine.execute(session.sessionId, { method: 'GET', path: '/c' }),
    (error: unknown) => (error as { code?: string }).code === 'BUDGET_EXHAUSTED'
  )
  await h.done()
})

test('去重：同 method+URL 的只读请求复用结果，不再打站点', async () => {
  const h = harness()
  const { session } = await h.engine.createSession({ origin: ORIGIN })
  let hits = 0
  h.pool.intercept({ path: '/same', method: 'GET' }).reply(() => {
    hits += 1
    return { statusCode: 200, data: 'same-body', responseOptions: { headers: { 'content-type': 'text/plain' } } }
  })
  const first = await h.engine.execute(session.sessionId, { method: 'GET', path: '/same' })
  const second = await h.engine.execute(session.sessionId, { method: 'GET', path: '/same' })
  assert.equal(hits, 1, '第二次应走复用，不应再次请求')
  assert.equal(first.record.deduplicated, false)
  assert.equal(second.record.deduplicated, true)
  assert.equal(second.record.parentRequestId, first.record.requestId)
  assert.equal(second.excerpt, first.excerpt)
  assert.equal(second.record.sequence, first.record.sequence + 1)
  await h.done()
})

test('重定向：同源跟随并计数，跨源立即阻断并留痕', async () => {
  const h = harness()
  const { session } = await h.engine.createSession({ origin: ORIGIN })
  h.pool.intercept({ path: '/start', method: 'GET' }).reply(302, '', { headers: { location: '/next' } })
  h.pool.intercept({ path: '/next', method: 'GET' }).reply(200, 'arrived', { headers: { 'content-type': 'text/plain' } })
  const followed = await h.engine.execute(session.sessionId, { method: 'GET', path: '/start' })
  assert.equal(followed.record.status, 200)
  assert.match(followed.record.note, /redirects=1/)

  h.pool.intercept({ path: '/out', method: 'GET' }).reply(302, '', { headers: { location: 'https://evil.example/' } })
  const blocked = await h.engine.execute(session.sessionId, { method: 'GET', path: '/out' })
  assert.equal(blocked.record.status, 302, '跨源重定向不跟随，保留原响应')
  const events = h.engine.inspect(session.sessionId).policyEvents
  assert.ok(events.some((event) => event.kind === 'redirect_blocked'))
  await h.done()
})

test('限流熔断：429 立刻 blocked，后续请求被拒；resume 后可继续', async () => {
  const h = harness()
  const { session } = await h.engine.createSession({ origin: ORIGIN })
  h.pool.intercept({ path: '/limited', method: 'GET' }).reply(429, 'slow down', { headers: { 'retry-after': '30', 'content-type': 'text/plain' } })
  const outcome = await h.engine.execute(session.sessionId, { method: 'GET', path: '/limited' })
  assert.equal(outcome.record.classification, 'rate_limited')
  assert.equal(outcome.paused, true)
  assert.equal(h.engine.store.getSession(session.sessionId)!.status, 'blocked')
  await assert.rejects(
    () => h.engine.execute(session.sessionId, { method: 'GET', path: '/' }),
    (error: unknown) => (error as { code?: string }).code === 'SESSION_BLOCKED'
  )

  h.engine.control(session.sessionId, 'resume')
  h.pool.intercept({ path: '/again', method: 'GET' }).reply(200, 'ok', { headers: { 'content-type': 'text/plain' } })
  const again = await h.engine.execute(session.sessionId, { method: 'GET', path: '/again' })
  assert.equal(again.record.classification, 'normal')
  await h.done()
})

test('分析：structure 提取表单，diff 判定回显与状态变化', async () => {
  const h = harness()
  const { session } = await h.engine.createSession({ origin: ORIGIN })
  h.pool.intercept({ path: '/search', method: 'GET' }).reply(200, HTML, { headers: { 'content-type': 'text/html' } })
  h.pool.intercept({ path: '/search?q=marker123', method: 'GET' })
    .reply(500, `${HTML} marker123`, { headers: { 'content-type': 'text/html' } })

  const base = await h.engine.execute(session.sessionId, { method: 'GET', path: '/search' })
  const candidate = await h.engine.execute(session.sessionId, { method: 'GET', path: '/search?q=marker123' })

  const structure = h.engine.analyze(session.sessionId, base.record.requestId, { mode: 'structure' })
  assert.equal(structure.structure!.forms.length, 1)
  assert.equal(structure.structure!.forms[0].inputs.find((item) => item.name === 'csrf')?.hasValue, true)

  const diff = h.engine.analyze(session.sessionId, candidate.record.requestId, {
    mode: 'diff', baselineRequestId: base.record.requestId
  })
  assert.equal(diff.diff!.statusChanged, true)
  assert.equal(diff.diff!.status.to, 500)
  assert.equal(diff.diff!.reflected, true, 'marker123 应被判定为回显')
  assert.equal(diff.diff!.classification.to, 'server_error')
  await h.done()
})

test('会话隔离：另一个 Harness 会话不能操作本会话', async () => {
  const h = harness()
  const { session } = await h.engine.createSession({ origin: ORIGIN }, 'harness-a')
  await assert.rejects(
    () => h.engine.execute(session.sessionId, { method: 'GET', path: '/' }, 'harness-b'),
    /另一个 Harness 会话/
  )
  assert.equal(h.engine.listSessions('harness-b').length, 0)
  assert.equal(h.engine.listSessions('harness-a').length, 1)
  await h.done()
})
