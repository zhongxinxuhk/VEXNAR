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

  return { writer, createTask, patchFinding }
}
