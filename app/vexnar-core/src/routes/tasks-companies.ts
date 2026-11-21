// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Hono } from 'hono'
import { meta, operations, parseJson, store, taskQueue } from '../context.ts'
import { modelCompletionReady } from '../gateway.ts'

/**
 * 任务扩展 + 公司主体路由模块（在 dsh 进程内以 Hono 前缀 /vexnar-api 挂载，
 * 持久层为 SQLite kv 表，不连 PostgreSQL、不新开端口）。
 *
 * 迁移来源（语义对齐）：
 *   - server/task_control.go  → POST /api/tasks/control/batch
 *   - server/task_categories.go → POST /api/tasks/category/batch
 *   - server/server.go (updateTaskLLMProfiles) → PUT /api/tasks/{id}/llm
 *   - server/task_resolution.go → GET /api/tasks/{id}/llm/resolution
 *   - server/server.go (taskAssetRefs / taskCoverageGraph) + server/task_assets.go
 *     → GET /api/tasks/{id}/asset-refs、GET /api/tasks/{id}/intent-assets、
 *       GET /api/tasks/{id}/coverage-graph
 *   - server/assets.go + db/companies.go + db/company_scope.go → 公司 CRUD / scope /
 *     reattribute（企业归属按 domain → ip/cidr → icp 优先级重建，显式归属不动）
 *
 * 任务基础 CRUD / goals / constraints / scope / assets / archive 已在 routes.ts，
 * chat 系列已由 routes/conversations.ts 实现，本模块不重复注册。
 */

const writer = () => operations.writer

// ── 通用工具 ───────────────────────────────────────────────────────────────

function fail(c: any, error: any) {
  const status = error?.name === 'StoreConflict' ? 409 : error?.status ?? 400
  return c.json({ error: String(error?.message ?? error) }, status)
}

function bad(message: string, status = 400) {
  return Object.assign(new Error(message), { status })
}

async function jsonBody(c: any): Promise<any> {
  return c.req.json().catch(() => ({}))
}

function rfc3339(date: Date) {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = (value: number) => String(Math.floor(Math.abs(value))).padStart(2, '0')
  return `${date.toISOString().slice(0, 23)}${sign}${pad(offset / 60)}:${pad(offset % 60)}`.replace('Z', '')
}

const now = () => rfc3339(new Date())
const text = (value: unknown) => String(value ?? '').trim()
const runeCount = (value: string) => [...value].length

function parseRev(record: any) {
  return Number(record?.rev ?? 0)
}

/** 任务存在性：deleted 视作不存在（与 operations.controlTask 一致）。 */
async function liveTask(id: string) {
  const record = await writer().readRecord('tasks', id)
  if (!record || record.deleted_at_text) return null
  return record
}

async function taskByPath(c: any) {
  return store.tasks.get(c.req.param('id'))
}

// ── 批量任务 id 规范化（server/task_control.go normalizeBatchTaskIDs）──────

const MAX_BATCH_IDS = 100
const MAX_CATEGORY_BATCH_IDS = 200

function canonicalTaskID(raw: string): string | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value) || value <= 0) return null
  return String(value)
}

function normalizeBatchTaskIDs(raw: unknown): Array<{ id: string; valid: boolean }> {
  const seen = new Set<string>()
  const seenInvalid = new Set<string>()
  const out: Array<{ id: string; valid: boolean }> = []
  const list = Array.isArray(raw) ? raw : []
  for (const item of list) {
    const trimmed = String(item ?? '').trim()
    const id = canonicalTaskID(trimmed)
    if (!id) {
      if (seenInvalid.has(trimmed)) continue
      seenInvalid.add(trimmed)
      out.push({ id: trimmed, valid: false })
      continue
    }
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, valid: true })
  }
  return out
}

// ── 任务 LLM 配置链 ────────────────────────────────────────────────────────

const TERMINAL_TASK_STATUS = new Set(['done', 'failed', 'timeout'])
const INTENT_TERMINAL_STATES = new Set(['done', 'blocked', 'exhausted', 'stopped'])

function profileKeySet(profile: any) {
  return Boolean(text(profile?.api_key_hint)) || profile?.key_set === true
}

function taskLLMChain(task: any): number[] {
  const raw = Array.isArray(task?.llm_profile_ids) ? task.llm_profile_ids : []
  const ids = raw.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0)
  if (ids.length) return ids
  const legacy = Number(task?.llm_profile_id ?? 0)
  return Number.isInteger(legacy) && legacy > 0 ? [legacy] : []
}

function taskActiveLLM(task: any, chain: number[]): number | null {
  const active = Number(task?.active_llm_profile_id ?? 0)
  if (Number.isInteger(active) && active > 0 && chain.includes(active)) return active
  const legacy = Number(task?.llm_profile_id ?? 0)
  if (Number.isInteger(legacy) && legacy > 0 && chain.includes(legacy)) return legacy
  return chain.length ? chain[0] : null
}

/** 额度阻塞意图重开（db.ReopenIntentsByBlockedReason("llm_quota_exhausted")）。 */
async function reopenLLMQuotaIntents(task: any): Promise<number> {
  if (TERMINAL_TASK_STATUS.has(String(task?.status ?? ''))) return 0
  const nodes = await writer().list('nodes')
  const blocked = nodes.filter((row) => (
    Number(row.exploration_id) === Number(task.exploration_id)
    && row.kind === 'intent'
    && row.state === 'blocked'
    && (String(row.blocked_reason ?? '') === 'llm_quota_exhausted'
      || String((parseJson(row.payload) as any)?.blocked_reason ?? '') === 'llm_quota_exhausted')
  ))
  if (!blocked.length) return 0
  const ops = blocked.map((row) => {
    const payload = parseJson(row.payload)
    const nextPayload = payload && typeof payload === 'object' ? { ...(payload as any), blocked_reason: null } : payload
    return {
      table: 'nodes',
      key: String(row.id),
      record: { ...row, state: 'open', blocked_reason: null, payload: nextPayload },
      expectedRev: parseRev(row)
    }
  })
  await writer().commit(ops)
  return blocked.length
}

interface LLMResolution {
  profile_id?: number
  name: string
  format: string
  model: string
  source: string
  available: boolean
  reason?: string
}

function resolutionFromProfile(profile: any, source: string): LLMResolution {
  if (!profile) return { name: '', format: '', model: '', source, available: false, reason: 'LLM 配置不存在' }
  const base: LLMResolution = {
    profile_id: Number(profile.id),
    name: String(profile.name ?? ''),
    format: String(profile.format ?? ''),
    model: String(profile.model ?? ''),
    source,
    available: false
  }
  if (!profileKeySet(profile)) return { ...base, reason: 'LLM 配置未设置 API Key' }
  if (!text(profile.format) || !text(profile.model)) return { ...base, reason: 'LLM 配置格式或参数无效' }
  return { ...base, available: true }
}

