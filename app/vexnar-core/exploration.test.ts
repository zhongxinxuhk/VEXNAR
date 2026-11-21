// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// exploration.ts 自检：图 / 前沿 / 主会话 / 分组 / 资产树 / 导出 / 血缘 / 深入利用 /
// 复测 / 活动详情 / SSE 流 / 路由注册顺序。
//
// 运行：cd app/vexnar-store && npx tsx ../vexnar-core/exploration.test.ts

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'

// 在 import context 之前把持久层指到临时 SQLite，避免污染真实 store。
const root = await mkdtemp(join(tmpdir(), 'vexnar-exploration-'))
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_STORE_ROOT = root
process.env.VEXNAR_SQLITE_PATH = join(root, 'vexnar.sqlite')

const { register } = await import('./src/routes/exploration.ts')
const { meta, operations } = await import('./src/context.ts')

type CheckResult = { name: string; ok: boolean; detail: string }
/** 图 / 前沿 / 血缘的 DTO（只声明断言读到的字段）。 */
type GraphNode = { id: string; type: string; state: string; payload: string; priority?: number }
type GraphEdge = { src: string; dst: string; rel?: string }
type GraphDto = { nodes: GraphNode[]; edges: GraphEdge[] }
/** asset-tree 的节点：`parent` 指向父节点 key，`total`/`high` 为聚合计数。 */
type TreeNode = { key: string; self?: number; parent?: string | null; total?: number; high?: number }
type TreeDto = { nodes: TreeNode[]; finding_total: number; truncated: boolean }
type FindingDto = { id: number | string; finding_id: number | string }
type LineageDto = { nodes: Array<{ id: string | number }>; edges: Array<{ src: string | number; dst: string | number }> }
/** SSE 读取：`reader.read()` 或超时占位，两者靠 `timedOut` 区分。 */
type StreamTimeout = { timedOut: true }

const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail })

const app = new Hono()
register(app)

// ── 种子数据 ─────────────────────────────────────────────────────────────────
// 复测 Agent + 绑定工具（POST /retests 的前置校验）
await meta.save({
  agents: [{ id: 1, key: 'retester', name: '漏洞复测', enabled: true }],
  tools: [
    { key: 'get_finding_retest_context', enabled: true, agents: ['retester'] },
    { key: 'record_finding_retest_result', enabled: true, agents: ['retester'] }
  ]
})

const task = await operations.createTask({ description: '演示任务', goal: '打穿 example.test', name: 'demo' })
const taskId = String(task.id)

const root_node = await operations.addNode(taskId, { kind: 'fact', state: 'origin', origin: 'system', payload: { text: 'origin' } })
await operations.addGoal(taskId, { text: '验证 SQL 注入' })
const intentA = await operations.addNode(taskId, { kind: 'intent', parent_id: root_node.id, payload: { text: '探测 a' }, priority: 5 })
const intentB = await operations.addNode(taskId, { kind: 'intent', parent_id: root_node.id, payload: { text: '探测 b' }, priority: 9 })

// 资产：company → root_domain → subdomain → service → endpoint
const nowIso = new Date().toISOString()
await operations.writer.commit([
  {
    table: 'companies',
    key: '1',
    record: { id: 1, name: '示例集团', nkey: 'demo', created_at: nowIso, updated_at: nowIso, scope: [], asset_count: 4 }
  },
  { table: 'assets', key: '1', record: { id: 1, type: 'root_domain', company_id: 1, domain: 'example.test', task_ids: [Number(taskId)], last_seen: nowIso } },
  { table: 'assets', key: '2', record: { id: 2, type: 'subdomain', domain: 'api.example.test', root_domain: 'example.test', task_ids: [Number(taskId)], last_seen: nowIso } },
  { table: 'assets', key: '3', record: { id: 3, type: 'service', domain: 'api.example.test', port: 443, url: 'https://api.example.test/', task_ids: [Number(taskId)], last_seen: nowIso } },
  { table: 'assets', key: '4', record: { id: 4, type: 'endpoint', domain: 'api.example.test', port: 443, url: 'https://api.example.test/api/v1?id=1', task_ids: [Number(taskId)], last_seen: nowIso } }
])

