// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from 'hono'
import { meta, operations, store } from '../context.ts'

/**
 * LLM 池 / 记录 / 用量 迁移路由。
 *
 * 数据面分两块：
 *   - `llmProfiles` / `settings` 属 meta 域（单文档），读走 meta.table、写走
 *     meta.load → mutate → meta.save + meta.reload；
 *   - `llm_records` / `llm_usage` / `llm_profile_health` / `activity` /
 *     `tool_usage` / `conversations` 属 kv 域，统一走 operations.writer.list 聚合，
 *     保证读到的永远是最新写入（不经 store 读侧缓存）。
 *
 * failover / 账本语义与 Go 对齐：
 *   - 激活配置（is_default）永远排链首；链序 = is_default DESC → priority DESC → id ASC；
 *   - 熔断状态从 llm_profile_health 恢复（open_until > now = tripped；fails > 0 = degraded）；
 *   - 用量聚合以 llm_usage 账本为准（按 model / profile / 天），与 activity 的
 *     kind='result' 分桶是两套来源，互不混用。
 */
const writer = operations.writer

// ── 通用 ───────────────────────────────────────────────────────────────────

function fail(c: any, error: any) {
  const status = error?.name === 'StoreConflict' ? 409 : error?.status ?? 400
  return c.json({ error: String(error?.message ?? error) }, status)
}

async function jsonBody(c: any): Promise<any> {
  return c.req.json().catch(() => ({}))
}

// ── 重试规则（db/llmretry.go 的 clamp 语义）────────────────────────────────

const MAX_RETRY_ATTEMPTS = 20
const MAX_RETRY_INTERVAL_MS = 3_600_000

function clampRule(rule: any): { attempts: number; interval_ms: number } {
  let attempts = Number(rule?.attempts ?? 0)
  let intervalMs = Number(rule?.interval_ms ?? 0)
  if (!Number.isFinite(attempts)) attempts = 0
  if (attempts < -1) attempts = -1
  if (attempts > MAX_RETRY_ATTEMPTS) attempts = MAX_RETRY_ATTEMPTS
  if (!Number.isFinite(intervalMs)) intervalMs = 0
  if (intervalMs < 0) intervalMs = 0
  if (intervalMs > MAX_RETRY_INTERVAL_MS) intervalMs = MAX_RETRY_INTERVAL_MS
  return { attempts, interval_ms: intervalMs }
}

function zeroRule() {
  return { attempts: 0, interval_ms: 0 }
}

function zeroOverride() {
  return { connect: zeroRule(), empty: zeroRule(), stream: zeroRule() }
}

function zeroPolicy() {
  return { connect: zeroRule(), empty: zeroRule(), stream: zeroRule(), breaker: zeroRule(), intent: zeroRule() }
}

function clampOverride(override: any) {
  return { connect: clampRule(override?.connect), empty: clampRule(override?.empty), stream: clampRule(override?.stream) }
}

function clampPolicy(policy: any) {
  return {
    connect: clampRule(policy?.connect),
    empty: clampRule(policy?.empty),
    stream: clampRule(policy?.stream),
    breaker: clampRule(policy?.breaker),
    intent: clampRule(policy?.intent)
  }
}

function readRetryOverride(row: any) {
  if (row?.retry && typeof row.retry === 'object') return clampOverride(row.retry)
  return {
    connect: { attempts: Number(row?.retry_connect_attempts ?? 0), interval_ms: Number(row?.retry_connect_interval_ms ?? 0) },
    empty: { attempts: Number(row?.retry_empty_attempts ?? 0), interval_ms: Number(row?.retry_empty_interval_ms ?? 0) },
    stream: { attempts: Number(row?.retry_stream_attempts ?? 0), interval_ms: Number(row?.retry_stream_interval_ms ?? 0) }
  }
}

// ── base URL 归一化（agent/provider.go NormalizeBaseURL）────────────────────

function trimSuffix(value: string, suffix: string): string {
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value
}

function normalizeBaseURL(raw: unknown): string {
  let b = String(raw ?? '').trim()
  for (const suffix of ['/chat/completions', '/v1/messages', '/responses']) {
    b = trimSuffix(b.replace(/\/+$/, ''), suffix)
  }
  return b.replace(/\/+$/, '')
}

// ── meta 域读写 ────────────────────────────────────────────────────────────

async function listProfiles(): Promise<any[]> {
  const rows = await meta.table('llmProfiles')
  return Array.isArray(rows) ? rows : []
}

async function saveProfiles(rows: any[]) {
  const tables = await meta.load()
  tables.llmProfiles = rows
  await meta.save(tables)
  meta.reload()
}

async function loadSettings(): Promise<Record<string, any>> {
  const raw = (await meta.load()).settings
  if (Array.isArray(raw)) {
    const out: Record<string, any> = {}
    for (const row of raw) if (row && row.key != null) out[row.key] = row.value
    return out
  }
  return raw && typeof raw === 'object' ? raw : {}
}

