// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

// 插件页的数据契约：与 Go 后端 /api/mcp、/api/skills、/api/market 一一对应。
// 新增字段时同步后端 struct 的 json tag，避免两边漂移。

export type McpTransport = 'stdio' | 'http' | 'sse'

export type McpServer = {
  id: number
  name: string
  transport: McpTransport
  command?: string
  args?: string[] | null
  env?: Record<string, string> | null
  url?: string
  enabled: boolean
  insecure?: boolean
  tools?: string[] | null
}

export type McpTool = { name: string; description?: string }

export type SkillSource = {
  repo: string
  ref?: string
  path?: string
  installed_at?: string
}

export type Skill = {
  name: string
  description?: string
  license?: string
  compatibility?: string
  mcps?: string[]
  files: string[]
  enabled: boolean
  source?: SkillSource
  calls: number
  tasks: number
  usage_agents?: string[]
  last_used?: string
}

export type MarketItem = {
  id: string
  kind: 'mcp' | 'skills'
  name: string
  description?: string
  tags?: string[]
  homepage?: string
  author?: string
  repo?: string
  ref?: string
  path?: string
  transport?: McpTransport
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  source_id?: number
  source_name?: string
  source_repo?: string
  official?: boolean
  builtin?: boolean
}

export type MarketSource = {
  id: number
  kind: 'mcp' | 'skills' | 'all'
  name: string
  repo: string
  ref: string
  path: string
  official: boolean
  item_count: number
  synced_at?: string
  last_error?: string
}

export type MarketKind = 'mcp' | 'skills'

export type MarketItemsResponse = {
  kind: MarketKind
  items: MarketItem[]
  count: number
  builtin: boolean
  warnings?: string[] | null
}

export type ImportResult = {
  imported: { id: number; name: string; transport: string }[]
  skipped: { name: string; reason: string }[]
  total: number
}

export type MarketSourceSaveResult = {
  id: number
  repo: string
  ref: string
  path: string
  kind: string
  name: string
  warning?: string
  items?: MarketItem[]
}
