// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Minimal TS worker: claim one intent with FOR UPDATE SKIP LOCKED, run a
 * simulated tool, write the fact, edge, intent state and activity in one
 * transaction — the same write-back shape the Go worker produces.
 */
import { sql } from 'kysely'
import { db, type RowId } from '../p0-db/db.ts'

/** Row the SKIP LOCKED claim selects. */
type IntentRow = { id: RowId; payload: unknown }

/** A claimed intent, as handed to the write-back. */
export type ClaimedIntent = { claimed: true; intentId: string; payload: unknown }

/** Claim outcome: `claimed: false` when no open intent was left. */
export type ClaimResult = { claimed: false } | ClaimedIntent

/** What the write-back reports back to the demo. */
export type WriteBackResult = { factId: string; durationMs: number }

export async function claimOne(explorationId: string, worker = 'ts-worker'): Promise<ClaimResult> {
  return db.transaction().execute(async (trx): Promise<ClaimResult> => {
    const { rows } = await sql<IntentRow>`
      SELECT id, payload FROM exploration_nodes
      WHERE exploration_id = ${explorationId}
        AND kind = 'intent' AND state = 'open'
      ORDER BY priority DESC, id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `.execute(trx)
    const intent = rows[0]
    if (!intent) return { claimed: false }

    await trx
      .updateTable('exploration_nodes')
      .set({ state: 'running', owner: worker, updated_at: sql`now()` })
      .where('id', '=', intent.id)
      .execute()

    return { claimed: true, intentId: String(intent.id), payload: intent.payload }
  })
}

export async function executeAndWriteBack(
  explorationId: string,
  claim: ClaimedIntent,
  worker = 'ts-worker'
): Promise<WriteBackResult> {
  const started = Date.now()
  return db.transaction().execute(async (trx): Promise<WriteBackResult> => {
    const fact = await trx
      .insertInto('exploration_nodes')
      .values({
        exploration_id: explorationId,
        kind: 'fact',
        state: 'confirmed',
        origin: worker,
        payload: JSON.stringify({
          summary: 'GET /health -> 200 {"ok":true}',
          detail: '{"ok":true}',
          confidence: 'high'
        })
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await trx
      .insertInto('exploration_edges')
      .values({ exploration_id: explorationId, src_id: claim.intentId, dst_id: fact.id, rel: 'yields' })
      .execute()

    await trx
      .updateTable('exploration_nodes')
      .set({ state: 'done', completed_at: sql`now()`, updated_at: sql`now()` })
      .where('id', '=', claim.intentId)
      .execute()

    await trx
      .insertInto('activity')
      .values([
        {
          exploration_id: explorationId,
          node_id: claim.intentId,
          worker,
          kind: 'tool',
          tool: 'http_request',
          summary: 'GET /health',
          detail: '200 OK {"ok":true}',
          metadata: JSON.stringify({ status: 200, bytes: 11 })
        },
        {
          exploration_id: explorationId,
          node_id: fact.id,
          worker,
          kind: 'writeback',
          summary: 'fact recorded',
          detail: 'confirmed health check'
        }
      ])
      .execute()

    return { factId: String(fact.id), durationMs: Date.now() - started }
  })
}
