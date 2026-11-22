// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { projectClientData } from './src/client-snapshot.ts'

test('client projection preserves local rows and retains legacy records without activating them', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`
      CREATE TABLE legacy_pg_rows(schema_name TEXT, table_name TEXT, ordinal INTEGER, record TEXT);
      CREATE TABLE kv(tbl TEXT, key TEXT, record TEXT, PRIMARY KEY(tbl,key));
      CREATE TABLE meta(tbl TEXT PRIMARY KEY, record TEXT);
      INSERT INTO meta VALUES ('intercept_rules', '[{"id":7,"enabled":false}]');
      INSERT INTO kv VALUES ('logs', 'local', '{"message":"from the local client"}');
    `)
    const archive = db.prepare("INSERT INTO legacy_pg_rows VALUES ('public', ?, 1, ?)")
    const date = '2026-11-22T00:00:00+00:00'
    archive.run('tasks', JSON.stringify({
      id: 17, exploration_id: 3, name: 'historical task', description: '', goal: '',
      status: 'done', paused: false, queued: false, coverage_enabled: true, created_at: date, completed_at: null
    }))
    archive.run('activity', JSON.stringify({ id: 25, exploration_id: 3, created_at: date }))
    archive.run('intercept_rules', JSON.stringify({ id: 7, enabled: true }))
    archive.run('agent_triggers', JSON.stringify({ id: 1, enabled: true }))
    const catalog = {
      mcp: [{ id: 2, tools: ['cached'], env: { SECRET: 'synthetic' } }],
      tools: [{ key: 'fixture', exec: { command: 'fixture' } }],
      settings: { intercept_enabled_tools: ['Write'] }
    }
    const result = projectClientData(db, 'public', catalog)
    assert.equal(result.projectedRows, 2)
    assert.equal(db.prepare("SELECT count(*) n FROM kv WHERE tbl='logs'").get()?.n, 1)
    assert.equal(db.prepare("SELECT record FROM meta WHERE tbl='intercept_rules'").get()?.record, '[{"id":7,"enabled":false}]')
    const object = (table: string) => JSON.parse(String(db.prepare('SELECT record FROM meta WHERE tbl=?').get(table)?.record))
    assert.deepEqual(object('mcp'), [{ id: 2, tools: ['cached'], env: {} }])
    assert.deepEqual(object('tools'), [{ key: 'fixture' }])
    assert.deepEqual(object('intercept_tool_config'), ['Write'])
    assert.equal(db.prepare("SELECT count(*) n FROM kv WHERE tbl='agent_triggers'").get()?.n, 0)
    assert.equal(db.prepare("SELECT count(*) n FROM legacy_pg_rows WHERE table_name='agent_triggers'").get()?.n, 1)
    assert.equal(projectClientData(db, 'public', catalog).keptLocal, 2)
  } finally {
    db.close()
  }
})
