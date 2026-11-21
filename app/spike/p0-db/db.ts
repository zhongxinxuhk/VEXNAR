// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * P0-1 spike: Kysely read paths against the live VEXNAR PostgreSQL.
 *
 * The schema is unchanged; this proves the TS data layer can read the same rows
 * the Go service reads, before any endpoint is ported.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Generated, Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

/**
 * BIGINT columns (db/schema.sql BIGSERIAL/BIGINT): node-postgres hands them back
 * as strings by default, while `::int` casts and numeric literals are numbers.
 */
export type RowId = string | number

/** JSONB columns arrive already parsed by node-postgres; the shape is per row. */
export type JsonColumn = unknown

/**
 * The slice of the VEXNAR schema these spikes touch (db/schema.sql), typed so
 * `db` is a `Kysely<VexnarDb>` instead of the untyped `Kysely<never>` default.
 */
export type VexnarDb = {
  tasks: {
    id: Generated<RowId>
    name: Generated<string>
    description: string
    goal: string
    exploration_id: RowId
    status: Generated<string>
    paused: Generated<boolean>
    queued: Generated<boolean>
    company_id: Generated<RowId | null>
    created_at: Generated<Date>
    archived_at: Generated<Date | null>
    deleted_at: Generated<Date | null>
    completed_at: Generated<Date | null>
  }
  findings: {
    id: Generated<RowId>
    node_id: Generated<RowId | null>
    task_id: Generated<RowId | null>
    vulnclass: Generated<string>
    name: Generated<string>
    severity: Generated<string>
    status: Generated<string>
    summary: Generated<string>
    evidence: Generated<string>
    asset_ids: Generated<JsonColumn>
    created_at: Generated<Date>
  }
  assets: {
    id: Generated<RowId>
    type: string
    domain: string | null
    root_domain: string | null
    ip: string | null
    url: string | null
    port: number | null
    icp: string | null
    record_type: string | null
    app_name: string | null
    service_type: string | null
    service_name: string | null
    company_id: Generated<RowId | null>
    task_ids: Generated<RowId[]>
    created_at: Generated<Date>
    last_seen: Generated<Date>
  }
  explorations: {
    id: Generated<RowId>
    description: string | null
    goal: string
    created_at: Generated<Date>
    updated_at: Generated<Date>
  }
  exploration_nodes: {
    id: Generated<RowId>
    exploration_id: RowId
    kind: string
    payload: Generated<JsonColumn>
    priority: Generated<number>
    state: Generated<string>
    origin: string | null
    owner: string | null
    created_at: Generated<Date>
    updated_at: Generated<Date>
    completed_at: Generated<Date | null>
  }
  exploration_edges: {
    exploration_id: RowId
    src_id: RowId
    dst_id: RowId
    rel: string
    created_at: Generated<Date>
  }
  activity: {
    id: Generated<RowId>
    exploration_id: RowId
    node_id: Generated<RowId | null>
    worker: string | null
    kind: string | null
    tool: string | null
    is_error: Generated<boolean>
    summary: string | null
    detail: string | null
    metadata: Generated<JsonColumn>
    created_at: Generated<Date>
  }
}

/** config.json's `database` block, as `db.ts` reads it. */
type DatabaseConfig = {
  host: string
  port: number
  user: string
  password: string
  dbname: string
  sslmode?: string
}

function config(): DatabaseConfig {
  const raw = JSON.parse(readFileSync(join(repo, 'config.json'), 'utf8')) as { database: DatabaseConfig }
  return raw.database
}

const dbConfig = config()

export const pool = new pg.Pool({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.dbname,
  ssl: dbConfig.sslmode === 'disable' ? false : { rejectUnauthorized: false },
  max: 4
})

export const db = new Kysely<VexnarDb>({ dialect: new PostgresDialect({ pool }) })

export function jwtKey() {
  return readFileSync(join(repo, 'jwt.key'))
}

export { repo }
