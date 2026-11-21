// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from 'hono'
import { execFile, spawnSync } from 'node:child_process'
import { store, meta, operations, parseJson, storeRoot } from '../context.ts'
import { activityDto } from './exploration.ts'

/**
 * Remaining single-file routes that did not warrant their own module: flat
 * trigger update/delete, side-question events/cancel, settings probes, batch
 * archive delete/restore, custom-tool test and built-in tool reset, plus the
 * bare exploration activity list.
 */

const errResponse = (c: any, e: any) => c.json({ error: String(e?.message ?? e) }, e?.name === 'StoreConflict' ? 409 : e?.status ?? 400)
const rfc = (d: Date) => d.toISOString()

function settingsRead(): any {
  // meta settings may be [{key,value}] (Go import) or a plain object.
  return meta.table<any>('settings')
}
async function settingsWrite(next: any) {
  const tables = await meta.load()
  tables.settings = next
  await meta.save(tables)
  meta.reload()
}

function detectPython(): string {
  for (const c of ['python3', 'python']) {
    const out = spawnSync('which', [c], { encoding: 'utf8' })
    if (out.status === 0) return out.stdout.trim()
  }
  return ''
}

export function register(api: Hono) {
  // ── flat trigger routes (/api/triggers/{id}) ─────────────────────────────
  async function findTrigger(id: string): Promise<any | null> {
    const rows = await operations.writer.list('agent_triggers')
    return (rows as any[]).find((row) => String(row.id) === String(id)) ?? null
  }

  api.patch('/api/triggers/:id', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}))
      const row = await findTrigger(c.req.param('id'))
      if (!row) return c.json({ error: '触发器不存在' }, 404)
      return c.json(await operations.updateTrigger(String(row.agent_key ?? ''), String(row.id), body))
    } catch (e: any) { return errResponse(c, e) }
  })

  api.delete('/api/triggers/:id', async (c) => {
    try {
      const row = await findTrigger(c.req.param('id'))
      if (!row) return c.json({ error: '触发器不存在' }, 404)
      return c.json(await operations.deleteTrigger(String(row.agent_key ?? ''), String(row.id)))
    } catch (e: any) { return errResponse(c, e) }
  })

  // ── side-question events / cancel ───────────────────────────────────────
  async function findSideQuestion(requestId: string) {
    const rows = await operations.writer.list('side_questions')
    return (rows as any[]).find((row) => String(row.client_request_id ?? '') === requestId) ?? null
  }

  api.get('/api/side-questions/:requestID/events', async (c) => {
    try {
      const row = await findSideQuestion(c.req.param('requestID'))
      if (!row) return c.json({ error: '问题不存在' }, 404)
      const events = [
        { kind: 'queued', at: row.created_at ?? '', status: 'pending' },
        ...(row.answered_at ? [{ kind: 'answered', at: row.answered_at, status: row.status }] : []),
        ...(row.status === 'cancelled' ? [{ kind: 'cancelled', at: row.updated_at ?? row.created_at ?? '', status: 'cancelled' }] : [])
      ]
      return c.json({ request_id: requestId(row), status: row.status, answer: row.answer ?? '', events })
    } catch (e: any) { return errResponse(c, e) }
  })

  api.post('/api/side-questions/:requestID/cancel', async (c) => {
    try {
      const row = await findSideQuestion(c.req.param('requestID'))
      if (!row) return c.json({ error: '问题不存在' }, 404)
      if (['answered', 'cancelled'].includes(String(row.status))) return c.json({ id: Number(row.id), status: row.status })
      const next = { ...row, status: 'cancelled', updated_at: rfc(new Date()) }
      delete next.rev
      // put 的返回值是 Record<string, unknown> | { rev }（记录被清空时只有 rev），
      // 这里读的是自己刚写进去的实体，按实体形状标注即可。
      const written = (await operations.writer.put({ table: 'side_questions', key: String(row.id), record: next, expectedRev: Number(row.rev ?? 0) })) as Record<string, unknown>
      return c.json({ id: Number(written.id), status: written.status })
    } catch (e: any) { return errResponse(c, e) }
  })

  // ── settings probes ─────────────────────────────────────────────────────
  api.post('/api/settings/python/detect', async (c) => {
    try {
      const p = detectPython()
      if (!p) return c.json({ error: '未检测到 python(python3/python 均不在 PATH)' }, 404)
      const tables = await meta.load()
      const raw = tables.settings
      if (Array.isArray(raw)) {
        const row = raw.find((r: any) => r.key === 'python_interpreter')
        if (row) row.value = p
        else raw.push({ key: 'python_interpreter', value: p })
      } else {
        (tables.settings as any) = { ...(raw as any ?? {}), python_interpreter: p }
      }
      await meta.save(tables)
      meta.reload()
      return c.json({ python_interpreter: p })
    } catch (e: any) { return errResponse(c, e) }
  })

  api.post('/api/settings/web-search/test', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}))
      const backend = String(body.web_search_backend ?? (await settingsRead())?.web_search_backend ?? '')
      const braveKey = String(body.brave_search_api_key ?? '')
      const tavilyKey = String(body.tavily_search_api_key ?? '')
      if (!backend) return c.json({ ok: false, error: '未配置搜索后端', backend })
      let url = ''
      let headers: Record<string, string> = {}
      if (backend === 'brave') { if (!braveKey) return c.json({ ok: false, error: '未提供 Brave API Key', backend }); url = 'https://api.search.brave.com/res/v1/web/search?q=test&count=3'; headers = { 'X-Subscription-Token': braveKey, Accept: 'application/json' } }
      else if (backend === 'tavily') { if (!tavilyKey) return c.json({ ok: false, error: '未提供 Tavily API Key', backend }); const r = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ api_key: tavilyKey, query: 'test', max_results: 3 }) }); return c.json({ ok: r.ok, backend, status: r.status }) }
      else return c.json({ ok: false, error: `未知搜索后端: ${backend}`, backend })
      const r = await fetch(url, { headers })
      return c.json({ ok: r.ok, backend, status: r.status })
    } catch (e: any) { return c.json({ ok: false, error: String(e?.message ?? e) }) }
  })

  // ── archive batch delete / restore ─────────────────────────────────────
  api.post('/api/task-archives/delete/batch', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const ids: any[] = Array.isArray(body.archive_ids) ? body.archive_ids : Array.isArray(body.ids) ? body.ids : []
    const items: any[] = []
    for (const id of ids) {
      try { items.push({ archive_id: id, ok: true, archive: await operations.deleteArchive(String(id)) }) }
      catch (e: any) { items.push({ archive_id: id, ok: false, error: String(e?.message ?? e) }) }
    }
    store.invalidate?.(['tasks'])
    return c.json({ items })
  })

  api.post('/api/task-archives/restore/batch', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const ids: any[] = Array.isArray(body.archive_ids) ? body.archive_ids : Array.isArray(body.ids) ? body.ids : []
    const items: any[] = []
    for (const id of ids) {
      try { items.push({ archive_id: id, ok: true, archive: await operations.restoreArchive(String(id)) }) }
      catch (e: any) { items.push({ archive_id: id, ok: false, error: String(e?.message ?? e) }) }
    }
    store.invalidate?.(['tasks'])
    return c.json({ items })
  })

  // ── custom tool test ────────────────────────────────────────────────────
  api.post('/api/tools/custom/test', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}))
      const kind = String(body.kind ?? '')
      const exec = body.exec ?? {}
      const params = body.params ?? {}
      if (kind === 'shell') return c.json({ error: 'shell 类型工具是 bash 环境声明，无可执行内容' }, 400)
      if (kind === 'command') {
        const cmd = String(exec.command ?? params.command ?? '')
        if (!cmd) return c.json({ error: 'command 不能为空' }, 400)
        const args = Array.isArray(exec.args) ? exec.args.map(String) : []
        const out = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
          execFile(cmd, args, { cwd: storeRoot(), timeout: 60_000 }, (err, stdout, stderr) => {
            resolve({ code: err ? (err as any).code ?? 1 : 0, stdout: String(stdout), stderr: String(stderr) })
          })
        })
        return c.json({ output: `${out.stdout}${out.stderr}`.trim(), is_error: out.code !== 0 })
      }
      if (kind === 'script') {
        const script = String(exec.script ?? exec.inline ?? '')
        const interp = String(exec.interpreter ?? 'python3')
        const out = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
          const child = execFile(interp, ['-c', script], { cwd: storeRoot(), timeout: 60_000 }, (err, stdout, stderr) => {
            resolve({ code: err ? (err as any).code ?? 1 : 0, stdout: String(stdout), stderr: String(stderr) })
          })
          void child
        })
        return c.json({ output: `${out.stdout}${out.stderr}`.trim(), is_error: out.code !== 0 })
      }
      if (kind === 'http') {
        const url = String(exec.url ?? '')
        const method = String(exec.method ?? 'GET').toUpperCase()
        if (!url) return c.json({ error: 'url 不能为空' }, 400)
        const r = await fetch(url, { method, headers: exec.headers ?? {} })
        const text = await r.text()
        return c.json({ output: text.slice(0, 64 * 1024), is_error: !r.ok })
      }
      return c.json({ error: `未知工具类型: ${kind}` }, 400)
    } catch (e: any) { return errResponse(c, e) }
  })

  // ── built-in tool reset ─────────────────────────────────────────────────
  api.post('/api/tools/:key/reset', async (c) => {
    try {
      const key = c.req.param('key')
      const tables = await meta.load()
      const rows = (tables.tools as any[]) ?? []
      const row = rows.find((r) => r.key === key)
      if (!row) return c.json({ error: '非内置工具或不存在: ' + key }, 404)
      if (!row.system) return c.json({ error: '非内置工具或不存在: ' + key }, 404)
      row.enabled = true
      await meta.save(tables)
      meta.reload()
      return c.json({ ok: true })
    } catch (e: any) { return errResponse(c, e) }
  })

  // ── exploration activity list ───────────────────────────────────────────
  // No `task` → the station-wide feed (dsh overview's activity card); with a
  // `task` → that task's activity. Both answer the same DTO, so every surface
  // reads `seq`/`ts` instead of the raw store columns.
  api.get('/api/exploration/activity', async (c) => {
    const taskId = c.req.query('task') ?? ''
    const limit = Math.min(Number(c.req.query('limit') ?? 200) || 200, 500)
    const before = Number(c.req.query('before') ?? 0) || 0
    const page = taskId === ''
      ? await store.activity.recent({ limit, before })
      : await store.activity.history({ taskId, limit, before })
    const items = page.items.map(activityDto)
    return c.json({ items, snapshot: page.snapshot, cursor: page.snapshot, has_more: page.hasMore })
  })
}

function requestId(row: any): string {
  return String(row?.client_request_id ?? '')
}
