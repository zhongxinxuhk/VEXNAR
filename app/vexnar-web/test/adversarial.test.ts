// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { MockAgent, fetch as undiciFetch } from 'undici'

import { DEFAULT_LIMITS, decide, initialPlan } from '../src/adversarial.ts'
import { WebTestingEngine } from '../src/engine.ts'
import { nextMutation, tamperRequest, tamperIds } from '../src/tamper.ts'
import type { PolicyConfig } from '../src/types.ts'

const ORIGIN = 'https://adv.example'

function adversarialPolicy(overrides: Partial<PolicyConfig> = {}): Partial<PolicyConfig> {
  return {
    allowedOrigins: [ORIGIN],
    minIntervalMs: 0,
    maxRequestsPerWindow: 100,
    egressMode: 'on_block',
    adversarial: { enabled: true, maxAttempts: 4, maxRotations: 3, perLevel: 1, jitterMs: 0 },
    ...overrides
  }
}

function harness(policy: Partial<PolicyConfig>) {
  const root = mkdtempSync(join(tmpdir(), 'vexnar-adv-'))
  const mock = new MockAgent()
  mock.disableNetConnect()
  const engine = new WebTestingEngine({
    root,
    policy,
    fetchImpl: (url, init) => undiciFetch(url, { ...init, dispatcher: mock } as never) as unknown as Promise<Response>
  })
  const pool = mock.get(ORIGIN)
  return {
    engine, mock, pool, root,
    done: async () => { await engine.close(); mock.close(); rmSync(root, { recursive: true, force: true }) }
  }
}

test('双开关：平台未授权 / 无白名单 / 双开 三种结果', async () => {
  // 平台关：即使会话要求也不许
  const off = harness({ ...adversarialPolicy(), adversarial: { ...DEFAULT_LIMITS, enabled: false } })
  await assert.rejects(
    () => off.engine.createSession({ origin: ORIGIN, adversarial: true }),
    (error: unknown) => (error as { code?: string }).code === 'ADVERSARIAL_NOT_ENABLED'
  )
  await off.done()

  // 平台开但无白名单：拒绝（不允许"任意站点轮换身份"）
  const noList = harness(adversarialPolicy({ allowedOrigins: [] }))
  await assert.rejects(
    () => noList.engine.createSession({ origin: ORIGIN, adversarial: true }),
    (error: unknown) => (error as { code?: string }).code === 'ADVERSARIAL_REQUIRES_ALLOWLIST'
  )
  await noList.done()

  // 双开 + 白名单：放行
  const ok = harness(adversarialPolicy())
  const { session } = await ok.engine.createSession({ origin: ORIGIN, adversarial: true })
  assert.equal(session.adversarial, true)
  await ok.done()
})

test('变异：确定性、只改值、按清单推进', () => {
  const a = tamperRequest({ path: '/s?q=1 union select 2', body: '{"user":"admin\' or 1=1"}', headers: {}, mutation: 'sql_comment', seed: 42 })
  const b = tamperRequest({ path: '/s?q=1 union select 2', body: '{"user":"admin\' or 1=1"}', headers: {}, mutation: 'sql_comment', seed: 42 })
  assert.deepEqual(a, b, '同 seed 同变异必须字节一致')
  assert.ok(decodeURIComponent(a.path).includes('/**/'), '应插入注释切分')
  assert.ok(a.path.includes('q='), '参数名不得被变异吞掉')
  assert.ok(a.path.startsWith('/s?q='), '参数名与路径不得改变')
  assert.equal(a.changed.length > 0, true)

  const none = tamperRequest({ path: '/s?q=1', body: undefined, headers: {}, mutation: 'none', seed: 1 })
  assert.equal(none.applied, 'none')
  assert.deepEqual(none.changed, [])

  // 阶梯顺序：从 none 起步逐个推进，必须覆盖整张清单
  const order = tamperIds().filter((id) => id !== 'none')
  let current = 'none' as ReturnType<typeof nextMutation>
  const seen: string[] = []
  for (let index = 0; index < order.length + 1; index++) {
    current = nextMutation(current, 0)
    seen.push(current)
  }
  // 前 N 步必须覆盖整张清单，最后一步停在末尾（不越界、不回头）。
  assert.deepEqual(seen.slice(0, order.length), order)
  assert.equal(seen[seen.length - 1], order[order.length - 1])
})