async function resolveRoleLLM(task: any, agentKey: string, profiles: any[]): Promise<LLMResolution> {
  const agents = await meta.table<any[]>('agents')
  const agent = agents.find((row) => row?.key === agentKey)
  const boundID = Number(agent?.llm_profile_id ?? 0)
  if (Number.isInteger(boundID) && boundID > 0) {
    const profile = profiles.find((row) => Number(row.id) === boundID)
    const resolved = resolutionFromProfile(profile, 'agent_binding')
    if (resolved.available) return resolved
  }
  const chain = taskLLMChain(task)
  if (chain.length) {
    const active = taskActiveLLM(task, chain)
    if (active == null) return { name: '', format: '', model: '', source: 'task_chain', available: false, reason: '任务 LLM 配置链额度已耗尽' }
    return resolutionFromProfile(profiles.find((row) => Number(row.id) === active), 'task_chain')
  }
  const globalProfile = profiles.find((row) => row?.is_default) ?? null
  if (globalProfile) {
    const resolved = resolutionFromProfile(globalProfile, 'global_profile')
    if (resolved.available) return resolved
  }
  // 进程内模型通道：宿主插件登录后注入，没有端口也没有令牌。`environment`
  // 是 web 控制台类型里的既有取值，含义就是「不是某个任务/Agent/全局档案给
  // 的，而是进程自己带的那条通道」。
  if (modelCompletionReady()) {
    return {
      name: '内置模型通道',
      format: 'openai',
      model: text(process.env.VEXNAR_MODEL) || 'deepseek-flash',
      source: 'environment',
      available: true
    }
  }
  return { name: '', format: '', model: '', source: 'global', available: false, reason: '没有可用的 LLM 配置' }
}

// ── 企业范围解析（db/company_scope.go）────────────────────────────────────

const MAX_SCOPE_RUNES = 1024
const SCOPE_KINDS = new Set(['domain', 'ip', 'cidr', 'icp', 'keyword'])

interface ParsedScope {
  kind: string
  domain?: string
  net?: string
  value?: string
  raw: string
}

interface ParsedNet {
  version: 4 | 6
  bits: number
  network: bigint
  /** 归一化文本，写库用 */
  text: string
}

function isIPv4(value: string) {
  const parts = value.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function isIPv6(value: string) {
  const lowered = value.trim().toLowerCase()
  if (!lowered.includes(':') || !/^[0-9a-f:.]+$/.test(lowered)) return false
  if ((lowered.match(/::/g) ?? []).length > 1) return false
  return lowered.split(':').length >= 2
}

function ipv4BigInt(value: string): bigint | null {
  if (!isIPv4(value)) return null
  return value.split('.').reduce((acc, part) => (acc << 8n) + BigInt(Number(part)), 0n)
}

function ipv6BigInt(value: string): bigint | null {
  const lowered = value.trim().toLowerCase()
  if (!isIPv6(lowered)) return null
  const [headRaw, tailRaw] = lowered.split('::')
  const toGroups = (part: string) => (part ? part.split(':') : [])
  const head = toGroups(headRaw ?? '')
  const tail = lowered.includes('::') ? toGroups(tailRaw ?? '') : []
  for (const group of [...head, ...tail]) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null
  }
  let groups: string[]
  if (lowered.includes('::')) {
    const missing = 8 - head.length - tail.length
    if (missing < 0) return null
    groups = [...head, ...Array.from({ length: missing }, () => '0'), ...tail]
  } else {
    if (head.length !== 8) return null
    groups = head
  }
  return groups.reduce((acc, group) => (acc << 16n) + BigInt(parseInt(group, 16)), 0n)
}

function ipBigInt(value: string): { version: 4 | 6; value: bigint } | null {
  const v4 = ipv4BigInt(value)
  if (v4 !== null) return { version: 4, value: v4 }
  const v6 = ipv6BigInt(value)
  if (v6 !== null) return { version: 6, value: v6 }
  return null
}

function maskOf(version: 4 | 6, bits: number): bigint {
  const size = version === 4 ? 32 : 128
  if (bits <= 0) return 0n
  const full = (1n << BigInt(size)) - 1n
  if (bits >= size) return full
  return full ^ ((1n << BigInt(size - bits)) - 1n)
}

function parseNetText(raw: string): ParsedNet | null {
  const value = text(raw)
  if (!value) return null
  const slash = value.lastIndexOf('/')
  const address = slash >= 0 ? value.slice(0, slash).trim() : value
  const ip = ipBigInt(address)
  if (!ip) return null
  const size = ip.version === 4 ? 32 : 128
  let bits = size
  if (slash >= 0) {
    const rawBits = value.slice(slash + 1).trim()
    if (!/^\d+$/.test(rawBits)) return null
    bits = Number(rawBits)
    if (bits > size) return null
  }
  const network = ip.value & maskOf(ip.version, bits)
  const label = ip.version === 4
    ? [24n, 16n, 8n, 0n].map((shift) => String((network >> shift) & 0xffn)).join('.')
    : value.slice(0, slash >= 0 ? slash : value.length).toLowerCase()
  return { version: ip.version, bits, network, text: `${label}/${bits}` }
}

function netContains(net: ParsedNet, ipText: string): boolean {
  const ip = ipBigInt(text(ipText))
  if (!ip || ip.version !== net.version) return false
  return (ip.value & maskOf(net.version, net.bits)) === net.network
}

function looksLikeIPAddress(value: string) {
  const candidate = text(value)
  if (candidate.includes('://') || /\s/.test(candidate)) return false
  if ((candidate.match(/:/g) ?? []).length >= 2) {
    const parts = candidate.split(':')
    let valid = 0
    for (const part of parts) {
      if (part === '') {
        if (valid > 0 || candidate.startsWith('::')) return true
        continue
      }
      if (part.length > 4) return false
      if (!/^[0-9a-fA-F]+$/.test(part)) return false
      valid += 1
      if (valid >= 2) return true
    }
    return false
  }
  if (!candidate.includes('.')) return false
  return /^[0-9.]+$/.test(candidate)
}

const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'com.hk', 'com.tw', 'com.sg', 'com.au', 'co.nz', 'co.jp', 'co.kr', 'co.in', 'com.br', 'com.mx'
])

function registrableDomain(host: string) {
  const labels = host.split('.')
  if (labels.length < 2) return host
  const lastTwo = labels.slice(-2).join('.')
  if (MULTI_PART_SUFFIXES.has(lastTwo) && labels.length >= 3) return labels.slice(-3).join('.')
  return lastTwo
}

