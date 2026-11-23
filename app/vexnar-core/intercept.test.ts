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

/** 自测用的极简请求器：body 缺省表示无请求体（仅 GET/DELETE）。 */
async function req(method: string, path: string, body?: unknown) {
  const res = await api.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

/** 单条自检结果：汇总循环只读 name/ok/detail 三个字段。 */
type CheckResult = { name: string; ok: boolean; detail: string }

const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail = ''): void => {
  results.push({ name, ok, detail })
}
const json = (method: string, path: string, body?: unknown) => req(method, path, body).then((r) => r.json)

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

// RE2 的内联 flag 是内建规则的主要写法；JS 的 RegExp 不认它，但不能因此拒掉合法规则。
const inlineFlag = await req('POST', '/api/intercept/rules', {
  ...ruleBody, match_type: 'regex', pattern: '(?i)\\brm\\b.{0,80}(-rf|--recursive)'
})
check('RE2 inline flag accepted', inlineFlag.status === 200 && inlineFlag.json.match_type === 'regex', JSON.stringify(inlineFlag.json))

const scopedFlag = await req('POST', '/api/intercept/rules', { ...ruleBody, match_type: 'regex', pattern: '(?i:curl)\\s+http' })
check('RE2 scoped flag accepted', scopedFlag.status === 200, JSON.stringify(scopedFlag.json))

const namedGroup = await req('POST', '/api/intercept/rules', { ...ruleBody, match_type: 'regex', pattern: '(?<host>[a-z0-9.]+)' })
check('named group accepted', namedGroup.status === 200, JSON.stringify(namedGroup.json))

for (const id of [inlineFlag.json.id, scopedFlag.json.id, namedGroup.json.id]) await req('DELETE', `/api/intercept/rules/${id}`)

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

// ── 运行时创建待审批（ask 规则命中时）──────────────────────────────────────
const askCreated = await req('POST', '/api/intercept/pending', {
  rule_id: 7, tool_name: 'bash', tool_input: { command: 'rm -rf /srv' },
  message: '需要人工确认', decision_source: 'rule'
})
check('create pending from runtime', askCreated.status === 201 && askCreated.json.status === 'pending' && askCreated.json.tool_input.command === 'rm -rf /srv', JSON.stringify(askCreated.json))

const askNoTool = await req('POST', '/api/intercept/pending', { message: 'x' })
check('create pending rejects missing tool', askNoTool.status === 400, JSON.stringify(askNoTool.json))

const askPendingList = await json('GET', '/api/intercept/pending')
check('created ask is listed', askPendingList.pending.some((row: any) => row.id === askCreated.json.id), JSON.stringify(askPendingList.pending))

const askDecided = await req('POST', `/api/intercept/pending/${askCreated.json.id}/decide`, { decision: 'allowed' })
check('runtime ask can be decided', askDecided.status === 200 && askDecided.json.ok === true, JSON.stringify(askDecided.json))

const askGone = await json('GET', '/api/intercept/pending')
check('decided ask leaves the queue', !askGone.pending.some((row: any) => row.id === askCreated.json.id), JSON.stringify(askGone.pending))

// ── 已决定记录的写入（dsh 运行时把判定结果落到这里）────────────────────────
const logged = await req('POST', '/api/intercept/decisions', {
  rule_id: 1, tool_name: 'bash', tool_input: { command: 'rm -rf /tmp/x' },
  status: 'denied', message: '危险删除', decision_source: 'rule'
})
check('log decided row', logged.status === 201 && logged.json.ok === true && logged.json.id > 0, JSON.stringify(logged.json))

const loggedBadStatus = await req('POST', '/api/intercept/decisions', { tool_name: 'bash', status: 'pending' })
check('log rejects non-decided status', loggedBadStatus.status === 400, JSON.stringify(loggedBadStatus.json))

const loggedNoTool = await req('POST', '/api/intercept/decisions', { status: 'allowed' })
check('log rejects missing tool', loggedNoTool.status === 400, JSON.stringify(loggedNoTool.json))

const loggedBadSource = await req('POST', '/api/intercept/decisions', { tool_name: 'bash', status: 'allowed', decision_source: 'robot' })
check('log rejects unknown source', loggedBadSource.status === 400, JSON.stringify(loggedBadSource.json))

