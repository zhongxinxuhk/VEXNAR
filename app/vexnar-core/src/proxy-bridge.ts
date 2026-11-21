// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 代理池（egress）跨语言桥。
 *
 * 为什么不是纯 TS：数据面是 Go —— mihomo 协议核是 Go 库，SOCKS5/HTTP 网关、会话租约、
 * 健康探测、MITM 录制、以及把出口注入 Agent 的 bash/WebFetch 都在 Go 进程里。把这些搬
 * 到 TS 等于重写协议栈，还会把 egress.db 变成双写。所以 TS 侧做的是**受控控制面桥**：
 *
 *   - 只转发契约里列出的端点（PROXY_ENDPOINTS），其余 404，不做任意路径代理；
 *   - 只接受本机页面请求（Host/Origin/Sec-Fetch-Site 校验，与 go-data 一致）；
 *   - 用每次启动的桌面令牌访问 loopback 上的 Go 引擎，令牌不出进程；
 *   - SSE（/api/proxy/events）不设总超时、不缓冲，逐块转发；
 *   - 错误语义统一：401→502（令牌不一致）、连不上→503、未知端点→404；
 *   - 响应带 `x-vexnar-egress-contract`，缺失时由 TS 补上自己的契约版本。
 *
 * Go 侧的编译与载入由 app 自己负责（`app/scripts/vexnar-go.mjs`：按源码 stamp 编译、
 * 启动、回收，见 app/docs/EGRESS-BRIDGE.md）。
 */

import {
  PROXY_CONTRACT_HEADER,
  PROXY_CONTRACT_VERSION,
  PROXY_ENDPOINTS,
  validateProxyState,
  type ProxyState
} from './proxy-contract.ts'

const loopback = new Set(['127.0.0.1', '[::1]', 'localhost'])
const PROXY_PREFIX = '/api/proxy'
const STATE_PATH = '/api/proxy/state'
const EVENTS_PATH = '/api/proxy/events'
const BRIDGE_META_PATH = '/api/proxy/_bridge'
const JSON_TIMEOUT_MS = 180_000
const PROBE_TIMEOUT_MS = 2_000

export function isProxyPath(pathname: string): boolean {
  return pathname === PROXY_PREFIX || pathname.startsWith(`${PROXY_PREFIX}/`)
}

/** 契约里的端点 → 正则；:param 匹配一个路径段。 */
const compiled = PROXY_ENDPOINTS.map((entry) => ({
  method: entry.method,
  re: new RegExp(
    '^' +
      entry.pattern
        .split('/')
        .map((seg) => (seg.startsWith(':') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        .join('/') +
      '$'
  ),
  pattern: entry.pattern
}))

function endpointAllowed(method: string, pathname: string): boolean {
  return compiled.some((entry) => entry.method === method && entry.re.test(pathname))
}

function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error, code: 'EGRESS_BRIDGE', ...extra }, { status, headers: { 'cache-control': 'no-store' } })
}

/** 与 go-data 同一把锁：只允许本机页面访问，避免被跨站页面当成代理跳板。 */
function localPeerAllowed(request: Request, localPeer: boolean): boolean {
  if (!localPeer) return false
  const host = request.headers.get('host') ?? ''
  const origin = request.headers.get('origin')
  const site = request.headers.get('sec-fetch-site')
  try {
    const hostname = new URL(`http://${host}`).hostname
    if (!loopback.has(hostname)) return false
    if (origin && new URL(origin).host !== host) return false
    if (site && site !== 'same-origin' && site !== 'none') return false
    return true
  } catch {
    return false
  }
}

/** 校验并返回 Go 引擎 origin；不通过时抛出带状态码的错误。 */
function engineOrigin(): URL {
  const raw = (process.env.VEXNAR_GO_URL || 'http://127.0.0.1:8787').trim()
  let backend: URL
  try {
    backend = new URL(raw)
  } catch {
    throw Object.assign(new Error('VEXNAR_GO_URL 不是合法 URL'), { status: 503 })
  }
  // 与 go-data 一致：只允许 loopback IP，且不允许带凭据/查询串；localhost 需要 DNS，
  // 在多网卡机器上可能解析到非回环地址，所以不接受字面量。
  if (
    !['http:', 'https:'].includes(backend.protocol) ||
    !loopback.has(backend.hostname) ||
    backend.hostname === 'localhost' ||
    backend.username ||
    backend.password
  ) {
    throw Object.assign(new Error('VEXNAR_GO_URL 必须指向 loopback IP 上的 Go 服务'), { status: 503 })
  }
  return new URL(backend.origin)
}

