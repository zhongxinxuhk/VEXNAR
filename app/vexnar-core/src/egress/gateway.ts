// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 回环出口网关：HTTP 代理（CONNECT + absolute-URI）与 SOCKS5 入口。
 * 身份来自代理凭据（sess_<key>:<secret>），节点选择/租约/预算交给 EgressManager。
 */

import { Agent, createServer as createHttpServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createNetServer, createConnection, type Server, type Socket } from 'node:net'

import type { Dialed } from './dialer.ts'
import { EgressError, type Acquired, type EgressManager, type Route } from './manager.ts'

export interface GatewayAddresses {
  httpPort: number
  socksPort: number
}

export class EgressGateway {
  private http?: ReturnType<typeof createHttpServer>
  private socks?: Server
  private addresses: GatewayAddresses = { httpPort: 0, socksPort: 0 }
  private readonly manager: EgressManager
  private readonly fixed = new Map<string, { server: ReturnType<typeof createHttpServer>; port: number }>()

  constructor(manager: EgressManager) {
    this.manager = manager
  }

  async start(): Promise<GatewayAddresses> {
    this.http = createHttpServer((req, res) => {
      void this.forward(req, res)
    })
    this.http.on('connect', (req, client, head) => {
      void this.connect(req, client as Socket, head).catch((error) => console.error('[egress] connect failed:', error))
    })
    await listen(this.http, 0)
    this.addresses.httpPort = (this.http.address() as { port: number }).port

    this.socks = createNetServer((socket) => {
      void this.socks5(socket)
    })
    await listen(this.socks, 0)
    this.addresses.socksPort = (this.socks.address() as { port: number }).port
    this.manager.setGatewayPorts(this.addresses.httpPort, this.addresses.socksPort)
    return this.addresses
  }

  /** 无认证固定端口（浏览器/MCP 只能配置静态代理时使用）；按会话 key 复用。 */
  async openFixed(key: string): Promise<number> {
    const existing = this.fixed.get(key)
    if (existing) return existing.port
    const server = createHttpServer((req, res) => {
      void this.forward(req, res, key)
    })
    server.on('connect', (req, client, head) => {
      void this.connect(req, client as Socket, head, key).catch((error) => console.error('[egress] connect failed:', error))
    })
    await listen(server, 0)
    const port = (server.address() as { port: number }).port
    this.fixed.set(key, { server, port })
    return port
  }

  closeFixed(key: string): void {
    const entry = this.fixed.get(key)
    if (!entry) return
    this.fixed.delete(key)
    entry.server.close()
  }

  async stop(): Promise<void> {
    for (const key of [...this.fixed.keys()]) this.closeFixed(key)
    await Promise.all([
      new Promise<void>((resolve) => (this.http ? this.http.close(() => resolve()) : resolve())),
      new Promise<void>((resolve) => (this.socks ? this.socks.close(() => resolve()) : resolve()))
    ])
  }

