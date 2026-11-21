// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** 一条自检结果；detail 只在失败时进日志。 */
type CheckResult = { name: string; ok: boolean; detail: string }
/**
 * 路由返回的 JSON：res.json() / JSON.parse 的静态类型就是动态对象，
 * 断言处直接读字段，形状由各用例自己钉住。
 */
type JsonBody = Record<string, any>
type ApiResult = { status: number; body: JsonBody }
/** GET /api/agents/:key/variables 的变量行。 */
type VariableRow = { name: string; source?: string }

// Store root must be set BEFORE the route module is imported: context.ts resolves
// the store directory (SQLite file + meta tables) at module load time.
const root = await mkdtemp(join(tmpdir(), 'vexnar-agents-'))
process.env.VEXNAR_STORE_ROOT = root
process.env.VEXNAR_STORE = 'sqlite'
delete process.env.VEXNAR_GATEWAY_TOKEN

const { Hono } = await import('hono')
const { meta, operations, storeRoot } = await import('../vexnar-core/src/context.ts')
const { register } = await import('../vexnar-core/src/routes/agents.ts')

// 预置内置 agent、一条 LLM 配置、一条工具绑定，供「内置保护 / 绑定校验 / 级联清理」用。
const tables = await meta.load()
tables.agents = [
  { id: '1', key: 'mainagent', name: '主', description: '人机接口', role: 'main', builtin: true, enabled: true, max_turns: 0, run_seconds: 1200 },
  { id: '2', key: 'worker', name: '执行', role: 'worker', builtin: true, enabled: true, max_turns: 0, run_seconds: 1200 },
  { id: '3', key: 'goals', name: '目标拆解', role: 'goals', builtin: true, enabled: true, max_turns: 0, run_seconds: 1200 }
]
tables.llmProfiles = [{ id: 1, name: '默认', model: 'gpt-x', is_default: true }]
tables.tools = [
  { key: 'run_command', system: true, description: '执行命令', agents: ['mainagent', 'worker'], enabled: true },
  { key: 'list_assets', system: true, description: '列资产', agents: ['mainagent'], enabled: true }
]
tables.visibility = [{ agent: 'worker', kind: 'mcp', resource_id: 9, enabled: true }]
await meta.save(tables)

const app = new Hono()
register(app)

const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail: string = '') => results.push({ name, ok, detail })
const json = (value: unknown) => JSON.stringify(value)

const request = (path: string, init: RequestInit = {}) => app.request(path, init)
const send = async (method: string, path: string, body?: unknown): Promise<ApiResult> => {
  const init: RequestInit = body === undefined
    ? { method }
    : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
  const response = await request(path, init)
  const text = await response.text()
  // 解析失败时沿用原始文本，和改造前一致；测试里两种情况都可读。
  let parsed: JsonBody | string
  try { parsed = JSON.parse(text) } catch { parsed = text }
  return { status: response.status, body: parsed as JsonBody }
}
const jget = (path: string) => send('GET', path)
const jpost = (path: string, body?: unknown) => send('POST', path, body ?? {})
const jput = (path: string, body?: unknown) => send('PUT', path, body ?? {})
const jdel = (path: string) => send('DELETE', path)
const agentRow = async (key: string) => (await meta.table('agents')).find((row) => row.key === key)

const DEFAULT_ASSISTANT = '你是一个乐于助人的 AI 助手。请用简洁、准确的中文回答用户的问题；在需要时使用可用的工具来完成任务。只做用户要求的事，不臆造信息。'
let created: ApiResult | null = null

