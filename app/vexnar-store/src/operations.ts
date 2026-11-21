// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFile, readdir } from 'node:fs/promises'
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

  return { writer, createTask, patchFinding, reportFinding, updateTask, controlTask, deleteTask, createCategory, renameCategory, deleteCategory, setTaskCategory, createTemplate, updateTemplate, deleteTemplate }
}
