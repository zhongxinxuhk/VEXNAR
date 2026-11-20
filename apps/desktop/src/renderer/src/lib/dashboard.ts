// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Overview data layer.
 *
 * The Overview view mirrors the web console dashboard: it reads the exact same
 * Go backend endpoints (`/api/stats`, `/api/tasks`, `/api/tokens/*`, ...) and
 * derives the same aggregates client-side. Nothing here keeps its own store —
 * every value comes from the shared PostgreSQL-backed API.
 */

import { consoleRequest, type Finding, type FindingStats, type FindingsPage, type Stats, type Task, type TrafficExchange, type TrafficPage } from './console'
import type { Locale } from './i18n'

// ── API payloads ─────────────────────────────────────────────────────────────

export interface DashboardSettings {
  traffic_capture?: boolean
}

export interface InterceptItem {
  id: number
  tool_name: string
  agent_name: string
  status?: 'pending' | 'allowed' | 'denied' | 'timeout' | string
  tool_input?: Record<string, unknown>
  reason?: string
  task_id?: string
  conversation_id?: number
  created_at?: string
  decided_at?: string
  decision_source?: string
  rule_name?: string
  conv_title?: string
  conv_agent_key?: string
}

export interface ActivityItem {
  seq: number
  ts: number
  worker: string
  kind: string
  tool?: string
  summary: string
}

export interface ConversationTokenRow {
  llm_profile_id: number | null
  created_at: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
}

export interface LLMProfileRow {
  id: string | number
  name: string
  model?: string
  is_default?: boolean
}

export interface UsageProfileRow {
  profile_name: string
  calls: number
  tasks: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
}

export interface UsageDailyRow {
  profile_name: string
  date: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
}

export interface UsageResponse {
  by_profile?: UsageProfileRow[]
  daily?: UsageDailyRow[]
}

export interface AgentRow {
  id: string | number
  key: string
  name: string
  enabled: boolean
  tool_count?: number
  mcp_count?: number
  skill_count?: number
}

export interface McpRow {
  id: string | number
  name: string
  enabled: boolean
  tools?: string[]
}

export interface SkillRow {
  name?: string
  key?: string
  enabled?: boolean
}

export interface ToolRow {
  key: string
  enabled: boolean
}

export interface FastSources {
  stats: Stats
  settings: DashboardSettings
  pending: InterceptItem[]
  activity: ActivityItem[]
  conversationTokens: ConversationTokenRow[]
  findings: FindingStats
  recentFindings: Finding[]
}

export interface SlowSources {
  traffic: TrafficExchange[]
  trafficTotal: number
  trafficEnabled: boolean
  agents: AgentRow[]
  mcpServers: McpRow[]
  skills: SkillRow[]
  tools: ToolRow[]
  profiles: LLMProfileRow[]
  usage: UsageResponse
}

/**
 * Fast lane: everything the dashboard refreshes every 5s. Findings are read
 * through `/exploration/findings/stats` + one page of the list, which is the
 * authoritative aggregate and avoids transferring 500 records per poll.
 */
export async function fetchFastSources(): Promise<FastSources> {
  const [stats, settings, pending, activity, conversationTokens, findings, recent] = await Promise.all([
    consoleRequest<Stats>('/stats'),
    consoleRequest<DashboardSettings>('/settings'),
    consoleRequest<{ pending?: InterceptItem[] }>('/intercept/pending'),
    consoleRequest<{ items?: ActivityItem[] }>('/exploration/activity?limit=30'),
    consoleRequest<ConversationTokenRow[]>('/tokens/conversations'),
    consoleRequest<FindingStats>('/exploration/findings/stats'),
    consoleRequest<FindingsPage>('/exploration/findings?page=1&limit=8')
  ])
  return {
    stats,
    settings,
    pending: Array.isArray(pending?.pending) ? pending.pending : [],
    activity: Array.isArray(activity?.items) ? activity.items : [],
    conversationTokens: Array.isArray(conversationTokens) ? conversationTokens : [],
    findings,
    recentFindings: Array.isArray(recent?.items) ? recent.items : []
  }
}

