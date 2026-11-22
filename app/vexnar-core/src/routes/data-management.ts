// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Hono } from 'hono'
import { operations, store } from '../context.ts'

export function registerTaskDataManagement(api: Hono) {
  api.delete('/api/tasks/:id', async (c) => {
    try {
      const result = await operations.deleteTask(c.req.param('id'))
      store.invalidate?.(['tasks'])
      return c.json(result)
    } catch (error: any) {
      return c.json({ error: String(error?.message ?? error) }, error?.name === 'StoreConflict' ? 409 : error?.status ?? 400)
    }
  })

  api.post('/api/tasks/:id/archive', async (c) => {
    try { const result = await operations.archiveTask(c.req.param('id')); store.invalidate?.(['tasks']); return c.json(result) }
    catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.name === 'StoreConflict' ? 409 : error?.status ?? 400) }
  })

  api.post('/api/tasks/archive/batch', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const ids = Array.isArray(body.task_ids) ? body.task_ids : []
    const items = []
    for (const id of ids) {
      try { items.push({ task_id: id, ok: true, archive: await operations.archiveTask(String(id)) }) }
      catch (error: any) { items.push({ task_id: id, ok: false, error: String(error?.message ?? error) }) }
    }
    store.invalidate?.(['tasks'])
    return c.json({ items })
  })

  api.get('/api/task-archives', async (c) => {
    const page = Math.max(Math.floor(Number(c.req.query('page'))) || 1, 1)
    const size = Math.min(Math.max(Math.floor(Number(c.req.query('size'))) || 20, 1), 200)
    const all = await operations.listArchives()
    return c.json({ items: all.slice((page - 1) * size, page * size), total: all.length, page, size })
  })

  api.get('/api/task-archives/:id', async (c) => {
    const one = (await operations.listArchives()).find((row) => String(row.id) === c.req.param('id'))
    if (!one) return c.json({ error: '归档不存在' }, 404)
    return c.json(one)
  })

  api.post('/api/task-archives/:id/restore', async (c) => {
    try { const result = await operations.restoreArchive(c.req.param('id')); store.invalidate?.(['tasks']); return c.json(result) }
    catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.name === 'StoreConflict' ? 409 : error?.status ?? 400) }
  })

  api.delete('/api/task-archives/:id', async (c) => {
    try { const result = await operations.deleteArchive(c.req.param('id')); store.invalidate?.(['tasks']); return c.json(result) }
    catch (error: any) { return c.json({ error: String(error?.message ?? error) }, error?.name === 'StoreConflict' ? 409 : error?.status ?? 400) }
  })
}

export function registerLocalTrafficCleanup(api: Hono) {
  api.on(['GET', 'DELETE'], '/api/traffic/local-cleanup', async (c) => {
    c.header('Cache-Control', 'no-store')
    const rawBefore = c.req.query('before') ?? ''
    const before = Number(rawBefore)
    if (!/^[1-9]\d*$/.test(rawBefore) || !Number.isSafeInteger(before) || before > Math.floor(Date.now() / 1000)) {
      return c.json({ error: '请选择有效且不晚于当前时间的截止日期' }, 400)
    }
    const host = (c.req.query('host') ?? '').trim().toLowerCase()
    const local = operations.writer
    if (!('previewTrafficCleanup' in local)) return c.json({ error: '此清理入口使用客户端 SQLite 存储' }, 409)
    try {
      if (c.req.method === 'GET') return c.json(local.previewTrafficCleanup(before, host))
      const body = await c.req.json().catch(() => null)
      const token = body?.token
      if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
        return c.json({ error: '请先预览要清理的记录' }, 400)
      }
      const deleted = local.applyTrafficCleanup(before, host, token)
      if (deleted === null) return c.json({ error: '流量记录已变化，请重新预览' }, 409)
      store.invalidate?.(['traffic_exchanges'])
      return c.json({ deleted })
    } catch (error) {
      console.error('[traffic] local cleanup failed', error)
      return c.json({ error: '本地流量清理失败，请检查数据存储状态' }, 500)
    }
  })
}