  private async connect(req: IncomingMessage, client: Socket, head: Buffer, fixedKey?: string): Promise<void> {
    let route: Route
    try {
      route = fixedKey ? this.manager.fixedRoute(fixedKey) : this.manager.route(...basicAuth(req.headers['proxy-authorization']))
    } catch (error) {
      client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="vexnar-egress"\r\n\r\n')
      return
    }
    const target = String(req.url ?? '')
    const { host, port } = splitTarget(target)
    let acquired: Acquired
    try {
      acquired = await this.manager.acquire(route)
    } catch (error) {
      respondProxyError(client, error)
      return
    }
    try {
      const upstream = acquired.direct
        ? createConnection({ host, port })
        : await this.manager.dialTarget(acquired.node!.node, host, port)
      await connected(upstream)
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head?.length) upstream.write(head)
      let up = 0
      let down = 0
      client.on('data', (chunk: Buffer) => {
        up += chunk.length
      })
      upstream.on('data', (chunk: Buffer) => {
        down += chunk.length
      })
      client.pipe(upstream)
      upstream.pipe(client)
      const finish = (error?: Error) => {
        acquired.release(200, down, up, error)
      }
      client.once('close', () => {
        upstream.destroy()
        finish()
      })
      upstream.once('close', () => {
        client.end()
        finish()
      })
      upstream.once('error', (error) => {
        client.destroy()
        finish(error)
      })
    } catch (error) {
      acquired.release(0, 0, 0, error as Error)
      respondProxyError(client, error)
    }
  }

  private async forward(req: IncomingMessage, res: ServerResponse, fixedKey?: string): Promise<void> {
    let route: Route
    try {
      route = fixedKey ? this.manager.fixedRoute(fixedKey) : this.manager.route(...basicAuth(req.headers['proxy-authorization']))
    } catch {
      res.writeHead(407, {
        'proxy-authenticate': 'Basic realm="vexnar-egress"',
        'content-type': 'application/json; charset=utf-8'
      })
      res.end(JSON.stringify({ code: 'EGRESS_BAD_CREDENTIAL', error: '代理认证失败' }))
      return
    }
    const raw = String(req.url ?? '')
    let target: URL
    try {
      target = new URL(raw)
    } catch {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ code: 'EGRESS_NOT_PROXY_REQUEST', error: '这不是一个代理请求' }))
      return
    }
    let acquired: Acquired
    try {
      acquired = await this.manager.acquire(route)
    } catch (error) {
      respondProxyError(res, error)
      return
    }
    const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80))
    let upstream: Dialed
    try {
      upstream = acquired.direct
        ? createConnection({ host: target.hostname, port })
        : await this.manager.dialTarget(acquired.node!.node, target.hostname, port)
    } catch (error) {
      acquired.release(0, 0, 0, error as Error)
      respondProxyError(res, error)
      return
    }
    const headers = { ...req.headers }
    delete headers['proxy-authorization']
    delete headers['proxy-connection']
    headers.host = target.host
    // Node 的 http.Agent 才是 createConnection 的调用方；直接给 request 传该选项会被
    // 忽略（随后回落到直连目标，代理就“卡住”了）。用一次性 agent 注入已拨通的 socket。
    const agent = new Agent({ keepAlive: false })
    ;(agent as unknown as { createConnection: () => Socket }).createConnection = () => upstream as Socket
    const upReq = httpRequest({
      method: req.method,
      path: `${target.pathname}${target.search}`,
      headers,
      agent
    })
    let outBytes = 0
    let inBytes = 0
    req.on('data', (chunk: Buffer) => {
      outBytes += chunk.length
    })
    upReq.on('response', (upRes) => {
      const responseHeaders = { ...upRes.headers }
      delete responseHeaders.connection
      delete responseHeaders['proxy-authenticate']
      res.writeHead(upRes.statusCode ?? 502, responseHeaders)
      upRes.on('data', (chunk: Buffer) => {
        inBytes += chunk.length
      })
      upRes.pipe(res)
      upRes.once('end', () => acquired.release(upRes.statusCode ?? 0, outBytes, inBytes))
    })
    upReq.on('error', (error) => {
      acquired.release(0, outBytes, inBytes, error)
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
      }
      res.end(JSON.stringify({ code: 'EGRESS_DIAL_FAILED', error: error.message }))
    })
    req.pipe(upReq)
  }

  private socks5(socket: Socket): void {
    let stage = 0
    let buffer = Buffer.alloc(0)
    let route: Route | undefined
    const fail = (code: number) => {
      socket.write(Buffer.from([0x05, code, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
      socket.destroy()
    }
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      void (async () => {
        if (stage === 0) {
          if (buffer.length < 2) return
          const methods = buffer.subarray(2, 2 + buffer[1])
          buffer = buffer.subarray(2 + buffer[1])
          if (!methods.includes(0x02)) {
            socket.write(Buffer.from([0x05, 0xff]))
            socket.destroy()
            return
          }
          socket.write(Buffer.from([0x05, 0x02]))
          stage = 1
        }
        if (stage === 1) {
          if (buffer.length < 2) return
          const ulen = buffer[1]
          if (buffer.length < 2 + ulen + 1) return
          const user = buffer.subarray(2, 2 + ulen).toString('utf8')
          const plen = buffer[2 + ulen]
          if (buffer.length < 2 + ulen + 1 + plen) return
          const pass = buffer.subarray(2 + ulen + 1, 2 + ulen + 1 + plen).toString('utf8')
          buffer = buffer.subarray(2 + ulen + 1 + plen)
          try {
            route = this.manager.route(user, pass)
            socket.write(Buffer.from([0x01, 0x00]))
            stage = 2
          } catch {
            socket.write(Buffer.from([0x01, 0x01]))
            socket.destroy()
            return
          }
        }
        if (stage === 2) {
          if (buffer.length < 4) return
          if (buffer[0] !== 0x05 || buffer[1] !== 0x01) return fail(0x07)
          const atyp = buffer[3]
          const head = buffer.subarray(4)
          let host: string
          let offset = 0
          if (atyp === 0x01) {
            if (head.length < 4) return
            host = Array.from(head.subarray(0, 4)).join('.')
            offset = 4
          } else if (atyp === 0x03) {
            if (head.length < 1) return
            const len = head[0]
            if (head.length < 1 + len) return
            host = head.subarray(1, 1 + len).toString('utf8')
            offset = 1 + len
          } else if (atyp === 0x04) {
            if (head.length < 16) return
            const groups: string[] = []
            for (let i = 0; i < 16; i += 2) groups.push(head.readUInt16BE(i).toString(16))
            host = groups.join(':')
            offset = 16
          } else {
            return fail(0x08)
          }
          if (head.length < offset + 2) return
          const port = head.readUInt16BE(offset)
          stage = 3
          if (!route) return fail(0x01)
          const resolvedRoute = route
          // 暂停读侧并摘掉 data 监听：拨号期间到达的请求字节要留在 socket 缓冲里，
          // 否则会在 flowing 模式下被丢弃。
          socket.pause()
          socket.removeAllListeners('data')
          let acquired: Acquired
          try {
            acquired = await this.manager.acquire(resolvedRoute)
          } catch (error) {
            return fail(error instanceof EgressError && error.code === 'EGRESS_NO_NODE' ? 0x02 : 0x01)
          }
          try {
            const upstream = acquired.direct
              ? createConnection({ host, port })
              : await this.manager.dialTarget(acquired.node!.node, host, port)
            await connected(upstream)
            socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
            let up = 0
            let down = 0
            socket.on('data', (chunk: Buffer) => {
              up += chunk.length
            })
            upstream.on('data', (chunk: Buffer) => {
              down += chunk.length
            })
            socket.pipe(upstream)
            upstream.pipe(socket)
            const finish = (error?: Error) => acquired.release(200, down, up, error)
            socket.once('close', () => {
              upstream.destroy()
              finish()
            })
            upstream.once('close', () => {
              socket.destroy()
              finish()
            })
          } catch (error) {
            acquired.release(0, 0, 0, error as Error)
            fail(0x01)
          }
        }
      })()
    })
  }
}

