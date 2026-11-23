// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 第三层的传输部分：undici。
 *
 * 只做"把一次已经过策略的请求发出去"，不含任何业务判断。三个硬约束：
 *   1. **SSRF 防线在连接层**：自定义 `lookup` 在 DNS 解析后逐个地址过滤，私网/
 *      回环/链路本地一律拒绝（除非策略显式放开）；这比"先解析再 fetch"更难被
 *      DNS Rebinding 绕过，因为过滤发生在真正建连的那次解析上。
 *   2. **响应必须有上限**：读取时按字节截断，避免被大文件/无限流拖死。
 *   3. **重定向不自动跟**：交给引擎逐跳复查范围（见 engine.ts）。
 */

import { lookup as dnsLookup } from 'node:dns'
import type { LookupFunction } from 'node:net'

import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici'

import { isPrivateAddress } from './policy.ts'

export type FetchLike = (url: string, init: Record<string, unknown>) => Promise<Response>

export interface TransportRequest {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
  timeoutMs: number
  maxBytes: number
}

export interface TransportResponse {
  status: number
  headers: Record<string, string>
  setCookie: string[]
  body: Buffer
  bytes: number
  truncated: boolean
  durationMs: number
  /** 预检解析到的地址，写进审计（不保证与实际连接完全一致，仅作证据）。 */
  resolved: string[]
  location: string
}

export class TransportError extends Error {
  constructor(public readonly code: 'PRIVATE_NETWORK_BLOCKED' | 'DNS_FAILED' | 'TIMEOUT' | 'NETWORK', message: string, public readonly status = 502) {
    super(message)
    this.name = 'TransportError'
  }
}

/**
 * 操作员级的地址钉定（`VEXNAR_WEB_RESOLVE="host=ip;host2=ip"`）。
 *
 * 用途：被透明代理/假 IP 劫持的环境里，按域名连不通但按真实 IP 可通；CTF 实例、
 * 内网映射也常需要固定地址。**这是操作员配置，不是 Agent 能设的参数**——否则等于
 * 把 SSRF 白名单交给模型。
 */
export function pinnedAddresses(): Map<string, string[]> {
  const table = new Map<string, string[]>()
  for (const entry of String(process.env.VEXNAR_WEB_RESOLVE ?? '').split(/[;,]/)) {
    const [host, ip] = entry.split('=').map((item) => item.trim())
    if (!host || !ip) continue
    const list = table.get(host.toLowerCase()) ?? []
    list.push(ip)
    table.set(host.toLowerCase(), list)
  }
  return table
}

function guardedLookup(allowPrivate: boolean, pins: Map<string, string[]>): LookupFunction {
  return (hostname, options, callback) => {
    const pinned = pins.get(String(hostname).toLowerCase())
    if (pinned?.length) {
      const blocked = allowPrivate ? [] : pinned.filter((address) => isPrivateAddress(address))
      if (blocked.length) {
        callback(Object.assign(new Error(`钉定地址是私网，已阻断（${blocked.join(',')}）`), { code: 'PRIVATE_NETWORK_BLOCKED' }), [], undefined as never)
        return
      }
      if (options && (options as { all?: boolean }).all) {
        callback(null, pinned.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })) as never, undefined as never)
        return
      }
      callback(null, pinned[0] as never, (pinned[0].includes(':') ? 6 : 4) as never)
      return
    }
    dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) {
        callback(error, [], undefined as never)
        return
      }
      const list = Array.isArray(addresses) ? addresses : [{ address: String(addresses), family: 4 }]
      const blocked = allowPrivate ? [] : list.filter((item) => isPrivateAddress(item.address))
      if (blocked.length) {
        const failure = Object.assign(new Error(`目标解析到私网地址，已阻断（${blocked.map((item) => item.address).join(',')}）`), {
          code: 'PRIVATE_NETWORK_BLOCKED'
        })
        callback(failure, [], undefined as never)
        return
      }
      if (options && (options as { all?: boolean }).all) {
        callback(null, list as never, undefined as never)
        return
      }
      callback(null, list[0].address as never, list[0].family as never)
    })
  }
}

