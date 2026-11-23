// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Hono } from 'hono'
import { meta } from '../context.ts'
import { profileDTO } from './llm-profile.ts'

export interface McpTool { name: string; description: string }

export function normalizeMcpTools(list: unknown): McpTool[] {
  if (!Array.isArray(list)) return []
  const tools: McpTool[] = []
  for (const entry of list) {
    const name = (typeof entry === 'string' ? entry : String(entry?.name ?? '')).trim()
    if (name) tools.push({ name, description: String(entry?.description ?? '') })
  }
  return tools
}

/** Directories shared by the settings panels and the core router. */
export function registerSettingsCatalog(api: Hono): void {
  // 读写共用 ./llm-profile.ts 的 DTO：列表只给 api_key_hint，不把密钥发到页面。
  api.get('/api/llm/profiles', async (c) => {
    const rows = await meta.table<any[]>('llmProfiles')
    return c.json({ profiles: (Array.isArray(rows) ? rows : []).map(profileDTO) })
  })
  api.get('/api/tools', async (c) => {
    const rows = await meta.table<any[]>('tools')
    return c.json({ tools: rows.map((row) => ({ ...row, agents: row.agents ?? [] })) })
  })
  api.get('/api/mcp', async (c) => c.json({ servers: await meta.table('mcp') }))
  api.get('/api/mcp/:id/tools', async (c) => {
    const id = Number(c.req.param('id'))
    const row = (await meta.table('mcp')).find(server => Number(server.id) === id)
    if (!row) return c.json({ error: 'MCP Server 不存在' }, 404)
    return c.json({
      id, name: String(row.name ?? ''), transport: String(row.transport ?? ''),
      enabled: row.enabled !== false, tools: normalizeMcpTools(row.tools)
    })
  })
}
