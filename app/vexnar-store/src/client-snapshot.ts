// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { DatabaseSync } from 'node:sqlite'
import { assetRow, companyRow, findingRow, nodeRow, taskRow } from './types.ts'

type Row = Record<string, any>
const unix = (date: string | null | undefined) => date ? Math.floor(Date.parse(date) / 1000) : 0

function identity(row: Row, key = 'id'): string {
  const value = row[key]
  if ((typeof value !== 'string' || value === '') && !Number.isSafeInteger(value)) {
    throw new Error('记录的标识符不可投影：' + key)
  }
  return String(value)
}

/** Project historical data into the client store. Runtime controls remain in the archive. */
export function projectClientData(db: DatabaseSync, schema: string, catalog: Record<string, unknown>) {
  const query = db.prepare('SELECT record FROM legacy_pg_rows WHERE schema_name=? AND table_name=? ORDER BY ordinal')
  const rows = (name: string): Row[] => query.all(schema, name).map(row => JSON.parse(String(row.record)) as Row)
  const insert = db.prepare('INSERT INTO kv(tbl,key,record) VALUES(?,?,?) ON CONFLICT(tbl,key) DO NOTHING')
  let projectedRows = 0
  let keptLocal = 0

  function put(table: string, row: Row, key = identity(row)) {
    if (Number(insert.run(table, key, JSON.stringify({ ...row, rev: 1 })).changes)) projectedRows += 1
    else keptLocal += 1
  }

  for (const row of rows('tasks')) put('tasks', taskRow.parse({
    ...row, id: identity(row), created_at_text: row.created_at, created_unix: unix(row.created_at),
    completed_at_text: row.completed_at, completed_unix: unix(row.completed_at),
    archived_at_text: row.archived_at, deleted_at_text: row.deleted_at
  }))
  for (const row of rows('findings')) put('findings', findingRow.parse({
    ...row, id: identity(row), node_id: row.node_id == null ? null : identity(row, 'node_id'),
    task_id: row.task_id == null ? null : identity(row, 'task_id'), created_at_text: row.created_at
  }))
  const assets = rows('assets')
  for (const row of assets) put('assets', assetRow.parse({ ...row, task_ids: row.task_ids ?? [] }))
  const scopes = rows('company_scope')
  for (const row of rows('companies')) put('companies', companyRow.parse({
    ...row, scope: scopes.filter(scope => scope.company_id === row.id),
    asset_count: assets.filter(asset => asset.company_id === row.id).length
  }))
  for (const row of rows('exploration_nodes')) put('nodes', nodeRow.parse({ ...row, id: identity(row) }))
  for (const row of rows('exploration_edges')) put('edges',
    { ...row, src: identity(row, 'src_id'), dst: identity(row, 'dst_id') },
    JSON.stringify([row.exploration_id, row.src_id, row.dst_id, row.rel]))
  for (const row of rows('activity')) put('activity', { ...row, id: identity(row), created_unix: unix(row.created_at) })
  for (const row of rows('traffic_evidence_snapshots')) put('traffic_evidence_snapshots', { id: row.id, snapshot: row })
  for (const [table, names] of [
    ['task_relations', ['task_id', 'source_task_id']],
    ['task_asset_links', ['task_id', 'asset_id']],
    ['exploration_anchors', ['node_id', 'asset_id']]
  ] as const) {
    for (const row of rows(table)) put(table === 'exploration_anchors' ? 'anchors' : table, row,
      JSON.stringify(names.map(name => identity(row, name))))
  }
  for (const [from, to] of [
    ['task_scope', 'task_scope'], ['task_constraints', 'constraints'],
    ['finding_traffic_bindings', 'finding_traffic_bindings'],
    ['conversations', 'conversations'], ['conversation_activities', 'conversation_activities']
  ] as const) {
    for (const row of rows(from)) put(to, row)
  }

  const insertMeta = db.prepare('INSERT INTO meta(tbl,record) VALUES(?,?) ON CONFLICT(tbl) DO NOTHING')
  let projectedMetaTables = 0
  function putMeta(table: string, value: unknown) {
    if (Number(insertMeta.run(table, JSON.stringify(value)).changes)) projectedMetaTables += 1
  }

  // Preserve executable configuration and secrets in the archive. Catalog
  // rows still retain their identity, descriptions and cached tool names.
  const safe = { ...catalog }
  if (Array.isArray(safe.tools)) safe.tools = safe.tools.map(({ exec: _exec, ...row }) => row)
  if (Array.isArray(safe.mcp)) safe.mcp = safe.mcp.map(({ env: _env, ...row }) => ({ ...row, env: {} }))
  if (Array.isArray(safe.notify)) safe.notify = safe.notify.map(({ config: _config, ...row }) => ({ ...row, config: {}, enabled: false }))
  const storedSettings = db.prepare("SELECT record FROM meta WHERE tbl='settings'").get()
  const settings: Record<string, unknown> = { ...catalog.settings as Record<string, unknown>,
    ...(storedSettings ? JSON.parse(String(storedSettings.record)) as Record<string, unknown> : {}),
    catalogSeeded: true }
  delete safe.settings
  for (const [table, value] of Object.entries(safe)) putMeta(table, value)
  db.prepare("INSERT INTO meta(tbl,record) VALUES('settings',?) ON CONFLICT(tbl) DO UPDATE SET record=excluded.record")
    .run(JSON.stringify(settings))

  const rules = rows('intercept_rules')
  putMeta('intercept_rules', rules)
  putMeta('intercept_seed', [{ key: 'intercept_rules', source: 'postgres', count: rules.length }])
  if (Array.isArray(settings.intercept_enabled_tools)) putMeta('intercept_tool_config', settings.intercept_enabled_tools)
  const judge = Object.fromEntries(Object.entries(settings).filter(([key]) => key.startsWith('llm_judge_'))
    .map(([key, value]) => [key.slice('llm_judge_'.length), value]))
  if (Object.keys(judge).length > 0) putMeta('intercept_judge_config', judge)
  return { projectedRows, keptLocal, projectedMetaTables }
}
