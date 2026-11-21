// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 归档流量索引（Go `data/traffic/_index/index.sqlite`）的只读读取。
 *
 * 概览的“流量健康度 / Top 主机”之所以能显示历史流量，靠的就是这份索引与本地
 * kv 的合并；这里固化两件事：旧 schema（没有 scope/session 列）必须能读，且
 * 正文拼装与 Go 的 `traffic.Traffic` 输出同形（inline + @blob 指针）。
 */

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { archivedExchanges, archivedRaw, archivedUpdatedAt, resetArchiveCache, trafficDir } from './src/traffic-index.ts'

type CheckResult = { name: string; ok: boolean; detail: string }

const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`, detail)
}

const root = await mkdtemp(join(tmpdir(), 'vexnar-traffic-index-'))
const index = join(root, '_index')
await mkdir(index, { recursive: true })
process.env.VEXNAR_TRAFFIC_DIR = root

// Old schema on purpose: the live index was created before `scope`/`session`
// existed, and a reader that assumes them fails exactly where the overview does.
const db = new DatabaseSync(join(index, 'index.sqlite'))
db.exec(`CREATE TABLE exchanges (
  id TEXT PRIMARY KEY, ts INTEGER, host TEXT, method TEXT, url_template TEXT, url TEXT,
  status INTEGER, content_type TEXT, req_len INTEGER, resp_len INTEGER, path TEXT)`)
db.exec(`CREATE TABLE exchange_bodies (
  id TEXT PRIMARY KEY, req_head TEXT NOT NULL DEFAULT '', req_body BLOB, req_blob TEXT,
  resp_head TEXT NOT NULL DEFAULT '', resp_body BLOB, resp_blob TEXT)`)
db.prepare('INSERT INTO exchanges VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
  'ex-1', 1795259934, 'api.test', 'GET', '/v1/users', 'https://api.test/v1/users?id=1', 200, 'application/json', 120, 512, '/v1/users'
)
db.prepare('INSERT INTO exchanges VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
  'ex-2', 1795259900, 'cdn.test', 'POST', '/upload', 'https://cdn.test/upload', 500, 'application/octet-stream', 400, 0, '/upload'
)
db.prepare('INSERT INTO exchange_bodies VALUES (?,?,?,?,?,?,?)').run(
  'ex-1', 'GET /v1/users?id=1 HTTP/1.1\nHost: api.test', Buffer.from('{"ok":true}'), '', 'HTTP/1.1 200 OK\nContent-Type: application/json', Buffer.from('{"data":[]}'), ''
)
db.prepare('INSERT INTO exchange_bodies VALUES (?,?,?,?,?,?,?)').run(
  'ex-2', 'POST /upload HTTP/1.1\nHost: cdn.test', Buffer.from([0x00, 0x01, 0x02]), 'a'.repeat(64), 'HTTP/1.1 500 Oops', null, ''
)
db.close()

resetArchiveCache()

const rows = archivedExchanges()
check('旧 schema 也能读', rows.length === 2, JSON.stringify(rows.length))
check('按 ts 倒序', rows[0]?.id === 'ex-1', rows.map((row) => row.id).join(','))
check('缺失的 scope/session 读成空串', rows.every((row) => row.scope === '' && row.session === ''))
check('字段映射', rows[0]?.host === 'api.test' && rows[0]?.status === 200 && rows[0]?.resp_len === 512, JSON.stringify(rows[0]))

const text = archivedRaw('ex-1')
check('正文可读', text !== null && text.req.includes('GET /v1/users') && text.resp.includes('{"data":[]}'), text?.req.slice(0, 40))
check('二进制正文降级为 tag', archivedRaw('ex-2')?.req.includes('[binary application/octet-stream, 3 bytes]') === true)
check('超限正文带 @blob 指针', archivedRaw('ex-2')?.req.includes(`@blob sha256:${'a'.repeat(64)}`) === true)
check('未知 id 返回 null', archivedRaw('ex-missing') === null)
check('索引 mtime 可读', archivedUpdatedAt() > 0)

// A directory without an index degrades to "no archived traffic" instead of
// failing the overview.
process.env.VEXNAR_TRAFFIC_DIR = join(root, 'empty')
await mkdir(process.env.VEXNAR_TRAFFIC_DIR, { recursive: true })
resetArchiveCache()
check('无索引时降级为空', archivedExchanges().length === 0 && archivedRaw('ex-1') === null)

delete process.env.VEXNAR_TRAFFIC_DIR
check('默认目录指向仓库 data/traffic', trafficDir().endsWith(join('data', 'traffic')), trafficDir())

await writeFile(join(root, 'keep.txt'), 'x')

const failed = results.filter((item) => !item.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
if (failed > 0) process.exit(1)
