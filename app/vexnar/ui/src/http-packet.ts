// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * HTTP 报文的结构化与逐行着色（dsh 客户端侧）。
 *
 * 与 `web/src/lib/http-packet.ts` 同一套切词规则：起始行、头部、空行、正文四段
 * 骨架不同（请求行是 `方法 路径 协议`，状态行是 `协议 状态码 原因`），正文又分
 * JSON / HTML / XML / JS / CSS / 表单 / multipart / 二进制。这里只做纯函数，
 * 渲染层把 tone 映射成颜色。
 */

export type PacketSide = 'request' | 'response' | 'unknown'

export type SyntaxTone =
  | 'method'
  | 'url'
  | 'query-key'
  | 'query-value'
  | 'proto'
  | 'status'
  | 'reason'
  | 'header'
  | 'value'
  /** 会话类凭据：Cookie / Set-Cookie / Authorization / API-Key / CSRF。 */
  | 'session'
  | 'cookie-key'
  | 'cookie-value'
  | 'key'
  | 'string'
  | 'number'
  | 'literal'
  | 'tag'
  | 'attr'
  | 'comment'
  | 'punct'
  | 'muted'

export type Token = { text: string; tone?: SyntaxTone }
export type PacketHeader = { name: string; value: string }
export type HttpPacket = {
  side: PacketSide
  startLine: string
  headers: PacketHeader[]
  body: string
  raw: string
}

export type BodyKind = 'json' | 'html' | 'xml' | 'css' | 'js' | 'form' | 'multipart' | 'text' | 'binary'

const BINARY_PREFIXES = [
  'image/',
  'audio/',
  'video/',
  'font/',
  'application/pdf',
  'application/zip',
  'application/gzip',
  'application/x-gzip',
  'application/octet-stream',
  'application/x-tar',
  'application/wasm',
  'application/x-protobuf'
]

export function normalizeNewlines(raw: string): string {
  return (raw ?? '').replace(/\r\n?/g, '\n')
}

function detectSide(startLine: string): PacketSide {
  // `HTTP/2 200` 与 `HTTP 200` 都是响应行；后者按 `方法 目标` 去认会被误判成请求。
  if (/^HTTP(?:\/[\d.]+)?\s+\d{3}\b/i.test(startLine)) return 'response'
  if (/^[A-Z][A-Z0-9-]*\s+\S+/.test(startLine)) return 'request'
  return 'unknown'
}

export function parseHttpPacket(rawInput: string): HttpPacket {
  const raw = normalizeNewlines(rawInput)
  const boundary = raw.indexOf('\n\n')
  const head = boundary < 0 ? raw : raw.slice(0, boundary)
  const body = boundary < 0 ? '' : raw.slice(boundary + 2)
  const lines = head.split('\n')
  const startLine = (lines[0] ?? '').trim()
  const headers: PacketHeader[] = []
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const previous = headers[headers.length - 1]
    if (/^[ \t]/.test(line) && previous) {
      previous.value = `${previous.value} ${line.trim()}`
      continue
    }
    const colon = line.indexOf(':')
    if (colon <= 0) {
      headers.push({ name: '', value: line })
      continue
    }
    headers.push({ name: line.slice(0, colon), value: line.slice(colon + 1).replace(/^[ \t]+/, '') })
  }
  return { side: detectSide(startLine), startLine, headers, body, raw }
}

export function packetHeader(packet: HttpPacket, name: string): string {
  const lower = name.toLowerCase()
  return packet.headers.find((entry) => entry.name.toLowerCase() === lower)?.value ?? ''
}

function looksLikeJson(body: string): boolean {
  const trimmed = body.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

export function detectBodyKind(contentType: string, body: string): BodyKind {
  const ct = (contentType || '').toLowerCase()
  if (!body.trim()) return 'text'
  if (ct.includes('json') || ct.includes('+json')) return 'json'
  if (ct.includes('html')) return 'html'
  if (ct.includes('xml') || ct.includes('+xml')) return 'xml'
  if (ct.includes('x-www-form-urlencoded')) return 'form'
  if (ct.includes('multipart/')) return 'multipart'
  if (ct.includes('css')) return 'css'
  if (ct.includes('javascript') || ct.includes('ecmascript')) return 'js'
  if (BINARY_PREFIXES.some((prefix) => ct.startsWith(prefix))) return 'binary'

  const trimmed = body.trimStart()
  if (trimmed.startsWith('<')) {
    const head = trimmed.slice(0, 64).toLowerCase()
    return head.startsWith('<!doctype html') || head.startsWith('<html') ? 'html' : 'xml'
  }
  if (looksLikeJson(body)) return 'json'
  return 'text'
}

export function prettyJsonBody(body: string): string | null {
  const trimmed = body.trim()
  if (!trimmed) return null
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return null
  }
}

