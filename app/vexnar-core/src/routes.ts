// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from 'hono'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { blobStore, buildReport, buildReportHtml, createNotifier, createRunner, engine, gatewayComplete, listReports, meta, operations, parseJson, persistToolResult, queryDSL, runTool, saveReport, store, storeRoot, taskQueue, toolSpecs } from './context.ts'
import { register as registerExploration } from './routes/exploration.ts'
import { findingDto, goalDto, registerReadViews, taskDto } from './routes/read-views.ts'
import { registerEgress } from './egress/routes.ts'
import { registerNotificationSettings } from './routes/notification-settings.ts'
import { registerSettingsCatalog } from './routes/settings-catalog.ts'
import { registerCatalogDefaults } from './catalog/register.ts'
import { registerTaskDataManagement } from './routes/data-management.ts'

export const api = new Hono()
registerSettingsCatalog(api)
registerNotificationSettings(api)

// 代理池在 TS 内完整实现（节点/池/订阅/网关/对抗），先于任务域注册，
// 让 /api/tasks/:id/proxy 命中自己的处理器。
registerEgress(api)

// Exploration static routes (/findings/groups|export|asset-tree) must register
// before the inline /api/exploration/findings/:id below, or Hono's first-match
// order would shadow them.
registerExploration(api)
registerReadViews(api)

api.get('/api/health', (c) => c.json({ ok: true, service: 'vexnar', version: process.env.VEXNAR_VERSION ?? 'dev' }))

// 底座自述：数据面跑的是 TS 原生还是 Go 代理、store 后端、后台循环起了几个。
api.get('/api/_runtime', async (c) => {
  const { runtimeInfo } = await import('./runtime.ts')
  return c.json(runtimeInfo())
})

api.get('/api/settings', async (c) => c.json(await meta.table('settings')))

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

registerTaskDataManagement(api)

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

// ── 默认目录重新注册 ─────────────────────────────────────────────────────
// 工具与 MCP 的注册表在 TS core 里，默认清单写在 catalog/defaults.ts。这两个接口把
// 缺的补回来（删掉的 server、升级后新增的默认项），已有的行不动——重注册不是重置。
api.post('/api/tools/register', async (c) => {
  try {
    const result = await registerCatalogDefaults(meta, { only: 'tools' })
    return c.json({ ...result, tools: await meta.table('tools') })
  } catch (error: any) { return c.json({ error: String(error?.message ?? error) }, 500) }
})

api.post('/api/mcp/register', async (c) => {
  try {
    const result = await registerCatalogDefaults(meta, { only: 'mcp' })
    return c.json({ ...result, servers: await meta.table('mcp') })
  } catch (error: any) { return c.json({ error: String(error?.message ?? error) }, 500) }
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
    // BodyInit 只接受 ArrayBuffer-backed 视图；Buffer 的底层可能是 SharedArrayBuffer。
    const body = new Uint8Array(buffer)
    return new Response(body, { headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="evidence-${binding.id}-${side}.bin"`,
      'content-length': String(body.length),
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

// 工具目录：内置侦察工具的名字与说明由 runner 自己提供（tools.ts 的 templates），
// 客户端不再硬编码一份 —— 加工具只需要改 runner，面板自动跟上。
api.get('/api/engine/tools', async (c) => c.json({ tools: toolSpecs() }))

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

// ── 领域路由模块（各 agent 并行迁移，统一在此挂载）─────────────────
//
// 说明符必须写成字面量：esbuild 只能打包静态可分析的 `import('./routes/x.ts')`。
// 写成 `import(file)` 时打包器把模块当外部依赖，产物 core-embedded.js 会去
// `lib/routes/*.ts` 找源码——那里没有，于是 dsh 宿主里整片领域路由加载失败。
type RouteModule = { register?: (api: Hono) => void }
const routeModules: Array<{ load: () => Promise<RouteModule>; scope: string }> = [
  { load: () => import('./routes/conversations.ts'), scope: 'conversations/chat' },
  { load: () => import('./routes/desktop.ts'), scope: 'desktop gateway' },
  { load: () => import('./routes/visibility.ts'), scope: 'visibility/commands' },
  { load: () => import('./routes/llm.ts'), scope: 'llm pool/records' },
  { load: () => import('./routes/intercept.ts'), scope: 'intercept approvals' },
  { load: () => import('./routes/traffic.ts'), scope: 'traffic evidence' },
  { load: () => import('./routes/session-traffic.ts'), scope: 'session traffic' },
  { load: () => import('./routes/skills.ts'), scope: 'skills' },
  { load: () => import('./routes/market.ts'), scope: 'market' },
  { load: () => import('./routes/tasks-companies.ts'), scope: 'tasks/companies' },
  { load: () => import('./routes/notify-mcp.ts'), scope: 'notify/mcp/side-questions' },
  { load: () => import('./routes/agents.ts'), scope: 'agents' },
  { load: () => import('./routes/workspace.ts'), scope: 'workspace' },
  { load: () => import('./routes/sync.ts'), scope: 'scopesentry sync' },
  { load: () => import('./routes/update.ts'), scope: 'update/self-update' },
  { load: () => import('./routes/auth.ts'), scope: 'auth/logs/system' },
  { load: () => import('./routes/gaps.ts'), scope: 'misc gap fill' },
]
for (const { load, scope } of routeModules) {
  try {
    const mod = await load()
    mod.register?.(api)
  } catch (error) {
    console.error(`[vexnar] failed to load route module ${scope}:`, error)
  }
}

/**
 * 未实现的接口给一句人话，而不是 Hono 默认的纯文本 404。
 *
 * 客户端现在由 TypeScript 自己回答领域接口（Go 默认不在环），漏掉的路由必须能一眼
 * 看出"是没迁过来"还是"参数不对"，所以带上路径、方法和迁移开关提示。
 */
api.notFound((c) => c.json({
  error: '该接口尚未在 TypeScript 侧实现',
  path: c.req.path,
  method: c.req.method,
  hint: '需要旧 Go 后端对照时：VEXNAR_GO=on 启动它，并设 VEXNAR_GO_DATA=on 打开转发'
}, 501))
