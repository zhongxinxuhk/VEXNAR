// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 节点拨号：socks5/http 原生实现（Node 内置），其余协议经协议引擎的本地 SOCKS
 * 入口。返回已连通的 net.Socket，上层网关只做字节转发。
 */

import { createConnection, type Socket } from 'node:net'
import { connect as tlsConnect, type TLSSocket } from 'node:tls'

import type { ProtocolEngine } from './engine.ts'
import type { NodeConfig } from './types.ts'

export type Dialed = Socket | TLSSocket

const CONNECT_TIMEOUT = 20_000

export async function dialNode(
  node: NodeConfig & { id?: number },
  engine: ProtocolEngine,
  host: string,
  port: number,
  timeoutMs = CONNECT_TIMEOUT
): Promise<Dialed> {
  const enginePort = node.id !== undefined ? engine.portFor(node.id) : undefined
  if (enginePort) {
    return socks5Connect({ proxyHost: '127.0.0.1', proxyPort: enginePort, host, port, timeoutMs })
  }
  if (node.protocol === 'socks5' || node.protocol === 'http') {
    const username = typeof node.config.username === 'string' ? node.config.username : undefined
    const password = node.secrets.password
    if (node.protocol === 'socks5') {
      return socks5Connect({
        proxyHost: node.server,
        proxyPort: node.port,
        host,
        port,
        username,
        password,
        timeoutMs
      })
    }
    return httpConnect({
      proxyHost: node.server,
      proxyPort: node.port,
      host,
      port,
      username,
      password,
      tls: node.config.tls === true,
      timeoutMs
    })
  }
  throw new Error(
    `协议 ${node.protocol} 需要协议引擎（mihomo）；未配置 VEXNAR_MIHOMO_BIN 时仅 socks5/http 可用`
  )
}

export interface Socks5Options {
  proxyHost: string
  proxyPort: number
  host: string
  port: number
  username?: string
  password?: string
  timeoutMs?: number
}

export function socks5Connect(options: Socks5Options): Promise<Socket> {
  const timeout = options.timeoutMs ?? CONNECT_TIMEOUT
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: options.proxyHost, port: options.proxyPort })
    const reader = new SocketReader(socket)
    let settled = false
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      reader.detach()
      socket.destroy()
      reject(error)
    }
    const timer = setTimeout(() => fail(new Error(`连接代理 ${options.proxyHost}:${options.proxyPort} 超时`)), timeout)
    socket.once('error', (error) => {
      clearTimeout(timer)
      fail(error)
    })
    socket.once('connect', () => {
      const wantsAuth = Boolean(options.username)
      const methods = wantsAuth ? [0x00, 0x02] : [0x00]
      socket.write(Buffer.from([0x05, methods.length, ...methods]))
      void (async () => {
        const greeting = await reader.read(2)
        if (greeting[0] !== 0x05) throw new Error('SOCKS5 版本不匹配')
        if (greeting[1] === 0x02) {
          const user = Buffer.from(options.username ?? '', 'utf8')
          const pass = Buffer.from(options.password ?? '', 'utf8')
          socket.write(Buffer.concat([Buffer.from([0x01, user.length]), user, Buffer.from([pass.length]), pass]))
          const auth = await reader.read(2)
          if (auth[1] !== 0x00) throw new Error('SOCKS5 代理认证失败')
        } else if (greeting[1] !== 0x00) {
          throw new Error(`SOCKS5 代理不接受认证方式：${greeting[1]}`)
        }
        socket.write(buildSocks5Request(options.host, options.port))
        const head = await reader.read(4)
        if (head[1] !== 0x00) throw new Error(`SOCKS5 CONNECT 失败：code=${head[1]}`)
        const atyp = head[3]
        const addressLength = atyp === 0x01 ? 4 : atyp === 0x04 ? 16 : (await reader.read(1))[0]
        await reader.read(addressLength + 2)
        clearTimeout(timer)
        if (settled) return
        settled = true
        const rest = reader.detach()
        socket.removeAllListeners('error')
        socket.removeAllListeners('close')
        if (rest.length) {
          socket.pause()
          socket.unshift(rest)
        }
        resolve(socket)
      })().catch((error) => {
        clearTimeout(timer)
        fail(error as Error)
      })
    })
  })
}

/**
 * 单监听器顺序读取：避免 per-step readExact + unshift 在 flowing 模式下丢数据。
 */
class SocketReader {
  private readonly socket: Socket
  private buffer = Buffer.alloc(0)
  private waiter?: { size: number; resolve: (value: Buffer) => void; reject: (error: Error) => void }
  private readonly onData = (chunk: Buffer) => {
    this.buffer = Buffer.concat([this.buffer, chunk])
    this.flush()
  }
  private readonly onError = (error: Error) => this.waiter?.reject(error)
  private readonly onClose = () => this.waiter?.reject(new Error('代理连接提前关闭'))

  constructor(socket: Socket) {
    this.socket = socket
    socket.on('data', this.onData)
    socket.on('error', this.onError)
    socket.on('close', this.onClose)
  }