function scopeHostname(raw: string): string {
  const candidate = text(raw)
  if (!candidate) throw bad('主机名为空')
  let parsed: URL
  try {
    parsed = new URL(candidate.includes('://') ? candidate : `http://${candidate}`)
  } catch {
    throw bad(`无法识别为有效域名/IP/CIDR: ${raw}`)
  }
  const host = parsed.hostname.replace(/\.$/, '').toLowerCase()
  if (!host) throw bad('主机名为空')
  if (isIPv4(host) || isIPv6(host)) return host
  if (host.length > 253) throw bad('域名超过 253 个字符')
  const labels = host.split('.')
  if (labels.length < 2) throw bad('域名至少需要两个标签')
  for (const label of labels) {
    if (!label || label.length > 63 || label.startsWith('-') || label.endsWith('-')) throw bad('域名标签无效')
    if (!/^[a-z0-9-]+$/.test(label)) throw bad('域名包含无效字符')
  }
  return host
}

function parseScopeLine(line: string): ParsedScope {
  const raw = text(line)
  if (!raw) throw bad('空行')
  const cidr = raw.includes('/') ? parseNetText(raw) : null
  if (cidr) {
    if (cidr.version === 4 && cidr.bits < 16) throw bad(`网段过宽(IPv4 需 >= /16): ${raw}`)
    if (cidr.version === 6 && cidr.bits < 32) throw bad(`网段过宽(IPv6 需 >= /32): ${raw}`)
    return { kind: 'cidr', net: cidr.text, raw }
  }
  const single = ipBigInt(raw)
  if (single) return { kind: 'ip', net: `${raw}/${single.version === 4 ? 32 : 128}`, raw }
  const host = scopeHostname(raw)
  const hostIP = ipBigInt(host)
  if (hostIP) return { kind: 'ip', net: `${host}/${hostIP.version === 4 ? 32 : 128}`, raw }
  if (looksLikeIPAddress(host)) throw bad(`无效 IP: ${raw}`)
  if (raw.includes('-') && (raw.match(/\./g) ?? []).length >= 6) throw bad(`IP 段请用 CIDR 表示(如 1.2.3.0/24): ${raw}`)
  // 裸 TLD / 公共后缀本身：单标签已由 scopeHostname 拒绝，这里兜底多段后缀。
  if (MULTI_PART_SUFFIXES.has(host)) throw bad(`不能用裸 TLD 作为范围: ${raw}`)
  if (!/[a-z]/.test(host.split('.').pop() ?? '')) throw bad(`无法识别为有效域名/IP/CIDR: ${raw}`)
  return { kind: 'domain', domain: registrableDomain(host), raw }
}

function normalizeICP(value: unknown) {
  return String(value ?? '').replace(/\s+/g, '').toLowerCase()
}

function normalizeKeyword(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function parseAutoScopeLine(line: string): ParsedScope {
  const raw = text(line)
  if (!raw) throw bad('空行')
  if (raw.includes('/') && parseNetText(raw)) return parseScopeLine(raw)
  if (ipBigInt(raw)) return parseScopeLine(raw)
  const slash = raw.lastIndexOf('/')
  if (slash > 0) {
    const address = raw.slice(0, slash).trim()
    if (ipBigInt(address) || looksLikeIPAddress(address)) throw bad(`无效 CIDR: ${raw}`)
  }
  if (looksLikeIPAddress(raw)) throw bad(`无效 IP: ${raw}`)
  const looksLikeDomain = raw.includes('://') || (raw.includes('.') && !/\s/.test(raw))
  if (looksLikeDomain) return parseScopeLine(raw)
  const lower = raw.toLowerCase()
  if (!/[.．。]/.test(raw) && (lower.includes('icp') || raw.includes('备案'))) {
    const value = normalizeICP(raw)
    if (!value) throw bad('ICP 不能为空')
    return { kind: 'icp', value, raw }
  }
  const keyword = normalizeKeyword(raw)
  if (!keyword) throw bad('企业关键词不能为空')
  return { kind: 'keyword', value: keyword, raw }
}

function parseScopeInput(input: { kind?: string; value?: string }): ParsedScope {
  const kind = text(input?.kind).toLowerCase()
  const raw = text(input?.value)
  if (!kind) return parseAutoScopeLine(raw)
  if (!SCOPE_KINDS.has(kind)) throw bad(`不支持的范围类型: ${kind}`)
  if (kind === 'domain' || kind === 'ip' || kind === 'cidr') {
    const rule = parseScopeLine(raw)
    if (rule.kind !== kind) throw bad(`"${raw}" 不是有效的 ${kind} 范围`)
    return rule
  }
  if (kind === 'icp') {
    const value = normalizeICP(raw)
    if (!value) throw bad('ICP 不能为空')
    return { kind, value, raw }
  }
  const value = normalizeKeyword(raw)
  if (!value) throw bad('企业关键词不能为空')
  return { kind, value, raw }
}

/** 接受 [{kind,value}] 与历史 ["example.com"] 两种契约。 */
function normalizeScopeInputs(raw: unknown): Array<{ kind?: string; value?: string }> {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    if (typeof item === 'string') return { value: item }
    if (item && typeof item === 'object') return { kind: (item as any).kind, value: (item as any).value }
    return { value: '' }
  })
}

function validateScopeInputBounds(inputs: Array<{ kind?: string; value?: string }>) {
  inputs.forEach((input, index) => {
    if (runeCount(String(input?.value ?? '')) > MAX_SCOPE_RUNES) {
      throw bad(`企业范围第 ${index + 1} 条原始值过长: 最多 ${MAX_SCOPE_RUNES} 个字符`)
    }
  })
}

function parseScopeInputs(inputs: Array<{ kind?: string; value?: string }>) {
  const rules: ParsedScope[] = []
  const errors: string[] = []
  for (const input of inputs) {
    try {
      const rule = parseScopeInput(input)
      if (runeCount(rule.raw) > MAX_SCOPE_RUNES) throw bad(`企业范围原始值过长: 最多 ${MAX_SCOPE_RUNES} 个字符`)
      if (runeCount(rule.value ?? '') > MAX_SCOPE_RUNES) throw bad(`企业范围规范化值过长: 最多 ${MAX_SCOPE_RUNES} 个字符`)
      rules.push(rule)
    } catch (error: any) {
      errors.push(`${text(input?.value)}: ${String(error?.message ?? error)}`)
    }
  }
  return { rules, invalid: errors.length, errors }
}

function scopeDedupeKey(companyId: number, rule: ParsedScope) {
  if (rule.kind === 'domain') return `${companyId}|domain|${rule.domain}`
  if (rule.kind === 'ip' || rule.kind === 'cidr') return `${companyId}|net|${rule.net}`
  return `${companyId}|${rule.kind}|${rule.value}`
}

