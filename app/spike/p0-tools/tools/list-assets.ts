// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * TS list_assets: the subset the spike compares — id/ids direct lookup and a
 * single-condition DSL (`field=value` fuzzy, `field==value` exact), plus type
 * filter and pagination. Output keeps the Go DTO's core fields.
 */
import { sql } from 'kysely'
import { db, type RowId } from '../../p0-db/db.ts'

/** Columns the spike's DSL accepts; keys are the DSL field names. */
type FilterColumn =
  | 'domain'
  | 'root_domain'
  | 'ip'
  | 'url'
  | 'service_name'
  | 'app_name'
  | 'icp'
  | 'service_type'
  | 'record_type'
  | 'port'
  | 'company_id'

const FIELDS: Record<string, FilterColumn | undefined> = {
  domain: 'domain',
  root_domain: 'root_domain',
  ip: 'ip',
  url: 'url',
  service_name: 'service_name',
  app_name: 'app_name',
  icp: 'icp',
  service_type: 'service_type',
  record_type: 'record_type',
  port: 'port',
  company_id: 'company_id'
}

/** Arguments the Go tool accepts; `ids` is a JSON array, so numbers reach here unquoted. */
export type ListAssetsParams = {
  ids?: RowId[]
  id?: RowId
  dsl?: string
  type?: string
  limit?: number | string
  offset?: number | string
}

/** One parsed single-condition DSL expression. */
type ParsedDsl = { column: FilterColumn; value: string; exact: boolean }

/** Row the inventory query projects; `last_seen` is rendered as text by SQL. */
type AssetRow = {
  id: RowId
  type: string
  domain: string | null
  root_domain: string | null
  company_id: RowId | null
  task_ids: RowId[]
  last_seen: string
}

function parseDsl(dsl: string): ParsedDsl {
  const text = String(dsl).trim()
  const exact = text.match(/^([a-z_]+)\s*==\s*(.+)$/i)
  if (exact) {
    const column = FIELDS[exact[1].toLowerCase()]
    if (!column) throw new Error(`unknown field ${exact[1]}`)
    return { column, value: exact[2].trim(), exact: true }
  }
  const fuzzy = text.match(/^([a-z_]+)\s*=\s*(.+)$/i)
  if (fuzzy) {
    const column = FIELDS[fuzzy[1].toLowerCase()]
    if (!column) throw new Error(`unknown field ${fuzzy[1]}`)
    return { column, value: fuzzy[2].trim(), exact: false }
  }
  throw new Error('unsupported DSL in this spike')
}

const CORE = ['id', 'type', 'domain', 'root_domain', 'company_id', 'task_ids', 'last_seen'] as const

export async function listAssets(params: ListAssetsParams = {}) {
  const limit = Number(params.limit) > 0 ? Number(params.limit) : 10
  const offset = Number(params.offset) > 0 ? Number(params.offset) : 0
  const ids = params.ids?.length ? params.ids : params.id ? [params.id] : null

  let query = db
    .selectFrom('assets')
    .select(['id', 'type', 'domain', 'root_domain', 'company_id', 'task_ids', sql<string>`last_seen::text`.as('last_seen')])

  if (ids) query = query.where('id', 'in', ids)
  else if (params.dsl) {
    const parsed = parseDsl(params.dsl)
    query = parsed.exact
      ? query.where(parsed.column, '=', parsed.value)
      : query.where(parsed.column, 'ilike', `%${parsed.value}%`)
  } else {
    throw new Error('dsl 不能为空')
  }
  if (params.type) query = query.where('type', '=', params.type)

  const rows = await query.orderBy('last_seen', 'desc').orderBy('id', 'desc').limit(limit).offset(offset).execute()
  return { count: rows.length, assets: rows.map((row) => pick(row)) }
}

/** Projects the CORE field list; `company_id` stays absent when the column is null. */
function pick(row: AssetRow): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of CORE) {
    if (key === 'company_id' && (row[key] === null || row[key] === undefined)) continue
    out[key] = row[key]
  }
  return out
}
