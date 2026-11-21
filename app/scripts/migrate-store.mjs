// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Import a VEXNAR JSON per-record store into the single-file SQLite backend.
 *
 * The default store backend is SQLite (`kv` + `meta` tables), but a store that
 * was created by the JSON backend only has directories of `{version,record}`
 * files. Without this import the app boots against a fresh, empty SQLite file
 * and every surface reports zero tasks / findings / assets while the records
 * still sit on disk next to it.
 *
 * Layouts (see `app/vexnar-store/src`):
 *   JSON   <root>/<table>/<key>.json  = { version, record }
 *          <root>/meta.json           = { version, tables }
 *   SQLite kv(tbl, key, record) / meta(tbl, record)
 *
 * Safety: read-only on the JSON side, backs up the target file (plus its WAL and
 * SHM) before writing, upserts instead of truncating so a re-run is idempotent,
 * and prints a per-table count comparison. `--dry-run` prints the plan only.
 *
 * Usage:
 *   node scripts/migrate-store.mjs --from <store-root> [--to <sqlite>] [--meta <meta.json>] [--dry-run]
 *   node scripts/migrate-store.mjs --help
 */
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const SKIP_TABLES = new Set(['journal', 'logs', 'traffic_evidence_snapshots'])

function usage() {
  console.log(`Usage: node scripts/migrate-store.mjs --from <store-root> [options]

  --from <dir>     JSON store root (contains tasks/, findings/, meta.json).
  --to <file>      Target SQLite file. Default: <from>/vexnar.sqlite
  --meta <file>    meta.json to import. Default: <from>/meta.json when present.
  --dry-run        Report the planned import without writing.
  --help           Show this message.`)
  process.exit(0)
}

function parseArgs(argv) {
  const out = { from: '', to: '', meta: '', dryRun: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') usage()
    else if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--from') out.from = String(argv[(index += 1)] ?? '')
    else if (arg === '--to') out.to = String(argv[(index += 1)] ?? '')
    else if (arg === '--meta') out.meta = String(argv[(index += 1)] ?? '')
    else throw new Error(`unknown argument: ${arg}`)
  }
  if (out.from === '') throw new Error('--from is required')
  return out
}

/** Every `{version,record}` document under one table directory. */
function readTableRecords(directory) {
  const rows = []
  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith('.json') || name.endsWith('.tmp')) continue
    const key = name.slice(0, -'.json'.length)
    try {
      const doc = JSON.parse(readFileSync(join(directory, name), 'utf8'))
      const record = doc !== null && typeof doc === 'object' && 'record' in doc ? doc.record : doc
      rows.push({ key, record: JSON.stringify(record) })
    } catch (error) {
      // One unreadable record must not abort the import; the source stays intact.
      console.warn(`[skip] ${name}: ${error.message}`)
    }
  }
  return rows
}

function backup(target) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  for (const suffix of ['', '-wal', '-shm']) {
    const source = `${target}${suffix}`
    if (!existsSync(source)) continue
    const copy = `${source}.bak-${stamp}`
    copyFileSync(source, copy)
    console.log(`[backup] ${copy} (${statSync(copy).size}B)`)
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const from = resolve(args.from)
  if (!existsSync(from) || !statSync(from).isDirectory()) throw new Error(`--from is not a directory: ${from}`)
  const target = resolve(args.to === '' ? join(from, 'vexnar.sqlite') : args.to)
  const metaPath = resolve(args.meta === '' ? join(from, 'meta.json') : args.meta)

  const tables = readdirSync(from)
    .filter((name) => !SKIP_TABLES.has(name) && existsSync(join(from, name)) && statSync(join(from, name)).isDirectory())
    .sort()

  const planned = tables.map((table) => ({ table, rows: readTableRecords(join(from, table)) }))
  const metaTables = existsSync(metaPath)
    ? Object.entries(JSON.parse(readFileSync(metaPath, 'utf8')).tables ?? {})
    : []

  console.log(`[plan] from=${from}`)
  console.log(`[plan] to=${target}${args.dryRun ? ' (dry run)' : ''}`)
  for (const entry of planned) console.log(`[plan] ${entry.table.padEnd(28)} ${entry.rows.length} record(s)`)
  console.log(`[plan] meta tables: ${metaTables.length}${existsSync(metaPath) ? ` from ${metaPath}` : ' (no meta.json found)'}`)
  if (args.dryRun) return

  backup(target)
  const db = new DatabaseSync(target)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('CREATE TABLE IF NOT EXISTS kv (tbl TEXT NOT NULL, key TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY (tbl, key))')
  db.exec('CREATE TABLE IF NOT EXISTS meta (tbl TEXT PRIMARY KEY, record TEXT NOT NULL)')
  const upsertKv = db.prepare(
    'INSERT INTO kv(tbl, key, record) VALUES(?, ?, ?) ON CONFLICT(tbl, key) DO UPDATE SET record = excluded.record'
  )
  const upsertMeta = db.prepare(
    'INSERT INTO meta(tbl, record) VALUES(?, ?) ON CONFLICT(tbl) DO UPDATE SET record = excluded.record'
  )

  db.exec('BEGIN IMMEDIATE')
  try {
    for (const entry of planned) {
      for (const row of entry.rows) upsertKv.run(entry.table, row.key, row.record)
    }
    for (const [table, value] of metaTables) upsertMeta.run(table, JSON.stringify(value))
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  console.log('\n=== sqlite counts ===')
  let mismatches = 0
  const countKv = db.prepare('SELECT count(*) AS n FROM kv WHERE tbl = ?')
  for (const entry of planned) {
    const actual = Number(countKv.get(entry.table).n)
    const flag = actual === entry.rows.length ? 'ok' : 'MISMATCH'
    if (flag !== 'ok') mismatches += 1
    console.log(`${entry.table.padEnd(28)} json=${String(entry.rows.length).padEnd(6)} sqlite=${String(actual).padEnd(6)} ${flag}`)
  }
  const metaCount = Number(db.prepare('SELECT count(*) AS n FROM meta').get().n)
  console.log(`meta tables                  json=${String(metaTables.length).padEnd(6)} sqlite=${String(metaCount).padEnd(6)} ${metaCount >= metaTables.length ? 'ok' : 'MISMATCH'}`)
  db.close()
  if (mismatches > 0) throw new Error(`${mismatches} table(s) did not match after import`)
  console.log('\n[done] JSON store imported; the JSON files are untouched.')
}

try {
  main()
} catch (error) {
  console.error(`[error] ${error.message}`)
  process.exit(1)
}
