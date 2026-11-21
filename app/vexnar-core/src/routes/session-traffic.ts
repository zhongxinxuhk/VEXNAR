// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// 会话流量（Go traffic/scope+bus+server/session_traffic 的 TS 迁移）。
//
// 数据面：`traffic_exchanges` 记录新增 scope/seq/source 等归属字段；外部采集面
// （Yakit MITM hook，后续 vexnar-worker MITM）通过 POST /api/traffic/ingest 写入。
// 展示面：会话侧边栏订阅 SSE，先回放 since 之后的记录，再按 600ms 轮询补齐。
//
// 抓包是**按会话发起**的：一个 chat（VEXNAR conversation 或宿主 chat session）
// 调 POST .../traffic/capture 把 capture 记到自己 scope 上，随后只有该 scope 的
// 报文进来；概览据此判断“有没有人在抓”，而不是看全局 settings。
//
// 为什么是轮询而不是进程内事件总线：TS core 与采集进程可能分离（worker），
// 持久层才是唯一事实源；单进程内 600ms 的补齐延迟对“看请求/响应”足够，且
// 断线/重启不会丢事件。
import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { operations, store } from '../context.ts'
import { activeCaptures, captureOf, readCaptures, startCapture, stopCapture } from '../capture-state.ts'
import { mitmProxy } from '../traffic-proxy/index.ts'
import { trafficIngestAuthorized, trafficIngestKey } from '../traffic-key.ts'
import { convScope, sessionScope } from '../traffic-scope.ts'
import { exchangeDto, getExchangeRaw, listScopedExchanges, recordExchange, allExchanges } from './traffic.ts'

const MAX_INGEST_BODY = 16 << 20
const STREAM_POLL_MS = 600
const STREAM_PING_MS = 20_000
// 概览的“流量健康度”按这批最近样本算状态码/方法分布，样本太小时 0 条 4xx 也会
// 显示成成功率高得离谱；60 条足以让分布稳定，又不至于让响应变大。
const RECENT_SAMPLE = 60
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

function err(c: any, e: any) {
  return c.json({ error: String(e?.message ?? e) }, e?.name === 'StoreConflict' ? 409 : e?.status ?? 400)
}

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

async function conversationExists(id: string): Promise<boolean> {
  const rows = (await operations.writer.list('conversations')) as any[]
  return rows.some((row) => String(row.id) === String(id))
}

/** Split one raw HTTP packet at the header/body boundary without decoding the body. */
function splitPacket(raw: Buffer): { head: string; body: Buffer } {
  const crlf = raw.indexOf('\r\n\r\n')
  if (crlf >= 0) return { head: raw.subarray(0, crlf).toString('utf8'), body: raw.subarray(crlf + 4) }
  const lf = raw.indexOf('\n\n')
  if (lf >= 0) return { head: raw.subarray(0, lf).toString('utf8'), body: raw.subarray(lf + 2) }
  return { head: raw.toString('utf8'), body: Buffer.alloc(0) }
}

function parseHead(head: string) {
  const lines = head.replace(/\r\n/g, '\n').split('\n')
  const first = lines.shift() ?? ''
  const headers = new Map<string, string>()
  for (const line of lines) {
    const at = line.indexOf(':')
    if (at <= 0) continue
    headers.set(line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim())
  }
  return { first, headers }
}

function hostOnly(value: string) {
  const host = String(value ?? '').trim()
  const at = host.lastIndexOf(':')
  return at > 0 && !host.includes(']') ? host.slice(0, at) : host
}

/** Build one capture record from a mirrored raw request/response pair. */
async function ingestRaw(input: { scope: string; url: string; https: boolean; reqRaw: Buffer; respRaw: Buffer }) {
  const reqPacket = splitPacket(input.reqRaw)
  const req = parseHead(reqPacket.head)
  const start = /^([A-Z]+)\s+(\S+)\s+HTTP\//.exec(req.first)
  if (!start) throw httpError(400, '请求行无法解析')
  const method = start[1]
  const target = start[2]

  let url: URL
  try {
    url = new URL(input.url || `${input.https ? 'https' : 'http'}://${req.headers.get('host') ?? ''}${target}`)
  } catch {
    throw httpError(400, 'URL 无效')
  }
  const host = hostOnly(url.host || req.headers.get('host') || '')

  let status = 0
  let contentType = ''
  let respHead = ''
  let respBody: Buffer = Buffer.alloc(0)
  if (input.respRaw.length) {
    const respPacket = splitPacket(input.respRaw)
    const resp = parseHead(respPacket.head)
    const statusMatch = /^HTTP\/\S+\s+(\d{3})/.exec(resp.first)
    if (statusMatch) status = Number(statusMatch[1])
    contentType = resp.headers.get('content-type') ?? ''
    respHead = `HTTP ${status}\n${[...resp.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n')}`
    respBody = respPacket.body
  }

  return recordExchange({
    host,
    method,
    url: url.toString(),
    url_template: url.pathname,
    status,
    content_type: contentType,
    req_head: `${method} ${target} HTTP/1.1\n${[...req.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n')}`,
    resp_head: respHead,
    req_body: reqPacket.body,
    resp_body: respBody,
    scope: input.scope,
    source: 'yakit',
    confidence: 'exact'
  })
}

