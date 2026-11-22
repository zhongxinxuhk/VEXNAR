// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

test('embedded views and notification settings work without a running task engine', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vexnar-embedded-views-'))
  process.env.VEXNAR_STORE = 'sqlite'
  process.env.VEXNAR_STORE_ROOT = root
  process.env.VEXNAR_TRAFFIC_DIR = join(root, 'archive')
  delete process.env.VEXNAR_SQLITE_PATH
  try {
    const { meta, operations } = await import('./src/context.ts')
    await meta.save({ mcp: [{ id: 4, name: 'fixture', transport: 'stdio', tools: ['cached_name', { name: 'cached_object', description: 'fixture' }] }] })
    const task = await operations.createTask({ description: 'Fixture description', goal: 'Fixture goal', name: 'Fixture task' })
    for (const [id, ts, status] of [['older', 10, 503], ['newer', 20, 200]] as const) {
      await operations.writer.put({
        table: 'traffic_exchanges', key: id,
        record: { id, ts, status, host: 'fixture.invalid', method: 'GET', url: 'http://fixture.invalid/' }
      })
    }
    const source = new URL('../vexnar/account/lib/settings-embedded.js', import.meta.url)
    const { handleSettings } = await import(source.href) as typeof import('./src/settings-embedded.ts')
    async function request(path: string, method = 'GET', body?: object) {
      const response = await handleSettings(new Request(new URL(path, 'http://127.0.0.1'), {
        method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {})
      }))
      return { status: response.status, body: await response.json().catch(() => undefined) }
    }
    const overview = ['/api/tasks/summary', '/api/exploration/findings/stats', '/api/exploration/findings?page=1',
      '/api/assets/counts', '/api/tokens/daily', '/api/exploration/activity', '/api/agents',
      '/api/task-categories', '/api/task-templates', '/api/traffic/capture', '/api/traffic/hosts']
    for (const path of overview) assert.equal((await request(path)).status, 200, path)
    const list = await request('/api/tasks?page=1&size=1&q=fixture')
    assert.equal(list.body.total, 1)
    assert.equal(list.body.tasks[0].id, String(task.id))
    assert.equal((await request(`/api/tasks/${task.id}`)).body.name, 'Fixture task')
    const traffic = await request('/api/traffic?sort=status&order=desc')
    assert.deepEqual(traffic.body.exchanges.map((row: { id: string }) => row.id), ['older', 'newer'])
    assert.deepEqual((await request('/api/mcp/4/tools')).body.tools, [
      { name: 'cached_name', description: '' }, { name: 'cached_object', description: 'fixture' }
    ])

    const created = await request('/api/notify/channels', 'POST', {
      name: 'Fixture notification', kind: 'webhook', enabled: false, config: { url: 'https://fixture.invalid/' }
    })
    assert.equal(created.status, 201)
    const path = `/api/notify/channels/${created.body.id}`
    assert.equal((await request(path, 'PATCH', { name: 'Renamed', rate_per_min: 0 })).status, 200)
    const row = (await request('/api/notify/channels')).body.channels[0]
    assert.equal(row.name, 'Renamed')
    assert.equal(row.enabled, false)
    assert.equal(row.mode, 'realtime')
    assert.equal(row.config, undefined)
    assert.equal((await meta.table<{ config: { url: string } }[]>('notify'))[0]?.config.url, 'https://fixture.invalid/')
    assert.equal((await request(path, 'DELETE')).status, 200)
    assert.deepEqual((await request('/api/notify/channels')).body.channels, [])

    for (const path of ['/api/tasks', '/api/traffic/ingest', '/api/mcp/4/refresh', '/api/engine/tools/run']) {
      assert.equal((await request(path, 'POST', {})).status, 404, path)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
