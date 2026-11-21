// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod'

/** Loosely-typed records: the store validates shape, not every legacy field. */
export const taskRow = z.object({
  id: z.string(),
  exploration_id: z.number(),
  name: z.string(),
  description: z.string(),
  goal: z.string(),
  status: z.string(),
  paused: z.boolean(),
  queued: z.boolean(),
  category_id: z.number().nullable().optional(),
  pinned_at: z.string().nullable().optional(),
  llm_profile_id: z.number().nullable().optional(),
  active_llm_profile_id: z.number().nullable().optional(),
  coverage_enabled: z.boolean(),
  created_at_text: z.string(),
  created_unix: z.number(),
  completed_at_text: z.string().nullable(),
  completed_unix: z.number()
}).passthrough()

export const findingRow = z.object({
  id: z.string(),
  node_id: z.string().nullable().optional(),
  vulnclass: z.string(),
  name: z.string().optional().default(''),
  severity: z.string(),
  status: z.string(),
  summary: z.string(),
  evidence: z.string(),
  task_id: z.string().nullable().optional(),
  created_at_text: z.string(),
  created_at: z.string().optional()
}).passthrough()

export const assetRow = z.object({
  id: z.number(),
  type: z.string(),
  company_id: z.number().nullable().optional(),
  task_ids: z.array(z.number()),
  domain: z.string().nullable().optional(),
  root_domain: z.string().nullable().optional(),
  ip: z.string().nullable().optional(),
  port: z.number().nullable().optional(),
  url: z.string().nullable().optional(),
  last_seen: z.string().nullable().optional()
}).passthrough()

export const nodeRow = z.object({
  id: z.string(),
  exploration_id: z.number(),
  kind: z.string(),
  state: z.string(),
  payload: z.unknown(),
  priority: z.number(),
  origin: z.string().nullable().optional(),
  created_at: z.string()
}).passthrough()

export const companyRow = z.object({
  id: z.number(),
  name: z.string(),
  nkey: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  scope: z.array(z.unknown()).default([]),
  asset_count: z.number().default(0)
}).passthrough()

export interface TaskMetrics {
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  last_activity_unix: number
  goals_total: number
  goals_met: number
  in_flight: number
  findings: { critical: number; high: number; medium: number; low: number }
}

export interface Store {
  backend: 'json' | 'postgres'
  init(): Promise<void>
  tasks: {
    list(): Promise<any[]>
    get(id: string): Promise<any | undefined>
  }
  findings: {
    list(limit?: number): Promise<any[]>
    get(id: string): Promise<any | undefined>
    stats(): Promise<{ total: number; pending: number; critical: number; high: number; medium: number; low: number; vulnclasses: string[]; tasks: any[] }>
  }
  assets: {
    list(options: { type?: string; limit?: number; offset?: number }): Promise<{ rows: any[]; total: number }>
    counts(): Promise<Record<string, number>>
  }
  companies: {
    list(): Promise<any[]>
  }
  taskMetrics(): Promise<Map<number, TaskMetrics>>
  invalidate?(tables?: string[]): void
  nodes: {
    page(options: { taskId: string; page: number; size: number; order?: 'asc' | 'desc'; kinds?: string[]; states?: string[]; before?: string }): Promise<{ items: any[]; total: number; edges: any[] }>
  }
}
