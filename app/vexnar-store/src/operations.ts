// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { storeWriter } from './writer.js'

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

  return { writer, createTask, patchFinding, reportFinding }
}
