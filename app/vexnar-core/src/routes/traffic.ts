// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createHash } from 'node:crypto'
import { crc32, deflateRawSync } from 'node:zlib'
import type { Hono } from 'hono'
import { blobStore, operations, store, storeRoot } from '../context.ts'
import { parseScope } from '../traffic-scope.ts'
import { archivedRaw } from '../traffic-index.ts'
import { registerLocalTrafficCleanup } from './data-management.ts'
import { allExchanges, registerTrafficHistory } from './traffic-history.ts'
export { allExchanges, exchangeDto } from './traffic-history.ts'
import { mitmProxy } from '../traffic-proxy/index.ts'

/**
 * 流量证据路由层：在 dsh 进程内以 Hono 前缀 /vexnar-api 挂载，持久层为 SQLite
 * （kv 表，不连 PostgreSQL、不新开端口）。覆盖两类数据：
 *
 *   1. 采集流量（capture）—— `traffic_exchanges` kv 表，对应 Go 的 traffic.Traffic
 *      索引树；正文走内容寻址 blobStore。MITM sidecar 采集（P0-4 已由 mitmproxy
 *      等价验证）作为后续独立工作项，本模块只预留摄入函数 recordExchange。
 *   2. 漏洞证据（evidence）—— `traffic_evidence_snapshots` + `finding_traffic_bindings`
 *      kv 表，对应 Go 的 evidence.Store；由 ingestTrafficEvidence 从 sidecar 流量落
 *      snapshot 并绑定 finding，正文 blob 与采集流量共享同一内容寻址存储。
 */

// ── 常量（与 Go traffic/traffic.go、db/finding_traffic.go 对齐） ──────────
const TRAFFIC_ROLES = new Set(['baseline', 'proof', 'verification', 'supporting'])
const MAX_INLINE_BODY = 256 * 1024
const BLOB_PREVIEW = 8 * 1024
const BLOB_HASH_RE = /^[0-9a-f]{64}$/
const BINARY_TYPES = [
  'image/', 'audio/', 'video/', 'font/',
  'application/octet-stream', 'application/zip', 'application/gzip',
  'application/x-gzip', 'application/x-tar', 'application/x-7z-compressed',
  'application/x-rar', 'application/pdf', 'application/x-msdownload',
  'application/vnd.android.package-archive', 'application/java-archive',
  'application/wasm', 'application/x-shockwave-flash'
]

// ── 基础工具 ───────────────────────────────────────────────────────────────
const writer = () => operations.writer
const blobs = () => blobStore(storeRoot())

function sha256hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function isBinaryBody(contentType: string, body: Buffer): boolean {
  const ct = String(contentType ?? '').toLowerCase().split(';')[0].trim()
  if (BINARY_TYPES.some((prefix) => ct.startsWith(prefix))) return true
  const head = body.subarray(0, Math.min(body.length, 512))
  return head.includes(0)
}

function binaryTag(contentType: string, body: Buffer): string {
  const ct = String(contentType ?? '').trim() || 'application/octet-stream'
  const magic = body.subarray(0, Math.min(body.length, 4)).toString('hex')
  return `[binary ${ct}, ${body.length} bytes, magic=${magic}]`
}

function truncateUTF8(body: Buffer, n: number): string {
  if (body.length <= n) return body.toString('utf8')
  let cut = body.subarray(0, n)
  // 不把多字节 rune 从中截断
  for (let i = 0; i < 3 && cut.length > 0; i++) {
    const last = cut[cut.length - 1]
    if ((last & 0xc0) !== 0x80) break
    cut = cut.subarray(0, cut.length - 1)
  }
  return cut.toString('utf8')
}

function toBuffer(body: Buffer | string | undefined | null): Buffer | null {
  if (body == null) return null
  if (Buffer.isBuffer(body)) return body.length ? body : null
  const value = String(body)
  return value.length ? Buffer.from(value, 'utf8') : null
}

/** 采集正文的 inline/spill 决策：≤256KiB 内联，超限落 blob 并留可读预览。 */
async function spillBody(contentType: string, body: Buffer | string | undefined | null) {
  const buf = toBuffer(body)
  if (!buf) return { hash: '', inline: '', len: 0 }
  const text = !isBinaryBody(contentType, buf)
  if (buf.length <= MAX_INLINE_BODY) {
    return { hash: '', inline: text ? buf.toString('utf8') : binaryTag(contentType, buf), len: buf.length }
  }
  const { hash } = await blobs().put(buf)
  return { hash, inline: text ? truncateUTF8(buf, BLOB_PREVIEW) : binaryTag(contentType, buf), len: buf.length }
}