function tokenizeQuery(query: string): Token[] {
  const tokens: Token[] = [{ text: '?', tone: 'punct' }]
  query
    .slice(1)
    .split('&')
    .forEach((part, index) => {
      if (index > 0) tokens.push({ text: '&', tone: 'punct' })
      if (!part) return
      const eq = part.indexOf('=')
      if (eq < 0) {
        tokens.push({ text: part, tone: 'query-key' })
        return
      }
      tokens.push({ text: part.slice(0, eq), tone: 'query-key' })
      tokens.push({ text: '=', tone: 'punct' })
      tokens.push({ text: part.slice(eq + 1), tone: 'query-value' })
    })
  return tokens
}

export function tokenizeUrl(url: string): Token[] {
  const tokens: Token[] = []
  const match = /^([a-zA-Z][\w+.-]*:\/\/)?([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/.exec(url)
  if (!match) return [{ text: url, tone: 'url' }]
  const [, scheme = '', authority = '', path = '', query = '', hash = ''] = match
  if (scheme) tokens.push({ text: scheme, tone: 'muted' })
  if (authority) tokens.push({ text: authority, tone: 'url' })
  if (path) tokens.push({ text: path, tone: 'value' })
  if (query) tokens.push(...tokenizeQuery(query))
  if (hash) tokens.push({ text: hash, tone: 'muted' })
  return tokens
}

export function tokenizeStartLine(packet: HttpPacket, side: PacketSide = packet.side): Token[] {
  const line = packet.startLine
  if (!line) return []

  if (side === 'response') {
    const match = /^(HTTP(?:\/[\d.]+)?)(\s+)(\d{3})(.*)$/i.exec(line)
    if (!match) return [{ text: line }]
    const [, proto = '', gap = '', code = '', reason = ''] = match
    return [
      { text: proto, tone: 'proto' },
      { text: gap },
      { text: code, tone: 'status' },
      { text: reason, tone: 'reason' }
    ]
  }

  const match = /^([A-Z][A-Z0-9-]*)(\s+)(\S+)(?:\s+(HTTP\/[\d.]+))?$/.exec(line)
  if (!match) return [{ text: line }]
  const [, method = '', gap = '', target = '', version] = match
  const tokens: Token[] = [
    { text: method, tone: 'method' },
    { text: gap }
  ]
  tokens.push(...tokenizeUrl(target))
  if (version) tokens.push({ text: ' ', tone: 'punct' }, { text: version, tone: 'proto' })
  return tokens
}

const COOKIE_LIKE = new Set(['cookie', 'set-cookie'])
/**
 * 会话类头：看报文时最需要一眼认出来的那些。
 *
 * 单独给一个色调，是因为它们和普通头不同——普通头是"协议细节"，这些是"身份"，
 * 排查越权/会话固定/凭据泄漏时视线会直接扫这几行。
 */
const SESSION_LIKE = new Set([
  'cookie', 'set-cookie',
  'authorization', 'proxy-authorization',
  'x-api-key', 'api-key', 'x-auth-token', 'x-access-token',
  'x-csrf-token', 'x-xsrf-token', 'csrf-token', 'x-session-id', 'session', 'x-token'
])

function tokenizeCookieValue(value: string): Token[] {
  const tokens: Token[] = []
  value.split(/;\s*(?=[^;]+?=)/).forEach((part, index) => {
    if (index > 0) tokens.push({ text: '; ', tone: 'punct' })
    const eq = part.indexOf('=')
    if (eq < 0) {
      tokens.push({ text: part, tone: 'cookie-value' })
      return
    }
    tokens.push({ text: part.slice(0, eq), tone: 'cookie-key' })
    tokens.push({ text: '=', tone: 'punct' })
    tokens.push({ text: part.slice(eq + 1), tone: 'cookie-value' })
  })
  return tokens
}

export function tokenizeHeader(header: PacketHeader): Token[] {
  if (!header.name) return [{ text: header.value, tone: 'value' }]
  const name = header.name.toLowerCase()
  const session = SESSION_LIKE.has(name)
  const tokens: Token[] = [
    { text: header.name, tone: session ? 'session' : 'header' },
    { text: ':', tone: 'punct' },
    { text: ' ', tone: 'punct' }
  ]
  if (COOKIE_LIKE.has(name)) {
    tokens.push(...tokenizeCookieValue(header.value))
  } else if (session) {
    // 非 Cookie 的凭据整段同色：值通常是不可解析的稠密串，分词只会更乱。
    tokens.push({ text: header.value, tone: 'session' })
  } else if (/^[<]?[a-zA-Z][\w+.-]*:\/\//.test(header.value)) {
    const bracketed = /^<([^>]+)>(.*)$/.exec(header.value)
    if (bracketed) {
      const [, href = '', rest = ''] = bracketed
      tokens.push({ text: '<', tone: 'punct' })
      tokens.push(...tokenizeUrl(href))
      tokens.push({ text: '>', tone: 'punct' })
      if (rest) tokens.push({ text: rest, tone: 'muted' })
    } else {
      tokens.push(...tokenizeUrl(header.value))
    }
  } else if (name === 'content-type') {
    const semi = header.value.indexOf(';')
    if (semi > 0) {
      tokens.push({ text: header.value.slice(0, semi), tone: 'string' })
      tokens.push({ text: header.value.slice(semi), tone: 'muted' })
    } else {
      tokens.push({ text: header.value, tone: 'string' })
    }
  } else {
    tokens.push({ text: header.value, tone: 'value' })
  }
  return tokens
}

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],])/g

