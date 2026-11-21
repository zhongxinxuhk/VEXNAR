// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

const routes = new Set([
  'GET /api/traffic',
  'GET /api/traffic/exchange',
  'POST /api/traffic/import/yakit',
  'POST /api/traffic/promote',
  'GET /api/assets',
  'GET /api/assets/counts',
  'POST /api/assets',
  'POST /api/yak/history'
])

export function isGoDataRequest(method: string, path: string) {
  return routes.has(`${method} ${path}`)
}

const loopback = new Set(['127.0.0.1', '[::1]', 'localhost'])

export async function goData(request: Request, localPeer: boolean): Promise<Response | undefined> {
  const url = new URL(request.url)
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
      body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
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