const finding1 = await operations.reportFinding({
  task_id: taskId, intent_id: intentA.id, vulnclass: 'SQL注入', name: 'union 注入',
  severity: 'high', summary: '参数 id 可注入', evidence: 'id=1 UNION SELECT 1', worker: 'tester',
  asset_ids: [4]
})
// 第二条发现没有 intent、没有资产 → 未关联资产桶
const finding2 = await operations.reportFinding({
  task_id: taskId, vulnclass: '信息泄露', severity: 'low',
  summary: '响应头泄露版本', evidence: 'Server: nginx/1.0', worker: 'tester'
})
const findingId1 = String(finding1.finding_id)
const findingId2 = String(finding2.finding_id)
const findingNode1 = String(finding1.finding_node_id)

// finding 节点的资产锚点（deepen 会把它复制到新意图上）
await operations.writer.commit([{ table: 'anchors', key: `${findingNode1}-4`, record: { node_id: Number(findingNode1), asset_id: 4 } }])

// 活动（SSE / 详情）
await operations.appendActivity(taskId, { kind: 'text', worker: 'mainagent', summary: '第一步', node_id: intentA.id })
await operations.appendActivity(taskId, { kind: 'tool', worker: 'mainagent', tool: 'nmap', summary: '扫描完成', node_id: intentA.id })
await operations.appendActivity(taskId, { kind: 'result', worker: 'mainagent', summary: '收尾' })

// ── 1. GET /api/exploration/graph ────────────────────────────────────────────
const graphRes = await app.request(`/api/exploration/graph?task=${taskId}`)
const graph = (await graphRes.json()) as GraphDto
const nodeIds = graph.nodes.map((n) => n.id)
check(
  'graph returns nodes + edges with DTO shape',
  graphRes.status === 200 &&
    graph.nodes.length === 6 &&
    graph.edges.length === 4 &&
    graph.nodes[0].type === 'fact' &&
    typeof graph.nodes[0].payload === 'string' &&
    JSON.parse(graph.nodes[0].payload).text === 'origin' &&
    graph.edges.some((e) => e.src === String(intentA.id) && e.dst === findingNode1 && e.rel === 'yields'),
  JSON.stringify({ nodes: graph.nodes.length, edges: graph.edges.length, ids: nodeIds })
)
const graphMissing = await (await app.request('/api/exploration/graph?task=999')).json()
check('graph without task → empty graph', graphMissing.nodes.length === 0 && graphMissing.edges.length === 0, JSON.stringify(graphMissing))

// ── 2. GET /api/exploration/frontier ────────────────────────────────────────
const frontierRes = await app.request(`/api/exploration/frontier?task=${taskId}`)
const frontier = (await frontierRes.json()) as GraphNode[]
check(
  'frontier lists open intents by priority desc / id asc',
  frontierRes.status === 200 &&
    frontier.length === 2 &&
    frontier[0].id === String(intentB.id) &&
    frontier[1].id === String(intentA.id) &&
    frontier.every((n) => n.type === 'intent' && n.state === 'open'),
  JSON.stringify(frontier.map((n) => ({ id: n.id, priority: n.priority })))
)
const frontierLimited = (await (await app.request(`/api/exploration/frontier?task=${taskId}&limit=1`)).json()) as GraphNode[]
check('frontier honours limit', frontierLimited.length === 1 && frontierLimited[0].id === String(intentB.id), JSON.stringify(frontierLimited.map((n) => n.id)))