async function saveSettings(next: Record<string, any>) {
  const tables = await meta.load()
  tables.settings = next
  await meta.save(tables)
  meta.reload()
}

// ── profile DTO（server/dto.go llmProfileDTO）───────────────────────────────

function profileDTO(row: any) {
  const dto: Record<string, any> = {
    id: String(row.id),
    name: String(row.name ?? ''),
    format: String(row.format ?? ''),
    model: String(row.model ?? ''),
    rate_per_second: Number(row.rate_per_second ?? 0),
    rate_per_minute: Number(row.rate_per_minute ?? 0),
    context_window_k: Number(row.context_window_k ?? 0),
    thinking_type: String(row.thinking_type ?? ''),
    reasoning_effort: String(row.reasoning_effort ?? ''),
    is_default: Boolean(row.is_default),
    priority: Number(row.priority ?? 0),
    pool_exclude: Boolean(row.pool_exclude),
    streaming: row.streaming == null ? true : Boolean(row.streaming),
    max_tokens: Number(row.max_tokens ?? 0),
    max_tokens_field: String(row.max_tokens_field ?? ''),
    session_header_key: String(row.session_header_key ?? ''),
    retry: readRetryOverride(row)
  }
  if (row.base_url != null && row.base_url !== '') dto.base_url = row.base_url
  if (row.proxy != null && row.proxy !== '') dto.proxy = row.proxy
  if (row.api_key_hint != null && row.api_key_hint !== '') dto.api_key_hint = row.api_key_hint
  return dto
}

function buildProfileRecord(input: any) {
  const retry = input.retry ?? zeroOverride()
  return {
    id: String(input.id),
    name: input.name,
    format: input.format,
    base_url: input.baseURL ?? null,
    ...(input.proxy ? { proxy: input.proxy } : {}),
    model: input.model,
    ...(input.apiKeyHint ? { api_key_hint: input.apiKeyHint } : {}),
    rate_per_second: input.ratePerSecond ?? 0,
    rate_per_minute: input.ratePerMinute ?? 0,
    context_window_k: input.contextWindowK ?? 0,
    thinking_type: input.thinkingType ?? '',
    reasoning_effort: input.reasoningEffort ?? '',
    is_default: input.isDefault ?? false,
    priority: input.priority ?? 0,
    pool_exclude: input.poolExclude ?? false,
    streaming: input.streaming ?? true,
    max_tokens: input.maxTokens ?? 0,
    max_tokens_field: input.maxTokensField ?? '',
    session_header_key: input.sessionHeaderKey ?? '',
    retry,
    retry_connect_attempts: retry.connect.attempts,
    retry_connect_interval_ms: retry.connect.interval_ms,
    retry_empty_attempts: retry.empty.attempts,
    retry_empty_interval_ms: retry.empty.interval_ms,
    retry_stream_attempts: retry.stream.attempts,
    retry_stream_interval_ms: retry.stream.interval_ms
  }
}

// ── 熔断状态（llm_profile_health）───────────────────────────────────────────

async function healthMap(): Promise<Map<number, any>> {
  const rows = await writer.list('llm_profile_health')
  return new Map(rows.map((r) => [Number(r.profile_id), r]))
}

function poolLess(a: any, b: any) {
  if (a.active !== b.active) return a.active
  return a.priority > b.priority
}

function sortPoolStatus(chain: any[]) {
  for (let i = 1; i < chain.length; i++) {
    for (let j = i; j > 0 && poolLess(chain[j], chain[j - 1]); j--) {
      ;[chain[j], chain[j - 1]] = [chain[j - 1], chain[j]]
    }
  }
}

async function llmPoolStatus() {
  const settings = await loadSettings()
  const enabled = Boolean(settings.llm_pool_enabled)
  const bindFallback = Boolean(settings.llm_pool_bind_fallback)
  const profiles = (await listProfiles()).slice().sort((a, b) => Number(a.id) - Number(b.id))
  const health = await healthMap()
  const now = Date.now()
  const chain = profiles.map((p) => {
    const id = Number(p.id)
    const st = health.get(id) ?? {}
    const fails = Number(st.fails ?? 0)
    const trips = Number(st.trips ?? 0)
    const openUntil = st.open_until ? Date.parse(String(st.open_until)) : 0
    let state = 'ok'
    let cooldownSecs = 0
    if (openUntil > now) {
      state = 'tripped'
      cooldownSecs = Math.floor((openUntil - now) / 1000) + 1
    } else if (fails > 0) {
      state = 'degraded'
    }
    const member: Record<string, any> = {
      profile_id: String(id),
      name: String(p.name ?? ''),
      model: String(p.model ?? ''),
      format: String(p.format ?? ''),
      priority: Number(p.priority ?? 0),
      active: Boolean(p.is_default),
      excluded: Boolean(p.pool_exclude),
      state,
      fails,
      trips,
      cooldown_secs: cooldownSecs,
      last_error: String(st.last_error ?? '')
    }
    if (st.last_at) member.last_at = st.last_at
    return member
  })
  sortPoolStatus(chain)
  return { enabled, bind_fallback: bindFallback, chain }
}

