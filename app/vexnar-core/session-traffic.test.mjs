// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'

const root = await mkdtemp(join(tmpdir(), 'vexnar-session-traffic-'))
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_STORE_ROOT = root
process.env.VEXNAR_SQLITE_PATH = join(root, 'vexnar.sqlite')
process.env.VEXNAR_INGEST_KEY = 'test-ingest-key'
// 归档流量索引（采集面写的 data/traffic/_index）在真实部署里有历史数据；测试
// 必须指向空目录，否则站点级 list/capture 会把那些行算进来。
process.env.VEXNAR_TRAFFIC_DIR = join(root, 'traffic')

const { register } = await import('./src/routes/session-traffic.ts')
const { register: registerTraffic } = await import('./src/routes/traffic.ts')
const { operations } = await import('./src/context.ts')

const app = new Hono()
register(app)
// The station-wide list lives in the traffic module; capture arms are asserted
// against its `enabled` flag, so it rides along here.
registerTraffic(app)

const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })

await operations.writer.put({
  table: 'conversations',
  key: '1',
  record: { id: '1', agent_key: 'mainagent', title: 't', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
})

const reqRaw = Buffer.from('POST /api/login HTTP/1.1\r\nHost: target.test\r\nContent-Type: application/json\r\nContent-Length: 13\r\n\r\n{"user":"a"}')
const rspRaw = Buffer.from('HTTP/1.1 201 Created\r\nContent-Type: application/json\r\nContent-Length: 11\r\n\r\n{"ok":true}')
const body = Buffer.concat([reqRaw, rspRaw])

const ingestRes = await app.request('/api/traffic/ingest', {
  method: 'POST',
  headers: {
    'x-vexnar-ingest-key': 'test-ingest-key',
    'x-flow-url': 'https://target.test/api/login',
    'x-flow-https': '1',
    'x-flow-req-len': String(reqRaw.length),
    'x-flow-scope': 'conv-1'
  },
  body
})
const ingested = await ingestRes.json()
check('ingest accepts scoped flow', ingestRes.status === 202 && ingested.seq === 1 && ingested.scope === 'conv-1', JSON.stringify(ingested))

const badKey = await app.request('/api/traffic/ingest', {
  method: 'POST',
  headers: { 'x-vexnar-ingest-key': 'nope', 'x-flow-url': 'https://x/', 'x-flow-req-len': '1' },
  body: Buffer.from('GET / HTTP/1.1\r\nHost: x\r\n\r\n')
})
check('ingest rejects bad key', badKey.status === 401, String(badKey.status))

const listRes = await app.request('/api/conversations/1/traffic?after_seq=0&limit=50')
const list = await listRes.json()
const item = list.items?.[0]
check('conversation traffic window', listRes.status === 200 && item?.seq === 1 && item?.status === 201 && item?.url === 'https://target.test/api/login', JSON.stringify(item))

const detailRes = await app.request(`/api/conversations/1/traffic/exchange?id=${item?.id}`)
const detail = await detailRes.json()
check('conversation exchange detail', detailRes.status === 200 && detail.req?.includes('POST /api/login') && detail.resp?.includes('201') && detail.resp?.includes('{"ok":true}'), JSON.stringify({ req: detail.req?.slice(0, 20) }))

const otherConv = await app.request(`/api/conversations/2/traffic/exchange?id=${item?.id}`)
check('other conversation cannot read exchange', otherConv.status === 404, String(otherConv.status))

const after = await (await app.request('/api/conversations/1/traffic?after_seq=1')).json()
check('after_seq filters consumed rows', after.items?.length === 0 && after.next_seq === 1, JSON.stringify(after))

// SSE：hello + 回放 since 之后的 flow 事件
const abort = new AbortController()
try {
  const streamRes = await app.request('/api/conversations/1/traffic/stream?since=0', { signal: abort.signal })
  const reader = streamRes.body.getReader()
  let text = ''
  const deadline = Date.now() + 4000
  while (Date.now() < deadline && !text.includes('event: flow')) {
    const { value, done } = await reader.read()
    if (done) break
    text += Buffer.from(value).toString('utf8')
  }
  check('session traffic SSE replays flow', text.includes('event: hello') && text.includes('event: flow') && text.includes('"scope":"conv-1"'), text.slice(0, 120))
} catch (e) {
  check('session traffic SSE replays flow', false, String(e?.message ?? e))
} finally {
  abort.abort()
}

const hook = await (await app.request('/api/traffic/ingest/hook')).text()
check('hook script embeds key and ingest path', hook.includes('test-ingest-key') && hook.includes('/api/traffic/ingest') && hook.includes('mirrorFilteredHTTPFlow'), hook.slice(0, 60))

// ── 会话发起的抓包 ───────────────────────────────────────────────────────
const endpointIdle = await (await app.request('/api/conversations/1/traffic/endpoint')).json()
check(
  'endpoint reports idle capture with scope hook',
  endpointIdle.enabled === false && endpointIdle.capture?.active === false && endpointIdle.capture?.items === 1
    && String(endpointIdle.hook).includes('"X-Flow-Scope":        "conv-1"'),
  JSON.stringify({ enabled: endpointIdle.enabled, items: endpointIdle.capture?.items })
)

const started = await app.request('/api/conversations/1/traffic/capture', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'start' })
})
const startBody = await started.json()
check(
  'conversation arms capture',
  started.status === 200 && startBody.enabled === true && startBody.scope === 'conv-1'
    && startBody.capture?.stopped_at === 0 && String(startBody.hook).includes('"X-Flow-Scope":        "conv-1"'),
  JSON.stringify({ enabled: startBody.enabled, scope: startBody.scope })
)

