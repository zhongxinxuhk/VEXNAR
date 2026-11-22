// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Hono } from 'hono'
import { meta, operations } from '../context.ts'

export function registerNotificationSettings(api: Hono, redactConfig = false): void {
  api.get('/api/notify/channels', async (c) => {
    const channels = await meta.table<Record<string, unknown>[]>('notify')
    return c.json({ channels: redactConfig ? channels.map(({ config: _config, ...row }) => row) : channels })
  })

  api.post('/api/notify/channels', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try { const result = await operations.createChannel(body); meta.reload(); return c.json(result, 201) }
    catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
  })

  api.patch('/api/notify/channels/:id', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try { const result = await operations.updateChannel(c.req.param('id'), body); meta.reload(); return c.json(result) }
    catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
  })

  api.delete('/api/notify/channels/:id', async (c) => {
    try { const result = await operations.deleteChannel(c.req.param('id')); meta.reload(); return c.json(result) }
    catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.status ?? 400) }
  })
}