/** Slow lane: inventory-ish data that the dashboard refreshes every 15s. */
/** Pending intercepts, shared with the web approvals page. */
export async function fetchPendingIntercepts(): Promise<InterceptItem[]> {
  const response = await consoleRequest<{ pending?: InterceptItem[] }>('/intercept/pending')
  return Array.isArray(response?.pending) ? response.pending : []
}

/** Recently decided intercepts, newest first. */
export async function fetchInterceptHistory(): Promise<InterceptItem[]> {
  const response = await consoleRequest<{ items?: InterceptItem[] }>('/intercept/history')
  return Array.isArray(response?.items) ? response.items : []
}

/** Resolve a held tool call; the backend resumes the waiting agent. */
export async function decideIntercept(id: number, decision: 'allowed' | 'denied'): Promise<void> {
  await consoleRequest(`/intercept/pending/${id}/decide`, 'POST', { decision })
}

/** A compact human-readable target for an approval card. */
export function interceptTarget(input: Record<string, unknown> | undefined): string {
  if (!input) return ''
  for (const key of ['command', 'path', 'url', 'pattern', 'domain', 'query', 'target', 'name']) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  try {
    const text = JSON.stringify(input)
    return text.length > 180 ? `${text.slice(0, 180)}…` : text
  } catch {
    return ''
  }
}

export async function fetchSlowSources(): Promise<SlowSources> {
  const [traffic, agents, mcp, skills, tools, profiles, usage] = await Promise.all([
    consoleRequest<TrafficPage>('/traffic?page=0&size=50'),
    consoleRequest<{ agents?: AgentRow[] }>('/agents'),
    consoleRequest<{ servers?: McpRow[] }>('/mcp'),
    consoleRequest<{ skills?: SkillRow[] }>('/skills'),
    consoleRequest<{ tools?: ToolRow[] }>('/tools'),
    consoleRequest<{ profiles?: LLMProfileRow[] }>('/llm/profiles'),
    consoleRequest<UsageResponse>('/tokens/usage?days=365')
  ])
  return {
    traffic: Array.isArray(traffic?.exchanges) ? traffic.exchanges : [],
    trafficTotal: traffic?.total ?? traffic?.count ?? 0,
    trafficEnabled: traffic?.enabled ?? false,
    agents: Array.isArray(agents?.agents) ? agents.agents : [],
    mcpServers: Array.isArray(mcp?.servers) ? mcp.servers : [],
    skills: Array.isArray(skills?.skills) ? skills.skills : [],
    tools: Array.isArray(tools?.tools) ? tools.tools : [],
    profiles: Array.isArray(profiles?.profiles) ? profiles.profiles : [],
    usage: usage ?? {}
  }
}

// ── token aggregation ───────────────────────────────────────────────────────

export type TokenBucket = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  tasks: number
}

export type TokenSource = 'old' | 'new'

export type TokenRangeDays = 7 | 30 | 90 | 180 | 365

export const TOKEN_RANGES: TokenRangeDays[] = [7, 30, 90, 180, 365]

export type DailyTokenPoint = {
  date: string
  input: number
  output: number
  cacheRead: number
}

export type TokenTab = 'all' | number

const EMPTY_BUCKET: TokenBucket = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, tasks: 0 }

export function activeProfileId(profiles: LLMProfileRow[]): number | null {
  const active = profiles.find((profile) => profile.is_default)
  if (!active) return null
  const id = Number(active.id)
  return Number.isFinite(id) ? id : null
}

/** profile name → id, used to map llm_usage rows back onto profile tabs. */
export function profileIdsByName(profiles: LLMProfileRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const profile of profiles) {
    const id = Number(profile.id)
    if (Number.isFinite(id)) map.set(profile.name, id)
  }
  return map
}

/**
 * Legacy source (`activity`): whole-task tokens plus conversation usage,
 * bucketed by the task's pinned profile (null = active default profile).
 * This covers historical tasks but cannot represent interrupted calls.
 */
