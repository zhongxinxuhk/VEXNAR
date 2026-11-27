// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * P1-5 的同一 fixture 对照：旧 MCP 工具面 vs 新 dsh 工具面（REST）。
 *
 * 两边各自跑独立的 WebTestingEngine，但使用同一 origin、同一响应、同一参数；
 * 只忽略每次运行必然不同的 id / 时间戳，业务字段必须逐项相等。
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { WebTestingEngine } from '../../vexnar-web/src/engine.ts'
import { buildTools } from '../../vexnar-web/src/mcp.ts'
import { handleWebHttp } from '../../vexnar-web/src/routes.ts'
import { apply, type ToolContext } from '../index.ts'

const ORIGIN = 'https://parity.example'
const AGENT = 'session-parity'
const HTML = `<!doctype html><html><head><title>Parity</title></head><body>
<form method="post" action="/login"><input name="user"><input name="pass" type="password"></form>
<a href="/next">next</a><script src="/app.js"></script></body></html>`

interface RegisteredTool {
  name?: string
  execute: (args: unknown, execution: unknown) => Promise<unknown>
}

function makeEngine() {
  const root = mkdtempSync(join(tmpdir(), 'vexnar-p15-parity-'))
  const engine = new WebTestingEngine({
    root,
    policy: { allowedOrigins: [ORIGIN], minIntervalMs: 0, maxRequestsPerWindow: 100, maxRequestsPerSession: 20 },
    fetchImpl: async () => new Response(HTML, { status: 200, headers: { 'content-type': 'text/html' } })
  })
  return {
    engine,
    done: async () => {
      await engine.close().catch(() => undefined)
      rmSync(root, { recursive: true, force: true })
    }
  }
}

function dshHarness(engine: WebTestingEngine) {
  const tools = new Map<string, RegisteredTool>()
  const bridge = async (path: string, init: Record<string, any> = {}): Promise<any> => {
    const body = init.body === undefined ? undefined : JSON.stringify(init.body)
    const headers = new Headers(init.headers as Record<string, string> | undefined)
    if (body !== undefined) headers.set('content-type', 'application/json')
    const response = await handleWebHttp(
      new Request(`http://core.local${path}`, { method: init.method ?? 'GET', headers, body }),
      engine
    )
    assert.ok(response)
    const text = await response.text()
    if (!response.ok) throw new Error(`${response.status} ${text}`)
    return JSON.parse(text)
  }
  apply({
    tools: {
      register(tool: RegisteredTool) {
        if (tool.name) tools.set(tool.name, tool)
        return () => undefined
      }
    },
    vexnarCore: { request: bridge }
  } as unknown as ToolContext)
  return {
    call: async (name: string, args: Record<string, unknown>): Promise<any> => {
      const tool = tools.get(name)
      assert.ok(tool, `${name} 未注册`)
      return await tool.execute(args, { agent: { session: { id: AGENT } } })
    }
  }
}

function mcpHarness(engine: WebTestingEngine) {
  const tools = new Map(buildTools(engine).map((tool) => [tool.name, tool]))
  return {
    call: async (name: string, args: Record<string, unknown>): Promise<any> => {
      const tool = tools.get(name)
      assert.ok(tool, `${name} 未注册`)
      return (await tool.call(args, { agentSession: AGENT })).structured
    }
  }
}

const pickSession = (session: any) => ({
  origin: session.origin,
  label: session.label,
  status: session.status,
  scopeId: session.scopeId,
  requestBudget: session.requestBudget,
  requestCount: session.requestCount,
  adversarial: session.adversarial,
  authProfileId: session.authProfileId,
  meta: session.meta
})

const pickOutcome = (outcome: any) => ({
  record: {
    method: outcome.record.method,
    url: outcome.record.url,
    path: outcome.record.path,
    status: outcome.record.status,
    classification: outcome.record.classification,
    requestHeaders: outcome.record.requestHeaders,
    requestBytes: outcome.record.requestBytes,
    responseHeaders: outcome.record.responseHeaders,
    responseBytes: outcome.record.responseBytes,
    contentType: outcome.record.contentType,
    truncated: outcome.record.truncated,
    title: outcome.record.title,
    deduplicated: outcome.record.deduplicated,
    note: outcome.record.note,
    attempt: outcome.record.attempt,
    mutation: outcome.record.mutation,
    egressId: outcome.record.egressId,
    identityId: outcome.record.identityId
  },
  attempts: outcome.attempts,
  excerpt: outcome.excerpt,
  signals: outcome.signals,
  budgetLeft: outcome.budgetLeft,
  paused: outcome.paused
})

