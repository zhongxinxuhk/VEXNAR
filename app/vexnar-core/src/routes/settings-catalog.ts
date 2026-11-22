// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Hono } from 'hono'
import { meta } from '../context.ts'

/** Directories shared by the settings panels and the core router. */
export function registerSettingsCatalog(api: Hono): void {
  api.get('/api/llm/profiles', async (c) => {
    const rows = await meta.table<any[]>('llmProfiles')
    return c.json({
      profiles: rows.map((row) => {
        if (row.base_url != null) return row
        const { base_url, ...rest } = row
        return rest
      })
    })
  })
  api.get('/api/tools', async (c) => {
    const rows = await meta.table<any[]>('tools')
    return c.json({ tools: rows.map((row) => ({ ...row, agents: row.agents ?? [] })) })
  })
  api.get('/api/mcp', async (c) => c.json({ servers: await meta.table('mcp') }))
}
