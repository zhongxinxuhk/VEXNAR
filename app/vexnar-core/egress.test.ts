// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * TS egress 端到端：本地 SOCKS5 fixture 当节点，HTTP target 当目标，验证
 * 解析、网关（forward/CONNECT/SOCKS5）、鉴权、空池失败、对抗模式、订阅差异。
 * 不需要 Go、不需要 mihomo 二进制（socks5 走原生拨号）。
 */

import { createServer as createHttpServer } from 'node:http'
import { createServer as createNetServer, createConnection, type AddressInfo, type Server, type Socket } from 'node:net'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

import { EgressManager } from './src/egress/manager.ts'
import { EgressGateway } from './src/egress/gateway.ts'
import { fingerprint, parseInput, parseUri } from './src/egress/parse.ts'
import { clashProxy, ProtocolEngine, resolveEngineBinary, toYaml } from './src/egress/engine.ts'
import { socks5Connect } from './src/egress/dialer.ts'

/** 单条自检结果：汇总循环只读 name/ok/detail 三个字段。 */
type CheckResult = { name: string; ok: boolean; detail: string }

const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail = ''): void => {
  results.push({ name, ok, detail })
}

// ---------- fixtures ----------

async function socks5Fixture(): Promise<{ server: Server; port: number }> {
  const server = createNetServer((socket) => {
    let stage = 0
    let buffer = Buffer.alloc(0)
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      if (stage === 0) {
        if (buffer.length < 2) return
        const methods = buffer.subarray(2, 2 + buffer[1])
        if (!methods.includes(0)) {
          socket.end(Buffer.from([5, 0xff]))
          return
        }
        socket.write(Buffer.from([5, 0]))
        buffer = buffer.subarray(2 + buffer[1])
        stage = 1
      }
      if (stage === 1) {
        if (buffer.length < 4) return
        const atyp = buffer[3]
        let host
        let offset
        if (atyp === 1) {
          if (buffer.length < 8) return
          host = Array.from(buffer.subarray(4, 8)).join('.')
          offset = 8
        } else if (atyp === 3) {
          if (buffer.length < 5) return
          const len = buffer[4]
          if (buffer.length < 5 + len + 2) return
          host = buffer.subarray(5, 5 + len).toString()
          offset = 5 + len
        } else {
          socket.destroy()
          return
        }
        const port = buffer.readUInt16BE(offset)
        buffer = buffer.subarray(offset + 2)
        const upstream = createConnection({ host, port }, () => {
          socket.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]))
          if (buffer.length) upstream.write(buffer)
          socket.pipe(upstream)
          upstream.pipe(socket)
        })
        upstream.on('error', () => socket.destroy())
        stage = 2
      }
    })
    socket.on('error', () => socket.destroy())
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, port: (server.address() as AddressInfo).port }
}

function proxyRaw(
  port: number,
  payload: string,
  { waitFor = '\r\n\r\n', timeout = 5000 }: { waitFor?: string; timeout?: number } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    let data = Buffer.alloc(0)
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('proxy timeout'))
    }, timeout)
    socket.on('data', (chunk: Buffer) => {
      data = Buffer.concat([data, chunk])
      if (data.includes(waitFor)) {
        clearTimeout(timer)
        socket.destroy()
        resolve(data.toString('latin1'))
      }
    })
    socket.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    socket.on('connect', () => socket.write(payload))
  })
}

function basic(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
}

function httpGetViaProxy(port: number, url: string, auth: string): Promise<{ status: number; raw: string }> {
  const target = new URL(url)
  const request =
    `GET ${url} HTTP/1.1\r\nHost: ${target.host}\r\n` +
    (auth ? `Proxy-Authorization: ${auth}\r\n` : '') +
    'Connection: close\r\n\r\n'
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    let data = Buffer.alloc(0)
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('proxy timeout'))
    }, 5000)
    socket.on('data', (chunk: Buffer) => (data = Buffer.concat([data, chunk])))
    socket.on('end', () => {
      clearTimeout(timer)
      const raw = data.toString('latin1')
      resolve({ status: Number(raw.split(' ')[1]), raw })
    })
    socket.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    socket.on('connect', () => socket.write(request))
  })
}

