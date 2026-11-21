// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import jwt from 'jsonwebtoken'

/** 端点文档的形状：只声明本脚本真正读到的字段，其余字段不参与对账。 */
type TaskRow = { id: string; [field: string]: unknown }
type TaskPage = { total: number; page: number; size: number; tasks: TaskRow[] }
type AssetRow = { id: string; [field: string]: unknown }
type AssetPage = { total: number; assets: AssetRow[] }
type FindingRow = { id: string; finding_id?: string; task_id?: string; [field: string]: unknown }
type FindingPage = { total: number; items: FindingRow[] }
type NodeRow = { id: string; [field: string]: unknown }
type EdgeRow = { src: string; dst: string; rel: string }
type NodePage = { items: NodeRow[]; edges: EdgeRow[] }
type IntentRow = { id: string }
/** intents 端点两种形状都出现过：裸数组，或包在 items 里的分页文档。 */
type IntentDoc = IntentRow[] | { items: IntentRow[] }
type ActivityDoc = { items: { seq: number }[]; snapshot_cursor?: unknown }
type TokensDoc = { workers: unknown[]; sessions: unknown[]; total: unknown }
type GoalsDoc = { goals: unknown[] }
type GroupRow = { task_id?: string | number | null }
type GroupsDoc = { items?: GroupRow[] }
type ToolRow = { name: string; description: string }
type CoverageDoc = { denominator: number }
type TrafficDoc = { bindings: unknown[] }

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const token = jwt.sign({}, readFileSync(join(repo, 'jwt.key')), { algorithm: 'HS256', subject: 'VEXNAR', expiresIn: '1h' })
const GO = process.env.P0_GO_API || 'http://127.0.0.1:8787'
const TS = 'http://127.0.0.1:8790'
const headers = { Authorization: `Bearer ${token}` }
/** JSON 边界：响应体没有可静态校验的契约，文档形状由调用处的类型参数声明。 */
const get = async <Doc>(base: string, path: string): Promise<Doc> => (await (await fetch(base + path, { headers })).json()) as Doc
const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k): [string, unknown] => [k, canon((v as Record<string, unknown>)[k])])) : v
const same = (a: unknown, b: unknown): boolean => JSON.stringify(canon(a)) === JSON.stringify(canon(b))
function diff(left: unknown, right: unknown, path = ''): string[] {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return [`${path}.length ${left.length}/${right.length}`]
    for (let i = 0; i < left.length; i++) { const d = diff(left[i], right[i], `${path}[${i}]`); if (d.length) return d }
    return []
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    // 一侧是数组、另一侧是对象时按原脚本的方式取键。
    const leftRecord = left as Record<string, unknown>
    const rightRecord = right as Record<string, unknown>
    for (const key of new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])) {
      const d = diff(leftRecord[key], rightRecord[key], `${path}.${key}`)
      if (d.length) return d
    }
    return []
  }
  return JSON.stringify(left) === JSON.stringify(right) ? [] : [`${path}: ${JSON.stringify(left)} vs ${JSON.stringify(right)}`]
}
type Check = { name: string; ok: boolean; detail: string }
const results: Check[] = []
const check = (name: string, ok: boolean, detail = ''): number => results.push({ name, ok, detail })

const goTasks = (await get<{ tasks: TaskRow[] }>(GO, '/api/tasks')).tasks
const tsTasks = (await get<{ tasks: TaskRow[] }>(TS, '/api/tasks')).tasks
const taskFields = ['id', 'exploration_id', 'name', 'description', 'goal', 'paused', 'queued', 'created_unix', 'completed_unix', 'coverage_enabled', 'tokens', 'goals_total', 'goals_met', 'in_flight', 'findings']
const pick = (row: TaskRow): Record<string, unknown> => Object.fromEntries(taskFields.map((k): [string, unknown] => [k, row[k]]))
check('tasks core fields', same(goTasks.map(pick), tsTasks.map(pick)), JSON.stringify(diff(canon(goTasks.map(pick)), canon(tsTasks.map(pick))).slice(0,2)))

