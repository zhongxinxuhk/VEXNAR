// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Per-scope capture state.
//
// Traffic capture is not a station-wide switch: one chat (a VEXNAR conversation
// or a host chat session) arms capture for its own scope, and only that scope
// receives the exchanges the capture plane mirrors back. The state lives in the
// meta domain (`trafficCaptures`) so the hook selector, the endpoint probe and
// the overview aggregate all read the same row instead of inferring intent from
// settings.
import { meta } from './context.ts'

export interface CaptureState {
  /** Attribution scope and primary key: conv-12 / session-<id> / task-7. */
  scope: string
  /** VEXNAR conversation id when scope is `conv-<n>`, else 0. */
  conv_id: number
  /** Host chat session id when scope is `session-<id>`, else ''. */
  session_id: string
  /** Capture plane that was armed: yakit | worker | replay | import. */
  source: string
  /** Unix seconds; 0 = never started. */
  started_at: number
  /** Unix seconds; 0 = still running. */
  stopped_at: number
}

export function convCaptureScope(convId: number | string): string {
  return `conv-${Number(convId)}`
}

export function sessionCaptureScope(sessionId: string): string {
  return `session-${String(sessionId)}`
}

function normalize(row: any): CaptureState | null {
  const scope = String(row?.scope ?? '').trim()
  if (!/^(conv-\d+|session-[A-Za-z0-9][A-Za-z0-9_-]{0,127}|task-\d+(-i\d+)?)$/.test(scope)) return null
  const convId = scope.startsWith('conv-') ? Number(scope.slice(5)) : 0
  const sessionId = scope.startsWith('session-') ? scope.slice(8) : ''
  return {
    scope,
    conv_id: Number(row?.conv_id ?? 0) || convId,
    session_id: String(row?.session_id ?? '') || sessionId,
    source: String(row?.source ?? '') || 'yakit',
    started_at: Number(row?.started_at ?? 0) || 0,
    stopped_at: Number(row?.stopped_at ?? 0) || 0
  }
}

/** Every stored row, newest start first. Tolerant of a hand-edited meta file. */
export async function readCaptures(): Promise<CaptureState[]> {
  const rows = (await meta.table<any[]>('trafficCaptures')) ?? []
  if (!Array.isArray(rows)) return []
  const out: CaptureState[] = []
  for (const row of rows) {
    const capture = normalize(row)
    if (capture !== null) out.push(capture)
  }
  return out.sort((left, right) => right.started_at - left.started_at)
}

async function writeCaptures(next: CaptureState[]): Promise<void> {
  const tables = await meta.load()
  tables.trafficCaptures = next
  await meta.save(tables)
  meta.reload()
}

/** The scope's current row, or null when it never armed capture. */
export async function captureOf(scope: string): Promise<CaptureState | null> {
  const rows = await readCaptures()
  return rows.find((row) => row.scope === String(scope)) ?? null
}

/** Scopes capturing right now. */
export function activeCaptures(rows: CaptureState[]): CaptureState[] {
  return rows.filter((row) => row.started_at > 0 && row.stopped_at === 0)
}

export async function startCapture(scope: string, source = 'yakit'): Promise<CaptureState> {
  const key = String(scope)
  const rows = await readCaptures()
  const next = normalize({
    scope: key,
    conv_id: key.startsWith('conv-') ? Number(key.slice(5)) : 0,
    session_id: key.startsWith('session-') ? key.slice(8) : '',
    source: String(source || 'yakit'),
    started_at: Math.floor(Date.now() / 1000),
    stopped_at: 0
  })
  if (next === null) throw Object.assign(new Error(`无法识别的 scope: ${key}`), { status: 400 })
  // One row per scope: re-arming restarts the clock instead of stacking.
  await writeCaptures([next, ...rows.filter((row) => row.scope !== key)])
  return next
}

export async function stopCapture(scope: string): Promise<CaptureState | null> {
  const key = String(scope)
  const rows = await readCaptures()
  const current = rows.find((row) => row.scope === key)
  if (!current) return null
  const next: CaptureState = { ...current, stopped_at: Math.floor(Date.now() / 1000) }
  await writeCaptures([next, ...rows.filter((row) => row.scope !== key)])
  return next
}