/** Metadata sample for the capture probe: item count and last exchange time. */
async function scopeSample(scope: string): Promise<{ items: number; last_ts: number }> {
  const rows = (await operations.writer.list('traffic_exchanges')) as any[]
  const scoped = rows.filter((row) => String(row.scope ?? '') === scope)
  return {
    items: scoped.length,
    last_ts: scoped.reduce((max, row) => Math.max(max, Number(row.ts ?? 0)), 0)
  }
}

/**
 * Public origin for the capture plane.
 *
 * The dsh host forwards this app as an in-process Fetch request whose URL is
 * rebuilt from a placeholder base (`http://127.0.0.1`), so `req.url` loses the
 * listening port. The mirrored request keeps the browser's Host header, which is
 * what the hook script must call back to.
 */
function originOf(c: any): string {
  const host = String(c.req.header('host') ?? '').trim()
  const proto = String(c.req.header('x-forwarded-proto') ?? '').trim() || 'http'
  if (host !== '') return `${proto}://${host}`
  try {
    return new URL(c.req.url).origin
  } catch {
    return 'http://127.0.0.1:8787'
  }
}

function capturePayload(capture: Awaited<ReturnType<typeof captureOf>>, sample: { items: number; last_ts: number }) {
  const active = capture !== null && capture.started_at > 0 && capture.stopped_at === 0
  return {
    active,
    source: capture?.source ?? '',
    started_at: capture?.started_at ?? 0,
    stopped_at: capture?.stopped_at ?? 0,
    items: sample.items,
    last_ts: sample.last_ts
  }
}

type ScopeResolver = (id: string) => Promise<string>

/**
 * Mount the per-scope traffic API under one path base. The VEXNAR conversation
 * (`/api/conversations/:id`) and the host chat session (`/api/sessions/:id`)
 * differ only in how the scope string is derived; everything else is shared so
 * the two surfaces cannot drift.
 */