function scopeRecord(id: number, companyId: number, rule: ParsedScope, reason: string) {
  return {
    id,
    company_id: companyId,
    kind: rule.kind,
    ...(rule.domain ? { domain: rule.domain } : {}),
    ...(rule.net ? { net: rule.net } : {}),
    ...(rule.value ? { value: rule.value } : {}),
    raw: rule.raw,
    reason
  }
}

async function companyRows() {
  return writer().list('companies')
}

async function scopeRows() {
  return writer().list('company_scope')
}

function companyNKey(name: string) {
  return String(name).toLowerCase().trim().replace(/\s+/g, ' ')
}

// ── 企业归属重建（db/companies.go recomputeAttributionTx）──────────────────

const DOMAIN_ATTRIBUTION_TYPES = new Set(['root_domain', 'subdomain', 'service', 'endpoint'])
const NET_ATTRIBUTION_TYPES = new Set(['ip', 'subdomain', 'service', 'endpoint'])

interface NetRule {
  company_id: number
  net: ParsedNet
}

function netRuleOf(scope: any): ParsedNet | null {
  const kind = String(scope?.kind ?? '')
  if (kind === 'ip' || kind === 'cidr') {
    return parseNetText(String(scope.net ?? scope.value ?? ''))
  }
  return null
}

function malformedIPWarning(assets: any[]): string | undefined {
  const offenders = assets.filter((asset) => (
    NET_ATTRIBUTION_TYPES.has(String(asset.type ?? ''))
    && text(asset.ip) !== ''
    && ipBigInt(text(asset.ip)) === null
  ))
  if (!offenders.length) return undefined
  const samples = offenders.slice(0, 5).map((asset) => `#${asset.id} ${asset.ip}`).join('、')
  const suffix = offenders.length > 5 ? ` 等 ${offenders.length} 条` : ''
  return `${offenders.length} 条资产的 ip 字段不是合法 IP，已跳过 IP/CIDR 范围匹配（这些资产不会被网段规则归属到企业）：${samples}${suffix}`
}

async function recomputeAttribution(): Promise<{ warning?: string; changed: number }> {
  const assets = await writer().list('assets')
  const scopes = await scopeRows()
  const domainRules = scopes
    .filter((scope) => scope.kind === 'domain' && text(scope.domain))
    .map((scope) => ({ company_id: Number(scope.company_id), domain: String(scope.domain) }))
    .sort((a, b) => b.domain.length - a.domain.length || a.company_id - b.company_id)
  const netRules: NetRule[] = scopes
    .map((scope) => {
      const net = netRuleOf(scope)
      return net ? { company_id: Number(scope.company_id), net } : null
    })
    .filter((rule): rule is NetRule => rule !== null)
    .sort((a, b) => b.net.bits - a.net.bits || a.company_id - b.company_id)
  const icpRules = scopes
    .filter((scope) => scope.kind === 'icp' && text(scope.value))
    .map((scope) => ({ company_id: Number(scope.company_id), value: normalizeICP(scope.value) }))
    .sort((a, b) => a.company_id - b.company_id)

  const ops: Array<{ table: string; key: string; record: Record<string, unknown>; expectedRev?: number }> = []
  for (const asset of assets) {
    const derived = String(asset.company_source ?? '') === 'scope'
    const unowned = asset.company_id == null || asset.company_id === 0
    if (!derived && !unowned) continue
    let next: number | null = null
    const type = String(asset.type ?? '')
    if (DOMAIN_ATTRIBUTION_TYPES.has(type) && text(asset.root_domain)) {
      const hit = domainRules.find((rule) => rule.domain === String(asset.root_domain))
      if (hit) next = hit.company_id
    }
    if (next == null && NET_ATTRIBUTION_TYPES.has(type) && text(asset.ip)) {
      const hit = netRules.find((rule) => netContains(rule.net, String(asset.ip)))
      if (hit) next = hit.company_id
    }
    if (next == null && (text(asset.icp) || text(asset.app_icp))) {
      const icp = normalizeICP(asset.icp)
      const appICP = normalizeICP(asset.app_icp)
      const hit = icpRules.find((rule) => (icp !== '' && rule.value === icp) || (appICP !== '' && rule.value === appICP))
      if (hit) next = hit.company_id
    }
    if (!derived && next == null) continue
    if ((asset.company_id ?? null) === next) continue
    ops.push({
      table: 'assets',
      key: String(asset.id),
      record: { ...asset, company_id: next, company_source: 'scope' },
      expectedRev: parseRev(asset)
    })
  }
  if (ops.length) {
    await writer().commit(ops)
    store.invalidate?.(['assets'])
  }
  return { warning: malformedIPWarning(assets), changed: ops.length }
}

async function insertScopeRules(companyId: number, rules: ParsedScope[], reason: string) {
  const existing = await scopeRows()
  const keys = new Set(existing.map((row) => scopeDedupeKey(Number(row.company_id), {
    kind: String(row.kind ?? ''),
    domain: row.domain ? String(row.domain) : undefined,
    net: row.net ? String(row.net) : undefined,
    value: row.value ? String(row.value) : undefined,
    raw: String(row.raw ?? '')
  } as ParsedScope)))
  let nextId = existing.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  let added = 0
  let skipped = 0
  let needsAttribution = false
  const ops: Array<{ table: string; key: string; record: Record<string, unknown> }> = []
  for (const rule of rules) {
    const key = scopeDedupeKey(companyId, rule)
    if (keys.has(key)) {
      skipped += 1
      continue
    }
    keys.add(key)
    ops.push({ table: 'company_scope', key: String(nextId), record: scopeRecord(nextId, companyId, rule, reason) })
    nextId += 1
    added += 1
    if (rule.kind !== 'keyword') needsAttribution = true
  }
  if (ops.length) await writer().commit(ops)
  return { added, skipped, needsAttribution }
}

function companyDTO(row: any) {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    nkey: String(row.nkey ?? companyNKey(String(row.name ?? ''))),
    ...(row.logo ? { logo: String(row.logo) } : {}),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? '')
  }
}

function scopeDTO(row: any) {
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    kind: String(row.kind ?? ''),
    ...(row.domain ? { domain: String(row.domain) } : {}),
    ...(row.net ? { net: String(row.net) } : {}),
    ...(row.value ? { value: String(row.value) } : {}),
    raw: String(row.raw ?? ''),
    ...(row.reason ? { reason: String(row.reason) } : {})
  }
}

// ── 任务资产 / 覆盖图（server/server.go + db/task_scope.go）───────────────

