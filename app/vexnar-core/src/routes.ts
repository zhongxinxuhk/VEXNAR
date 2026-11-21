// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from 'hono'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { blobStore, buildReport, buildReportHtml, createNotifier, engine, gatewayComplete, listReports, meta, operations, parseJson, persistToolResult, queryDSL, runTool, saveReport, store, storeRoot, taskQueue } from './context.ts'

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
    void createNotifier(await meta.table('notify'), undefined, async (channel, event, result) => {
      await operations.recordDelivery({
        channel_id: channel.id, event_kind: event.kind, title: event.title,
        status: result.ok ? 'ok' : 'failed', attempts: result.attempts, error: result.detail
      })
    }).dispatch({
      kind: 'finding_created', title: String(body.vulnclass ?? 'finding'),
      text: String(body.summary ?? ''), task_id: String(body.task_id ?? ''), finding_id: String(result.finding_id)
    }).catch(() => {})
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
    if (body.action === 'pause') taskQueue.pause(c.req.param('id'))
    if (body.action === 'resume') taskQueue.resume(c.req.param('id'))
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

api.get('/api/agents/:key/triggers', async (c) => c.json({ triggers: await store.triggers.list(c.req.param('key')) }))

api.post('/api/agents/:key/triggers', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try { return c.json(await operations.createTrigger(c.req.param('key'), body)) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.patch('/api/agents/:key/triggers/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try { return c.json(await operations.updateTrigger(c.req.param('key'), c.req.param('id'), body)) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.delete('/api/agents/:key/triggers/:id', async (c) => {
  try { return c.json(await operations.deleteTrigger(c.req.param('key'), c.req.param('id'))) }
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
const ASSET_OPTIONAL = ['domain', 'root_domain', 'ip', 'c_segment', 'port', 'icp', 'bound_domains', 'open_ports',
  'record_type', 'record_value', 'bundle_id', 'app_name', 'category', 'app_description', 'app_icp', 'url',
  'service_type', 'service_name', 'favicon_mmh3', 'status_code', 'content_length', 'page_title', 'technologies',
  'auth', 'method', 'params', 'extra']
const ASSET_SOURCE = ['task_source', 'task_source_summary', 'task_source_node_id']

const assetDto = (row: any) => {
  const dto: Record<string, unknown> = { id: row.id, type: row.type }
  if (row.company_id != null) dto.company_id = row.company_id
  dto.task_ids = row.task_ids ?? []
  for (const field of ASSET_OPTIONAL) {
    const value = row[field]
    if (value == null || value === '') continue
    if (Array.isArray(value) && value.length === 0) continue
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) continue
    dto[field] = value
  }
  dto.last_seen = row.last_seen
  for (const field of ASSET_SOURCE) {
    if (row[field] != null && row[field] !== '') dto[field] = row[field]
  }
  return dto
}

api.get('/api/assets', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 20) || 20, 200)
  const offset = Math.max(Number(c.req.query('offset') ?? 0) || 0, 0)
  const type = c.req.query('type') || undefined
  const taskId = c.req.query('task_id') || undefined
  const dsl = c.req.query('dsl') ?? ''
  if (dsl.trim()) {
    try {
      const all = (await store.assets.list({ type, taskId, limit: 100000, offset: 0 })).rows
      const matched = queryDSL(all, dsl)
      const rows = matched.slice(offset, offset + limit)
      return c.json({ assets: rows.map(assetDto), count: rows.length, total: matched.length })
    } catch (error: any) {
      return c.json({ error: String(error?.message ?? error) }, 400)
    }
  }
  const { rows, total } = await store.assets.list({ type, taskId, limit, offset })
  return c.json({ assets: rows.map(assetDto), count: rows.length, total })
})

api.post('/api/assets/import', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const assets = Array.isArray(body.assets) ? body.assets : []
  if (!assets.length) return c.json({ error: 'assets 不能为空' }, 400)
  try {
    const result = await operations.importAssets(assets)
    store.invalidate?.(['assets'])
    return c.json(result)
  } catch (error: any) { return c.json({ error: String(error?.message ?? error) }, 400) }
})