test('阶梯决策：WAF 先换载荷→再换出口→再换身份→停；429 先换出口；403 不升级', () => {
  const context = { egressCount: 2, identityCount: 2 }
  let plan = initialPlan()

  const limits = { ...DEFAULT_LIMITS, perLevel: 1, maxRotations: 6, maxAttempts: 8 }
  const actions: string[] = []
  for (let step = 0; step < 8; step++) {
    const decision = decide(plan, 'waf_blocked', limits, context)
    actions.push(decision.action)
    if (decision.action === 'stop') {
      assert.match(decision.reason, /用尽|上限/)
      break
    }
    plan = decision.plan
  }
  // 顺序：换载荷 → 换出口 → 换载荷（新出口的配额）→ 换身份（出口重置）→ …
  assert.deepEqual(actions.slice(0, 4), ['retry_payload', 'retry_egress', 'retry_payload', 'retry_identity'])
  assert.equal(actions[actions.length - 1], 'stop', '必须有终止')
  assert.ok(actions.length <= 9, `升级次数必须收敛，实际 ${actions.length}`)

  const limited = decide(initialPlan(), 'rate_limited', DEFAULT_LIMITS, context, 1200)
  assert.equal(limited.action, 'retry_egress', '429 不该刷载荷')
  assert.ok(limited.waitMs >= 1200, '应尊重 Retry-After')

  const denied = decide(initialPlan(), 'auth_denied', DEFAULT_LIMITS, context)
  assert.equal(denied.action, 'stop', '403 无 WAF 特征属权限问题，不升级')
})

test('引擎：首跳被挑战页拦下 → 换载荷后通过，记录可回溯且会话不被熔断', async () => {
  const h = harness(adversarialPolicy())
  const { session } = await h.engine.createSession({ origin: ORIGIN, adversarial: true, requestBudget: 10 })

  h.pool.intercept({ path: /.*/, method: 'GET' }).reply(403, '<title>Just a moment...</title>', {
    headers: { 'cf-mitigated': 'challenge', 'content-type': 'text/html' }
  })
  h.pool.intercept({ path: /.*/, method: 'GET' }).reply(200, '<html><head><title>通过</title></head></html>', {
    headers: { 'content-type': 'text/html' }
  })

  const outcome = await h.engine.execute(session.sessionId, { method: 'GET', path: '/search?q=1 union select 2', evade: true })
  assert.equal(outcome.attempts, 2, '应尝试两次')
  assert.equal(outcome.record.status, 200)
  assert.equal(outcome.record.attempt, 2)
  assert.notEqual(outcome.record.mutation, 'none')
  assert.ok(outcome.evasion?.actions.length, '应记录升级动作')
  assert.equal(outcome.paused, false, '升级成功后不应熔断会话')

  // 两次尝试都留痕，且第二次挂在第一次下面
  const history = h.engine.store.listExchanges(session.sessionId, 10).sort((left, right) => left.attempt - right.attempt)
  assert.equal(history.length, 2)
  assert.equal(history[0].classification, 'waf_blocked')
  assert.equal(history[1].parentRequestId, history[0].requestId)
  assert.equal(history[1].classification, 'normal')

  const report = h.engine.evasionReport(session.sessionId)
  assert.equal(report.totals.logical_requests, 1)
  assert.equal(report.totals.attempts, 2)
  assert.equal(report.totals.passed_after_escalation, 1)
  assert.ok(report.mutations.some((row) => row.passed === 1))
  await h.done()
})

test('引擎：配额耗尽一定停（不无限试探），并给出停止原因', async () => {
  const h = harness(adversarialPolicy({
    adversarial: { enabled: true, maxAttempts: 3, maxRotations: 2, perLevel: 1, jitterMs: 0 }
  }))
  const { session } = await h.engine.createSession({ origin: ORIGIN, adversarial: true, requestBudget: 10 })
  for (let index = 0; index < 6; index++) {
    h.pool.intercept({ path: /.*/, method: 'GET' }).reply(403, '<title>Access Denied</title> blocked by WAF', {
      headers: { 'content-type': 'text/html' }
    })
  }
  const outcome = await h.engine.execute(session.sessionId, { method: 'GET', path: '/x', evade: true })
  assert.ok(outcome.attempts <= 3, `尝试次数必须收敛，实际 ${outcome.attempts}`)
  assert.ok(outcome.evasion?.stoppedReason, '必须说明为什么停')
  assert.equal(outcome.paused, true, '仍被拦时应熔断会话')
  assert.equal(h.engine.store.getSession(session.sessionId)!.status, 'blocked')

  const report = h.engine.evasionReport(session.sessionId)
  assert.ok(report.totals.blocked_final >= 1)
  assert.ok(report.policy_events.some((event) => event.kind === 'evasion_stopped'))
  await h.done()
})

test('未开对抗模式的会话：即使传 evade 也拒绝升级', async () => {
  const h = harness(adversarialPolicy())
  const { session } = await h.engine.createSession({ origin: ORIGIN, adversarial: false })
  h.pool.intercept({ path: '/plain', method: 'GET' }).reply(200, 'ok', { headers: { 'content-type': 'text/plain' } })
  const outcome = await h.engine.execute(session.sessionId, { method: 'GET', path: '/plain', evade: false })
  assert.equal(outcome.attempts, 1)
  assert.equal(outcome.evasion, undefined)
  await h.done()
})