/** 重建一侧原始报文文本：head + 空行 + 正文；溢出的正文带 @blob 指针。 */
function assembleRaw(head: string, inline: string, blob: string, total: number): string {
  let out = `${head}\n${inline}`
  if (blob) out += `\n…[truncated] @blob sha256:${blob} (len=${total})`
  return out
}

async function readExchangeRaw(id: string) {
  const row = ((await allExchanges()) as any[]).find((item) => String(item.id) === String(id))
  if (!row) return null
  // Archived rows live in the capture plane's own index, which holds the bodies
  // separately; the kv row carries them inline.
  const archived = row.req_head === undefined && row.resp_head === undefined ? archivedRaw(String(id)) : null
  if (archived) return archived
  return {
    req: assembleRaw(String(row.req_head ?? ''), String(row.req_body ?? ''), String(row.req_blob ?? ''), Number(row.req_len ?? 0)),
    resp: assembleRaw(String(row.resp_head ?? ''), String(row.resp_body ?? ''), String(row.resp_blob ?? ''), Number(row.resp_len ?? 0))
  }
}

async function readBlobBuffer(hash: string) {
  const h = hash.toLowerCase().trim()
  if (!BLOB_HASH_RE.test(h)) throw Object.assign(new Error('非法的 blob hash'), { status: 400 })
  try {
    return await blobs().read(h)
  } catch {
    throw Object.assign(new Error('blob 不存在'), { status: 404 })
  }
}

async function removeExchanges(predicate: (row: any) => boolean): Promise<number> {
  // Only the kv rows are ours to delete: the capture plane's index and blobs are
  // written and reclaimed by the Go process holding them.
  const all = (await writer().list('traffic_exchanges')) as any[]
  const ids = all.filter(predicate).map((row) => String(row.id))
  for (const id of ids) await writer().remove('traffic_exchanges', id)
  return ids.length
}

// ── 证据快照 / 绑定 ────────────────────────────────────────────────────────
/** 快照 ID = sha256(规范化元数据 JSON)，对齐 Go db.TrafficSnapshotID。 */
export function trafficSnapshotId(snapshot: Record<string, unknown>): string {
  const canonical: Record<string, unknown> = {
    id: '',
    source_traffic_id: snapshot.source_traffic_id ?? '',
    captured_at: snapshot.captured_at ?? 0,
    url: snapshot.url ?? '',
    method: snapshot.method ?? '',
    status: snapshot.status ?? 0,
    content_type: snapshot.content_type ?? ''
  }
  if (snapshot.req_head) canonical.req_head = snapshot.req_head
  if (snapshot.resp_head) canonical.resp_head = snapshot.resp_head
  canonical.req_hash = snapshot.req_hash ?? ''
  canonical.resp_hash = snapshot.resp_hash ?? ''
  canonical.req_len = snapshot.req_len ?? 0
  canonical.resp_len = snapshot.resp_len ?? 0
  canonical.created_at = '0001-01-01T00:00:00Z'
  return sha256hex(JSON.stringify(canonical))
}

function snapshotDto(snap: any) {
  if (!snap) return snap
  return {
    id: snap.id,
    source_traffic_id: snap.source_traffic_id ?? '',
    captured_at: Number(snap.captured_at ?? 0),
    url: snap.url ?? '',
    method: snap.method ?? '',
    status: Number(snap.status ?? 0),
    content_type: snap.content_type ?? '',
    req_hash: snap.req_hash ?? '',
    resp_hash: snap.resp_hash ?? '',
    req_len: Number(snap.req_len ?? 0),
    resp_len: Number(snap.resp_len ?? 0),
    created_at: String(snap.created_at ?? '')
  }
}

// ── 预留摄入函数（供后续 MITM sidecar 调用） ───────────────────────────────
export interface CaptureExchange {
  id?: string
  ts?: number
  host: string
  method: string
  url: string
  url_template?: string
  status: number
  content_type?: string
  req_head?: string
  resp_head?: string
  req_body?: Buffer | string
  resp_body?: Buffer | string
  /** Attribution: conv-12 / task-7 / task-7-i31 (empty = global traffic). */
  scope?: string
  /** Capture plane: vexnar | yakit | worker | replay | import. */
  source?: string
  confidence?: string
  duration_ms?: number
  turn_seq?: number
  flow_hash?: string
}

