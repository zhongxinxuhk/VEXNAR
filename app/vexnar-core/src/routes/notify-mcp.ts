// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { Hono } from 'hono'
import { normalizeMcpTools, type McpTool } from './settings-catalog.ts'
import { meta, operations, parseJson, store } from '../context.ts'

// ─────────────────────────────────────────────────────────────────────────────
// 推送 / MCP / 侧边问答：Go 服务端 notify_api.go · notifier.go · mcpdiscover.go ·
// mcp_mgmt.go · side_questions.go 的 TS 迁移，运行在 dsh 进程内的 Hono
// 子应用（挂载前缀 /vexnar-api，路由自身仍以 /api 开头，与 routes.ts 一致）。
//
// 持久层全部走 SQLite（store 的 kv 表 + meta 表），不连 PostgreSQL：
//   notification_deliveries   投递历史（writer.list/put，与 operations.recordDelivery 同表）
//   side_questions            侧边问答请求（按 scope 维度分页）
//   side_question_sessions    侧边问答的上下文快照（由主 Agent 侧写入）
//   meta:notify / meta:mcp / meta:settings   渠道、MCP 服务器与全局设置
//
// 与 Go 的取舍（本切片刻意保留的差异，均不改变对前端的 JSON 契约）：
//   · email 渠道的 SMTP 会话在 dsh 进程内未内置，校验照做、发送返回 502 原始原因。
//   · Webhook 的 body_template 只支持标量占位符（{{.Title}} / {{json .Title}}），
//     Go 侧 text/template 的 range/if 未移植。
//   · 侧边问答不做模型调用：请求落库为 pending，由引擎补齐 answer；因此 Go 的
//     「尚无上下文快照」「模型配置已删除或变化」两条 409 在这里不阻塞入队。
// ─────────────────────────────────────────────────────────────────────────────

const DELIVERY_TABLE = 'notification_deliveries'
const SIDE_TABLE = 'side_questions'
const SIDE_SESSION_TABLE = 'side_question_sessions'
const META_CHANNELS = 'notify'
const META_MCP = 'mcp'
const META_SETTINGS = 'settings'

const SETTING_NOTIFY_ENABLED = 'notify_enabled'
const SETTING_NOTIFY_PUBLIC_BASE_URL = 'notify_public_base_url'
const SETTING_NOTIFY_DIGEST_MINUTES = 'notify_digest_interval_min'
const NOTIFY_DEFAULT_DIGEST_MINUTES = 30

const NOTIFY_MASKED_PREFIX = '__masked__'
const NOTIFY_ALLOW_LOCAL_ENV = 'VEXNAR_NOTIFY_ALLOW_LOCAL'
const NOTIFY_SEND_TIMEOUT_MS = 15_000
const NOTIFY_MAX_ERROR_CHARS = 500

const MCP_DISCOVER_TIMEOUT_MS = 45_000
const MCP_PROTOCOL_VERSION = '2025-06-18'
const MCP_MAX_IMPORT_BYTES = 1 << 20

const SIDE_MAX_QUESTION_RUNES = 4000
const SIDE_PAGE_DEFAULT = 20
const SIDE_PAGE_MAX = 50

type Json = Record<string, any>

/** 统一错误出口：StoreConflict → 409，其余按 error.status（默认 400）。 */
function errResponse(c: any, e: any) {
  return c.json({ error: String(e?.message ?? e) }, e?.name === 'StoreConflict' ? 409 : e?.status ?? 400)
}

function fail(message: string, status: number): Error {
  return Object.assign(new Error(message), { status })
}

const rfc3339 = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z')

const truncate = (text: string, max = NOTIFY_MAX_ERROR_CHARS) => {
  if (text.length <= max) return text
  let cut = max
  while (cut > 0 && (text.charCodeAt(cut) & 0xc0) === 0x80) cut--
  return `${text.slice(0, cut)}…`
}

const isMasked = (value: unknown) => typeof value === 'string' && value.startsWith(NOTIFY_MASKED_PREFIX)

// ─────────────────────────────────────────────────────────────────────────────
// meta 表读写（与 market.ts / skills.ts 的副本保持一致，跨模块不共享内部实现）
// ─────────────────────────────────────────────────────────────────────────────

async function loadMetaTable(name: string) {
  meta.reload()
  const tables = await meta.load()
  const rows = (tables[name] ?? []) as any[]
  tables[name] = rows
  return { tables, rows }
}

async function commitMeta(tables: Record<string, unknown>) {
  await meta.save(tables as any)
  meta.reload()
}

/** settings 是 [{key,value}] 形态的键值表（PG `SELECT key, value` 导入）。 */
async function settingsMap(): Promise<Map<string, string>> {
  const rows = await meta.table<any[]>(META_SETTINGS)
  const out = new Map<string, string>()
  for (const row of rows ?? []) {
    if (!row || row.key == null) continue
    out.set(String(row.key), row.value == null ? '' : String(row.value))
  }
  return out
}

function settingBool(settings: Map<string, string>, key: string, fallback: boolean): boolean {
  const raw = (settings.get(key) ?? '').trim().toLowerCase()
  if (!raw) return fallback
  if (['1', 'true', 'on', 'yes'].includes(raw)) return true
  if (['0', 'false', 'off', 'no'].includes(raw)) return false
  return fallback
}

function settingInt(settings: Map<string, string>, key: string, fallback: number): number {
  const raw = (settings.get(key) ?? '').trim()
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback
}

// ─────────────────────────────────────────────────────────────────────────────
// 通知渠道注册表（对应 Go 的 notify 包：Kinds / Validate / Send / SecretKeys）
// ─────────────────────────────────────────────────────────────────────────────

interface NotifyMessage {
  title: string
  vulnclass: string
  severity: string
  summary: string
  assets: string[]
  detail_url: string
  home_url: string
  sent_at: string
}

