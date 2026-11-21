// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'

// 在 import register / context 之前把持久层指到临时 SQLite，避免污染真实 store。
const root = await mkdtemp(join(tmpdir(), 'vexnar-tasks-companies-'))
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_STORE_ROOT = root
process.env.VEXNAR_SQLITE_PATH = join(root, 'vexnar.sqlite')
delete process.env.VEXNAR_GATEWAY_TOKEN

const { register } = await import('./src/routes/tasks-companies.ts')
const { meta, operations, store } = await import('./src/context.ts')

const app = new Hono()
register(app)

const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })

const w = operations.writer
const put = (table, key, record) => w.put({ table, key: String(key), record })
const req = (path, init) => app.request(path, init)
const postJSON = (path, payload) => req(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload ?? {}) })
const putJSON = (path, payload) => req(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload ?? {}) })

// ── 造数据 ────────────────────────────────────────────────────────────────

const task = (id, exploration, extra = {}) => ({
  id: String(id), exploration_id: exploration, name: `task-${id}`, description: `desc-${id}`, goal: `goal-${id}`,
  status: 'running', paused: false, queued: false, coverage_enabled: true,
  created_at_text: '2026-01-01T00:00:00+08:00', created_unix: 1767196800, completed_at_text: null, completed_unix: 0,
  ...extra
})

await put('tasks', 1, task(1, 1))
await put('tasks', 2, task(2, 2, { status: 'done' }))
await put('tasks', 3, task(3, 3))
await put('task_relations', '1-2', { task_id: '1', source_task_id: '2' })

const asset = (id, type, extra = {}) => ({ id, type, task_ids: [1], last_seen: '2026-01-01T00:00:00+08:00', ...extra })
await put('assets', 1, asset(1, 'root_domain', { domain: 'example.com', root_domain: 'example.com' }))
await put('assets', 2, asset(2, 'subdomain', { domain: 'api.other.com', root_domain: 'other.com' }))
await put('assets', 3, asset(3, 'ip', { ip: '203.0.113.10' }))
await put('assets', 4, asset(4, 'service', { domain: 'www.example.com', root_domain: 'example.com', port: 443, service_type: 'https', url: 'https://www.example.com' }))
await put('assets', 5, asset(5, 'ip', { ip: '198.51.100.7' }))

const node = (id, exploration, kind, state, payload = {}, extra = {}) => ({
  id: String(id), exploration_id: exploration, kind, state, priority: 0, origin: 'agent',
  payload, created_at: '2026-01-01T00:00:00+08:00', ...extra
})
await put('nodes', 10, node(10, 1, 'intent', 'open', { text: '探测 example.com' }))
await put('nodes', 11, node(11, 1, 'fact', 'confirmed', { summary: '发现 api.other.com' }))
await put('nodes', 12, node(12, 1, 'intent', 'done', { text: '已完成的意图' }))
await put('nodes', 13, node(13, 1, 'intent', 'blocked', { text: '额度阻塞意图' }, { blocked_reason: 'llm_quota_exhausted' }))
await put('nodes', 20, node(20, 2, 'intent', 'done', { text: '来源任务意图' }))
await put('nodes', 21, node(21, 2, 'fact', 'confirmed', { summary: '来源任务事实' }))
await put('nodes', 22, node(22, 2, 'intent', 'open', { text: '来源任务运行中意图' }))

await put('anchors', '10-1', { node_id: 10, asset_id: 1 })
await put('anchors', '11-1', { node_id: 11, asset_id: 1 })
await put('anchors', '12-2', { node_id: 12, asset_id: 2 })
await put('anchors', '20-3', { node_id: 20, asset_id: 3 })
await put('anchors', '21-4', { node_id: 21, asset_id: 4 })
await put('anchors', '22-3', { node_id: 22, asset_id: 3 })

await put('task_scope', 1, { id: 1, task_id: '1', kind: 'domain', value: 'example.com', reason: '', source: 'manual', created_at_text: '2026-01-01T00:00:00+08:00' })

