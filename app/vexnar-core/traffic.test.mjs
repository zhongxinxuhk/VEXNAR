// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'

// 在 import register / context 之前把持久层指到临时 SQLite，避免污染真实 store。
const root = await mkdtemp(join(tmpdir(), 'vexnar-traffic-'))
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_STORE_ROOT = root
process.env.VEXNAR_SQLITE_PATH = join(root, 'vexnar.sqlite')

const { register, recordExchange, ingestTrafficEvidence } = await import('./src/routes/traffic.ts')
const { operations, store } = await import('./src/context.ts')

const app = new Hono()
register(app)

const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })

// 造一个 finding
await operations.writer.put({
  table: 'findings',
  key: '1',
  record: {
    id: '1', task_id: '1', node_id: '10', vulnclass: 'SQL注入', name: 'union', severity: 'high',
    status: 'confirmed', summary: 'union based', evidence: 'id=1 UNION SELECT', worker: 'tester',
    asset_ids: [], created_at_text: '2026-01-01T00:00:00+08:00'
  }
})

// 摄入证据：落 snapshot + 绑定 finding
const ingested = await ingestTrafficEvidence('1', [{
  traffic_id: 'ex-1', role: 'proof', note: 'main', captured_at: 1700000000,
  url: 'http://target.test/vuln?id=1', method: 'GET', status: 200, content_type: 'text/html',
  req_head: 'GET /vuln?id=1 HTTP/1.1\nHost: target.test\n',
  resp_head: 'HTTP 200\nContent-Type: text/html\n',
  req_body: 'GET body', resp_body: '<html>injected</html>'
}])
check('ingest creates binding + bumps version', ingested.bindings.length === 1 && ingested.version === 1, JSON.stringify({ v: ingested.version, n: ingested.bindings.length }))

// finding 流量读取（证据域：读侧走 store.traffic，读路由已在 routes.ts）
const traffic = await store.traffic('1')
check('finding traffic lists binding', traffic?.bindings?.length === 1 && traffic.bindings[0].snapshot?.method === 'GET', JSON.stringify({ n: traffic?.bindings?.length, method: traffic?.bindings?.[0]?.snapshot?.method }))

// 采集流量：大正文溢出到 blob（>256KiB）
const bigBody = Buffer.alloc(300 * 1024, 97) // 300KB 'a'
const ex = await recordExchange({
  host: 'target.test', method: 'GET', url: 'http://target.test/vuln?id=1', status: 200,
  content_type: 'text/html', req_head: 'GET /vuln HTTP/1.1\nHost: target.test\n',
  resp_head: 'HTTP 200\nContent-Type: text/html\n', req_body: 'x', resp_body: bigBody
})
check('record exchange spills blob', ex.resp_blob?.length === 64 && ex.resp_len === bigBody.length, JSON.stringify({ blob: !!ex.resp_blob, len: ex.resp_len }))

// /api/traffic 列表 + 过滤
const listRes = await app.request('/api/traffic?host=target')
const list = await listRes.json()
check('traffic list', listRes.status === 200 && list.count === 1 && list.total === 1 && list.exchanges?.length === 1 && list.exchanges[0].host === 'target.test', JSON.stringify({ count: list.count, total: list.total }))
const listMethod = await (await app.request('/api/traffic?method=GET')).json()
check('traffic filter method', listMethod.total === 1, JSON.stringify({ total: listMethod.total }))
const listKeyword = await (await app.request('/api/traffic?q=vuln')).json()
check('traffic filter keyword', listKeyword.total === 1, JSON.stringify({ total: listKeyword.total }))

// hosts 去重列表
const hosts = await (await app.request('/api/traffic/hosts')).json()
check('traffic hosts dedup', hosts.hosts?.length === 1 && hosts.hosts[0].host === 'target.test' && hosts.hosts[0].count === 1, JSON.stringify(hosts.hosts))

// exchange 详情
const exchange = await (await app.request(`/api/traffic/exchange?id=${ex.id}`)).json()
check('exchange detail', exchange.req?.includes('GET /vuln') && exchange.resp?.includes('@blob sha256:'), JSON.stringify({ req: exchange.req?.slice(0, 24) }))

// blob 读取（全量正文）
const blobRes = await app.request(`/api/traffic/blob?hash=${ex.resp_blob}`)
const blobBuf = Buffer.from(await blobRes.arrayBuffer())
check('blob read full body', blobRes.status === 200 && blobBuf.length === bigBody.length && blobBuf[0] === 97, JSON.stringify({ status: blobRes.status, len: blobBuf.length }))

// 导出 ZIP（证据域）
const exportRes = await app.request('/api/exploration/findings/1/traffic/export')
const exportBuf = Buffer.from(await exportRes.arrayBuffer())
check('export zip', exportRes.status === 200 && exportRes.headers.get('content-type') === 'application/zip' && exportBuf.length > 4 && exportBuf.readUInt32LE(0) === 0x04034b50, JSON.stringify({ status: exportRes.status, len: exportBuf.length }))

// 删除（按 host）
const del = await (await app.request('/api/traffic?host=target', { method: 'DELETE' })).json()
check('delete by host', del.deleted === 1, JSON.stringify(del))
const after = await (await app.request('/api/traffic')).json()
check('list empty after delete', after.count === 0, JSON.stringify({ count: after.count }))

let failed = false
for (const item of results) {
  if (!item.ok) failed = true
  console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`)
}
console.log(`\n${results.filter((item) => item.ok).length}/${results.length} passed`)
process.exit(failed ? 1 : 0)