function socks5ViaGateway(port: number, user: string, pass: string, host: string, targetPort: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    let stage = 0
    let buffer = Buffer.alloc(0)
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('socks timeout'))
    }, 5000)
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      if (stage === 0 && buffer.length >= 2) {
        if (buffer[1] !== 2) return reject(new Error('auth method not accepted'))
        const u = Buffer.from(user)
        const p = Buffer.from(pass)
        socket.write(Buffer.concat([Buffer.from([1, u.length]), u, Buffer.from([p.length]), p]))
        buffer = buffer.subarray(2)
        stage = 1
        return
      }
      if (stage === 1 && buffer.length >= 2) {
        if (buffer[1] !== 0) return reject(new Error('socks auth failed'))
        const name = Buffer.from(host)
        const portBuf = Buffer.alloc(2)
        portBuf.writeUInt16BE(targetPort)
        socket.write(Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, portBuf]))
        buffer = buffer.subarray(2)
        stage = 2
        return
      }
      if (stage === 2 && buffer.length >= 10) {
        if (buffer[1] !== 0) return reject(new Error(`socks connect failed ${buffer[1]}`))
        clearTimeout(timer)
        resolve(socket)
      }
    })
    socket.on('error', reject)
    socket.on('connect', () => socket.write(Buffer.from([5, 1, 2])))
  })
}

async function httpTarget(): Promise<{ server: Server; port: number }> {
  const server = createHttpServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('egress-ok')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, port: (server.address() as AddressInfo).port }
}

async function makeRuntime(nodePort: number, extra: { poolName?: string } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'vexnar-egress-'))
  const manager = new EgressManager({ dir })
  await manager.reload()
  const node = {
    ...parseUri(`socks5://127.0.0.1:${nodePort}#fixture`),
    tags: [],
    weight: 1,
    maxConns: 8,
    enabled: true,
    note: '',
    egressIp: '',
    source: '',
    createdAt: 0,
    updatedAt: 0,
    fingerprint: 'pending',
    id: 0
  }
  const fp = fingerprint(node)
  node.fingerprint = fp
  manager.store.upsertNodes([node])
  const stored = manager.store.listNodes()[0]
  const poolId = manager.store.createPool({ name: extra.poolName ?? 'p', modeDefault: 'rotate', fallback: 'block' })
  manager.store.setPoolNodes(poolId, [stored.id])
  manager.setDefaultPool(poolId)
  await manager.reload()
  const gateway = new EgressGateway(manager)
  await gateway.start()
  const endpoint = manager.endpoint({ key: 'task:1:worker', taskId: 1, mode: 'rotate' })
  return { dir, manager, gateway, node: stored, poolId, endpoint, httpPort: gatewayPort(gateway) }
}

/** addresses 在 EgressGateway 上是私有字段，测试按结构读取一次性端口。 */
function gatewayPort(gateway: EgressGateway): number {
  const addresses = /** @type {{ addresses: { httpPort: number, socksPort: number } }} */ (gateway as unknown as { addresses: { httpPort: number; socksPort: number } }).addresses
  return addresses.httpPort
}

function gatewaySocksPort(gateway: EgressGateway): number {
  const addresses = /** @type {{ addresses: { httpPort: number, socksPort: number } }} */ (gateway as unknown as { addresses: { httpPort: number; socksPort: number } }).addresses
  return addresses.socksPort
}

// ---------- tests ----------

const clash = `
proxies:
  - { name: hk-01, type: vless, server: hk.example.com, port: 443, uuid: 11111111-1111-1111-1111-111111111111,
      tls: true, servername: cdn.example.com, network: ws, ws-opts: { path: /ray } }
  - { name: ss-01, type: ss, server: ss.example.com, port: 8388, cipher: aes-128-gcm, password: pw }
`
const parsed = parseInput(clash)
check('clash YAML 解析 2 个节点', parsed.nodes.length === 2 && parsed.issues.length === 0, JSON.stringify(parsed.issues))
check('密钥字段与配置分离', Boolean(parsed.nodes[0].secrets.uuid) && !('uuid' in parsed.nodes[0].config))
const uri = parseUri('trojan://pw@tj.example.com:443?sni=cdn.example.com&type=ws&path=%2Ft#tj-01')
check('trojan URI 字段', uri.protocol === 'trojan' && uri.secrets.password === 'pw' && uri.config.network === 'ws')
const vmess = parseUri(
  'vmess://' +
    Buffer.from(
      JSON.stringify({ ps: 'vm', add: 'vm.example.com', port: '443', id: 'u-1', aid: '0', net: 'ws', tls: 'tls', path: '/ws' })
    ).toString('base64')
)
check('vmess URI 字段', vmess.protocol === 'vmess' && vmess.secrets.uuid === 'u-1' && vmess.config.tls === true)
const sub = parseInput(Buffer.from('socks5://127.0.0.1:1080#a\nsocks5://127.0.0.1:1081#b').toString('base64'))
check('base64 订阅', sub.nodes.length === 2)