/** Sequence seed for live cursors. Single process, so ++ is race-free. */
let exchangeSeqSeed: number | null = null
async function nextExchangeSeq(): Promise<number> {
  if (exchangeSeqSeed == null) {
    const rows = (await writer().list('traffic_exchanges')) as any[]
    exchangeSeqSeed ??= rows.reduce<number>((max, row) => Math.max(max, Number(row.seq ?? 0)), 0)
  }
  return ++exchangeSeqSeed
}

/** 采集流量落库：sidecar/外部 hook 捕获到一条 exchange 后写入 `traffic_exchanges`。 */
export async function recordExchange(exchange: CaptureExchange) {
  const now = exchange.ts ?? Math.floor(Date.now() / 1000)
  const id = exchange.id ?? `${now}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`
  const method = String(exchange.method ?? '')
  const url = String(exchange.url ?? '')
  const scope = parseScope(exchange.scope)
  const reqBody = Buffer.isBuffer(exchange.req_body)
    ? exchange.req_body
    : Buffer.from(String(exchange.req_body ?? ''), 'utf8')
  const flowHash = String(exchange.flow_hash ?? '') ||
    sha256hex(`${method}\n${url}\n${sha256hex(reqBody)}`)
  const seq = await nextExchangeSeq()
  const req = await spillBody(exchange.content_type ?? '', exchange.req_body)
  const resp = await spillBody(exchange.content_type ?? '', exchange.resp_body)
  const record = {
    id,
    seq,
    ts: now,
    host: String(exchange.host ?? ''),
    method,
    url_template: String(exchange.url_template ?? ''),
    url,
    status: Number(exchange.status ?? 0),
    content_type: String(exchange.content_type ?? ''),
    req_len: req.len,
    resp_len: resp.len,
    req_head: String(exchange.req_head ?? ''),
    resp_head: String(exchange.resp_head ?? ''),
    req_body: req.inline,
    req_blob: req.hash,
    resp_body: resp.inline,
    resp_blob: resp.hash,
    scope: scope.raw,
    conv_id: scope.convId,
    task_id: scope.taskId,
    intent_id: scope.intentId,
    source: String(exchange.source ?? 'vexnar'),
    confidence: String(exchange.confidence ?? 'exact'),
    turn_seq: Number(exchange.turn_seq ?? 0),
    duration_ms: Number(exchange.duration_ms ?? 0),
    flow_hash: flowHash
  }
  await writer().commit([{ table: 'traffic_exchanges', key: id, record }])
  store.invalidate?.(['traffic_exchanges'])
  return record
}

/** One exchange's raw request/response, for the detail pane. */
export async function getExchangeRaw(id: string) {
  return readExchangeRaw(id)
}

/** Metadata window for one attribution scope, oldest-last. */
export async function listScopedExchanges(scope: string, afterSeq: number, limit: number) {
  const size = Math.min(Math.max(Number(limit) || 100, 1), 500)
  const all = (await writer().list('traffic_exchanges')) as any[]
  const rows = all
    .filter((row) => String(row.scope ?? '') === String(scope ?? ''))
    .filter((row) => Number(row.seq ?? 0) > 0)
    .filter((row) => (afterSeq > 0 ? Number(row.seq ?? 0) > afterSeq : true))
    .sort((a, b) => Number(a.seq ?? 0) - Number(b.seq ?? 0))
  const window = afterSeq > 0 ? rows.slice(0, size) : rows.slice(Math.max(rows.length - size, 0))
  return window.map(scopedExchangeDto)
}

function scopedExchangeDto(row: any) {
  return {
    id: String(row.id ?? ''),
    seq: Number(row.seq ?? 0),
    ts: Number(row.ts ?? 0),
    source: String(row.source ?? ''),
    scope: String(row.scope ?? ''),
    conv_id: Number(row.conv_id ?? 0),
    task_id: Number(row.task_id ?? 0),
    intent_id: Number(row.intent_id ?? 0),
    turn_seq: Number(row.turn_seq ?? 0),
    confidence: String(row.confidence ?? 'exact'),
    method: String(row.method ?? ''),
    url: String(row.url ?? ''),
    url_template: String(row.url_template ?? ''),
    host: String(row.host ?? ''),
    status: Number(row.status ?? 0),
    req_len: Number(row.req_len ?? 0),
    resp_len: Number(row.resp_len ?? 0),
    duration_ms: Number(row.duration_ms ?? 0),
    content_type: String(row.content_type ?? ''),
    phase: 'response'
  }
}

