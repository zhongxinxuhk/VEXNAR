// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 进程内 MITM 抓包（TS 版 go-mitmproxy）。
 *
 * - 每个 capture scope 一个回环代理端口：CONNECT 后按 host 现场签发证书做 TLS
 *   终止，明文 HTTP/1.1 转发到目标；请求/响应头与正文写入 `traffic_exchanges`
 *   （复用 routes/traffic.ts 的 recordExchange，blob 策略一致）。
 * - 仅对 443/8443 的 CONNECT 做 TLS 拦截，其它端口原样隧道（不抓）。
 * - 上游 ALPN 只谈 http/1.1；WebSocket upgrade 做透明隧道并记 101。
 * - 不做 h2 帧级抓包（与 Go 的 SslInsecure + http/1.1 行为一致，工具侧无感）。
 */

import { Agent, createServer as createHttpServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https'
import { createServer as createNetServer, connect as netConnect, isIP, type Socket } from 'node:net'
import { createServer as createTlsServer, connect as tlsConnect, type TLSSocket } from 'node:tls'

import { recordExchange, type CaptureExchange } from '../routes/traffic.ts'
import { MitmCA } from './ca.ts'

const CAPTURE_BODY_LIMIT = 5 * 1024 * 1024
// 默认对所有 CONNECT 做 TLS 拦截，只有明确的非 TLS 协议端口原样隧道。
// HTTPS 常跑在 8443/9443/自定义高位端口，白名单会漏抓；黑名单更符合预期。
const NON_TLS_PORTS = new Set([22, 25, 110, 143, 465, 587, 993, 995, 3306, 5432, 6379, 11211, 27017])
const HOP_HEADERS = new Set([
  'proxy-connection',
  'proxy-authorization',
  'proxy-authenticate',
  'connection',
  'keep-alive',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
])

export interface ScopeEndpoint {
  scope: string
  proxy: string
  caPemUrl: string
}

interface ScopeRuntime {
  scope: string
  server: ReturnType<typeof createHttpServer>
  inner: ReturnType<typeof createHttpServer>
  port: number
  targets: WeakMap<Socket, { host: string; port: number }>
}

export class MitmProxy {
  private readonly ca: MitmCA
  // 每个 CONNECT 的 TLS server 必须活到握手/连接结束，否则原生 TLS 状态可能被回收。
  private readonly tlsServers = new Set<ReturnType<typeof createTlsServer>>()
  private readonly scopes = new Map<string, ScopeRuntime>()
  private readonly caPemUrl = '/api/traffic/mitm/ca.pem'

  constructor(caDir: string) {
    this.ca = new MitmCA(caDir)
  }

  certPem(): string {
    return this.ca.certPem
  }

  async openScope(scope: string): Promise<ScopeEndpoint> {
    const key = String(scope)
    const existing = this.scopes.get(key)
    if (existing) return { scope: key, proxy: `http://127.0.0.1:${existing.port}`, caPemUrl: this.caPemUrl }
    const runtime = this.createRuntime(key)
    await new Promise<void>((resolve) => runtime.server.listen(0, '127.0.0.1', () => resolve()))
    const address = runtime.server.address()
    runtime.port = typeof address === 'object' && address ? address.port : 0
    this.scopes.set(key, runtime)
    return { scope: key, proxy: `http://127.0.0.1:${runtime.port}`, caPemUrl: this.caPemUrl }
  }

  closeScope(scope: string): void {
    const runtime = this.scopes.get(String(scope))
    if (!runtime) return
    this.scopes.delete(String(scope))
    runtime.server.close()
    runtime.inner.close()
  }

  status(): { running: boolean; scopes: { scope: string; proxy: string }[]; ca_pem_url: string } {
    return {
      running: this.scopes.size > 0,
      scopes: [...this.scopes.entries()].map(([scope, runtime]) => ({
        scope,
        proxy: `http://127.0.0.1:${runtime.port}`
      })),
      ca_pem_url: this.caPemUrl
    }
  }

  proxyFor(scope: string): string {
    const runtime = this.scopes.get(String(scope))
    return runtime ? `http://127.0.0.1:${runtime.port}` : ''
  }

  closeAll(): void {
    for (const scope of [...this.scopes.keys()]) this.closeScope(scope)
  }

  private createRuntime(scope: string): ScopeRuntime {
    const targets = new WeakMap<Socket, { host: string; port: number }>()
    const inner = createHttpServer((req, res) => {
      const target = targets.get(req.socket)
      if (!target) {
        res.writeHead(500)
        res.end('mitm: missing target')
        return
      }
      const authority = target.port === 443 ? target.host : `${target.host}:${target.port}`
      void this.handleRequest(scope, req, res, `https://${authority}${req.url ?? '/'}`, target)
    })
    inner.on('upgrade', (req, socket, head) => {
      const target = targets.get(req.socket as Socket)
      if (!target) {
        socket.destroy()
        return
      }
      void this.handleUpgrade(scope, req, socket as Socket, head, target, 'https')
    })

    const server = createHttpServer((req, res) => {
      const raw = String(req.url ?? '')
      let target: URL
      try {
        target = new URL(raw)
      } catch {
        res.writeHead(400)
        res.end('mitm: absolute URI required')
        return
      }
      const host = target.hostname
      const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80))
      void this.handleRequest(scope, req, res, target.toString(), { host, port })
    })
    server.on('connect', (req, client) => {
      const target = splitTarget(String(req.url ?? ''))
      if (!target) {
        client.end('HTTP/1.1 400 Bad Request\r\n\r\n')
        return
      }
      if (NON_TLS_PORTS.has(target.port)) {
        this.tunnel(client as Socket, target)
        return
      }
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      const tlsServer = createTlsServer(
        {
          key: this.ca.leafKeyPem,
          cert: this.ca.certFor(target.host),
          ALPNProtocols: ['http/1.1'],
          SNICallback: (name, cb) => {
            try {
              cb(null, this.ca.contextFor(name || target.host))
            } catch (error) {
              cb(error as Error)
            }
          }
        },
        (tlsSocket: TLSSocket) => {
          targets.set(tlsSocket, target)
          inner.emit('connection', tlsSocket)
        }
      )
      this.tlsServers.add(tlsServer)
      const retire = () => {
        this.tlsServers.delete(tlsServer)
        tlsServer.close()
      }
      tlsServer.on('tlsClientError', () => {
        retire()
        client.destroy()
      })
      tlsServer.on('close', retire)
      tlsServer.emit('connection', client)
    })
    server.on('upgrade', (req, socket, head) => {
      const raw = String(req.url ?? '')
      try {
        const target = new URL(raw)
        void this.handleUpgrade(
          scope,
          req,
          socket as Socket,
          head,
          { host: target.hostname, port: Number(target.port || 80) },
          'http'
        )
      } catch {
        socket.destroy()
      }
    })
    return { scope, server, inner, port: 0, targets }
  }

  private async handleRequest(
    scope: string,
    req: IncomingMessage,
    res: ServerResponse,
    url: string,
    target: { host: string; port: number }
  ): Promise<void> {
    const started = Date.now()
    const parsed = new URL(url)
    const scheme = parsed.protocol === 'https:' ? 'https' : 'http'
    const headers = filterHeaders(req.headers)
    headers.host = target.port === (scheme === 'https' ? 443 : 80) ? target.host : `${target.host}:${target.port}`
    const reqChunks: Buffer[] = []
    let reqLen = 0
    req.on('data', (chunk: Buffer) => {
      reqLen += chunk.length
      if (reqLen <= CAPTURE_BODY_LIMIT) reqChunks.push(chunk)
    })

    const upstream = await this.connectUpstream(target, scheme)
    if (!upstream) {
      res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'mitm upstream connect failed' }))
      return
    }
    const agent = scheme === 'https' ? new HttpsAgent({ keepAlive: false }) : new Agent({ keepAlive: false })
    ;(agent as unknown as { createConnection: () => Socket }).createConnection = () => upstream
    const requestFactory = scheme === 'https' ? httpsRequest : httpRequest
    const path = `${parsed.pathname}${parsed.search}`
    const upReq = requestFactory(
      {
        method: req.method,
        path,
        headers,
        agent
      },
      (upRes) => {
        const respChunks: Buffer[] = []
        let respLen = 0
        const passHeaders: Record<string, string | string[]> = {}
        for (const [key, value] of Object.entries(upRes.headers)) {
          if (value === undefined || HOP_HEADERS.has(key.toLowerCase())) continue
          passHeaders[key] = value
        }
        res.writeHead(upRes.statusCode ?? 502, passHeaders)
        upRes.on('data', (chunk: Buffer) => {
          respLen += chunk.length
          if (respLen <= CAPTURE_BODY_LIMIT) respChunks.push(chunk)
          res.write(chunk)
        })
        upRes.on('end', () => {
          res.end()
          const record: CaptureExchange = {
            host: target.host,
            method: String(req.method ?? 'GET'),
            url,
            status: upRes.statusCode ?? 0,
            content_type: String(upRes.headers['content-type'] ?? ''),
            req_head: requestHead(req),
            resp_head: responseHead(upRes),
            req_body: truncateBody(Buffer.concat(reqChunks), reqLen),
            resp_body: truncateBody(Buffer.concat(respChunks), respLen),
            scope,
            source: 'vexnar',
            duration_ms: Date.now() - started
          }
          void recordExchange(record).catch((error) => {
            console.error('[mitm] record failed:', (error as Error).message)
          })
        })
      }
    )
    upReq.on('error', (error) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'application/json' })
      }
      res.end(JSON.stringify({ error: `mitm upstream: ${error.message}` }))
    })
    req.pipe(upReq)
  }

  private async handleUpgrade(
    scope: string,
    req: IncomingMessage,
    client: Socket,
    head: Buffer,
    target: { host: string; port: number },
    scheme: 'http' | 'https'
  ): Promise<void> {
    const upstream = await this.connectUpstream(target, scheme)
    if (!upstream) {
      client.destroy()
      return
    }
    const path = String(req.url ?? '/')
    const lines = [`${req.method} ${path} HTTP/1.1`]
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
    }
    lines.push('', '')
    upstream.write(lines.join('\r\n'))
    if (head?.length) upstream.write(head)
    client.pipe(upstream)
    upstream.pipe(client)
    client.once('close', () => upstream.destroy())
    upstream.once('close', () => client.destroy())
    void recordExchange({
      host: target.host,
      method: String(req.method ?? 'GET'),
      url: `${scheme}://${target.host}:${target.port}${path}`,
      status: 101,
      content_type: '',
      req_head: requestHead(req),
      resp_head: 'HTTP 101 Switching Protocols',
      scope,
      source: 'vexnar'
    }).catch(() => {})
  }

  private connectUpstream(target: { host: string; port: number }, scheme: 'http' | 'https'): Promise<Socket | TLSSocket | null> {
    return new Promise((resolve) => {
      const socket =
        scheme === 'https'
          ? tlsConnect({
              host: target.host,
              port: target.port,
              servername: isIP(target.host) ? undefined : target.host,
              rejectUnauthorized: false,
              ALPNProtocols: ['http/1.1']
            })
          : netConnect({ host: target.host, port: target.port })
      socket.setTimeout(20_000, () => socket.destroy())
      socket.once(scheme === 'https' ? 'secureConnect' : 'connect', () => resolve(socket))
      socket.once('error', () => resolve(null))
    })
  }

  private tunnel(client: Socket, target: { host: string; port: number }): void {
    const upstream = netConnect({ host: target.host, port: target.port }, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      client.pipe(upstream)
      upstream.pipe(client)
    })
    upstream.on('error', () => client.destroy())
    client.on('error', () => upstream.destroy())
  }
}

