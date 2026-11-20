// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { consoleRequest } from '@/lib/console'
import type {
  ImportResult,
  MarketItem,
  MarketKind,
  MarketItemsResponse,
  MarketSource,
  MarketSourceSaveResult,
  McpServer,
  McpTool,
  Skill
} from './types'

// 所有插件页请求集中在这里：组件只关心数据，不关心路径。
// 后端未连接时 consoleRequest 会抛 "Go 后端尚未启动"，由调用方统一提示。

export const mcpApi = {
  list: () => consoleRequest<{ servers: McpServer[] }>('/mcp'),
  // 新增时后端会顺手做一次工具发现（上限 45s），超时要比默认 30s 宽
  save: (body: Record<string, unknown>) =>
    consoleRequest<{ id: number }>('/mcp', 'POST', body, { timeoutMs: 90_000 }),
  remove: (id: number) => consoleRequest<{ deleted: number }>(`/mcp/${id}`, 'DELETE'),
  setEnabled: (id: number, enabled: boolean) =>
    consoleRequest<{ id: number; enabled: boolean }>(`/mcp/${id}/enabled`, 'PUT', { enabled }),
  tools: (id: number) => consoleRequest<{ tools: McpTool[] }>(`/mcp/${id}/tools`),
  // 工具发现要真的拉起 MCP 进程，首启 npx 可能超过 30s
  refresh: (id: number) =>
    consoleRequest<{ tools: McpTool[] }>(`/mcp/${id}/refresh`, 'POST', undefined, { timeoutMs: 90_000 }),
  import: (payload: { json: unknown; overwrite?: boolean }) =>
    consoleRequest<ImportResult>('/mcp/import', 'POST', payload)
}

export const skillApi = {
  list: () => consoleRequest<{ skills: Skill[] }>('/skills'),
  create: (body: {
    name: string
    description: string
    instructions?: string
    license?: string
    compatibility?: string
    mcps?: string[]
  }) => consoleRequest<{ name: string }>('/skills', 'POST', body),
  remove: (name: string) => consoleRequest<{ deleted: string }>(`/skills/${encodeURIComponent(name)}`, 'DELETE'),
  setEnabled: (name: string, enabled: boolean) =>
    consoleRequest<{ name: string; enabled: boolean }>(
      `/skills/${encodeURIComponent(name)}/enabled`,
      'PUT',
      { enabled }
    ),
  installGithub: (body: { link?: string; repo?: string; ref?: string; path?: string; overwrite?: boolean }) =>
    consoleRequest<{ name: string; files: number; source: Skill['source'] }>(
      '/skills/install-github',
      'POST',
      body,
      { timeoutMs: 120_000 }
    ),
  readFile: (name: string, file: string) =>
    consoleRequest<{ content: string; file: string }>(
      `/skills/${encodeURIComponent(name)}/files/${file.split('/').map(encodeURIComponent).join('/')}`
    ),
  writeFile: (name: string, file: string, content: string) =>
    consoleRequest<{ ok: boolean }>(
      `/skills/${encodeURIComponent(name)}/files/${file.split('/').map(encodeURIComponent).join('/')}`,
      'PUT',
      { content }
    )
}

export const marketApi = {
  sources: () => consoleRequest<{ sources: MarketSource[] }>('/market/sources'),
  addSource: (body: { link: string; kind: string; name?: string; ref?: string; path?: string }) =>
    consoleRequest<MarketSourceSaveResult>('/market/sources', 'POST', body, { timeoutMs: 60_000 }),
  removeSource: (id: number) => consoleRequest<{ deleted: number }>(`/market/sources/${id}`, 'DELETE'),
  syncSource: (id: number) =>
    consoleRequest<{ items: MarketItem[]; count: number }>(`/market/sources/${id}/sync`, 'POST', undefined, {
      timeoutMs: 60_000
    }),
  items: (kind: MarketKind, refresh = false) =>
    consoleRequest<MarketItemsResponse>(`/market/items?kind=${kind}${refresh ? '&refresh=1' : ''}`, 'GET', undefined, {
      timeoutMs: 60_000
    })
}

// 把表单里的多行文本解析成 MCP 的 args 数组（一行一个参数，忽略空行）。
export function parseArgsInput(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export function formatArgsInput(args?: string[] | null): string {
  return (args ?? []).join('\n')
}

// KEY=VALUE 一行的形式编辑 env；重复键后者覆盖前者。
export function parseEnvInput(value: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of value.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

export function formatEnvInput(env?: Record<string, string> | null): string {
  if (!env) return ''
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

// 供 UI 展示：stdio 服务器显示命令，http/sse 显示 URL。
export function mcpEndpoint(server: McpServer): string {
  if (server.transport === 'stdio') {
    const args = server.args ?? []
    return [server.command ?? '', ...args].join(' ').trim()
  }
  return server.url ?? ''
}

export function marketItemEndpoint(item: MarketItem): string {
  if ((item.transport ?? 'stdio') === 'stdio') {
    return [item.command ?? '', ...(item.args ?? [])].join(' ').trim()
  }
  return item.url ?? ''
}