api.get('/api/assets/counts', async (c) => c.json(await store.assets.counts(c.req.query('task_id') || undefined)))

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
  if (page == null && limit == null) {
    const rows = await store.findings.list(500)
    return c.json(rows.map(findingDto))
  }
  const size = Math.min(Number(limit ?? 20) || 20, 200)
  const current = Math.max(Number(page ?? 1) || 1, 1)
  const severity = (c.req.query('severity') ?? '').trim().toLowerCase()
  const status = (c.req.query('status') ?? '').trim().toLowerCase()
  const vulnclass = (c.req.query('vulnclass') ?? '').trim()
  const taskId = (c.req.query('task_id') ?? '').trim()
  const query = (c.req.query('q') ?? '').trim().toLowerCase()
  let rows = await store.findings.list(100000)
  if (severity) rows = rows.filter((row: any) => String(row.severity).toLowerCase() === severity)
  if (status) rows = rows.filter((row: any) => String(row.status).toLowerCase() === status)
  if (vulnclass) rows = rows.filter((row: any) => String(row.vulnclass) === vulnclass)
  if (taskId) rows = rows.filter((row: any) => String(row.task_id ?? '') === taskId)
  if (query) {
    rows = rows.filter((row: any) => [row.name, row.summary, row.evidence, row.vulnclass].some((value) => String(value ?? '').toLowerCase().includes(query)))
  }
  const total = rows.length
  const pageRows = rows.slice((current - 1) * size, current * size)
  return c.json({ items: pageRows.map(findingDto), total, page: current, page_size: size })
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

const goalDto = (row: any) => {
  const payload = typeof row.payload === 'string' ? parseJson(row.payload) : row.payload ?? {}
  return {
    id: String(row.id),
    text: String((payload as any).text ?? ''),
    ...((payload as any).vulnclass ? { vulnclass: (payload as any).vulnclass } : {}),
    state: row.state,
    ...(row.origin == null ? {} : { origin: row.origin }),
    ts: String(row.created_at).replace(/\.\d+/, '')
  }
}