try {
  // ── 1. POST /api/agents：创建自定义 agent ────────────────────────────────
  created = await jpost('/api/agents', { key: 'reporter', name: '报告撰写', description: '写漏洞报告' })
  check('create agent', created.status === 201
    && created.body.key === 'reporter' && created.body.name === '报告撰写'
    && created.body.builtin === false && created.body.role === 'assistant'
    && created.body.enabled === true && created.body.trigger_run_mode === 'serial'
    && created.body.trigger_merge_mode === 'all', json(created.body))

  const duplicate = await jpost('/api/agents', { key: 'reporter', name: '重复' })
  check('create rejects duplicate key (409)', duplicate.status === 409 && duplicate.body.error === '该 key 已存在', json(duplicate.body))

  const badKey = await jpost('/api/agents', { key: 'Reporter-1', name: 'x' })
  check('create rejects bad key', badKey.status === 400 && String(badKey.body.error).includes('key'), json(badKey.body))

  const noName = await jpost('/api/agents', { key: 'noname' })
  check('create rejects empty name', noName.status === 400 && noName.body.error === '名称不能为空', json(noName.body))

  // ── 2. 提示词版本历史 ────────────────────────────────────────────────────
  const seeded = await jget('/api/agents/reporter/prompts')
  check('new agent seeds starter prompt', seeded.status === 200 && seeded.body.versions.length === 1
    && seeded.body.versions[0].version === 1 && seeded.body.versions[0].note === '内置默认'
    && seeded.body.versions[0].template_text === DEFAULT_ASSISTANT, json(seeded.body))

  const current = await jget('/api/agents/reporter/prompt')
  check('GET current prompt', current.status === 200 && current.body.version === 1 && current.body.prompt === DEFAULT_ASSISTANT, json(current.body))

  const saved = await jput('/api/agents/reporter/prompt', { template: '当前时间 {{.Now}}，数据目录 {{DataDir}}。', note: '加入时间占位' })
  check('save prompt version', saved.status === 200 && saved.body.version === 2, json(saved.body))

  const versions = await jget('/api/agents/reporter/prompts')
  check('version history is newest-first', versions.status === 200 && versions.body.versions.length === 2
    && versions.body.versions[0].version === 2 && versions.body.versions[1].version === 1
    && versions.body.versions[0].note === '加入时间占位', json(versions.body))

  const listedInMeta = await agentRow('reporter')
  check('current prompt version pointer moved', Number(listedInMeta?.current_prompt_version) === 2, json(listedInMeta?.current_prompt_version))

  const rejected = await jput('/api/agents/reporter/prompt', { template: '未知变量 {{.Where}}' })
  check('save rejects unknown variable', rejected.status === 400 && String(rejected.body.error).includes('不在该 agent 允许列表'), json(rejected.body))

  const unbalanced = await jput('/api/agents/reporter/prompt', { template: '坏模板 {{.Now' })
  check('save rejects unbalanced braces', unbalanced.status === 400 && String(unbalanced.body.error).includes('花括号'), json(unbalanced.body))

  const badControl = await jput('/api/agents/reporter/prompt', { template: '{{if .Now}}x' })
  check('save rejects unclosed if', badControl.status === 400 && String(badControl.body.error).includes('缺少 {{end}}'), json(badControl.body))

  // ── 3. 预览 ─────────────────────────────────────────────────────────────
  const preview = await jpost('/api/agents/reporter/prompt/preview', {
    template: '时间 {{.Now}} / 目录 {{DataDir}}',
    sample: { Now: '2026-11-21 22:30:00' }
  })
  check('preview substitutes sample + example', preview.status === 200
    && preview.body.rendered === `时间 2026-11-21 22:30:00 / 目录 ${storeRoot()}`, json(preview.body))

  const conditional = await jpost('/api/agents/reporter/prompt/preview', {
    template: '代理{{if .Now}}已配置:{{.Now}}{{else}}未配置{{end}}',
    sample: { Now: '' }
  })
  check('preview honors if/else', conditional.status === 200 && conditional.body.rendered === '代理未配置', json(conditional.body))

  const conditionalOn = await jpost('/api/agents/reporter/prompt/preview', {
    template: '代理{{if .Now}}已配置:{{.Now}}{{else}}未配置{{end}}',
    sample: { Now: '127.0.0.1:8080' }
  })
  check('preview takes truthy branch', conditionalOn.status === 200 && conditionalOn.body.rendered === '代理已配置:127.0.0.1:8080', json(conditionalOn.body))

  const previewNoTemplate = await jpost('/api/agents/reporter/prompt/preview', {})
  check('preview falls back to current prompt', previewNoTemplate.status === 200
    && String(previewNoTemplate.body.rendered).startsWith('当前时间 ')
    && String(previewNoTemplate.body.rendered).includes(storeRoot()), json(previewNoTemplate.body))

  const previewMissing = await jpost('/api/agents/reporter/prompt/preview', { template: '{{.Missing}}' })
  check('preview reports missing variable without failing', previewMissing.status === 200
    && previewMissing.body.rendered === '' && String(previewMissing.body.error).includes('未提供取值'), json(previewMissing.body))

  // ── 4. 恢复默认 ─────────────────────────────────────────────────────────
  const reset = await jpost('/api/agents/reporter/prompt/reset')
  check('reset prompt appends version', reset.status === 200 && reset.body.version === 3, json(reset.body))
  const afterReset = await jget('/api/agents/reporter/prompt')
  check('reset restores the seed body (custom agent → earliest version)', afterReset.status === 200
    && afterReset.body.prompt === DEFAULT_ASSISTANT, json(afterReset.body.version))

  const builtinReset = await jpost('/api/agents/worker/prompt/reset')
  check('builtin agent resets to in-code default', builtinReset.status === 200 && builtinReset.body.version === 1, json(builtinReset.body))
  const workerPrompt = await jget('/api/agents/worker/prompt')
  check('builtin default body restored', workerPrompt.status === 200
    && workerPrompt.body.prompt.includes('执行者') && workerPrompt.body.prompt.length > 200, json(workerPrompt.body.version))

  // ── 5. 变量目录 ─────────────────────────────────────────────────────────
  const workerVars = await jget('/api/agents/worker/variables')
  const workerNames = (workerVars.body.variables ?? []).map((item: VariableRow) => item.name)
  check('worker variable catalog', workerVars.status === 200
    && workerNames.includes('ProxyAddr') && workerNames.includes('WorkerName')
    && workerNames.includes('Now') && workerNames.includes('DataDir'), json(workerNames))

  const customVars = await jget('/api/agents/reporter/variables')
  const customNames = (customVars.body.variables ?? []).map((item: VariableRow) => item.name)
  check('custom agent sees global runtime vars only', customVars.status === 200
    && customNames.length === 2 && customNames.includes('Now') && customNames.includes('DataDir'), json(customNames))

  const goalsVars = await jget('/api/agents/goals/variables')
  check('goals variable catalog', goalsVars.status === 200
    && (goalsVars.body.variables ?? []).some((item: VariableRow) => item.name === 'EngagementDescription' && item.source === 'exploration'), json(goalsVars.body))

  // ── 6. 收尾词 ───────────────────────────────────────────────────────────
  const wrapup = await jput('/api/agents/worker/wrapup', { prompt: '先把结论落库再收尾。', max_turns: -5 })
  const wrapupRow = await agentRow('worker')
  check('save wrapup prompt + clamp turns', wrapup.status === 200 && wrapup.body.ok === true
    && wrapupRow.wrapup_prompt === '先把结论落库再收尾。' && Number(wrapupRow.wrapup_max_turns) === 0, json(wrapupRow?.wrapup_prompt))

  const wrapupTurnsOnly = await jput('/api/agents/worker/wrapup', { prompt: '保留正文', max_turns: 6 })
  const turnsRow = await agentRow('worker')
  check('save wrapup turn budget', wrapupTurnsOnly.status === 200 && Number(turnsRow.wrapup_max_turns) === 6
    && turnsRow.wrapup_prompt === '保留正文', json(turnsRow?.wrapup_max_turns))

  const wrapupReset = await jpost('/api/agents/worker/wrapup/reset')
  const wrapupResetRow = await agentRow('worker')
  check('reset wrapup', wrapupReset.status === 200 && wrapupReset.body.ok === true
    && wrapupReset.body.wrapup_max_turns_default === 10
    && String(wrapupReset.body.wrapup_default).includes('不要再运行任何命令')
    && wrapupResetRow.wrapup_prompt === '' && Number(wrapupResetRow.wrapup_max_turns) === 0, json(wrapupReset.body))

  const genericWrapup = await jpost('/api/agents/reporter/wrapup/reset')
  check('custom agent falls back to generic wrapup default', genericWrapup.status === 200
    && String(genericWrapup.body.wrapup_default).includes('预算耗尽'), json(genericWrapup.body))

  const taskTimeout = await jput('/api/agents/worker/wrapup/task-timeout', { prompt: '整个任务到点，立刻落库。' })
  const taskTimeoutRow = await agentRow('worker')
  check('save task-timeout wrapup keeps turns', taskTimeout.status === 200
    && taskTimeoutRow.task_timeout_wrapup_prompt === '整个任务到点，立刻落库。'
    && Number(taskTimeoutRow.task_timeout_wrapup_max_turns) === 0, json(taskTimeoutRow?.task_timeout_wrapup_prompt))

  const taskTimeoutTurns = await jput('/api/agents/worker/wrapup/task-timeout', { prompt: '到点', max_turns: 4 })
  check('task-timeout turn budget saved', taskTimeoutTurns.status === 200
    && Number((await agentRow('worker')).task_timeout_wrapup_max_turns) === 4, json((await agentRow('worker'))?.task_timeout_wrapup_max_turns))

  const taskTimeoutReset = await jpost('/api/agents/worker/wrapup/task-timeout/reset')
  const taskTimeoutResetRow = await agentRow('worker')
  check('reset task-timeout wrapup', taskTimeoutReset.status === 200
    && String(taskTimeoutReset.body.task_timeout_wrapup_default).includes('整个任务已到达超时上限')
    && taskTimeoutReset.body.task_timeout_wrapup_max_turns_default === 10
    && taskTimeoutResetRow.task_timeout_wrapup_prompt === ''
    && Number(taskTimeoutResetRow.task_timeout_wrapup_max_turns) === 0, json(taskTimeoutReset.body))

  const taskTimeoutUnsupported = await jpost('/api/agents/mainagent/wrapup/task-timeout/reset')
  check('mainagent has no task-timeout default', taskTimeoutUnsupported.status === 200
    && taskTimeoutUnsupported.body.task_timeout_wrapup_default === '', json(taskTimeoutUnsupported.body))

  // ── 7. 运行配置 ─────────────────────────────────────────────────────────
  const config = await jput('/api/agents/worker/config', { max_turns: 12, run_seconds: 300, web_search: true })
  const configRow = await agentRow('worker')
  check('save runtime config', config.status === 200 && config.body.ok === true
    && config.body.max_turns === 12 && config.body.run_seconds === 300
    && Number(configRow.max_turns) === 12 && Number(configRow.run_seconds) === 300
    && configRow.web_search === true, json(config.body))

  const negative = await jput('/api/agents/worker/config', { max_turns: -3 })
  check('clamp negative max_turns', negative.status === 200 && Number((await agentRow('worker')).max_turns) === 0, json(negative.body))

  const notInteger = await jput('/api/agents/worker/config', { run_seconds: 'abc' })
  check('reject non-integer run_seconds', notInteger.status === 400 && String(notInteger.body.error).includes('run_seconds'), json(notInteger.body))

  const bindProfile = await jput('/api/agents/worker/config', { llm_profile_id: 1 })
  check('bind llm profile', bindProfile.status === 200 && Number((await agentRow('worker')).llm_profile_id) === 1, json(bindProfile.body))

  const badProfile = await jput('/api/agents/worker/config', { llm_profile_id: 999 })
  check('reject unknown llm profile', badProfile.status === 400
    && String(badProfile.body.error).includes('LLM 配置不存在'), json(badProfile.body))

  const unbind = await jput('/api/agents/worker/config', { llm_profile_id: null })
  check('unbind llm profile', unbind.status === 200 && (await agentRow('worker')).llm_profile_id === null, json(unbind.body))

  const triggerParallel = await jput('/api/agents/reporter/config', { trigger_run_mode: 'parallel', trigger_max_parallel: 3 })
  const triggerRow = await agentRow('reporter')
  check('save trigger policy', triggerParallel.status === 200
    && triggerRow.trigger_run_mode === 'parallel' && Number(triggerRow.trigger_max_parallel) === 3
    && triggerRow.trigger_merge_mode === 'all', json(triggerRow?.trigger_run_mode))

  const triggerPartial = await jput('/api/agents/reporter/config', { trigger_merge_mode: 'none' })
  const partialRow = await agentRow('reporter')
  check('partial trigger patch keeps other fields', triggerPartial.status === 200
    && partialRow.trigger_run_mode === 'parallel' && partialRow.trigger_merge_mode === 'none'
    && Number(partialRow.trigger_max_parallel) === 3, json(partialRow?.trigger_merge_mode))

  const badTrigger = await jput('/api/agents/reporter/config', { trigger_run_mode: 'bogus' })
  check('reject invalid trigger run mode', badTrigger.status === 400
    && String(badTrigger.body.error).includes('trigger_run_mode'), json(badTrigger.body))

  const emptyConfig = await jput('/api/agents/reporter/config', {})
  check('empty patch is a no-op', emptyConfig.status === 200 && emptyConfig.body.ok === true, json(emptyConfig.body))

  // ── 8. MCP / Skill 可见性（与资源侧共用 visibility / skillVisibility 行）─────
  const visibilityEmpty = await jget('/api/agents/reporter/visibility')
  check('visibility starts empty', visibilityEmpty.status === 200
    && json(visibilityEmpty.body.mcp) === '[]' && json(visibilityEmpty.body.skill) === '[]', json(visibilityEmpty.body))

  const visibilitySet = await jput('/api/agents/reporter/visibility', { mcp: [3, 1, 1], skill: ['dev', 'dev'] })
  check('save visibility', visibilitySet.status === 200 && visibilitySet.body.ok === true
    && json(visibilitySet.body.mcp) === '[1,3]' && json(visibilitySet.body.skill) === '["dev"]', json(visibilitySet.body))

  const visibilityRead = await jget('/api/agents/reporter/visibility')
  check('visibility read back', json(visibilityRead.body) === '{"mcp":[1,3],"skill":["dev"]}', json(visibilityRead.body))

  const sharedRows = await meta.table('visibility')
  check('visibility rows are the resource-side rows', sharedRows.some((row) => row.agent === 'reporter' && row.kind === 'mcp' && Number(row.resource_id) === 1 && row.enabled === true)
    && sharedRows.some((row) => row.agent === 'reporter' && Number(row.resource_id) === 3)
    && sharedRows.filter((row) => row.agent === 'reporter').length === 2
    && sharedRows.some((row) => row.agent === 'worker' && Number(row.resource_id) === 9), json(sharedRows))

  const skillOnly = await jput('/api/agents/reporter/visibility', { skill: [] })
  check('visibility patch keeps untouched kind', skillOnly.status === 200
    && json(skillOnly.body.mcp) === '[1,3]' && json(skillOnly.body.skill) === '[]', json(skillOnly.body))

  const visibilityBad = await jput('/api/agents/reporter/visibility', { mcp: 'nope' })
  check('reject non-array mcp', visibilityBad.status === 400 && String(visibilityBad.body.error).includes('mcp'), json(visibilityBad.body))

  // ── 9. 级联删除 ─────────────────────────────────────────────────────────
  await operations.writer.put({ table: 'agent_triggers', key: '1', record: { id: 1, agent_key: 'reporter', enabled: true, interval_sec: 60 } })
  await jput('/api/agents/reporter/visibility', { mcp: [7], skill: ['ops'] })

  const deleted = await jdel('/api/agents/reporter')
  check('delete custom agent', deleted.status === 200 && deleted.body.deleted === 'reporter', json(deleted.body))
  check('agent row gone', (await agentRow('reporter')) === undefined, json(await agentRow('reporter')))

  const gone = await jget('/api/agents/reporter/prompts')
  check('prompt versions cascade-deleted', gone.status === 404, json(gone.body))
  check('prompt table empty for key', (await operations.writer.list('agent_prompts')).every((row) => row.agent_key !== 'reporter'),
    json((await operations.writer.list('agent_prompts')).length))
  check('triggers cascade-deleted', (await operations.writer.list('agent_triggers')).every((row) => row.agent_key !== 'reporter'),
    json((await operations.writer.list('agent_triggers')).length))

  const toolsAfter = await meta.table('tools')
  check('tool bindings cleaned', !toolsAfter.some((tool) => (tool.agents ?? []).includes('reporter')), json(toolsAfter.map((tool) => tool.agents)))

  const visAfter = await meta.table('visibility')
  check('visibility rows cleaned', !visAfter.some((row) => row.agent === 'reporter'), json(visAfter))
  const metaAfter = await meta.load()
  // meta.load() 的索引值在多后端联合类型下退化成 unknown，按数组收窄。
  const skillVisRows = metaAfter['skillVisibility']
  const skillVisAfter = Array.isArray(skillVisRows) ? skillVisRows : []
  check('skill visibility rows cleaned', !skillVisAfter.some((row) => row.agent === 'reporter'), json(skillVisAfter))

  const deleteBuiltin = await jdel('/api/agents/mainagent')
  check('builtin agent cannot be deleted', deleteBuiltin.status === 400
    && String(deleteBuiltin.body.error).includes('内置'), json(deleteBuiltin.body))

  // ── 10. 未知 agent 的 404 ───────────────────────────────────────────────
  const missing = [
    ['GET', '/api/agents/nope/prompt'], ['GET', '/api/agents/nope/prompts'], ['GET', '/api/agents/nope/variables'],
    ['GET', '/api/agents/nope/visibility']
  ]
  let allMissing = true
  for (const [method, path] of missing) {
    const response = await send(method, path)
    if (!(response.status === 404 && response.body.error === 'agent not found')) {
      allMissing = false
      check(`404 ${path}`, false, json(response))
    }
  }
  if (allMissing) check('unknown agent → 404 on read routes', true)

  const putMissing = await jput('/api/agents/nope/config', { max_turns: 1 })
  check('unknown agent → 404 on config', putMissing.status === 404 && putMissing.body.error === 'agent not found', json(putMissing.body))
  const deleteMissing = await jdel('/api/agents/nope')
  check('unknown agent → 404 on delete', deleteMissing.status === 404 && deleteMissing.body.error === 'agent not found', json(deleteMissing.body))
} catch (error) {
  check('unexpected exception', false, String(error instanceof Error ? (error.stack ?? error) : error))
} finally {
  let failed = false
  for (const item of results) {
    if (!item.ok) failed = true
    console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.ok || !item.detail ? '' : `  ${item.detail}`}`)
  }
  console.log(`\n${results.filter((item) => item.ok).length}/${results.length} checks passed`)
  console.log(`root: ${root}`)
  process.exit(failed ? 1 : 0)
}
