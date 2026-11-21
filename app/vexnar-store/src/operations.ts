// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { storeWriter } from './writer.js'
import { metaStore } from './meta-store.js'

const STATUSES = new Set(['pending', 'in_progress', 'confirmed', 'resolved', 'fixed', 'false_positive', 'ignored', 'duplicate', 'risk_accepted'])
const SEVERITIES = new Set(['critical', 'high', 'medium', 'low'])

function rfc3339(date: Date) {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = (value: number) => String(Math.floor(Math.abs(value))).padStart(2, '0')
  return `${date.toISOString().slice(0, 23)}${sign}${pad(offset / 60)}:${pad(offset % 60)}`
    .replace('Z', '')
}

async function maxNumericKey(dir: string) {
  let max = 0
  try {
    for (const name of await readdir(dir)) {
      if (!name.endsWith('.json')) continue
      const key = Number(name.slice(0, -5))
      if (Number.isFinite(key)) max = Math.max(max, key)
    }
  } catch {
    // empty table
  }
  return max
}

export function storeOperations(root: string) {
  const writer = storeWriter(root)
  const meta = metaStore(root)

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

    const taskDir = join(root, 'tasks')
    const id = (await maxNumericKey(taskDir)) + 1
    let explorationId = 1
    try {
      for (const name of await readdir(taskDir)) {
        if (!name.endsWith('.json')) continue
        const doc = JSON.parse(await readFile(join(taskDir, name), 'utf8'))
        explorationId = Math.max(explorationId, Number(doc.record?.exploration_id ?? 0) + 1)
      }
    } catch {
      // first task
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

    const nodeId = (await maxNumericKey(join(root, 'nodes'))) + 1
    const findingId = (await maxNumericKey(join(root, 'findings'))) + 1
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
    try {
      for (const name of await readdir(join(root, 'tasks'))) {
        if (!name.endsWith('.json')) continue
        const doc = JSON.parse(await readFile(join(root, 'tasks', name), 'utf8'))
        if (String(doc.record?.category_id ?? '') !== String(id)) continue
        const next = { ...doc.record, category_id: null }
        delete next.rev
        await writer.commit([{ table: 'tasks', key: String(doc.record.id), record: next, expectedRev: Number(doc.record.rev ?? 0) }])
      }
    } catch {
      // no tasks
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
    const ids = Array.isArray(asset.task_ids) ? asset.task_ids.map(Number) : []
    if (!ids.includes(Number(taskId))) throw Object.assign(new Error('asset 未关联该任务'), { status: 404 })
    const next = { ...asset, task_ids: ids.filter((id) => id !== Number(taskId)) }
    delete next.rev
    await writer.commit([{ table: 'assets', key: assetId, record: next, expectedRev: Number(asset.rev ?? 0) }])
    await rm(join(root, 'task_asset_links', `${taskId}-${assetId}.json`), { force: true })
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
    const existing = []
    try {
      for (const name of await readdir(join(root, 'task_scope'))) {
        if (!name.endsWith('.json')) continue
        existing.push(JSON.parse(await readFile(join(root, 'task_scope', name), 'utf8')).record)
      }
    } catch {
      // empty
    }
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
      const assets = await (async () => {
        const rows = []
        for (const name of await readdir(join(root, 'assets'))) {
          if (!name.endsWith('.json')) continue
          rows.push(JSON.parse(await readFile(join(root, 'assets', name), 'utf8')).record)
        }
        return rows
      })()
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
    let rows = []
    try {
      for (const name of await readdir(join(root, 'task_scope'))) {
        if (!name.endsWith('.json')) continue
        rows.push(JSON.parse(await readFile(join(root, 'task_scope', name), 'utf8')).record)
      }
    } catch {
      // empty
    }
    const row = rows.find((item) => String(item.id) === String(scopeId) && String(item.task_id) === String(taskId))
    if (!row) throw Object.assign(new Error('scope 不存在'), { status: 404 })
    await rm(join(root, 'task_scope', `${scopeId}.json`), { force: true })
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

  return { writer, createTask, patchFinding, reportFinding, updateTask, controlTask, deleteTask, createCategory, renameCategory, deleteCategory, setTaskCategory, createTemplate, updateTemplate, deleteTemplate, attachAssets, detachAsset, addScope, deleteScope, createChannel, updateChannel, deleteChannel, updateAgent, updateTool, createCustomTool, updateCustomTool, deleteCustomTool, saveMcpServer, setMcpEnabled, deleteMcpServer }
}