// ── 3/4. main-sessions ──────────────────────────────────────────────────────
const sessionsBefore = await (await app.request(`/api/exploration/main-sessions?task=${taskId}`)).json()
const newSessionRes = await app.request(`/api/exploration/main-session/new?task=${taskId}`, { method: 'POST' })
const newSession = await newSessionRes.json()
const sessionsAfter = await (await app.request(`/api/exploration/main-sessions?task=${taskId}`)).json()
check(
  'main-sessions implicit seq 0 then new segment',
  sessionsBefore.current === 0 &&
    sessionsBefore.sessions.length === 1 &&
    sessionsBefore.sessions[0].seq === 0 &&
    newSessionRes.status === 200 &&
    newSession.seq === 1 &&
    newSession.current === 1 &&
    sessionsAfter.current === 1 &&
    sessionsAfter.sessions.length === 2 &&
    sessionsAfter.sessions[1].seq === 0,
  JSON.stringify({ before: sessionsBefore.sessions, after: sessionsAfter.sessions })
)
const sessionsMissing = await app.request('/api/exploration/main-sessions?task=999')
check('main-sessions unknown task → 404', sessionsMissing.status === 404, String(sessionsMissing.status))

// ── 5. GET /api/exploration/findings/groups ─────────────────────────────────
const groupsRes = await app.request('/api/exploration/findings/groups')
const groups = await groupsRes.json()
check(
  'findings groups bucket by task with severity counts',
  groupsRes.status === 200 &&
    groups.total === 1 &&
    groups.finding_total === 2 &&
    groups.page === 1 &&
    groups.page_size === 10 &&
    groups.items[0].task_id === Number(taskId) &&
    groups.items[0].count === 2 &&
    groups.items[0].high === 1 &&
    groups.items[0].low === 1 &&
    groups.items[0].task_description === '演示任务',
  JSON.stringify(groups)
)
const groupsFiltered = await (await app.request('/api/exploration/findings/groups?severity=high')).json()
check('findings groups honour severity filter', groupsFiltered.finding_total === 1 && groupsFiltered.items[0].count === 1, JSON.stringify(groupsFiltered.items?.[0]))

// ── 6. GET /api/exploration/findings/asset-tree ─────────────────────────────
const treeRes = await app.request('/api/exploration/findings/asset-tree')
const tree = (await treeRes.json()) as TreeDto
const treeByKey = new Map(tree.nodes.map((n): [string, TreeNode] => [n.key, n]))
check(
  'asset-tree builds ancestor chain + company rollup',
  treeRes.status === 200 &&
    tree.finding_total === 2 &&
    tree.truncated === false &&
    treeByKey.get('a:4')?.self === 1 &&
    treeByKey.get('a:4')?.parent === 'a:3' &&
    treeByKey.get('a:3')?.parent === 'a:2' &&
    treeByKey.get('a:2')?.parent === 'a:1' &&
    treeByKey.get('a:1')?.parent === 'c:1' &&
    treeByKey.get('c:1')?.total === 1 &&
    treeByKey.get('c:1')?.high === 1,
  JSON.stringify({ nodes: tree.nodes.length, total: tree.finding_total, keys: [...treeByKey.keys()] })
)
check(
  'asset-tree unassigned bucket collects asset-less findings',
  treeByKey.get('__none__')?.total === 1 && treeByKey.get('__none__')?.self === 1 && tree.nodes[tree.nodes.length - 1].key === '__none__',
  JSON.stringify(treeByKey.get('__none__'))
)

