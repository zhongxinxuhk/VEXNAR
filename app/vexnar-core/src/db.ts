// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Kysely, PostgresDialect, sql } from 'kysely'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
export const repo = join(here, '..', '..', '..')

const cfg = JSON.parse(readFileSync(join(repo, 'config.json'), 'utf8')).database

// BIGSERIAL/int8 arrives as a string by default; these ids fit a JS number and
// the Go JSON encodes them as numbers.
pg.types.setTypeParser(20, (value: string) => Number(value))

export const pool = new pg.Pool({
  host: cfg.host,
  port: cfg.port,
  user: cfg.user,
  password: cfg.password,
  database: cfg.dbname,
  ssl: cfg.sslmode === 'disable' ? false : { rejectUnauthorized: false },
  max: 8
})

export const db = new Kysely({ dialect: new PostgresDialect({ pool }) })
export { sql }

/** RFC3339 text with the session offset, matching Go's time.Time JSON form. */
export function rfc3339(column: string) {
  return sql<string>`to_char(${sql.ref(column)}, 'YYYY-MM-DD"T"HH24:MI:SS.US') || to_char(${sql.ref(column)}, 'OF') || ':00'`
}

/** Unix seconds for a timestamptz. */
export function unix(column: string) {
  return sql<number>`floor(extract(epoch from ${sql.ref(column)}))::bigint`
}

export function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
