// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 节点解析：clash/mihomo YAML、base64 订阅、单条 URI。与 Go 版 `egress/parse.go`
 * 输出同一套 clash `proxies` 结构，保证导出的配置能直接交给 mihomo。
 */

import { createHash } from 'node:crypto'
import { parse as parseYaml } from 'yaml'

import { SECRET_KEYS, type NodeConfig } from './types.ts'

export interface ParseIssue {
  raw?: string
  error: string
}

export interface ParseResult {
  nodes: NodeConfig[]
  issues: ParseIssue[]
}

const PROTOCOLS = new Set([
  'ss',
  'ssr',
  'vmess',
  'vless',
  'trojan',
  'socks5',
  'http',
  'hysteria2',
  'tuic',
  'anytls',
  'snell'
])

export function parseInput(text: string): ParseResult {
  let body = (text ?? '').trim()
  if (body === '') return { nodes: [], issues: [{ error: '输入为空' }] }
  if (body.includes('proxies:')) return parseClashYaml(body)
  const decoded = decodeBase64Loose(body)
  if (decoded && decoded.includes('://')) body = decoded
  const nodes: NodeConfig[] = []
  const issues: ParseIssue[] = []
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue
    try {
      nodes.push(parseUri(trimmed))
    } catch (error) {
      issues.push({ raw: truncate(trimmed, 120), error: (error as Error).message })
    }
  }
  return { nodes, issues }
}

export function parseClashYaml(text: string): ParseResult {
  let doc: { proxies?: unknown }
  try {
    doc = parseYaml(text) as { proxies?: unknown }
  } catch (error) {
    return { nodes: [], issues: [{ error: `解析 clash YAML 失败: ${(error as Error).message}` }] }
  }
  if (!Array.isArray(doc?.proxies) || doc.proxies.length === 0) {
    return { nodes: [], issues: [{ error: 'clash YAML 中没有 proxies 列表' }] }
  }
  const nodes: NodeConfig[] = []
  const issues: ParseIssue[] = []
  for (const entry of doc.proxies) {
    try {
      nodes.push(nodeFromClashMap(entry as Record<string, unknown>))
    } catch (error) {
      issues.push({ raw: truncate(JSON.stringify(entry), 120), error: (error as Error).message })
    }
  }
  return { nodes, issues }
}

export function nodeFromClashMap(map: Record<string, unknown>): NodeConfig {
  const config: Record<string, unknown> = {}
  const secrets: Record<string, string> = {}
  for (const [key, value] of Object.entries(map)) {
    if (key === 'name' || key === 'type' || key === 'server' || key === 'port') continue
    if (SECRET_KEYS.has(key)) secrets[key] = String(value ?? '')
    else config[key] = value
  }
  const protocol = String(map.type ?? '').toLowerCase()
  const server = String(map.server ?? '').trim()
  const port = Number(map.port)
  const name = String(map.name ?? '').trim() || `${protocol}-${server}-${port}`
  const node: NodeConfig = { name, protocol, server, port, config, secrets }
  validateNode(node)
  return node
}

export function parseUri(raw: string): NodeConfig {
  const index = raw.indexOf('://')
  if (index < 0) throw new Error('不是可识别的代理链接')
  const scheme = raw.slice(0, index).toLowerCase()
  switch (scheme) {
    case 'ss':
      return parseSs(raw)
    case 'ssr':
      return parseSsr(raw)
    case 'vmess':
      return parseVmess(raw)
    case 'vless':
      return parseVless(raw)
    case 'trojan':
      return parseTrojan(raw)
    case 'socks5':
    case 'socks5h':
    case 'socks':
      return parseSocks(raw, 'socks5')
    case 'http':
    case 'https':
      return parseSocks(raw, 'http')
    case 'hysteria2':
    case 'hy2':
      return parseHysteria2(raw)
    case 'tuic':
      return parseTuic(raw)
    case 'anytls':
      return parseAnyTls(raw)
    default:
      throw new Error(`不支持的协议 "${scheme}"`)
  }
}

export function fingerprint(node: NodeConfig): string {
  const flat: [string, string][] = []
  for (const [key, value] of Object.entries(node.config)) flat.push([key, String(value)])
  for (const [key, value] of Object.entries(node.secrets)) flat.push([`,${key}`, value])
  flat.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const hash = createHash('sha256')
  hash.update(`${node.protocol}|${node.server}|${node.port}|`)
  for (const [key, value] of flat) hash.update(`${key}=${value}\0`)
  return hash.digest('hex')
}

