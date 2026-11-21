// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Traffic attribution scope. The proxy credential (future worker) or the ingest
// header carries one of these strings; parsing it is the only way a recorded
// exchange becomes part of a conversation's sidebar.

export interface TrafficScope {
  raw: string
  kind: 'conv' | 'session' | 'task' | 'intent' | 'global'
  convId: number
  taskId: number
  intentId: number
}

/** Chat session ids are opaque (dsh uuids), so they keep their own segment shape. */
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

/**
 * Parse `conv-12`, `session-<id>`, `task-7`, `task-7-i31`; unknown values are
 * global traffic. `conv-` is the numbered VEXNAR conversation, `session-` is the
 * host chat session a capture was armed from.
 */
export function parseScope(raw: unknown): TrafficScope {
  const text = String(raw ?? '').trim()
  const global: TrafficScope = { raw: text, kind: 'global', convId: 0, taskId: 0, intentId: 0 }
  if (text.startsWith('conv-')) {
    const id = Number(text.slice(5))
    if (Number.isInteger(id) && id > 0) return { ...global, kind: 'conv', convId: id }
    return global
  }
  if (text.startsWith('session-')) {
    const id = text.slice(8)
    if (SESSION_ID.test(id)) return { ...global, kind: 'session' }
    return global
  }
  if (text.startsWith('task-')) {
    const rest = text.slice(5)
    const intentAt = rest.indexOf('-i')
    if (intentAt > 0) {
      const taskId = Number(rest.slice(0, intentAt))
      const intentId = Number(rest.slice(intentAt + 2))
      if (Number.isInteger(taskId) && taskId > 0 && Number.isInteger(intentId) && intentId > 0) {
        return { ...global, kind: 'intent', taskId, intentId }
      }
      return global
    }
    const taskId = Number(rest)
    if (Number.isInteger(taskId) && taskId > 0) return { ...global, kind: 'task', taskId }
  }
  return global
}

export function convScope(id: number | string): string {
  return `conv-${Number(id)}`
}

export function sessionScope(id: string): string {
  return `session-${String(id)}`
}

export function taskScope(id: number | string): string {
  return `task-${Number(id)}`
}

export function intentScope(taskId: number | string, intentId: number | string): string {
  return `task-${Number(taskId)}-i${Number(intentId)}`
}
