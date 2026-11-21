// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Verify the worker's write-back against the same tables the Go engine reads.
 * A Go API check would need the task in the manager's memory (a restart), so the
 * spike reads the graph directly; P0-1 already proved those reads match the API.
 */
import { db } from '../p0-db/db.ts'

/** One asserted invariant of the write-back. */
type Check = { name: string; ok: boolean; detail: string }

/** `payload` is JSONB: node-postgres parses it, a text payload needs one parse. */
function summaryOf(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || !('summary' in payload)) return ''
  return String(payload.summary ?? '')
}

export async function verify(explorationId: string, intentId: string, factId: string): Promise<Check[]> {
  const checks: Check[] = []
  const add = (name: string, ok: boolean, detail = ''): number => checks.push({ name, ok, detail })

  const intent = await db
    .selectFrom('exploration_nodes')
    .select(['state', 'owner', 'completed_at'])
    .where('id', '=', intentId)
    .executeTakeFirst()
  add('intent done', intent?.state === 'done', JSON.stringify(intent))
  add('intent completed_at set', Boolean(intent?.completed_at))

  const fact = await db
    .selectFrom('exploration_nodes')
    .select(['kind', 'state', 'payload'])
    .where('id', '=', factId)
    .executeTakeFirst()
  const payload: unknown = typeof fact?.payload === 'string' ? JSON.parse(fact.payload) : fact?.payload
  add('fact recorded', fact?.kind === 'fact' && fact?.state === 'confirmed', JSON.stringify(fact)?.slice(0, 200))
  add('fact summary', summaryOf(payload).includes('GET /health'))

  const edge = await db
    .selectFrom('exploration_edges')
    .select(['rel'])
    .where('exploration_id', '=', explorationId)
    .where('src_id', '=', intentId)
    .where('dst_id', '=', factId)
    .executeTakeFirst()
  add('edge intent -> fact (yields)', edge?.rel === 'yields', JSON.stringify(edge))

  const activity = await db
    .selectFrom('activity')
    .select(['id'])
    .where('exploration_id', '=', explorationId)
    .where('node_id', 'in', [intentId, factId])
    .execute()
  add('activity recorded', activity.length >= 2, `rows=${activity.length}`)

  return checks
}