const pickHistory = (row: any) => ({
  method: row.method,
  path: row.path,
  status: row.status,
  classification: row.classification,
  title: row.title,
  deduplicated: row.deduplicated,
  note: row.note,
  attempt: row.attempt
})

const pickEvents = (events: any[]) => events.map((event) => ({ kind: event.kind, detail: event.detail }))

test('同一 fixture：6 个 web 工具的 REST 版与 MCP 版业务结果一致', async () => {
  const rest = makeEngine()
  const mcp = makeEngine()
  const dsh = dshHarness(rest.engine)
  const old = mcpHarness(mcp.engine)
  try {
    const createArgs = { origin: ORIGIN, label: 'parity', request_budget: 5, auth: { Authorization: 'Bearer SECRET' } }
    const dshCreated = await dsh.call('web_session_create', createArgs)
    const mcpCreated = await old.call('web_session_create', createArgs)
    assert.deepEqual(dshCreated.policy, mcpCreated.policy)
    assert.deepEqual(pickSession(dshCreated.session), pickSession(mcpCreated.session))
    const dshSession = dshCreated.session.sessionId as string
    const mcpSession = mcpCreated.session.sessionId as string
    assert.equal(JSON.stringify(dshCreated).includes('SECRET'), false)

    const dshOutcome = await dsh.call('web_request_execute', { session_id: dshSession, method: 'GET', path: '/' })
    const mcpOutcome = await old.call('web_request_execute', { session_id: mcpSession, method: 'GET', path: '/' })
    assert.deepEqual(pickOutcome(dshOutcome), pickOutcome(mcpOutcome))
    assert.equal(dshOutcome.record.requestHeaders.authorization, '***')

    const dshAnalysis = await dsh.call('web_response_analyze', {
      session_id: dshSession, request_id: dshOutcome.record.requestId, mode: 'structure'
    })
    const mcpAnalysis = await old.call('web_response_analyze', {
      session_id: mcpSession, request_id: mcpOutcome.record.requestId, mode: 'structure'
    })
    assert.equal(dshAnalysis.mode, mcpAnalysis.mode)
    assert.deepEqual(dshAnalysis.structure, mcpAnalysis.structure)
    assert.equal(dshAnalysis.excerpt, mcpAnalysis.excerpt)

    const dshInspect = await dsh.call('web_session_inspect', {
      session_id: dshSession, include: 'both', limit: 1
    })
    const mcpInspect = await old.call('web_session_inspect', {
      session_id: mcpSession, include: 'both', limit: 1
    })
    assert.deepEqual(pickSession(dshInspect.session), pickSession(mcpInspect.session))
    assert.equal(dshInspect.budgetLeft, mcpInspect.budgetLeft)
    assert.deepEqual(
      { total: dshInspect.stats.total, byClassification: dshInspect.stats.byClassification, bytes: dshInspect.stats.bytes },
      { total: mcpInspect.stats.total, byClassification: mcpInspect.stats.byClassification, bytes: mcpInspect.stats.bytes }
    )
    assert.deepEqual(dshInspect.history.map(pickHistory), mcpInspect.history.map(pickHistory))
    assert.deepEqual(pickEvents(dshInspect.policyEvents), pickEvents(mcpInspect.policyEvents))

    const dshEvasion = await dsh.call('web_evasion_report', { session_id: dshSession, limit: 10 })
    const mcpEvasion = await old.call('web_evasion_report', { session_id: mcpSession, limit: 10 })
    assert.deepEqual(
      {
        adversarial: dshEvasion.adversarial,
        egress_mode: dshEvasion.egress_mode,
        limits: dshEvasion.limits,
        totals: dshEvasion.totals,
        mutations: dshEvasion.mutations,
        egresses: dshEvasion.egresses,
        identities: dshEvasion.identities,
        escalations: dshEvasion.escalations
      },
      {
        adversarial: mcpEvasion.adversarial,
        egress_mode: mcpEvasion.egress_mode,
        limits: mcpEvasion.limits,
        totals: mcpEvasion.totals,
        mutations: mcpEvasion.mutations,
        egresses: mcpEvasion.egresses,
        identities: mcpEvasion.identities,
        escalations: mcpEvasion.escalations
      }
    )
    assert.deepEqual(pickEvents(dshEvasion.policy_events), pickEvents(mcpEvasion.policy_events))

    const dshClosed = await dsh.call('web_session_control', { session_id: dshSession, action: 'close' })
    const mcpClosed = await old.call('web_session_control', { session_id: mcpSession, action: 'close' })
    assert.equal(dshClosed.session.status, 'closed')
    assert.equal(dshClosed.session.status, mcpClosed.session.status)
  } finally {
    await rest.done()
    await mcp.done()
  }
})