export function foldLegacyTokens(
  tasks: Task[],
  conversations: ConversationTokenRow[],
  defaultProfileId: number | null
): Map<number | null, TokenBucket> {
  const buckets = new Map<number | null, TokenBucket>()
  const fold = (
    profile: number | null,
    input: number,
    output: number,
    cacheRead: number,
    cacheWrite: number,
    addTask: boolean
  ): void => {
    const previous = buckets.get(profile) ?? EMPTY_BUCKET
    buckets.set(profile, {
      input: previous.input + input,
      output: previous.output + output,
      cacheRead: previous.cacheRead + cacheRead,
      cacheWrite: previous.cacheWrite + cacheWrite,
      tasks: previous.tasks + (addTask ? 1 : 0)
    })
  }
  for (const task of tasks) {
    fold(
      task.llm_profile_id ?? defaultProfileId,
      task.tokens?.input_tokens ?? 0,
      task.tokens?.output_tokens ?? 0,
      task.tokens?.cache_read_tokens ?? 0,
      task.tokens?.cache_write_tokens ?? 0,
      true
    )
  }
  for (const row of conversations) {
    fold(
      row.llm_profile_id ?? defaultProfileId,
      row.input_tokens,
      row.output_tokens,
      row.cache_read_tokens,
      row.cache_write_tokens,
      false
    )
  }
  return buckets
}

/**
 * Ledger source (`llm_usage`): per-call aggregates, accurate including
 * interrupted calls, but only covers the period after the ledger was enabled.
 */
export function foldLedgerTokens(
  usage: UsageResponse,
  idsByName: Map<string, number>,
  defaultProfileId: number | null
): Map<number | null, TokenBucket> {
  const buckets = new Map<number | null, TokenBucket>()
  for (const row of usage.by_profile ?? []) {
    // Renamed/deleted/empty profile names fall back to the default bucket.
    const profile = idsByName.get(row.profile_name) ?? defaultProfileId
    const previous = buckets.get(profile) ?? EMPTY_BUCKET
    buckets.set(profile, {
      input: previous.input + row.input_tokens,
      output: previous.output + row.output_tokens,
      cacheRead: previous.cacheRead + row.cache_read_tokens,
      cacheWrite: previous.cacheWrite + row.cache_write_tokens,
      tasks: previous.tasks + row.tasks
    })
  }
  return buckets
}

export function summarizeBuckets(buckets: Map<number | null, TokenBucket>, tab: TokenTab): TokenBucket {
  if (tab === 'all') {
    let input = 0
    let output = 0
    let cacheRead = 0
    let cacheWrite = 0
    let tasks = 0
    for (const bucket of buckets.values()) {
      input += bucket.input
      output += bucket.output
      cacheRead += bucket.cacheRead
      cacheWrite += bucket.cacheWrite
      tasks += bucket.tasks
    }
    return { input, output, cacheRead, cacheWrite, tasks }
  }
  return buckets.get(tab) ?? EMPTY_BUCKET
}

// ── daily series ────────────────────────────────────────────────────────────

function localDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** `created_at` is an RFC3339 string with a local offset; take its date part. */
export function dayKeyFromString(value: string | undefined | null): string {
  if (!value) return ''
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value)
  return match ? match[1] : ''
}

