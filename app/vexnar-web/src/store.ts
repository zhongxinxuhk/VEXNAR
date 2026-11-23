// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Web 测试域的持久层（SQLite + WAL）。
 *
 * 表结构与职责：
 *   web_sessions   会话状态与预算；
 *   web_exchanges  每次交互的**脱敏**记录（正文只留 hash 与引用）；
 *   web_evidence   加密后的请求/响应正文（AES-256-GCM，AAD=ref）；
 *   web_vault      会话凭据的密文（由 SessionVault 读写）；
 *   web_policy_events  策略事件（限流、熔断、越界尝试）——审计用。
 *
 * 为什么正文单独存：spec 要求"记录里只放引用与摘要"，导出时才按需解密；
 * 这样一份 SQLite 被拿走，看到的只是 hash 和脱敏头部。
 */

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type { AesGcmBox } from './crypto-box.ts'
import type { HttpExchangeRecord, WebTestSession } from './types.ts'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS web_sessions (
  session_id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  auth_profile_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  request_count INTEGER NOT NULL DEFAULT 0,
  request_budget INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL DEFAULT 0,
  updated_at REAL NOT NULL DEFAULT 0,
  last_request_at REAL NOT NULL DEFAULT 0,
  agent_session TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS web_exchanges (
  request_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  test_case_id TEXT NOT NULL DEFAULT '',
  parent_request_id TEXT NOT NULL DEFAULT '',
  seq INTEGER NOT NULL DEFAULT 0,
  attempt INTEGER NOT NULL DEFAULT 1,
  mutation TEXT NOT NULL DEFAULT 'none',
  egress_id TEXT NOT NULL DEFAULT 'direct',
  identity_id TEXT NOT NULL DEFAULT 'api-client',
  method TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  host TEXT NOT NULL DEFAULT '',
  status INTEGER NOT NULL DEFAULT 0,
  classification TEXT NOT NULL DEFAULT 'unknown',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  req_headers TEXT NOT NULL DEFAULT '{}',
  req_body_hash TEXT NOT NULL DEFAULT '',
  req_bytes INTEGER NOT NULL DEFAULT 0,
  resp_headers TEXT NOT NULL DEFAULT '{}',
  resp_body_hash TEXT NOT NULL DEFAULT '',
  resp_bytes INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL DEFAULT '',
  truncated INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  deduplicated INTEGER NOT NULL DEFAULT 0,
  ts REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS web_exchanges_session ON web_exchanges(session_id, seq);
CREATE INDEX IF NOT EXISTS web_exchanges_class ON web_exchanges(session_id, classification);
CREATE TABLE IF NOT EXISTS web_evidence (
  ref TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'response',
  hash TEXT NOT NULL DEFAULT '',
  bytes INTEGER NOT NULL DEFAULT 0,
  truncated INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL DEFAULT '',
  created_at REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS web_evidence_request ON web_evidence(request_id);
CREATE TABLE IF NOT EXISTS web_vault (
  session_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS web_policy_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  ts REAL NOT NULL DEFAULT 0
);
`

export interface StoredExchange extends HttpExchangeRecord {
  host: string
}

export class WebStore {
  private readonly db: DatabaseSync

  constructor(public readonly path: string, private readonly box: AesGcmBox) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode=WAL')
    this.db.exec('PRAGMA synchronous=NORMAL')
    this.db.exec(SCHEMA)
    this.migrate()
  }

  /** 老库增量升级：缺列就补，不重建表（证据不能因为升级丢掉）。 */
  private migrate(): void {
    const sessionColumns = new Set(
      (this.db.prepare('PRAGMA table_info(web_sessions)').all() as Array<{ name: string }>).map((row) => row.name)
    )
    if (!sessionColumns.has('adversarial')) {
      this.db.exec('ALTER TABLE web_sessions ADD COLUMN adversarial INTEGER NOT NULL DEFAULT 0')
    }
    const columns = new Set(
      (this.db.prepare('PRAGMA table_info(web_exchanges)').all() as Array<{ name: string }>).map((row) => row.name)
    )
    const additions: Array<[string, string]> = [
      ['attempt', 'INTEGER NOT NULL DEFAULT 1'],
      ['mutation', "TEXT NOT NULL DEFAULT 'none'"],
      ['egress_id', "TEXT NOT NULL DEFAULT 'direct'"],
      ['identity_id', "TEXT NOT NULL DEFAULT 'api-client'"]
    ]
    for (const [name, ddl] of additions) {
      if (!columns.has(name)) this.db.exec(`ALTER TABLE web_exchanges ADD COLUMN ${name} ${ddl}`)
    }
  }

  close(): void {
    try { this.db.close() } catch { /* 已关 */ }
  }

  // ── sessions ────────────────────────────────────────────────────────────
  putSession(session: WebTestSession, agentSession = ''): void {
    this.db.prepare(`INSERT INTO web_sessions
      (session_id,scope_id,origin,label,auth_profile_id,status,adversarial,request_count,request_budget,
       created_at,updated_at,last_request_at,agent_session,meta)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(session_id) DO UPDATE SET
        scope_id=excluded.scope_id, origin=excluded.origin, label=excluded.label,
        auth_profile_id=excluded.auth_profile_id, status=excluded.status, adversarial=excluded.adversarial,
        request_count=excluded.request_count, request_budget=excluded.request_budget,
        updated_at=excluded.updated_at, last_request_at=excluded.last_request_at,
        agent_session=excluded.agent_session, meta=excluded.meta`
    ).run(
      session.sessionId, session.scopeId, session.origin, session.label, session.authProfileId,
      session.status, session.adversarial ? 1 : 0, session.requestCount, session.requestBudget, session.createdAt,
      session.updatedAt, session.lastRequestAt, agentSession, JSON.stringify(session.meta ?? {})
    )
  }

  getSession(sessionId: string): (WebTestSession & { agentSession: string }) | null {
    const row = this.db.prepare('SELECT * FROM web_sessions WHERE session_id=?').get(sessionId) as any
    if (!row) return null
    return {
      sessionId: String(row.session_id),
      adversarial: Boolean(row.adversarial),
      scopeId: String(row.scope_id),
      origin: String(row.origin),
      label: String(row.label),
      authProfileId: String(row.auth_profile_id),
      status: row.status,
      requestCount: Number(row.request_count),
      requestBudget: Number(row.request_budget),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      lastRequestAt: Number(row.last_request_at),
      meta: safeJson(row.meta),
      agentSession: String(row.agent_session)
    }
  }

  listSessions(agentSession?: string): Array<WebTestSession & { agentSession: string }> {
    const rows = agentSession
      ? this.db.prepare('SELECT * FROM web_sessions WHERE agent_session=? ORDER BY created_at DESC').all(agentSession) as any[]
      : this.db.prepare('SELECT * FROM web_sessions ORDER BY created_at DESC').all() as any[]
    return rows.map((row) => this.getSession(String(row.session_id))!).filter(Boolean)
  }

  // ── exchanges ───────────────────────────────────────────────────────────
  addExchange(record: StoredExchange, evidence: Array<{ ref: string; kind: string; hash: string; bytes: number; truncated: boolean; body: Buffer }>): void {
    this.db.exec('BEGIN')
    try {
      this.db.prepare(`INSERT OR REPLACE INTO web_exchanges
        (request_id,session_id,test_case_id,parent_request_id,seq,attempt,mutation,egress_id,identity_id,
         method,url,path,host,status,classification,
         duration_ms,req_headers,req_body_hash,req_bytes,resp_headers,resp_body_hash,resp_bytes,content_type,
         truncated,title,deduplicated,ts,note)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        record.requestId, record.sessionId, record.testCaseId, record.parentRequestId ?? '', record.sequence,
        record.attempt, record.mutation, record.egressId, record.identityId,
        record.method, record.url, record.path, record.host, record.status, record.classification,
        record.durationMs, JSON.stringify(record.requestHeaders), record.requestBodyHash ?? '', record.requestBytes,
        JSON.stringify(record.responseHeaders), record.responseBodyHash ?? '', record.responseBytes,
        record.contentType, record.truncated ? 1 : 0, record.title, record.deduplicated ? 1 : 0,
        record.timestamp, record.note
      )
      const stmt = this.db.prepare(
        'INSERT OR REPLACE INTO web_evidence (ref,session_id,request_id,kind,hash,bytes,truncated,payload,created_at) VALUES (?,?,?,?,?,?,?,?,?)'
      )
      for (const item of evidence) {
        stmt.run(item.ref, record.sessionId, record.requestId, item.kind, item.hash, item.bytes,
          item.truncated ? 1 : 0, this.box.seal(item.body, item.ref), Date.now() / 1000)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  getExchange(requestId: string): StoredExchange | null {
    const row = this.db.prepare('SELECT * FROM web_exchanges WHERE request_id=?').get(requestId) as any
    return row ? hydrate(row) : null
  }

  listExchanges(sessionId: string, limit = 50, requestId?: string): StoredExchange[] {
    const rows = requestId
      ? this.db.prepare('SELECT * FROM web_exchanges WHERE session_id=? AND request_id=?').all(sessionId, requestId) as any[]
      : this.db.prepare('SELECT * FROM web_exchanges WHERE session_id=? ORDER BY seq DESC LIMIT ?').all(sessionId, limit) as any[]
    return rows.map(hydrate)
  }

  /** 去重查询：同会话里最近 N 条同 method+url 的只读请求。 */
  findReusable(sessionId: string, method: string, url: string, sinceTs: number): StoredExchange | null {
    const row = this.db.prepare(
      `SELECT * FROM web_exchanges
       WHERE session_id=? AND method=? AND url=? AND classification='normal' AND deduplicated=0 AND ts>=?
       ORDER BY ts DESC LIMIT 1`
    ).get(sessionId, method, url, sinceTs) as any
    return row ? hydrate(row) : null
  }

  evidence(ref: string): { kind: string; bytes: Buffer; truncated: boolean; hash: string } | null {
    const row = this.db.prepare('SELECT * FROM web_evidence WHERE ref=?').get(ref) as any
    if (!row) return null
    return {
      kind: String(row.kind),
      hash: String(row.hash),
      truncated: Boolean(row.truncated),
      bytes: this.box.open(String(row.payload), ref)
    }
  }

  stats(sessionId: string): {
    total: number
    byClassification: Record<string, number>
    avgDurationMs: number
    bytes: number
    lastAt: number
  } {
    const rows = this.db.prepare(
      'SELECT classification, COUNT(*) AS n, AVG(duration_ms) AS avg_ms, SUM(resp_bytes) AS bytes, MAX(ts) AS last FROM web_exchanges WHERE session_id=? GROUP BY classification'
    ).all(sessionId) as any[]
    const byClassification: Record<string, number> = {}
    let total = 0
    let weight = 0
    let bytes = 0
    let lastAt = 0
    for (const row of rows) {
      const count = Number(row.n)
      byClassification[String(row.classification)] = count
      total += count
      weight += Number(row.avg_ms ?? 0) * count
      bytes += Number(row.bytes ?? 0)
      lastAt = Math.max(lastAt, Number(row.last ?? 0))
    }
    return { total, byClassification, avgDurationMs: total ? Math.round(weight / total) : 0, bytes, lastAt }
  }

  recordPolicyEvent(sessionId: string, kind: string, detail: string): void {
    this.db.prepare('INSERT INTO web_policy_events (session_id,kind,detail,ts) VALUES (?,?,?,?)')
      .run(sessionId, kind, detail, Date.now() / 1000)
  }

  listPolicyEvents(sessionId: string, limit = 50): Array<{ kind: string; detail: string; ts: number }> {
    return this.db.prepare('SELECT kind,detail,ts FROM web_policy_events WHERE session_id=? ORDER BY id DESC LIMIT ?')
      .all(sessionId, limit) as any[]
  }

  // ── vault 持久化接口（SessionVault 用） ─────────────────────────────────
  readVault(sessionId: string): string | null {
    const row = this.db.prepare('SELECT payload FROM web_vault WHERE session_id=?').get(sessionId) as any
    return row ? String(row.payload) : null
  }

  writeVault(sessionId: string, payload: string): void {
    this.db.prepare(
      'INSERT INTO web_vault (session_id,payload,updated_at) VALUES (?,?,?) ON CONFLICT(session_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at'
    ).run(sessionId, payload, Date.now() / 1000)
  }

  removeVault(sessionId: string): void {
    this.db.prepare('DELETE FROM web_vault WHERE session_id=?').run(sessionId)
  }
}

function hydrate(row: any): StoredExchange {
  return {
    sessionId: String(row.session_id),
    testCaseId: String(row.test_case_id),
    requestId: String(row.request_id),
    parentRequestId: String(row.parent_request_id) || undefined,
    sequence: Number(row.seq),
    attempt: Number(row.attempt ?? 1),
    mutation: String(row.mutation ?? 'none'),
    egressId: String(row.egress_id ?? 'direct'),
    identityId: String(row.identity_id ?? 'api-client'),
    method: String(row.method),
    url: String(row.url),
    path: String(row.path),
    host: String(row.host),
    status: Number(row.status),
    classification: row.classification,
    durationMs: Number(row.duration_ms),
    requestHeaders: safeJson(row.req_headers),
    requestBodyHash: String(row.req_body_hash) || undefined,
    requestBytes: Number(row.req_bytes),
    responseHeaders: safeJson(row.resp_headers),
    responseBodyHash: String(row.resp_body_hash) || undefined,
    responseBytes: Number(row.resp_bytes),
    contentType: String(row.content_type),
    truncated: Boolean(row.truncated),
    title: String(row.title),
    deduplicated: Boolean(row.deduplicated),
    timestamp: Number(row.ts),
    note: String(row.note),
    evidence: []
  }
}

function safeJson(value: unknown): Record<string, string> {
  if (typeof value !== 'string' || !value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {}
  } catch {
    return {}
  }
}