// ── 7. GET /api/exploration/findings/export ─────────────────────────────────
const csvRes = await app.request('/api/exploration/findings/export?scope=filtered&format=csv')
const csvBuf = Buffer.from(await csvRes.arrayBuffer())
const csvText = csvBuf.toString('utf8')
check(
  'export csv is an attachment with UTF-8 BOM + header',
  csvRes.status === 200 &&
    (csvRes.headers.get('content-type') ?? '').startsWith('text/csv') &&
    (csvRes.headers.get('content-disposition') ?? '').includes('findings-') &&
    csvBuf[0] === 0xef &&
    csvBuf[1] === 0xbb &&
    csvBuf[2] === 0xbf &&
    csvText.startsWith('\ufeffID,名称') &&
    csvText.includes('union 注入'),
  JSON.stringify({ len: csvText.length, head: csvText.slice(0, 24) })
)
const jsonRes = await app.request('/api/exploration/findings/export?scope=all&format=json')
const jsonExport = (await jsonRes.json()) as FindingDto[]
check(
  'export json is the finding DTO array (all scope)',
  jsonRes.status === 200 && Array.isArray(jsonExport) && jsonExport.length === 2 && jsonExport.every((row) => row.finding_id === row.id),
  JSON.stringify(jsonExport.map((row) => row.finding_id))
)
const mdRes = await app.request('/api/exploration/findings/export?scope=filtered&format=md-single')
const mdText = await mdRes.text()
check(
  'export markdown summary keeps severity order + task name',
  mdRes.status === 200 && mdText.startsWith('# 漏洞发现汇总报告') && mdText.indexOf('HIGH') < mdText.indexOf('LOW') && mdText.includes('演示任务'),
  JSON.stringify({ len: mdText.length })
)
const zipRes = await app.request('/api/exploration/findings/export?scope=filtered&format=md-zip')
const zipBuf = Buffer.from(await zipRes.arrayBuffer())
check(
  'export md-zip is a real zip archive',
  zipRes.status === 200 &&
    zipRes.headers.get('content-type') === 'application/zip' &&
    zipBuf.readUInt32LE(0) === 0x04034b50 &&
    zipBuf.includes(Buffer.from('findings.md')),
  JSON.stringify({ bytes: zipBuf.length })
)
const badFormat = await app.request('/api/exploration/findings/export?format=xml')
const badScope = await app.request('/api/exploration/findings/export?scope=weird&format=csv')
const badIds = await app.request('/api/exploration/findings/export?scope=selected&ids=abc&format=csv')
check(
  'export rejects bad format / scope / ids',
  badFormat.status === 400 && badScope.status === 400 && badIds.status === 400,
  JSON.stringify({ format: badFormat.status, scope: badScope.status, ids: badIds.status })
)

// ── 8. GET /api/exploration/findings/{id}/lineage ───────────────────────────
const lineageRes = await app.request(`/api/exploration/findings/${findingId1}/lineage`)
const lineage = (await lineageRes.json()) as LineageDto
const lineageIds = lineage.nodes.map((n) => n.id).sort()
check(
  'lineage = finding node + ancestors + internal edges only',
  lineageRes.status === 200 &&
    lineageIds.join(',') === [root_node.id, intentA.id, findingNode1].sort((a, b) => Number(a) - Number(b)).join(',') &&
    lineage.edges.length === 2 &&
    lineage.edges.some((e) => e.src === String(root_node.id) && e.dst === String(intentA.id)) &&
    lineage.edges.some((e) => e.src === String(intentA.id) && e.dst === findingNode1),
  JSON.stringify({ ids: lineageIds, edges: lineage.edges })
)
const lineage404 = await app.request('/api/exploration/findings/9499/lineage')
const lineage400 = await app.request('/api/exploration/findings/abc/lineage')
check('lineage 404 for unknown finding / 400 for bad id', lineage404.status === 404 && lineage400.status === 400, JSON.stringify({ nf: lineage404.status, bad: lineage400.status }))

// ── 9. POST /api/exploration/findings/{id}/deepen ───────────────────────────
const deepenEmpty = await app.request(`/api/exploration/findings/${findingId1}/deepen`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({})
})
const deepenRes = await app.request(`/api/exploration/findings/${findingId1}/deepen`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ description: '拿到 union 注入后尝试写文件落地' })
})
const deepened = await deepenRes.json()
const graphAfter = (await (await app.request(`/api/exploration/graph?task=${taskId}`)).json()) as GraphDto
const intentNodes = await operations.writer.list('nodes')
const newIntent = intentNodes.find((row) => String(row.id) === String(deepened.intent_id))
const intentAnchors = (await operations.writer.list('anchors')).filter((row) => String(row.node_id) === String(deepened.intent_id))
check(
  'deepen creates priority-10 human intent + derived_from edge + anchor copy',
  deepenEmpty.status === 400 &&
    deepenRes.status === 200 &&
    deepened.task_id === Number(taskId) &&
    deepened.state === 'open' &&
    deepened.queued === false &&
    Number(newIntent?.priority) === 10 &&
    newIntent?.origin === 'human' &&
    newIntent?.kind === 'intent' &&
    JSON.parse(JSON.stringify(newIntent?.payload)).text === '拿到 union 注入后尝试写文件落地' &&
    intentAnchors.length === 1 &&
    graphAfter.edges.some((e) => e.src === findingNode1 && e.dst === String(deepened.intent_id) && e.rel === 'derived_from'),
  JSON.stringify({ deepened, anchors: intentAnchors.length, edges: graphAfter.edges.length })
)
const deepenMissing = await app.request('/api/exploration/findings/9499/deepen', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ description: 'x' })
})
check('deepen 404 for unknown finding', deepenMissing.status === 404, String(deepenMissing.status))