const SCOPE_MATCH_TYPES = new Set(['root_domain', 'subdomain', 'service', 'endpoint'])

function scopeMatchesAsset(scope: any, asset: any): boolean {
  const kind = String(scope?.kind ?? '')
  const type = String(asset?.type ?? '')
  const value = text(scope?.value)
  const domain = text(scope?.domain)
  if (kind === 'company') return asset?.company_id != null && Number(asset.company_id) === Number(scope.company_id)
  if (kind === 'root_domain') {
    const expected = domain || value
    return SCOPE_MATCH_TYPES.has(type) && expected !== '' && text(asset.root_domain) === expected
  }
  if (kind === 'subdomain') {
    const expected = domain || value
    return expected !== '' && text(asset.domain) === expected
  }
  if (kind === 'domain') {
    const expected = domain || value
    if (!expected) return false
    return (SCOPE_MATCH_TYPES.has(type) && text(asset.root_domain) === expected) || text(asset.domain) === expected
  }
  if (kind === 'ip' || kind === 'cidr') {
    const net = parseNetText(text(scope.net) || value)
    return net ? netContains(net, text(asset.ip)) : false
  }
  if (kind === 'icp') {
    const expected = normalizeICP(value)
    if (!expected) return false
    return normalizeICP(asset.icp) === expected || normalizeICP(asset.app_icp) === expected
  }
  return false
}

async function taskContext(task: any) {
  const relations = (await writer().list('task_relations')).filter((row) => String(row.task_id) === String(task.id))
  const taskIds = new Set<string>([String(task.id), ...relations.map((row) => String(row.source_task_id))])
  const tasks = await writer().list('tasks')
  const explorations = new Set<number>()
  const byTaskId = new Map<string, any>()
  for (const row of tasks) {
    if (!taskIds.has(String(row.id))) continue
    byTaskId.set(String(row.id), row)
    explorations.add(Number(row.exploration_id))
  }
  const scopes = (await writer().list('task_scope')).filter((row) => taskIds.has(String(row.task_id)))
  return { taskIds, explorations, byTaskId, relations, scopes }
}

function assetLabel(asset: any): string {
  const type = String(asset.type ?? '')
  switch (type) {
    case 'root_domain':
    case 'subdomain':
      return text(asset.domain)
    case 'ip':
      return text(asset.ip)
    case 'app':
      return text(asset.app_name)
    case 'service': {
      const host = text(asset.domain) || text(asset.ip)
      const viaURL = text(asset.url)
      if (viaURL) return viaURL
      if (host && Number(asset.port ?? 0) > 0) return `${host}:${Number(asset.port)}`
      return text(asset.service_name) || `#${asset.id}`
    }
    case 'endpoint':
      return text(asset.url) || `#${asset.id}`
    default:
      return `#${asset.id}`
  }
}

function coverageNodeLabel(node: any): string {
  if ((node.kind === 'endpoint' || node.kind === 'service') && node.url) return String(node.url)
  if (node.kind === 'app' && node.app_name) return String(node.app_name)
  for (const value of [node.url, node.domain, node.ip, node.app_name, node.root_domain]) {
    if (value) return String(value)
  }
  return String(node.key)
}

function hostPortOf(node: any): { host: string; port: number } {
  let host = String(node.domain ?? '')
  let port = Number(node.port ?? 0)
  if (!host && node.url) {
    try {
      const parsed = new URL(String(node.url).includes('://') ? String(node.url) : `http://${node.url}`)
      host = parsed.hostname
      if (!port) port = Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80)
    } catch {
      host = ''
    }
  }
  if (!host) host = String(node.ip ?? '')
  return { host, port }
}

