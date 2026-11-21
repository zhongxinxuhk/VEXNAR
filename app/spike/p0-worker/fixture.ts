// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Fixture for P0-3: a paused task with one begin node and one open intent.
 * Status is paused so the Go engine never picks it up.
 */
import { db, type RowId } from '../p0-db/db.ts'

export async function createFixture(prefix = 'p0-ts-worker') {
  const stale = await db.selectFrom('tasks').select(['id', 'exploration_id']).where('description', 'like', `${prefix}%`).execute()
  for (const task of stale) await cleanupTask(task.id)

  const exploration = await db
    .insertInto('explorations')
    .values({ description: prefix, goal: 'prove the TS worker write path' })
    .returning('id')
    .executeTakeFirstOrThrow()

  const task = await db
    .insertInto('tasks')
    .values({
      description: `${prefix} task`,
      goal: 'prove the TS worker write path',
      name: prefix,
      exploration_id: exploration.id,
      status: 'paused',
      paused: true
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  const begin = await db
    .insertInto('exploration_nodes')
    .values({
      exploration_id: exploration.id,
      kind: 'begin',
      state: 'open',
      origin: 'system',
      payload: JSON.stringify({ summary: 'fixture start' })
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  const intent = await db
    .insertInto('exploration_nodes')
    .values({
      exploration_id: exploration.id,
      kind: 'intent',
      state: 'open',
      priority: 5,
      origin: 'planner',
      payload: JSON.stringify({ summary: 'GET /health once', goal: 'check health endpoint' })
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  await db
    .insertInto('exploration_edges')
    .values({ exploration_id: exploration.id, src_id: begin.id, dst_id: intent.id, rel: 'spawns' })
    .execute()

  return {
    taskId: String(task.id),
    explorationId: String(exploration.id),
    intentId: String(intent.id)
  }
}

export async function cleanupTask(taskId: RowId) {
  const task = await db.selectFrom('tasks').select('exploration_id').where('id', '=', taskId).executeTakeFirst()
  if (!task) return
  await db.deleteFrom('tasks').where('id', '=', taskId).execute()
  await db.deleteFrom('explorations').where('id', '=', task.exploration_id).execute()
}