const summary = await (await app.request('/api/traffic/capture')).json()
const sessionRow = summary.sessions?.find((row) => row.scope === 'conv-1')
check(
  'capture summary lists armed conversation',
  summary.active === true && sessionRow?.items === 1 && summary.total === 1,
  JSON.stringify({ active: summary.active, sessions: summary.sessions?.length, total: summary.total })
)

const trafficFlag = await (await app.request('/api/traffic?size=5')).json()
check('traffic list enabled follows capture state', trafficFlag.enabled === true, String(trafficFlag.enabled))

// Host chat sessions use the same capture plane with a session-<id> scope.
const sessionArm = await app.request('/api/sessions/chat-abc/traffic/capture', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'start' })
})
const sessionArmBody = await sessionArm.json()
check(
  'host chat session arms its own scope',
  sessionArm.status === 200 && sessionArmBody.enabled === true && sessionArmBody.scope === 'session-chat-abc',
  JSON.stringify({ status: sessionArm.status, scope: sessionArmBody.scope })
)

const sessionEndpoint = await (await app.request('/api/sessions/chat-abc/traffic/endpoint')).json()
check(
  'session endpoint reads its own capture row',
  sessionEndpoint.enabled === true && sessionEndpoint.scope === 'session-chat-abc'
    && String(sessionEndpoint.hook).includes('"X-Flow-Scope":        "session-chat-abc"'),
  JSON.stringify({ enabled: sessionEndpoint.enabled, scope: sessionEndpoint.scope })
)

// The dsh host forwards as an in-process Fetch request, so req.url loses the
// port; the hook must still call back to the port the browser is talking to.
const hostHook = await (await app.request('/api/sessions/chat-abc/traffic/endpoint', {
  headers: { host: '127.0.0.1:3099' }
})).json()
check(
  'hook keeps the listening port from the Host header',
  String(hostHook.hook).includes('http://127.0.0.1:3099/api/traffic/ingest')
    && hostHook.ingest_url === 'http://127.0.0.1:3099/api/traffic/ingest',
  String(hostHook.ingest_url)
)

const badSession = await app.request('/api/sessions/..%2Fetc/traffic/endpoint')
check('invalid session id rejected', badSession.status === 400, String(badSession.status))

const stopped = await app.request('/api/conversations/1/traffic/capture', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'stop' })
})
const stopBody = await stopped.json()
check(
  'conversation disarms capture',
  stopped.status === 200 && stopBody.enabled === false && Number(stopBody.capture?.stopped_at) > 0,
  JSON.stringify({ enabled: stopBody.enabled, stopped_at: stopBody.capture?.stopped_at })
)

const afterStop = await (await app.request('/api/traffic/capture')).json()
check(
  'summary drops the disarmed conversation',
  afterStop.sessions?.some((row) => row.scope === 'conv-1') !== true
    && afterStop.sessions?.some((row) => row.scope === 'session-chat-abc') === true,
  JSON.stringify(afterStop.sessions?.map((row) => row.scope))
)

let passed = 0
for (const r of results) {
  console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${r.name}  ${r.detail}`)
  if (r.ok) passed++
}
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
