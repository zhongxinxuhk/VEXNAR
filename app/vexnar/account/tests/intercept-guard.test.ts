// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 拦截规则真的能拦住工具调用吗？
 *
 * 这是对这个问题的直接回答：把手写的规则喂给 guard，模拟 dsh 的
 * `tools/pre-execute` 调用，看它返回 allow / deny / ask 中的哪一个、有没有调到
 * 放行函数 `next()`、有没有把判定写回历史。规则语义与 Go 的 Interceptor 对齐
 * （优先级降序、第一条命中、string/regex、tool_name/tool_input），这里逐条钉住。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { registerInterceptGuard } from '../src/intercept-guard.ts'
import type { PreToolDecisionLike, ToolExecutionLike } from '../src/intercept-guard.ts'

type Listener = (exec: ToolExecutionLike, next: () => Promise<PreToolDecisionLike>) => Promise<PreToolDecisionLike>

interface Harness {
  handle: (tool: string, args: unknown, agent?: unknown) => Promise<{ decision: PreToolDecisionLike; nextCalls: number }>
  decisions: Array<Record<string, unknown>>
  setRules: (rules: unknown[]) => void
  setTools: (tools: string[]) => void
  refresh: () => Promise<void>
  decidePending: (id: number, decision: 'allowed' | 'denied') => void
  pending: Map<number, string>
  guard: ReturnType<typeof registerInterceptGuard>
}

const harness = async (input: { rules: unknown[]; tools?: string[] }): Promise<Harness & { settle: (id: number, decision: 'allowed' | 'denied') => void }> => {
  let rules = input.rules
  let tools = input.tools ?? ['Bash', 'Write', 'Edit', 'WebFetch', 'web_search']
  const decisions: Array<Record<string, unknown>> = []
  const pending = new Map<number, string>()
  let pendingID = 0
  let listener: Listener | undefined
  const disposers: Array<() => void> = []

  const coreRequest = async (path: string, init?: { method?: string; body?: unknown }): Promise<unknown> => {
    if (path === '/api/intercept/rules') return { rules }
    if (path === '/api/intercept/tool-config') return { enabled_tools: tools }
    if (path === '/api/intercept/decisions') {
      decisions.push(init?.body as Record<string, unknown>)
      return { ok: true, id: decisions.length }
    }
    if (path === '/api/intercept/pending' && init?.method === 'POST') {
      pendingID += 1
      pending.set(pendingID, 'pending')
      return { id: pendingID, status: 'pending' }
    }
    const get = /^\/api\/intercept\/pending\/(\d+)$/.exec(path)
    if (get) return { id: Number(get[1]), status: pending.get(Number(get[1])) ?? 'pending' }
    const decide = /^\/api\/intercept\/pending\/(\d+)\/decide$/.exec(path)
    if (decide) {
      const value = (init?.body as { decision?: string } | undefined)?.decision ?? 'denied'
      pending.set(Number(decide[1]), value)
      return { ok: true }
    }
    throw new Error(`unexpected core request ${path}`)
  }

  const ctx = {
    on(_event: 'tools/pre-execute', nextListener: Listener) {
      listener = nextListener
      return () => true
    },
    effect(body: () => (() => void) | void) {
      const dispose = body()
      if (typeof dispose === 'function') disposers.push(dispose)
    }
  }

  const guard = registerInterceptGuard(ctx as never, coreRequest, { pollMs: 5 })
  await guard.refresh()

  const handle = async (tool: string, args: unknown, agent: unknown = { id: 'agent-1' }) => {
    let nextCalls = 0
    const next = async (): Promise<PreToolDecisionLike> => { nextCalls += 1; return { kind: 'allow' } }
    if (listener === undefined) throw new Error('guard 没有注册 pre-execute 监听器')
    const decision = await listener({ name: tool, arguments: args, agent }, next)
    return { decision, nextCalls }
  }

  return {
    handle,
    decisions,
    setRules: (next) => { rules = next },
    setTools: (next) => { tools = next },
    refresh: () => guard.refresh(),
    decidePending: (id, decision) => { pending.set(id, decision) },
    pending,
    guard,
    settle: (id, decision) => { pending.set(id, decision) }
  }
}