interface NotifyChannel {
  /** 官方建议的每分钟投递上限；0 = 不限流（通用 webhook 的默认）。 */
  defaultRatePerMin: number
  /** 回显时必须掩码的字段。 */
  secretKeys: string[]
  /** 决定凭据发往何处的字段；改它必须对凭据重新表态。 */
  destinationKeys: string[]
  validate(cfg: Json): void
  send(cfg: Json, msg: NotifyMessage): Promise<void>
}

function cfgString(cfg: Json, key: string): string {
  const raw = cfg?.[key]
  if (raw == null || isMasked(raw)) return ''
  return String(raw).trim()
}

function cfgInt(cfg: Json, key: string): number {
  const raw = cfgString(cfg, key)
  if (!raw) return 0
  const value = Number(raw)
  return Number.isFinite(value) ? Math.trunc(value) : 0
}

function cfgObject(cfg: Json, key: string): Json {
  const raw = cfg?.[key]
  if (raw == null || isMasked(raw)) return {}
  const value = typeof raw === 'string' ? parseJson(raw) : raw
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}
}

function allowLocalTargets(): boolean {
  const raw = (process.env[NOTIFY_ALLOW_LOCAL_ENV] ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true'
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'])

function blockedLiteralHost(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (LOOPBACK_HOSTS.has(bare)) return true
  if (/^127\./.test(bare)) return true
  if (/^169\.254\./.test(bare)) return true // 链路本地，含云元数据 169.254.169.254
  if (bare === '::' || bare === '::1') return true
  if (/^fe80:/i.test(bare)) return true
  return false
}

function blockedResolvedIp(address: string): boolean {
  const bare = address.toLowerCase()
  const v4 = bare.startsWith('::ffff:') ? bare.slice('::ffff:'.length) : bare
  if (blockedLiteralHost(v4)) return true
  return false
}

/** 校验 http(s) 目标；错误信息不得带出地址里的凭据（只报主机名）。 */
async function validateHttpTarget(raw: string): Promise<void> {
  if (!raw) throw fail('缺少目标 URL', 400)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw fail('目标 URL 无效: 地址无法解析', 400)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw fail(`目标 URL 无效: 只支持 http/https，收到 "${url.protocol.replace(':', '')}"`, 400)
  }
  if (!url.hostname) throw fail('目标 URL 无效: 缺少主机名', 400)
  if (allowLocalTargets()) return
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (blockedLiteralHost(host)) {
    throw fail(`拒绝投递到本机/链路本地地址 ${host}（如确需投递到本机服务，设置 ${NOTIFY_ALLOW_LOCAL_ENV}=1）`, 400)
  }
  // 主机名解析出的地址同样要过一遍，避免 DNS 记录把请求指向自身。
  try {
    const resolved = await lookup(host, { all: true })
    for (const entry of resolved) {
      if (blockedResolvedIp(String(entry.address))) {
        throw fail(`拒绝投递到本机/链路本地地址 ${host}（如确需投递到本机服务，设置 ${NOTIFY_ALLOW_LOCAL_ENV}=1）`, 400)
      }
    }
  } catch (error: any) {
    if (error?.status) throw error
    // 解析失败交给 send 去报真实错误，不在这里提前判死。
  }
}

async function notifyPost(url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) {
  let response: Response
  try {
    response = await fetch(url, {
      method: init.method ?? 'POST',
      headers: init.headers ?? {},
      body: init.body,
      signal: AbortSignal.timeout(NOTIFY_SEND_TIMEOUT_MS)
    })
  } catch (error: any) {
    throw new Error(`请求失败: ${String(error?.message ?? error)}`)
  }
  const text = await response.text().catch(() => '')
  if (!response.ok) throw new Error(`HTTP ${response.status}${text ? `: ${truncate(text, 200)}` : ''}`)
  return text
}

function renderWebhookTemplate(template: string, msg: NotifyMessage): string {
  const scalars: Record<string, string> = {
    Title: msg.title,
    HomeURL: msg.home_url,
    SentAt: msg.sent_at,
    Count: '1'
  }
  return template.replace(/\{\{\s*(json\s+)?\.(\w+)\s*\}\}/g, (_all, jsonFlag: string | undefined, key: string) => {
    const value = scalars[key] ?? ''
    return jsonFlag ? JSON.stringify(value) : value
  })
}

function webhookBody(cfg: Json, msg: NotifyMessage) {
  const template = cfgString(cfg, 'body_template')
  if (template) return renderWebhookTemplate(template, msg)
  return JSON.stringify({
    title: msg.title,
    batch: false,
    count: 1,
    items: [{
      finding_id: 0,
      name: msg.title,
      vulnclass: msg.vulnclass,
      severity: msg.severity,
      summary: msg.summary,
      assets: msg.assets,
      detail_url: msg.detail_url
    }]
  })
}

function markdownFor(msg: NotifyMessage): string {
  return [
    `#### ${msg.title}`,
    '',
    `- 类型: ${msg.vulnclass}`,
    `- 级别: ${msg.severity}`,
    '',
    msg.summary,
    ...(msg.detail_url ? ['', `[查看详情](${msg.detail_url})`] : [])
  ].join('\n')
}

async function expectJsonOk(text: string, keys: string[]): Promise<void> {
  if (!text.trim()) return
  let doc: Json | null = null
  try {
    doc = JSON.parse(text)
  } catch {
    return // 对端返回非 JSON 时以 HTTP 状态为准
  }
  for (const key of keys) {
    const value = (doc as Json)?.[key]
    if (value == null) continue
    const ok = value === 0 || value === '0' || value === true
    if (!ok) throw new Error(String((doc as Json).errmsg ?? (doc as Json).msg ?? `对端拒绝（${key}=${String(value)}）`))
    return
  }
}

const NOTIFY_CHANNELS: Record<string, NotifyChannel> = {
  dingtalk: {
    defaultRatePerMin: 20,
    secretKeys: ['webhook', 'secret'],
    destinationKeys: ['webhook'],
    validate(cfg) {
      const webhook = cfgString(cfg, 'webhook')
      if (!webhook) throw fail('缺少 Webhook 地址', 400)
      // 校验是异步的（要做 DNS 解析），这里只做同步部分，地址合法性在 send 前补。
    },
    async send(cfg, msg) {
      const webhook = cfgString(cfg, 'webhook')
      const secret = cfgString(cfg, 'secret')
      await validateHttpTarget(webhook)
      let url = webhook
      if (secret) {
        const ts = String(Date.now())
        const sign = createHmac('sha256', secret).update(`${ts}\n${secret}`).digest('base64')
        const glue = webhook.includes('?') ? '&' : '?'
        url = `${webhook}${glue}timestamp=${ts}&sign=${encodeURIComponent(sign)}`
      }
      const text = await notifyPost(url, {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msgtype: 'markdown', markdown: { title: msg.title, text: markdownFor(msg) } })
      })
      await expectJsonOk(text, ['errcode'])
    }
  },
  email: {
    defaultRatePerMin: 60,
    secretKeys: ['password'],
    destinationKeys: ['host', 'port', 'tls'],
    validate(cfg) {
      if (!cfgString(cfg, 'host')) throw fail('缺少 SMTP 主机', 400)
      if (!cfgString(cfg, 'from')) throw fail('缺少发件人', 400)
      const port = cfgInt(cfg, 'port')
      if (port < 0 || port > 65535) throw fail('SMTP 端口无效', 400)
    },
    async send() {
      throw new Error('email 渠道需要 SMTP 会话：dsh 进程内运行时未内置 SMTP 客户端，请在 Go 服务或通用 webhook 渠道上投递')
    }
  },
  feishu: {
    defaultRatePerMin: 100,
    secretKeys: ['webhook', 'secret'],
    destinationKeys: ['webhook'],
    validate(cfg) {
      if (!cfgString(cfg, 'webhook')) throw fail('缺少 Webhook 地址', 400)
    },
    async send(cfg, msg) {
      const webhook = cfgString(cfg, 'webhook')
      const secret = cfgString(cfg, 'secret')
      await validateHttpTarget(webhook)
      const payload: Json = { msg_type: 'text', content: { text: `${msg.title}\n${msg.summary}` } }
      if (secret) {
        // 飞书自定义机器人：签名以「timestamp\nsecret」为 HMAC 密钥、消息体为空。
        const ts = String(Math.floor(Date.now() / 1000))
        payload.timestamp = ts
        payload.sign = createHmac('sha256', `${ts}\n${secret}`).update('').digest('base64')
      }
      const text = await notifyPost(webhook, {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      })
      await expectJsonOk(text, ['code', 'StatusCode'])
    }
  },
  telegram: {
    defaultRatePerMin: 20,
    secretKeys: ['bot_token'],
    destinationKeys: ['base_url'],
    validate(cfg) {
      if (!cfgString(cfg, 'bot_token')) throw fail('缺少 Bot Token', 400)
      if (!cfgString(cfg, 'chat_id')) throw fail('缺少 Chat ID', 400)
    },
    async send(cfg, msg) {
      const token = cfgString(cfg, 'bot_token')
      const chatId = cfgString(cfg, 'chat_id')
      const base = (cfgString(cfg, 'base_url') || 'https://api.telegram.org').replace(/\/+$/, '')
      await validateHttpTarget(base)
      const text = await notifyPost(`${base}/bot${token}/sendMessage`, {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: `${msg.title}\n${msg.summary}`, disable_web_page_preview: true })
      })
      if (text.trim()) {
        let doc: Json | null = null
        try { doc = JSON.parse(text) } catch { doc = null }
        if (doc && doc.ok === false) throw new Error(String(doc.description ?? 'Telegram 拒绝投递'))
      }
    }
  },
  webhook: {
    defaultRatePerMin: 0,
    secretKeys: ['url', 'headers'],
    destinationKeys: ['url'],
    validate(cfg) {
      const url = cfgString(cfg, 'url')
      if (!url) throw fail('缺少目标 URL', 400)
      const method = cfgString(cfg, 'method').toUpperCase()
      if (method && !['GET', 'POST', 'PUT', 'PATCH'].includes(method)) {
        throw fail(`不支持的方法 ${method}（可用 GET/POST/PUT/PATCH）`, 400)
      }
      const template = cfgString(cfg, 'body_template')
      if (template && !template.includes('{')) throw fail('请求体模板语法错误: 未找到占位符', 400)
    },
    async send(cfg, msg) {
      const url = cfgString(cfg, 'url')
      await validateHttpTarget(url)
      const method = (cfgString(cfg, 'method') || 'POST').toUpperCase()
      const headers: Record<string, string> = {}
      const extra = cfgObject(cfg, 'headers')
      for (const [key, value] of Object.entries(extra)) headers[key] = String(value)
      const contentType = cfgString(cfg, 'content_type') || 'application/json'
      if (method !== 'GET') headers['content-type'] = headers['content-type'] ?? contentType
      const text = await notifyPost(url, {
        method,
        headers,
        body: method === 'GET' ? undefined : webhookBody(cfg, msg)
      })
      void text
    }
  },
  wecom: {
    defaultRatePerMin: 20,
    secretKeys: ['webhook'],
    destinationKeys: ['webhook'],
    validate(cfg) {
      if (!cfgString(cfg, 'webhook')) throw fail('缺少 Webhook 地址', 400)
    },
    async send(cfg, msg) {
      const webhook = cfgString(cfg, 'webhook')
      await validateHttpTarget(webhook)
      const text = await notifyPost(webhook, {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msgtype: 'markdown', markdown: { content: markdownFor(msg) } })
      })
      await expectJsonOk(text, ['errcode'])
    }
  }
}