function validateNode(node: NodeConfig): void {
  if (!node.server) throw new Error('节点缺少 server')
  if (!Number.isInteger(node.port) || node.port < 1 || node.port > 65535) throw new Error(`节点端口 ${node.port} 无效`)
  if (!PROTOCOLS.has(node.protocol)) throw new Error(`不支持的协议 "${node.protocol}"`)
}

// ---------- URI parsers ----------

function parseSs(raw: string): NodeConfig {
  const fragment = splitFragment(raw)
  const query = splitQuery(fragment.rest)
  let body = query.rest.slice('ss://'.length)
  const at = body.lastIndexOf('@')
  let userinfo: string
  let hostport: string
  if (at >= 0) {
    userinfo = body.slice(0, at)
    hostport = body.slice(at + 1)
  } else {
    const decoded = decodeBase64Loose(body)
    if (!decoded) throw new Error('ss 链接缺少 @ 且不是合法 base64')
    const decodedAt = decoded.lastIndexOf('@')
    if (decodedAt < 0) throw new Error('ss base64 内容缺少 @')
    userinfo = decoded.slice(0, decodedAt)
    hostport = decoded.slice(decodedAt + 1)
  }
  const decodedUser = decodeBase64Loose(userinfo)
  if (decodedUser && decodedUser.includes(':')) userinfo = decodedUser
  const sep = userinfo.indexOf(':')
  if (sep <= 0) throw new Error('ss 链接缺少 method:password')
  const method = userinfo.slice(0, sep)
  const password = userinfo.slice(sep + 1)
  const { host, port } = splitHostPort(hostport)
  const config: Record<string, unknown> = { cipher: method, udp: true }
  const plugin = query.params.get('plugin')
  if (plugin) applySsPlugin(plugin, config)
  const node: NodeConfig = { name: fragment.name || `ss-${host}`, protocol: 'ss', server: host, port, config, secrets: { password } }
  validateNode(node)
  return node
}

function applySsPlugin(plugin: string, config: Record<string, unknown>): void {
  const parts = plugin.split(';')
  config.plugin = parts[0]
  const opts: Record<string, unknown> = {}
  for (const part of parts.slice(1)) {
    const [key, value = ''] = part.split('=')
    if (key === 'obfs') opts.mode = value
    else if (key === 'obfs-host' || key === 'host') opts.host = value
    else if (key === 'path') opts.path = value
    else if (key === 'tls') opts.tls = value === 'true' || value === '1'
  }
  if (Object.keys(opts).length) config['plugin-opts'] = opts
}

function parseSsr(raw: string): NodeConfig {
  const decoded = decodeBase64Loose(raw.slice('ssr://'.length))
  if (!decoded) throw new Error('ssr 链接不是合法 base64')
  const [main, paramsRaw = ''] = decoded.split('/?')
  const parts = main.split(':')
  if (parts.length < 6) throw new Error('ssr 内容字段不足（host:port:protocol:method:obfs:password）')
  const host = parts.slice(0, parts.length - 5).join(':')
  const port = Number(parts[parts.length - 5])
  const protocol = parts[parts.length - 4] || 'origin'
  const method = parts[parts.length - 3]
  const obfs = parts[parts.length - 2] || 'plain'
  const password = decodeBase64Loose(parts[parts.length - 1]) ?? parts[parts.length - 1]
  const params = new URLSearchParams(paramsRaw)
  const param = (key: string) => {
    const value = params.get(key) ?? ''
    return value ? decodeBase64Loose(value) ?? value : ''
  }
  const config: Record<string, unknown> = {
    cipher: method,
    protocol,
    obfs,
    udp: true
  }
  const protoParam = param('protoparam')
  const obfsParam = param('obfsparam')
  if (protoParam) config['protocol-param'] = protoParam
  if (obfsParam) config['obfs-param'] = obfsParam
  const node: NodeConfig = {
    name: param('remarks') || `ssr-${host}`,
    protocol: 'ssr',
    server: host,
    port,
    config,
    secrets: { password }
  }
  validateNode(node)
  return node
}

