// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from 'hono'
/** JSONB columns arrive as objects from the store and as strings from legacy rows. */
function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
import { metaStore, openStore, storeOperations, storeRoot } from '../../vexnar-store/src/index.ts'

const store = await openStore()
const meta = metaStore(storeRoot())
const operations = storeOperations(storeRoot())
await operations.writer.recover().catch(() => {})
const releaseStoreLock = await operations.writer.lock()
process.once('SIGINT', () => { void releaseStoreLock(); process.exit(0) })
process.once('SIGTERM', () => { void releaseStoreLock(); process.exit(0) })

export const api = new Hono()

api.get('/api/health', (c) => c.json({ ok: true, service: 'vexnar', version: process.env.VEXNAR_VERSION ?? 'dev' }))

// ── agents / profiles / categories / templates (vexnar-meta) ─────────────
api.get('/api/agents', async (c) => c.json({ agents: await meta.table('agents') }))

api.get('/api/agents/:key', async (c) => {
  const agents = await meta.table<any[]>('agents')
  const row = agents.find((agent) => agent.key === c.req.param('key'))
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json({ agent: row })
})

api.get('/api/llm/profiles', async (c) => {
  const rows = await meta.table<any[]>('llmProfiles')
  return c.json({
    profiles: rows.map((row) => {
      if (row.base_url != null) return row
      const { base_url, ...rest } = row
      return rest
    })
  })
})

api.get('/api/task-categories', async (c) => c.json({ categories: await meta.table('taskCategories') }))

api.get('/api/task-templates', async (c) => c.json({ templates: await meta.table('taskTemplates') }))

api.get('/api/companies', async (c) => c.json(await store.companies.list()))

// ── tools / mcp / notify / settings (vexnar-meta) ────────────────────────
api.get('/api/tools', async (c) => {
  const rows = await meta.table<any[]>('tools')
  return c.json({ tools: rows.map((row) => ({ ...row, agents: row.agents ?? [] })) })
})
api.get('/api/mcp', async (c) => c.json({ servers: await meta.table('mcp') }))
api.get('/api/notify/channels', async (c) => c.json({ channels: await meta.table('notify') }))
api.get('/api/settings', async (c) => c.json(await meta.table('settings')))

// ── tasks ─────────────────────────────────────────────────────────────────
const taskDto = (row: any, metrics?: any) => ({
  id: String(row.id),
  exploration_id: Number(row.exploration_id),
  name: row.name,
  ...(row.category_id == null ? {} : { category_id: row.category_id }),
  pinned: row.pinned_at != null,
  ...(row.pinned_at == null ? {} : { pinned_at: String(row.pinned_at) }),
  description: row.description,
  goal: row.goal,
  status: row.status,
  created_at: row.created_at_text,
  created_unix: Number(row.created_unix ?? 0),
  completed_at: row.completed_at_text ?? '',
  completed_unix: Number(row.completed_unix ?? 0),
  last_activity_unix: Number(metrics?.last_activity_unix ?? 0),
  paused: row.paused,
  queued: row.queued,
  tokens: {
    input_tokens: Number(metrics?.input_tokens ?? 0),
    output_tokens: Number(metrics?.output_tokens ?? 0),
    cache_read_tokens: Number(metrics?.cache_read_tokens ?? 0),
    cache_write_tokens: Number(metrics?.cache_write_tokens ?? 0)
  },
  goals_total: Number(metrics?.goals_total ?? 0),
  goals_met: Number(metrics?.goals_met ?? 0),
  in_flight: Number(metrics?.in_flight ?? 0),
  findings: {
    critical: Number(metrics?.findings?.critical ?? 0),
    high: Number(metrics?.findings?.high ?? 0),
    medium: Number(metrics?.findings?.medium ?? 0),
    low: Number(metrics?.findings?.low ?? 0)
  },
  ...(row.llm_profile_id == null ? {} : { llm_profile_id: row.llm_profile_id }),
  llm_profile_ids: [],
  ...(row.active_llm_profile_id == null ? {} : { active_llm_profile_id: row.active_llm_profile_id }),
  llm_failover_state: 'default',
  source_task_ids: [],
  company_ids: [],
  coverage_enabled: row.coverage_enabled
})