// 任务面板的清单：窗口化清单（page/size）与筛选（status/q）在 Go 与 core 必须逐页相等，
// 否则"第 2 页是谁"在两边就对不上。
for (const query of ['page=1&size=5', 'page=2&size=5', 'page=1&size=9999', 'status=done&page=1&size=5']) {
  const goPage = await get<TaskPage>(GO, `/api/tasks?${query}`)
  const tsPage = await get<TaskPage>(TS, `/api/tasks?${query}`)
  check(`tasks page ${query}`,
    goPage.total === tsPage.total && goPage.page === tsPage.page && goPage.size === tsPage.size &&
      same(goPage.tasks.map((row) => row.id), tsPage.tasks.map((row) => row.id)),
    `total ${goPage.total}/${tsPage.total} · size ${goPage.size}/${tsPage.size}`)
}
const goSearchMarker = (goTasks[0]?.id ?? '').slice(0, 2)
if (goSearchMarker) {
  const query = `q=${encodeURIComponent(goSearchMarker)}&page=1&size=5`
  const goSearch = await get<TaskPage>(GO, `/api/tasks?${query}`)
  const tsSearch = await get<TaskPage>(TS, `/api/tasks?${query}`)
  check('tasks search q',
    goSearch.total === tsSearch.total && same(goSearch.tasks.map((row) => row.id), tsSearch.tasks.map((row) => row.id)),
    `${goSearch.total}/${tsSearch.total}`)
}
// 工具目录：runner 自己列的 10 个工具，core 直接透出，客户端不再硬编码。
const tools = await get<{ tools: ToolRow[] }>(TS, '/api/engine/tools')
check('engine tool catalog', Array.isArray(tools.tools) && tools.tools.length >= 4 &&
  tools.tools.every((tool) => typeof tool.name === 'string' && typeof tool.description === 'string'),
  `${tools.tools?.length ?? 0} tools`)

const goAssets = await get<AssetPage>(GO, '/api/assets?type=root_domain&limit=200')
const tsAssets = await get<AssetPage>(TS, '/api/assets?type=root_domain&limit=200')
const assetFields = ['id', 'type', 'company_id', 'task_ids', 'domain', 'root_domain', 'last_seen']
const pickAsset = (row: AssetRow): Record<string, unknown> => Object.fromEntries(assetFields.filter((k) => k in row).map((k): [string, unknown] => [k, row[k]]))
check('assets core fields', same(goAssets.assets.map(pickAsset), tsAssets.assets.map(pickAsset)), `${goAssets.total}/${tsAssets.total}`)

const goFindings = await get<FindingRow[]>(GO, '/api/exploration/findings')
const tsFindings = await get<FindingRow[]>(TS, '/api/exploration/findings')
const findingFields = ['id', 'finding_id', 'vulnclass', 'name', 'severity', 'status', 'summary', 'evidence']
const pickFinding = (row: FindingRow): Record<string, unknown> => Object.fromEntries(findingFields.filter((k) => k in row).map((k): [string, unknown] => [k, row[k]]))
check('findings core fields', same(goFindings.map(pickFinding), tsFindings.map(pickFinding)), JSON.stringify(diff(canon(goFindings.map(pickFinding)), canon(tsFindings.map(pickFinding))).slice(0,2)))

const goStats = await get<unknown>(GO, '/api/exploration/findings/stats')
const tsStats = await get<unknown>(TS, '/api/exploration/findings/stats')
check('findings stats', same(goStats, tsStats), JSON.stringify(diff(canon(goStats), canon(tsStats)).slice(0,2)))

