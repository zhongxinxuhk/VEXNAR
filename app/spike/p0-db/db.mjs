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
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

function config() {
  const raw = JSON.parse(readFileSync(join(repo, 'config.json'), 'utf8'))
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

export const db = new Kysely({ dialect: new PostgresDialect({ pool }) })

export function jwtKey() {
  return readFileSync(join(repo, 'jwt.key'))
}

export { repo }