export interface IngestEvidenceExchange {
  traffic_id?: string
  role?: string
  note?: string
  captured_at?: number
  url: string
  method: string
  status: number
  content_type?: string
  req_head?: string
  resp_head?: string
  req_body?: Buffer | string
  resp_body?: Buffer | string
  /** Attribution: conv-12 / task-7 / task-7-i31 (empty = global traffic). */
  scope?: string
  /** Capture plane: vexnar | yakit | worker | replay | import. */
  source?: string
  confidence?: string
  duration_ms?: number
  turn_seq?: number
  flow_hash?: string
}

/**
 * 证据摄入：从 sidecar 流量落 snapshot 并绑定 finding（blobStore + writer.commit
 * 原子提交）。对齐 Go evidence.Store.Bind：正文 blob 按内容寻址（put 返回 sha256），
 * 快照按内容去重，绑定以 (finding_id, snapshot_id) 唯一，成功后 finding 的
 * evidence_version +1（乐观锁用记录 rev，冲突抛 StoreConflict → 409）。
 */
export async function ingestTrafficEvidence(findingId: string, exchanges: IngestEvidenceExchange[]) {
  const current = await writer().readRecord('findings', String(findingId))
  if (!current) throw Object.assign(new Error('漏洞不存在'), { status: 404 })

  const existing = ((await writer().list('finding_traffic_bindings')) as any[])
    .filter((row) => String(row.finding_id) === String(findingId))
  let position = existing.reduce((max, row) => Math.max(max, Number(row.position ?? 0)), -1) + 1
  let nextBindingId = (await writer().maxKey('finding_traffic_bindings')) + 1

  const now = new Date().toISOString()
  const seen = new Set<string>()
  const ops: Array<{ table: string; key: string; record: Record<string, unknown>; expectedRev?: number }> = []
  const bindings: any[] = []

  for (const exchange of exchanges) {
    const role = String(exchange.role ?? 'supporting')
    if (!TRAFFIC_ROLES.has(role)) throw Object.assign(new Error(`无效的流量用途 "${role}"`), { status: 400 })
    const req = toBuffer(exchange.req_body)
    const resp = toBuffer(exchange.resp_body)
    const reqPut = req ? await blobs().put(req) : null
    const respPut = resp ? await blobs().put(resp) : null
    const snapshot = {
      source_traffic_id: String(exchange.traffic_id ?? ''),
      captured_at: Number(exchange.captured_at ?? 0),
      url: String(exchange.url ?? ''),
      method: String(exchange.method ?? ''),
      status: Number(exchange.status ?? 0),
      content_type: String(exchange.content_type ?? ''),
      req_head: String(exchange.req_head ?? ''),
      resp_head: String(exchange.resp_head ?? ''),
      req_hash: reqPut?.hash ?? '',
      resp_hash: respPut?.hash ?? '',
      req_len: reqPut?.size ?? 0,
      resp_len: respPut?.size ?? 0,
      created_at: now
    }
    const id = trafficSnapshotId(snapshot)
    if (seen.has(id)) continue
    seen.add(id)

    ops.push({ table: 'traffic_evidence_snapshots', key: id, record: { id, snapshot } })
    const bindingId = String(nextBindingId++)
    const binding = {
      id: bindingId,
      finding_id: String(findingId),
      snapshot_id: id,
      role,
      note: String(exchange.note ?? ''),
      position,
      created_at: now
    }
    position += 1
    ops.push({ table: 'finding_traffic_bindings', key: bindingId, record: binding })
    bindings.push({ ...binding, snapshot })
  }

  const nextFinding: Record<string, unknown> = { ...current, evidence_version: Number(current.evidence_version ?? 0) + 1 }
  delete nextFinding.rev
  ops.push({ table: 'findings', key: String(findingId), record: nextFinding, expectedRev: Number(current.rev ?? 0) })

  const written = await writer().commit(ops)
  store.invalidate?.(['findings', 'finding_traffic_bindings', 'traffic_evidence_snapshots'])
  return {
    finding_id: String(findingId),
    version: Number(nextFinding.evidence_version),
    bindings,
    written: written.length
  }
}