async function buildCoverageGraph(task: any) {
  const graph: { nodes: any[]; edges: Array<{ src: string; dst: string }> } = { nodes: [], edges: [] }
  const ctx = await taskContext(task)
  const assets = await writer().list('assets')
  const nodes = await writer().list('nodes')
  const anchors = await writer().list('anchors')
  const contextNodeIds = new Set(nodes.filter((row) => ctx.explorations.has(Number(row.exploration_id))).map((row) => String(row.id)))
  const factIds = new Set(nodes.filter((row) => ctx.explorations.has(Number(row.exploration_id)) && row.kind === 'fact').map((row) => String(row.id)))
  const tested = new Set<number>(anchors.filter((row) => factIds.has(String(row.node_id))).map((row) => Number(row.asset_id)))
  const anchored = new Set<number>(anchors.filter((row) => contextNodeIds.has(String(row.node_id))).map((row) => Number(row.asset_id)))
  const targets = assets
    .filter((asset) => anchored.has(Number(asset.id)) || ctx.scopes.some((scope) => scopeMatchesAsset(scope, asset)))
    .sort((a, b) => Number(a.id) - Number(b.id))

  const byKey = new Map<string, any>()
  const rootByDomain = new Map<string, string>()
  const subByDomain = new Map<string, string>()
  const ipByAddr = new Map<string, string>()
  const svcByHostPort = new Map<string, string>()
  const svcByHost = new Map<string, string>()
  const companyIDs = new Set<number>()

  const add = (node: any) => {
    if (byKey.has(node.key)) return byKey.get(node.key)
    graph.nodes.push(node)
    byKey.set(node.key, node)
    return node
  }

  for (const asset of targets) {
    const companyID = Number(asset.company_id ?? 0)
    const node: any = {
      key: `a:${asset.id}`,
      kind: String(asset.type ?? ''),
      label: '',
      tested: tested.has(Number(asset.id)),
      in_scope: true,
      asset_id: Number(asset.id),
      ...(companyID > 0 ? { company_id: companyID } : {}),
      ...(text(asset.domain) ? { domain: text(asset.domain) } : {}),
      ...(text(asset.root_domain) ? { root_domain: text(asset.root_domain) } : {}),
      ...(text(asset.ip) ? { ip: text(asset.ip) } : {}),
      ...(text(asset.url) ? { url: text(asset.url) } : {}),
      ...(Number(asset.port ?? 0) > 0 ? { port: Number(asset.port) } : {}),
      ...(text(asset.service_type) ? { service_type: text(asset.service_type) } : {}),
      ...(text(asset.app_name) ? { app_name: text(asset.app_name) } : {}),
      ...(text(asset.page_title) ? { page_title: text(asset.page_title) } : {}),
      ...(Number(asset.status_code ?? 0) > 0 ? { status_code: Number(asset.status_code) } : {})
    }
    node.label = coverageNodeLabel(node)
    add(node)
    const key = String(node.key)
    switch (node.kind) {
      case 'root_domain':
        if (node.domain) rootByDomain.set(String(node.domain), key)
        break
      case 'subdomain':
        if (node.domain) subByDomain.set(String(node.domain), key)
        break
      case 'ip':
        if (node.ip) ipByAddr.set(String(node.ip), key)
        break
      case 'service': {
        const { host, port } = hostPortOf(node)
        if (host) {
          svcByHost.set(host, key)
          svcByHostPort.set(`${host}|${port}`, key)
        }
        break
      }
    }
    if (companyID > 0) companyIDs.add(companyID)
  }

  // 连接用的根域名节点：subdomain 指向的根域名若不在范围内，用真实资产或合成占位。
  const missingRoots = new Set<string>()
  for (const node of graph.nodes) {
    if (node.kind !== 'subdomain' || !node.root_domain) continue
    if (!rootByDomain.has(String(node.root_domain))) missingRoots.add(String(node.root_domain))
  }
  for (const root of missingRoots) {
    const existing = assets.find((asset) => String(asset.type) === 'root_domain' && text(asset.domain) === root)
    if (existing) {
      const companyID = Number(existing.company_id ?? 0)
      const node: any = {
        key: `a:${existing.id}`,
        kind: 'root_domain',
        label: root,
        tested: tested.has(Number(existing.id)),
        in_scope: true,
        asset_id: Number(existing.id),
        ...(companyID > 0 ? { company_id: companyID } : {}),
        domain: root
      }
      add(node)
      rootByDomain.set(root, node.key)
      if (companyID > 0) companyIDs.add(companyID)
    } else {
      const key = `r:${root}`
      add({ key, kind: 'root_domain', label: root, tested: false, in_scope: false, domain: root })
      rootByDomain.set(root, key)
    }
  }

  // 公司节点始终是灰色上下文。
  const companies = companyIDs.size ? await companyRows() : []
  for (const id of companyIDs) {
    const key = `c:${id}`
    if (byKey.has(key)) continue
    const company = companies.find((row) => Number(row.id) === Number(id))
    if (!company) continue
    add({ key, kind: 'company', label: String(company.name ?? ''), tested: false, in_scope: false, company_id: Number(id) })
  }

  const link = (childKey: string, parentKey: string) => {
    if (!parentKey || parentKey === childKey) return
    if (!byKey.has(parentKey)) return
    graph.edges.push({ src: childKey, dst: parentKey })
  }
  const firstOf = (...keys: string[]) => keys.find((key) => key && byKey.has(key)) ?? ''

  for (const node of graph.nodes) {
    switch (node.kind) {
      case 'subdomain':
        link(node.key, rootByDomain.get(String(node.root_domain ?? '')) ?? '')
        break
      case 'root_domain':
      case 'app':
      case 'ip':
        if (Number(node.company_id ?? 0) > 0) link(node.key, `c:${Number(node.company_id)}`)
        break
      case 'service':
        link(node.key, firstOf(
          subByDomain.get(String(node.domain ?? '')) ?? '',
          ipByAddr.get(String(node.ip ?? '')) ?? '',
          rootByDomain.get(String(node.root_domain ?? '')) ?? ''
        ))
        break
      case 'endpoint': {
        const { host, port } = hostPortOf(node)
        link(node.key, firstOf(
          svcByHostPort.get(`${host}|${port}`) ?? '',
          svcByHost.get(host) ?? '',
          subByDomain.get(host) ?? '',
          subByDomain.get(String(node.domain ?? '')) ?? '',
          ipByAddr.get(host) ?? '',
          ipByAddr.get(String(node.ip ?? '')) ?? '',
          rootByDomain.get(String(node.root_domain ?? '')) ?? ''
        ))
        break
      }
    }
  }

  return graph
}