export async function preflight(url: string, allowPrivate: boolean, pins = pinnedAddresses()): Promise<string[]> {
  const { hostname } = new URL(url)
  const pinned = pins.get(hostname.toLowerCase())
  if (pinned?.length) {
    const blocked = allowPrivate ? [] : pinned.filter((address) => isPrivateAddress(address))
    if (blocked.length) {
      throw new TransportError('PRIVATE_NETWORK_BLOCKED', `钉定地址 ${blocked.join(',')} 属私网，策略未放行`, 403)
    }
    return pinned
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')) {
    if (!allowPrivate && isPrivateAddress(hostname)) {
      throw new TransportError('PRIVATE_NETWORK_BLOCKED', `目标是私网地址 ${hostname}，策略未放行`, 403)
    }
    return [hostname]
  }
  const addresses = await new Promise<Array<{ address: string }>>((resolve, reject) => {
    dnsLookup(hostname, { all: true }, (error, list) => {
      if (error) reject(new TransportError('DNS_FAILED', `DNS 解析失败：${hostname}（${error.code ?? error.message}）`, 502))
      else resolve(list as Array<{ address: string }>)
    })
  })
  const blocked = allowPrivate ? [] : addresses.filter((item) => isPrivateAddress(item.address))
  if (blocked.length) {
    throw new TransportError(
      'PRIVATE_NETWORK_BLOCKED',
      `目标 ${hostname} 解析到私网地址（${blocked.map((item) => item.address).join(',')}），已阻断；确需测试请设 VEXNAR_WEB_ALLOW_PRIVATE=on`,
      403
    )
  }
  return addresses.map((item) => item.address)
}

export class SessionTransport {
  private readonly agent?: Agent
  private readonly fetchImpl: FetchLike
  private readonly pins = new Map<string, string[]>()
  private closed = false

  constructor(private readonly options: {
    allowPrivateNetwork: boolean
    connections?: number
    fetchImpl?: FetchLike
    /** 显式出口（代理）；不传则直连。 */
    dispatcher?: Dispatcher
  }) {
    if (options.fetchImpl) {
      const injected = options.fetchImpl
      const dispatcher = options.dispatcher
      this.fetchImpl = dispatcher
        ? (url, init) => injected(url, { ...init, dispatcher })
        : injected
      return
    }
    if (options.dispatcher) {
      const dispatcher = options.dispatcher
      this.fetchImpl = (url, init) => undiciFetch(url, { ...init, dispatcher } as never) as unknown as Promise<Response>
      return
    }
    this.pins = pinnedAddresses()
    this.agent = new Agent({
      connections: Math.max(1, options.connections ?? 1),
      pipelining: 1,
      connect: { timeout: 8000, lookup: guardedLookup(options.allowPrivateNetwork, this.pins) }
    })
    const agent = this.agent
    this.fetchImpl = (url, init) => undiciFetch(url, { ...init, dispatcher: agent } as never) as unknown as Promise<Response>
  }

  async request(input: TransportRequest): Promise<TransportResponse> {
    if (this.closed) throw new TransportError('NETWORK', '传输器已关闭', 409)
    const resolved = await preflight(input.url, this.options.allowPrivateNetwork, this.pins)
    const started = Date.now()
    let response: Response
    try {
      response = await this.fetchImpl(input.url, {
        method: input.method,
        headers: input.headers,
        body: input.body,
        redirect: 'manual',
        signal: AbortSignal.timeout(input.timeoutMs)
      })
    } catch (error) {
      const failure = error as { name?: string; code?: string; message?: string }
      if (failure?.name === 'TimeoutError' || failure?.name === 'AbortError') {
        throw new TransportError('TIMEOUT', `请求超时（${input.timeoutMs}ms）`, 504)
      }
      if (failure?.code === 'PRIVATE_NETWORK_BLOCKED') {
        throw new TransportError('PRIVATE_NETWORK_BLOCKED', failure.message ?? '私网地址被阻断', 403)
      }
      throw new TransportError('NETWORK', `请求失败：${failure?.message ?? String(error)}`, 502)
    }

    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => { headers[key] = value })
    const setCookie = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
    const { body, bytes, truncated } = await readCapped(response, input.maxBytes)
    return {
      status: response.status,
      headers,
      setCookie,
      body,
      bytes,
      truncated,
      durationMs: Date.now() - started,
      resolved,
      location: headers['location'] ?? ''
    }
  }

  async close(): Promise<void> {
    this.closed = true
    await this.agent?.close().catch(() => undefined)
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<{ body: Buffer; bytes: number; truncated: boolean }> {
  const stream = response.body
  if (!stream) return { body: Buffer.alloc(0), bytes: 0, truncated: false }
  const reader = stream.getReader()
  const chunks: Buffer[] = []
  let bytes = 0
  let truncated = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      const chunk = Buffer.from(value)
      bytes += chunk.byteLength
      if (bytes > maxBytes) {
        const room = maxBytes - (bytes - chunk.byteLength)
        if (room > 0) chunks.push(chunk.subarray(0, room))
        truncated = true
        await reader.cancel().catch(() => undefined)
        break
      }
      chunks.push(chunk)
    }
  } finally {
    reader.releaseLock?.()
  }
  return { body: Buffer.concat(chunks), bytes, truncated }
}