function parseVmess(raw: string): NodeConfig {
  const decoded = decodeBase64Loose(raw.slice('vmess://'.length))
  if (!decoded) throw new Error('vmess 链接不是合法 base64')
  let v: Record<string, unknown>
  try {
    v = JSON.parse(decoded) as Record<string, unknown>
  } catch (error) {
    throw new Error(`vmess JSON 无效: ${(error as Error).message}`)
  }
  const network = String(v.net || 'tcp')
  const config: Record<string, unknown> = {
    alterId: Number(v.aid ?? 0) || 0,
    cipher: String(v.scy || 'auto'),
    udp: true,
    network
  }
  const tls = String(v.tls || '').toLowerCase()
  if (tls === 'tls' || tls === 'reality') {
    config.tls = true
    if (v.sni) config.servername = String(v.sni)
  }
  if (v.fp) config['client-fingerprint'] = String(v.fp)
  if (v.alpn) config.alpn = splitList(String(v.alpn))
  if (network === 'ws') {
    const opts: Record<string, unknown> = {}
    if (v.path) opts.path = String(v.path)
    if (v.host) opts.headers = { Host: String(v.host) }
    if (Object.keys(opts).length) config['ws-opts'] = opts
  } else if (network === 'grpc') {
    if (v.path) config['grpc-opts'] = { 'grpc-service-name': String(v.path) }
  } else if (network === 'h2') {
    const opts: Record<string, unknown> = {}
    if (v.path) opts.path = String(v.path)
    if (v.host) opts.host = splitList(String(v.host))
    if (Object.keys(opts).length) config['h2-opts'] = opts
  }
  const node: NodeConfig = {
    name: String(v.ps || '') || `vmess-${String(v.add ?? '')}`,
    protocol: 'vmess',
    server: String(v.add ?? '').trim(),
    port: Number(v.port ?? 0),
    config,
    secrets: { uuid: String(v.id ?? '') }
  }
  validateNode(node)
  return node
}

