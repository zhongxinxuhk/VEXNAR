// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 第五层：本地分析 + 脱敏。
 *
 * 三件事：
 *   1. 结构提取（parse5）——表单/链接/脚本/注释/JSON 顶层键，给 Agent 判断业务语义；
 *   2. 差异分析——基线 vs 候选（状态码/长度/头部/回显），判断测试是否产生变化；
 *   3. 脱敏——URL 敏感参数、敏感头、正文里的 Bearer/JWT/口令样式。
 *
 * 这里刻意**不把整页正文交给模型**：只给结构化摘要 + 限长片段，减少上下文成本与
 * 敏感信息外泄面。
 */

import { parse } from 'parse5'

import type { Classification, ExchangeDiff, HttpExchangeRecord, StructureSummary } from './types.ts'

const SENSITIVE_PARAMS = /^(password|passwd|pwd|token|access_token|refresh_token|secret|api[_-]?key|apikey|session|sessionid|sid|csrf|xsrf|auth|authorization)$/i
const SENSITIVE_HEADERS = new Set([
  'authorization', 'cookie', 'set-cookie', 'proxy-authorization', 'x-csrf-token', 'x-xsrf-token',
  'x-api-key', 'api-key', 'x-auth-token', 'x-session-token', 'x-vexnar-session'
])

export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw)
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_PARAMS.test(key)) url.searchParams.set(key, '***')
    }
    if (url.username) url.username = '***'
    if (url.password) url.password = '***'
    return url.toString()
  } catch {
    return raw
  }
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase()
    if (SENSITIVE_HEADERS.has(key)) {
      out[name] = value ? '***' : ''
      continue
    }
    out[name] = value.length > 512 ? `${value.slice(0, 512)}…` : value
  }
  return out
}