const yamlText = toYaml({
  listeners: [{ name: 'n1', type: 'socks', port: 19101, listen: '127.0.0.1' }],
  proxies: [clashProxy(uri, 'vx-1')],
  rules: ['IN-NAME,n1,vx-1', 'MATCH,DIRECT']
})
const yamlDoc = parseYaml(yamlText)
check(
  'mihomo 配置 YAML 结构',
  yamlDoc.listeners[0].name === 'n1' && yamlDoc.proxies[0].name === 'vx-1' && yamlDoc.rules[0] === 'IN-NAME,n1,vx-1',
  yamlText.split('\n').slice(0, 6).join(' | ')
)

const socks = await socks5Fixture()
const target = await httpTarget()
const runtime = await makeRuntime(socks.port)
const endpointUrl = new URL(runtime.endpoint.url)
const auth = basic(endpointUrl.username, endpointUrl.password)

const ok = await httpGetViaProxy(runtime.httpPort, `http://127.0.0.1:${target.port}/`, auth)
check('forward 经节点返回 200', ok.status === 200 && ok.raw.includes('egress-ok'), String(ok.status))

const bad = await httpGetViaProxy(runtime.httpPort, `http://127.0.0.1:${target.port}/`, basic('sess_x', 'nope'))
check('错误凭据 407', bad.status === 407, String(bad.status))

const connectRaw = await proxyRaw(
  runtime.httpPort,
  `CONNECT 127.0.0.1:${target.port} HTTP/1.1\r\nHost: 127.0.0.1:${target.port}\r\nProxy-Authorization: ${auth}\r\n\r\n`
)
check('CONNECT 建立隧道', connectRaw.startsWith('HTTP/1.1 200'), connectRaw.split('\r\n')[0])

const socksSocket = await socks5ViaGateway(
  gatewaySocksPort(runtime.gateway),
  endpointUrl.username,
  endpointUrl.password,
  '127.0.0.1',
  target.port
)
const socksBody = await new Promise<string>((resolve) => {
  let data = ''
  socksSocket.on('data', (chunk: Buffer) => (data += chunk.toString()))
  socksSocket.on('end', () => resolve(data))
  socksSocket.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`)
})
check('SOCKS5 入站返回 200', socksBody.includes('200 OK') && socksBody.includes('egress-ok'))

// 空池：失败关闭，不直连。
runtime.manager.store.setPoolNodes(runtime.poolId, [])
await runtime.manager.reload()
const empty = await httpGetViaProxy(runtime.httpPort, `http://127.0.0.1:${target.port}/`, auth)
check('空池 502（失败关闭）', empty.status === 502, String(empty.status))

// 对抗模式：一个坏节点 + 一个可用节点，胜出者必须是可用节点。
const dead = createNetServer()
await new Promise<void>((resolve) => dead.listen(0, '127.0.0.1', resolve))
const deadPort = (dead.address() as AddressInfo).port
await new Promise<void>((resolve) => dead.close(() => resolve()))
const deadNode = {
  ...parseUri(`socks5://127.0.0.1:${deadPort}#dead`),
  tags: [],
  weight: 1,
  maxConns: 4,
  enabled: true,
  note: '',
  egressIp: '',
  source: '',
  createdAt: 0,
  updatedAt: 0,
  fingerprint: 'dead',
  id: 0
}
deadNode.fingerprint = fingerprint(deadNode)
runtime.manager.store.upsertNodes([deadNode])
const deadStored = runtime.manager.store.listNodes().find((n) => n.name === 'dead')!
const liveStored = runtime.manager.store.listNodes().find((n) => n.name === 'fixture')!
runtime.manager.store.setPoolNodes(runtime.poolId, [liveStored.id, deadStored.id])
await runtime.manager.reload()
const fanout = await runtime.manager.fanout(`task:1:worker`, 'GET', `http://127.0.0.1:${target.port}/`, { k: 2 })
check(
  'fanout 选择可用节点',
  !fanout.blocked && fanout.winner_node === liveStored.id && fanout.attempts.some((a) => a.error),
  JSON.stringify(fanout.attempts)
)

// 订阅差异：A,B → A,C
const subServer = createHttpServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end(subBody)
})
let subBody = 'proxies:\n  - { name: A, type: socks5, server: 10.0.0.1, port: 1080 }\n  - { name: B, type: socks5, server: 10.0.0.2, port: 1080 }\n'
await new Promise<void>((resolve) => subServer.listen(0, '127.0.0.1', resolve))
const subId = runtime.manager.store.saveSubscription({
  name: 'sub',
  url: `http://127.0.0.1:${(subServer.address() as AddressInfo).port}/`,
  poolId: runtime.poolId,
  intervalSeconds: 3600,
  enabled: true
})
const first = await runtime.manager.refreshSubscription(subId)
subBody = 'proxies:\n  - { name: A, type: socks5, server: 10.0.0.1, port: 1080 }\n  - { name: C, type: socks5, server: 10.0.0.3, port: 1080 }\n'
const second = await runtime.manager.refreshSubscription(subId)
check('订阅差异 +1/-1', first.added === 2 && second.added === 1 && second.removed === 1, JSON.stringify(second))

