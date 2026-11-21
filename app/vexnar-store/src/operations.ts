// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { openWriter, openMeta } from './backend.js'

const STATUSES = new Set(['pending', 'in_progress', 'confirmed', 'resolved', 'fixed', 'false_positive', 'ignored', 'duplicate', 'risk_accepted'])
const SEVERITIES = new Set(['critical', 'high', 'medium', 'low'])

function rfc3339(date: Date) {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = (value: number) => String(Math.floor(Math.abs(value))).padStart(2, '0')
  return `${date.toISOString().slice(0, 23)}${sign}${pad(offset / 60)}:${pad(offset % 60)}`
    .replace('Z', '')
}

export function storeOperations(_root?: string) {
  const writer = openWriter(_root)
  const meta = openMeta(_root)

  async function metaTable(name: string) {
    meta.reload()
    const tables = await meta.load()
    const rows = (tables[name] ?? []) as any[]
    tables[name] = rows
    return { tables, rows }
  }

  async function createTask(input: { description?: string; goal?: string; name?: string }) {
    const description = String(input.description ?? '').trim()
    const goal = String(input.goal ?? '').trim()
    if (!description) throw Object.assign(new Error('description 不能为空'), { status: 400 })
    if (!goal) throw Object.assign(new Error('goal 不能为空'), { status: 400 })

    const id = (await writer.maxKey('tasks')) + 1
    let explorationId = 1
    for (const task of await writer.list('tasks')) {
      explorationId = Math.max(explorationId, Number(task.exploration_id ?? 0) + 1)
    }

    const now = new Date()
    const record = {
      id: String(id),
      exploration_id: explorationId,
      name: String(input.name ?? ''),
      description,
      goal,
      status: 'created',
      paused: false,
      queued: false,
      coverage_enabled: true,
      created_at_text: rfc3339(now),
      created_unix: Math.floor(now.getTime() / 1000),
      completed_at_text: null,
      completed_unix: 0
    }
    const [written] = await writer.commit([{ table: 'tasks', key: String(id), record }])
    return written
  }

  async function patchFinding(id: string, patch: { status?: string; severity?: string }) {
    const current = await writer.readRecord('findings', id)
    if (!current) throw Object.assign(new Error('finding 不存在'), { status: 404 })
    const next: Record<string, unknown> = { ...current }
    if (patch.status !== undefined) {
      if (!STATUSES.has(patch.status)) throw Object.assign(new Error(`非法状态: ${patch.status}`), { status: 400 })
      next.status = patch.status
    }
    if (patch.severity !== undefined) {
      if (!SEVERITIES.has(patch.severity)) throw Object.assign(new Error(`非法严重度: ${patch.severity}`), { status: 400 })
      next.severity = patch.severity
    }
    delete next.rev
    const [written] = await writer.commit([{ table: 'findings', key: id, record: next, expectedRev: Number(current.rev ?? 0) }])
    return written
  }

  async function reportFinding(input: {
    task_id: string | number
    intent_id?: string | number
    vulnclass?: string
    name?: string
    severity?: string
    summary?: string
    evidence?: string
    worker?: string
    asset_ids?: number[]
  }) {
    const task = await writer.readRecord('tasks', String(input.task_id))
    if (!task) throw Object.assign(new Error('task 不存在'), { status: 404 })
    const vulnclass = String(input.vulnclass ?? '').trim()
    const severity = String(input.severity ?? '').trim()
    const summary = String(input.summary ?? '').trim()
    const evidence = String(input.evidence ?? '').trim()
    if (!vulnclass) throw Object.assign(new Error('vulnclass 不能为空'), { status: 400 })
    if (!SEVERITIES.has(severity)) throw Object.assign(new Error(`非法严重度: ${severity}`), { status: 400 })
    if (!summary) throw Object.assign(new Error('summary 不能为空'), { status: 400 })
    if (!evidence) throw Object.assign(new Error('evidence 不能为空'), { status: 400 })

    const explorationId = Number(task.exploration_id)
    let intentKey: string | null = null
    if (input.intent_id !== undefined && String(input.intent_id) !== '') {
      const intent = await writer.readRecord('nodes', String(input.intent_id))
      if (!intent || Number(intent.exploration_id) !== explorationId || intent.kind !== 'intent') {
        throw Object.assign(new Error('intent_id 必须是本任务的意图'), { status: 400 })
      }
      intentKey = String(input.intent_id)
    }

    const nodeId = (await writer.maxKey('nodes')) + 1
    const findingId = (await writer.maxKey('findings')) + 1
    const now = new Date()
    const worker = String(input.worker ?? '')
    const node = {
      id: String(nodeId),
      exploration_id: explorationId,
      kind: 'finding',
      state: 'confirmed',
      priority: 9,
      origin: worker,
      payload: {
        vulnclass,
        name: String(input.name ?? ''),
        severity,
        summary,
        evidence: { by: worker, poc: evidence }
      },
      created_at: rfc3339(now)
    }
    const finding = {
      id: String(findingId),
      task_id: String(task.id),
      node_id: String(nodeId),
      vulnclass,
      name: String(input.name ?? ''),
      severity,
      status: 'pending',
      summary,
      evidence,
      worker,
      asset_ids: input.asset_ids ?? [],
      created_at_text: rfc3339(now)
    }

    const ops: Array<{ table: string; key: string; record: Record<string, unknown> }> = [
      { table: 'nodes', key: String(nodeId), record: node }
    ]
    if (intentKey) {
      ops.push({ table: 'edges', key: `${intentKey}-yields-${nodeId}`, record: { exploration_id: explorationId, src: intentKey, dst: String(nodeId), rel: 'yields' } })
    }
    ops.push({ table: 'findings', key: String(findingId), record: finding })
    const written = await writer.commit(ops)
    return {
      finding_id: String(findingId),
      finding_node_id: String(nodeId),
      traffic: null,
      record: written[written.length - 1]
    }
  }

  async function updateTask(id: string, patch: { name?: string; pinned?: boolean }, expectedRev?: number) {
    const current = await writer.readRecord('tasks', id)
    if (!current || current.deleted_at_text) throw Object.assign(new Error('task 不存在'), { status: 404 })
    const next: Record<string, unknown> = { ...current }
    if (patch.name !== undefined) next.name = String(patch.name)
    if (patch.pinned !== undefined) next.pinned_at = patch.pinned ? rfc3339(new Date()) : null
    delete next.rev
    const [written] = await writer.commit([{ table: 'tasks', key: id, record: next, expectedRev: expectedRev ?? Number(current.rev ?? 0) }])
    return written
  }

  async function controlTask(id: string, action: string) {
    if (action !== 'pause' && action !== 'resume') throw Object.assign(new Error(`非法动作: ${action}`), { status: 400 })
    const current = await writer.readRecord('tasks', id)
    if (!current || current.deleted_at_text) throw Object.assign(new Error('task 不存在'), { status: 404 })
    const next = { ...current, paused: action === 'pause', queued: false }
    delete next.rev
    const [written] = await writer.commit([{ table: 'tasks', key: id, record: next, expectedRev: Number(current.rev ?? 0) }])
    return written
  }

  /** Soft delete: the task leaves the list, findings and graph stay intact. */
  async function deleteTask(id: string) {
    const current = await writer.readRecord('tasks', id)
    if (!current || current.deleted_at_text) throw Object.assign(new Error('task 不存在'), { status: 404 })
    const now = new Date()
    const next = { ...current, status: 'deleted', deleted_at_text: rfc3339(now), deleted_unix: Math.floor(now.getTime() / 1000) }
    delete next.rev
    await writer.commit([{ table: 'tasks', key: id, record: next, expectedRev: Number(current.rev ?? 0) }])
    return { deleted: true, id: Number(id) }
  }

  async function createCategory(name: string) {
    const text = String(name ?? '').trim()
    if (!text) throw Object.assign(new Error('分类名不能为空'), { status: 400 })
    const { tables, rows } = await metaTable('taskCategories')
    if (rows.some((row) => row.name === text)) throw Object.assign(new Error('分类已存在'), { status: 409 })
    const now = rfc3339(new Date())
    const row = { id: Math.max(0, ...rows.map((item) => Number(item.id))) + 1, name: text, task_count: 0, created_at: now, updated_at: now }
    rows.push(row)
    await meta.save(tables)
    return row
  }

  async function renameCategory(id: string, name: string) {
    const text = String(name ?? '').trim()
    if (!text) throw Object.assign(new Error('分类名不能为空'), { status: 400 })
    const { tables, rows } = await metaTable('taskCategories')
    const row = rows.find((item) => String(item.id) === String(id))
    if (!row) throw Object.assign(new Error('分类不存在'), { status: 404 })
    row.name = text
    row.updated_at = rfc3339(new Date())
    await meta.save(tables)
    return row
  }

  async function deleteCategory(id: string) {
    const { tables, rows } = await metaTable('taskCategories')
    const index = rows.findIndex((item) => String(item.id) === String(id))
    if (index < 0) throw Object.assign(new Error('分类不存在'), { status: 404 })
    rows.splice(index, 1)
    await meta.save(tables)
    // Detach tasks that referenced the category.
    for (const task of await writer.list('tasks')) {
      if (String(task.category_id ?? '') !== String(id)) continue
      const next = { ...task, category_id: null }
      delete next.rev
      await writer.commit([{ table: 'tasks', key: String(task.id), record: next, expectedRev: Number(task.rev ?? 0) }])
    }
    return { deleted: Number(id) }
  }

  async function setTaskCategory(id: string, categoryId: number | null) {
    const current = await writer.readRecord('tasks', id)
    if (!current || current.deleted_at_text) throw Object.assign(new Error('task 不存在'), { status: 404 })
    if (categoryId !== null) {
      const { rows } = await metaTable('taskCategories')
      if (!rows.some((row) => Number(row.id) === Number(categoryId))) throw Object.assign(new Error('分类不存在'), { status: 404 })
    }
    const next = { ...current, category_id: categoryId }
    delete next.rev
    const [written] = await writer.commit([{ table: 'tasks', key: id, record: next, expectedRev: Number(current.rev ?? 0) }])
    return { task: written, category: categoryId === null ? null : (await metaTable('taskCategories')).rows.find((row) => Number(row.id) === Number(categoryId)) }
  }

  async function createTemplate(input: any) {
    const name = String(input.name ?? '').trim()
    const goal = String(input.goal ?? '').trim()
    if (!name) throw Object.assign(new Error('模板名不能为空'), { status: 400 })
    if (!goal) throw Object.assign(new Error('goal 不能为空'), { status: 400 })
    const { tables, rows } = await metaTable('taskTemplates')
    const now = rfc3339(new Date())
    const row = {
      id: Math.max(0, ...rows.map((item) => Number(item.id))) + 1,
      name, description: String(input.description ?? ''), goal,
      category_id: input.category_id ?? null,
      intercept_rules: input.intercept_rules ?? [],
      created_at: now, updated_at: now
    }
    rows.push(row)
    await meta.save(tables)
    return row
  }

  async function updateTemplate(id: string, input: any) {
    const { tables, rows } = await metaTable('taskTemplates')
    const row = rows.find((item) => String(item.id) === String(id))
    if (!row) throw Object.assign(new Error('模板不存在'), { status: 404 })
    for (const key of ['name', 'description', 'goal', 'category_id', 'intercept_rules']) {
      if (input[key] !== undefined) row[key] = input[key]
    }
    row.updated_at = rfc3339(new Date())
    await meta.save(tables)
    return row
  }

  async function deleteTemplate(id: string) {
    const { tables, rows } = await metaTable('taskTemplates')
    const index = rows.findIndex((item) => String(item.id) === String(id))
    if (index < 0) throw Object.assign(new Error('模板不存在'), { status: 404 })
    rows.splice(index, 1)
    await meta.save(tables)
    return { deleted: Number(id) }
  }

  async function attachAssets(taskId: string, assetIds: Array<string | number>, sourceSummary = '') {
    const task = await writer.readRecord('tasks', taskId)
    if (!task || task.deleted_at_text) throw Object.assign(new Error('task 不存在'), { status: 404 })
    const requested = assetIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
    let attached = 0
    let existing = 0
    const ops: Array<{ table: string; key: string; record: Record<string, unknown>; expectedRev?: number }> = []
    for (const assetId of requested) {
      const asset = await writer.readRecord('assets', String(assetId))
      if (!asset) throw Object.assign(new Error(`asset ${assetId} 不存在`), { status: 404 })
      const ids = Array.isArray(asset.task_ids) ? asset.task_ids.map(Number) : []
      if (ids.includes(Number(task.id))) {
        existing += 1
      } else {
        const next = { ...asset, task_ids: [...ids, Number(task.id)] }
        delete next.rev
        ops.push({ table: 'assets', key: String(assetId), record: next, expectedRev: Number(asset.rev ?? 0) })
        attached += 1
      }
      const link = await writer.readRecord('task_asset_links', `${task.id}-${assetId}`)
      if (!link) {
        ops.push({
          table: 'task_asset_links',
          key: `${task.id}-${assetId}`,
          record: { task_id: String(task.id), asset_id: Number(assetId), source: 'manual', source_summary: sourceSummary, created_at_text: rfc3339(new Date()) }
        })
      }
    }
    if (ops.length) await writer.commit(ops)
    return { requested: requested.length, attached, existing }
  }

  async function detachAsset(taskId: string, assetId: string) {
    const asset = await writer.readRecord('assets', assetId)
    if (!asset) throw Object.assign(new Error('asset 不存在'), { status: 404 })
    const ids: number[] = Array.isArray(asset.task_ids) ? asset.task_ids.map(Number) : []
    if (!ids.includes(Number(taskId))) throw Object.assign(new Error('asset 未关联该任务'), { status: 404 })
    const next = { ...asset, task_ids: ids.filter((id) => id !== Number(taskId)) }
    delete next.rev
    await writer.commit([{ table: 'assets', key: assetId, record: next, expectedRev: Number(asset.rev ?? 0) }])
    await writer.remove('task_asset_links', `${taskId}-${assetId}`)
    return { detached: Number(assetId) }
  }

  async function addScope(taskId: string, input: { kind?: string; value?: string; reason?: string }) {
    const task = await writer.readRecord('tasks', taskId)
    if (!task || task.deleted_at_text) throw Object.assign(new Error('task 不存在'), { status: 404 })
    const kind = String(input.kind ?? '').trim()
    const value = String(input.value ?? '').trim()
    if (!kind || !value) throw Object.assign(new Error('kind 和 value 不能为空'), { status: 400 })
    let scopesAdded = 0
    let scopesExisting = 0
    let assetsLinked = 0
    let assetsExisting = 0
    const existing = await writer.list('task_scope')
    const duplicate = existing.some((row) => String(row.task_id) === String(task.id) && row.kind === kind && row.value === value)
    const scopeId = Math.max(0, ...existing.map((row) => Number(row.id))) + 1
    const ops: Array<{ table: string; key: string; record: Record<string, unknown> }> = []
    if (duplicate) {
      scopesExisting += 1
    } else {
      ops.push({
        table: 'task_scope',
        key: String(scopeId),
        record: { id: scopeId, task_id: String(task.id), kind, value, reason: String(input.reason ?? ''), source: 'manual', created_at_text: rfc3339(new Date()) }
      })
      scopesAdded += 1
    }
    if (kind === 'domain' || kind === 'ip') {
      const assets = await writer.list('assets')
      const found = assets.find((asset) => (kind === 'domain' ? asset.domain === value : asset.ip === value))
      if (found) {
        assetsExisting += 1
      } else {
        const assetId = Math.max(0, ...assets.map((asset) => Number(asset.id))) + 1
        ops.push({
          table: 'assets',
          key: String(assetId),
          record: { id: assetId, type: kind, [kind]: value, task_ids: [Number(task.id)], last_seen: rfc3339(new Date()), company_id: null }
        })
        assetsLinked += 1
      }
    }
    if (ops.length) await writer.commit(ops)
    return { requested: 1, assets_linked: assetsLinked, assets_existing: assetsExisting, scopes_added: scopesAdded, scopes_existing: scopesExisting }
  }

  async function deleteScope(taskId: string, scopeId: string) {
    const rows = await writer.list('task_scope')
    const row = rows.find((item) => String(item.id) === String(scopeId) && String(item.task_id) === String(taskId))
    if (!row) throw Object.assign(new Error('scope 不存在'), { status: 404 })
    await writer.remove('task_scope', `${scopeId}`)
    return { deleted: Number(scopeId) }
  }

  async function createChannel(input: any) {
    const name = String(input.name ?? '').trim()
    const kind = String(input.kind ?? '').trim()
    if (!name) throw Object.assign(new Error('渠道名不能为空'), { status: 400 })
    if (!kind) throw Object.assign(new Error('kind 不能为空'), { status: 400 })
    const { tables, rows } = await metaTable('notify')
    const id = Math.max(0, ...rows.map((row) => Number(row.id))) + 1
    const row = {
      id, name, kind,
      enabled: input.enabled ?? true,
      config: input.config ?? {},
      mode: String(input.mode ?? ''),
      filter: input.filter ?? {},
      rate_per_min: Number(input.rate_per_min ?? 0)
    }
    rows.push(row)
    await meta.save(tables)
    return { id }
  }

  async function updateChannel(id: string, input: any) {
    const { tables, rows } = await metaTable('notify')
    const row = rows.find((item) => String(item.id) === String(id))
    if (!row) throw Object.assign(new Error('渠道不存在'), { status: 404 })
    for (const key of ['name', 'kind', 'enabled', 'config', 'mode', 'filter', 'rate_per_min']) {
      if (input[key] !== undefined) row[key] = input[key]
    }
    await meta.save(tables)
    return { id: Number(id) }
  }

  async function deleteChannel(id: string) {
    const { tables, rows } = await metaTable('notify')
    const index = rows.findIndex((item) => String(item.id) === String(id))
    if (index < 0) throw Object.assign(new Error('渠道不存在'), { status: 404 })
    rows.splice(index, 1)
    await meta.save(tables)
    return { ok: true }
  }

  async function updateAgent(key: string, input: { name?: string; description?: string }) {
    const { tables, rows } = await metaTable('agents')
    const row = rows.find((item) => item.key === key)
    if (!row) throw Object.assign(new Error('agent 不存在'), { status: 404 })
    if (input.name !== undefined) row.name = String(input.name)
    if (input.description !== undefined) row.description = String(input.description)
    await meta.save(tables)
    return { ok: true }
  }

  async function updateTool(key: string, input: any) {
    const { tables, rows } = await metaTable('tools')
    const row = rows.find((item) => item.key === key)
    if (!row) throw Object.assign(new Error('tool 不存在'), { status: 404 })
    for (const field of ['description', 'schema', 'agents', 'enabled']) {
      if (input[field] !== undefined) row[field] = input[field]
    }
    await meta.save(tables)
    return { ok: true }
  }

  const TOOL_KINDS = new Set(['command', 'script', 'http', 'shell'])

  async function createCustomTool(input: any) {
    const key = String(input.key ?? '').trim()
    if (!/^[a-z][a-z0-9_]*$/.test(key)) throw Object.assign(new Error('key 需小写字母开头，仅含小写字母/数字/下划线'), { status: 400 })
    if (!TOOL_KINDS.has(String(input.kind))) throw Object.assign(new Error('kind 需为 command / script / http / shell'), { status: 400 })
    if (input.kind === 'http' && !Object.keys(input.schema?.properties ?? {}).length) {
      throw Object.assign(new Error('http 工具必须提供参数 JSON Schema'), { status: 400 })
    }
    const { tables, rows } = await metaTable('tools')
    if (rows.some((row) => row.key === key)) throw Object.assign(new Error('该 key 已存在'), { status: 409 })
    rows.push({
      key, system: false, description: String(input.description ?? ''),
      schema: input.schema ?? { type: 'object', properties: {} },
      agents: input.agents ?? [], enabled: input.enabled ?? true,
      kind: input.kind, exec: input.exec ?? {}, deferred: input.deferred ?? false, calls: 0
    })
    await meta.save(tables)
    return { key }
  }

  async function updateCustomTool(key: string, input: any) {
    const { tables, rows } = await metaTable('tools')
    const row = rows.find((item) => item.key === key)
    if (!row) throw Object.assign(new Error('tool 不存在'), { status: 404 })
    if (row.system) throw Object.assign(new Error('内置工具不能按自定义工具修改'), { status: 400 })
    for (const field of ['description', 'schema', 'agents', 'enabled', 'kind', 'exec', 'deferred']) {
      if (input[field] !== undefined) row[field] = input[field]
    }
    await meta.save(tables)
    return { ok: true }
  }

  async function deleteCustomTool(key: string) {
    const { tables, rows } = await metaTable('tools')
    const index = rows.findIndex((item) => item.key === key)
    if (index < 0) throw Object.assign(new Error('tool 不存在'), { status: 404 })
    if (rows[index].system) throw Object.assign(new Error('内置工具不能删除'), { status: 400 })
    rows.splice(index, 1)
    await meta.save(tables)
    return { deleted: key }
  }

  async function saveMcpServer(input: any) {
    const name = String(input.name ?? '').trim()
    if (!name) throw Object.assign(new Error('name 不能为空'), { status: 400 })
    const { tables, rows } = await metaTable('mcp')
    if (input.id) {
      const row = rows.find((item) => Number(item.id) === Number(input.id))
      if (!row) throw Object.assign(new Error('MCP server 不存在'), { status: 404 })
      for (const field of ['name', 'transport', 'command', 'args', 'env', 'url', 'enabled', 'insecure']) {
        if (input[field] !== undefined) row[field] = input[field]
      }
      await meta.save(tables)
      return { id: Number(row.id) }
    }
    const id = Math.max(0, ...rows.map((row) => Number(row.id))) + 1
    rows.push({
      id, name,
      transport: String(input.transport ?? 'stdio'),
      ...(input.command == null ? {} : { command: input.command }),
      args: input.args ?? [], env: input.env ?? {},
      ...(input.url == null ? {} : { url: input.url }),
      enabled: input.enabled ?? true, insecure: input.insecure ?? false, tools: []
    })
    await meta.save(tables)
    return { id }
  }

  async function setMcpEnabled(id: string, enabled: boolean) {
    const { tables, rows } = await metaTable('mcp')
    const row = rows.find((item) => Number(item.id) === Number(id))
    if (!row) throw Object.assign(new Error('MCP server 不存在'), { status: 404 })
    row.enabled = enabled
    await meta.save(tables)
    return { ok: true }
  }

  async function deleteMcpServer(id: string) {
    const { tables, rows } = await metaTable('mcp')
    const index = rows.findIndex((item) => Number(item.id) === Number(id))
    if (index < 0) throw Object.assign(new Error('MCP server 不存在'), { status: 404 })
    rows.splice(index, 1)
    await meta.save(tables)
    return { deleted: Number(id) }
  }

  async function archiveTask(id: string) {
    const task = await writer.readRecord('tasks', id)
    if (!task || task.deleted_at_text) throw Object.assign(new Error('task 不存在'), { status: 404 })
    if (task.archived_at_text) throw Object.assign(new Error('task 已归档'), { status: 409 })
    const now = new Date()
    const existing = await writer.list('archives')
    const archiveId = Math.max(0, ...existing.map((row) => Number(row.id))) + 1
    const archive = {
      id: archiveId,
      task_id: Number(task.id),
      state: 'done', phase: 'done', progress: 100,
      warnings: [], format_version: 1,
      task_name: task.name, task_description: task.description, task_goal: task.goal,
      original_status: task.status,
      category_id: task.category_id ?? null,
      source_task_ids: [], remaining_timeout_seconds: 0,
      data_counts: {}, aggregate_stats: {},
      archived_at: rfc3339(now), requested_at: rfc3339(now),
      created_at: rfc3339(now), updated_at: rfc3339(now)
    }
    const nextTask = { ...task, archived_at_text: archive.archived_at }
    delete nextTask.rev
    await writer.commit([
      { table: 'archives', key: String(archiveId), record: archive },
      { table: 'tasks', key: id, record: nextTask, expectedRev: Number(task.rev ?? 0) }
    ])
    return archive
  }

  async function listArchives() {
    const rows = await writer.list('archives')
    return rows.sort((a, b) => Number(b.id) - Number(a.id))
  }

  async function restoreArchive(archiveId: string) {
    const archive = await writer.readRecord('archives', archiveId)
    if (!archive) throw Object.assign(new Error('归档不存在'), { status: 404 })
    const task = await writer.readRecord('tasks', String(archive.task_id))
    if (task) {
      const next = { ...task, archived_at_text: null }
      delete next.rev
      await writer.commit([{ table: 'tasks', key: String(task.id), record: next, expectedRev: Number(task.rev ?? 0) }])
    }
    await writer.remove('archives', `${archiveId}`)
    return archive
  }

  async function deleteArchive(archiveId: string) {
    const archive = await writer.readRecord('archives', archiveId)
    if (!archive) throw Object.assign(new Error('归档不存在'), { status: 404 })
    const task = await writer.readRecord('tasks', String(archive.task_id))
    if (task) {
      const now = new Date()
      const next = { ...task, status: 'deleted', deleted_at_text: rfc3339(now), deleted_unix: Math.floor(now.getTime() / 1000) }
      delete next.rev
      await writer.commit([{ table: 'tasks', key: String(task.id), record: next, expectedRev: Number(task.rev ?? 0) }])
    }
    await writer.remove('archives', `${archiveId}`)
    return archive
  }

  async function addGoal(taskId: string, input: { text?: string; vulnclass?: string }) {
    const task = await writer.readRecord('tasks', taskId)
    if (!task || task.deleted_at_text) throw Object.assign(new Error('task 不存在'), { status: 404 })
    const text = String(input.text ?? '').trim()
    if (!text) throw Object.assign(new Error('目标内容不能为空'), { status: 400 })
    const explorationId = Number(task.exploration_id)
    const nodes = await writer.list('nodes')
    const nodeId = Math.max(0, ...nodes.map((node) => Number(node.id))) + 1
    const payload: Record<string, unknown> = { text }
    if (String(input.vulnclass ?? '').trim()) payload.vulnclass = String(input.vulnclass).trim()
    const record = {
      id: String(nodeId), exploration_id: explorationId, kind: 'goal', state: 'open',
      priority: 0, origin: 'human', payload, created_at: rfc3339(new Date())
    }
    const ops: Array<{ table: string; key: string; record: Record<string, unknown> }> = [{ table: 'nodes', key: String(nodeId), record }]
    const rootNode = nodes.filter((node) => Number(node.exploration_id) === explorationId && node.kind === 'fact' && node.state === 'origin').sort((a, b) => Number(a.id) - Number(b.id))[0]
    if (rootNode) ops.push({ table: 'edges', key: `${rootNode.id}-spawns-${nodeId}`, record: { exploration_id: explorationId, src: String(rootNode.id), dst: String(nodeId), rel: 'spawns' } })
    await writer.commit(ops)
    return record
  }

  async function editGoal(taskId: string, goalId: string, input: { text?: string; vulnclass?: string }) {
    const text = String(input.text ?? '').trim()
    if (!text) throw Object.assign(new Error('目标内容不能为空'), { status: 400 })
    const node = await writer.readRecord('nodes', goalId)
    if (!node || node.kind !== 'goal') throw Object.assign(new Error('目标不存在'), { status: 404 })
    const payload = { ...(typeof node.payload === 'string' ? JSON.parse(node.payload) : node.payload), text }
    if (String(input.vulnclass ?? '').trim()) payload.vulnclass = String(input.vulnclass).trim()
    const next = { ...node, payload }
    delete next.rev
    const [written] = await writer.commit([{ table: 'nodes', key: goalId, record: next, expectedRev: Number(node.rev ?? 0) }])
    return written
  }

  async function deleteGoal(taskId: string, goalId: string) {
    const node = await writer.readRecord('nodes', goalId)
    if (!node || node.kind !== 'goal') throw Object.assign(new Error('目标不存在'), { status: 404 })
    await writer.remove('nodes', `${goalId}`)
    for (const edge of await writer.list('edges')) {
      if (String(edge.src) === String(goalId) || String(edge.dst) === String(goalId)) {
        await writer.remove('edges', `${edge.src}-${edge.rel}-${edge.dst}`)
      }
    }
    return { deleted: Number(goalId) }
  }

  async function controlIntent(taskId: string, intentId: string, input: { action?: string; reason?: string; mode?: string }) {
    const node = await writer.readRecord('nodes', intentId)
    if (!node || node.kind !== 'intent') throw Object.assign(new Error('intent not found'), { status: 404 })
    if (String(node.exploration_id) !== String((await writer.readRecord('tasks', taskId))?.exploration_id)) {
      throw Object.assign(new Error('intent not found'), { status: 404 })
    }
    const action = String(input.action ?? '')
    if (!['pause', 'resume', 'cancel'].includes(action)) throw Object.assign(new Error('action must be pause|resume|cancel'), { status: 400 })
    if (action === 'pause') {
      if (node.state !== 'running') throw Object.assign(new Error('仅运行中的意图可以暂停'), { status: 409 })
      const next = { ...node, state: 'paused' }
      delete next.rev
      await writer.commit([{ table: 'nodes', key: intentId, record: next, expectedRev: Number(node.rev ?? 0) }])
      return { id: Number(intentId), state: 'paused' }
    }
    if (action === 'resume') {
      if (node.state !== 'paused') throw Object.assign(new Error('仅已暂停的意图可以恢复'), { status: 409 })
      const next = { ...node, state: 'open' }
      delete next.rev
      await writer.commit([{ table: 'nodes', key: intentId, record: next, expectedRev: Number(node.rev ?? 0) }])
      return { id: Number(intentId), state: 'open' }
    }
    const reason = String(input.reason ?? '').trim()
    if (!reason) throw Object.assign(new Error('请填写删除原因'), { status: 409 })
    if (!['running', 'paused', 'open'].includes(node.state)) throw Object.assign(new Error('仅待领/运行中/已暂停的意图可以删除'), { status: 409 })
    const mode = input.mode === 'hard' ? 'hard' : 'soft'
    if (mode === 'soft') {
      const payload = { ...(typeof node.payload === 'string' ? JSON.parse(node.payload) : node.payload), delete_reason: reason }
      const next = { ...node, state: 'deleted', payload }
      delete next.rev
      await writer.commit([{ table: 'nodes', key: intentId, record: next, expectedRev: Number(node.rev ?? 0) }])
      return { id: Number(intentId), state: 'deleted' }
    }
    await writer.remove('nodes', `${intentId}`)
    for (const edge of await writer.list('edges')) {
      if (String(edge.src) === String(intentId) || String(edge.dst) === String(intentId)) {
        await writer.remove('edges', `${edge.src}-${edge.rel}-${edge.dst}`)
      }
    }
    return { id: Number(intentId), state: '', deleted: { intents: 1, facts: 0, findings: 0, activities: 0 } }
  }

  async function rerunIntent(taskId: string, intentId: string) {
    const node = await writer.readRecord('nodes', intentId)
    if (!node || node.kind !== 'intent') throw Object.assign(new Error('intent not found'), { status: 404 })
    if (!['blocked', 'exhausted', 'stopped'].includes(node.state)) {
      throw Object.assign(new Error('仅 blocked/exhausted/stopped 的意图可以重跑'), { status: 409 })
    }
    const next = { ...node, state: 'open' }
    delete next.rev
    await writer.commit([{ table: 'nodes', key: intentId, record: next, expectedRev: Number(node.rev ?? 0) }])
    return { id: String(taskId), reopened: Number(intentId) }
  }

  async function rerunBlocked(taskId: string) {
    const task = await writer.readRecord('tasks', taskId)
    if (!task) throw Object.assign(new Error('task 不存在'), { status: 404 })
    const rows = await writer.list('nodes')
    const blocked = rows.filter((row) => Number(row.exploration_id) === Number(task.exploration_id) && row.kind === 'intent' && row.state === 'blocked')
    for (const row of blocked) {
      const next = { ...row, state: 'open' }
      delete next.rev
      await writer.commit([{ table: 'nodes', key: String(row.id), record: next, expectedRev: Number(row.rev ?? 0) }])
    }
    return { id: String(taskId), reopened: blocked.length }
  }

  async function sendIntentMessage(taskId: string, intentId: string, input: { message?: string; request_id?: string }) {
    const task = await writer.readRecord('tasks', taskId)
    if (!task || task.deleted_at_text) throw Object.assign(new Error('task not found'), { status: 404 })
    const message = String(input.message ?? '').trim()
    const requestId = String(input.request_id ?? '').trim()
    if (!message) throw Object.assign(new Error('消息不能为空'), { status: 400 })
    if ([...message].length > 4000) throw Object.assign(new Error('消息不能超过 4000 个字符'), { status: 400 })
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(requestId)) throw Object.assign(new Error('request_id 必须是 1-128 位字母、数字、-、_、. 或 :'), { status: 400 })
    if (task.paused) throw Object.assign(new Error('任务已暂停，请先恢复任务再向 Worker 发送消息'), { status: 409 })
    if (task.queued) throw Object.assign(new Error('排队中的任务无法向 Worker 发送消息'), { status: 409 })
    if (['done', 'failed', 'stopped', 'deleted'].includes(String(task.status))) throw Object.assign(new Error('终态任务无法向 Worker 发送消息'), { status: 409 })
    const node = await writer.readRecord('nodes', intentId)
    if (!node || node.kind !== 'intent') throw Object.assign(new Error('intent not found'), { status: 404 })
    if (node.state !== 'paused') throw Object.assign(new Error('仅已暂停的 Worker 可以发送消息，请先暂停'), { status: 409 })
    const next = { ...node, state: 'running' }
    delete next.rev
    const activity = await writer.list('activity')
    const activityId = Math.max(0, ...activity.map((row) => Number(row.id))) + 1
    const now = new Date()
    await writer.commit([
      { table: 'nodes', key: intentId, record: next, expectedRev: Number(node.rev ?? 0) },
      {
        table: 'activity', key: String(activityId), record: {
          id: String(activityId), exploration_id: Number(task.exploration_id), node_id: Number(intentId),
          worker: 'user', kind: 'message', is_error: false, summary: message, metadata: {},
          created_at: rfc3339(now), created_unix: Math.floor(now.getTime() / 1000)
        }
      }
    ])
    return { id: Number(intentId), state: 'running', accepted: true, request_id: requestId }
  }

  async function addConstraint(taskId: string, input: { kind?: string; text?: string }) {
    const task = await writer.readRecord('tasks', taskId)
    if (!task || task.deleted_at_text) throw Object.assign(new Error('task 不存在'), { status: 404 })
    const kind = String(input.kind ?? '')
    if (kind !== 'allow' && kind !== 'deny') throw Object.assign(new Error('kind 需为 allow 或 deny'), { status: 400 })
    const text = String(input.text ?? '').trim()
    if (!text) throw Object.assign(new Error('约束内容不能为空'), { status: 400 })
    const rows = await writer.list('constraints')
    const id = Math.max(0, ...rows.map((row) => Number(row.id))) + 1
    const record = { id, exploration_id: Number(task.exploration_id), kind, text, origin: 'human', created_at: rfc3339(new Date()) }
    await writer.commit([{ table: 'constraints', key: String(id), record }])
    return record
  }

  async function editConstraint(taskId: string, constraintId: string, input: { kind?: string; text?: string }) {
    const node = await writer.readRecord('constraints', constraintId)
    if (!node) throw Object.assign(new Error('约束不存在'), { status: 404 })
    const next = { ...node }
    if (input.kind !== undefined) {
      if (input.kind !== 'allow' && input.kind !== 'deny') throw Object.assign(new Error('kind 需为 allow 或 deny'), { status: 400 })
      next.kind = input.kind
    }
    if (input.text !== undefined) {
      const text = String(input.text).trim()
      if (!text) throw Object.assign(new Error('约束内容不能为空'), { status: 400 })
      next.text = text
    }
    delete next.rev
    const [written] = await writer.commit([{ table: 'constraints', key: constraintId, record: next, expectedRev: Number(node.rev ?? 0) }])
    return written
  }

  async function deleteConstraint(taskId: string, constraintId: string) {
    const node = await writer.readRecord('constraints', constraintId)
    if (!node) throw Object.assign(new Error('约束不存在'), { status: 404 })
    await writer.remove('constraints', `${constraintId}`)
    return { deleted: Number(constraintId) }
  }

  async function addNode(taskId: string, input: { kind?: string; payload?: any; state?: string; origin?: string; priority?: number; parent_id?: string; rel?: string }) {
    const task = await writer.readRecord('tasks', taskId)
    if (!task || task.deleted_at_text) throw Object.assign(new Error('task 不存在'), { status: 404 })
    const kind = String(input.kind ?? '')
    if (!['fact', 'intent', 'goal', 'finding'].includes(kind)) throw Object.assign(new Error('kind 需为 fact/intent/goal/finding'), { status: 400 })
    const rows = await writer.list('nodes')
    const id = Math.max(0, ...rows.map((row) => Number(row.id))) + 1
    const record = {
      id: String(id), exploration_id: Number(task.exploration_id), kind,
      state: String(input.state ?? (kind === 'intent' ? 'open' : 'confirmed')),
      priority: Number(input.priority ?? (kind === 'finding' ? 9 : 0)),
      origin: String(input.origin ?? 'agent'), payload: input.payload ?? {},
      created_at: rfc3339(new Date())
    }
    const ops: Array<{ table: string; key: string; record: Record<string, unknown> }> = [{ table: 'nodes', key: String(id), record }]
    if (input.parent_id) {
      const parent = String(input.parent_id)
      const rel = String(input.rel ?? (kind === 'intent' ? 'spawns' : 'yields'))
      ops.push({ table: 'edges', key: `${parent}-${rel}-${id}`, record: { exploration_id: Number(task.exploration_id), src: parent, dst: String(id), rel } })
    }
    await writer.commit(ops)
    return record
  }

  const TRANSITIONS: Record<string, string[]> = {
    open: ['running', 'paused', 'blocked', 'stopped', 'deleted', 'cancelled'],
    running: ['open', 'done', 'blocked', 'paused', 'stopped', 'deleted', 'cancelled'],
    paused: ['open', 'running', 'cancelled', 'deleted'],
    blocked: ['open', 'deleted', 'cancelled'],
    exhausted: ['open', 'deleted'],
    stopped: ['open', 'deleted'],
    done: [],
    deleted: []
  }

  async function updateNodePayload(taskId: string, nodeId: string, patch: Record<string, unknown>) {
    const task = await writer.readRecord('tasks', taskId)
    const node = await writer.readRecord('nodes', nodeId)
    if (!task || !node || String(node.exploration_id) !== String(task.exploration_id)) throw Object.assign(new Error('node 不存在'), { status: 404 })
    const payload = { ...(typeof node.payload === 'string' ? JSON.parse(node.payload) : node.payload), ...patch }
    const next = { ...node, payload }
    delete next.rev
    const [written] = await writer.commit([{ table: 'nodes', key: nodeId, record: next, expectedRev: Number(node.rev ?? 0) }])
    return written
  }

  async function setNodeState(taskId: string, nodeId: string, state: string) {
    const task = await writer.readRecord('tasks', taskId)
    const node = await writer.readRecord('nodes', nodeId)
    if (!task || !node || String(node.exploration_id) !== String(task.exploration_id)) throw Object.assign(new Error('node 不存在'), { status: 404 })
    const allowed = TRANSITIONS[String(node.state)] ?? []
    if (!allowed.includes(state) && state !== node.state) {
      throw Object.assign(new Error(`非法状态迁移: ${node.state} → ${state}`), { status: 409 })
    }
    const next = { ...node, state }
    delete next.rev
    const [written] = await writer.commit([{ table: 'nodes', key: nodeId, record: next, expectedRev: Number(node.rev ?? 0) }])
    return written
  }

  async function claimIntent(taskId: string, worker: string, leaseSeconds = 600) {
    const task = await writer.readRecord('tasks', taskId)
    if (!task) throw Object.assign(new Error('task 不存在'), { status: 404 })
    await reclaimExpired(taskId)
    const rows = await writer.list('nodes')
    const next = rows.filter((row) => Number(row.exploration_id) === Number(task.exploration_id) && row.kind === 'intent' && row.state === 'open')
      .sort((a, b) => Number(b.priority) - Number(a.priority) || Number(a.id) - Number(b.id))[0]
    if (!next) return null
    const leaseUntil = Math.floor(Date.now() / 1000) + Math.max(Number(leaseSeconds) || 600, 1)
    const record = { ...next, state: 'running', payload: { ...(typeof next.payload === 'string' ? JSON.parse(next.payload) : next.payload), worker, lease_until: leaseUntil } }
    delete record.rev
    const [written] = await writer.commit([{ table: 'nodes', key: String(next.id), record, expectedRev: Number(next.rev ?? 0) }])
    return written
  }

  async function reclaimExpired(taskId: string) {
    const task = await writer.readRecord('tasks', taskId)
    if (!task) throw Object.assign(new Error('task 不存在'), { status: 404 })
    const now = Math.floor(Date.now() / 1000)
    const rows = await writer.list('nodes')
    const expired = rows.filter((row) => {
      if (Number(row.exploration_id) !== Number(task.exploration_id) || row.kind !== 'intent' || row.state !== 'running') return false
      const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
      return Number(payload?.lease_until ?? 0) > 0 && Number(payload.lease_until) < now
    })
    for (const row of expired) {
      const next = { ...row, state: 'open', payload: { ...(typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload), worker: '', lease_until: 0 } }
      delete next.rev
      await writer.commit([{ table: 'nodes', key: String(row.id), record: next, expectedRev: Number(row.rev ?? 0) }])
    }
    return expired.map((row) => Number(row.id))
  }

  async function appendActivity(taskId: string, input: { kind?: string; node_id?: string; worker?: string; tool?: string; summary?: string; is_error?: boolean; metadata?: any }) {
    const task = await writer.readRecord('tasks', taskId)
    if (!task) throw Object.assign(new Error('task 不存在'), { status: 404 })
    const rows = await writer.list('activity')
    const id = Math.max(0, ...rows.map((row) => Number(row.id))) + 1
    const now = new Date()
    const record = {
      id: String(id), exploration_id: Number(task.exploration_id),
      node_id: input.node_id == null ? null : Number(input.node_id),
      worker: String(input.worker ?? ''), kind: String(input.kind ?? 'event'),
      is_error: Boolean(input.is_error), summary: String(input.summary ?? ''),
      metadata: input.metadata ?? {}, created_at: rfc3339(now), created_unix: Math.floor(now.getTime() / 1000)
    }
    await writer.commit([{ table: 'activity', key: String(id), record }])
    return record
  }

  async function graphOverview(taskId: string) {
    const task = await writer.readRecord('tasks', taskId)
    if (!task) throw Object.assign(new Error('task 不存在'), { status: 404 })
    const nodes = await writer.list('nodes')
    const scoped = nodes.filter((node) => Number(node.exploration_id) === Number(task.exploration_id))
    const byKind: Record<string, number> = {}
    const byState: Record<string, number> = {}
    for (const node of scoped) {
      byKind[node.kind] = (byKind[node.kind] ?? 0) + 1
      byState[node.state] = (byState[node.state] ?? 0) + 1
    }
    const edges = (await writer.list('edges')).filter((edge) => Number(edge.exploration_id) === Number(task.exploration_id)).length
    const anchors = (await (async () => {
      const rows = await writer.list('anchors')
      return rows
    })()).filter((anchor) => scoped.some((node) => String(node.id) === String(anchor.node_id)))
    const openIntents = scoped.filter((node) => node.kind === 'intent' && node.state === 'open').map((node) => ({ id: String(node.id), text: (typeof node.payload === 'string' ? JSON.parse(node.payload) : node.payload)?.text ?? '' }))
    return { by_kind: byKind, by_state: byState, edges, anchors: anchors.length, open_intents: openIntents.slice(0, 20) }
  }

  async function importAssets(inputs: any[]) {
    const rows = await writer.list('assets')
    let nextId = Math.max(0, ...rows.map((row) => Number(row.id))) + 1
    let created = 0
    let existing = 0
    for (const input of inputs) {
      const type = String(input.type ?? '').trim()
      if (!type) continue
      const same = rows.find((row) => row.type === type && (
        (input.url && row.url === input.url) ||
        (input.domain && row.domain === input.domain) ||
        (input.ip && row.ip === input.ip)
      ))
      if (same) { existing += 1; continue }
      const record = {
        id: nextId++, type, task_ids: [],
        ...(input.domain ? { domain: String(input.domain) } : {}),
        ...(input.root_domain ? { root_domain: String(input.root_domain) } : {}),
        ...(input.ip ? { ip: String(input.ip) } : {}),
        ...(input.port == null ? {} : { port: Number(input.port) }),
        ...(input.url ? { url: String(input.url) } : {}),
        last_seen: rfc3339(new Date())
      }
      await writer.commit([{ table: 'assets', key: String(record.id), record }])
      rows.push(record)
      created += 1
    }
    return { requested: inputs.length, created, existing }
  }

  async function addAsset(taskId: string, input: any) {
    const task = await writer.readRecord('tasks', taskId)
    if (!task || task.deleted_at_text) throw Object.assign(new Error('task 不存在'), { status: 404 })
    const type = String(input.type ?? '').trim()
    if (!type) throw Object.assign(new Error('type 不能为空'), { status: 400 })
    const rows = await writer.list('assets')
    const sameAsset = (row: any) => {
      if (row.type !== type) return false
      if (input.url) return row.url === input.url
      if (input.domain) return row.domain === input.domain && (input.port == null || Number(row.port) === Number(input.port))
      if (input.ip) return row.ip === input.ip && (type !== 'service' || Number(row.port) === Number(input.port))
      return false
    }
    const existing = rows.find(sameAsset)
    if (existing) {
      if (!Array.isArray(existing.task_ids) || !existing.task_ids.map(Number).includes(Number(task.id))) {
        const next = { ...existing, task_ids: [...(existing.task_ids ?? []).map(Number), Number(task.id)] }
        delete next.rev
        await writer.commit([{ table: 'assets', key: String(existing.id), record: next, expectedRev: Number(existing.rev ?? 0) }])
        return next
      }
      return existing
    }
    const id = Math.max(0, ...rows.map((row) => Number(row.id))) + 1
    const record = {
      id, type, task_ids: [Number(task.id)],
      ...(input.domain ? { domain: String(input.domain) } : {}),
      ...(input.root_domain ? { root_domain: String(input.root_domain) } : {}),
      ...(input.ip ? { ip: String(input.ip) } : {}),
      ...(input.port == null ? {} : { port: Number(input.port) }),
      ...(input.url ? { url: String(input.url) } : {}),
      ...(input.page_title ? { page_title: String(input.page_title) } : {}),
      ...(input.method ? { method: String(input.method) } : {}),
      ...(input.technologies ? { technologies: input.technologies } : {}),
      ...(input.service_name ? { service_name: String(input.service_name) } : {}),
      ...(input.status_code == null ? {} : { status_code: Number(input.status_code) }),
      ...(input.extra ? { extra: input.extra } : {}),
      last_seen: rfc3339(new Date())
    }
    await writer.commit([{ table: 'assets', key: String(id), record }])
    return record
  }

  async function linkAssets(taskId: string, nodeId: string, assetIds: Array<string | number>) {
    const task = await writer.readRecord('tasks', taskId)
    const node = await writer.readRecord('nodes', nodeId)
    if (!task || !node || String(node.exploration_id) !== String(task.exploration_id)) throw Object.assign(new Error('node 不存在'), { status: 404 })
    const ids = assetIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
    const ops = []
    for (const assetId of ids) {
      if (!(await writer.readRecord('assets', String(assetId)))) throw Object.assign(new Error(`asset ${assetId} 不存在`), { status: 404 })
      if (!(await writer.readRecord('anchors', `${nodeId}-${assetId}`))) {
        ops.push({ table: 'anchors', key: `${nodeId}-${assetId}`, record: { node_id: Number(nodeId), asset_id: assetId } })
      }
    }
    if (ops.length) await writer.commit(ops)
    return { node_id: Number(nodeId), linked: ops.length }
  }

  async function anchorAsset(taskId: string, nodeId: string, assetId: string) {
    const task = await writer.readRecord('tasks', taskId)
    const node = await writer.readRecord('nodes', nodeId)
    if (!task || !node || String(node.exploration_id) !== String(task.exploration_id)) throw Object.assign(new Error('node 不存在'), { status: 404 })
    if (!(await writer.readRecord('assets', assetId))) throw Object.assign(new Error('asset 不存在'), { status: 404 })
    await writer.commit([{ table: 'anchors', key: `${nodeId}-${assetId}`, record: { node_id: Number(nodeId), asset_id: Number(assetId) } }])
    return { node_id: Number(nodeId), asset_id: Number(assetId) }
  }

  async function createTrigger(agentKey: string, input: any) {
    const rows = await writer.list('agent_triggers')
    const interval = Number(input.interval_sec ?? 0)
    const flags = ['on_finding', 'on_goal_met', 'on_task_timeout', 'on_tool_call', 'on_task_create'].filter((key) => input[key])
    if (interval <= 0 && !flags.length) throw Object.assign(new Error('至少配置一个触发条件'), { status: 400 })
    const id = Math.max(0, ...rows.map((row) => Number(row.id))) + 1
    const record = {
      id, agent_key: agentKey, enabled: input.enabled ?? true, interval_sec: interval,
      on_finding: Boolean(input.on_finding), on_goal_met: Boolean(input.on_goal_met),
      on_task_timeout: Boolean(input.on_task_timeout), on_tool_call: Boolean(input.on_tool_call),
      on_task_create: Boolean(input.on_task_create),
      interval_message: String(input.interval_message ?? ''), finding_message: String(input.finding_message ?? ''),
      goal_message: String(input.goal_message ?? ''), task_timeout_message: String(input.task_timeout_message ?? ''),
      tool_call_message: String(input.tool_call_message ?? ''), task_create_message: String(input.task_create_message ?? ''),
      tool_names: input.tool_names ?? [], last_fire: ''
    }
    await writer.commit([{ table: 'agent_triggers', key: String(id), record }])
    return record
  }

  async function updateTrigger(agentKey: string, id: string, input: any) {
    const current = await writer.readRecord('agent_triggers', id)
    if (!current || current.agent_key !== agentKey) throw Object.assign(new Error('触发器不存在'), { status: 404 })
    const next = { ...current }
    for (const field of ['enabled', 'interval_sec', 'on_finding', 'on_goal_met', 'on_task_timeout', 'on_tool_call', 'on_task_create', 'interval_message', 'finding_message', 'goal_message', 'task_timeout_message', 'tool_call_message', 'task_create_message', 'tool_names', 'last_fire']) {
      if (input[field] !== undefined) next[field] = input[field]
    }
    delete next.rev
    const [written] = await writer.commit([{ table: 'agent_triggers', key: id, record: next, expectedRev: Number(current.rev ?? 0) }])
    return written
  }

  async function deleteTrigger(agentKey: string, id: string) {
    const current = await writer.readRecord('agent_triggers', id)
    if (!current || current.agent_key !== agentKey) throw Object.assign(new Error('触发器不存在'), { status: 404 })
    await writer.remove('agent_triggers', `${id}`)
    return { deleted: Number(id) }
  }

  function nextFire(frequency: string, timeOfDay: string, from = new Date()) {
    const [hour, minute] = String(timeOfDay || '09:00').split(':').map(Number)
    const next = new Date(from)
    next.setSeconds(0, 0)
    next.setHours(Number.isFinite(hour) ? hour : 9, Number.isFinite(minute) ? minute : 0, 0, 0)
    const stepDays = frequency === 'weekly' ? 7 : frequency === 'monthly' ? 30 : 1
    if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + stepDays)
    return next.toISOString()
  }

  async function createSchedule(input: any) {
    const name = String(input.name ?? '').trim()
    const prompt = String(input.prompt ?? '').trim()
    const frequency = String(input.frequency ?? 'daily')
    if (!name) throw Object.assign(new Error('name 不能为空'), { status: 400 })
    if (!prompt) throw Object.assign(new Error('prompt 不能为空'), { status: 400 })
    if (!['daily', 'weekly', 'monthly'].includes(frequency)) throw Object.assign(new Error('frequency 需为 daily/weekly/monthly'), { status: 400 })
    const rows = await writer.list('schedules')
    const id = Math.max(0, ...rows.map((row) => Number(row.id))) + 1
    const now = new Date()
    const record = {
      id, name, prompt, frequency,
      time_of_day: String(input.time_of_day ?? '09:00'),
      run_on_device: Boolean(input.run_on_device ?? false),
      notify: Boolean(input.notify ?? true),
      new_chat_each_run: Boolean(input.new_chat_each_run ?? true),
      model: String(input.model ?? ''), effort: String(input.effort ?? ''),
      agent_key: String(input.agent_key ?? 'mainagent'), enabled: input.enabled ?? true,
      created_at: rfc3339(now), last_fired_at: '', next_fire_at: nextFire(frequency, String(input.time_of_day ?? '09:00'), now)
    }
    await writer.commit([{ table: 'schedules', key: String(id), record }])
    return record
  }

  async function updateSchedule(id: string, input: any) {
    const current = await writer.readRecord('schedules', id)
    if (!current) throw Object.assign(new Error('schedule 不存在'), { status: 404 })
    const next = { ...current }
    for (const field of ['name', 'prompt', 'frequency', 'time_of_day', 'run_on_device', 'notify', 'new_chat_each_run', 'model', 'effort', 'agent_key', 'enabled']) {
      if (input[field] !== undefined) next[field] = input[field]
    }
    if (input.frequency !== undefined || input.time_of_day !== undefined || input.enabled) {
      next.next_fire_at = nextFire(String(next.frequency), String(next.time_of_day))
    }
    delete next.rev
    const [written] = await writer.commit([{ table: 'schedules', key: id, record: next, expectedRev: Number(current.rev ?? 0) }])
    return written
  }

  async function recordDelivery(input: { channel_id?: number; event_kind: string; title: string; status: string; attempts: number; error?: string }) {
    const rows = await writer.list('notification_deliveries')
    const id = Math.max(0, ...rows.map((row) => Number(row.id))) + 1
    const record = {
      id, channel_id: input.channel_id ?? null, event_kind: input.event_kind, title: input.title,
      status: input.status, attempts: input.attempts, error: input.error ?? '', created_at: rfc3339(new Date())
    }
    await writer.commit([{ table: 'notification_deliveries', key: String(id), record }])
    return record
  }

  async function markScheduleFired(id: string, nextIso: string) {
    const current = await writer.readRecord('schedules', id)
    if (!current) throw Object.assign(new Error('schedule 不存在'), { status: 404 })
    const next = { ...current, last_fired_at: rfc3339(new Date()), next_fire_at: nextIso }
    delete next.rev
    const [written] = await writer.commit([{ table: 'schedules', key: id, record: next, expectedRev: Number(current.rev ?? 0) }])
    return written
  }

  async function deleteSchedule(id: string) {
    const current = await writer.readRecord('schedules', id)
    if (!current) throw Object.assign(new Error('schedule 不存在'), { status: 404 })
    await writer.remove('schedules', `${id}`)
    return { deleted: Number(id) }
  }

  return { writer, importAssets, updateNodePayload, recordDelivery, createSchedule, updateSchedule, markScheduleFired, deleteSchedule, createTrigger, updateTrigger, deleteTrigger, addNode, setNodeState, claimIntent, reclaimExpired, appendActivity, graphOverview, addAsset, linkAssets, anchorAsset, addConstraint, editConstraint, deleteConstraint, sendIntentMessage, rerunIntent, rerunBlocked, controlIntent, addGoal, editGoal, deleteGoal, archiveTask, listArchives, restoreArchive, deleteArchive, createTask, patchFinding, reportFinding, updateTask, controlTask, deleteTask, createCategory, renameCategory, deleteCategory, setTaskCategory, createTemplate, updateTemplate, deleteTemplate, attachAssets, detachAsset, addScope, deleteScope, createChannel, updateChannel, deleteChannel, updateAgent, updateTool, createCustomTool, updateCustomTool, deleteCustomTool, saveMcpServer, setMcpEnabled, deleteMcpServer }
}