api.get('/api/tasks', async (c) => {
  const rows = await store.tasks.list()
  const metrics = await store.taskMetrics()
  return c.json({ tasks: rows.map((row) => taskDto(row, metrics.get(Number(row.exploration_id)))) })
})

api.get('/api/tasks/:id', async (c) => {
  const row = await store.tasks.get(c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  const metrics = await store.taskMetrics()
  return c.json(taskDto(row, metrics.get(Number(row.exploration_id))))
})

api.post('/api/tasks', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try {
    const record = await operations.createTask(body)
    store.invalidate?.(['tasks'])
    return c.json(taskDto(record), 201)
  } catch (error: any) {
    return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400)
  }
})

api.post('/api/exploration/findings', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try {
    const result = await operations.reportFinding(body)
    store.invalidate?.(['nodes', 'findings', 'edges'])
    return c.json(result, 201)
  } catch (error: any) {
    return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400)
  }
})

api.post('/api/task-categories', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try { const result = await operations.createCategory(body.name); meta.reload(); return c.json(result, 201) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.patch('/api/task-categories/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try { const result = await operations.renameCategory(c.req.param('id'), body.name); meta.reload(); return c.json(result) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.delete('/api/task-categories/:id', async (c) => {
  try { const result = await operations.deleteCategory(c.req.param('id')); meta.reload(); return c.json(result) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.post('/api/task-templates', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try { const result = await operations.createTemplate(body); meta.reload(); return c.json(result, 201) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.patch('/api/task-templates/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try { const result = await operations.updateTemplate(c.req.param('id'), body); meta.reload(); return c.json(result) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.delete('/api/task-templates/:id', async (c) => {
  try { const result = await operations.deleteTemplate(c.req.param('id')); meta.reload(); return c.json(result) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.patch('/api/tasks/:id/category', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try {
    const result = await operations.setTaskCategory(c.req.param('id'), body.category_id == null ? null : Number(body.category_id))
    store.invalidate?.(['tasks'])
    return c.json(result)
  } catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.post('/api/tasks/:id/assets', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try {
    const result = await operations.attachAssets(c.req.param('id'), body.asset_ids ?? [], String(body.source_summary ?? ''))
    store.invalidate?.(['assets'])
    return c.json(result)
  } catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.delete('/api/tasks/:id/assets/:assetID', async (c) => {
  try {
    const result = await operations.detachAsset(c.req.param('id'), c.req.param('assetID'))
    store.invalidate?.(['assets'])
    return c.json(result)
  } catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.post('/api/tasks/:id/scope', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try {
    const result = await operations.addScope(c.req.param('id'), body)
    store.invalidate?.(['assets'])
    return c.json(result)
  } catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.delete('/api/tasks/:id/scope/:sid', async (c) => {
  try { return c.json(await operations.deleteScope(c.req.param('id'), c.req.param('sid'))) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.patch('/api/tasks/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try {
    const record = await operations.updateTask(c.req.param('id'), { name: body.name, pinned: body.pinned }, body.rev)
    store.invalidate?.(['tasks'])
    return c.json(taskDto(record))
  } catch (error: any) {
    return c.json({ error: String(error?.message ?? error) }, error?.name === 'StoreConflict' ? 409 : error?.status ?? 400)
  }
})

api.delete('/api/tasks/:id', async (c) => {
  try {
    const result = await operations.deleteTask(c.req.param('id'))
    store.invalidate?.(['tasks'])
    return c.json(result)
  } catch (error: any) {
    return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400)
  }
})

api.post('/api/tasks/:id/archive', async (c) => {
  try { const result = await operations.archiveTask(c.req.param('id')); store.invalidate?.(['tasks']); return c.json(result) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.post('/api/tasks/archive/batch', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const ids = Array.isArray(body.task_ids) ? body.task_ids : []
  const items = []
  for (const id of ids) {
    try { items.push({ task_id: id, ok: true, archive: await operations.archiveTask(String(id)) }) }
    catch (error: any) { items.push({ task_id: id, ok: false, error: String(error?.message ?? error) }) }
  }
  store.invalidate?.(['tasks'])
  return c.json({ items })
})

api.get('/api/task-archives', async (c) => {
  const page = Math.max(Number(c.req.query('page') ?? 1) || 1, 1)
  const size = Math.min(Number(c.req.query('size') ?? 20) || 20, 200)
  const all = await operations.listArchives()
  return c.json({ items: all.slice((page - 1) * size, page * size), total: all.length, page, size })
})

api.get('/api/task-archives/:id', async (c) => {
  const one = (await operations.listArchives()).find((row) => String(row.id) === c.req.param('id'))
  if (!one) return c.json({ error: '归档不存在' }, 404)
  return c.json(one)
})

api.post('/api/task-archives/:id/restore', async (c) => {
  try { const result = await operations.restoreArchive(c.req.param('id')); store.invalidate?.(['tasks']); return c.json(result) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.delete('/api/task-archives/:id', async (c) => {
  try { const result = await operations.deleteArchive(c.req.param('id')); store.invalidate?.(['tasks']); return c.json(result) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.post('/api/tasks/:id/control', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try {
    const record = await operations.controlTask(c.req.param('id'), String(body.action ?? ''))
    store.invalidate?.(['tasks'])
    return c.json({ id: record.id, paused: record.paused, queued: record.queued, status: record.status })
  } catch (error: any) {
    return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400)
  }
})

api.post('/api/notify/channels', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try { const result = await operations.createChannel(body); meta.reload(); return c.json(result, 201) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.patch('/api/notify/channels/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try { const result = await operations.updateChannel(c.req.param('id'), body); meta.reload(); return c.json(result) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.delete('/api/notify/channels/:id', async (c) => {
  try { const result = await operations.deleteChannel(c.req.param('id')); meta.reload(); return c.json(result) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.patch('/api/agents/:key', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try { const result = await operations.updateAgent(c.req.param('key'), body); meta.reload(); return c.json(result) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.put('/api/tools/:key', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try { const result = await operations.updateTool(c.req.param('key'), body); meta.reload(); return c.json(result) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.post('/api/tools/custom', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try { const result = await operations.createCustomTool(body); meta.reload(); return c.json(result) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.put('/api/tools/custom/:key', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try { const result = await operations.updateCustomTool(c.req.param('key'), body); meta.reload(); return c.json(result) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.delete('/api/tools/custom/:key', async (c) => {
  try { const result = await operations.deleteCustomTool(c.req.param('key')); meta.reload(); return c.json(result) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.post('/api/mcp', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try { const result = await operations.saveMcpServer(body); meta.reload(); return c.json(result) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.put('/api/mcp/:id/enabled', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try { const result = await operations.setMcpEnabled(c.req.param('id'), Boolean(body.enabled)); meta.reload(); return c.json(result) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.delete('/api/mcp/:id', async (c) => {
  try { const result = await operations.deleteMcpServer(c.req.param('id')); meta.reload(); return c.json(result) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.patch('/api/exploration/findings/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try {
    const record = await operations.patchFinding(c.req.param('id'), { status: body.status, severity: body.severity })
    store.invalidate?.(['findings'])
    return c.json(findingDto(record))
  } catch (error: any) {
    const status = error?.name === 'StoreConflict' ? 409 : error?.status ?? 400
    return c.json({ error: String(error?.message ?? error) }, status)
  }
})

api.get('/api/tasks/:id/metrics', async (c) => {
  const task = await store.tasks.get(c.req.param('id'))
  if (!task) return c.json({ error: 'not found' }, 404)
  const metrics = (await store.taskMetrics()).get(Number(task.exploration_id))
  return c.json({
    task_id: Number(task.id),
    exploration_id: Number(task.exploration_id),
    mttd_seconds: null,
    findings_total: metrics ? Object.values(metrics.findings).reduce((a, b) => a + b, 0) : 0,
    findings_by_severity: metrics ? { critical: metrics.findings.critical, high: metrics.findings.high, medium: metrics.findings.medium, low: metrics.findings.low } : {},
    findings_by_vulnclass: {},
    findings_by_status: {},
    verify_sessions: 0,
    verify_reproduced: 0,
    verify_false_positive: 0,
    verify_inconclusive: 0,
    intents: {},
    done_intents: 0,
    no_yield_done: 0,
    yield_rate: 0,
    class_coverage: {}
  })
})

// ── assets ────────────────────────────────────────────────────────────────
const assetDto = (row: any) => ({
  id: row.id,
  type: row.type,
  ...(row.company_id == null ? {} : { company_id: row.company_id }),
  task_ids: row.task_ids ?? [],
  ...(row.domain == null ? {} : { domain: row.domain }),
  ...(row.root_domain == null ? {} : { root_domain: row.root_domain }),
  ...(row.ip == null ? {} : { ip: row.ip }),
  ...(row.port == null ? {} : { port: row.port }),
  ...(row.url == null ? {} : { url: row.url }),
  last_seen: row.last_seen
})

api.get('/api/assets', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 20) || 20, 200)
  const offset = Math.max(Number(c.req.query('offset') ?? 0) || 0, 0)
  const type = c.req.query('type') || undefined
  const { rows, total } = await store.assets.list({ type, limit, offset })
  return c.json({ assets: rows.map(assetDto), count: rows.length, total })
})

api.get('/api/assets/counts', async (c) => c.json(await store.assets.counts()))

// ── findings / nodes ──────────────────────────────────────────────────────
const findingDto = (row: any) => ({
  traffic_count: 0,
  evidence_version: 0,
  report_evidence_version: 0,
  report_stale: false,
  id: String(row.id),
  finding_id: String(row.id),
  vulnclass: row.vulnclass,
  ...(row.name ? { name: row.name } : {}),
  severity: row.severity,
  status: row.status,
  summary: row.summary,
  evidence: row.evidence,
  ...(row.task_id == null ? {} : { task_id: String(row.task_id) }),
  ts: row.created_at_text
})

api.get('/api/exploration/findings', async (c) => {
  const page = c.req.query('page')
  const limit = c.req.query('limit')
  const stats = await store.findings.stats()
  if (page == null && limit == null) {
    const rows = await store.findings.list(500)
    return c.json(rows.map(findingDto))
  }
  const size = Math.min(Number(limit ?? 20) || 20, 200)
  const current = Math.max(Number(page ?? 1) || 1, 1)
  const rows = (await store.findings.list(current * size)).slice((current - 1) * size, current * size)
  return c.json({ items: rows.map(findingDto), total: stats.total, page: current, page_size: size })
})

api.get('/api/exploration/findings/stats', async (c) => c.json(await store.findings.stats()))

api.get('/api/exploration/findings/:id', async (c) => {
  const id = c.req.param('id')
  const row = await store.findings.get(id)
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json({
    ...findingDto(row),
    ...(row.report ? { report: row.report } : {})
  })
})

api.get('/api/exploration/tokens', async (c) => {
  const taskId = c.req.query('task') ?? ''
  if (!taskId) return c.json({ workers: [], sessions: [], total: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 } })
  const result = await store.activity.tokenStats(taskId)
  return c.json({ workers: result.workers, sessions: [], total: result.total })
})

api.get('/api/exploration/activity/history', async (c) => {
  const taskId = c.req.query('task') ?? ''
  const before = Number(c.req.query('before') ?? 0) || 0
  const limit = Math.min(Number(c.req.query('limit') ?? 200) || 200, 500)
  const session = c.req.query('session') ?? ''
  if (session && session !== 'main' && session !== 'plan' && !/^main:\d+$/.test(session) && !/^intent:\d+$/.test(session)) {
    return c.json({ error: 'bad session' }, 400)
  }
  if (!taskId) return c.json({ items: [], snapshot_cursor: 0, earliest_cursor: 0, has_more: false })
  const result = await store.activity.history({ taskId, session, before, limit })
  const items = result.items.map((row: any) => ({
    seq: Number(row.id),
    ...(row.node_id == null ? {} : { node_id: Number(row.node_id) }),
    ...(row.worker ? { worker: row.worker } : {}),
    ts: String(row.created_at).replace(/\.\d+/, ''),
    ...(row.kind ? { kind: row.kind } : {}),
    ...(row.tool ? { tool: row.tool } : {}),
    ...(row.tool_use_id ? { tool_use_id: row.tool_use_id } : {}),
    is_error: Boolean(row.is_error),
    summary: row.summary ?? '',
    metadata: row.metadata ?? {},
    ...(row.input_tokens == null ? {} : { input_tokens: Number(row.input_tokens) }),
    ...(row.output_tokens == null ? {} : { output_tokens: Number(row.output_tokens) }),
    ...(row.cache_read_tokens == null ? {} : { cache_read_tokens: Number(row.cache_read_tokens) }),
    ...(row.cache_write_tokens == null ? {} : { cache_write_tokens: Number(row.cache_write_tokens) }),
    ...(row.main_seg == null ? {} : { main_seg: Number(row.main_seg) })
  }))
  return c.json({
    items,
    snapshot_cursor: result.snapshot,
    earliest_cursor: items.length ? items[0].seq : before,
    has_more: result.hasMore
  })
})

api.get('/api/exploration/intents', async (c) => {
  const taskId = c.req.query('task') ?? ''
  const limit = Math.min(Number(c.req.query('limit') ?? 300) || 300, 500)
  const before = c.req.query('before') ?? ''
  if (!taskId) return c.req.query('page') ? c.json({ items: [], has_more: false }) : c.json([])
  const result = await store.nodes.page({ taskId, page: 1, size: limit, order: 'desc', kinds: ['intent'], before: before && before !== '0' ? before : undefined })
  const items = result.items.map((row: any) => ({
    id: String(row.id),
    type: row.kind,
    payload: JSON.stringify(typeof row.payload === 'string' ? parseJson(row.payload) : row.payload ?? {}),
    priority: row.priority,
    state: row.state,
    ...(row.origin == null ? {} : { origin: row.origin }),
    ts: row.created_at
  }))
  if (c.req.query('page')) return c.json({ items, has_more: result.total > items.length })
  return c.json(items)
})

api.get('/api/exploration/nodes', async (c) => {
  const taskId = c.req.query('task') ?? ''
  const page = Math.max(Number(c.req.query('page') ?? 1) || 1, 1)
  const size = Math.min(Number(c.req.query('size') ?? 20) || 20, 200)
  if (!taskId) return c.json({ items: [], total: 0, page, size, edges: [], refs: {} })
  const kinds = (c.req.query('kind') ?? '').split(',').filter(Boolean)
  const states = (c.req.query('state') ?? '').split(',').filter(Boolean)
  const order = c.req.query('order') === 'asc' ? 'asc' : 'desc'
  const { items, total, edges } = await store.nodes.page({ taskId, page, size, order, kinds, states })
  return c.json({
    items: items.map((row: any) => ({
      id: String(row.id),
      type: row.kind,
      payload: JSON.stringify(typeof row.payload === 'string' ? parseJson(row.payload) : row.payload ?? {}),
      priority: row.priority,
      state: row.state,
      ...(row.origin == null ? {} : { origin: row.origin }),
      ts: row.created_at
    })),
    total,
    page,
    size,
    edges: edges.map((edge: any) => ({ src: String(edge.src), dst: String(edge.dst), rel: edge.rel })),
    refs: {}
  })
})