function splitTarget(value: string): { host: string; port: number } | undefined {
  const index = value.lastIndexOf(':')
  if (index < 0) return { host: value, port: 443 }
  const host = value.slice(0, index).replace(/^\[|\]$/g, '')
  const port = Number(value.slice(index + 1))
  if (!host || !Number.isInteger(port) || port <= 0) return undefined
  return { host, port }
}

function filterHeaders(headers: IncomingMessage['headers']): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || HOP_HEADERS.has(key.toLowerCase())) continue
    out[key] = value
  }
  return out
}

function requestHead(req: IncomingMessage): string {
  const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`]
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (HOP_HEADERS.has(req.rawHeaders[i].toLowerCase())) continue
    lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
  }
  return lines.join('\n')
}

function responseHead(res: IncomingMessage): string {
  const lines = [`HTTP ${res.statusCode}`]
  for (let i = 0; i < res.rawHeaders.length; i += 2) {
    if (HOP_HEADERS.has(res.rawHeaders[i].toLowerCase())) continue
    lines.push(`${res.rawHeaders[i]}: ${res.rawHeaders[i + 1]}`)
  }
  return lines.join('\n')
}

function truncateBody(body: Buffer, total: number): Buffer {
  if (total <= CAPTURE_BODY_LIMIT || body.length <= CAPTURE_BODY_LIMIT) return body
  return Buffer.concat([body.subarray(0, CAPTURE_BODY_LIMIT), Buffer.from('\n…[truncated by mitm]')])
}
