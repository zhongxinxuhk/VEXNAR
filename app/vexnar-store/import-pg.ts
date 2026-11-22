// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createHash } from 'node:crypto'
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'
import { parseArgs } from 'node:util'
import pg from 'pg'
import { readPgCatalog } from './src/pg-meta.ts'
import { projectClientData } from './src/client-snapshot.ts'

const { values } = parseArgs({ options: {
  config: { type: 'string' }, base: { type: 'string' }, to: { type: 'string' }, help: { type: 'boolean' }
} })
if (values.help) {
  console.log('用法：pnpm run import:pg --to <新 SQLite> [--base <现有 SQLite>] [--config <config.json>]')
  process.exit(0)
}
if (!values.to) throw new Error('需要 --to 指定新的 SQLite 文件')
const target = resolve(values.to)
if (existsSync(target)) throw new Error('目标已存在；迁移只生成新文件')
if (values.base && !existsSync(values.base)) throw new Error('待保留的本地 SQLite 不存在')

const source = values.config ? resolve(values.config) : new URL('../../config.json', import.meta.url)
const cfg = JSON.parse(readFileSync(source, 'utf8')).database
if (!cfg?.host || !cfg?.dbname) throw new Error('config.json 缺少 PostgreSQL 连接配置')

const pgClient = new pg.Client({
  host: cfg.host, port: Number(cfg.port ?? 5432), user: cfg.user, password: cfg.password, database: cfg.dbname,
  ssl: cfg.sslmode === 'disable' ? false : { rejectUnauthorized: true }, connectionTimeoutMillis: 8000
})
const quote = (identifier: string) => '"' + identifier.replaceAll('"', '""') + '"'
type TableName = { schema_name: string; table_name: string }
const countRow = (db: DatabaseSync, sql: string, ...params: string[]) => Number(db.prepare(sql).get(...params)?.n ?? 0)

async function archiveTables(db: DatabaseSync) {
  const query = await pgClient.query<TableName>(
    "SELECT schemaname AS schema_name, tablename AS table_name FROM pg_catalog.pg_tables " +
    "WHERE schemaname !~ '^pg_' AND schemaname <> 'information_schema' ORDER BY schemaname, tablename"
  )
  const putTable = db.prepare('INSERT INTO legacy_pg_tables VALUES (?, ?, ?, ?, ?)')
  const putRow = db.prepare('INSERT INTO legacy_pg_rows VALUES (?, ?, ?, ?)')
  const readRows = db.prepare('SELECT record FROM legacy_pg_rows WHERE schema_name=? AND table_name=? ORDER BY ordinal')
  let total = 0

  for (const table of query.rows) {
    const { schema_name: schema, table_name: name } = table
    const identifier = quote(schema) + '.' + quote(name)
    const columns = await pgClient.query(
      'SELECT column_name, data_type, udt_schema, udt_name, is_nullable, column_default FROM information_schema.columns ' +
      'WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position', [schema, name]
    )
    const count = Number((await pgClient.query('SELECT count(*)::text AS n FROM ' + identifier)).rows[0]?.n)
    const hash = createHash('sha256')
    let ordinal = 0
    await pgClient.query('DECLARE snapshot_rows NO SCROLL CURSOR FOR SELECT record FROM ' +
      '(SELECT to_jsonb(t)::text AS record FROM ' + identifier + ' AS t) AS rows ORDER BY record COLLATE "C"')
    for (;;) {
      const { rows } = await pgClient.query<{ record: string }>('FETCH 256 FROM snapshot_rows')
      if (rows.length === 0) break
      for (const { record } of rows) {
        putRow.run(schema, name, ++ordinal, record)
        hash.update(record).update('\n')
      }
    }
    await pgClient.query('CLOSE snapshot_rows')
    const expected = hash.digest('hex')
    const verification = createHash('sha256')
    for (const row of readRows.iterate(schema, name)) verification.update(String(row.record)).update('\n')
    const actual = countRow(db, 'SELECT count(*) AS n FROM legacy_pg_rows WHERE schema_name=? AND table_name=?', schema, name)
    if (count !== ordinal || actual !== count || verification.digest('hex') !== expected) {
      throw new Error('归档计数或摘要不一致：' + identifier)
    }
    putTable.run(schema, name, JSON.stringify(columns.rows), count, expected)
    total += count
  }
  return { tables: query.rowCount ?? 0, rows: total }
}

mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
const stage = mkdtempSync(join(dirname(target), '.pg-snapshot-'))
const file = join(stage, 'snapshot.sqlite')
try {
  if (values.base) {
    const original = new DatabaseSync(resolve(values.base), { readOnly: true })
    try { await backup(original, file) } finally { original.close() }
  }
  const db = new DatabaseSync(file)
  chmodSync(file, 0o600)
  try {
    db.exec('PRAGMA journal_mode=DELETE')
    db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS kv(tbl TEXT NOT NULL, key TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(tbl,key));
      CREATE TABLE IF NOT EXISTS meta(tbl TEXT PRIMARY KEY, record TEXT NOT NULL);
      CREATE TABLE legacy_pg_tables(
        schema_name TEXT NOT NULL, table_name TEXT NOT NULL, columns_json TEXT NOT NULL,
        row_count INTEGER NOT NULL, sha256 TEXT NOT NULL, PRIMARY KEY(schema_name,table_name)
      );
      CREATE TABLE legacy_pg_rows(
        schema_name TEXT NOT NULL, table_name TEXT NOT NULL, ordinal INTEGER NOT NULL,
        record TEXT NOT NULL, PRIMARY KEY(schema_name,table_name,ordinal)
      );
    `)
    await pgClient.connect()
    await pgClient.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const schema = String((await pgClient.query('SELECT current_schema() AS name')).rows[0]?.name)
    const snapshot = await archiveTables(db)
    const catalog = await readPgCatalog(async sql => (await pgClient.query(sql)).rows)
    const projection = projectClientData(db, schema, catalog)
    await pgClient.query('COMMIT')
    db.exec('COMMIT')
    if (db.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok') throw new Error('SQLite 完整性检查失败')
    console.log(JSON.stringify({ ...snapshot, ...projection }))
  } finally {
    db.close()
  }
  // Linking beside the destination publishes a verified file and protects any
  // existing database that appeared while the migration was running.
  linkSync(file, target)
  console.log('SQLite snapshot: ' + target)
} finally {
  await pgClient.end().catch(() => {})
  rmSync(stage, { recursive: true, force: true })
}