/** 正文脱敏：Bearer / JWT / 常见口令字段的取值。 */
export function redactBody(text: string): string {
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]{8,}=*/gi, '$1***')
    .replace(/eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{2,}/g, '***JWT***')
    .replace(/((?:password|passwd|pwd|token|secret|api[_-]?key)\s*[=:]\s*["']?)[^\s"'&<>,]{3,}/gi, '$1***')
}

export function looksLikeHtml(contentType: string, body: Buffer): boolean {
  if (/text\/html|application\/xhtml/i.test(contentType)) return true
  if (contentType) return false
  const head = body.subarray(0, 256).toString('utf8').trim().toLowerCase()
  return head.startsWith('<!doctype html') || head.startsWith('<html')
}

export function looksLikeJson(contentType: string, body: Buffer): boolean {
  if (/application\/(?:[a-z+.]+\+)?json/i.test(contentType)) return true
  const head = body.subarray(0, 64).toString('utf8').trim()
  return (head.startsWith('{') && head.endsWith('}')) || (head.startsWith('[') && head.endsWith(']'))
}

function textOf(node: any, collected: string[]): void {
  if (!node) return
  if (node.nodeName === '#text' && node.value) collected.push(String(node.value))
  for (const child of node.childNodes ?? []) textOf(child, collected)
}

function attr(node: any, name: string): string {
  const found = (node.attrs ?? []).find((item: any) => item.name === name)
  return found ? String(found.value) : ''
}

/** parse5 遍历：表单 / 链接 / 脚本 / 注释 / title。 */
export function extractStructure(html: string, baseUrl: string): StructureSummary {
  const summary: StructureSummary = { title: '', forms: [], links: [], scripts: [], jsonKeys: [], comments: [] }
  let document: any
  try {
    document = parse(html)
  } catch {
    return summary
  }
  const resolve = (href: string): string => {
    try { return new URL(href, baseUrl).toString() } catch { return href }
  }
  const walk = (node: any): void => {
    if (!node) return
    if (node.nodeName === 'form') {
      const inputs: Array<{ name: string; type: string; hasValue: boolean }> = []
      const collect = (child: any): void => {
        if (!child) return
        if (child.nodeName === 'input' || child.nodeName === 'textarea' || child.nodeName === 'select') {
          inputs.push({
            name: attr(child, 'name'),
            type: attr(child, 'type') || child.nodeName,
            hasValue: Boolean(attr(child, 'value'))
          })
        }
        for (const grand of child.childNodes ?? []) collect(grand)
      }
      collect(node)
      summary.forms.push({ action: resolve(attr(node, 'action') || baseUrl), method: (attr(node, 'method') || 'GET').toUpperCase(), inputs })
    }
    if (node.nodeName === 'a') {
      const href = attr(node, 'href')
      if (href) {
        const collected: string[] = []
        textOf(node, collected)
        summary.links.push({ href: resolve(href), text: collected.join(' ').replace(/\s+/g, ' ').trim().slice(0, 120) })
      }
    }
    if (node.nodeName === 'script' && attr(node, 'src')) summary.scripts.push(resolve(attr(node, 'src')))
    if (node.nodeName === 'title') {
      const collected: string[] = []
      textOf(node, collected)
      summary.title = collected.join('').trim().slice(0, 200)
    }
    if (node.nodeName === '#comment' && node.data) {
      summary.comments.push(String(node.data).trim().slice(0, 200))
    }
    for (const child of node.childNodes ?? []) walk(child)
  }
  walk(document)
  summary.forms = summary.forms.slice(0, 30)
  summary.links = summary.links.slice(0, 60)
  summary.scripts = summary.scripts.slice(0, 30)
  summary.comments = summary.comments.filter(Boolean).slice(0, 10)
  return summary
}

/** JSON 顶层键 + 一层子键（限长），给 Agent 判接口形状。 */
export function extractJsonKeys(body: Buffer, max = 40): string[] {
  try {
    const data = JSON.parse(body.toString('utf8'))
    const keys: string[] = []
    const push = (prefix: string, value: unknown): void => {
      if (keys.length >= max) return
      if (Array.isArray(value)) {
        if (value.length && typeof value[0] === 'object' && value[0] !== null) {
          for (const key of Object.keys(value[0] as object).slice(0, 10)) keys.push(`${prefix}[].${key}`)
        } else {
          keys.push(`${prefix}[]`)
        }
        return
      }
      if (value && typeof value === 'object') {
        for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
          const path = prefix ? `${prefix}.${key}` : key
          if (inner && typeof inner === 'object') push(path, inner)
          else keys.push(path)
          if (keys.length >= max) return
        }
        return
      }
      keys.push(prefix || 'value')
    }
    push('', data)
    return keys.slice(0, max)
  } catch {
    return []
  }
}

const WAF_SIGNATURES: Array<{ marker: string; test: RegExp }> = [
  { marker: 'cloudflare_challenge', test: /just a moment|attention required|cf-challenge|__cf_chl_/i },
  { marker: 'cloudflare_ray', test: /cf-ray/i },
  { marker: 'akamai_reference', test: /reference\s*#\s*[0-9a-f.]+/i },
  { marker: 'sucuri', test: /sucuri|access denied.*cloudproxy/i },
  { marker: 'incapsula', test: /incapsula|_incap_/i },
  { marker: 'generic_waf', test: /web application firewall|request blocked|blocked by (?:waf|security policy)/i },
  { marker: 'captcha', test: /captcha|g-recaptcha|hcaptcha/i }
]

/** WAF/挑战页特征：只做"有证据的识别"，不猜。 */
export function detectWafMarkers(headers: Record<string, string>, bodyText: string): string[] {
  const markers = new Set<string>()
  if (headers['cf-mitigated']) markers.add('cf-mitigated')
  if (headers['x-sucuri-block']) markers.add('sucuri_block_header')
  if ((headers['server'] ?? '').toLowerCase().includes('cloudflare')) markers.add('server_cloudflare')
  const sample = bodyText.slice(0, 20_000)
  for (const signature of WAF_SIGNATURES) {
    if (signature.test.test(sample)) markers.add(signature.marker)
  }
  return [...markers]
}

export function classifyResponse(options: {
  status: number
  headers: Record<string, string>
  bodyText: string
  wafMarkers: string[]
}): Classification {
  const { status, headers, wafMarkers } = options
  if (status === 429) return 'rate_limited'
  if (status === 0) return 'unknown'
  // 有明确挑战/拦截特征才算 WAF；单纯 403 归 auth_denied（spec 明确要求区分）。
  if (wafMarkers.length && status >= 400) return 'waf_blocked'
  if (status === 401 || status === 403) return 'auth_denied'
  if (status === 503 && headers['retry-after']) return 'rate_limited'
  if (status >= 500) return 'server_error'
  return 'normal'
}

/** 限长片段：HTML 去标签压空白，JSON 原样截断，其余按文本处理。 */
export function excerptOf(body: Buffer, contentType: string, max = 1200): string {
  const text = body.subarray(0, Math.min(body.length, 64 * 1024)).toString('utf8')
  let cleaned = text
  if (looksLikeHtml(contentType, body)) {
    cleaned = text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  } else {
    cleaned = text.replace(/\s+/g, ' ').trim()
  }
  return redactBody(cleaned.slice(0, max))
}

export function diffExchanges(options: {
  baseline: HttpExchangeRecord
  candidate: HttpExchangeRecord
  baselineBody: string
  candidateBody: string
  marker?: string
}): ExchangeDiff {
  const { baseline, candidate, baselineBody, candidateBody, marker } = options
  const headerChanges: Array<{ name: string; from: string; to: string }> = []
  const names = new Set([...Object.keys(baseline.responseHeaders), ...Object.keys(candidate.responseHeaders)])
  for (const name of names) {
    const from = baseline.responseHeaders[name] ?? ''
    const to = candidate.responseHeaders[name] ?? ''
    if (from !== to) headerChanges.push({ name, from: from.slice(0, 120), to: to.slice(0, 120) })
  }
  const reflected = marker ? candidateBody.includes(marker) : false
  return {
    baseline: baseline.requestId,
    candidate: candidate.requestId,
    statusChanged: baseline.status !== candidate.status,
    status: { from: baseline.status, to: candidate.status },
    lengthDelta: candidate.responseBytes - baseline.responseBytes,
    bodyChanged: baseline.responseBodyHash !== candidate.responseBodyHash,
    headerChanges: headerChanges.slice(0, 20),
    reflected,
    classification: { from: baseline.classification, to: candidate.classification }
  }
}