const tables = await meta.load()
tables.taskCategories = [{ id: 7, name: '红队', task_count: 0, created_at: '2026-01-01T00:00:00+08:00', updated_at: '2026-01-01T00:00:00+08:00' }]
tables.llmProfiles = [
  { id: 11, name: '主模型', format: 'openai', model: 'model-a', api_key_hint: '…abcd', is_default: false, base_url: null },
  { id: 12, name: '备用模型', format: 'anthropic', model: 'model-b', api_key_hint: '', is_default: false, base_url: null }
]
tables.agents = []
await meta.save(tables)
meta.reload()

// ── 任务批量控制 ──────────────────────────────────────────────────────────

const controlBadAction = await postJSON('/api/tasks/control/batch', { task_ids: ['1'], action: 'delete' })
check('control batch rejects unknown action', controlBadAction.status === 400, `status=${controlBadAction.status}`)

const controlEmpty = await postJSON('/api/tasks/control/batch', { task_ids: [], action: 'pause' })
check('control batch requires 1-100 ids', controlEmpty.status === 400, `status=${controlEmpty.status}`)

const control = await (await postJSON('/api/tasks/control/batch', { task_ids: ['1', '3'], action: 'pause' })).json()
const pausedRow = await w.readRecord('tasks', '1')
check('control batch pauses every task', control.items?.length === 2 && control.items.every((item) => item.ok) && pausedRow.paused === true && pausedRow.queued === false,
  JSON.stringify({ items: control.items, paused: pausedRow.paused }))
check('control batch reports status paused', control.items?.[0]?.status === 'paused', JSON.stringify(control.items?.[0]))

const controlResume = await (await postJSON('/api/tasks/control/batch', { task_ids: ['1', '3'], action: 'resume' })).json()
const resumedRow = await w.readRecord('tasks', '1')
check('control batch resumes every task', controlResume.items?.every((item) => item.ok) && resumedRow.paused === false && controlResume.items?.[0]?.status === 'running',
  JSON.stringify({ paused: resumedRow.paused, item: controlResume.items?.[0] }))

const mixed = await (await postJSON('/api/tasks/control/batch', { task_ids: ['abc', '999', '1', '1'], action: 'pause' })).json()
const mixedIds = (mixed.items ?? []).map((item) => item.id)
check('control batch keeps bad ids + dedupes', mixedIds.join(',') === 'abc,999,1'
  && mixed.items[0].error === 'bad task id' && mixed.items[1].ok === false && mixed.items[2].ok === true,
  JSON.stringify(mixed.items))
await postJSON('/api/tasks/control/batch', { task_ids: ['1'], action: 'resume' })

// ── 任务批量分类 ──────────────────────────────────────────────────────────

const categoryMissing = await postJSON('/api/tasks/category/batch', { task_ids: ['1'] })
check('category batch requires category_id', categoryMissing.status === 400, `status=${categoryMissing.status}`)

const categoryBad = await postJSON('/api/tasks/category/batch', { task_ids: ['1'], category_id: 'x' })
check('category batch rejects bad category id', categoryBad.status === 400, `status=${categoryBad.status}`)

const categoryAbsent = await postJSON('/api/tasks/category/batch', { task_ids: ['1'], category_id: 42 })
check('category batch rejects missing category', categoryAbsent.status === 404, `status=${categoryAbsent.status}`)

const categoryMove = await (await postJSON('/api/tasks/category/batch', { task_ids: ['1', '2'], category_id: 7 })).json()
const moved = await w.readRecord('tasks', '1')
const moved2 = await w.readRecord('tasks', '2')
check('category batch moves tasks', categoryMove.items?.every((item) => item.ok) && categoryMove.category?.id === 7 && moved.category_id === 7 && moved2.category_id === 7,
  JSON.stringify({ items: categoryMove.items, c1: moved.category_id, c2: moved2.category_id }))

