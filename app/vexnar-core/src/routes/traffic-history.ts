// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Hono } from 'hono'
import { operations } from '../context.ts'
import { activeCaptures, readCaptures } from '../capture-state.ts'
import { archivedExchanges } from '../traffic-index.ts'

function rfc3339FromUnix(sec: number): string {
  const date = new Date(Number(sec) * 1000)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toISOString()
}

function statusMatches(status: number, token: string): boolean {
  const s = token.toLowerCase().trim()
  if (!s) return true
  if (/^[1-5]xx$/.test(s)) {
    const base = Number(s[0]) * 100
    return status >= base && status < base + 100
  }
  const n = Number(s)
  if (Number.isFinite(n)) return status === n
  return true // 未识别的 token 不过滤（对齐 Go statusFilter ok=false）
}

// ── 采集流量（traffic_exchanges + Go 索引） ────────────────────────────────
/**
 * 站点级流量视图：客户端自己采集的 kv 行 + 采集面（Go）归档的索引行。
 *
 * 两条采集路径写不同的库：会话抓包的 ingest 落在 kv，go-mitmproxy 写
 * `data/traffic/_index`。概览和流量页要的是"这台机器抓到了什么"，只读其中一边
 * 就会把另一边已经抓到的流量显示成 0。同一条 id 以本地为准（两端都有的只有
 * 本地重放过的那条）。
 */
export async function allExchanges(): Promise<any[]> {
  const local = (await operations.writer.list('traffic_exchanges')) as any[]
  const seen = new Set(local.map((row) => String(row.id)))
  const archived = archivedExchanges().filter((row) => !seen.has(row.id))
  return [...local, ...archived]
}

async function listExchanges(query: Record<string, string | undefined>) {
  const all = await allExchanges()
  const host = String(query.host ?? '').trim()
  const method = String(query.method ?? '').trim().toUpperCase()
  const keyword = String(query.q ?? '').trim().toLowerCase()
  const status = String(query.status ?? '').trim()
  const respMin = Number(query.resp_min ?? -1)
  const respMax = Number(query.resp_max ?? -1)
  let rows = all
  if (host) rows = rows.filter((row) => String(row.host ?? '').toLowerCase().includes(host.toLowerCase()))
  if (method) rows = rows.filter((row) => String(row.method ?? '').toUpperCase() === method)
  if (keyword) {
    rows = rows.filter((row) => [row.host, row.url, row.url_template, row.method, row.content_type, String(row.status), row.req_body, row.resp_body]
      .some((value) => String(value ?? '').toLowerCase().includes(keyword)))
  }
  if (status) rows = rows.filter((row) => statusMatches(Number(row.status ?? 0), status))
  if (Number.isFinite(respMin) && respMin >= 0) rows = rows.filter((row) => Number(row.resp_len ?? 0) >= respMin)
  if (Number.isFinite(respMax) && respMax >= 0) rows = rows.filter((row) => Number(row.resp_len ?? 0) <= respMax)
  const col = query.sort === 'status' ? 'status' : query.sort === 'resp_len' ? 'resp_len' : 'ts'
  const dir = String(query.order ?? 'desc').toLowerCase() === 'asc' ? 1 : -1
  rows.sort((a, b) => dir * (Number(a[col] ?? 0) - Number(b[col] ?? 0)) || String(b.id).localeCompare(String(a.id)))
  return { all, rows }
}

export function exchangeDto(row: any) {
  return {
    id: String(row.id),
    ts: rfc3339FromUnix(Number(row.ts ?? 0)),
    host: String(row.host ?? ''),
    method: String(row.method ?? ''),
    url: String(row.url ?? ''),
    status: Number(row.status ?? 0),
    content_type: String(row.content_type ?? ''),
    resp_len: Number(row.resp_len ?? 0)
  }
}

async function listHosts() {
  const all = await allExchanges()
  const byHost = new Map<string, { host: string; count: number; last: number }>()
  for (const row of all) {
    const host = String(row.host ?? '')
    const entry = byHost.get(host) ?? { host, count: 0, last: 0 }
    entry.count += 1
    entry.last = Math.max(entry.last, Number(row.ts ?? 0))
    byHost.set(host, entry)
  }
  return [...byHost.values()].sort((a, b) => b.last - a.last).map(({ last: _last, ...rest }) => rest)
}

/** Reports stored sessions and history without constructing or starting a capture proxy. */
export async function captureOverview(proxyFor?: (scope: string) => string) {
  const rows = await allExchanges()
  const byScope = new Map<string, { items: number; last_ts: number }>()
  let lastTs = 0
  for (const row of rows) {
    const ts = Number(row.ts ?? 0)
    lastTs = Math.max(lastTs, ts)
    const scope = String(row.scope ?? '')
    if (!scope) continue
    const entry = byScope.get(scope) ?? { items: 0, last_ts: 0 }
    entry.items += 1
    entry.last_ts = Math.max(entry.last_ts, ts)
    byScope.set(scope, entry)
  }
  const sessions = activeCaptures(await readCaptures()).map((row) => ({
    scope: row.scope, proxy: proxyFor?.(row.scope) ?? '',
    conv_id: row.conv_id, session_id: row.session_id, source: row.source, started_at: row.started_at,
    items: byScope.get(row.scope)?.items ?? 0, last_ts: byScope.get(row.scope)?.last_ts ?? 0
  }))
  const recent = [...rows].sort((a, b) => Number(b.ts ?? 0) - Number(a.ts ?? 0)).slice(0, 60).map(exchangeDto)
  return { active: sessions.length > 0, sessions, total: rows.length, last_ts: lastTs, recent }
}

export function registerTrafficHistory(api: Hono): void {
  // 采集流量列表（过滤 host/method/keyword 等）
  api.get('/api/traffic', async (c) => {
    try {
      const page = Math.max(Number(c.req.query('page') ?? 0) || 0, 0)
      const size = Math.min(Math.max(Number(c.req.query('size') ?? 100) || 100, 1), 500)
      const { all, rows } = await listExchanges({
        host: c.req.query('host'), method: c.req.query('method'), q: c.req.query('q'),
        status: c.req.query('status'), resp_min: c.req.query('resp_min'), resp_max: c.req.query('resp_max'),
        sort: c.req.query('sort'), order: c.req.query('order')
      })
      const pageRows = rows.slice(page * size, page * size + size)
      // `enabled` reports whether a conversation is capturing right now: capture
      // is armed per chat session, so a station-wide settings flag would lie.
      const capturing = activeCaptures(await readCaptures()).length > 0
      return c.json({
        enabled: capturing,
        proxy: '',
        count: all.length,
        archived: archivedExchanges().length,
        total: rows.length,
        page,
        size,
        exchanges: pageRows.map(exchangeDto)
      })
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, e?.name === 'StoreConflict' ? 409 : e?.status ?? 400)
    }
  })

  // 去重 host 列表（带计数，按最近活动排序）
  api.get('/api/traffic/hosts', async (c) => {
    try {
      return c.json({ hosts: await listHosts() })
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, e?.name === 'StoreConflict' ? 409 : e?.status ?? 400)
    }
  })
}