const taskId = goTasks.find((t) => t.id === '1823') ? '1823' : goTasks[0].id
const goNodes = await get<NodePage>(GO, `/api/exploration/nodes?task=${taskId}&order=asc&size=100`)
const tsNodes = await get<NodePage>(TS, `/api/exploration/nodes?task=${taskId}&order=asc&size=100`)
const nodeFields = ['id', 'type', 'state', 'priority']
const pickNode = (row: NodeRow): Record<string, unknown> => Object.fromEntries(nodeFields.map((k): [string, unknown] => [k, row[k]]))
check('nodes page items', same(goNodes.items.map(pickNode), tsNodes.items.map(pickNode)), JSON.stringify(diff(canon(goNodes.items.map(pickNode)), canon(tsNodes.items.map(pickNode))).slice(0,2)))
const sortEdges = (rows: EdgeRow[]): EdgeRow[] => [...rows].sort((a, b) => (a.src + a.dst + a.rel).localeCompare(b.src + b.dst + b.rel))
check('nodes page edges', same(sortEdges(goNodes.edges), sortEdges(tsNodes.edges)), `${goNodes.edges.length}/${tsNodes.edges.length}`)

const goIntents = await get<IntentDoc>(GO, '/api/exploration/intents?task=1823&limit=50')
const tsIntents = await get<IntentDoc>(TS, '/api/exploration/intents?task=1823&limit=50')
const ids = (value: IntentDoc): string[] => (Array.isArray(value) ? value : value.items).map((row) => row.id)
check('intents ids', same(ids(goIntents), ids(tsIntents)), `${ids(goIntents).length}/${ids(tsIntents).length}`)

const goActivity = await get<ActivityDoc>(GO, '/api/exploration/activity/history?task=657&limit=10&session=plan')
const tsActivity = await get<ActivityDoc>(TS, '/api/exploration/activity/history?task=657&limit=10&session=plan')
const seqs = (value: ActivityDoc): number[] => value.items.map((row) => row.seq)
check('activity history', same(seqs(goActivity), seqs(tsActivity)) && goActivity.snapshot_cursor === tsActivity.snapshot_cursor, `${seqs(goActivity).length}/${seqs(tsActivity).length}`)

const goTokens = await get<TokensDoc>(GO, '/api/exploration/tokens?task=657')
const tsTokens = await get<TokensDoc>(TS, '/api/exploration/tokens?task=657')
check('token stats', same(goTokens.workers, tsTokens.workers) && same(goTokens.sessions, tsTokens.sessions) && same(goTokens.total, tsTokens.total), `${goTokens.workers.length}/${tsTokens.workers.length} · sessions ${goTokens.sessions.length}/${tsTokens.sessions.length}`)

const goGoals = await get<GoalsDoc>(GO, '/api/tasks/657/goals')
const tsGoals = await get<GoalsDoc>(TS, '/api/tasks/657/goals')
check('goals', same(goGoals, tsGoals), `${goGoals.goals.length}/${tsGoals.goals.length}`)

const goTaskAssets = await get<AssetPage>(GO, '/api/assets?task_id=1137&limit=10')
const tsTaskAssets = await get<AssetPage>(TS, '/api/assets?task_id=1137&limit=10')
const assetFields2 = ['id', 'type', 'task_ids', 'domain', 'root_domain', 'port', 'url', 'last_seen']
const pickAsset2 = (row: AssetRow): Record<string, unknown> => Object.fromEntries(assetFields2.filter((key) => key in row).map((key): [string, unknown] => [key, row[key]]))
check('task assets', same(goTaskAssets, tsTaskAssets), `${goTaskAssets.total}/${tsTaskAssets.total}`)
const goTaskCounts = await get<unknown>(GO, '/api/assets/counts?task_id=1137')
const tsTaskCounts = await get<unknown>(TS, '/api/assets/counts?task_id=1137')
check('task asset counts', same(goTaskCounts, tsTaskCounts))

for (const query of ['status=pending&limit=5&page=1', 'severity=high&limit=5&page=1', 'q=test&limit=5&page=1']) {
  const goPage = await get<FindingPage>(GO, `/api/exploration/findings?${query}`)
  const tsPage = await get<FindingPage>(TS, `/api/exploration/findings?${query}`)
  check(`findings ${query}`, goPage.total === tsPage.total && same(goPage.items.map((row) => row.id), tsPage.items.map((row) => row.id)), `${goPage.total}/${tsPage.total}`)
}