function basicAuth(header?: string | string[]): [string, string] {
  const value = Array.isArray(header) ? header[0] : header
  if (!value?.startsWith('Basic ')) throw new Error('missing proxy auth')
  const decoded = Buffer.from(value.slice(6), 'base64').toString('utf8')
  const index = decoded.indexOf(':')
  if (index < 0) throw new Error('bad proxy auth')
  return [decoded.slice(0, index), decoded.slice(index + 1)]
}

function splitTarget(target: string): { host: string; port: number } {
  const index = target.lastIndexOf(':')
  if (index < 0) return { host: target, port: 443 }
  return { host: target.slice(0, index).replace(/^\[|\]$/g, ''), port: Number(target.slice(index + 1)) || 443 }
}

function respondProxyError(sink: Socket | ServerResponse, error: unknown): void {
  const status = error instanceof EgressError ? error.status : 502
  const code = error instanceof EgressError ? error.code : 'EGRESS_DIAL_FAILED'
  const message = (error as Error).message || '出口失败'
  if (sink instanceof Object && 'writeHead' in sink) {
    const res = sink as ServerResponse
    if (!res.headersSent) res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ code, error: message }))
    return
  }
  const socket = sink as Socket
  socket.end(
    `HTTP/1.1 ${status} Bad Gateway\r\nContent-Type: application/json; charset=utf-8\r\nConnection: close\r\n\r\n${JSON.stringify({ code, error: message })}`
  )
}

function listen(server: { listen: (port: number, host: string, cb: () => void) => unknown }, port: number): Promise<void> {
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve()))
}

function connected(socket: Socket): Promise<void> {
  if (!socket.connecting) return Promise.resolve()
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve())
    socket.once('error', reject)
  })
}

/** 供测试：直接从 manager 拿一次性端口。 */
export function gatewayPorts(gateway: EgressGateway): GatewayAddresses {
  return { ...(gateway as unknown as { addresses: GatewayAddresses }).addresses }
}