const categoryClear = await (await postJSON('/api/tasks/category/batch', { task_ids: ['1'], category_id: null })).json()
const cleared = await w.readRecord('tasks', '1')
check('category batch clears with null', categoryClear.items?.[0]?.ok === true && categoryClear.category === null && cleared.category_id === null,
  JSON.stringify({ item: categoryClear.items?.[0], category_id: cleared.category_id }))

const categoryPartial = await (await postJSON('/api/tasks/category/batch', { task_ids: ['1', '999'], category_id: 7 })).json()
check('category batch reports vanished task', categoryPartial.items?.[1]?.ok === false && categoryPartial.items?.[1]?.error === 'task not found',
  JSON.stringify(categoryPartial.items))
await postJSON('/api/tasks/category/batch', { task_ids: ['1', '2'], category_id: null })

// ── 任务 LLM 配置链 ───────────────────────────────────────────────────────

const llmUnknown = await putJSON('/api/tasks/1/llm', { llm_profile_ids: [99] })
check('llm rejects unknown profile', llmUnknown.status === 400, `status=${llmUnknown.status}`)

const llmNoKey = await putJSON('/api/tasks/1/llm', { llm_profile_ids: [11, 12] })
const llmNoKeyBody = await llmNoKey.text()
check('llm rejects profile without key', llmNoKey.status === 400 && llmNoKeyBody.includes('#12'), llmNoKeyBody)

const llmDup = await putJSON('/api/tasks/1/llm', { llm_profile_ids: [11, 11] })
check('llm rejects duplicate ids', llmDup.status === 400, `status=${llmDup.status}`)

const llmActiveOut = await putJSON('/api/tasks/1/llm', { llm_profile_ids: [11], active_llm_profile_id: 12 })
check('llm rejects active outside chain', llmActiveOut.status === 400, `status=${llmActiveOut.status}`)

const llmSet = await (await putJSON('/api/tasks/1/llm', { llm_profile_ids: [11] })).json()
const llmRow = await w.readRecord('tasks', '1')
check('llm replaces chain + defaults active', llmSet.llm_profile_ids?.[0] === 11 && llmSet.active_llm_profile_id === 11
  && llmSet.llm_failover_state === 'ready' && llmRow.active_llm_profile_id === 11 && llmRow.llm_profile_id === 11,
  JSON.stringify({ set: llmSet, row: { active: llmRow.active_llm_profile_id, chain: llmRow.llm_profile_ids } }))

const llmReopenedNode = await w.readRecord('nodes', '13')
check('llm reopens quota-blocked intents', llmSet.reopened_intents === 1 && llmReopenedNode.state === 'open' && llmReopenedNode.blocked_reason === null,
  JSON.stringify({ reopened: llmSet.reopened_intents, state: llmReopenedNode.state }))

const llmEmptyChain = await (await putJSON('/api/tasks/1/llm', { llm_profile_ids: [] })).json()
const llmEmptyRow = await w.readRecord('tasks', '1')
check('llm empty chain resets to default', llmEmptyChain.llm_profile_ids?.length === 0 && llmEmptyChain.llm_failover_state === 'default'
  && llmEmptyRow.active_llm_profile_id === null, JSON.stringify(llmEmptyChain))
await putJSON('/api/tasks/1/llm', { llm_profile_ids: [11] })

const resolution = await (await req('/api/tasks/1/llm/resolution')).json()
check('llm resolution reports task chain for every role',
  ['mainagent', 'planner', 'worker'].every((role) => resolution[role]?.profile_id === 11 && resolution[role]?.source === 'task_chain' && resolution[role]?.available === true),
  JSON.stringify(resolution))

const resolution404 = await req('/api/tasks/999/llm/resolution')
check('llm resolution 404 for unknown task', resolution404.status === 404, `status=${resolution404.status}`)

// ── 资产关联 / 意图资产 / 覆盖图 ──────────────────────────────────────────

const refsBad = await req('/api/tasks/1/asset-refs')
check('asset refs requires asset_id', refsBad.status === 400, `status=${refsBad.status}`)