// ── ZIP 导出（对齐 server/finding_traffic_export.go） ─────────────────────
function buildZip(entries: Array<{ name: string; data: Buffer }>) {
  const chunks: Buffer[] = []
  const central: Array<{ name: string; crc: number; size: number; compressed: Buffer; offset: number }> = []
  let offset = 0
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const crc = crc32(entry.data) >>> 0
    const compressed = deflateRawSync(entry.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // UTF-8 文件名
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0x21, 12) // 1980-01-01
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    chunks.push(local, nameBuf, compressed)
    central.push({ name: entry.name, crc, size: entry.data.length, compressed, offset })
    offset += 30 + nameBuf.length + compressed.length
  }
  const centralStart = offset
  for (const item of central) {
    const nameBuf = Buffer.from(item.name, 'utf8')
    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(0x0800, 8)
    header.writeUInt16LE(8, 10)
    header.writeUInt16LE(0, 12)
    header.writeUInt16LE(0x21, 14)
    header.writeUInt32LE(item.crc, 16)
    header.writeUInt32LE(item.compressed.length, 20)
    header.writeUInt32LE(item.size, 24)
    header.writeUInt16LE(nameBuf.length, 28)
    header.writeUInt16LE(0, 30)
    header.writeUInt16LE(0, 32)
    header.writeUInt16LE(0, 34)
    header.writeUInt16LE(0, 36)
    header.writeUInt32LE(0, 38)
    header.writeUInt32LE(item.offset, 42)
    chunks.push(header, nameBuf)
    offset += 46 + nameBuf.length
  }
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(central.length, 8)
  end.writeUInt16LE(central.length, 10)
  end.writeUInt32LE(offset - centralStart, 12)
  end.writeUInt32LE(centralStart, 16)
  end.writeUInt16LE(0, 20)
  chunks.push(end)
  return Buffer.concat(chunks)
}

function findingFilename(finding: any): string {
  const sev = String(finding.severity ?? 'info')
  const title = String(finding.name || finding.vulnclass || 'finding').replace(/[^\w\u4e00-\u9fa5-]+/g, '_')
  let name = `${sev}_${title}_#${finding.id}`
  name = name.replace(/[^\w\u4e00-\u9fa5._-]+/g, '_').replace(/^[._]+|[._]+$/g, '')
  if (!name) name = `finding_${finding.id}`
  if (name.length > 120) name = name.slice(0, 120)
  return `${name}.md`
}

function findingMarkdown(finding: any): string {
  const lines: string[] = []
  lines.push(`# [${finding.severity}] ${finding.vulnclass}${finding.name ? ` · ${finding.name}` : ''}`)
  lines.push('')
  lines.push(`- 状态：${finding.status}`)
  lines.push(`- 摘要：${finding.summary ?? '-'}`)
  if (finding.evidence) {
    lines.push('- 证据：')
    lines.push('```')
    lines.push(String(finding.evidence).slice(0, 4000))
    lines.push('```')
  }
  lines.push('')
  return lines.join('\n')
}

