// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * TS traffic_get: read the same SQLite index and rebuild the Go tool's text.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const here = dirname(fileURLToPath(import.meta.url))
export const repo = join(here, '..', '..', '..', '..')
const trafficDir = join(repo, 'data', 'traffic')

let index = null
function db() {
  index ??= new DatabaseSync(join(trafficDir, '_index', 'index.sqlite'), { readOnly: true })
  return index
}

function assembleRaw(head, body, blob, total) {
  const bytes = body ? Buffer.from(body) : Buffer.alloc(0)
  let text = `${head}\n${bytes.toString('utf8')}`
  if (blob) text += `\n…[truncated] @blob sha256:${blob} (len=${total})`
  return text
}

function clip(text, max) {
  const bytes = Buffer.from(text)
  if (bytes.length <= max) return text
  return `${bytes.subarray(0, max).toString('utf8')}\n... [截断，共 ${bytes.length} 字节；完整在流量文件树] ...`
}

export function trafficGet(id) {
  const row = db()
    .prepare(
      `SELECT b.req_head, b.req_body, b.req_blob, b.resp_head, b.resp_body, b.resp_blob, e.req_len, e.resp_len, e.path
       FROM exchange_bodies b JOIN exchanges e ON e.id = b.id WHERE b.id = ?`
    )
    .get(id)
  let req
  let resp
  if (row) {
    req = assembleRaw(row.req_head, row.req_body, row.req_blob, row.req_len)
    resp = assembleRaw(row.resp_head, row.resp_body, row.resp_blob, row.resp_len)
  } else {
    const rel = db().prepare('SELECT path FROM exchanges WHERE id = ?').get(id)
    if (!rel) throw new Error(`exchange ${id} 不存在`)
    req = readFileSync(join(trafficDir, rel.path, 'request.http'), 'utf8')
    resp = readFileSync(join(trafficDir, rel.path, 'response.http'), 'utf8')
  }
  // The MCP wrapper flattens and trims the tool text; mirror that.
  return `=== REQUEST ===\n${clip(req, 2500)}\n\n=== RESPONSE ===\n${clip(resp, 4000)}`.trim()
}

/** Ids whose bodies stay below the tool's clip limits, for stable comparison. */
export function smallTrafficIds(limit = 3) {
  return db()
    .prepare(
      `SELECT e.id AS id FROM exchange_bodies b JOIN exchanges e ON e.id = b.id
       WHERE length(b.req_head) + coalesce(length(b.req_body), 0) < 2400
         AND length(b.resp_head) + coalesce(length(b.resp_body), 0) < 3900
         AND b.req_blob IS NULL AND b.resp_blob IS NULL
       LIMIT ?`
    )
    .all(limit)
    .map((row) => row.id)
}