/** Every local day in the trailing window, oldest first, including today. */
export function buildDayRange(days: number, now = Date.now()): string[] {
  const end = new Date(now)
  end.setHours(0, 0, 0, 0)
  const cursor = new Date(end)
  cursor.setDate(cursor.getDate() - (Math.max(1, days) - 1))
  const keys: string[] = []
  while (cursor.getTime() <= end.getTime()) {
    keys.push(localDayKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

function emptySeries(days: number, now: number): { points: DailyTokenPoint[]; index: Map<string, number> } {
  const keys = buildDayRange(days, now)
  const points = keys.map((date) => ({ date, input: 0, output: 0, cacheRead: 0 }))
  const index = new Map(keys.map((key, position) => [key, position]))
  return { points, index }
}

export function dailyFromLegacy(
  tasks: Task[],
  conversations: ConversationTokenRow[],
  days: number,
  tab: TokenTab,
  defaultProfileId: number | null,
  now = Date.now()
): DailyTokenPoint[] {
  const { points, index } = emptySeries(days, now)
  const fold = (date: string, input: number, output: number, cacheRead: number): void => {
    const position = index.get(date)
    if (position === undefined) return
    points[position].input += input
    points[position].output += output
    points[position].cacheRead += cacheRead
  }
  for (const task of tasks) {
    if (tab !== 'all' && (task.llm_profile_id ?? defaultProfileId) !== tab) continue
    fold(
      dayKeyFromString(task.created_at),
      task.tokens?.input_tokens ?? 0,
      task.tokens?.output_tokens ?? 0,
      task.tokens?.cache_read_tokens ?? 0
    )
  }
  for (const row of conversations) {
    if (tab !== 'all' && (row.llm_profile_id ?? defaultProfileId) !== tab) continue
    fold(dayKeyFromString(row.created_at), row.input_tokens, row.output_tokens, row.cache_read_tokens)
  }
  return points
}

export function dailyFromLedger(
  usage: UsageResponse,
  days: number,
  tab: TokenTab,
  idsByName: Map<string, number>,
  defaultProfileId: number | null,
  now = Date.now()
): DailyTokenPoint[] {
  const { points, index } = emptySeries(days, now)
  for (const row of usage.daily ?? []) {
    if (tab !== 'all' && (idsByName.get(row.profile_name) ?? defaultProfileId) !== tab) continue
    const position = index.get(row.date)
    if (position === undefined) continue
    points[position].input += row.input_tokens
    points[position].output += row.output_tokens
    points[position].cacheRead += row.cache_read_tokens
  }
  return points
}

// ── inventory aggregates ────────────────────────────────────────────────────

export const ASSET_TYPE_COLORS: Record<string, string> = {
  root_domain: 'bg-blue-500',
  ip: 'bg-indigo-400',
  subdomain: 'bg-violet-500',
  app: 'bg-orange-400',
  service: 'bg-cyan-500',
  endpoint: 'bg-emerald-500'
}

export function assetTypeRows(counts: Record<string, number> | undefined): Array<{ type: string; count: number }> {
  if (!counts) return []
  return Object.entries(counts)
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([type, count]) => ({ type, count }))
}

export function totalAssets(counts: Record<string, number> | undefined): number {
  if (!counts) return 0
  return Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0)
}

export function trafficStatusBuckets(exchanges: TrafficExchange[]): Array<{ code: number; count: number }> {
  const buckets = new Map<number, number>()
  for (const exchange of exchanges) {
    const code = Number(exchange.status) || 0
    const bucket = Math.floor(code / 100) * 100
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1)
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([code, count]) => ({ code, count }))
}

/** 2xx / 3xx / 4xx / 5xx status colour, shared by the traffic panel. */
export function statusCodeTone(code: number): string {
  if (code < 300) return 'text-emerald-500'
  if (code < 400) return 'text-blue-400'
  if (code < 500) return 'text-amber-400'
  return 'text-red-400'
}

export function statusCodeBar(code: number): string {
  if (code < 300) return 'bg-emerald-500'
  if (code < 400) return 'bg-blue-400'
  if (code < 500) return 'bg-amber-400'
  return 'bg-red-400'
}

// ── formatting ──────────────────────────────────────────────────────────────

/** Compact token count in the web dashboard's k/M idiom (15.5M, 750.3k). */
export function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '—'
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(Math.round(value))
}

/** Raw compact count, keeping zero visible (used inside sentences). */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(Math.round(value))
}

export function parseTimestamp(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed / 1000
}

/** `12s 前` / `12s ago`, accepting unix seconds or an ISO string. */
export function formatRelative(value: number | string | null | undefined, locale: Locale): string {
  const timestamp = parseTimestamp(value)
  if (timestamp === null) return '—'
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp))
  if (seconds < 60) return locale === 'zh' ? `${seconds}s 前` : `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return locale === 'zh' ? `${minutes}m 前` : `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return locale === 'zh' ? `${hours}h 前` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  return locale === 'zh' ? `${days}d 前` : `${days}d ago`
}

/** The ordering timestamp of a task: last activity, else creation. */
export function taskTimestamp(task: Task): number {
  const direct = task.last_activity_unix ?? task.created_unix
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct
  return parseTimestamp(task.updated_at ?? task.last_activity ?? task.created_at) ?? 0
}

export function formatClock(epochMs: number, locale: Locale): string {
  try {
    return new Date(epochMs).toLocaleTimeString(locale === 'zh' ? 'zh-CN' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  } catch {
    return '—'
  }
}