export function tokenizeJsonLine(line: string): Token[] {
  const tokens: Token[] = []
  let cursor = 0
  for (const match of line.matchAll(JSON_TOKEN)) {
    const index = match.index ?? 0
    if (index > cursor) tokens.push({ text: line.slice(cursor, index), tone: 'punct' })
    if (match[1]) {
      tokens.push({ text: match[1], tone: match[2] ? 'key' : 'string' })
      if (match[2]) tokens.push({ text: match[2], tone: 'punct' })
    } else if (match[3]) {
      tokens.push({ text: match[3], tone: 'number' })
    } else if (match[4]) {
      tokens.push({ text: match[4], tone: 'literal' })
    } else {
      tokens.push({ text: match[0], tone: 'punct' })
    }
    cursor = index + match[0].length
  }
  if (cursor < line.length) tokens.push({ text: line.slice(cursor), tone: 'punct' })
  return tokens
}

const TAG_PATTERN =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\?[\s\S]*?\?>|<\/?([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
const ATTR_PATTERN = /([^\s=/>]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)?/g

function tokenizeTag(text: string, name: string | undefined, attributes: string): Token[] {
  const tokens: Token[] = []
  const open = text.startsWith('</') ? '</' : '<'
  tokens.push({ text: open, tone: 'punct' })
  if (!name) {
    tokens.push({ text: text.slice(open.length), tone: 'comment' })
    return tokens
  }
  tokens.push({ text: name, tone: 'tag' })
  for (const match of attributes.replace(/\/\s*$/, '').matchAll(ATTR_PATTERN)) {
    if (!match[1]) continue
    tokens.push({ text: ' ', tone: 'punct' })
    tokens.push({ text: match[1], tone: 'attr' })
    if (match[2]) tokens.push({ text: match[2].trim() === '=' ? '=' : match[2].trim(), tone: 'punct' })
    if (match[3]) tokens.push({ text: match[3], tone: 'string' })
  }
  tokens.push({ text: text.endsWith('/>') ? '/>' : '>', tone: 'punct' })
  return tokens
}

export function tokenizeMarkupLine(line: string): Token[] {
  const tokens: Token[] = []
  let cursor = 0
  for (const match of line.matchAll(TAG_PATTERN)) {
    const index = match.index ?? 0
    if (index > cursor) tokens.push({ text: line.slice(cursor, index), tone: 'value' })
    const full = match[0]
    if (full.startsWith('<!') || full.startsWith('<?')) tokens.push({ text: full, tone: 'comment' })
    else tokens.push(...tokenizeTag(full, match[1], match[2] ?? ''))
    cursor = index + full.length
  }
  if (cursor < line.length) tokens.push({ text: line.slice(cursor), tone: 'value' })
  return tokens
}

const JS_KEYWORDS = new Set([
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'let',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'undefined',
  'var',
  'void',
  'while',
  'yield'
])

const CODE_TOKEN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b[A-Za-z_$][\w$]*\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g

export function tokenizeCodeLine(line: string): Token[] {
  const tokens: Token[] = []
  let cursor = 0
  for (const match of line.matchAll(CODE_TOKEN)) {
    const index = match.index ?? 0
    if (index > cursor) tokens.push({ text: line.slice(cursor, index) })
    if (match[1]) tokens.push({ text: match[1], tone: 'comment' })
    else if (match[2]) tokens.push({ text: match[2], tone: 'string' })
    else if (match[3]) {
      const word = match[3]
      tokens.push(JS_KEYWORDS.has(word) ? { text: word, tone: 'literal' } : { text: word })
    }
    else tokens.push({ text: match[0], tone: 'number' })
    cursor = index + match[0].length
  }
  if (cursor < line.length) tokens.push({ text: line.slice(cursor) })
  return tokens
}

export function tokenizeFormLine(line: string): Token[] {
  const tokens: Token[] = []
  line.split('&').forEach((part, index) => {
    if (index > 0) tokens.push({ text: '&', tone: 'punct' })
    if (!part) return
    const eq = part.indexOf('=')
    if (eq < 0) {
      tokens.push({ text: part, tone: 'key' })
      return
    }
    tokens.push({ text: part.slice(0, eq), tone: 'key' })
    tokens.push({ text: '=', tone: 'punct' })
    tokens.push({ text: part.slice(eq + 1), tone: 'string' })
  })
  return tokens
}

export function tokenizeMultipartLine(line: string): Token[] {
  if (/^--/.test(line)) return [{ text: line, tone: 'comment' }]
  const colon = line.indexOf(':')
  if (colon > 0 && !/\s/.test(line.slice(0, colon))) {
    return [
      { text: line.slice(0, colon), tone: 'header' },
      { text: ':', tone: 'punct' },
      { text: line.slice(colon + 1), tone: 'value' }
    ]
  }
  return [{ text: line, tone: 'value' }]
}

export function tokenizeBodyLine(kind: BodyKind, line: string): Token[] {
  switch (kind) {
    case 'json':
      return tokenizeJsonLine(line)
    case 'html':
    case 'xml':
      return tokenizeMarkupLine(line)
    case 'js':
    case 'css':
      return tokenizeCodeLine(line)
    case 'form':
      return tokenizeFormLine(line)
    case 'multipart':
      return tokenizeMultipartLine(line)
    default:
      return [{ text: line }]
  }
}

export type HexRow = { offset: string; hex: string; ascii: string }

export function hexDump(body: string, limit = 512): { rows: HexRow[]; truncated: boolean } {
  const all = new TextEncoder().encode(body)
  const bytes = all.slice(0, limit)
  const rows: HexRow[] = []
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = Array.from(bytes.slice(offset, offset + 16))
    const hex = chunk.map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
    const ascii = chunk.map((byte) => (byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.')).join('')
    rows.push({ offset: offset.toString(16).padStart(8, '0'), hex: hex.padEnd(47, ' '), ascii })
  }
  return { rows, truncated: all.length > limit }
}

export function statusClass(status: number): 'info' | 'success' | 'redirect' | 'warn' | 'error' {
  if (status >= 500) return 'error'
  if (status >= 400) return 'warn'
  if (status >= 300) return 'redirect'
  if (status >= 200) return 'success'
  return 'info'
}

export function methodClass(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
    case 'HEAD':
      return 'get'
    case 'POST':
      return 'post'
    case 'PUT':
      return 'put'
    case 'PATCH':
      return 'patch'
    case 'DELETE':
      return 'delete'
    case 'OPTIONS':
      return 'options'
    default:
      return 'other'
  }
}