async function resetHealth(id: number) {
  if (id > 0) {
    await writer.remove('llm_profile_health', String(id))
    return
  }
  for (const row of await writer.list('llm_profile_health')) {
    await writer.remove('llm_profile_health', String(row.profile_id))
  }
}

// ── 记录（llm_records）──────────────────────────────────────────────────────

function recordItem(row: any) {
  return {
    id: Number(row.id),
    ts: String(row.ts ?? row.created_at ?? ''),
    model: String(row.model ?? ''),
    profile_name: String(row.profile_name ?? ''),
    session_id: String(row.session_id ?? ''),
    task_id: String(row.task_id ?? ''),
    worker: String(row.worker ?? ''),
    latency_ms: Number(row.latency_ms ?? 0),
    input_tokens: Number(row.input_tokens ?? 0),
    output_tokens: Number(row.output_tokens ?? 0),
    cache_read: Number(row.cache_read ?? 0),
    cache_write: Number(row.cache_write ?? 0),
    status: String(row.status ?? ''),
    error: String(row.error ?? '')
  }
}

function recordFull(row: any) {
  const out: Record<string, any> = recordItem(row)
  if (row.request_body != null) out.request_body = String(row.request_body)
  if (row.response_body != null) out.response_body = String(row.response_body)
  if (row.raw_request != null) out.raw_request = String(row.raw_request)
  if (row.raw_response != null) out.raw_response = String(row.raw_response)
  return out
}

// ── 用量账本（llm_usage）────────────────────────────────────────────────────

async function tokenByModel(taskId: string) {
  const rows = (await writer.list('llm_usage')).filter((r) => String(r.task_id ?? '') === taskId)
  const byModel = new Map<string, any>()
  for (const r of rows) {
    const model = String(r.model ?? '').trim() || '(unknown)'
    const entry = byModel.get(model) ?? { model, calls: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }
    entry.calls += 1
    entry.input_tokens += Number(r.input_tokens ?? 0)
    entry.output_tokens += Number(r.output_tokens ?? 0)
    entry.cache_read_tokens += Number(r.cache_read ?? 0)
    entry.cache_write_tokens += Number(r.cache_write ?? 0)
    byModel.set(model, entry)
  }
  return [...byModel.values()].sort(
    (a, b) => b.input_tokens + b.output_tokens - (a.input_tokens + a.output_tokens) || a.model.localeCompare(b.model)
  )
}

async function usageStats(days: number) {
  if (days <= 0) days = 365
  const rows = await writer.list('llm_usage')
  const byProfile = new Map<string, any>()
  const taskSets = new Map<string, Set<string>>()
  for (const r of rows) {
    const name = String(r.profile_name ?? '')
    const entry = byProfile.get(name) ?? {
      profile_name: name, calls: 0, tasks: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0
    }
    entry.calls += 1
    entry.input_tokens += Number(r.input_tokens ?? 0)
    entry.output_tokens += Number(r.output_tokens ?? 0)
    entry.cache_read_tokens += Number(r.cache_read ?? 0)
    entry.cache_write_tokens += Number(r.cache_write ?? 0)
    byProfile.set(name, entry)
    if (r.task_id != null && r.task_id !== '') {
      const set = taskSets.get(name) ?? new Set<string>()
      set.add(String(r.task_id))
      taskSets.set(name, set)
    }
  }
  for (const [name, set] of taskSets) if (byProfile.has(name)) byProfile.get(name).tasks = set.size
  const byProfileArr = [...byProfile.values()].sort(
    (a, b) => b.input_tokens + b.output_tokens - (a.input_tokens + a.output_tokens) || a.profile_name.localeCompare(b.profile_name)
  )

  const cutoff = Date.now() - days * 86_400_000
  const byDay = new Map<string, any>()
  for (const r of rows) {
    const ts = String(r.ts ?? r.created_at ?? '')
    if (!ts) continue
    const date = new Date(ts)
    if (Number.isNaN(date.getTime()) || date.getTime() < cutoff) continue
    const day = date.toISOString().slice(0, 10)
    const name = String(r.profile_name ?? '')
    const key = `${name}\u0000${day}`
    const entry = byDay.get(key) ?? { profile_name: name, date: day, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 }
    entry.input_tokens += Number(r.input_tokens ?? 0)
    entry.output_tokens += Number(r.output_tokens ?? 0)
    entry.cache_read_tokens += Number(r.cache_read ?? 0)
    byDay.set(key, entry)
  }
  const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date) || a.profile_name.localeCompare(b.profile_name))
  return { by_profile: byProfileArr, daily }
}

// ── activity 聚合（tokens/daily、exploration/tokens、commands/stats）────────