// ── 路由注册 ───────────────────────────────────────────────────────────────
export function register(api: Hono) {
  registerTrafficHistory(api)
  // TS MITM 采集面状态与 CA 证书（工具需要信任这个 CA 才能解开 HTTPS）。
  api.get('/api/traffic/mitm', (c) => c.json(mitmProxy().status()))
  api.get('/api/traffic/mitm/ca.pem', (c) =>
    new Response(mitmProxy().certPem(), {
      headers: {
        'content-type': 'application/x-pem-file',
        'content-disposition': 'attachment; filename="vexnar-mitm-ca.pem"',
        'cache-control': 'no-store'
      }
    })
  )

  // 单条 exchange 的完整请求/响应原文
  api.get('/api/traffic/exchange', async (c) => {
    try {
      const id = String(c.req.query('id') ?? '')
      if (!id) return c.json({ error: 'missing id' }, 400)
      const raw = await readExchangeRaw(id)
      if (!raw) return c.json({ error: 'exchange 不存在' }, 404)
      return c.json(raw)
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, e?.name === 'StoreConflict' ? 409 : e?.status ?? 400)
    }
  })

  // 按 sha256 流式读取超大正文
  api.get('/api/traffic/blob', async (c) => {
    try {
      const hash = String(c.req.query('hash') ?? '')
      if (!hash) return c.json({ error: 'missing hash' }, 400)
      const buffer = await readBlobBuffer(hash)
      return new Response(buffer, {
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': String(buffer.length),
          'content-disposition': `attachment; filename="${hash}.bin"`,
          'x-content-type-options': 'nosniff'
        }
      })
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, e?.name === 'StoreConflict' ? 409 : e?.status ?? 400)
    }
  })

  registerLocalTrafficCleanup(api)

  // 删除 host 子串匹配的采集流量
  api.delete('/api/traffic', async (c) => {
    try {
      const host = String(c.req.query('host') ?? '').trim()
      if (!host) return c.json({ error: 'missing host' }, 400)
      const deleted = await removeExchanges((row) => String(row.host ?? '').toLowerCase().includes(host.toLowerCase()))
      store.invalidate?.(['traffic_exchanges'])
      return c.json({ deleted })
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, e?.name === 'StoreConflict' ? 409 : e?.status ?? 400)
    }
  })

  // 批量精确删除 host（JSON body {"hosts":[...]}）
  api.delete('/api/traffic/hosts', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}))
      const hosts = (Array.isArray(body?.hosts) ? body.hosts : []).map((h: any) => String(h ?? '').trim()).filter(Boolean)
      if (!hosts.length) return c.json({ error: 'missing hosts' }, 400)
      const set = new Set(hosts)
      const deleted = await removeExchanges((row) => set.has(String(row.host ?? '')))
      store.invalidate?.(['traffic_exchanges'])
      return c.json({ deleted })
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, e?.name === 'StoreConflict' ? 409 : e?.status ?? 400)
    }
  })

  // 清空全部采集流量
  api.delete('/api/traffic/all', async (c) => {
    try {
      const deleted = await removeExchanges(() => true)
      store.invalidate?.(['traffic_exchanges'])
      return c.json({ deleted, reclaimed: 0 })
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, e?.name === 'StoreConflict' ? 409 : e?.status ?? 400)
    }
  })

  // 单 finding 的流量证据 ZIP 导出
  api.get('/api/exploration/findings/:id/traffic/export', async (c) => {
    try {
      const id = c.req.param('id')
      const out = await store.traffic(id)
      if (!out) return c.json({ error: 'finding not found' }, 404)
      const finding = await store.findings.get(id)
      if (!finding) return c.json({ error: 'finding not found' }, 404)
      const entries: Array<{ name: string; data: Buffer }> = []
      const used = new Map<string, number>()
      for (const binding of out.bindings ?? []) {
        const base = findingFilename(finding)
        const count = used.get(base) ?? 0
        used.set(base, count + 1)
        const name = count > 0 ? `${base.slice(0, -3)}-${count + 1}.md` : base
        if (count === 0) entries.push({ name, data: Buffer.from(findingMarkdown(finding), 'utf8') })
        const prefix = `evidence/${finding.id}/${binding.id}/`
        entries.push({ name: `${prefix}manifest.json`, data: Buffer.from(`${JSON.stringify(binding, null, 2)}\n`, 'utf8') })
        const snapshot = binding.snapshot ?? {}
        for (const side of ['request', 'response'] as const) {
          const hash = side === 'request' ? String(snapshot.req_hash ?? '') : String(snapshot.resp_hash ?? '')
          const head = side === 'request' ? String(snapshot.req_head ?? '') : String(snapshot.resp_head ?? '')
          let body = Buffer.alloc(0)
          if (hash) {
            try { body = await blobs().read(hash) } catch { body = Buffer.alloc(0) }
          }
          entries.push({ name: `${prefix}${side}.http`, data: Buffer.from(`${head.replace(/\r?\n$/, '')}\n\n`) })
          entries.push({ name: `${prefix}${side}.bin`, data: body })
        }
      }
      if (!entries.length) entries.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify({ finding_id: finding.id, bindings: 0 }, null, 2), 'utf8') })
      const zip = buildZip(entries)
      return new Response(zip, {
        headers: {
          'content-type': 'application/zip',
          'content-disposition': `attachment; filename="finding-${finding.id}-evidence.zip"`,
          'content-length': String(zip.length)
        }
      })
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, e?.name === 'StoreConflict' ? 409 : e?.status ?? 400)
    }
  })
}