const denyRule = (over: Record<string, unknown> = {}) => ({
  id: 1, name: '禁止删库', enabled: true, priority: 100,
  match_target: 'tool_input', match_type: 'string', pattern: 'rm -rf',
  action: 'deny', message: '危险删除', timeout_enabled: false, timeout_seconds: 0, timeout_action: 'deny',
  ...over
})

test('命中的 deny 规则拦下调用，且不留放行', async () => {
  const h = await harness({ rules: [denyRule()] })
  const out = await h.handle('bash', { command: 'rm -rf /var/www' })
  assert.equal(out.decision.kind, 'deny')
  assert.equal(out.nextCalls, 0, '被拦下的调用不能执行')
  assert.match((out.decision as { reason: string }).reason, /危险删除/)
  assert.equal(h.decisions.length, 1)
  assert.equal(h.decisions[0]?.status, 'denied')
  assert.equal(h.decisions[0]?.tool_name, 'bash')
})

test('不命中的调用照常执行；未进入拦截范围的工具完全不判', async () => {
  const h = await harness({ rules: [denyRule()] })
  const clean = await h.handle('bash', { command: 'ls -la' })
  assert.equal(clean.decision.kind, 'allow')
  assert.equal(clean.nextCalls, 1)
  assert.equal(h.decisions.length, 0, '没命中就不该写历史')

  const outside = await h.handle('read', { path: '/etc/passwd' })
  assert.equal(outside.decision.kind, 'allow')
  assert.equal(outside.nextCalls, 1)
})

test('停用的规则不拦；改回启用并刷新快照后立刻生效', async () => {
  const h = await harness({ rules: [denyRule({ enabled: false })] })
  const off = await h.handle('bash', { command: 'rm -rf /tmp/x' })
  assert.equal(off.decision.kind, 'allow')
  assert.equal(off.nextCalls, 1)

  h.setRules([denyRule({ enabled: true })])
  await h.refresh()
  const on = await h.handle('bash', { command: 'rm -rf /tmp/x' })
  assert.equal(on.decision.kind, 'deny')
  assert.equal(on.nextCalls, 0)
})

test('优先级：高优先级的 allow 压过低优先级的 deny', async () => {
  const h = await harness({
    rules: [
      denyRule({ id: 1, priority: 10, match_target: 'tool_name', match_type: 'string', pattern: 'bash' }),
      denyRule({ id: 2, priority: 99, name: '放行只读', action: 'allow', match_target: 'tool_input', pattern: 'rm -rf --dry-run' })
    ]
  })
  const allowed = await h.handle('bash', { command: 'rm -rf --dry-run /tmp/x' })
  assert.equal(allowed.decision.kind, 'allow')
  assert.equal(allowed.nextCalls, 1)
  assert.equal(h.decisions[0]?.status, 'allowed')

  const denied = await h.handle('bash', { command: 'rm -rf /tmp/x' })
  assert.equal(denied.decision.kind, 'deny')
})

test('正则规则按内容匹配（含 RE2 内联 flag）', async () => {
  const h = await harness({
    rules: [denyRule({ match_type: 'regex', pattern: '(?i)\\brm\\b.{0,80}(-rf|--recursive)', match_target: 'tool_input' })]
  })
  const hit = await h.handle('bash', { command: 'echo hi && RM -RF /data' })
  assert.equal(hit.decision.kind, 'deny')
  const miss = await h.handle('bash', { command: 'echo rm' })
  assert.equal(miss.decision.kind, 'allow')
  assert.equal(miss.nextCalls, 1)
})

test('拦截范围：把 bash 移出范围后同一条规则不再生效', async () => {
  const h = await harness({ rules: [denyRule()], tools: ['Write'] })
  const out = await h.handle('bash', { command: 'rm -rf /tmp/x' })
  assert.equal(out.decision.kind, 'allow')
  assert.equal(out.nextCalls, 1)
  assert.equal(h.decisions.length, 0)
})

