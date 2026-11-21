// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { callApi } from '../api.js'

/**
 * 拦截规则的数据面。
 *
 * 字段与 Go（intercept/intercept.go · server/intercept.go）的 JSON 契约逐条对齐：
 * 这里改的是 Web 控制台 /system/intercept 改的同一行数据，两个客户端不会各算一套。
 * 只有 `id` / `created_at` 这类服务端字段在写入时被剔除。
 */
export type MatchTarget = 'tool_name' | 'tool_input'
export type MatchType = 'string' | 'regex'
export type RuleAction = 'allow' | 'deny' | 'ask'

export interface InterceptRule {
  id: number
  name: string
  enabled: boolean
  priority: number
  match_target: MatchTarget
  match_type: MatchType
  pattern: string
  action: RuleAction
  message: string
  timeout_enabled: boolean
  timeout_seconds: number
  timeout_action: 'allow' | 'deny'
  created_at?: string
  updated_at?: string
}

/** 写入体：去掉服务端生成的 id 与时间戳。 */
export type RuleDraft = Omit<InterceptRule, 'id' | 'created_at' | 'updated_at'>

export type JudgeFailAction = 'allow' | 'ask' | 'deny'

export interface JudgeConfig {
  enabled: boolean
  profile_id: number
  prompt: string
  timeout_seconds: number
  fail_action: JudgeFailAction
  ask_timeout_seconds: number
  ask_timeout_action: 'allow' | 'deny'
}

export interface JudgeDayUsage {
  date: string
  calls: number
  input_tokens: number
  output_tokens: number
}

export interface JudgeUsage {
  calls: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  daily: JudgeDayUsage[]
}

export interface ToolProfile {
  id: string
  name: string
  model: string
}

export interface ToolEntry {
  key: string
  description?: string
  system?: boolean
  kind?: string
}

const listOf = <T,>(value: unknown, key: string): T[] => {
  const inner = (value as Record<string, unknown> | null | undefined)?.[key]
  return Array.isArray(inner) ? (inner as T[]) : []
}

const num = (value: unknown, fallback = 0): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** 旧行可能缺字段；按 Go 的零值补齐，页面不必到处判空。 */
const ruleOf = (row: Record<string, unknown>): InterceptRule => ({
  id: num(row.id),
  name: String(row.name ?? ''),
  enabled: Boolean(row.enabled),
  priority: num(row.priority),
  match_target: row.match_target === 'tool_name' ? 'tool_name' : 'tool_input',
  match_type: row.match_type === 'regex' ? 'regex' : 'string',
  pattern: String(row.pattern ?? ''),
  action: row.action === 'allow' ? 'allow' : row.action === 'ask' ? 'ask' : 'deny',
  message: String(row.message ?? ''),
  timeout_enabled: Boolean(row.timeout_enabled),
  timeout_seconds: num(row.timeout_seconds),
  timeout_action: row.timeout_action === 'allow' ? 'allow' : 'deny'
})

/**
 * 拦截范围在没保存过设置时的默认值。
 *
 * 与 Go 的 `defaultEnabledTools` 一致：规则与模型兜底只对这批工具生效，
 * 服务端没给值时页面必须显示同一份清单，否则用户会以为拦截没开。
 */
export const DEFAULT_SCOPE_TOOLS: readonly string[] = [
  'Bash',
  'WebFetch',
  'web_search',
  'shell_open',
  'shell_send',
  'Write',
  'Edit',
  'MultiEdit'
]

export const interceptApi = {
  async rules(): Promise<InterceptRule[]> {
    const data = await callApi('/api/intercept/rules')
    return listOf<Record<string, unknown>>(data, 'rules').map(ruleOf)
  },

  async createRule(draft: RuleDraft): Promise<InterceptRule> {
    return ruleOf(await callApi('/api/intercept/rules', 'POST', draft))
  },

  async updateRule(id: number, draft: RuleDraft): Promise<InterceptRule> {
    return ruleOf(await callApi(`/api/intercept/rules/${id}`, 'PUT', draft))
  },

  deleteRule: (id: number): Promise<unknown> => callApi(`/api/intercept/rules/${id}`, 'DELETE'),

  toggleRule: (id: number, enabled: boolean): Promise<unknown> =>
    callApi(`/api/intercept/rules/${id}/toggle`, 'POST', { enabled }),

  async scopeTools(): Promise<string[]> {
    const data = await callApi('/api/intercept/tool-config')
    const tools = (data as { enabled_tools?: unknown } | null)?.enabled_tools
    if (!Array.isArray(tools)) return [...DEFAULT_SCOPE_TOOLS]
    return tools.map((item) => String(item))
  },

  saveScopeTools: (tools: string[]): Promise<unknown> =>
    callApi('/api/intercept/tool-config', 'PUT', { enabled_tools: tools }),

  async judge(): Promise<JudgeConfig> {
    const data = await callApi('/api/intercept/judge')
    const row = (data ?? {}) as Record<string, unknown>
    return {
      enabled: Boolean(row.enabled),
      profile_id: num(row.profile_id),
      prompt: String(row.prompt ?? ''),
      timeout_seconds: num(row.timeout_seconds, 15),
      fail_action: row.fail_action === 'deny' ? 'deny' : row.fail_action === 'ask' ? 'ask' : 'allow',
      ask_timeout_seconds: num(row.ask_timeout_seconds, 300),
      ask_timeout_action: row.ask_timeout_action === 'allow' ? 'allow' : 'deny'
    }
  },

  saveJudge: (config: JudgeConfig): Promise<unknown> => callApi('/api/intercept/judge', 'PUT', config),

  async judgeUsage(days = 30): Promise<JudgeUsage> {
    const data = await callApi(`/api/intercept/judge/usage?days=${days}`)
    const row = (data ?? {}) as Record<string, unknown>
    return {
      calls: num(row.calls),
      input_tokens: num(row.input_tokens),
      output_tokens: num(row.output_tokens),
      cache_read_tokens: num(row.cache_read_tokens),
      cache_write_tokens: num(row.cache_write_tokens),
      daily: listOf<Record<string, unknown>>(data, 'daily').map((day) => ({
        date: String(day.date ?? ''),
        calls: num(day.calls),
        input_tokens: num(day.input_tokens),
        output_tokens: num(day.output_tokens)
      }))
    }
  },

  async profiles(): Promise<ToolProfile[]> {
    const data = await callApi('/api/llm/profiles')
    return listOf<Record<string, unknown>>(data, 'profiles').map((row) => ({
      id: String(row.id ?? ''),
      name: String(row.name ?? ''),
      model: String(row.model ?? '')
    }))
  },

  async tools(): Promise<ToolEntry[]> {
    const data = await callApi('/api/tools')
    return listOf<Record<string, unknown>>(data, 'tools').map((row) => ({
      key: String(row.key ?? ''),
      description: String(row.description ?? ''),
      system: Boolean(row.system),
      kind: String(row.kind ?? '')
    }))
  }
}

export const errText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
