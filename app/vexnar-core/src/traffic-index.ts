// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { DatabaseSync } from 'node:sqlite'
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 已归档流量：Go 采集面写下的 `data/traffic/_index/index.sqlite`。
 *
 * 采集面（go-mitmproxy）由 Go 服务持有，它的索引库是站点级的流量事实。客户端
 * 自己也有一条采集路径（会话抓包的 ingest，写在 kv 的 `traffic_exchanges`），
 * 但历史流量只在 Go 的索引里。概览要显示"共多少次 / Top 主机 / 最近样本"，
 * 只看客户端这一侧的 kv 就会永远显示 0，所以这里以只读方式打开同一份索引，
 * 与 Go 的 `traffic.Traffic` 读同样的行。
 *
 * 只读：增量回收、FTS 维护、blob GC 都归 Go 进程，客户端不写这个库。
 */

const here = dirname(fileURLToPath(import.meta.url))

/** 采集面数据目录；`VEXNAR_TRAFFIC_DIR` 覆盖，默认 `<repo>/data/traffic`。 */
export function trafficDir(): string {
  return process.env.VEXNAR_TRAFFIC_DIR || join(here, '..', '..', '..', 'data', 'traffic')
}

function indexPath(): string {
  return join(trafficDir(), '_index', 'index.sqlite')
}

/** 概况行：与 kv `traffic_exchanges` 的记录形状对齐，共用同一套 DTO。 */
export interface ArchivedExchange {
  id: string
  ts: number
  host: string
  method: string
  url: string
  url_template: string
  status: number
  content_type: string
  req_len: number
  resp_len: number
  path: string
  scope: string
  session: string
}

export interface ArchivedRaw {
  req: string
  resp: string
}

/** 索引读取失败（无文件、schema 更旧、被锁）只降级为"没有归档流量"。 */
let cached: { at: number; rows: ArchivedExchange[] } | null = null
const TTL_MS = 2000

/** Drop the TTL cache; tests (and a data-directory switch) need a fresh read. */
export function resetArchiveCache(): void {
  cached = null
}

function open(): DatabaseSync | null {
  const path = indexPath()
  if (!existsSync(path)) return null
  try {
    return new DatabaseSync(path, { readOnly: true })
  } catch {
    return null
  }
}

function columns(db: DatabaseSync, table: string): Set<string> {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    return new Set(rows.map((row) => String(row.name)))
  } catch {
    return new Set()
  }
}

function text(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8')
  return String(value)
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

/** 归档流的全部概况行，2 秒内复用同一次查询（概览轮询会连续问几次）。 */
export function archivedExchanges(): ArchivedExchange[] {
  const now = Date.now()
  if (cached !== null && now - cached.at < TTL_MS) return cached.rows
  const db = open()
  if (db === null) {
    cached = { at: now, rows: [] }
    return []
  }
  try {
    const cols = columns(db, 'exchanges')
    const pick = (name: string, fallback: string): string => (cols.has(name) ? name : `${fallback} AS ${name}`)
    const sql = `SELECT id, ts, host, method, url_template, url, status, content_type, req_len, resp_len, path,
      ${pick('scope', "''")}, ${pick('session', "''")} FROM exchanges ORDER BY ts DESC`
    const rows = db.prepare(sql).all() as Array<Record<string, unknown>>
    const mapped = rows.map((row) => ({
      id: text(row.id),
      ts: num(row.ts),
      host: text(row.host),
      method: text(row.method),
      url: text(row.url),
      url_template: text(row.url_template),
      status: num(row.status),
      content_type: text(row.content_type),
      req_len: num(row.req_len),
      resp_len: num(row.resp_len),
      path: text(row.path),
      scope: text(row.scope),
      session: text(row.session)
    }))
    cached = { at: now, rows: mapped }
    return mapped
  } catch {
    cached = { at: now, rows: [] }
    return []
  } finally {
    try {
      db.close()
    } catch {
      /* already closed */
    }
  }
}

const BINARY_TYPES = [
  'image/', 'audio/', 'video/', 'font/',
  'application/octet-stream', 'application/zip', 'application/gzip',
  'application/x-gzip', 'application/x-tar', 'application/x-7z-compressed',
  'application/x-rar', 'application/pdf', 'application/x-msdownload',
  'application/vnd.android.package-archive', 'application/java-archive',
  'application/wasm', 'application/x-shockwave-flash'
]

function bodyText(contentType: string, body: unknown): string {
  if (body == null) return ''
  const buf = body instanceof Uint8Array ? Buffer.from(body) : Buffer.from(String(body), 'utf8')
  if (buf.length === 0) return ''
  const ct = String(contentType ?? '').toLowerCase().split(';')[0].trim()
  const binary = BINARY_TYPES.some((prefix) => ct.startsWith(prefix)) || buf.subarray(0, 512).includes(0)
  return binary ? `[binary ${ct || 'application/octet-stream'}, ${buf.length} bytes]` : buf.toString('utf8')
}

function assemble(head: string, inline: string, blob: string, total: number): string {
  let out = `${head}\n${inline}`
  if (blob) out += `\n…[truncated] @blob sha256:${blob} (len=${total})`
  return out
}

/** 一条归档流量的原始请求/响应文本；未找到返回 null。 */
export function archivedRaw(id: string): ArchivedRaw | null {
  const db = open()
  if (db === null) return null
  try {
    const cols = columns(db, 'exchange_bodies')
    if (cols.size === 0) return null
    const row = db.prepare('SELECT req_head, req_body, req_blob, resp_head, resp_body, resp_blob FROM exchange_bodies WHERE id = ?')
      .get(String(id)) as Record<string, unknown> | undefined
    if (row === undefined) return null
    const meta = db.prepare('SELECT content_type, req_len, resp_len FROM exchanges WHERE id = ?')
      .get(String(id)) as Record<string, unknown> | undefined
    const contentType = text(meta?.content_type)
    return {
      req: assemble(text(row.req_head), bodyText(contentType, row.req_body), text(row.req_blob), num(meta?.req_len)),
      resp: assemble(text(row.resp_head), bodyText(contentType, row.resp_body), text(row.resp_blob), num(meta?.resp_len))
    }
  } catch {
    return null
  } finally {
    try {
      db.close()
    } catch {
      /* already closed */
    }
  }
}

/** 索引文件最近修改时间（秒）；概览用它说明归档数据的新鲜度。 */
export function archivedUpdatedAt(): number {
  try {
    return Math.floor(statSync(indexPath()).mtimeMs / 1000)
  } catch {
    return 0
  }
}