test('ask：没有人工处理时按 timeout_action 收尾，并结掉 pending 记录', async () => {
  const h = await harness({
    rules: [denyRule({ action: 'ask', message: '需要人工确认', timeout_enabled: true, timeout_seconds: 0.05, timeout_action: 'allow' })]
  })
  const out = await h.handle('bash', { command: 'rm -rf /tmp/x' })
  assert.equal(out.decision.kind, 'allow')
  assert.equal(out.nextCalls, 1)
  assert.equal([...h.pending.values()][0], 'allowed', '超时按 timeout_action 结掉 pending，不能留一条永远挂着的审批')
  assert.equal(h.decisions.length, 0, 'ask 的留痕就是那条 pending 记录，不再重复写一条 decided 行')
})

test('ask：人工点允许放行，点拒绝拦下', async () => {
  const h = await harness({
    rules: [denyRule({ action: 'ask', message: '需要人工确认', timeout_enabled: true, timeout_seconds: 5 })]
  })
  const approved = h.handle('bash', { command: 'rm -rf /tmp/a' })
  // 等 pending 建出来后再替用户点"允许"。
  for (let i = 0; i < 200 && h.pending.size === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 2))
  h.decidePending(1, 'allowed')
  const allowed = await approved
  assert.equal(allowed.decision.kind, 'allow')
  assert.equal(allowed.nextCalls, 1)

  const rejected = h.handle('bash', { command: 'rm -rf /tmp/b' })
  for (let i = 0; i < 200 && h.pending.size < 2; i += 1) await new Promise((resolve) => setTimeout(resolve, 2))
  h.decidePending(2, 'denied')
  const denied = await rejected
  assert.equal(denied.decision.kind, 'deny')
  assert.equal(denied.nextCalls, 0)
})

test('ask：写不进 pending 时按拒绝处理（ask 不能被静默绕过）', async () => {
  const rules = [denyRule({ action: 'ask', message: '需要人工确认' })]
  let listener: Listener | undefined
  const ctx = {
    on(_event: 'tools/pre-execute', nextListener: Listener) { listener = nextListener; return () => true },
    effect(body: () => (() => void) | void) { body() }
  }
  const coreRequest = async (path: string): Promise<unknown> => {
    if (path === '/api/intercept/rules') return { rules }
    if (path === '/api/intercept/tool-config') return { enabled_tools: ['Bash'] }
    if (path === '/api/intercept/pending') throw new Error('core down')
    return { ok: true }
  }
  const guard = registerInterceptGuard(ctx as never, coreRequest, { pollMs: 5 })
  await guard.refresh()
  let nextCalls = 0
  const decision = await listener!({ name: 'bash', arguments: { command: 'rm -rf /x' }, agent: {} }, async () => {
    nextCalls += 1
    return { kind: 'allow' }
  })
  assert.equal(decision.kind, 'deny')
  assert.equal(nextCalls, 0)
})

test('规则服务读不到时：保留旧快照继续拦截', async () => {
  let fail = false
  const decisions: Array<Record<string, unknown>> = []
  let listener: Listener | undefined
  const ctx = {
    on(_event: 'tools/pre-execute', nextListener: Listener) { listener = nextListener; return () => true },
    get() { return undefined },
    effect(body: () => (() => void) | void) { body() }
  }
  const coreRequest = async (path: string, init?: { method?: string; body?: unknown }): Promise<unknown> => {
    if (path === '/api/intercept/decisions') { decisions.push(init?.body as Record<string, unknown>); return { ok: true } }
    if (fail) throw new Error('core down')
    if (path === '/api/intercept/rules') return { rules: [denyRule()] }
    return { enabled_tools: ['Bash'] }
  }
  const guard = registerInterceptGuard(ctx as never, coreRequest)
  await guard.refresh()
  fail = true
  await guard.refresh()
  const next = async (): Promise<PreToolDecisionLike> => ({ kind: 'allow' })
  const decision = await listener!({ name: 'bash', arguments: { command: 'rm -rf /x' }, agent: {} }, next)
  assert.equal(decision.kind, 'deny', '刷新失败不能把已生效的规则丢掉')
  assert.equal(decisions.length, 1)
})