const afterLog = await json('GET', '/api/intercept/pending')
check('decided log does not enter pending', afterLog.pending.length === 0, JSON.stringify(afterLog.pending))

const historyAfterLog = await json('GET', '/api/intercept/history')
check(
  'history shows runtime decision',
  historyAfterLog.items.some((row: any) => row.tool_name === 'bash' && row.status === 'denied'),
  JSON.stringify(historyAfterLog.items)
)

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

// ── 拦截范围（tool-config）：未配置走 Go 默认清单 ──────────────────────────
let scope = await json('GET', '/api/intercept/tool-config')
check(
  'scope defaults to Go tool list',
  Array.isArray(scope.enabled_tools) && scope.enabled_tools.length === 8 && scope.enabled_tools[0] === 'Bash' && scope.enabled_tools.includes('MultiEdit'),
  JSON.stringify(scope)
)

const scopeSaved = await req('PUT', '/api/intercept/tool-config', { enabled_tools: ['Bash', 'Bash', ' Write ', ''] })
check('scope save', scopeSaved.status === 200 && scopeSaved.json.ok === true, JSON.stringify(scopeSaved.json))

scope = await json('GET', '/api/intercept/tool-config')
check('scope saved, trimmed and deduped', JSON.stringify(scope.enabled_tools) === JSON.stringify(['Bash', 'Write']), JSON.stringify(scope.enabled_tools))

await req('PUT', '/api/intercept/tool-config', { enabled_tools: [] })
scope = await json('GET', '/api/intercept/tool-config')
check('saved empty scope stays empty', Array.isArray(scope.enabled_tools) && scope.enabled_tools.length === 0, JSON.stringify(scope.enabled_tools))

// ── 模型兜底（judge）：默认值 / 回写 / 清空提示词恢复模板 ──────────────────
let judge = await json('GET', '/api/intercept/judge')
check(
  'judge defaults',
  judge.enabled === false && judge.profile_id === 0 && judge.timeout_seconds === 15 && judge.ask_timeout_seconds === 300 && String(judge.prompt).includes('JSON'),
  JSON.stringify({ ...judge, prompt: `${String(judge.prompt).slice(0, 24)}…` })
)

const judgeSaved = await req('PUT', '/api/intercept/judge', {
  enabled: true, profile_id: 3, prompt: '自定义裁判', timeout_seconds: 20, fail_action: 'deny', ask_timeout_seconds: 120, ask_timeout_action: 'allow'
})
check('judge save', judgeSaved.status === 200 && judgeSaved.json.ok === true, JSON.stringify(judgeSaved.json))

judge = await json('GET', '/api/intercept/judge')
check(
  'judge round-trips',
  judge.enabled === true && judge.profile_id === 3 && judge.prompt === '自定义裁判' && judge.fail_action === 'deny' && judge.ask_timeout_seconds === 120 && judge.ask_timeout_action === 'allow',
  JSON.stringify(judge)
)

await req('PUT', '/api/intercept/judge', { ...judge, prompt: '' })
judge = await json('GET', '/api/intercept/judge')
check('empty prompt falls back to builtin template', String(judge.prompt).includes('JSON') && judge.prompt !== '', String(judge.prompt).slice(0, 24))

const judgeBad = await req('PUT', '/api/intercept/judge', { ...judge, fail_action: 'explode' })
check('judge rejects unknown fail_action', judgeBad.status === 400, JSON.stringify(judgeBad.json))

const usage = await json('GET', '/api/intercept/judge/usage?days=30')
check(
  'judge usage shape',
  usage.calls === 0 && usage.input_tokens === 0 && usage.output_tokens === 0 && Array.isArray(usage.daily),
  JSON.stringify(usage)
)

// ── 汇总 ────────────────────────────────────────────────────────────────────
let failed = false
for (const item of results) {
  if (!item.ok) failed = true
  console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`)
}
console.log(`root: ${root}`)
console.log(`checks: ${results.length} passed=${results.filter((r) => r.ok).length} failed=${results.filter((r) => !r.ok).length}`)
process.exit(failed ? 1 : 0)
