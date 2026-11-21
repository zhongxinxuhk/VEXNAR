// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * TS MITM 采集端到端：
 *   客户端 → 本进程 MITM（现场签发证书）→ 本地 HTTPS 目标 → 记录进 traffic_exchanges。
 * 同时验证抓包会话端点返回的 proxy / ca_pem_url，以及 CA PEM 可下载。
 */

import { mkdtemp } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { createServer as createNetServer, connect as netConnect } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'

const root = await mkdtemp(join(tmpdir(), 'vexnar-mitm-'))
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_STORE_ROOT = root
process.env.VEXNAR_SQLITE_PATH = join(root, 'vexnar.sqlite')

const { register: registerTraffic, allExchanges } = await import('./src/routes/traffic.ts')
const { register: registerSessionTraffic } = await import('./src/routes/session-traffic.ts')
const { mitmProxy } = await import('./src/traffic-proxy/index.ts')
const { MitmCA } = await import('./src/traffic-proxy/ca.ts')
const { operations } = await import('./src/context.ts')

await operations.writer.put({
  table: 'conversations',
  key: '7',
  record: {
    id: '7',
    agent_key: 'mainagent',
    title: 'mitm',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z'
  }
})

const app = new Hono()
registerTraffic(app)
registerSessionTraffic(app)

const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })

// 目标 HTTPS 服务：证书由同一个 CA 签发，客户端信任 MITM CA 即可。
const ca = new MitmCA(join(root, 'origin-ca'))
const origin = createHttpsServer(
  { key: ca.leafKeyPem, cert: ca.certFor('127.0.0.1') },
  (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, path: req.url }))
  }
)
await new Promise((resolve) => origin.listen(0, '127.0.0.1', resolve))
const originPort = origin.address().port

const plainOrigin = createHttpServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ plain: true, path: req.url }))
})
await new Promise((resolve) => plainOrigin.listen(0, '127.0.0.1', resolve))
const plainPort = plainOrigin.address().port

// 通过会话抓包端点启动：返回 proxy 与 CA 下载地址。
const startRes = await app.request('/api/sessions/abcd1234/traffic/capture', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'start', source: 'vexnar' })
})
const started = await startRes.json()
check('抓包端点返回 MITM 代理', startRes.status === 200 && /^http:\/\/127\.0\.0\.1:\d+$/.test(started.proxy), started.proxy)
check('抓包端点返回 CA 地址', started.ca_pem_url === '/api/traffic/mitm/ca.pem')

const caRes = await app.request('/api/traffic/mitm/ca.pem')
const caPem = await caRes.text()
check('CA PEM 可下载', caRes.status === 200 && caPem.includes('BEGIN CERTIFICATE'), String(caRes.status))

const proxyPort = Number(new URL(started.proxy).port)

function connectThroughProxy(targetPort) {
  return new Promise((resolve, reject) => {
    const raw = netConnect({ host: '127.0.0.1', port: proxyPort })
    let buffer = ''
    const onData = (chunk) => {
      buffer += chunk.toString('latin1')
      if (!buffer.includes('\r\n\r\n')) return
      raw.off('data', onData)
      if (!buffer.startsWith('HTTP/1.1 200')) {
        reject(new Error(`CONNECT failed: ${buffer.split('\r\n')[0]}`))
        return
      }
      const tls = tlsConnect({ socket: raw, ca: caPem, servername: '127.0.0.1', ALPNProtocols: ['http/1.1'] })
      tls.once('secureConnect', () => resolve(tls))
      tls.once('error', reject)
    }
    raw.on('data', onData)
    raw.once('error', reject)
    raw.once('connect', () => {
      raw.write(`CONNECT 127.0.0.1:${targetPort} HTTP/1.1\r\nHost: 127.0.0.1:${targetPort}\r\n\r\n`)
    })
  })
}

const tls = await connectThroughProxy(originPort)
const responseText = await new Promise((resolve, reject) => {
  let data = ''
  tls.on('data', (chunk) => (data += chunk.toString()))
  tls.on('end', () => resolve(data))
  tls.once('error', reject)
  tls.write('GET /api/health?x=1 HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n')
})
check('MITM 转发 HTTPS 返回 200', responseText.includes('200 OK') && responseText.includes('"ok":true'), responseText.split('\r\n')[0])

// 明文 HTTP（absolute-URI）也抓。
const plain = await new Promise((resolve, reject) => {
  const raw = netConnect({ host: '127.0.0.1', port: proxyPort })
  let data = ''
  raw.on('data', (chunk) => (data += chunk.toString()))
  raw.on('end', () => resolve(data))
  raw.once('error', reject)
  raw.once('connect', () => {
    raw.write(
      `GET http://127.0.0.1:${plainPort}/plain?y=2 HTTP/1.1\r\nHost: 127.0.0.1:${plainPort}\r\nConnection: close\r\n\r\n`
    )
  })
})
check('MITM 转发明文 HTTP 返回 200', plain.includes('200 OK'), plain.split('\r\n')[0])

// 等待异步落库（recordExchange 在响应结束后触发）。
let rows = []
for (let i = 0; i < 50; i++) {
  rows = (await allExchanges()).filter((row) => String(row.scope ?? '').startsWith('session-abcd1234'))
  if (rows.length >= 2) break
  await new Promise((resolve) => setTimeout(resolve, 50))
}
const httpsRow = rows.find((row) => String(row.url).startsWith('https://'))
const plainRow = rows.find((row) => String(row.host) === '127.0.0.1' && String(row.url).startsWith(`http://127.0.0.1:${plainPort}`))
check('HTTPS 交换已落库并带 scope', Boolean(httpsRow) && httpsRow.status === 200 && httpsRow.req_body !== undefined, JSON.stringify({ url: httpsRow?.url, scope: httpsRow?.scope }))
check(
  '明文 HTTP 交换已落库',
  Boolean(plainRow) && plainRow.url.includes('/plain?y=2') && plainRow.method === 'GET',
  JSON.stringify({ url: plainRow?.url })
)
check('请求头与响应头已记录', Boolean(httpsRow?.req_head?.includes('GET /api/health')) && Boolean(httpsRow?.resp_head?.includes('HTTP 200')), httpsRow?.req_head ?? '')

const stopRes = await app.request('/api/sessions/abcd1234/traffic/capture', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'stop' })
})
const stopped = await stopRes.json()
check('停止抓包后代理端口关闭', stopRes.status === 200 && stopped.enabled === false && stopped.proxy === '', JSON.stringify({ enabled: stopped.enabled, proxy: stopped.proxy }))

const status = await (await app.request('/api/traffic/mitm')).json()
check('MITM 状态无残留 scope', status.running === false && status.scopes.length === 0, JSON.stringify(status))

mitmProxy().closeAll()
origin.close()
plainOrigin.close()

let passed = 0
for (const r of results) {
  console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${r.name}  ${r.detail}`)
  if (r.ok) passed++
}
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
