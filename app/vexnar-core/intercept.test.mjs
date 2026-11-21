// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 临时 SQLite 根目录必须在 import 模块（其顶层会 openStore/openMeta）之前设置。
const root = await mkdtemp(join(tmpdir(), 'vexnar-intercept-'))
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_STORE_ROOT = root

const { register } = await import('./src/routes/intercept.ts')
const { operations } = await import('./src/context.ts')
const { Hono } = await import('hono')

const api = new Hono()
register(api)

async function req(method, path, body) {
  const res = await api.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })
const json = (method, path, body) => req(method, path, body).then((r) => r.json)

// ── 拦截规则 CRUD / toggle ──────────────────────────────────────────────────
let list = await json('GET', '/api/intercept/rules')
check('rules empty initially', Array.isArray(list.rules) && list.rules.length === 0, JSON.stringify(list))

const ruleBody = {
  name: '禁止删库', enabled: true, priority: 100, match_target: 'tool_input', match_type: 'string',
  pattern: 'rm -rf', action: 'deny', message: '危险删除', timeout_enabled: true, timeout_seconds: 60, timeout_action: 'deny'
}
let created = await req('POST', '/api/intercept/rules', ruleBody)
check('create rule', created.status === 200 && created.json.id === 1 && created.json.action === 'deny', JSON.stringify(created.json))

list = await json('GET', '/api/intercept/rules')
check('list has one rule', list.rules.length === 1 && list.rules[0].name === '禁止删库', JSON.stringify(list.rules))

const single = await req('GET', '/api/intercept/rules/1')
check('get single rule', single.status === 200 && single.json.id === 1 && single.json.pattern === 'rm -rf', JSON.stringify(single.json))

const updated = await req('PUT', '/api/intercept/rules/1', { ...ruleBody, action: 'ask' })
check('update rule', updated.status === 200 && updated.json.action === 'ask', JSON.stringify(updated.json))

const toggled = await req('POST', '/api/intercept/rules/1/toggle', { enabled: false })
check('toggle rule off', toggled.status === 200 && toggled.json.ok === true && toggled.json.enabled === false, JSON.stringify(toggled.json))

const badRegex = await req('POST', '/api/intercept/rules', { ...ruleBody, match_type: 'regex', pattern: '(' })
check('invalid regex rejected', badRegex.status === 400, JSON.stringify(badRegex.json))

const deleted = await req('DELETE', '/api/intercept/rules/1')
check('delete rule', deleted.status === 200 && deleted.json.deleted === 1, JSON.stringify(deleted.json))

list = await json('GET', '/api/intercept/rules')
check('rules empty after delete', list.rules.length === 0, JSON.stringify(list.rules))

// ── pending 列表 + decide 状态机 ────────────────────────────────────────────
await operations.writer.put({
  table: 'intercept_pending', key: '1',
  record: {
    id: 1, rule_id: null, conversation_id: null, task_id: null,
    agent_name: 'tester', tool_name: 'execute_command', tool_input: { command: 'rm -rf /var/www' },
    status: 'pending', reason: '危险删除', decision_source: 'rule',
    decided_at: null, created_at: '2026-01-01T00:00:00+08:00'
  }
})

let pending = await json('GET', '/api/intercept/pending')
check('pending lists seeded row', pending.pending.length === 1 && pending.pending[0].status === 'pending' && pending.pending[0].tool_name === 'execute_command', JSON.stringify(pending.pending))
check('pending is plain (no conv/rule fields)', pending.pending[0].conv_title === undefined && pending.pending[0].rule_name === undefined, JSON.stringify(pending.pending[0]))

const one = await req('GET', '/api/intercept/pending/1')
check('pending get one', one.status === 200 && one.json.id === 1 && one.json.tool_input.command === 'rm -rf /var/www', JSON.stringify(one.json))

const decide = await req('POST', '/api/intercept/pending/1/decide', { decision: 'allowed' })
check('decide allowed', decide.status === 200 && decide.json.ok === true, JSON.stringify(decide.json))

pending = await json('GET', '/api/intercept/pending')
check('pending empty after decide', pending.pending.length === 0, JSON.stringify(pending.pending))

const decideAgain = await req('POST', '/api/intercept/pending/1/decide', { decision: 'denied' })
check('repeat decide is 409', decideAgain.status === 409, JSON.stringify(decideAgain.json))

const history = await json('GET', '/api/intercept/history')
check('history shows decided row', history.items.length === 1 && history.items[0].status === 'allowed' && history.items[0].decided_at != null, JSON.stringify(history.items))

const badDecision = await req('POST', '/api/intercept/pending/2/decide', { decision: 'maybe' })
check('bad decision rejected', badDecision.status === 400, JSON.stringify(badDecision.json))

// ── 资产拦截规则 + 任务级拦截规则 ───────────────────────────────────────────
const assetCreated = await req('POST', '/api/asset-intercept/rules', { enabled: true, kind: 'cidr', pattern: '10.0.0.0/8', note: '内网段' })
check('asset rule create', assetCreated.status === 200 && assetCreated.json.id === 1 && assetCreated.json.kind === 'cidr', JSON.stringify(assetCreated.json))

const assetBad = await req('POST', '/api/asset-intercept/rules', { enabled: true, kind: 'cidr', pattern: 'not-a-cidr' })
check('asset cidr validation', assetBad.status === 400, JSON.stringify(assetBad.json))

const assetToggle = await req('POST', '/api/asset-intercept/rules/1/toggle', { enabled: false })
check('asset rule toggle', assetToggle.status === 200 && assetToggle.json.enabled === false, JSON.stringify(assetToggle.json))

const assetList = await json('GET', '/api/asset-intercept/rules')
check('asset rules list', assetList.rules.length === 1, JSON.stringify(assetList.rules))

const task = await operations.createTask({ description: 'intercept fixture', goal: 'seed task' })
const taskRule = await req('POST', `/api/tasks/${task.id}/intercept-rules`, { enabled: true, action: 'block', kind: 'exact_domain', pattern: 'target.example', note: '' })
check('task rule create', taskRule.status === 200 && taskRule.json.id === 1 && taskRule.json.action === 'block' && taskRule.json.task_id === undefined, JSON.stringify(taskRule.json))

const taskRules = await json('GET', `/api/tasks/${task.id}/intercept-rules`)
check('task rules list', taskRules.rules.length === 1 && taskRules.rules[0].pattern === 'target.example', JSON.stringify(taskRules.rules))

const taskRuleDel = await req('DELETE', `/api/tasks/${task.id}/intercept-rules/1`)
check('task rule delete', taskRuleDel.status === 200 && taskRuleDel.json.deleted === 1, JSON.stringify(taskRuleDel.json))

const missingTask = await req('POST', '/api/tasks/999999/intercept-rules', { enabled: true, action: 'block', kind: 'exact_url', pattern: 'http://x' })
check('task rule rejects unknown task', missingTask.status === 404, JSON.stringify(missingTask.json))

// ── 汇总 ────────────────────────────────────────────────────────────────────
let failed = false
for (const item of results) {
  if (!item.ok) failed = true
  console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`)
}
console.log(`root: ${root}`)
console.log(`checks: ${results.length} passed=${results.filter((r) => r.ok).length} failed=${results.filter((r) => !r.ok).length}`)
process.exit(failed ? 1 : 0)