async function dailyTokens(days: number) {
  const rows = (await writer.list('activity')).filter((r) => r.kind === 'result')
  const cutoff = Date.now() / 1000 - Math.max(days, 1) * 86_400
  const buckets = new Map<string, any>()
  for (const row of rows) {
    const at = Number(row.created_unix ?? 0)
    if (at < cutoff) continue
    const created = String(row.created_at ?? '')
    if (!created) continue
    const day = new Date(created).toISOString().slice(0, 10)
    const bucket = buckets.get(day) ?? { day, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 }
    bucket.input_tokens += Number(row.input_tokens ?? 0)
    bucket.output_tokens += Number(row.output_tokens ?? 0)
    bucket.cache_read_tokens += Number(row.cache_read_tokens ?? 0)
    buckets.set(day, bucket)
  }
  return [...buckets.values()].sort((a, b) => a.day.localeCompare(b.day))
}

const TOKEN_FIELDS = ['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens'] as const

async function tokenStats(taskId: string) {
  const emptyTotal = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }
  const task = (await writer.list('tasks')).find((t) => String(t.id) === String(taskId))
  if (!task) return { workers: [], sessions: [], total: emptyTotal }
  const expId = Number(task.exploration_id)
  const rows = (await writer.list('activity')).filter((r) => Number(r.exploration_id) === expId && r.kind === 'result')

  const byWorker = new Map<string, any>()
  const total = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }
  for (const row of rows) {
    const worker = String(row.worker ?? '')
    const entry = byWorker.get(worker) ?? { worker, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }
    for (const key of TOKEN_FIELDS) {
      entry[key] += Number(row[key] ?? 0)
      total[key] += Number(row[key] ?? 0)
    }
    byWorker.set(worker, entry)
  }
  const workers = [...byWorker.values()].sort((a, b) => {
    if (a.worker === b.worker) return 0
    if (a.worker === '') return 1
    if (b.worker === '') return -1
    return String(a.worker).localeCompare(String(b.worker))
  })

  const intentIds = new Set(
    (await writer.list('nodes'))
      .filter((n) => Number(n.exploration_id) === expId && n.kind === 'intent')
      .map((n) => String(n.id))
  )
  const bySession = new Map<string, any>()
  for (const row of rows) {
    const key =
      row.worker === 'mainagent' ? `main:${Number(row.main_seg ?? 0)}`
      : row.worker === 'planner' ? 'plan'
      : row.node_id != null && intentIds.has(String(row.node_id)) ? `intent:${row.node_id}`
      : ''
    if (!key) continue
    const entry = bySession.get(key) ?? { session: key, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }
    for (const field of TOKEN_FIELDS) entry[field] += Number(row[field] ?? 0)
    bySession.set(key, entry)
  }
  const sessions = [...bySession.values()].sort((a, b) => String(a.session).localeCompare(String(b.session)))
  return { workers, sessions, total }
}

async function toolStats(taskQuery: string | undefined, q: string) {
  const rows = await writer.list('activity')
  const parsed = taskQuery ? Number(taskQuery) : null
  const expID = parsed !== null && Number.isFinite(parsed) ? parsed : null
  const resultByToolUse = new Map<string, any>()
  for (const r of rows) {
    if (r.kind === 'tool_result' && r.tool_use_id != null) resultByToolUse.set(String(r.tool_use_id), r)
  }
  const needle = q.toLowerCase()
  const stats = new Map<string, any>()
  for (const u of rows) {
    if (u.kind !== 'tool_use') continue
    if (expID !== null && Number(u.exploration_id) !== expID) continue
    const tool = String(u.tool ?? '')
    const detail = String(u.detail ?? '')
    if (needle && !tool.toLowerCase().includes(needle) && !detail.toLowerCase().includes(needle)) continue
    const key = tool || '-'
    const entry = stats.get(key) ?? { tool: key, total: 0, errors: 0 }
    entry.total += 1
    const result = resultByToolUse.get(String(u.tool_use_id))
    if (result && Boolean(result.is_error)) entry.errors += 1
    stats.set(key, entry)
  }
  return [...stats.values()].sort((a, b) => b.total - a.total || (a.tool < b.tool ? -1 : a.tool > b.tool ? 1 : 0))
}

// ── 会话 token（tokens/conversations）───────────────────────────────────────

async function conversationTokens() {
  const conversations = await writer.list('conversations')
  const activities = await writer.list('conversation_activities')
  const byConv = new Map<string, { input: number; output: number; cr: number; cw: number }>()
  for (const a of activities) {
    if (a.kind !== 'result') continue
    const cid = String(a.conversation_id ?? a.conv_id ?? '')
    const entry = byConv.get(cid) ?? { input: 0, output: 0, cr: 0, cw: 0 }
    entry.input += Number(a.input_tokens ?? 0)
    entry.output += Number(a.output_tokens ?? 0)
    entry.cr += Number(a.cache_read_tokens ?? 0)
    entry.cw += Number(a.cache_write_tokens ?? 0)
    byConv.set(cid, entry)
  }
  return conversations.map((c) => {
    const entry = byConv.get(String(c.id)) ?? { input: 0, output: 0, cr: 0, cw: 0 }
    return {
      llm_profile_id: c.llm_profile_id != null ? Number(c.llm_profile_id) : null,
      created_at: String(c.created_at ?? ''),
      input_tokens: entry.input,
      output_tokens: entry.output,
      cache_read_tokens: entry.cr,
      cache_write_tokens: entry.cw
    }
  })
}