function desktopToken(): string {
  const token = (process.env.VEXNAR_DESKTOP_TOKEN ?? '').trim()
  if (!token) {
    throw Object.assign(new Error('客户端启动器缺少 Go 服务令牌'), { status: 503 })
  }
  return token
}

async function probeEngine(origin: URL, token: string) {
  try {
    const res = await fetch(new URL(STATE_PATH, origin), {
      headers: { 'x-vexnar-desktop-token': token },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    })
    const contract = res.headers.get(PROXY_CONTRACT_HEADER)
    if (!res.ok) return { reachable: false, status: res.status, contract: contract ?? null }
    const body = await res.json()
    return {
      reachable: true,
      status: res.status,
      contract: contract ?? null,
      problems: validateProxyState(body),
      summary: {
        enabled: (body as ProxyState).enabled,
        gateway: (body as ProxyState).gateway,
        pools: (body as ProxyState).pools?.length ?? 0,
        nodes: (body as ProxyState).nodes?.length ?? 0
      }
    }
  } catch {
    return { reachable: false, status: 0, contract: null }
  }
}

async function bridgeMeta(origin: URL, token: string): Promise<Response> {
  const probe = await probeEngine(origin, token)
  return Response.json(
    {
      contract: PROXY_CONTRACT_VERSION,
      header: PROXY_CONTRACT_HEADER,
      engine: { url: origin.origin, ...probe },
      endpoints: PROXY_ENDPOINTS,
      note:
        '数据面（mihomo/SOCKS5/HTTP 网关/租约/健康探测/MITM）由 Go 引擎持有；本桥只做受控转发。'
    },
    { headers: { 'cache-control': 'no-store', [PROXY_CONTRACT_HEADER]: String(PROXY_CONTRACT_VERSION) } }
  )
}

/**
 * 处理一个 `/api/proxy/*` 请求。返回 undefined 表示不是代理池路径（交给其他路由）。
 */
export async function proxyBridge(request: Request, localPeer: boolean): Promise<Response | undefined> {
  const url = new URL(request.url)
  if (!isProxyPath(url.pathname)) return undefined
  if (!localPeerAllowed(request, localPeer)) {
    return jsonError(403, '此接口仅供本机 VEXNAR 客户端访问')
  }

  let origin: URL
  let token: string
  try {
    origin = engineOrigin()
    token = desktopToken()
  } catch (error) {
    return jsonError((error as { status?: number }).status ?? 503, (error as Error).message)
  }

  if (url.pathname === BRIDGE_META_PATH) {
    if (request.method !== 'GET') return jsonError(405, '仅支持 GET')
    return bridgeMeta(origin, token)
  }
  if (!endpointAllowed(request.method, url.pathname)) {
    return jsonError(404, `未在契约中登记的代理池端点：${request.method} ${url.pathname}`, {
      hint: `GET ${BRIDGE_META_PATH} 查看端点清单`
    })
  }

  const sse = url.pathname === EVENTS_PATH
  const headers = new Headers({
    'x-vexnar-desktop-token': token,
    accept: sse ? 'text/event-stream' : 'application/json'
  })
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)

  try {
    const upstream = await fetch(new URL(url.pathname + url.search, origin), {
      method: request.method,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
      headers,
      redirect: 'error',
      // SSE 常驻连接不能加总超时；其余请求给订阅拉取/批量体检留足 180s。
      signal: sse ? request.signal : AbortSignal.timeout(JSON_TIMEOUT_MS)
    })
    if (upstream.status === 401) {
      return jsonError(502, 'Go 服务鉴权失败，请检查客户端与 Go 服务的启动令牌')
    }
    const out = new Headers()
    for (const key of ['content-type', 'cache-control', 'content-disposition', 'etag', PROXY_CONTRACT_HEADER]) {
      const value = upstream.headers.get(key)
      if (value) out.set(key, value)
    }
    if (!out.has(PROXY_CONTRACT_HEADER)) out.set(PROXY_CONTRACT_HEADER, String(PROXY_CONTRACT_VERSION))
    out.set('cache-control', 'no-store')
    if (sse) {
      out.set('content-type', 'text/event-stream')
      out.set('x-accel-buffering', 'no')
    }
    return new Response(upstream.body, { status: upstream.status, headers: out })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return jsonError(503, `无法连接 Go 引擎：${message}`, { engine: origin.origin })
  }
}
