// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

test('settings bundle saves and resets tool documentation on the same catalog row', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vexnar-tool-doc-'))
  process.env.VEXNAR_STORE = process.env.VEXNAR_DOC_TEST_BACKEND === 'json' ? 'json' : 'sqlite'
  process.env.VEXNAR_STORE_ROOT = root
  delete process.env.VEXNAR_SQLITE_PATH
  try {
    const { meta } = await import('./src/context.ts')
    const { defaultTool, toolRowFromDefault } = await import('./src/catalog/register.ts')
    const fixture = defaultTool('add_company_scope')!
    const original = toolRowFromDefault(fixture)
    const schema = structuredClone(original.schema)
    schema.properties.logo.default = 'fixture-logo'
    await meta.save({ tools: [{ ...original, enabled: false, agents: ['retained'], schema }] })

    const bundle = new URL('../vexnar/account/lib/settings-embedded.js', import.meta.url)
    const { handleSettings } = await import(bundle.href) as typeof import('./src/settings-embedded.ts')
    const request = (path: string, method = 'GET', body?: unknown) => handleSettings(new Request(
      new URL(path, 'http://127.0.0.1'),
      { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }
    ))
    const path = '/api/tools/add_company_scope/documentation'
    const onlyRow = async () => (await (await request('/api/tools')).json() as { tools: Array<typeof original> }).tools[0]!

    const save = await request(path, 'PUT', { description: '本地说明测试', parameters: { logo: '图标说明测试' } })
    assert.equal(save.status, 200)
    const saved = await onlyRow()
    assert.equal(saved.description, '本地说明测试')
    assert.equal(saved.schema.properties.logo.description, '图标说明测试')
    assert.equal(saved.schema.properties.logo.default, 'fixture-logo')
    assert.equal(saved.enabled, false)
    assert.deepEqual(saved.agents, ['retained'])
    assert.equal((await request(path, 'PUT', { description: '只读字段测试', parameters: {}, enabled: true })).status, 400)

    const reset = await request(path + '/reset', 'POST')
    assert.equal(reset.status, 200)
    const restored = await onlyRow()
    assert.equal(restored.description, original.description)
    assert.equal(restored.schema.properties.logo.description, original.schema.properties.logo.description)
    assert.equal(restored.schema.properties.logo.default, 'fixture-logo')
    assert.equal(restored.enabled, false)
    assert.deepEqual(restored.agents, ['retained'])
    meta.reload()
    const persisted = await meta.table<Array<typeof original>>('tools')
    assert.equal(persisted[0]?.description, original.description)
    assert.equal((await request('/api/tools/missing/documentation', 'PUT', { description: '', parameters: {} })).status, 404)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