function mountScopeTraffic(api: Hono, base: string, resolve: ScopeResolver) {
  // 会话流量窗口（侧边栏初次加载 / 轮询兜底）
  api.get(`${base}/traffic`, async (c) => {
    try {
      const scope = await resolve(String(c.req.param('id')))
      const afterSeq = Math.max(Number(c.req.query('after_seq') ?? 0) || 0, 0)
      const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 200) || 200, 1), 500)
      const items = await listScopedExchanges(scope, afterSeq, limit)
      const next = items.length ? Number(items[items.length - 1].seq ?? afterSeq) : afterSeq
      const capture = await captureOf(scope)
      return c.json({
        enabled: capture !== null && capture.started_at > 0 && capture.stopped_at === 0,
        scope,
        items,
        next_seq: next,
        has_more: items.length >= limit
      })
    } catch (e: any) {
      return err(c, e)
    }
  })

  // 会话流量实时流：hello → 回放 since 之后 → 增量轮询
  api.get(`${base}/traffic/stream`, async (c) => {
    let scope: string
    try {
      scope = await resolve(String(c.req.param('id')))
    } catch (e: any) {
      return err(c, e)
    }
    const since = Math.max(
      Number(c.req.header('last-event-id') ?? c.req.query('since') ?? 0) || 0,
      0
    )
    return streamSSE(c, async (stream) => {
      let stopped = false
      stream.onAbort(() => {
        stopped = true
      })
      let cursor = since
      await stream.writeSSE({
        event: 'hello',
        data: JSON.stringify({ scope, enabled: true, since, now: new Date().toISOString() })
      })
      let lastPing = Date.now()
      while (!stopped) {
        let rows: any[] = []
        try {
          rows = await listScopedExchanges(scope, cursor, 100)
        } catch {
          rows = []
        }
        for (const flow of rows) {
          await stream.writeSSE({
            id: String(flow.seq),
            event: 'flow',
            data: JSON.stringify({ seq: flow.seq, phase: 'response', flow })
          })
          cursor = Math.max(cursor, Number(flow.seq ?? 0))
        }
        if (!rows.length && Date.now() - lastPing > STREAM_PING_MS) {
          await stream.writeSSE({ event: 'ping', data: '' })
          lastPing = Date.now()
        }
        await new Promise((resolve) => setTimeout(resolve, rows.length ? 50 : STREAM_POLL_MS))
      }
    })
  })

  // 单条正文：只允许读取属于该 scope 的 exchange
  api.get(`${base}/traffic/exchange`, async (c) => {
    try {
      const scope = await resolve(String(c.req.param('id')))
      const exchangeId = String(c.req.query('id') ?? '').trim()
      if (!exchangeId) return c.json({ error: 'missing id' }, 400)
      const rows = (await operations.writer.list('traffic_exchanges')) as any[]
      const row = rows.find((item) => String(item.id) === exchangeId)
      if (!row) return c.json({ error: 'exchange 不存在' }, 404)
      if (String(row.scope ?? '') !== scope) return c.json({ error: 'exchange 不属于该会话' }, 403)
      const raw = await getExchangeRaw(exchangeId)
      if (!raw) return c.json({ error: 'exchange 不存在' }, 404)
      return c.json(raw)
    } catch (e: any) {
      return err(c, e)
    }
  })

  // 该会话的采集状态。抓包由会话自己发起（POST .../traffic/capture），
  // 这里只读：是否在抓、抓到多少、最近的流量时间，以及可直接粘贴的 hook。
  api.get(`${base}/traffic/endpoint`, async (c) => {
    try {
      const scope = await resolve(String(c.req.param('id')))
      const capture = await captureOf(scope)
      const sample = await scopeSample(scope)
      const origin = originOf(c)
      return c.json({
        enabled: capture !== null && capture.started_at > 0 && capture.stopped_at === 0,
        scope,
        proxy: mitmProxy().proxyFor(scope),
        ca_pem_url: mitmProxy().status().ca_pem_url,
        capture: capturePayload(capture, sample),
        ingest_url: `${origin}/api/traffic/ingest`,
        hook: yakitHook(scope, origin)
      })
    } catch (e: any) {
      return err(c, e)
    }
  })

  // 会话发起/停止抓包。`start` 返回该会话专属 hook（X-Flow-Scope 已填好），
  // 粘贴到 Yakit 热加载后，过滤到的报文就会带 scope 回到这个会话。
  api.post(`${base}/traffic/capture`, async (c) => {
    try {
      const scope = await resolve(String(c.req.param('id')))
      const body = await c.req.json().catch(() => ({} as any))
      const action = String(body?.action ?? 'start')
      if (action !== 'start' && action !== 'stop') return c.json({ error: 'action 只能是 start 或 stop' }, 400)
      let endpoint: { proxy: string; ca_pem_url: string } | undefined
      if (action === 'start') {
        const opened = await mitmProxy().openScope(scope)
        endpoint = { proxy: opened.proxy, ca_pem_url: opened.caPemUrl }
        await startCapture(scope, String(body?.source ?? 'yakit'))
      } else {
        mitmProxy().closeScope(scope)
        await stopCapture(scope)
      }
      const capture = await captureOf(scope)
      const sample = await scopeSample(scope)
      const origin = originOf(c)
      return c.json({
        ok: true,
        enabled: capture !== null && capture.started_at > 0 && capture.stopped_at === 0,
        scope,
        proxy: endpoint?.proxy ?? mitmProxy().proxyFor(scope),
        ca_pem_url: endpoint?.ca_pem_url ?? mitmProxy().status().ca_pem_url,
        capture,
        summary: capturePayload(capture, sample),
        ingest_url: `${origin}/api/traffic/ingest`,
        hook: yakitHook(scope, origin)
      })
    } catch (e: any) {
      return err(c, e)
    }
  })
}