const refsOwn = await (await req('/api/tasks/1/asset-refs?asset_id=1')).json()
check('asset refs splits intents and facts',
  refsOwn.intents?.length === 1 && refsOwn.intents[0].id === 10 && refsOwn.facts?.length === 1 && refsOwn.facts[0].id === 11
  && refsOwn.facts[0].summary === '发现 api.other.com' && refsOwn.findings?.length === 0,
  JSON.stringify(refsOwn))

const refsInherited = await (await req('/api/tasks/1/asset-refs?asset_id=3')).json()
check('asset refs include terminal inherited intents only',
  refsInherited.intents?.length === 1 && refsInherited.intents[0].id === 20 && refsInherited.intents[0].inherited === true
  && refsInherited.intents[0].source_task_id === '2',
  JSON.stringify(refsInherited.intents))

const intentAssets = await (await req('/api/tasks/1/intent-assets')).json()
const ownAssets = (intentAssets.assets ?? []).filter((row) => !row.inherited)
const inheritedAssets = (intentAssets.assets ?? []).filter((row) => row.inherited)
check('intent assets list own + inherited targets',
  ownAssets.length === 2 && ownAssets.some((row) => row.intent_id === 10 && row.label === 'example.com' && row.source === 'anchor')
  && inheritedAssets.length === 1 && inheritedAssets[0].asset_id === 3 && inheritedAssets[0].source_task_id === 2
  && inheritedAssets[0].source_summary === '意图在黑板中锚定该资产',
  JSON.stringify(intentAssets.assets))

const graph = await (await req('/api/tasks/1/coverage-graph')).json()
const graphKeys = (graph.nodes ?? []).map((row) => row.key)
const graphEdge = (src, dst) => (graph.edges ?? []).some((edge) => edge.src === src && edge.dst === dst)
check('coverage graph covers scope + anchored assets',
  graphKeys.includes('a:1') && graphKeys.includes('a:2') && graphKeys.includes('a:3') && graphKeys.includes('a:4') && !graphKeys.includes('a:5'),
  JSON.stringify(graphKeys))
check('coverage graph links subdomain to synthesized root',
  graphKeys.includes('r:other.com') && graphEdge('a:2', 'r:other.com') && graph.nodes.find((row) => row.key === 'r:other.com').in_scope === false,
  JSON.stringify(graph.edges))
check('coverage graph marks tested facts', graph.nodes.find((row) => row.key === 'a:1')?.tested === true
  && graph.nodes.find((row) => row.key === 'a:3')?.tested === false,
  JSON.stringify(graph.nodes.filter((row) => ['a:1', 'a:3'].includes(row.key))))

// ── 公司（企业主体）───────────────────────────────────────────────────────

const createCompany = await postJSON('/api/companies', { name: '示例企业', scope: ['example.com', '203.0.113.10', '京ICP备12345678号-1'] })
const created = await createCompany.json()
const attAsset1 = await w.readRecord('assets', '1')
const attAsset3 = await w.readRecord('assets', '3')
const attAsset4 = await w.readRecord('assets', '4')
const attAsset2 = await w.readRecord('assets', '2')
check('company create + scope classification', createCompany.status === 201 && created.created === true
  && created.scope_added === 3 && created.scope_invalid === 0, JSON.stringify(created))
check('company create attributes assets by domain and cidr',
  attAsset1.company_id === created.id && attAsset3.company_id === created.id && attAsset4.company_id === created.id
  && attAsset2.company_id == null,
  JSON.stringify({ a1: attAsset1.company_id, a3: attAsset3.company_id, a4: attAsset4.company_id, a2: attAsset2.company_id }))

const duplicate = await postJSON('/api/companies', { name: '  示例企业 ', scope: [] })
check('company create rejects duplicate nkey', duplicate.status === 409, `status=${duplicate.status}`)

const scopeTooLong = await postJSON('/api/companies', { name: '超长企业', scope: [`${'a'.repeat(1100)}.example.com`] })
check('company scope rejects oversize raw', scopeTooLong.status === 400, `status=${scopeTooLong.status}`)