// ── 10/11/12. retests ───────────────────────────────────────────────────────
const retestNone = await (await app.request(`/api/exploration/findings/${findingId1}/retests`)).json()
const start1 = await app.request(`/api/exploration/findings/${findingId1}/retests`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notes: '复测请走同一条参数' })
})
const started1 = await start1.json()
const start2 = await app.request(`/api/exploration/findings/${findingId1}/retests`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notes: '再点一次' })
})
const started2 = await start2.json()
const retestsList = await (await app.request(`/api/exploration/findings/${findingId1}/retests`)).json()
const activeRetests = await (await app.request('/api/exploration/findings/retests/active')).json()
check(
  'retest start returns 202 pending, repeat reuses the active row (200)',
  retestNone.retests.length === 0 &&
    start1.status === 202 &&
    started1.created === true &&
    started1.retest.status === 'pending' &&
    started1.retest.purpose === 'retest' &&
    started1.retest.notes === '复测请走同一条参数' &&
    started1.retest.conversation_id > 0 &&
    start2.status === 200 &&
    started2.created === false &&
    started2.retest.id === started1.retest.id,
  JSON.stringify({ first: start1.status, second: start2.status, retest: started1.retest })
)
check(
  'retest list + active list expose the same row',
  retestsList.retests.length === 1 &&
    retestsList.retests[0].id === started1.retest.id &&
    activeRetests.retests.length === 1 &&
    activeRetests.retests[0].finding_id === findingId1 &&
    activeRetests.retests[0].status === 'pending',
  JSON.stringify({ list: retestsList.retests.length, active: activeRetests.retests })
)
const retestAgentOff = await (async () => {
  await meta.save({ agents: [{ id: 1, key: 'retester', name: '漏洞复测', enabled: false }] })
  const res = await app.request(`/api/exploration/findings/${findingId2}/retests`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notes: '' })
  })
  await meta.save({ agents: [{ id: 1, key: 'retester', name: '漏洞复测', enabled: true }] })
  return res
})()
check('retest refuses when the retester agent is disabled', retestAgentOff.status === 409, String(retestAgentOff.status))

// ── 13. GET /api/exploration/activity/{seq} ─────────────────────────────────
const activityRows = (await operations.writer.list('activity')).sort((a, b) => Number(a.id) - Number(b.id))
const deepenActivity = activityRows[activityRows.length - 1]
const detailRes = await app.request(`/api/exploration/activity/${deepenActivity.id}?task=${taskId}`)
const detail = await detailRes.json()
const detailUnknown = await (await app.request(`/api/exploration/activity/99999?task=${taskId}`)).json()
const detailNoTask = await app.request(`/api/exploration/activity/${deepenActivity.id}?task=999`)
check(
  'activity detail returns the stored detail blob lazily',
  detailRes.status === 200 &&
    detail.detail === '拿到 union 注入后尝试写文件落地' &&
    deepenActivity.summary === '人工提交漏洞深入利用意图' &&
    detailUnknown.detail === '' &&
    detailNoTask.status === 404,
  JSON.stringify({ detail, unknown: detailUnknown, noTask: detailNoTask.status })
)