export function register(api: Hono) {
  mountScopeTraffic(api, '/api/conversations/:id', async (id) => {
    if (!(await conversationExists(id))) throw httpError(404, 'conversation not found')
    return convScope(id)
  })
  mountScopeTraffic(api, '/api/sessions/:id', async (id) => {
    const trimmed = String(id ?? '').trim()
    if (!SESSION_ID.test(trimmed)) throw httpError(400, 'session id 无效')
    return sessionScope(trimmed)
  })

  // 概览用：跨会话的抓包态与最近流量。active 只看会话抓包记录，不看
  // settings.traffic_capture——那个开关管的是采集面自身，不代表有人在抓。
  // 总量与最近样本覆盖两条采集路径（客户端 kv + 采集面归档索引），否则已经
  // 抓到的历史流量在概览里显示成 0。
  api.get('/api/traffic/capture', async (c) => {
    try {
      const origin = originOf(c)
      const rows = await allExchanges()
      const byScope = new Map<string, { items: number; last_ts: number }>()
      let lastTs = 0
      for (const row of rows) {
        lastTs = Math.max(lastTs, Number(row.ts ?? 0))
        const scope = String(row.scope ?? '')
        if (scope === '') continue
        const entry = byScope.get(scope) ?? { items: 0, last_ts: 0 }
        entry.items += 1
        entry.last_ts = Math.max(entry.last_ts, Number(row.ts ?? 0))
        byScope.set(scope, entry)
      }
      const captures = await readCaptures()
      const mitm = mitmProxy().status()
      const sessions = activeCaptures(captures).map((row) => ({
        scope: row.scope,
        proxy: mitmProxy().proxyFor(row.scope),
        conv_id: row.conv_id,
        session_id: row.session_id,
        source: row.source,
        started_at: row.started_at,
        items: byScope.get(row.scope)?.items ?? 0,
        last_ts: byScope.get(row.scope)?.last_ts ?? 0
      }))
      const recent = [...rows]
        .sort((a, b) => Number(b.ts ?? 0) - Number(a.ts ?? 0))
        .slice(0, RECENT_SAMPLE)
        .map(exchangeDto)
      return c.json({
        active: sessions.length > 0,
        sessions,
        total: rows.length,
        last_ts: lastTs,
        mitm,
        ingest_url: `${origin}/api/traffic/ingest`,
        recent
      })
    } catch (e: any) {
      return err(c, e)
    }
  })

  // 外部采集面（Yakit MITM hook）回传原始报文
  api.post('/api/traffic/ingest', async (c) => {
    if (!trafficIngestAuthorized(c.req.raw.headers)) return c.json({ error: 'ingest key 无效' }, 401)
    try {
      const declared = Number(c.req.header('x-flow-req-len') ?? 0)
      const body = Buffer.from(await c.req.arrayBuffer())
      if (!body.length) return c.json({ error: '空报文' }, 400)
      if (body.length > MAX_INGEST_BODY) return c.json({ error: '报文超过单条导入上限' }, 413)
      const reqLen = Number.isFinite(declared) && declared > 0 ? declared : 0
      if (!reqLen || reqLen > body.length) return c.json({ error: 'X-Flow-Req-Len 无效' }, 400)
      let rawURL = String(c.req.header('x-flow-url') ?? '').trim()
      const b64 = String(c.req.header('x-flow-url-b64') ?? '').trim()
      if (b64) {
        try {
          rawURL = Buffer.from(b64, 'base64').toString('utf8')
        } catch {
          /* keep header value */
        }
      }
      const scope = String(c.req.header('x-flow-scope') ?? '').trim()
      const record = await ingestRaw({
        scope,
        url: rawURL,
        https: String(c.req.header('x-flow-https') ?? '') === '1',
        reqRaw: body.subarray(0, reqLen),
        respRaw: body.subarray(reqLen)
      })
      store.invalidate?.(['traffic_exchanges'])
      return c.json({ id: record.id, seq: record.seq, scope: record.scope }, 202)
    } catch (e: any) {
      return err(c, e)
    }
  })

  // 生成可粘贴到 Yakit「热加载」的镜像脚本（内嵌当前 ingest key）
  api.get('/api/traffic/ingest/hook', (c) => {
    const origin = originOf(c)
    const scope = String(c.req.query('scope') ?? '').trim()
    return new Response(yakitHook(scope, origin), {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': 'inline; filename="vexnar-mirror.yak"'
      }
    })
  })
}

/**
 * Yakit MITM 热加载脚本。`scope` 决定报文归属：`conv-12` 只进 12 号会话的
 * 侧边栏，空串是全局流量。抓包由会话发起，所以 scope 由调用方传入。
 */
export function yakitHook(scope: string, origin: string): string {
  return yakitMirrorHook
    .replaceAll('__VEXNAR_BASE__', origin)
    .replaceAll('__VEXNAR_KEY__', trafficIngestKey)
    .replaceAll('__VEXNAR_SCOPE__', String(scope ?? ''))
}

// Yakit MITM 热加载模板：只镜像过滤后的流量，不修改/阻断。
const yakitMirrorHook = `// VEXNAR × Yakit MITM 流量镜像（热加载脚本）
// 用法：Yakit → MITM → 热加载 → 粘贴本文件 → 加载。
mirrorFilteredHTTPFlow = func(isHttps, url, req, rsp) {
    if len(rsp) == 0 {
        return
    }
    headers := map[string]string{
        "Content-Type":        "application/x-vexnar-flow",
        "X-Vexnar-Ingest-Key": "__VEXNAR_KEY__",
        "X-Flow-Url":          url,
        "X-Flow-Https":        isHttps ? "1" : "0",
        "X-Flow-Req-Len":      sprintf("%d", len(req)),
        // 归到某个会话时填 conv-<id> / session-<id>；留空为全局流量。
        "X-Flow-Scope":        "__VEXNAR_SCOPE__",
    }
    body := append(req, rsp...)
    _, _ = http.Post("__VEXNAR_BASE__/api/traffic/ingest", body, headers)
}
`
