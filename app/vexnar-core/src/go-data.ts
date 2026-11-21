// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { isProxyPath, proxyBridge } from './proxy-bridge.ts'

const routes = new Set(['POST /api/yak/history'])

/**
 * 把请求转给 Go 服务——默认关闭。
 *
 * 现在客户端由 TypeScript 的 core 自己回答领域接口（248/301 条在 routes* 里），
 * 数据面走 `vexnar-store` 的 PG 适配器，和 `web/` 控制台读同一份库，所以不再需要
 * Go 在环。这条转发只在对照验证时打开：`VEXNAR_GO_DATA=on`。
 *
 * 打开后这些前缀仍交给 Go：
 */
const prefixes = [
  '/api/tasks',
  '/api/exploration',
  '/api/assets',
  '/api/traffic',
  '/api/report',
  '/api/stats',
  '/api/llm/records',
  '/api/commands',
  '/api/intercept',
  '/api/yak/history'
]

/** 只有显式要求时才转发（`VEXNAR_GO_DATA=on|1|true`）。 */
const forwarding = () => /^(1|on|true|yes)$/i.test(process.env.VEXNAR_GO_DATA ?? '')

/**
 * 必须留在进程内的流量路由：会话抓包的控制面与采集面由 core 自己实现，Go 没有
 * 对应处理器。`/api/traffic` 前缀整体转发的规则会把它们一起送走并得到 404，所以
 * 先在这里排除。
 */
const coreTraffic = ['/api/traffic/capture', '/api/traffic/ingest']

function isCoreTraffic(path: string) {
  return coreTraffic.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

export function isGoDataRequest(method: string, path: string) {
  if (!forwarding()) return false
  if (isCoreTraffic(path)) return false
  if (routes.has(`${method} ${path}`)) return true
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

const loopback = new Set(['127.0.0.1', '[::1]', 'localhost'])

export async function goData(request: Request, localPeer: boolean): Promise<Response | undefined> {
  const url = new URL(request.url)
  // 代理池默认由 TS 原生实现（src/egress）；只有显式 VEXNAR_EGRESS=go 时才转给
  // Go 引擎的桥（回滚路径，保留一个版本周期）。
  if (isProxyPath(url.pathname) && (process.env.VEXNAR_EGRESS || '').toLowerCase() === 'go') {
    return proxyBridge(request, localPeer)
  }
  if (!isGoDataRequest(request.method, url.pathname)) return undefined

  const host = request.headers.get('host') ?? ''
  const origin = request.headers.get('origin')
  const site = request.headers.get('sec-fetch-site')
  try {
    if (!localPeer || !loopback.has(new URL(`http://${host}`).hostname) ||
        (origin && new URL(origin).host !== host) ||
        (site && site !== 'same-origin' && site !== 'none')) {
      return Response.json({ error: '此接口仅供本机 VEXNAR 客户端访问' }, { status: 403 })
    }
  } catch {
    return Response.json({ error: '客户端来源无效' }, { status: 403 })
  }

  const token = process.env.VEXNAR_DESKTOP_TOKEN?.trim()
  if (!token) return Response.json({ error: '客户端启动器缺少 Go 服务令牌' }, { status: 503 })

  try {
    const backend = new URL(process.env.VEXNAR_GO_URL || 'http://127.0.0.1:8787')
    if (!['http:', 'https:'].includes(backend.protocol) ||
        !loopback.has(backend.hostname) || backend.hostname === 'localhost' ||
        backend.username || backend.password) {
      return Response.json({ error: 'VEXNAR_GO_URL 必须指向 loopback IP 上的 Go 服务' }, { status: 503 })
    }
    const headers = new Headers({ 'x-vexnar-desktop-token': token })
    const contentType = request.headers.get('content-type')
    if (contentType) headers.set('content-type', contentType)
    const upstream = await fetch(new URL(url.pathname + url.search, backend.origin), {
      method: request.method,
      // PATCH/PUT/DELETE 也带正文（改发现状态、改拦截规则都走 PATCH），不能只转发 POST。
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(60_000)
    })
    if (upstream.status === 401) {
      return Response.json({ error: 'Go 服务鉴权失败，请检查客户端与 Go 服务的启动令牌' }, { status: 502 })
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' }
    })
  } catch {
    return Response.json({ error: '无法连接 Go 服务，请检查服务进程和 VEXNAR_GO_URL' }, { status: 503 })
  }
}
