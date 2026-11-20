// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useI18n } from '@/lib/i18n'

export type TaskStatus = 'created' | 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'timeout'
export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type FindingStatus =
  | 'pending'
  | 'in_progress'
  | 'confirmed'
  | 'resolved'
  | 'fixed'
  | 'false_positive'
  | 'ignored'
  | 'duplicate'
  | 'risk_accepted'

export interface Task {
  id: string
  name?: string
  description: string
  goal: string
  status: TaskStatus
  paused?: boolean
  queued?: boolean
  active?: boolean
  in_flight?: number
  findings?: { critical: number; high: number; medium: number; low: number }
  last_activity?: string
  updated_at?: string
  created_at?: string
  created_unix?: number
  completed_unix?: number
  last_activity_unix?: number
  goals_total?: number
  goals_met?: number
  engine_mode?: string
  stalled?: boolean
  /** Whole-task token consumption, used by the overview token ledger. */
  tokens?: {
    input_tokens: number
    output_tokens: number
    cache_read_tokens: number
    cache_write_tokens: number
  }
  /** LLM profile pinned to this task; absent/null = the active default profile. */
  llm_profile_id?: number | null
  llm_profile_ids?: number[]
}

export interface Stats {
  assets: number
  findings_confirmed: number
  engine_mode?: string
  llm_configured?: boolean
  /** Shared asset index grouped by type (root_domain / subdomain / ip / ...). */
  asset_counts?: Record<string, number>
  traffic?: number
  traffic_enabled?: boolean
}

export interface FindingStats {
  total: number
  pending: number
  critical: number
  high: number
  medium: number
  low: number
}

export interface Finding {
  id: string
  finding_id?: string
  vulnclass: string
  name?: string
  severity: Severity
  status: FindingStatus
  summary: string
  evidence: string
  report?: string
  task_id?: string
  task_description?: string
  ts: string
  assets?: { id: string; type: string; label: string }[]
}

export interface FindingsPage {
  items: Finding[]
  total: number
  page: number
  page_size: number
}

export interface TrafficExchange {
  id: string
  ts: string
  host: string
  method: string
  url: string
  status: number
  content_type: string
  resp_len: number
}

export interface TrafficPage {
  enabled: boolean
  total?: number
  count?: number
  exchanges?: TrafficExchange[]
}

export interface TrafficDetail {
  req: string
  resp: string
}

export interface Asset {
  id: number
  type: string
  domain?: string
  root_domain?: string
  ip?: string
  port?: number
  url?: string
  app_name?: string
  page_title?: string
  status_code?: number
  open_ports?: { port: number; service?: string }[]
  last_seen: string
}

export interface AssetsPage {
  count: number
  total: number
  assets: Asset[]
}

export interface CommandRecord {
  id: number
  exploration_id: number
  worker: string
  tool: string
  command: string
  output: string
  is_error: boolean
  created_at: string
}

export interface CommandsPage {
  commands: CommandRecord[]
  total: number
}

export async function consoleRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
  options?: { timeoutMs?: number }
): Promise<T> {
  const result = await window.vexnar.backend.request<T>({
    path,
    method,
    body,
    ...(options?.timeoutMs ? { timeoutMs: options.timeoutMs } : {})
  })
  if (!result.ok) throw new Error(result.error)
  return result.data
}

export function assetLabel(asset: Asset): string {
  return (
    asset.domain ||
    asset.ip ||
    asset.url ||
    asset.app_name ||
    asset.page_title ||
    (asset.port ? `:${asset.port}` : '') ||
    `#${asset.id}`
  )
}

export function formatDate(value?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(useI18n.getState().locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function severityOrder(value: Severity): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[value]
}

export function severityTone(value: Severity): string {
  switch (value) {
    case 'critical':
      return 'border-danger/30 bg-danger/10 text-danger'
    case 'high':
      return 'border-warn/30 bg-warn/10 text-warn'
    case 'medium':
      return 'border-accent/25 bg-accent/10 text-accent'
    default:
      return 'border-line bg-panel-2 text-muted'
  }
}

export function statusTone(status: string): string {
  if (['running', 'in_progress', 'queued'].includes(status)) return 'text-warn'
  if (['done', 'confirmed', 'fixed', 'resolved'].includes(status)) return 'text-accent-2'
  if (['failed', 'timeout', 'false_positive'].includes(status)) return 'text-danger'
  return 'text-muted'
}