// dsh 客户端「任务」面板：发现按 task_id 过滤（任务详情与发现页签共用这一条），
// 页面用 page+limit 分页 —— Go 与 core 必须返回同一个 total 与同一批 finding_id。
// 历史库里的发现多数只有 node 没有 task_id，所以先从"按任务分组"里挑一个真有发现的任务。
const goGroups = await get<GroupsDoc>(GO, '/api/exploration/findings/groups?page=1&limit=20')
const scopedGroup = (goGroups.items ?? []).find((row) => row.task_id != null)
const scopedTaskId = scopedGroup ? String(scopedGroup.task_id) : ''
if (scopedTaskId) {
  for (const extra of ['', '&severity=high', '&status=confirmed', '&q=test']) {
    const query = `task_id=${scopedTaskId}&page=1&limit=20${extra}`
    const goScoped = await get<FindingPage>(GO, `/api/exploration/findings?${query}`)
    const tsScoped = await get<FindingPage>(TS, `/api/exploration/findings?${query}`)
    check(`findings task_id ${extra || 'plain'}`,
      goScoped.total === tsScoped.total && same(goScoped.items.map((row) => row.finding_id), tsScoped.items.map((row) => row.finding_id)),
      `${goScoped.total}/${tsScoped.total}`)
  }
  // 任务详情里"该任务的发现"用的是同一条查询；列表列还读 task_id 字段。
  const goScopedRow = await get<FindingPage>(GO, `/api/exploration/findings?task_id=${scopedTaskId}&page=1&limit=20`)
  const tsScopedRow = await get<FindingPage>(TS, `/api/exploration/findings?task_id=${scopedTaskId}&page=1&limit=20`)
  const scopeFields = ['finding_id', 'task_id', 'vulnclass', 'severity', 'status', 'summary']
  const pickScoped = (row: FindingRow): Record<string, unknown> => Object.fromEntries(scopeFields.filter((k) => k in row).map((k): [string, unknown] => [k, row[k]]))
  check('findings task_id row fields',
    same(goScopedRow.items.map(pickScoped), tsScopedRow.items.map(pickScoped)),
    JSON.stringify(diff(canon(goScopedRow.items.map(pickScoped)), canon(tsScopedRow.items.map(pickScoped))).slice(0, 2)))
} else {
  check('findings task_id scope', false, '没有带 task_id 的发现，无法对账')
}

for (const dsl of ['test', 'method==GET', 'port>8000']) {
  const goSearch = await get<AssetPage>(GO, `/api/assets?dsl=${encodeURIComponent(dsl)}&limit=5`)
  const tsSearch = await get<AssetPage>(TS, `/api/assets?dsl=${encodeURIComponent(dsl)}&limit=5`)
  check(`assets dsl ${dsl}`, goSearch.total === tsSearch.total && same(goSearch.assets.map((row) => row.id), tsSearch.assets.map((row) => row.id)), `${goSearch.total}/${tsSearch.total}`)
}

const goDaily = await get<unknown[]>(GO, '/api/tokens/daily?days=30')
const tsDaily = await get<unknown[]>(TS, '/api/tokens/daily?days=30')
check('daily tokens', same(goDaily, tsDaily), `${goDaily.length}/${tsDaily.length}`)

for (const taskId of ['1137', '657']) {
  const goCoverage = await get<CoverageDoc>(GO, `/api/tasks/${taskId}/coverage`)
  const tsCoverage = await get<CoverageDoc>(TS, `/api/tasks/${taskId}/coverage`)
  check(`coverage ${taskId}`, same(goCoverage, tsCoverage), `${goCoverage.denominator}/${tsCoverage.denominator}`)
}
const goTraffic = await get<TrafficDoc>(GO, '/api/exploration/findings/2976/traffic')
const tsTraffic = await get<TrafficDoc>(TS, '/api/exploration/findings/2976/traffic')
check('finding traffic', same(goTraffic, tsTraffic), `${goTraffic.bindings.length}/${tsTraffic.bindings.length}`)

let failed = false
for (const item of results) { if (!item.ok) failed = true; console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`) }
process.exit(failed ? 1 : 0)
