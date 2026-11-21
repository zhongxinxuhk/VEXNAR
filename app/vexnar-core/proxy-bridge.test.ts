// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 代理池 TS 桥的契约测试：不需要真的 Go 引擎，用一个 loopback stub 模拟
 * `/api/proxy/*`，验证转发、鉴权、SSE、错误映射与端点清单。
 *
 * 运行：node proxy-bridge.test.ts（在 app/vexnar-core 下，Node ≥ 22 自带类型擦除）
 */

import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

process.env.VEXNAR_DESKTOP_TOKEN = 'test-desktop-token'

const stub = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (req.headers['x-vexnar-desktop-token'] !== 'test-desktop-token') {
    res.writeHead(401, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'bad token' }))
    return
  }
  if (url.pathname === '/api/proxy/state') {
    res.writeHead(200, {
      'content-type': 'application/json',
      'x-vexnar-egress-contract': '1'
    })
    res.end(
      JSON.stringify({
        enabled: true,
        gateway: '127.0.0.1:19001',
        default_pool: 2,
        pools: [],
        nodes: [],
        sessions: []
      })
    )
    return
  }
  if (url.pathname === '/api/proxy/pools' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      res.writeHead(201, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ id: 7, echo: JSON.parse(body) }))
    })
    return
  }
  if (url.pathname === '/api/proxy/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: {"type":"node_health","node_id":3,"state":"up"}\n\n')
    setTimeout(() => res.end(), 50)
    return
  }
  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found' }))
})

await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve))
const enginePort = (stub.address() as AddressInfo).port
process.env.VEXNAR_GO_URL = `http://127.0.0.1:${enginePort}`

const { proxyBridge, isProxyPath } = await import('./src/proxy-bridge.ts')
const { PROXY_CONTRACT_HEADER, PROXY_CONTRACT_VERSION, PROXY_ENDPOINTS, validateProxyState } = await import(
  './src/proxy-contract.ts'
)

/** 单条自检结果：汇总循环只读 name/ok/detail 三个字段。 */
type CheckResult = { name: string; ok: boolean; detail: string }

const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail = ''): void => {
  results.push({ name, ok, detail })
}

const HOST = '127.0.0.1:8790'
const req = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
  new Request(`http://${HOST}${path}`, {
    ...init,
    headers: { host: HOST, ...(init.headers ?? {}) }
  })

// 断言用：这些路径都是 /api/proxy/*，桥必然返回 Response。
const stateRes = (await proxyBridge(req('/api/proxy/state'), true))!
const stateBody = await stateRes.json()
check('state 透传 200', stateRes.status === 200, String(stateRes.status))
check('契约头透传', stateRes.headers.get(PROXY_CONTRACT_HEADER) === '1')
check('state 形状符合契约', validateProxyState(stateBody).length === 0, JSON.stringify(validateProxyState(stateBody)))
check('default_pool 透传', stateBody.default_pool === 2)

const postRes = (await proxyBridge(
  req('/api/proxy/pools', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'hk' })
  }),
  true
))!
const postBody = await postRes.json()
check('POST 透传 201 与正文', postRes.status === 201 && postBody.echo?.name === 'hk', JSON.stringify(postBody))

check('未知端点 404', (await proxyBridge(req('/api/proxy/unknown'), true))!.status === 404)
check('非本机来源 403', (await proxyBridge(req('/api/proxy/state'), false))!.status === 403)
check('isProxyPath 只认前缀', isProxyPath('/api/proxy/state') && !isProxyPath('/api/proxyfoo'))

const sseRes = (await proxyBridge(req('/api/proxy/events'), true))!
check('SSE content-type', sseRes.headers.get('content-type') === 'text/event-stream')
check('SSE 不缓冲头', sseRes.headers.get('x-accel-buffering') === 'no')
const reader = sseRes.body!.getReader()
const first = await reader.read()
const firstText = new TextDecoder().decode(first.value)
check('SSE 首块直通', firstText.includes('data:') && firstText.includes('node_health'), firstText.trim())
await reader.cancel()

// 令牌不一致 → 502（不把 Go 的 401 原样抛给浏览器，避免看起来像登录态失效）。
process.env.VEXNAR_DESKTOP_TOKEN = 'wrong-token'
const unauth = (await proxyBridge(req('/api/proxy/state'), true))!
check('引擎 401 映射为 502', unauth.status === 502, String(unauth.status))
process.env.VEXNAR_DESKTOP_TOKEN = 'test-desktop-token'

// 引擎不可达 → 503。
process.env.VEXNAR_GO_URL = 'http://127.0.0.1:1'
const down = (await proxyBridge(req('/api/proxy/state'), true))!
check('引擎不可达 503', down.status === 503, String(down.status))

// localhost 字面量被拒绝（避免 DNS 解析到非回环地址）。
process.env.VEXNAR_GO_URL = 'http://localhost:8787'
const localhost = (await proxyBridge(req('/api/proxy/state'), true))!
check('localhost 被拒绝', localhost.status === 503, String(localhost.status))

process.env.VEXNAR_GO_URL = `http://127.0.0.1:${enginePort}`
const meta = (await proxyBridge(req('/api/proxy/_bridge'), true))!
const metaBody = await meta.json()
check('_bridge 契约版本', metaBody.contract === PROXY_CONTRACT_VERSION, JSON.stringify(metaBody.contract))
check('_bridge 探活可用', metaBody.engine?.reachable === true, JSON.stringify(metaBody.engine))
check('端点清单非空', PROXY_ENDPOINTS.length > 20 && metaBody.endpoints.length === PROXY_ENDPOINTS.length)

let passed = 0
for (const r of results) {
  console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${r.name}  ${r.detail}`)
  if (r.ok) passed++
}
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
stub.close()
