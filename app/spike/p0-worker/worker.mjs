// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Minimal TS worker: claim one intent with FOR UPDATE SKIP LOCKED, run a
 * simulated tool, write the fact, edge, intent state and activity in one
 * transaction — the same write-back shape the Go worker produces.
 */
import { sql } from 'kysely'
import { db } from '../p0-db/db.mjs'

export async function claimOne(explorationId, worker = 'ts-worker') {
  return db.transaction().execute(async (trx) => {
    const { rows } = await sql`
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

export async function executeAndWriteBack(explorationId, claim, worker = 'ts-worker') {
  const started = Date.now()
  return db.transaction().execute(async (trx) => {
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