  read(size: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.waiter = { size, resolve, reject }
      this.flush()
    })
  }

  detach(): Buffer {
    this.socket.off('data', this.onData)
    this.socket.off('error', this.onError)
    this.socket.off('close', this.onClose)
    return this.buffer
  }

  private flush(): void {
    if (!this.waiter || this.buffer.length < this.waiter.size) return
    const head = this.buffer.subarray(0, this.waiter.size)
    this.buffer = this.buffer.subarray(this.waiter.size)
    const waiter = this.waiter
    this.waiter = undefined
    waiter.resolve(head)
  }
}

function buildSocks5Request(host: string, port: number): Buffer {
  const portBuf = Buffer.alloc(2)
  portBuf.writeUInt16BE(port)
  if (isIPv4(host)) {
    return Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x01]), Buffer.from(host.split('.').map(Number)), portBuf])
  }
  if (host.includes(':')) {
    const ipv6 = ipv6Bytes(host)
    if (ipv6) return Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x04]), ipv6, portBuf])
  }
  const name = Buffer.from(host, 'utf8')
  return Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, name.length]), name, portBuf])
}

export interface HttpProxyOptions {
  proxyHost: string
  proxyPort: number
  host: string
  port: number
  username?: string
  password?: string
  tls?: boolean
  timeoutMs?: number
}

export function httpConnect(options: HttpProxyOptions): Promise<Dialed> {
  const timeout = options.timeoutMs ?? CONNECT_TIMEOUT
  return new Promise((resolve, reject) => {
    const socket: Dialed = options.tls
      ? tlsConnect({ host: options.proxyHost, port: options.proxyPort, servername: options.proxyHost })
      : createConnection({ host: options.proxyHost, port: options.proxyPort })
    let settled = false
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      socket.destroy()
      reject(error)
    }
    const timer = setTimeout(() => fail(new Error(`HTTP 代理 ${options.proxyHost}:${options.proxyPort} 超时`)), timeout)
    socket.once('error', (error) => {
      clearTimeout(timer)
      fail(error)
    })
    socket.once(options.tls ? 'secureConnect' : 'connect', () => {
      const target = `${options.host}:${options.port}`
      const lines = [
        `CONNECT ${target} HTTP/1.1`,
        `Host: ${target}`,
        'Proxy-Connection: keep-alive',
        options.username
          ? `Proxy-Authorization: Basic ${Buffer.from(`${options.username}:${options.password ?? ''}`).toString('base64')}`
          : '',
        '',
        ''
      ].filter(Boolean)
      socket.write(lines.join('\r\n'))
      let buffer = ''
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('latin1')
        const index = buffer.indexOf('\r\n\r\n')
        if (index < 0) {
          if (buffer.length > 16_384) fail(new Error('HTTP 代理响应头过长'))
          return
        }
        socket.off('data', onData)
        const statusLine = buffer.slice(0, buffer.indexOf('\r\n'))
        const status = Number(statusLine.split(' ')[1])
        if (status !== 200) {
          fail(new Error(`HTTP 代理 CONNECT 失败：${statusLine}`))
          return
        }
        clearTimeout(timer)
        settled = true
        socket.removeAllListeners('close')
        // 升级连接后可能还有已读字节，推回流里交给上层。
        const rest = Buffer.from(buffer.slice(index + 4), 'latin1')
        if (rest.length) socket.unshift(rest)
        resolve(socket)
      }
      socket.on('data', onData)
    })
  })
}

function readExact(socket: Socket, size: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0)
    const cleanup = () => {
      socket.off('data', onData)
      socket.off('error', onError)
      socket.off('close', onClose)
    }
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      if (buffer.length >= size) {
        cleanup()
        const head = buffer.subarray(0, size)
        const rest = buffer.subarray(size)
        if (rest.length) socket.unshift(rest)
        resolve(head)
      }
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const onClose = () => {
      cleanup()
      reject(new Error('代理连接提前关闭'))
    }
    socket.on('data', onData)
    socket.on('error', onError)
    socket.on('close', onClose)
  })
}

function isIPv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) && host.split('.').every((part) => Number(part) <= 255)
}

function ipv6Bytes(host: string): Buffer | undefined {
  const sections = host.split(':')
  if (sections.length < 3) return undefined
  const expanded: string[] = []
  const empty = sections.indexOf('')
  if (empty >= 0) {
    const head = sections.slice(0, empty)
    const tail = sections.slice(empty + 1).filter(Boolean)
    while (head.length + tail.length < 8) head.push('0')
    expanded.push(...head, ...tail)
  } else {
    expanded.push(...sections)
  }
  if (expanded.length !== 8) return undefined
  const buf = Buffer.alloc(16)
  expanded.forEach((part, index) => {
    const value = Number.parseInt(part || '0', 16)
    buf.writeUInt16BE(Number.isNaN(value) ? 0 : value, index * 2)
  })
  return buf
}