const getCompany = await (await req(`/api/companies/${created.id}`)).json()
check('company detail returns scope rules',
  getCompany.company?.name === '示例企业' && getCompany.company?.nkey === '示例企业' && getCompany.scope?.length === 3
  && getCompany.scope.some((row) => row.kind === 'domain' && row.domain === 'example.com')
  && getCompany.scope.some((row) => row.kind === 'ip' && row.net === '203.0.113.10/32')
  && getCompany.scope.some((row) => row.kind === 'icp' && row.value === '京icp备12345678号-1'),
  JSON.stringify(getCompany))

const getCompany404 = await req('/api/companies/999999')
check('company detail 404 for missing id', getCompany404.status === 404, `status=${getCompany404.status}`)

const addScope = await (await postJSON(`/api/companies/${created.id}/scope`, { scope: [{ kind: 'domain', value: 'other.com' }], reason: '补充' })).json()
const attAsset2After = await w.readRecord('assets', '2')
check('company scope add reattributes newly covered asset',
  addScope.added === 1 && addScope.skipped === 0 && attAsset2After.company_id === created.id && attAsset2After.company_source === 'scope',
  JSON.stringify({ addScope, company: attAsset2After.company_id }))

const dedupeScope = await (await postJSON(`/api/companies/${created.id}/scope`, { scope: ['other.com'] })).json()
check('company scope add skips duplicates', dedupeScope.added === 0 && dedupeScope.skipped === 1, JSON.stringify(dedupeScope))

const resetInvalid = await postJSON(`/api/companies/${created.id}/scope`, { scope: ['203.0.113.999/24'], reset: true })
check('company scope reset refuses invalid rules', resetInvalid.status === 400, `status=${resetInvalid.status}`)

const reset = await (await postJSON(`/api/companies/${created.id}/scope`, { scope: [{ kind: 'domain', value: 'example.com' }], reset: true })).json()
const afterReset = await w.readRecord('assets', '2')
check('company scope reset replays attribution', reset.added === 1 && reset.invalid === 0 && afterReset.company_id == null,
  JSON.stringify({ reset, a2: afterReset.company_id }))

const reattribute = await (await postJSON('/api/companies/reattribute', {})).json()
const afterReattribute = await w.readRecord('assets', '1')
check('company reattribute rebuilds derived ownership', reattribute.ok === true && afterReattribute.company_id === created.id,
  JSON.stringify({ reattribute, a1: afterReattribute.company_id }))

const deleteMissing = await req('/api/companies/999999', { method: 'DELETE' })
check('company delete 404 for missing id', deleteMissing.status === 404, `status=${deleteMissing.status}`)

const deletePlain = await (await req(`/api/companies/${created.id}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{}' })).json()
const afterDelete = await w.readRecord('assets', '1')
const scopeAfterDelete = (await w.list('company_scope')).filter((row) => Number(row.company_id) === created.id)
check('company delete keeps assets and clears attribution',
  deletePlain.deleted === 1 && deletePlain.assets_deleted === 0 && afterDelete.company_id == null && scopeAfterDelete.length === 0,
  JSON.stringify({ deletePlain, a1: afterDelete.company_id, scopes: scopeAfterDelete.length }))

const createSecond = await (await postJSON('/api/companies', { name: '删除企业', scope: ['198.51.100.7'] })).json()
const secondAsset = await w.readRecord('assets', '5')
const deleteCascade = await (await req(`/api/companies/${createSecond.id}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ delete_assets: true }) })).json()
const goneAsset = await w.readRecord('assets', '5')
check('company delete with delete_assets removes owned assets',
  secondAsset.company_id === createSecond.id && deleteCascade.assets_deleted === 1 && goneAsset === null,
  JSON.stringify({ second: secondAsset.company_id, cascade: deleteCascade, gone: goneAsset }))

// ── 汇总 ──────────────────────────────────────────────────────────────────

store.invalidate?.()
let failed = false
for (const item of results) {
  if (!item.ok) failed = true
  console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`)
}
console.log(`\n${results.filter((item) => item.ok).length}/${results.length} passed`)
process.exit(failed ? 1 : 0)