// ── models / test 的出站请求（keys 由调用方 inline 提供，TS 不落盘）─────────

async function listModels(body: any): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  const apiKey = String(body.api_key ?? '').trim()
  if (!apiKey) return { ok: false, error: '未提供 API Key' }
  const provider = String(body.provider ?? '').trim()
  let baseURL = String(body.base_url ?? '').trim().replace(/\/+$/, '')
  const candidates: Array<{ url: string; headers: Record<string, string> }> = []
  if (provider === 'openai' || provider === 'openai-responses') {
    let b = baseURL || 'https://api.openai.com/v1'
    b = trimSuffix(trimSuffix(b, '/chat/completions'), '/responses').replace(/\/+$/, '')
    candidates.push({ url: `${b}/models`, headers: { authorization: `Bearer ${apiKey}` } })
  } else {
    let b = baseURL || 'https://api.anthropic.com'
    b = trimSuffix(b, '/v1/messages').replace(/\/+$/, '')
    candidates.push({ url: `${b}/v1/models`, headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } })
    const root = trimSuffix(b, '/anthropic').replace(/\/+$/, '')
    if (root !== b) {
      candidates.push({ url: `${root}/models`, headers: { authorization: `Bearer ${apiKey}` } })
      candidates.push({ url: `${root}/v1/models`, headers: { authorization: `Bearer ${apiKey}` } })
    }
  }
  let lastErr = ''
  let emptyOK = false
  for (const cand of candidates) {
    try {
      const resp = await fetch(cand.url, { method: 'GET', headers: cand.headers, signal: AbortSignal.timeout(30_000) })
      const text = await resp.text()
      if (resp.status !== 200) {
        lastErr = `API 返回 ${resp.status}: ${text.slice(0, 512)}`
        continue
      }
      let parsed: any
      try {
        parsed = JSON.parse(text)
      } catch (error: any) {
        lastErr = `解析响应失败: ${error?.message ?? error}`
        continue
      }
      const models = (parsed?.data ?? []).map((m: any) => m?.id).filter(Boolean)
      if (models.length) return { ok: true, models }
      emptyOK = true
    } catch (error: any) {
      lastErr = `请求失败: ${error?.message ?? error}`
    }
  }
  if (emptyOK) return { ok: true, models: [] }
  return { ok: false, error: lastErr || '未获取到模型列表' }
}

function truncateReply(value: string) {
  const max = 200
  const runes = [...value]
  return runes.length <= max ? value : runes.slice(0, max).join('') + '…'
}

async function minimalCompletion(opts: { provider: string; baseURL: string; apiKey: string; model: string }) {
  const messages = [{ role: 'user', content: '请回复 OK' }]
  let url: string
  let headers: Record<string, string>
  let payload: string
  if (opts.provider === 'openai') {
    url = `${opts.baseURL || 'https://api.openai.com/v1'}/chat/completions`
    headers = { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` }
    payload = JSON.stringify({ model: opts.model || 'gpt-4o', messages, stream: false })
  } else if (opts.provider === 'openai-responses') {
    url = `${opts.baseURL || 'https://api.openai.com/v1'}/responses`
    headers = { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` }
    payload = JSON.stringify({ model: opts.model || 'gpt-5', input: '请回复 OK', stream: false })
  } else {
    url = `${opts.baseURL || 'https://api.anthropic.com'}/v1/messages`
    headers = { 'content-type': 'application/json', 'x-api-key': opts.apiKey, 'anthropic-version': '2023-06-01' }
    payload = JSON.stringify({ model: opts.model || 'claude-opus-4-8', max_tokens: 32, messages })
  }
  const resp = await fetch(url, { method: 'POST', headers, body: payload, signal: AbortSignal.timeout(30_000) })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`status ${resp.status}: ${text.slice(0, 512)}`)
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('解析响应失败')
  }
  const direct = data?.output_text ?? data?.output?.[0]?.content?.[0]?.text ?? data?.choices?.[0]?.message?.content
  if (typeof direct === 'string') return direct
  if (Array.isArray(data?.content)) {
    const block = data.content.find((b: any) => b.type === 'text' || b.type === 'output_text')
    if (block?.text) return block.text
  }
  return '(空响应)'
}

// ── 注册 ────────────────────────────────────────────────────────────────────