/** Go notify.Kinds() 的字典序语义。 */
const notifyKinds = () => Object.keys(NOTIFY_CHANNELS).sort()

function notifyChannelOrThrow(kind: string): NotifyChannel {
  const channel = NOTIFY_CHANNELS[kind]
  if (!channel) throw fail(`渠道类型 "${kind}" 未注册`, 400)
  return channel
}

function notifyTestMessage(baseURL: string): NotifyMessage {
  return {
    title: '测试消息 · 渠道配置正常',
    vulnclass: '连通性测试',
    severity: 'low',
    summary: '这是 VEXNAR 推送渠道的测试消息，收到即表示该渠道配置可用。',
    assets: ['vexnar.example.com'],
    detail_url: baseURL,
    home_url: baseURL,
    sent_at: rfc3339(new Date())
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 投递历史
// ─────────────────────────────────────────────────────────────────────────────

const NOTIFY_STATE_ALIASES: Record<string, string> = {
  ok: 'sent', success: 'sent', sent: 'sent', delivered: 'sent',
  failed: 'failed', fail: 'failed', error: 'failed',
  pending: 'pending', queued: 'pending', sending: 'sending', claimed: 'sending',
  skipped: 'skipped'
}

function notifyStateOf(row: any): string {
  const raw = String(row?.state ?? row?.status ?? '').trim().toLowerCase()
  return NOTIFY_STATE_ALIASES[raw] ?? (raw || 'pending')
}

function deliveryDto(row: any, channels: Map<number, any>): Json {
  const state = notifyStateOf(row)
  const channelId = Number(row.channel_id ?? 0) || 0
  const channel = channels.get(channelId)
  const createdAt = String(row.created_at ?? '')
  const dto: Json = {
    id: Number(row.id),
    finding_id: String(row.finding_id ?? '0'),
    event_kind: String(row.event_kind ?? ''),
    channel_id: channelId,
    channel_name: String(row.channel_name ?? channel?.name ?? ''),
    channel_kind: String(row.channel_kind ?? channel?.kind ?? ''),
    state,
    attempts: Number(row.attempts ?? 0) || 0,
    last_error: String(row.last_error ?? row.error ?? ''),
    created_at: createdAt,
    next_attempt_at: String(row.next_attempt_at ?? createdAt),
    title: String(row.title ?? ''),
    severity: String(row.severity ?? '')
  }
  if (row.batch_id != null) dto.batch_id = Number(row.batch_id)
  if (row.sent_at) dto.sent_at = String(row.sent_at)
  else if (state === 'sent' && createdAt) dto.sent_at = createdAt
  return dto
}

async function channelIndex(): Promise<Map<number, any>> {
  const rows = await meta.table<any[]>(META_CHANNELS)
  const out = new Map<number, any>()
  for (const row of rows ?? []) out.set(Number(row.id), row)
  return out
}

async function notifyStats(channels: any[], deliveries: any[]) {
  const today = new Date().toISOString().slice(0, 10)
  let pending = 0
  let failed = 0
  let sentToday = 0
  let oldest = 0
  for (const row of deliveries) {
    const state = notifyStateOf(row)
    if (state === 'pending' || state === 'sending') {
      pending++
      const created = Date.parse(String(row.created_at ?? ''))
      if (Number.isFinite(created) && (oldest === 0 || created < oldest)) oldest = created
    } else if (state === 'failed') {
      failed++
    } else if (state === 'sent') {
      if (String(row.sent_at ?? row.created_at ?? '').slice(0, 10) === today) sentToday++
    }
  }
  return {
    channels: channels.length,
    channels_on: channels.filter((row) => row.enabled !== false).length,
    pending,
    failed,
    sent_today: sentToday,
    backlog_age_ms: oldest ? Math.max(Date.now() - oldest, 0) : 0
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP：导入解析（对应 Go 的 extractMCPServers / mcpServerFromImport）
// ─────────────────────────────────────────────────────────────────────────────

/** 从三种常见形态里找出 mcpServers 段：Claude Desktop、CC Switch 分组、直接映射。 */
function extractMcpServers(payload: any): Record<string, any> {
  if (payload == null) throw fail('缺少要导入的 JSON（json / config / raw 任一字段）', 400)
  let generic: any = payload
  if (typeof payload === 'string') {
    try {
      generic = JSON.parse(payload)
    } catch (error: any) {
      throw fail(`JSON 解析失败：${String(error?.message ?? error)}`, 400)
    }
  }
  if (!generic || typeof generic !== 'object' || Array.isArray(generic)) {
    throw fail('JSON 解析失败：顶层必须是对象', 400)
  }
  const direct = (generic as Json).mcpServers
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) return direct as Record<string, any>
  for (const key of Object.keys(generic).sort()) {
    const nested = (generic as Json)[key]
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue
    for (const field of ['mcpServers', 'servers']) {
      const servers = (nested as Json)[field]
      if (servers && typeof servers === 'object' && !Array.isArray(servers) && Object.keys(servers).length) {
        return servers as Record<string, any>
      }
    }
  }
  const keys = Object.keys(generic)
  if (keys.length && keys.every((key) => key !== 'mcpServers')) {
    const looksLikeServers = keys.every((key) => {
      const entry = (generic as Json)[key]
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
      return Boolean(String((entry as Json).command ?? '').trim() || String((entry as Json).url ?? '').trim())
    })
    if (looksLikeServers) {
      const out: Record<string, any> = {}
      for (const key of keys) out[key] = (generic as Json)[key]
      return out
    }
  }
  throw fail('未找到 mcpServers 配置（支持 Claude Desktop / CC Switch 的 JSON）', 400)
}

interface McpServerInput {
  name: string
  transport: 'stdio' | 'http' | 'sse'
  command: string
  url: string
  args: string[]
  env: Record<string, string>
  enabled: boolean
}

/** 把一条导入配置规范化成落库形态；失败原因直接回给用户（Go 的 skipped.reason）。 */
function mcpServerFromImport(name: string, raw: any, enabled: boolean): McpServerInput {
  const serverName = String(name ?? '').trim()
  if (!serverName) throw new Error('服务器名不能为空')
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('配置解析失败：必须是对象')
  const cfg = raw as Json
  const command = String(cfg.command ?? '').trim()
  const rawURL = String(cfg.url ?? '').trim()
  let transport = String(cfg.type ?? '').trim().toLowerCase()
  if (!transport) {
    if (command) transport = 'stdio'
    else if (rawURL.toLowerCase().endsWith('/sse')) transport = 'sse'
    else transport = 'http'
  }
  if (transport === 'streamable-http' || transport === 'streamablehttp') transport = 'http'
  if (!['stdio', 'http', 'sse'].includes(transport)) throw new Error(`不支持的传输方式：${String(cfg.type ?? '')}`)
  if (transport === 'stdio' && !command) throw new Error('stdio 服务器缺少 command')
  if (transport !== 'stdio' && !rawURL) throw new Error(`${transport} 服务器缺少 url`)
  const args = Array.isArray(cfg.args) ? cfg.args.map((item: any) => (typeof item === 'string' ? item : String(item))) : []
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(cfgObject(cfg, 'env'))) env[key] = String(value)
  // HTTP/SSE 的 headers 与 stdio 的 env 共用一列（Go mcphttp 把 env 当 header 发）。
  for (const [key, value] of Object.entries(cfgObject(cfg, 'headers'))) env[key] = String(value)
  return {
    name: serverName,
    transport: transport as 'stdio' | 'http' | 'sse',
    command,
    url: rawURL,
    args,
    env,
    enabled: enabled && cfg.disabled !== true
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP：工具发现（对应 Go connectMCP + discoverAndCacheMCP）
// ─────────────────────────────────────────────────────────────────────────────

function mcpArgs(server: any): string[] {
  return Array.isArray(server?.args) ? server.args.map((item: any) => String(item)) : []
}

function mcpEnv(server: any): Record<string, string> {
  const raw = typeof server?.env === 'string' ? parseJson(server.env) : server?.env
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Json)) out[key] = String(value)
  return out
}

async function discoverStdioTools(server: any, timeoutMs: number): Promise<McpTool[]> {
  const command = String(server?.command ?? '').trim()
  if (!command) throw new Error('stdio 传输缺少命令')
  const child = spawn(command, mcpArgs(server), {
    env: { ...process.env, ...mcpEnv(server) },
    stdio: ['pipe', 'pipe', 'pipe']
  })

  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>()
  let buffer = ''
  let stderr = ''
  let closed = false
  let nextId = 1
  let timer: ReturnType<typeof setTimeout> | undefined

  const settleAll = (error?: Error) => {
    closed = true
    if (timer) clearTimeout(timer)
    for (const [, entry] of pending) {
      if (error) entry.reject(error)
      else entry.reject(new Error('连接已关闭'))
    }
    pending.clear()
    try { child.kill('SIGKILL') } catch {}
  }

  const onFailure = (error: Error) => {
    const detail = stderr.trim()
    settleAll(detail ? new Error(`${String(error?.message ?? error)}（stderr: ${truncate(detail, 300)}）`) : error)
  }

  child.on('error', (error: any) => onFailure(new Error(`启动 MCP 进程失败: ${String(error?.message ?? error)}`)))
  child.on('exit', (code: number | null, signal: string | null) => {
    if (closed) return
    settleAll(new Error(`MCP 进程已退出（code=${code ?? 'null'}${signal ? `, signal=${signal}` : ''}）`))
  })
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => { stderr += chunk })
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    buffer += chunk
    let index = buffer.indexOf('\n')
    while (index >= 0) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      index = buffer.indexOf('\n')
      if (!line || line.startsWith('Content-Length:')) continue
      let message: Json
      try { message = JSON.parse(line) } catch { continue }
      const id = Number((message as Json).id)
      const entry = pending.get(id)
      if (!entry) continue
      pending.delete(id)
      if ((message as Json).error) entry.reject(new Error(String((message as Json).error?.message ?? 'JSON-RPC 错误')))
      else entry.resolve((message as Json).result)
    }
  })

  const request = (method: string, params: Json) => new Promise<any>((resolve, reject) => {
    if (closed) { reject(new Error('连接已关闭')); return }
    const id = nextId++
    pending.set(id, { resolve, reject })
    try {
      child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    } catch (error: any) {
      pending.delete(id)
      reject(new Error(`写入 MCP 进程失败: ${String(error?.message ?? error)}`))
    }
  })

  const notify = (method: string, params: Json) => {
    try { child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`) } catch {}
  }

  try {
    timer = setTimeout(() => onFailure(new Error(`工具发现超时（${timeoutMs}ms）`)), timeoutMs)
    await request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'vexnar-dsh', version: '0.1.0' }
    })
    notify('notifications/initialized', {})
    const listed = await request('tools/list', {})
    return normalizeMcpTools((listed as any)?.tools)
  } finally {
    settleAll()
  }
}

function parseRpcPayload(text: string, contentType: string): any {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (contentType.includes('text/event-stream') || trimmed.startsWith('event:') || trimmed.startsWith('data:')) {
    let last: any = null
    for (const line of trimmed.split('\n')) {
      const value = line.startsWith('data:') ? line.slice('data:'.length).trim() : ''
      if (!value) continue
      try {
        const parsed = JSON.parse(value)
        if (parsed && (parsed.result !== undefined || parsed.error !== undefined)) last = parsed
      } catch {}
    }
    if (last) return last
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

async function discoverHttpTools(server: any, timeoutMs: number): Promise<McpTool[]> {
  const url = String(server?.url ?? '').trim()
  const transport = String(server?.transport ?? 'http')
  if (!url) throw new Error(`${transport} 传输缺少 URL`)
  const baseHeaders: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...mcpEnv(server)
  }
  let session = ''
  let nextId = 1

  const call = async (method: string, params: Json) => {
    const headers: Record<string, string> = { ...baseHeaders }
    if (session) headers['mcp-session-id'] = session
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
        signal: AbortSignal.timeout(timeoutMs)
      })
    } catch (error: any) {
      throw new Error(`请求失败: ${String(error?.message ?? error)}`)
    }
    const sid = response.headers.get('mcp-session-id')
    if (sid) session = sid
    const text = await response.text().catch(() => '')
    if (!response.ok) throw new Error(`HTTP ${response.status}${text ? `: ${truncate(text, 200)}` : ''}`)
    const message = parseRpcPayload(text, response.headers.get('content-type') ?? '')
    if (message?.error) throw new Error(String(message.error?.message ?? 'JSON-RPC 错误'))
    return message?.result ?? null
  }

  await call('initialize', {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'vexnar-dsh', version: '0.1.0' }
  })
  try { await call('notifications/initialized', {}) } catch {}
  const listed = await call('tools/list', {})
  return normalizeMcpTools((listed as any)?.tools)
}

async function discoverTools(server: any): Promise<McpTool[]> {
  const transport = String(server?.transport ?? 'stdio')
  const timeout = MCP_DISCOVER_TIMEOUT_MS
  if (transport === 'stdio') return discoverStdioTools(server, timeout)
  // 旧版 SSE 的 GET 握手在 dsh 进程内未实现；两种远端传输都按 Streamable HTTP 打。
  if (transport === 'http' || transport === 'sse') return discoverHttpTools(server, timeout)
  throw new Error(`未知传输方式 "${transport}"`)
}

async function findMcpServer(id: string) {
  const rows = await meta.table<any[]>(META_MCP)
  const row = (rows ?? []).find((item) => Number(item.id) === Number(id))
  if (!row) throw fail('MCP 不存在', 404)
  return { rows, row }
}

// ─────────────────────────────────────────────────────────────────────────────
// 侧边问答（对应 server/side_questions.go 的 HTTP 契约；推理由引擎补齐）
// ─────────────────────────────────────────────────────────────────────────────

const SIDE_CLIENT_ID = /^[A-Za-z0-9._:-]{1,128}$/

interface SideScope {
  scope: string
  task_id: number
  conversation_id: number
  intent_id: number
}

function sideScope(input: Json): SideScope {
  const scopeRaw = String(input.scope ?? '').trim()
  const taskId = Number(input.task_id ?? 0) || 0
  const conversationId = Number(input.conversation_id ?? 0) || 0
  const intentId = Number(input.intent_id ?? 0) || 0
  if (taskId < 0 || conversationId < 0 || intentId < 0) throw fail('id 不能为负数', 400)
  if (scopeRaw) {
    if (!/^[A-Za-z0-9._:-]{1,160}$/.test(scopeRaw)) throw fail('scope 不合法', 400)
    return { scope: scopeRaw, task_id: taskId, conversation_id: conversationId, intent_id: intentId }
  }
  if (conversationId > 0) return { scope: `conv-${conversationId}`, task_id: 0, conversation_id: conversationId, intent_id: 0 }
  if (intentId > 0) {
    if (taskId <= 0) throw fail('worker 作用域需要同时提供 task_id', 400)
    return { scope: `task-${taskId}-worker-${intentId}`, task_id: taskId, conversation_id: 0, intent_id: intentId }
  }
  if (taskId > 0) return { scope: `task-${taskId}-main`, task_id: taskId, conversation_id: 0, intent_id: 0 }
  throw fail('需要 task_id 或 conversation_id', 400)
}

function sideDto(row: any): Json {
  const model = typeof row.model === 'string' ? parseJson(row.model) : row.model
  const context = typeof row.context === 'string' ? parseJson(row.context) : row.context
  const dto: Json = {
    id: String(row.id),
    client_request_id: String(row.client_request_id ?? ''),
    question: String(row.question ?? ''),
    answer: String(row.answer ?? ''),
    status: String(row.status ?? 'pending'),
    model: model && typeof model === 'object' ? model : {},
    snapshot_at: String(row.snapshot_at ?? ''),
    created_at: String(row.created_at ?? ''),
    sequence: Number(row.sequence ?? row.ordinal ?? 0),
    usage: row.usage ?? {},
    ordinal: Number(row.ordinal ?? 0),
    context: context && typeof context === 'object' ? context : {}
  }
  if (row.error) dto.error = String(row.error)
  return dto
}

async function sideSnapshot(scope: string) {
  const record = await operations.writer.readRecord(SIDE_SESSION_TABLE, scope)
  if (!record) return null
  const model = typeof record.model === 'string' ? parseJson(record.model) : record.model
  return {
    captured_at: String(record.captured_at ?? ''),
    model: model && typeof model === 'object' ? model : {},
    available: true,
    reason: ''
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 路由
// ─────────────────────────────────────────────────────────────────────────────

export function register(api: Hono) {
  // ── 通知：投递历史 ────────────────────────────────────────────────────────
  api.get('/api/notify/deliveries', async (c) => {
    try {
      const page = Math.max(Number(c.req.query('page') ?? 1) || 1, 1)
      const requested = Number(c.req.query('page_size') ?? 50) || 50
      const pageSize = requested <= 0 || requested > 200 ? 50 : Math.trunc(requested)
      const state = (c.req.query('state') ?? '').trim().toLowerCase()
      const eventKind = (c.req.query('event_kind') ?? '').trim()
      const channelId = Number(c.req.query('channel_id') ?? 0) || 0
      const rows = await operations.writer.list(DELIVERY_TABLE)
      const channels = await channelIndex()
      let items = rows.map((row: any) => deliveryDto(row, channels))
      if (state) items = items.filter((item) => item.state === state)
      if (eventKind) items = items.filter((item) => item.event_kind === eventKind)
      if (channelId > 0) items = items.filter((item) => item.channel_id === channelId)
      items.sort((a: Json, b: Json) => Number(b.id) - Number(a.id))
      const total = items.length
      const pageItems = items.slice((page - 1) * pageSize, page * pageSize)
      return c.json({ deliveries: pageItems, total, page, page_size: pageSize })
    } catch (e: any) { return errResponse(c, e) }
  })

  // ── 通知：手动重发一条投递 ────────────────────────────────────────────────
  api.post('/api/notify/deliveries/:id/retry', async (c) => {
    try {
      const id = String(c.req.param('id'))
      if (!/^\d+$/.test(id)) throw fail('投递 id 无效', 400)
      const current = await operations.writer.readRecord(DELIVERY_TABLE, id)
      const state = current ? notifyStateOf(current) : ''
      if (!current || !['pending', 'failed', 'skipped'].includes(state)) {
        throw fail(`投递 ${id} 不存在或当前状态不允许重发`, 400)
      }
      // 人工点「重发」意味着上次失败的原因已被处理：清零重试计数并立即到期。
      const next: Json = {
        ...current,
        state: 'pending',
        status: 'pending',
        attempts: 0,
        last_error: '',
        error: '',
        next_attempt_at: rfc3339(new Date())
      }
      delete next.rev
      await operations.writer.put({ table: DELIVERY_TABLE, key: id, record: next, expectedRev: Number((current as any).rev ?? 0) })
      return c.json({ ok: true })
    } catch (e: any) { return errResponse(c, e) }
  })

  // ── 通知：渠道类型元数据 + 全局设置 + 健康度概览 ───────────────────────────
  api.get('/api/notify/meta', async (c) => {
    try {
      const settings = await settingsMap()
      const channels = (await meta.table<any[]>(META_CHANNELS)) ?? []
      const deliveries = await operations.writer.list(DELIVERY_TABLE)
      return c.json({
        kinds: notifyKinds().map((kind) => ({
          kind,
          default_rate_per_min: NOTIFY_CHANNELS[kind].defaultRatePerMin,
          secret_keys: NOTIFY_CHANNELS[kind].secretKeys
        })),
        enabled: settingBool(settings, SETTING_NOTIFY_ENABLED, true),
        public_base_url: (settings.get(SETTING_NOTIFY_PUBLIC_BASE_URL) ?? '').replace(/\/+$/, ''),
        digest_interval_min: settings.get(SETTING_NOTIFY_DIGEST_MINUTES) ?? '',
        defaults: { digest_interval_min: settingInt(settings, SETTING_NOTIFY_DIGEST_MINUTES, NOTIFY_DEFAULT_DIGEST_MINUTES) },
        stats: await notifyStats(channels as any[], deliveries as any[])
      })
    } catch (e: any) { return errResponse(c, e) }
  })

  // ── 通知：用当前保存的配置同步发一条测试消息 ───────────────────────────────
  api.post('/api/notify/channels/:id/test', async (c) => {
    try {
      const id = String(c.req.param('id'))
      if (!/^\d+$/.test(id)) throw fail('渠道 id 无效', 400)
      const rows = await meta.table<any[]>(META_CHANNELS)
      const row = (rows ?? []).find((item) => Number(item.id) === Number(id))
      if (!row) throw fail('通知渠道不存在', 404)
      const channel = notifyChannelOrThrow(String(row.kind ?? ''))
      const cfg: Json = typeof row.config === 'string' ? (parseJson(row.config) as Json) ?? {} : row.config ?? {}
      // 校验错误是 400（配置问题），发送错误是 502（对端问题）——与 Go 一致。
      channel.validate(cfg)
      const settings = await settingsMap()
      const baseURL = (settings.get(SETTING_NOTIFY_PUBLIC_BASE_URL) ?? '').replace(/\/+$/, '')
      const message = notifyTestMessage(baseURL)
      const started = Date.now()
      try {
        await channel.send(cfg, message)
      } catch (error: any) {
        throw fail(String(error?.message ?? error), 502)
      }
      return c.json({ ok: true, latency_ms: Date.now() - started })
    } catch (e: any) { return errResponse(c, e) }
  })

  // ── MCP：批量导入配置 ────────────────────────────────────────────────────
  api.post('/api/mcp/import', async (c) => {
    try {
      const text = await c.req.text().catch(() => '')
      if (text.length > MCP_MAX_IMPORT_BYTES) throw fail('导入内容超过 1MB', 400)
      let body: Json = {}
      if (text.trim()) {
        try {
          const parsed = JSON.parse(text)
          body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { raw: text }
        } catch (error: any) {
          throw fail(`请求体不是合法 JSON：${String(error?.message ?? error)}`, 400)
        }
      }
      let payload: any = body.json ?? body.config
      if (payload == null && typeof body.raw === 'string' && body.raw.trim()) payload = body.raw
      if (payload == null) throw fail('缺少要导入的 JSON（json / config / raw 任一字段）', 400)
      const servers = extractMcpServers(payload)
      const enabled = body.enabled === undefined ? true : Boolean(body.enabled)
      const overwrite = Boolean(body.overwrite)
      const existingRows = (await meta.table<any[]>(META_MCP)) ?? []
      const byName = new Map<string, any>()
      for (const row of existingRows) byName.set(String(row.name ?? '').toLowerCase(), row)
      const names = Object.keys(servers).sort()
      const imported: Json[] = []
      const skipped: Json[] = []
      for (const name of names) {
        let server: McpServerInput
        try {
          server = mcpServerFromImport(name, servers[name], enabled)
        } catch (error: any) {
          skipped.push({ name, reason: String(error?.message ?? error) })
          continue
        }
        const existing = byName.get(server.name.toLowerCase())
        if (existing && !overwrite) {
          skipped.push({ name, reason: '同名 MCP 已存在（勾选覆盖可替换）' })
          continue
        }
        try {
          const saved = await operations.saveMcpServer({
            ...(existing ? { id: Number(existing.id) } : {}),
            name: server.name,
            transport: server.transport,
            command: server.command,
            url: server.url,
            args: server.args,
            env: server.env,
            enabled: server.enabled,
            insecure: Boolean((servers[name] as Json)?.insecure)
          })
          imported.push({ id: Number((saved as any).id), name: server.name, transport: server.transport })
        } catch (error: any) {
          skipped.push({ name, reason: String(error?.message ?? error) })
        }
      }
      meta.reload()
      return c.json({ imported, skipped, total: names.length })
    } catch (e: any) { return errResponse(c, e) }
  })

  // ── MCP：按需重新发现工具并回写缓存 ────────────────────────────────────────
  api.post('/api/mcp/:id/refresh', async (c) => {
    try {
      const { rows, row } = await findMcpServer(c.req.param('id'))
      let tools: McpTool[]
      try {
        tools = await discoverTools(row)
      } catch (error: any) {
        throw fail(`工具发现失败：${String(error?.message ?? error)}`, 502)
      }
      row.tools = tools
      await commitMeta({ [META_MCP]: rows })
      return c.json({ id: Number(row.id), name: String(row.name ?? ''), transport: String(row.transport ?? ''), enabled: row.enabled !== false, tools })
    } catch (e: any) { return errResponse(c, e) }
  })

  // ── 侧边问答：历史 ──────────────────────────────────────────────────────
  api.get('/api/side-questions', async (c) => {
    try {
      const scope = sideScope({
        scope: c.req.query('scope'),
        task_id: c.req.query('task_id'),
        conversation_id: c.req.query('conversation_id'),
        intent_id: c.req.query('intent_id')
      })
      const before = Number(c.req.query('before') ?? 0) || 0
      const requested = Number(c.req.query('limit') ?? SIDE_PAGE_DEFAULT) || SIDE_PAGE_DEFAULT
      const limit = Math.min(Math.max(requested, 1), SIDE_PAGE_MAX)
      const rows = await operations.writer.list(SIDE_TABLE)
      const mine = rows
        .filter((row: any) => String(row.scope ?? '') === scope.scope)
        .filter((row: any) => before <= 0 || Number(row.ordinal ?? 0) < before)
        .sort((a: any, b: any) => Number(b.ordinal ?? 0) - Number(a.ordinal ?? 0))
      const hasMore = mine.length > limit
      const pageRows = hasMore ? mine.slice(0, limit) : mine
      const currentRow = (await operations.writer.list(SIDE_TABLE))
        .filter((row: any) => String(row.scope ?? '') === scope.scope && String(row.status ?? '') === 'running')
        .sort((a: any, b: any) => Number(b.ordinal ?? 0) - Number(a.ordinal ?? 0))[0]
      return c.json({
        items: pageRows.map(sideDto),
        current: currentRow ? sideDto(currentRow) : null,
        next_cursor: hasMore && pageRows.length ? Number((pageRows[pageRows.length - 1] as any).ordinal ?? 0) : 0,
        snapshot: await sideSnapshot(scope.scope)
      })
    } catch (e: any) { return errResponse(c, e) }
  })

  // ── 侧边问答：提问 ──────────────────────────────────────────────────────
  api.post('/api/side-questions', async (c) => {
    try {
      const text = await c.req.text().catch(() => '')
      if (text.length > 32 * 1024) throw fail('请求体过大', 400)
      let body: Json
      try {
        body = text.trim() ? JSON.parse(text) : {}
      } catch {
        throw fail('bad json', 400)
      }
      const question = String(body.question ?? '').trim()
      const clientRequestId = String(body.client_request_id ?? '')
      if (!question || Array.from(question).length > SIDE_MAX_QUESTION_RUNES || !SIDE_CLIENT_ID.test(clientRequestId)) {
        throw fail('问题须为 1–4000 字符，并提供有效请求 ID', 400)
      }
      const scope = sideScope(body)
      if (scope.task_id > 0) {
        const task = await store.tasks.get(String(scope.task_id))
        if (!task) throw fail('task not found', 404)
        if ((task as any).deleted_at_text || (task as any).archived_at_text) throw fail('任务已归档或正在删除', 409)
      }
      const rows = await operations.writer.list(SIDE_TABLE)
      const existing = rows.find((row: any) => String(row.scope ?? '') === scope.scope && String(row.client_request_id ?? '') === clientRequestId)
      if (existing) {
        if (String((existing as any).question ?? '') !== question) throw fail('同一请求 ID 不能用于不同问题', 409)
        return c.json(sideDto(existing), 200)
      }
      const busy = rows.some((row: any) => String(row.scope ?? '') === scope.scope && String(row.status ?? '') === 'running')
      if (busy) throw fail('当前会话已有旁路问题正在回答', 409)
      const snapshot = await sideSnapshot(scope.scope)
      const id = (await operations.writer.maxKey(SIDE_TABLE)) + 1
      const ordinal = rows
        .filter((row: any) => String(row.scope ?? '') === scope.scope)
        .reduce((max: number, row: any) => Math.max(max, Number(row.ordinal ?? 0)), 0) + 1
      const record: Json = {
        id,
        ordinal,
        sequence: ordinal,
        scope: scope.scope,
        task_id: scope.task_id || null,
        conversation_id: scope.conversation_id || null,
        intent_id: scope.intent_id || null,
        question,
        client_request_id: clientRequestId,
        answer: '',
        status: 'pending',
        error: '',
        model: snapshot?.model ?? {},
        snapshot_at: snapshot?.captured_at ?? '',
        usage: {},
        context: {},
        created_at: rfc3339(new Date()),
        answered_at: ''
      }
      const written = await operations.writer.put({ table: SIDE_TABLE, key: String(id), record })
      return c.json(sideDto(written), 201)
    } catch (e: any) { return errResponse(c, e) }
  })
}