function parseVless(raw: string): NodeConfig {
  const u = new URL(raw)
  if (!u.username) throw new Error('vless 链接缺少 uuid')
  const { host, port } = splitHostPort(u.host)
  const q = u.searchParams
  const security = (q.get('security') || '').toLowerCase()
  const network = q.get('type') || 'tcp'
  const config: Record<string, unknown> = { udp: true, network }
  if (security === 'tls' || security === 'reality' || security === 'xtls') config.tls = true
  const sni = q.get('sni') || q.get('host')
  if (sni) config.servername = sni
  if (q.get('fp')) config['client-fingerprint'] = q.get('fp')
  if (q.get('flow')) config.flow = q.get('flow')
  if (security === 'reality') {
    const reality: Record<string, unknown> = {}
    if (q.get('pbk')) reality['public-key'] = q.get('pbk')
    if (q.get('sid')) reality['short-id'] = q.get('sid')
    if (Object.keys(reality).length) config['reality-opts'] = reality
  }
  if (q.get('alpn')) config.alpn = splitList(q.get('alpn') as string)
  if (network === 'ws') {
    const opts: Record<string, unknown> = {}
    if (q.get('path')) opts.path = q.get('path')
    if (q.get('host')) opts.headers = { Host: q.get('host') }
    if (Object.keys(opts).length) config['ws-opts'] = opts
  } else if (network === 'grpc') {
    const service = q.get('serviceName') || q.get('path')
    if (service) config['grpc-opts'] = { 'grpc-service-name': service }
  }
  const node: NodeConfig = {
    name: decodeURIComponent(u.hash.replace(/^#/, '')) || `vless-${host}`,
    protocol: 'vless',
    server: host,
    port,
    config,
    secrets: { uuid: decodeURIComponent(u.username) }
  }
  validateNode(node)
  return node
}

function parseTrojan(raw: string): NodeConfig {
  const u = new URL(raw)
  if (!u.username) throw new Error('trojan 链接缺少密码')
  const { host, port } = splitHostPort(u.host)
  const q = u.searchParams
  const network = q.get('type') || 'tcp'
  const config: Record<string, unknown> = { udp: true }
  const sni = q.get('sni') || q.get('peer')
  if (sni) config.sni = sni
  if (q.get('alpn')) config.alpn = splitList(q.get('alpn') as string)
  const insecure = q.get('allowInsecure')
  if (insecure === '1' || insecure === 'true') config['skip-cert-verify'] = true
  if (network !== 'tcp') config.network = network
  if (network === 'ws') {
    const opts: Record<string, unknown> = {}
    if (q.get('path')) opts.path = q.get('path')
    if (q.get('host')) opts.headers = { Host: q.get('host') }
    if (Object.keys(opts).length) config['ws-opts'] = opts
  }
  const node: NodeConfig = {
    name: decodeURIComponent(u.hash.replace(/^#/, '')) || `trojan-${host}`,
    protocol: 'trojan',
    server: host,
    port,
    config,
    secrets: { password: decodeURIComponent(u.username) }
  }
  validateNode(node)
  return node
}

function parseSocks(raw: string, protocol: 'socks5' | 'http'): NodeConfig {
  const u = new URL(raw)
  const { host, port } = splitHostPort(u.host)
  const config: Record<string, unknown> = { udp: true }
  if (protocol === 'http' && u.protocol === 'https:') config.tls = true
  const secrets: Record<string, string> = {}
  if (u.username) {
    config.username = decodeURIComponent(u.username)
    if (u.password) secrets.password = decodeURIComponent(u.password)
  }
  const node: NodeConfig = {
    name: decodeURIComponent(u.hash.replace(/^#/, '')) || `${protocol}-${host}`,
    protocol,
    server: host,
    port,
    config,
    secrets
  }
  validateNode(node)
  return node
}

function parseHysteria2(raw: string): NodeConfig {
  const u = new URL(raw)
  const { host, port } = splitHostPort(u.host)
  const q = u.searchParams
  const config: Record<string, unknown> = {}
  if (q.get('sni')) config.sni = q.get('sni')
  const insecure = q.get('insecure')
  if (insecure === '1' || insecure === 'true') config['skip-cert-verify'] = true
  if (q.get('obfs')) {
    config.obfs = q.get('obfs')
    if (q.get('obfs-password')) config['obfs-password'] = q.get('obfs-password')
  }
  const password = u.password ? decodeURIComponent(u.password) : decodeURIComponent(u.username)
  const node: NodeConfig = {
    name: decodeURIComponent(u.hash.replace(/^#/, '')) || `hy2-${host}`,
    protocol: 'hysteria2',
    server: host,
    port,
    config,
    secrets: { password }
  }
  validateNode(node)
  return node
}

function parseTuic(raw: string): NodeConfig {
  const u = new URL(raw)
  const { host, port } = splitHostPort(u.host)
  const q = u.searchParams
  const config: Record<string, unknown> = { udp: true }
  for (const key of ['sni', 'congestion_control', 'udp_relay_mode']) {
    if (q.get(key)) config[key.replaceAll('_', '-')] = q.get(key)
  }
  if (q.get('allow_insecure') === '1') config['skip-cert-verify'] = true
  const node: NodeConfig = {
    name: decodeURIComponent(u.hash.replace(/^#/, '')) || `tuic-${host}`,
    protocol: 'tuic',
    server: host,
    port,
    config,
    secrets: { uuid: decodeURIComponent(u.username), password: decodeURIComponent(u.password ?? '') }
  }
  validateNode(node)
  return node
}

function parseAnyTls(raw: string): NodeConfig {
  const u = new URL(raw)
  const { host, port } = splitHostPort(u.host)
  const config: Record<string, unknown> = { udp: true }
  if (u.searchParams.get('sni')) config.sni = u.searchParams.get('sni')
  const node: NodeConfig = {
    name: decodeURIComponent(u.hash.replace(/^#/, '')) || `anytls-${host}`,
    protocol: 'anytls',
    server: host,
    port,
    config,
    secrets: { password: decodeURIComponent(u.password ?? u.username) }
  }
  validateNode(node)
  return node
}

// ---------- helpers ----------

function splitFragment(raw: string): { rest: string; name: string } {
  const index = raw.indexOf('#')
  if (index < 0) return { rest: raw, name: '' }
  return { rest: raw.slice(0, index), name: decodeURIComponent(raw.slice(index + 1)) }
}

function splitQuery(raw: string): { rest: string; params: URLSearchParams } {
  const index = raw.indexOf('?')
  if (index < 0) return { rest: raw, params: new URLSearchParams() }
  return { rest: raw.slice(0, index), params: new URLSearchParams(raw.slice(index + 1)) }
}

function splitHostPort(hostport: string): { host: string; port: number } {
  const trimmed = hostport.trim()
  if (!trimmed) throw new Error('地址为空')
  const index = trimmed.lastIndexOf(':')
  if (index < 0) throw new Error(`地址 "${trimmed}" 缺少端口`)
  const host = trimmed.slice(0, index).replace(/^\[|\]$/g, '')
  const port = Number(trimmed.slice(index + 1))
  if (!host) throw new Error('地址缺少主机')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`端口 "${trimmed.slice(index + 1)}" 无效`)
  return { host, port }
}

export function decodeBase64Loose(input: string): string | undefined {
  const value = input.trim().replace(/=+$/, '')
  if (!value || !/^[A-Za-z0-9_\-+/]+$/.test(value)) return undefined
  try {
    const buf = Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    if (buf.length === 0) return undefined
    const text = buf.toString('utf8')
    if (!isPrintable(text)) return undefined
    return text
  } catch {
    return undefined
  }
}

function isPrintable(text: string): boolean {
  if (!text) return false
  for (const ch of text) {
    const code = ch.codePointAt(0) as number
    if (code === 0) return false
    if (code < 0x20 && ch !== '\n' && ch !== '\r' && ch !== '\t') return false
  }
  return true
}

function splitList(value: string): string[] {
  return value
    .split(/[,|]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`
}