const state = runtime.manager.state() as {
  enabled: unknown
  pools: unknown[]
  nodes: unknown[]
  sessions: unknown[]
}
check(
  'state 形状',
  state.enabled === true && Array.isArray(state.pools) && Array.isArray(state.nodes) && Array.isArray(state.sessions),
  `pools=${state.pools.length} nodes=${state.nodes.length}`
)

// 协议引擎缺失时，非 socks5/http 明确报错而不是静默直连。
const vlessNode = { ...parseUri('vless://u@127.0.0.1:443?security=tls'), id: 0 }
let unsupported = ''
try {
  const { dialNode } = await import('./src/egress/dialer.ts')
  await dialNode(vlessNode, runtime.manager.engine, '127.0.0.1', 80, 1000)
} catch (error) {
  unsupported = error instanceof Error ? error.message : String(error)
}
check('引擎缺失时协议显式报错', unsupported.includes('mihomo'), unsupported)

// 协议引擎（可选）：有 mihomo 二进制时，验证 config 生成 + 进程托管 + 本地 SOCKS 入口。
const engineBinary = resolveEngineBinary()
if (engineBinary && (await import('node:fs')).existsSync(engineBinary)) {
  const engine = new ProtocolEngine({ binary: engineBinary, workDir: await mkdtemp(join(tmpdir(), 'vexnar-engine-')) })
  const engineNode = { ...parseUri(`socks5://127.0.0.1:${socks.port}#engine-node`), id: 91 }
  await engine.reconcile([engineNode])
  const enginePort = engine.portFor(91) as number
  check('mihomo 启动并分配监听端口', typeof enginePort === 'number' && enginePort > 0, String(enginePort))
  const viaEngine = await socks5Connect({ proxyHost: '127.0.0.1', proxyPort: enginePort, host: '127.0.0.1', port: target.port })
  const engineBody = await new Promise<string>((resolve) => {
    let data = ''
    viaEngine.on('data', (chunk: Buffer) => (data += chunk.toString()))
    viaEngine.on('end', () => resolve(data))
    viaEngine.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`)
  })
  check('经 mihomo 的 SOCKS 入口返回 200', engineBody.includes('200 OK') && engineBody.includes('egress-ok'), engineBody.split('\r\n')[0])
  await engine.stop()
} else {
  console.log('[SKIP] 未找到 mihomo 二进制，跳过协议引擎测试（node scripts/fetch-mihomo.ts）')
}

await runtime.gateway.stop()
await runtime.manager.stop()
socks.server.close()
target.server.close()
subServer.close()

let passed = 0
for (const r of results) {
  console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${r.name}  ${r.detail}`)
  if (r.ok) passed++
}
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