export function register(api: Hono) {
  // profiles
  api.get('/api/llm/profiles', async (c) => {
    const rows = await listProfiles()
    return c.json({ profiles: rows.map(profileDTO) })
  })

  api.post('/api/llm/profiles', async (c) => {
    const body = await jsonBody(c)
    try {
      const format = String(body.format ?? '').trim()
      if (!['openai', 'anthropic', 'openai-responses'].includes(format)) {
        return c.json({ error: 'format 必须是 openai / anthropic / openai-responses' }, 400)
      }
      const name = String(body.name ?? '').trim()
      const model = String(body.model ?? '').trim()
      if (!name) return c.json({ error: 'name 不能为空' }, 400)
      if (!model) return c.json({ error: 'model 不能为空' }, 400)

      const existingId = body.id != null ? Number(body.id) : 0
      const profiles = await listProfiles()
      if (profiles.some((p) => p.name === name && Number(p.id) !== existingId)) {
        return c.json({ error: '该名称已存在' }, 409)
      }
      const existing = existingId > 0 ? profiles.find((p) => Number(p.id) === existingId) : null
      const apiKey = String(body.api_key ?? '').trim()
      const apiKeyHint = existing && apiKey === '' ? existing.api_key_hint ?? '' : apiKey.length >= 4 ? '…' + apiKey.slice(-4) : ''
      const streaming = body.streaming == null ? true : Boolean(body.streaming)

      let baseURL = normalizeBaseURL(format, body.base_url)
      if (baseURL === '') baseURL = null
      const proxy = String(body.proxy ?? '').trim() || null
      let maxTokens = Number(body.max_tokens ?? 0)
      if (!Number.isFinite(maxTokens) || maxTokens < 0) maxTokens = 0
      let maxTokensField = String(body.max_tokens_field ?? '').trim()
      if (format !== 'openai' || maxTokensField !== 'max_completion_tokens') maxTokensField = ''
      const retry = clampOverride(body.retry)

      if (existing) {
        Object.assign(existing, {
          name, format, base_url: baseURL, proxy, model, api_key_hint: apiKeyHint,
          rate_per_second: Number(body.rate_per_second ?? 0),
          rate_per_minute: Number(body.rate_per_minute ?? 0),
          context_window_k: Number(body.context_window_k ?? 0),
          reasoning_effort: String(body.reasoning_effort ?? ''),
          thinking_type: String(body.thinking_type ?? ''),
          priority: Number(body.priority ?? 0),
          pool_exclude: Boolean(body.pool_exclude),
          streaming, max_tokens: maxTokens, max_tokens_field: maxTokensField,
          session_header_key: String(body.session_header_key ?? ''),
          retry,
          retry_connect_attempts: retry.connect.attempts,
          retry_connect_interval_ms: retry.connect.interval_ms,
          retry_empty_attempts: retry.empty.attempts,
          retry_empty_interval_ms: retry.empty.interval_ms,
          retry_stream_attempts: retry.stream.attempts,
          retry_stream_interval_ms: retry.stream.interval_ms
        })
        await saveProfiles(profiles)
        return c.json({ id: Number(existing.id) })
      }

      const id = Math.max(0, ...profiles.map((p) => Number(p.id))) + 1
      const record = buildProfileRecord({
        id, name, format, baseURL, proxy, model, apiKeyHint,
        isDefault: false,
        priority: Number(body.priority ?? 0),
        poolExclude: Boolean(body.pool_exclude),
        streaming,
        maxTokens,
        maxTokensField,
        sessionHeaderKey: String(body.session_header_key ?? ''),
        ratePerSecond: Number(body.rate_per_second ?? 0),
        ratePerMinute: Number(body.rate_per_minute ?? 0),
        contextWindowK: Number(body.context_window_k ?? 0),
        reasoningEffort: String(body.reasoning_effort ?? ''),
        thinkingType: String(body.thinking_type ?? ''),
        retry
      })
      profiles.push(record)
      await saveProfiles(profiles)
      return c.json({ id: Number(record.id) })
    } catch (error: any) {
      return fail(c, error)
    }
  })

  api.delete('/api/llm/profiles/:id', async (c) => {
    const id = Number(c.req.param('id'))
    try {
      const profiles = await listProfiles()
      const index = profiles.findIndex((p) => Number(p.id) === id)
      if (index < 0) return c.json({ error: 'LLM profile not found' }, 404)
      if (profiles[index].is_default) {
        return c.json({ error: '当前激活的 LLM 配置不能删除，请先激活其他配置' }, 409)
      }
      profiles.splice(index, 1)
      await saveProfiles(profiles)
      for (const task of await writer.list('tasks')) {
        if (String(task.llm_profile_id ?? '') === String(id) || String(task.active_llm_profile_id ?? '') === String(id)) {
          const next: Record<string, any> = { ...task, llm_profile_id: null, active_llm_profile_id: null }
          delete next.rev
          await writer.commit([{ table: 'tasks', key: String(task.id), record: next, expectedRev: Number(task.rev ?? 0) }])
        }
      }
      await writer.remove('llm_profile_health', String(id))
      store.invalidate?.(['tasks'])
      return c.json({ deleted: id })
    } catch (error: any) {
      return fail(c, error)
    }
  })

  api.post('/api/llm/profiles/active', async (c) => {
    const body = await jsonBody(c)
    const id = Number(body.id)
    try {
      const profiles = await listProfiles()
      const target = profiles.find((p) => Number(p.id) === id)
      if (!target) return c.json({ error: 'LLM profile not found' }, 404)
      for (const p of profiles) p.is_default = false
      target.is_default = true
      await saveProfiles(profiles)
      return c.json({ ok: true })
    } catch (error: any) {
      return fail(c, error)
    }
  })

  // legacy active-profile view (server/server.go getLLM / setLLM)
  api.get('/api/llm', async (c) => {
    const profiles = await listProfiles()
    const active = profiles.find((p) => p.is_default)
    if (!active) {
      return c.json({
        configured: false, provider: '', model: '', base_url: '', proxy: '', key_set: false,
        rate_per_second: 0, rate_per_minute: 0, context_window_k: 0, thinking_type: '', reasoning_effort: ''
      })
    }
    return c.json({
      configured: true,
      provider: String(active.format ?? ''),
      model: String(active.model ?? ''),
      base_url: active.base_url ?? '',
      proxy: active.proxy ?? '',
      key_set: Boolean(active.api_key_hint),
      rate_per_second: Number(active.rate_per_second ?? 0),
      rate_per_minute: Number(active.rate_per_minute ?? 0),
      context_window_k: Number(active.context_window_k ?? 0),
      thinking_type: String(active.thinking_type ?? ''),
      reasoning_effort: String(active.reasoning_effort ?? '')
    })
  })

  api.post('/api/llm', async (c) => {
    const body = await jsonBody(c)
    try {
      const provider = String(body.provider ?? '').trim()
      const format = provider === 'openai' ? 'openai' : provider === 'openai-responses' ? 'openai-responses' : 'anthropic'
      const apiKey = String(body.api_key ?? '').trim()
      const profiles = await listProfiles()
      const active = profiles.find((p) => p.is_default)
      if (!apiKey && !(active?.api_key_hint)) return c.json({ error: 'api_key required' }, 400)
      const apiKeyHint = apiKey.length >= 4 ? '…' + apiKey.slice(-4) : active?.api_key_hint ?? ''
      let contextWindowK = Number(body.context_window_k ?? 0)
      if (contextWindowK > 0) contextWindowK = Math.min(contextWindowK, 1000)
      const baseURL = normalizeBaseURL(format, body.base_url)
      const model = String(body.model ?? '').trim() || (format === 'openai' ? 'gpt-4o' : format === 'openai-responses' ? 'gpt-5' : 'claude-opus-4-8')
      const proxy = String(body.proxy ?? '').trim()

      if (active) {
        Object.assign(active, {
          format, model,
          base_url: baseURL || null,
          ...(proxy ? { proxy } : {}),
          api_key_hint: apiKeyHint,
          rate_per_second: Number(body.rate_per_second ?? active.rate_per_second ?? 0),
          rate_per_minute: Number(body.rate_per_minute ?? active.rate_per_minute ?? 0),
          context_window_k: contextWindowK > 0 ? contextWindowK : Number(active.context_window_k ?? 0),
          thinking_type: String(body.thinking_type ?? active.thinking_type ?? ''),
          reasoning_effort: String(body.reasoning_effort ?? active.reasoning_effort ?? '')
        })
        await saveProfiles(profiles)
      } else {
        const id = Math.max(0, ...profiles.map((p) => Number(p.id))) + 1
        profiles.push(buildProfileRecord({
          id, name: 'default', format, baseURL, proxy, model, apiKeyHint,
          isDefault: true, priority: 0, poolExclude: false, streaming: true,
          maxTokens: 0, maxTokensField: '', sessionHeaderKey: '',
          ratePerSecond: Number(body.rate_per_second ?? 0),
          ratePerMinute: Number(body.rate_per_minute ?? 0),
          contextWindowK, reasoningEffort: String(body.reasoning_effort ?? ''),
          thinkingType: String(body.thinking_type ?? ''), retry: zeroOverride()
        }))
        await saveProfiles(profiles)
      }
      const nowActive = (await listProfiles()).find((p) => p.is_default)
      return c.json({
        configured: true,
        provider: String(nowActive?.format ?? ''),
        model: String(nowActive?.model ?? ''),
        base_url: nowActive?.base_url ?? '',
        proxy: nowActive?.proxy ?? '',
        key_set: Boolean(nowActive?.api_key_hint),
        rate_per_second: Number(nowActive?.rate_per_second ?? 0),
        rate_per_minute: Number(nowActive?.rate_per_minute ?? 0),
        context_window_k: Number(nowActive?.context_window_k ?? 0),
        thinking_type: String(nowActive?.thinking_type ?? ''),
        reasoning_effort: String(nowActive?.reasoning_effort ?? '')
      })
    } catch (error: any) {
      return fail(c, error)
    }
  })

  // pool
  api.get('/api/llm/pool', async (c) => c.json(await llmPoolStatus()))

  api.post('/api/llm/pool/reset', async (c) => {
    const body = await jsonBody(c)
    try {
      await resetHealth(Number(body.id ?? 0))
      return c.json(await llmPoolStatus())
    } catch (error: any) {
      return fail(c, error)
    }
  })

  // records
  api.get('/api/llm/records/tasks', async (c) => {
    const rows = await writer.list('llm_records')
    const byTask = new Map<string, { task_id: string; count: number; maxId: number }>()
    for (const r of rows) {
      const taskId = String(r.task_id ?? '')
      if (!taskId) continue
      const entry = byTask.get(taskId) ?? { task_id: taskId, count: 0, maxId: 0 }
      entry.count += 1
      entry.maxId = Math.max(entry.maxId, Number(r.id ?? 0))
      byTask.set(taskId, entry)
    }
    const tasks = [...byTask.values()]
      .sort((a, b) => b.maxId - a.maxId)
      .map(({ maxId, ...rest }) => rest)
    return c.json({ tasks })
  })

  api.get('/api/llm/records/by-model', async (c) => {
    const task = c.req.query('task') ?? ''
    if (!task) return c.json({ error: 'missing task' }, 400)
    return c.json({ models: await tokenByModel(task) })
  })

  api.get('/api/llm/records', async (c) => {
    const page = Math.max(Number(c.req.query('page') ?? 0) || 0, 0)
    const size = Math.min(Number(c.req.query('size') ?? 50) || 50, 500)
    const model = c.req.query('model') ?? ''
    const session = c.req.query('session') ?? ''
    const task = c.req.query('task') ?? ''
    let rows = await writer.list('llm_records')
    if (model) rows = rows.filter((r) => String(r.model ?? '') === model)
    if (session) rows = rows.filter((r) => String(r.session_id ?? '').toLowerCase().includes(session.toLowerCase()))
    if (task) rows = rows.filter((r) => String(r.task_id ?? '') === task)
    rows = rows.sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0))
    const total = rows.length
    const records = rows.slice(page * size, page * size + size).map(recordItem)
    return c.json({ records, total })
  })

  api.get('/api/llm/records/:id', async (c) => {
    const id = c.req.param('id')
    const row = (await writer.list('llm_records')).find((r) => String(r.id) === id)
    if (!row) return c.json({ error: 'not found' }, 404)
    return c.json(recordFull(row))
  })

  api.delete('/api/llm/records', async (c) => {
    const task = String(c.req.query('task') ?? '').trim()
    if (!task) return c.json({ error: 'missing task' }, 400)
    let deleted = 0
    for (const r of await writer.list('llm_records')) {
      if (String(r.task_id ?? '') === task) {
        await writer.remove('llm_records', String(r.id))
        deleted += 1
      }
    }
    return c.json({ deleted })
  })

  // retry policy (settings 域 llm_retry_policy)
  api.get('/api/llm/retry-policy', async (c) => {
    const settings = await loadSettings()
    const raw = settings.llm_retry_policy
    if (typeof raw === 'string' && raw) {
      try {
        return c.json(clampPolicy(JSON.parse(raw)))
      } catch {
        return c.json(zeroPolicy())
      }
    }
    if (raw && typeof raw === 'object') return c.json(clampPolicy(raw))
    return c.json(zeroPolicy())
  })

  api.post('/api/llm/retry-policy', async (c) => {
    const body = await jsonBody(c)
    try {
      const settings = await loadSettings()
      settings.llm_retry_policy = JSON.stringify(clampPolicy(body))
      await saveSettings(settings)
      return c.json(clampPolicy(body))
    } catch (error: any) {
      return fail(c, error)
    }
  })

  // models / test
  api.post('/api/llm/models', async (c) => c.json(await listModels(await jsonBody(c))))

  api.post('/api/llm/test', async (c) => {
    const body = await jsonBody(c)
    const apiKey = String(body.api_key ?? '').trim()
    if (!apiKey) return c.json({ ok: false, error: '未提供 API Key' })
    const provider = String(body.provider ?? '').trim()
    const model = String(body.model ?? '').trim()
    const baseURL = normalizeBaseURL(provider, body.base_url)
    const started = Date.now()
    try {
      const reply = await minimalCompletion({ provider, baseURL, apiKey, model })
      return c.json({ ok: true, latency_ms: Date.now() - started, model, reply: truncateReply(reply) })
    } catch (error: any) {
      return c.json({ ok: false, error: String(error?.message ?? error) })
    }
  })

  // tokens / usage / commands
  api.get('/api/tokens/daily', async (c) => {
    const days = Math.max(Number(c.req.query('days') ?? 30) || 30, 1)
    return c.json(await dailyTokens(days))
  })

  api.get('/api/tokens/usage', async (c) => {
    const days = Number(c.req.query('days') ?? 365) || 365
    return c.json(await usageStats(days))
  })

  api.get('/api/tokens/conversations', async (c) => c.json(await conversationTokens()))

  api.get('/api/exploration/tokens', async (c) => {
    const taskId = c.req.query('task') ?? ''
    if (!taskId) {
      return c.json({ workers: [], sessions: [], total: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 } })
    }
    return c.json(await tokenStats(taskId))
  })
}
