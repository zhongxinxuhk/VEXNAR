// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const { handleYakSources } = await import(new URL('../lib/yak-sources.js', import.meta.url).href) as typeof import('../src/yak-sources.ts')

test('Yak sources can be listed and replaced through the local config file', async () => {
  const home = await mkdtemp(join(tmpdir(), 'vx-yak-sources-'))
  const previousHome = process.env.VEXNAR_HOME
  const previousConfig = process.env.VEXNAR_YAK_HISTORY_CONFIG
  delete process.env.VEXNAR_YAK_HISTORY_CONFIG
  process.env.VEXNAR_HOME = home
  try {
    const call = (method: string, body?: unknown) => handleYakSources(new Request('http://127.0.0.1/api/yak/sources', {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }))

    const empty = await (await call('GET')).json()
    assert.deepEqual(empty.sources, [])
    assert.equal(empty.path, join(home, 'yak-history.json'))

    const invalid = await call('PUT', { sources: [{ name: 'a', workspace: 'relative', socket: '/tmp/s', token_file: '/tmp/t', project_id: 1 }] })
    assert.equal(invalid.status, 400)

    const saved = await call('PUT', {
      sources: [{ name: '本地 A', workspace: home, socket: join(home, 'engine.sock'), token_file: join(home, 'engine.token'), project_id: 7 }]
    })
    assert.equal(saved.status, 200)
    const payload = await saved.json()
    assert.equal(payload.sources.length, 1)
    assert.equal(payload.sources[0].project_id, 7)

    const file = await stat(join(home, 'yak-history.json'))
    assert.equal(file.mode & 0o777, 0o600)
    assert.match(await readFile(join(home, 'yak-history.json'), 'utf8'), /engine\.sock/)

    const listed = await (await call('GET')).json()
    assert.equal(listed.sources[0].name, '本地 A')
    assert.equal(listed.path, join(home, 'yak-history.json'))
  } finally {
    if (previousHome === undefined) delete process.env.VEXNAR_HOME
    else process.env.VEXNAR_HOME = previousHome
    if (previousConfig === undefined) delete process.env.VEXNAR_YAK_HISTORY_CONFIG
    else process.env.VEXNAR_YAK_HISTORY_CONFIG = previousConfig
    await rm(home, { recursive: true, force: true })
  }
})
