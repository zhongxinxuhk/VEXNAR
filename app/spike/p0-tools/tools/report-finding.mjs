// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * TS report_finding, two checks:
 *   1. validation parity — the same rejections the Go MCP wrapper produces;
 *   2. write-shape parity — copy an existing finding inside a transaction,
 *      compare the inserted row with its source, then roll back.
 */

/** Mirrors the MCP wrapper + handler guards that run before any insert. */
export function validateReportFinding(args, taskExists) {
  if (!String(args.task_id ?? '').trim()) return 'task_id 为必填'
  if (!taskExists(String(args.task_id))) return `task 不存在: ${args.task_id}`
  return null
}

const FIELDS = ['vulnclass', 'name', 'severity', 'summary', 'evidence', 'status']

export async function writeShapeCheck(db) {
  const source = await db
    .selectFrom('findings')
    .select(['id', ...FIELDS, 'task_id', 'asset_ids'])
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst()
  if (!source) throw new Error('no finding rows to copy')

  let inserted = null
  class Rollback extends Error {}
  try {
    await db.transaction().execute(async (trx) => {
      inserted = await trx
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
        .executeTakeFirst()
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }

  const diffs = FIELDS.filter((field) => String(inserted?.[field] ?? '') !== String(source[field] ?? ''))
  return { comparedFields: FIELDS.length, diffs, sourceId: source.id, insertedId: inserted?.id }
}
