// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 链式代理 / 跳板 / 固定端口：
 *   A（SOCKS5）→ B（SOCKS5，经 A 拨通）→ HTTP target
 * 同时验证 /api/proxy/pivots、/api/proxy/session、/api/proxy/fixed。
 */

import { createServer as createHttpServer } from 'node:http'
import { createServer as createNetServer, connect as netConnect, type AddressInfo, type Server } from 'node:net'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'

import { clashProxy } from './src/egress/engine.ts'
import type { NodeConfig } from './src/egress/types.ts'

const dir = await mkdtemp(join(tmpdir(), 'vexnar-egress-chain-'))
process.env.VEXNAR_EGRESS_DIR = dir

const { registerEgress, stopEgressRuntime } = await import('./src/egress/routes.ts')
const app = new Hono()
registerEgress(app)

type CheckResult = { name: string; ok: boolean; detail: string }
const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail = ''): void => {
  results.push({ name, ok, detail })
}

type Fixture = { server: Server; port: number; last: { host: string; port: number } | null }
const fixtures: Fixture[] = []

async function socks5Fixture(): Promise<Fixture> {
  const state: Fixture = { server: undefined as unknown as Server, port: 0, last: null }
  state.server = createNetServer((socket) => {
    let stage = 0
    let buffer = Buffer.alloc(0)
    socket.on('error', () => socket.destroy())
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      if (stage === 0) {
        if (buffer.length < 2) return
        socket.write(Buffer.from([5, 0]))
        buffer = buffer.subarray(2 + buffer[1])
        stage = 1
      }
      if (stage === 1) {
        if (buffer.length < 4) return
        if (buffer[3] !== 1) return socket.destroy()
        if (buffer.length < 10) return
        const host = Array.from(buffer.subarray(4, 8)).join('.')
        const port = buffer.readUInt16BE(8)
        state.last = { host, port }
        buffer = buffer.subarray(10)
        const upstream = netConnect({ host, port }, () => {
          socket.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]))
          if (buffer.length) upstream.write(buffer)
          socket.pipe(upstream)
          upstream.pipe(socket)
        })
        upstream.on('error', () => socket.destroy())
        socket.on('close', () => upstream.destroy())
        stage = 2
      }
    })
  })
  await new Promise<void>((resolve) => state.server.listen(0, '127.0.0.1', resolve))
  state.port = (state.server.address() as AddressInfo).port
  fixtures.push(state)
  return state
}

const target = createHttpServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end('chain-ok')
})
await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve))
const targetPort = (target.address() as AddressInfo).port

const first = await socks5Fixture()
const second = await socks5Fixture()

const pool = await (
  await app.request('/api/proxy/pools', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'chain', mode_default: 'sticky' })
  })
).json()

await app.request('/api/proxy/nodes/import', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: `socks5://127.0.0.1:${first.port}#A` })
})
const stateAfterA = await (await app.request('/api/proxy/state')).json()
const nodeA = stateAfterA.nodes.find((node: { name: string }) => node.name === 'A')

const pivotRes = await app.request('/api/proxy/pivots', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    name: 'B',
    protocol: 'socks5',
    server: '127.0.0.1',
    port: second.port,
    via_node_id: nodeA.id,
    pool_id: pool.id
  })
})
const pivot = await pivotRes.json()
check('跳板登记并挂到上游节点', pivotRes.status === 200 && pivot.node?.source === 'pivot' && pivot.node?.via_node_id === nodeA.id, JSON.stringify(pivot.node))

const sessionRes = await app.request('/api/proxy/session', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ task_id: 9, pool_id: pool.id, mode: 'sticky' })
})
const session = await sessionRes.json()
check('会话出口返回带凭据代理', sessionRes.status === 200 && session.proxy.includes('sess_task-9-worker') && session.proxy.includes('@'), session.proxy)

const proxyUrl = new URL(session.proxy)
const auth = `Basic ${Buffer.from(`${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`).toString('base64')}`
const chainBody = await new Promise<string>((resolve, reject) => {
  const socket = netConnect({ host: proxyUrl.hostname, port: Number(proxyUrl.port) })
  let buffer = ''
  socket.on('error', reject)
  socket.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    if (!buffer.includes('\r\n\r\n')) return
    if (!buffer.startsWith('HTTP/1.1 200')) {
      socket.on('data', (chunk: Buffer) => (buffer += chunk.toString()))
      socket.on('end', () => reject(new Error(buffer.slice(0, 500))))
      socket.on('close', () => reject(new Error(buffer.slice(0, 500))))
      return
    }
    socket.off('data', onResponse)
    socket.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`)
  })
  const onResponse = (chunk: Buffer) => {
    buffer += chunk.toString()
    if (buffer.includes('chain-ok')) {
      resolve(buffer)
      socket.destroy()
    }
  }
  socket.once('close', () => resolve(buffer))
  socket.once('connect', () => {
    socket.write(`CONNECT 127.0.0.1:${targetPort} HTTP/1.1\r\nHost: 127.0.0.1:${targetPort}\r\nProxy-Authorization: ${auth}\r\n\r\n`)
    socket.on('data', onResponse)
  })
})
check('链式代理 A→B→target 返回 200', chainBody.includes('chain-ok'), chainBody.split('\r\n')[0])
check('A 被要求拨到 B 的入口', first.last?.port === second.port && first.last?.host === '127.0.0.1', JSON.stringify(first.last))
check('B 被要求拨到目标', second.last?.port === targetPort, JSON.stringify(second.last))

const fixedRes = await app.request('/api/proxy/fixed', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ task_id: 9, pool_id: pool.id })
})
const fixed = await fixedRes.json()
const fixedBody = await new Promise<string>((resolve, reject) => {
  const socket = netConnect({ host: '127.0.0.1', port: Number(new URL(fixed.proxy).port) })
  let data = ''
  socket.on('error', reject)
  socket.on('data', (chunk: Buffer) => (data += chunk.toString()))
  socket.on('end', () => resolve(data))
  socket.once('connect', () => {
    socket.write(`GET http://127.0.0.1:${targetPort}/ HTTP/1.1\r\nHost: 127.0.0.1:${targetPort}\r\nConnection: close\r\n\r\n`)
  })
})
check('固定端口（无认证）可转发', fixedRes.status === 200 && fixedBody.includes('chain-ok'), fixed.proxy)

const closeRes = await app.request(`/api/proxy/fixed/${fixed.session}`, { method: 'DELETE' })
check('固定端口可关闭', closeRes.status === 200)

const nodeConfig = {
  name: 'x',
  protocol: 'vless',
  server: '1.1.1.1',
  port: 443,
  config: {},
  secrets: {}
} as unknown as NodeConfig
check('引擎配置写入 dialer-proxy', clashProxy(nodeConfig, 'vx-2', 7)['dialer-proxy'] === 'vx-7')

let passed = 0
for (const result of results) {
  console.log(`[${result.ok ? 'PASS' : 'FAIL'}] ${result.name}  ${result.detail}`)
  if (result.ok) passed++
}
console.log(`\n${passed}/${results.length} passed`)
await stopEgressRuntime()
first.server.close()
second.server.close()
target.close()
if (passed !== results.length) process.exitCode = 1