function nodeSummary(node: any): string {
  const payload = parseJson(node?.payload)
  if (!payload || typeof payload !== 'object') return ''
  for (const key of ['summary', 'text']) {
    const value = (payload as any)[key]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return ''
}

// ── register ───────────────────────────────────────────────────────────────

export function register(api: Hono) {
  // ── 任务批量控制（pause / resume）──────────────────────────────────────
  api.post('/api/tasks/control/batch', async (c) => {
    try {
      const payload = await jsonBody(c)
      const action = String(payload.action ?? '')
      if (action !== 'pause' && action !== 'resume') return c.json({ error: 'action must be pause|resume' }, 400)
      const ids = normalizeBatchTaskIDs(payload.task_ids)
      if (!ids.length || ids.length > MAX_BATCH_IDS) return c.json({ error: `task_ids 数量必须为 1-${MAX_BATCH_IDS}` }, 400)
      const items: any[] = []
      for (const parsed of ids) {
        const item: any = { id: parsed.id }
        if (!parsed.valid) {
          item.ok = false
          item.error = 'bad task id'
          items.push(item)
          continue
        }
        try {
          const record = await operations.controlTask(parsed.id, action)
          if (action === 'pause') taskQueue.pause(parsed.id)
          else taskQueue.resume(parsed.id)
          item.ok = true
          item.status = action === 'pause' ? 'paused' : 'running'
          item.queued = Boolean(record?.queued)
        } catch (error: any) {
          item.ok = false
          item.error = String(error?.message ?? error)
        }
        items.push(item)
      }
      store.invalidate?.(['tasks'])
      return c.json({ items })
    } catch (error) {
      return fail(c, error)
    }
  })

  // ── 任务批量分类（category_id 为 null 表示清空）────────────────────────
  api.post('/api/tasks/category/batch', async (c) => {
    try {
      const payload = await jsonBody(c)
      const rawCategory = payload.category_id
      if (rawCategory === undefined) return c.json({ error: 'category_id is required' }, 400)
      let categoryId: number | null = null
      if (rawCategory !== null) {
        const value = Number(rawCategory)
        if (!Number.isInteger(value) || value <= 0) return c.json({ error: '任务分类 id 无效' }, 400)
        categoryId = value
      }
      const ids = normalizeBatchTaskIDs(payload.task_ids)
      if (!ids.length || ids.length > MAX_CATEGORY_BATCH_IDS) {
        return c.json({ error: `task_ids 数量必须为 1-${MAX_CATEGORY_BATCH_IDS}` }, 400)
      }
      let category: any = null
      if (categoryId !== null) {
        const categories = await meta.table<any[]>('taskCategories')
        category = categories.find((row) => Number(row.id) === categoryId) ?? null
        if (!category) return c.json({ error: '分类不存在' }, 404)
      }
      const items: any[] = []
      const pending: string[] = []
      for (const parsed of ids) {
        const item: any = { id: parsed.id }
        if (!parsed.valid) {
          item.ok = false
          item.error = 'bad task id'
        } else {
          const task = await liveTask(parsed.id)
          if (!task) {
            item.ok = false
            item.error = 'task not found'
          } else {
            pending.push(parsed.id)
          }
        }
        items.push(item)
      }
      if (pending.length) {
        const ops = []
        for (const id of pending) {
          const task = await writer().readRecord('tasks', id)
          ops.push({
            table: 'tasks',
            key: id,
            record: { ...task, category_id: categoryId },
            expectedRev: parseRev(task)
          })
        }
        await writer().commit(ops)
        for (const item of items) {
          if (item.error) continue
          item.ok = true
        }
        store.invalidate?.(['tasks'])
      }
      return c.json({ items, category })
    } catch (error) {
      return fail(c, error)
    }
  })

  // ── 任务 LLM 配置链替换 ───────────────────────────────────────────────
  api.put('/api/tasks/:id/llm', async (c) => {
    try {
      const task = await taskByPath(c)
      if (!task) return c.json({ error: 'task not found' }, 404)
      const payload = await jsonBody(c)
      const profiles = await meta.table<any[]>('llmProfiles')
      const rawIDs = Array.isArray(payload.llm_profile_ids) ? payload.llm_profile_ids : []
      const seen = new Set<number>()
      const profileIds: number[] = []
      for (const raw of rawIDs) {
        const id = Number(raw)
        if (!Number.isInteger(id) || id <= 0 || seen.has(id)) return c.json({ error: 'LLM 配置 id 无效或重复' }, 400)
        seen.add(id)
        const profile = profiles.find((row) => Number(row.id) === id)
        if (!profile || !profileKeySet(profile)) return c.json({ error: `LLM 配置 #${id} 不存在或未设置 API Key` }, 400)
        profileIds.push(id)
      }
      let active = 0
      if (payload.active_llm_profile_id !== undefined && payload.active_llm_profile_id !== null) {
        active = Number(payload.active_llm_profile_id)
        if (!Number.isInteger(active) || active <= 0) return c.json({ error: 'LLM 配置 id 无效或重复' }, 400)
      }
      if (!profileIds.length) active = 0
      else if (!active) active = profileIds[0]
      if (active && !profileIds.includes(active)) {
        return c.json({ error: `active LLM profile ${active} is not in the task chain` }, 400)
      }
      const current = await writer().readRecord('tasks', String(task.id))
      if (!current) return c.json({ error: 'task not found' }, 404)
      const failoverState = profileIds.length ? (active ? 'ready' : 'chain_exhausted') : 'default'
      const next = {
        ...current,
        llm_profile_ids: profileIds,
        active_llm_profile_id: active || null,
        llm_profile_id: active || null,
        llm_failover_state: failoverState,
        llm_chain_revision: Number(current.llm_chain_revision ?? 0) + 1
      }
      await writer().commit([{ table: 'tasks', key: String(task.id), record: next, expectedRev: parseRev(current) }])
      store.invalidate?.(['tasks'])
      const reopened = await reopenLLMQuotaIntents(current)
      if (reopened) store.invalidate?.(['nodes'])
      return c.json({
        id: String(task.id),
        llm_profile_ids: profileIds,
        active_llm_profile_id: active || null,
        llm_failover_state: failoverState,
        reopened_intents: reopened
      })
    } catch (error) {
      return fail(c, error)
    }
  })

  // ── 任务各角色 LLM 解析结果 ───────────────────────────────────────────
  api.get('/api/tasks/:id/llm/resolution', async (c) => {
    try {
      const task = await taskByPath(c)
      if (!task) return c.json({ error: 'task not found' }, 404)
      const profiles = await meta.table<any[]>('llmProfiles')
      const roles: Record<string, LLMResolution> = {}
      for (const agentKey of ['mainagent', 'planner', 'worker']) {
        roles[agentKey] = await resolveRoleLLM(task, agentKey, profiles)
      }
      return c.json(roles)
    } catch (error) {
      return fail(c, error)
    }
  })

  // ── 资产关联节点（意图/事实/漏洞，含直接来源任务）──────────────────────
  api.get('/api/tasks/:id/asset-refs', async (c) => {
    try {
      const task = await taskByPath(c)
      if (!task) return c.json({ error: 'task not found' }, 404)
      const assetID = Number(c.req.query('asset_id') ?? 0)
      if (!Number.isInteger(assetID) || assetID <= 0) return c.json({ error: '需要 asset_id' }, 400)
      const ctx = await taskContext(task)
      const anchors = (await writer().list('anchors')).filter((row) => Number(row.asset_id) === assetID)
      const nodes = await writer().list('nodes')
      const refs: any[] = []
      const collect = (explorationId: number, sourceTaskId: string | null, inherited: boolean) => {
        for (const anchor of anchors) {
          const node = nodes.find((row) => (
            String(row.id) === String(anchor.node_id)
            && Number(row.exploration_id) === explorationId
            && ['intent', 'fact', 'finding'].includes(String(row.kind))
          ))
          if (!node) continue
          if (inherited && node.kind === 'intent' && !INTENT_TERMINAL_STATES.has(String(node.state))) continue
          refs.push({
            id: Number(node.id),
            kind: String(node.kind),
            state: String(node.state ?? ''),
            summary: nodeSummary(node),
            ...(inherited && sourceTaskId ? { source_task_id: sourceTaskId } : {}),
            ...(inherited ? { inherited: true } : {})
          })
        }
      }
      collect(Number(task.exploration_id), null, false)
      for (const relation of ctx.relations) {
        const source = ctx.byTaskId.get(String(relation.source_task_id))
        if (!source) continue
        collect(Number(source.exploration_id), String(source.id), true)
      }
      refs.sort((a, b) => b.id - a.id)
      return c.json({
        intents: refs.filter((ref) => ref.kind === 'intent'),
        facts: refs.filter((ref) => ref.kind === 'fact'),
        findings: refs.filter((ref) => ref.kind === 'finding')
      })
    } catch (error) {
      return fail(c, error)
    }
  })

  // ── 意图锚定资产（本任务 + 直接来源任务的终态意图）─────────────────────
  api.get('/api/tasks/:id/intent-assets', async (c) => {
    try {
      const task = await taskByPath(c)
      if (!task) return c.json({ error: 'task not found' }, 404)
      const ctx = await taskContext(task)
      const nodes = await writer().list('nodes')
      const anchors = await writer().list('anchors')
      const assets = await writer().list('assets')
      const links = await writer().list('task_asset_links')
      const out: any[] = []
      const collect = (contextTaskId: string, explorationId: number, inherited: boolean) => {
        const intents = nodes
          .filter((row) => Number(row.exploration_id) === explorationId && row.kind === 'intent')
          .sort((a, b) => Number(b.id) - Number(a.id))
        for (const intent of intents) {
          for (const anchor of anchors.filter((row) => String(row.node_id) === String(intent.id))) {
            const asset = assets.find((row) => Number(row.id) === Number(anchor.asset_id))
            if (!asset) continue
            if (inherited && !INTENT_TERMINAL_STATES.has(String(intent.state))) continue
            const link = links.find((row) => String(row.task_id) === contextTaskId && Number(row.asset_id) === Number(asset.id))
            out.push({
              intent_id: Number(intent.id),
              asset_id: Number(asset.id),
              type: String(asset.type ?? ''),
              label: assetLabel(asset),
              source: String(link?.source ?? 'anchor'),
              source_summary: String(link?.source_summary ?? '') || '意图在黑板中锚定该资产',
              ...(link?.source_node_id != null ? { source_node_id: Number(link.source_node_id) } : {}),
              source_task_id: Number(contextTaskId),
              inherited
            })
          }
        }
      }
      collect(String(task.id), Number(task.exploration_id), false)
      for (const relation of ctx.relations) {
        const source = ctx.byTaskId.get(String(relation.source_task_id))
        if (!source) continue
        collect(String(source.id), Number(source.exploration_id), true)
      }
      out.sort((a, b) => Number(a.inherited) - Number(b.inherited) || b.intent_id - a.intent_id || a.asset_id - b.asset_id)
      return c.json({ assets: out })
    } catch (error) {
      return fail(c, error)
    }
  })

  // ── 资产覆盖图 ────────────────────────────────────────────────────────
  api.get('/api/tasks/:id/coverage-graph', async (c) => {
    try {
      const task = await taskByPath(c)
      if (!task) return c.json({ error: 'task not found' }, 404)
      return c.json(await buildCoverageGraph(task))
    } catch (error) {
      return fail(c, error)
    }
  })

  // ── 公司（企业主体）────────────────────────────────────────────────────

  api.post('/api/companies', async (c) => {
    try {
      const payload = await jsonBody(c)
      const name = text(payload.name)
      if (!name) return c.json({ error: 'name required' }, 400)
      const inputs = normalizeScopeInputs(payload.scope)
      validateScopeInputBounds(inputs)
      const parsed = parseScopeInputs(inputs)
      const existing = await companyRows()
      const nkey = companyNKey(name)
      if (existing.some((row) => String(row.nkey ?? companyNKey(String(row.name ?? ''))) === nkey)) {
        return c.json({ error: '企业名称已存在' }, 409)
      }
      const id = existing.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
      const stamp = now()
      const company = {
        id,
        name,
        nkey,
        ...(text(payload.logo) ? { logo: text(payload.logo) } : {}),
        created_at: stamp,
        updated_at: stamp
      }
      await writer().put({ table: 'companies', key: String(id), record: company })
      const inserted = await insertScopeRules(id, parsed.rules, 'api')
      if (inserted.added && inserted.needsAttribution) await recomputeAttribution()
      store.invalidate?.(['companies'])
      return c.json({
        id,
        created: true,
        scope_added: inserted.added,
        scope_skipped: inserted.skipped,
        scope_invalid: parsed.invalid,
        ...(parsed.errors.length ? { scope_errors: parsed.errors } : {})
      }, 201)
    } catch (error) {
      return fail(c, error)
    }
  })

  api.get('/api/companies/:id', async (c) => {
    try {
      const id = Number(c.req.param('id'))
      if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'invalid id' }, 400)
      const company = (await companyRows()).find((row) => Number(row.id) === id)
      if (!company) return c.json({ error: 'company not found' }, 404)
      const scope = (await scopeRows())
        .filter((row) => Number(row.company_id) === id)
        .sort((a, b) => Number(a.id) - Number(b.id))
      return c.json({ company: companyDTO(company), scope: scope.map(scopeDTO) })
    } catch (error) {
      return fail(c, error)
    }
  })

  api.delete('/api/companies/:id', async (c) => {
    try {
      const id = Number(c.req.param('id'))
      if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'invalid id' }, 400)
      const payload = await jsonBody(c)
      const deleteAssets = payload?.delete_assets === true
      const company = (await companyRows()).find((row) => Number(row.id) === id)
      if (!company) return c.json({ error: 'company not found' }, 404)
      let assetsDeleted = 0
      if (deleteAssets) {
        const owned = (await writer().list('assets')).filter((asset) => Number(asset.company_id ?? 0) === id)
        for (const asset of owned) await writer().remove('assets', String(asset.id))
        assetsDeleted = owned.length
      }
      const scopes = (await scopeRows()).filter((row) => Number(row.company_id) === id)
      for (const scope of scopes) await writer().remove('company_scope', String(scope.id))
      await writer().remove('companies', String(id))
      await recomputeAttribution()
      store.invalidate?.(['companies', 'assets'])
      return c.json({ deleted: 1, assets_deleted: assetsDeleted })
    } catch (error) {
      return fail(c, error)
    }
  })

  api.post('/api/companies/:id/scope', async (c) => {
    try {
      const id = Number(c.req.param('id'))
      if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'invalid company id' }, 400)
      const payload = await jsonBody(c)
      const inputs = normalizeScopeInputs(payload.scope)
      validateScopeInputBounds(inputs)
      const parsed = parseScopeInputs(inputs)
      const reason = text(payload.reason)
      const reset = payload.reset === true
      const company = (await companyRows()).find((row) => Number(row.id) === id)
      if (!company) return c.json({ error: 'company not found' }, 404)
      let added = 0
      let skipped = 0
      if (reset) {
        if (parsed.invalid > 0) {
          return c.json({ error: `企业范围包含 ${parsed.invalid} 条无效规则，未覆盖原有范围` }, 400)
        }
        const scopes = (await scopeRows()).filter((row) => Number(row.company_id) === id)
        for (const scope of scopes) await writer().remove('company_scope', String(scope.id))
        const inserted = await insertScopeRules(id, parsed.rules, reason)
        added = inserted.added
        await recomputeAttribution()
      } else {
        const inserted = await insertScopeRules(id, parsed.rules, reason)
        added = inserted.added
        skipped = inserted.skipped
        if (added && inserted.needsAttribution) await recomputeAttribution()
      }
      const warning = malformedIPWarning(await writer().list('assets'))
      store.invalidate?.(['companies', 'assets'])
      return c.json({
        added,
        skipped,
        invalid: parsed.invalid,
        ...(parsed.errors.length ? { errors: parsed.errors } : {}),
        ...(warning ? { warnings: [warning] } : {})
      })
    } catch (error) {
      return fail(c, error)
    }
  })

  api.post('/api/companies/reattribute', async (c) => {
    try {
      await recomputeAttribution()
      return c.json({ ok: true })
    } catch (error) {
      return fail(c, error)
    }
  })
}
