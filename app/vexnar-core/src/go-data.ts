// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { runtimeMode } from './mode.ts'

const routes = new Set(['POST /api/yak/history'])

/**
 * 数据面前缀：任务/发现/资产/流量/拦截/用量这些领域读写。
 *
 * 这些前缀的原生实现已经在 core 里（`routes/tasks-companies.ts`、`routes/traffic.ts`、
 * `routes/intercept.ts`、`routes/exploration.ts`、`routes/llm.ts`、`routes/visibility.ts`
 * …），默认直接读 SQLite store，不再转发给 Go。
 *
 * 清单保留下来是为了「本机来源校验」：数据面只允许本机 VEXNAR 客户端访问，即使
 * `VEXNAR_RUNTIME_MODE=ts` 也照样过 `connection.requestRejection`。
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

/**
 * 必须留在进程内的流量路由：会话抓包的控制面与采集面由 core 自己实现，Go 没有
 * 对应处理器。`/api/traffic` 前缀整体转发的规则会把它们一起送走并得到 404，所以
 * 先在这里排除。
 */
const coreTraffic = ['/api/traffic/capture', '/api/traffic/ingest']

function isCoreTraffic(path: string) {
  return coreTraffic.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/** 是否属于「数据面」请求：只决定来源校验，不决定谁来回答。 */
export function isDataPlaneRequest(method: string, path: string) {
  if (isCoreTraffic(path)) return false
  if (routes.has(`${method} ${path}`)) return true
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/**
 * 历史名字保留给宿主插件（`vexnar/account/lib/index.js` 用它做本机来源校验）。
 * 语义已从「要转发给 Go」改成「属于数据面」，与 `runtimeMode()` 无关。
 */
export const isGoDataRequest = isDataPlaneRequest

const loopback = new Set(['127.0.0.1', '[::1]', 'localhost'])

/**
 * `VEXNAR_RUNTIME_MODE=go` 时的旧路径：整段转发给 Go。默认（ts）返回 undefined，
 * 由 core 自己的路由回答。
 */
export async function goData(request: Request, localPeer: boolean): Promise<Response | undefined> {
  if (runtimeMode() !== 'go') return undefined
  const url = new URL(request.url)
  if (!isDataPlaneRequest(request.method, url.pathname)) return undefined

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
