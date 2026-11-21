// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Read paths under test. Each returns plain rows; the reconciler maps them to
 * the Go DTO shape so differences are field-level, not structural.
 */
import { sql } from 'kysely'
import { db } from './db.mjs'

/** Core task fields; derived metrics (tokens/goals/in_flight) are listed separately. */
export async function tasks(limit = 200) {
  return db
    .selectFrom('tasks')
    .select([
      'id',
      'exploration_id',
      'name',
      'description',
      'goal',
      'status',
      'paused',
      'queued',
      'company_id',
      'created_at',
      'completed_at',
      'archived_at',
      'deleted_at'
    ])
    .orderBy('id', 'desc')
    .limit(limit)
    .execute()
}

/** Findings joined with their exploration node (the list DTO's `id`). */
export async function findings(limit = 200) {
  return db
    .selectFrom('findings as f')
    .leftJoin('exploration_nodes as n', 'n.id', 'f.node_id')
    .select([
      'f.id as finding_id',
      'f.id as id',
      'f.node_id as node_id',
      'f.vulnclass',
      'f.name',
      'f.severity',
      'f.status',
      'f.summary',
      'f.evidence',
      'f.task_id',
      'f.created_at'
    ])
    .orderBy('f.created_at', 'desc')
    .orderBy('f.id', 'desc')
    .limit(limit)
    .execute()
}

/** Asset rows; the API omits null company_id and stringifies arrays. */
export async function assets(limit = 200) {
  return db
    .selectFrom('assets')
    .select(['id', 'type', 'domain', 'root_domain', 'company_id', 'task_ids', 'last_seen'])
    .where('type', '=', 'root_domain')
    .orderBy('id', 'asc')
    .limit(limit)
    .execute()
}

/** One page of exploration nodes for a task, ascending by id (API order=asc). */
export async function nodes(explorationId, limit = 100) {
  return db
    .selectFrom('exploration_nodes')
    .select(['id', 'kind', 'state', 'payload', 'priority', 'created_at'])
    .where('exploration_id', '=', explorationId)
    .orderBy('id', 'asc')
    .limit(limit)
    .execute()
}

/** The task whose exploration has the most nodes, for a meaningful node page. */
export async function busiestTask() {
  return db
    .selectFrom('tasks as t')
    .innerJoin('exploration_nodes as n', 'n.exploration_id', 't.exploration_id')
    .select(['t.id', 't.exploration_id'])
    .groupBy(['t.id', 't.exploration_id'])
    .orderBy(sql`count(*)`, 'desc')
    .limit(1)
    .executeTakeFirst()
}

/** Row counts for a coarse drift check. */
export async function counts() {
  const [t] = await db.selectFrom('tasks').select(sql`count(*)::int`.as('n')).execute()
  const [f] = await db.selectFrom('findings').select(sql`count(*)::int`.as('n')).execute()
  const [a] = await db.selectFrom('assets').select(sql`count(*)::int`.as('n')).execute()
  const [n] = await db.selectFrom('exploration_nodes').select(sql`count(*)::int`.as('n')).execute()
  return { tasks: t.n, findings: f.n, assets: a.n, nodes: n.n }
}
