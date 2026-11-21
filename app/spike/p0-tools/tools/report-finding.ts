// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * TS report_finding, two checks:
 *   1. validation parity — the same rejections the Go MCP wrapper produces;
 *   2. write-shape parity — copy an existing finding inside a transaction,
 *      compare the inserted row with its source, then roll back.
 */
import type { Kysely } from 'kysely'
import type { RowId, VexnarDb } from '../../p0-db/db.ts'

/** Tool arguments the validator reads; the Go wrapper takes them as JSON. */
export type ReportFindingArgs = {
  task_id?: string | number
  vulnclass?: string
  name?: string
  severity?: string
  summary?: string
  evidence?: string
  status?: string
}

/** Mirrors the MCP wrapper + handler guards that run before any insert. */
export function validateReportFinding(args: ReportFindingArgs, taskExists: (taskId: string) => boolean): string | null {
  if (!String(args.task_id ?? '').trim()) return 'task_id 为必填'
  if (!taskExists(String(args.task_id))) return `task 不存在: ${args.task_id}`
  return null
}

const FIELDS = ['vulnclass', 'name', 'severity', 'summary', 'evidence', 'status'] as const

/** The compared columns of one findings row, plus the two keys the copy needs. */
type FindingRow = {
  id: RowId
  vulnclass: string
  name: string
  severity: string
  summary: string
  evidence: string
  status: string
}

type FindingSource = FindingRow & { task_id: RowId | null; asset_ids: unknown }

/** Row the inserted copy is read back as (`id` plus the compared columns). */
type InsertedFinding = FindingRow

export async function writeShapeCheck(db: Kysely<VexnarDb>) {
  const source = await db
    .selectFrom('findings')
    .select(['id', ...FIELDS, 'task_id', 'asset_ids'])
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst()
  if (!source) throw new Error('no finding rows to copy')

  let inserted: InsertedFinding | null = null
  class Rollback extends Error {}
  try {
    await db.transaction().execute(async (trx) => {
      inserted = (await trx
        .insertInto('findings')
        .values({
          task_id: source.task_id,
          vulnclass: source.vulnclass,
          name: source.name,
          severity: source.severity,
          summary: source.summary,
          evidence: source.evidence,
          status: source.status,
          asset_ids: JSON.stringify(source.asset_ids ?? [])
        })
        .returning(['id', ...FIELDS])
        .executeTakeFirst()) ?? null
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }

  // Assigned inside the transaction callback above; TS cannot see through the closure.
  const copy = inserted as InsertedFinding | null
  const diffs = FIELDS.filter((field) => String(copy?.[field] ?? '') !== String(source[field] ?? ''))
  return { comparedFields: FIELDS.length, diffs, sourceId: source.id, insertedId: copy?.id }
}