api.post('/api/tasks/:id/goals', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try {
    const row = await operations.addGoal(c.req.param('id'), body)
    store.invalidate?.(['nodes', 'edges'])
    return c.json(goalDto(row))
  } catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.patch('/api/tasks/:id/goals/:gid', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try {
    const row = await operations.editGoal(c.req.param('id'), c.req.param('gid'), body)
    store.invalidate?.(['nodes'])
    return c.json(goalDto(row))
  } catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.delete('/api/tasks/:id/goals/:gid', async (c) => {
  try {
    const result = await operations.deleteGoal(c.req.param('id'), c.req.param('gid'))
    store.invalidate?.(['nodes', 'edges'])
    return c.json(result)
  } catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

const constraintDto = (row: any) => ({
  id: String(row.id), kind: row.kind, text: row.text,
  ...(row.origin ? { origin: row.origin } : {}),
  ...(row.created_at ? { ts: row.created_at } : {})
})

api.get('/api/tasks/:id/constraints', async (c) => {
  const task = await store.tasks.get(c.req.param('id'))
  if (!task) return c.json({ error: 'task not found' }, 404)
  return c.json({ constraints: (await store.constraints.list(c.req.param('id'))).map(constraintDto) })
})

api.post('/api/tasks/:id/constraints', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try { const row = await operations.addConstraint(c.req.param('id'), body); return c.json(constraintDto(row)) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.patch('/api/tasks/:id/constraints/:cid', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try { const row = await operations.editConstraint(c.req.param('id'), c.req.param('cid'), body); return c.json(constraintDto(row)) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.delete('/api/tasks/:id/constraints/:cid', async (c) => {
  try { return c.json(await operations.deleteConstraint(c.req.param('id'), c.req.param('cid'))) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.post('/api/tasks/:id/intents/:iid/messages', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try {
    const result = await operations.sendIntentMessage(c.req.param('id'), c.req.param('iid'), body)
    store.invalidate?.(['nodes', 'activity'])
    return c.json(result)
  } catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.post('/api/tasks/:id/intents/:iid/rerun', async (c) => {
  try {
    const result = await operations.rerunIntent(c.req.param('id'), c.req.param('iid'))
    store.invalidate?.(['nodes'])
    return c.json(result)
  } catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.post('/api/tasks/:id/intents/rerun-blocked', async (c) => {
  try {
    const result = await operations.rerunBlocked(c.req.param('id'))
    store.invalidate?.(['nodes'])
    return c.json(result)
  } catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.post('/api/tasks/:id/intents/:iid/control', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try {
    const result = await operations.controlIntent(c.req.param('id'), c.req.param('iid'), body)
    store.invalidate?.(['nodes', 'edges'])
    return c.json(result)
  } catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.get('/api/exploration/findings/:id/traffic/:bindingId/body', async (c) => {
  const traffic = await store.traffic(c.req.param('id'))
  if (!traffic) return c.json({ error: 'finding not found' }, 404)
  const binding = traffic.bindings.find((row: any) => String(row.id) === c.req.param('bindingId'))
  if (!binding?.snapshot) return c.json({ error: '绑定不存在' }, 404)
  const side = c.req.query('side') || 'response'
  if (side !== 'request' && side !== 'response') return c.json({ error: 'side 只能是 request 或 response' }, 400)
  const hash = side === 'request' ? binding.snapshot.req_hash : binding.snapshot.resp_hash
  if (!hash) return c.json({ error: '该侧没有正文' }, 404)
  const blobs = blobStore(storeRoot())
  let buffer: Buffer
  try { buffer = await blobs.read(hash) } catch { return c.json({ error: '正文不存在' }, 404) }
  if (c.req.query('download') === '1') {
    return new Response(buffer, { headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="evidence-${binding.id}-${side}.bin"`,
      'content-length': String(buffer.length),
      'x-content-type-options': 'nosniff'
    } })
  }
  const total = buffer.length
  const offset = Math.max(Number(c.req.query('offset') ?? 0) || 0, 0)
  let length = Number(c.req.query('length') ?? 8192) || 8192
  if (length <= 0 || length > 8192) length = 8192
  if (offset > total) return c.json({ error: 'offset 超出正文长度' }, 400)
  let raw = buffer.subarray(offset, offset + length)
  if (offset + raw.length < total && raw.length >= 4) {
    let start = raw.length - 1
    while (start > 0 && (raw[start] & 0xc0) === 0x80) start--
    try { new TextDecoder('utf-8', { fatal: true }).decode(raw.subarray(start)) } catch { raw = raw.subarray(0, start) }
  }
  const binary = raw.includes(0) || (offset === 0 && !isValidUtf8(raw))
  const next = offset + raw.length
  return c.json({ offset, total, next_offset: next, truncated: next < total, binary,
    content: binary ? `[二进制正文，${total} 字节；请下载查看]` : raw.toString('utf8') })
})

function isValidUtf8(raw: Uint8Array) {
  try { new TextDecoder('utf-8', { fatal: true }).decode(raw); return true } catch { return false }
}

api.get('/api/exploration/findings/:id/traffic', async (c) => {
  const out = await store.traffic(c.req.param('id'))
  if (!out) return c.json({ error: 'finding not found' }, 404)
  const snapshotDto = (snap: any) => {
    if (!snap) return snap
    return {
      id: snap.id,
      source_traffic_id: snap.source_traffic_id ?? '',
      captured_at: Number(snap.captured_at ?? 0),
      url: snap.url ?? '',
      method: snap.method ?? '',
      status: Number(snap.status ?? 0),
      content_type: snap.content_type ?? '',
      req_hash: snap.req_hash ?? '',
      resp_hash: snap.resp_hash ?? '',
      req_len: Number(snap.req_len ?? 0),
      resp_len: Number(snap.resp_len ?? 0),
      created_at: String(snap.created_at ?? '')
    }
  }
  const bindings = out.bindings.map((binding: any) => ({ ...binding, snapshot: snapshotDto(binding.snapshot) }))
  return c.json({ ...out, bindings })
})

api.post('/api/engine/tools/run', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const name = String(body.name ?? '')
  const target = String(body.target ?? '')
  if (!target) return c.json({ error: 'target 不能为空' }, 400)
  try {
    const result = await runTool(createRunner({ concurrency: 1 }) as any, name as any, target, body.args ?? {})
    const created = body.task_id ? await persistToolResult(operations as any, String(body.task_id), String(body.node_id ?? ''), name as any, result.parsed, result.stdout) : []
    store.invalidate?.(['assets', 'findings', 'nodes'])
    return c.json({ code: result.code, truncated: result.truncated, timed_out: result.timed_out, stdout: result.stdout.slice(0, 20000), stderr: result.stderr.slice(0, 4000), parsed: result.parsed, created })
  } catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 500) }
})

api.post('/api/engine/plan', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  if (!body.task_id) return c.json({ error: 'task_id 不能为空' }, 400)
  try { const taskId = String(body.task_id); return c.json({ intents: await taskQueue.enqueue(taskId, () => engine.plan(taskId, gatewayComplete)) }) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 500) }
})

api.post('/api/engine/work', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  if (!body.task_id) return c.json({ error: 'task_id 不能为空' }, 400)
  try { const taskId = String(body.task_id); return c.json({ result: await taskQueue.enqueue(taskId, () => engine.work(taskId, gatewayComplete, String(body.worker ?? 'work#1'), 4, { isCancelled: () => taskQueue.isCancelled(taskId) })) }) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 500) }
})


api.get('/api/engine/queue', (c) => c.json({ active: taskQueue.active, paused: taskQueue.pausedTasks, entries: taskQueue.status() }))

api.post('/api/engine/queue/:taskId', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const taskId = c.req.param('taskId')
  if (body.action === 'pause') taskQueue.pause(taskId)
  else if (body.action === 'resume') taskQueue.resume(taskId)
  else if (body.action === 'cancel') return c.json(taskQueue.cancel(taskId))
  else return c.json({ error: 'action 需为 pause/resume/cancel' }, 400)
  return c.json({ ok: true, paused: taskQueue.pausedTasks })
})

api.get('/api/schedules', async (c) => c.json({ schedules: await store.schedules.list() }))

api.post('/api/schedules', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try { return c.json(await operations.createSchedule(body), 201) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.patch('/api/schedules/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  try { return c.json(await operations.updateSchedule(c.req.param('id'), body)) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.delete('/api/schedules/:id', async (c) => {
  try { return c.json(await operations.deleteSchedule(c.req.param('id'))) }
  catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
})

api.get('/api/tasks/:id/coverage', async (c) => {
  const task = await store.tasks.get(c.req.param('id'))
  if (!task) return c.json({ error: 'task not found' }, 404)
  if (task.coverage_enabled === false) {
    return c.json({ enabled: false, scope_rows: 0, denominator: 0, tested: 0, pct: null, by_type: [] })
  }
  return c.json({ enabled: true, ...(await store.coverage(c.req.param('id'))) })
})

api.get('/api/tasks/:id/report', async (c) => {
  const task = await store.tasks.get(c.req.param('id'))
  if (!task) return c.json({ error: 'task not found' }, 404)
  const findings = (await store.findings.list(100000)).filter((row: any) => String(row.task_id ?? '') === String(task.id))
  const assets = (await store.assets.list({ taskId: String(task.id), limit: 1000, offset: 0 })).rows
  const overview = await operations.graphOverview(String(task.id))
  return c.json(buildReport({ task, findings, assets, overview }))
})

async function renderTaskReport(taskId: string) {
  const task = await store.tasks.get(taskId)
  if (!task) return null
  const findings = (await store.findings.list(100000)).filter((row: any) => String(row.task_id ?? '') === String(task.id))
  const assets = (await store.assets.list({ taskId: String(task.id), limit: 1000, offset: 0 })).rows
  const overview = await operations.graphOverview(String(task.id))
  return buildReport({ task, findings, assets, overview })
}

api.get('/api/tasks/:id/report/html', async (c) => {
  const task = await store.tasks.get(c.req.param('id'))
  if (!task) return c.json({ error: 'task not found' }, 404)
  const findings = (await store.findings.list(100000)).filter((row: any) => String(row.task_id ?? '') === String(task.id))
  const assets = (await store.assets.list({ taskId: String(task.id), limit: 1000, offset: 0 })).rows
  return new Response(buildReportHtml({ task, findings, assets }), { headers: { 'content-type': 'text/html; charset=utf-8' } })
})

api.post('/api/tasks/:id/report/export', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  if (body.format === 'html') {
    const task = await store.tasks.get(c.req.param('id'))
    if (!task) return c.json({ error: 'task not found' }, 404)
    const findings = (await store.findings.list(100000)).filter((row: any) => String(row.task_id ?? '') === String(task.id))
    const assets = (await store.assets.list({ taskId: String(task.id), limit: 1000, offset: 0 })).rows
    const html = buildReportHtml({ task, findings, assets })
    return c.json(await saveReport(storeRoot(), String(task.id), html, { findings: findings.length, assets: assets.length }, 'html'), 201)
  }
  const report = await renderTaskReport(c.req.param('id'))
  if (!report) return c.json({ error: 'task not found' }, 404)
  return c.json(await saveReport(storeRoot(), String(c.req.param('id')), report.markdown, report.stats), 201)
})

api.get('/api/tasks/:id/reports', async (c) => c.json({ reports: await listReports(storeRoot(), String(c.req.param('id'))) }))

api.get('/api/tasks/:id/reports/:reportId', async (c) => {
  const id = c.req.param('reportId')
  if (!/^[A-Za-z0-9-]+$/.test(id)) return c.json({ error: 'bad report id' }, 400)
  try {
    const content = await readFile(join(storeRoot(), 'reports', `${id}.md`), 'utf8')
    return new Response(content, { headers: { 'content-type': 'text/markdown; charset=utf-8' } })
  } catch {
    return c.json({ error: '报告不存在' }, 404)
  }
})

api.get('/api/tasks/:id/goals', async (c) => {
  const taskId = c.req.param('id')
  const task = await store.tasks.get(taskId)
  if (!task) return c.json({ error: 'task not found' }, 404)
  const { items } = await store.nodes.page({ taskId, page: 1, size: 200, order: 'desc', kinds: ['goal'] })
  const goals = items.map(goalDto)
  return c.json({ goals })
})

api.get('/api/tokens/daily', async (c) => {
  const days = Math.max(Number(c.req.query('days') ?? 30) || 30, 1)
  return c.json(await store.activity.dailyTokens(days))
})

api.get('/api/exploration/tokens', async (c) => {
  const taskId = c.req.query('task') ?? ''
  if (!taskId) return c.json({ workers: [], sessions: [], total: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 } })
  const result = await store.activity.tokenStats(taskId)
  return c.json({ workers: result.workers, sessions: result.sessions, total: result.total })
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

// ── 领域路由模块（各 agent 并行迁移，统一在此挂载）─────────────────
const routeModules: Array<{ file: string; scope: string }> = [
  { file: './routes/conversations.ts', scope: 'conversations/chat' },
  { file: './routes/desktop.ts', scope: 'desktop gateway' },
  { file: './routes/llm.ts', scope: 'llm pool/records' },
  { file: './routes/intercept.ts', scope: 'intercept approvals' }
]
for (const { file, scope } of routeModules) {
  try {
    const mod = await import(file)
    mod.register?.(api)
  } catch (error) {
    console.error(`[vexnar] failed to load route module ${scope} (${file}):`, error)
  }
}
