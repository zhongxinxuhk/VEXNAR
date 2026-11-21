// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from 'hono'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 必须在加载 context.ts 之前设定临时存储根，这样三份模块共用的 store/meta 都
// 落到一次性 SQLite 目录里，互不干扰也不会污染真实数据。
const root = await mkdtemp(join(tmpdir(), 'vexnar-ws-test-'))
process.env.VEXNAR_STORE_ROOT = root
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_VERSION = '0.1.0'
process.env.VEXNAR_UPDATE_TIMEOUT_MS = '1500'

const { register: registerWorkspace } = await import('./src/routes/workspace.ts')
const { register: registerSync } = await import('./src/routes/sync.ts')
const { register: registerUpdate } = await import('./src/routes/update.ts')

const app = new Hono()
registerWorkspace(app)
registerSync(app)
registerUpdate(app)

const get = (path) => app.request(path)
const post = (path, body, headers) =>
  app.request(path, { method: 'POST', headers: headers ?? { 'content-type': 'application/json' }, body })

const routes = app.routes
assert.equal(routes.length, 16, `期望 16 条路由，实际 ${routes.length} 条`)

// ── workspace 写 / 读 / 列 ────────────────────────────────────────────────
let res = await post('/api/workspace/write', JSON.stringify({ path: 'a/b.txt', content: 'hello vexnar' }))
assert.equal(res.status, 200, 'write 应返回 200')
assert.equal((await res.json()).ok, true)

res = await get('/api/workspace/read?path=a/b.txt')
assert.equal(res.status, 200, 'read 应返回 200')
const readBody = await res.json()
assert.equal(readBody.content, 'hello vexnar')
assert.equal(readBody.binary, false)

res = await get('/api/workspace/list?path=')
assert.equal(res.status, 200, 'list 应返回 200')
const listBody = await res.json()
assert.ok(listBody.entries.some((e) => e.name === 'a' && e.dir === true), 'list 应包含目录 a')

// 路径穿越被 neutralise（".." 塌缩到工作区根内，而不是逃逸到宿主文件系统）
res = await post('/api/workspace/write', JSON.stringify({ path: '../escape.txt', content: 'trapped' }))
assert.equal(res.status, 200, 'neutralise 后的写入应成功')
assert.equal((await res.json()).path, 'escape.txt', '.. 应被折叠为根内路径')
res = await get('/api/workspace/read?path=escape.txt')
assert.equal((await res.json()).content, 'trapped', 'neutralise 后的文件应落在工作区内')

// ── sync 列表（未配置数据源时应如实报告） ────────────────────────────────
res = await get('/api/sync/scopesentry/status')
assert.equal(res.status, 200, 'sync status 应返回 200')
const statusBody = await res.json()
assert.equal(statusBody.exists, false, '未配置时 exists 应为 false')

res = await get('/api/sync/scopesentry/projects')
assert.equal(res.status, 502, '无数据源时 projects 应返回 502')

// ── update check ─────────────────────────────────────────────────────────
res = await get('/api/update/check')
assert.equal(res.status, 200, 'update check 应返回 200')
const updateBody = await res.json()
assert.equal(updateBody.current, '0.1.0')
assert.equal(updateBody.repo, 'zhongxinxuhk/vexnar')
assert.equal(typeof updateBody.has_backup, 'boolean')

console.log('OK — routes:', routes.length)
console.log('workspace write/read/list + path traversal guard: pass')
console.log('sync status/projects list: pass')
console.log('update check: pass')

await rm(root, { recursive: true, force: true }).catch(() => {})