// ── 14. GET /api/exploration/activity/stream ────────────────────────────────
async function readStream(
  url: string,
  { minLines = 1, headers = {}, timeoutMs = 4000 }: { minLines?: number; headers?: Record<string, string>; timeoutMs?: number } = {}
) {
  const res = await app.request(url, { headers })
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const deadline = Date.now() + timeoutMs
  const ids: number[] = []
  while (ids.length < minLines && Date.now() < deadline) {
    const remaining = Math.max(deadline - Date.now(), 1)
    const next = await Promise.race<Awaited<ReturnType<typeof reader.read>> | StreamTimeout>([
      reader.read(),
      new Promise<StreamTimeout>((resolve) => setTimeout(() => resolve({ timedOut: true }), remaining))
    ])
    if ('timedOut' in next || next.done) break
    buffer += decoder.decode(next.value, { stream: true })
    for (const match of buffer.matchAll(/^id: (\d+)$/gm)) {
      const id = Number(match[1])
      if (!ids.includes(id)) ids.push(id)
    }
  }
  try {
    await reader.cancel()
  } catch {
    // 流已关闭
  }
  return { status: res.status, contentType: res.headers.get('content-type'), ids, buffer }
}

const stream = await readStream(`/api/exploration/activity/stream?task=${taskId}&since=0`, { minLines: activityRows.length })
check(
  'activity stream replays backlog with monotonic ids',
  stream.status === 200 &&
    (stream.contentType ?? '').startsWith('text/event-stream') &&
    stream.ids.length === activityRows.length &&
    stream.ids.every((id, index) => index === 0 || id > stream.ids[index - 1]) &&
    stream.buffer.includes('"summary":"第一步"'),
  JSON.stringify({ ids: stream.ids, expect: activityRows.map((row) => Number(row.id)) })
)
const streamResumed = await readStream(`/api/exploration/activity/stream?task=${taskId}&since=${deepenActivity.id}`, { minLines: 1, timeoutMs: 1200 })
check('activity stream resumes from since (nothing left to send)', streamResumed.status === 200 && streamResumed.ids.length === 0, JSON.stringify(streamResumed.ids))
const streamLastEvent = await readStream(`/api/exploration/activity/stream?task=${taskId}&since=0`, { minLines: activityRows.length - 1, headers: { 'last-event-id': String(activityRows[0].id) } })
check(
  'activity stream prefers Last-Event-ID over since',
  streamLastEvent.ids.length === activityRows.length - 1 && streamLastEvent.ids[0] > Number(activityRows[0].id),
  JSON.stringify({ ids: streamLastEvent.ids })
)
const streamScoped = await readStream(`/api/exploration/activity/stream?task=${taskId}&since=0&intent=${intentA.id}`, { minLines: 2 })
check(
  'activity stream intent scope only emits that intent steps',
  streamScoped.ids.length === 2 && streamScoped.buffer.includes('"node_id":' + intentA.id),
  JSON.stringify({ ids: streamScoped.ids })
)
const streamMissing = await app.request('/api/exploration/activity/stream?task=999')
check('activity stream unknown task → 404', streamMissing.status === 404, String(streamMissing.status))

// ── 15. 注册顺序：静态路由必须先于 /findings/:id ────────────────────────────
const orderFirst = new Hono()
register(orderFirst)
orderFirst.get('/api/exploration/findings/:id', (c) => c.json({ shadowed: true }))
const orderFirstRes = await orderFirst.request('/api/exploration/findings/groups')
const orderFirstBody = await orderFirstRes.json()
const orderLast = new Hono()
orderLast.get('/api/exploration/findings/:id', (c) => c.json({ shadowed: true }))
register(orderLast)
const orderLastRes = await orderLast.request('/api/exploration/findings/groups')
const orderLastBody = await orderLastRes.json()
check(
  'static findings routes win only when registered before /findings/:id',
  orderFirstBody.shadowed === undefined &&
    Array.isArray(orderFirstBody.items) &&
    orderLastBody.shadowed === true,
  JSON.stringify({ first: orderFirstBody.shadowed ?? 'groups', last: orderLastBody.shadowed })
)

let failed = false
for (const item of results) {
  if (!item.ok) failed = true
  console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`)
}
console.log(`\n${results.filter((item) => item.ok).length}/${results.length} passed`)
process.exit(failed ? 1 : 0)
