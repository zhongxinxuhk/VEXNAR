// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Egress 的 TS 持久化：node:sqlite（Node ≥ 22 内置），与 Go 版 schema 字段一致，
 * 但**独立文件**（默认 `<storeRoot>/egress/egress.db`）。迁移后不要再让 Go 引擎
 * 打开同一个库：单写者约束仍然是这条链路的前提。
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type {
  Binding,
  Fallback,
  Health,
  HealthSettings,
  Mode,
  Pool,
  SessionSpec,
  StoredNode,
  Subscription
} from './types.ts'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  server TEXT NOT NULL,
  port INTEGER NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  secrets TEXT NOT NULL DEFAULT '',
  fingerprint TEXT NOT NULL UNIQUE,
  tags TEXT NOT NULL DEFAULT '',
  weight INTEGER NOT NULL DEFAULT 1,
  max_conns INTEGER NOT NULL DEFAULT 32,
  enabled INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  egress_ip TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  via_node_id INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  strategy TEXT NOT NULL DEFAULT 'balanced',
  mode_default TEXT NOT NULL DEFAULT 'sticky',
  fallback TEXT NOT NULL DEFAULT 'block',
  fanout_k INTEGER NOT NULL DEFAULT 3,
  max_conns INTEGER NOT NULL DEFAULT 128,
  health_url TEXT NOT NULL DEFAULT 'http://www.gstatic.com/generate_204',
  ip_probe_url TEXT NOT NULL DEFAULT 'https://api.ipify.org',
  check_seconds INTEGER NOT NULL DEFAULT 300,
  sticky_ttl INTEGER NOT NULL DEFAULT 1800,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pool_members (
  pool_id INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  weight INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (pool_id, node_id)
);
CREATE TABLE IF NOT EXISTS task_bindings (
  task_id INTEGER PRIMARY KEY,
  pool_id INTEGER NOT NULL,
  mode TEXT NOT NULL DEFAULT 'sticky',
  fanout_k INTEGER NOT NULL DEFAULT 3,
  fallback TEXT NOT NULL DEFAULT 'block',
  max_conns INTEGER NOT NULL DEFAULT 8,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS node_health (
  node_id INTEGER PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'unknown',
  latency_ms INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0,
  fail_streak INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER NOT NULL DEFAULT 0,
  cooldown_until INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS usage (
  task_id INTEGER NOT NULL DEFAULT 0,
  node_id INTEGER NOT NULL,
  bucket INTEGER NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  bytes_in INTEGER NOT NULL DEFAULT 0,
  bytes_out INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (task_id, node_id, bucket)
);
CREATE TABLE IF NOT EXISTS fanout_usage (
  task_id INTEGER NOT NULL,
  bucket INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (task_id, bucket)
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  pool_id INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '',
  interval_seconds INTEGER NOT NULL DEFAULT 3600,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_fetch_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  last_added INTEGER NOT NULL DEFAULT 0,
  last_removed INTEGER NOT NULL DEFAULT 0,
  last_changed INTEGER NOT NULL DEFAULT 0,
  last_diff TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leases (
  key TEXT PRIMARY KEY,
  pool_id INTEGER NOT NULL,
  node_id INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  key TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  spec TEXT NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pool_members_node ON pool_members(node_id);
`

interface NodeRow {
  id: number
  name: string
  protocol: string
  server: string
  port: number
  config: string
  secrets: string
  fingerprint: string
  tags: string
  weight: number
  max_conns: number
  enabled: number
  note: string
  egress_ip: string
  source: string
  via_node_id: number
  created_at: number
  updated_at: number
}

interface PoolRow {
  id: number
  name: string
  strategy: string
  mode_default: string
  fallback: string
  fanout_k: number
  max_conns: number
  health_url: string
  ip_probe_url: string
  check_seconds: number
  sticky_ttl: number
  note: string
  created_at: number
}

export class EgressStore {
  readonly dir: string
  readonly path: string
  private db: DatabaseSync
  private key: Buffer

  private constructor(dir: string) {
    this.dir = dir
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    this.path = join(dir, 'egress.db')
    this.key = loadOrCreateKey(join(dir, '.key'))
    this.db = new DatabaseSync(this.path)
    this.db.exec('PRAGMA journal_mode=WAL')
    this.db.exec('PRAGMA busy_timeout=5000')
    this.db.exec('PRAGMA foreign_keys=ON')
    this.db.exec(SCHEMA)
  }

  static open(dir: string): EgressStore {
    const store = new EgressStore(dir)
    store.ensureColumn('nodes', 'via_node_id', 'INTEGER NOT NULL DEFAULT 0')
    return store
  }

  private ensureColumn(table: string, column: string, ddl: string): void {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    if (rows.some((row) => row.name === column)) return
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
  }

  close(): void {
    this.db.close()
  }

  // ---------- nodes ----------

  listNodes(): StoredNode[] {
    return this.db.prepare('SELECT * FROM nodes ORDER BY id').all().map((row) => this.toNode(row as unknown as NodeRow))
  }

  node(id: number): StoredNode | undefined {
    const row = this.db.prepare('SELECT * FROM nodes WHERE id=?').get(id) as unknown as NodeRow | undefined
    return row ? this.toNode(row) : undefined
  }

  nodesBySource(source: string): StoredNode[] {
    return this.db
      .prepare('SELECT * FROM nodes WHERE source=? ORDER BY id')
      .all(source)
      .map((row) => this.toNode(row as unknown as NodeRow))
  }

  /** Upsert by fingerprint, keeping operator metadata on update (tags/weight/enabled). */
  upsertNodes(nodes: StoredNode[], defaultTags: string[] = []): { created: number; updated: number } {
    let created = 0
    let updated = 0
    const now = Math.floor(Date.now() / 1000)
    const find = this.db.prepare('SELECT id FROM nodes WHERE fingerprint=?')
    const insert = this.db.prepare(`INSERT INTO nodes
      (name,protocol,server,port,config,secrets,fingerprint,tags,weight,max_conns,enabled,note,egress_ip,source,via_node_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    const update = this.db.prepare(`UPDATE nodes SET name=?,protocol=?,server=?,port=?,config=?,secrets=?,
      source=CASE WHEN ?<>'' THEN ? ELSE source END, via_node_id=?, updated_at=? WHERE id=?`)
    this.tx(() => {
      for (const node of nodes) {
        const existing = find.get(node.fingerprint) as { id: number } | undefined
        const sealed = this.seal(JSON.stringify(node.secrets))
        if (!existing) {
          insert.run(
            node.name,
            node.protocol,
            node.server,
            node.port,
            JSON.stringify(node.config),
            sealed,
            node.fingerprint,
            (node.tags.length ? node.tags : defaultTags).join(','),
            node.weight || 1,
            node.maxConns || 32,
            1,
            node.note,
            node.egressIp,
            node.source,
            node.viaNodeId ?? 0,
            now,
            now
          )
          created++
        } else {
          update.run(
            node.name,
            node.protocol,
            node.server,
            node.port,
            JSON.stringify(node.config),
            sealed,
            node.source,
            node.source,
            node.viaNodeId ?? 0,
            now,
            existing.id
          )
          updated++
        }
      }
    })
    return { created, updated }
  }

  updateNode(node: StoredNode): void {
    this.db
      .prepare(`UPDATE nodes SET name=?,protocol=?,server=?,port=?,config=?,secrets=?,tags=?,weight=?,
        max_conns=?,enabled=?,note=?,egress_ip=?,source=?,via_node_id=?,updated_at=? WHERE id=?`)
      .run(
        node.name,
        node.protocol,
        node.server,
        node.port,
        JSON.stringify(node.config),
        this.seal(JSON.stringify(node.secrets)),
        node.tags.join(','),
        node.weight || 1,
        node.maxConns || 32,
        node.enabled ? 1 : 0,
        node.note,
        node.egressIp,
        node.source,
        node.viaNodeId ?? 0,
        Math.floor(Date.now() / 1000),
        node.id
      )
  }

  deleteNode(id: number): void {
    this.db.prepare('DELETE FROM nodes WHERE id=?').run(id)
  }

  // ---------- pools ----------

  listPools(): Pool[] {
    return this.db.prepare('SELECT * FROM pools ORDER BY id').all().map((row) => toPool(row as unknown as PoolRow))
  }

  pool(id: number): Pool | undefined {
    const row = this.db.prepare('SELECT * FROM pools WHERE id=?').get(id) as unknown as PoolRow | undefined
    return row ? toPool(row) : undefined
  }

  createPool(input: Partial<Pool>): number {
    const now = Math.floor(Date.now() / 1000)
    const p = normalizePool(input)
    const res = this.db
      .prepare(`INSERT INTO pools(name,strategy,mode_default,fallback,fanout_k,max_conns,health_url,ip_probe_url,check_seconds,sticky_ttl,note,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        p.name,
        p.strategy,
        p.modeDefault,
        p.fallback,
        p.fanoutK,
        p.maxConns,
        p.healthUrl,
        p.ipProbeUrl,
        p.checkSeconds,
        p.stickyTtl,
        p.note,
        now
      )
    return Number(res.lastInsertRowid)
  }

  updatePool(input: Partial<Pool> & { id: number }): void {
    const p = normalizePool(input)
    this.db
      .prepare(`UPDATE pools SET name=?,strategy=?,mode_default=?,fallback=?,fanout_k=?,max_conns=?,
        health_url=?,ip_probe_url=?,check_seconds=?,sticky_ttl=?,note=? WHERE id=?`)
      .run(
        p.name,
        p.strategy,
        p.modeDefault,
        p.fallback,
        p.fanoutK,
        p.maxConns,
        p.healthUrl,
        p.ipProbeUrl,
        p.checkSeconds,
        p.stickyTtl,
        p.note,
        input.id
      )
  }

  deletePool(id: number): void {
    this.db.prepare('DELETE FROM pools WHERE id=?').run(id)
  }

  poolNodes(poolId: number): number[] {
    return this.db
      .prepare('SELECT node_id FROM pool_members WHERE pool_id=? ORDER BY position,node_id')
      .all(poolId)
      .map((row) => Number((row as { node_id: number }).node_id))
  }

  setPoolNodes(poolId: number, nodeIds: number[]): void {
    this.tx(() => {
      this.db.prepare('DELETE FROM pool_members WHERE pool_id=?').run(poolId)
      const ins = this.db.prepare('INSERT OR IGNORE INTO pool_members(pool_id,node_id,position,weight) VALUES (?,?,?,1)')
      nodeIds.forEach((id, index) => ins.run(poolId, id, index))
    })
  }

  // ---------- bindings ----------

  bindings(): Map<number, Binding> {
    const out = new Map<number, Binding>()
    for (const row of this.db.prepare('SELECT * FROM task_bindings').all()) {
      const r = row as {
        task_id: number
        pool_id: number
        mode: string
        fanout_k: number
        fallback: string
        max_conns: number
      }
      out.set(Number(r.task_id), {
        taskId: Number(r.task_id),
        poolId: Number(r.pool_id),
        mode: r.mode as Mode,
        fanoutK: Number(r.fanout_k),
        fallback: r.fallback as Fallback,
        maxConns: Number(r.max_conns)
      })
    }
    return out
  }

  binding(taskId: number): Binding | undefined {
    return this.bindings().get(taskId)
  }

  setBinding(binding: Binding): void {
    this.db
      .prepare(`INSERT INTO task_bindings(task_id,pool_id,mode,fanout_k,fallback,max_conns,updated_at)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(task_id) DO UPDATE SET pool_id=excluded.pool_id, mode=excluded.mode,
        fanout_k=excluded.fanout_k, fallback=excluded.fallback, max_conns=excluded.max_conns, updated_at=excluded.updated_at`)
      .run(
        binding.taskId,
        binding.poolId,
        binding.mode || 'sticky',
        binding.fanoutK || 3,
        binding.fallback || 'block',
        binding.maxConns || 8,
        Math.floor(Date.now() / 1000)
      )
  }

  deleteBinding(taskId: number): void {
    this.db.prepare('DELETE FROM task_bindings WHERE task_id=?').run(taskId)
  }

  // ---------- health / usage / budget ----------

  health(): Map<number, Health> {
    const out = new Map<number, Health>()
    for (const row of this.db.prepare('SELECT * FROM node_health').all()) {
      const r = row as {
        node_id: number
        state: string
        latency_ms: number
        success_rate: number
        fail_streak: number
        checked_at: number
        cooldown_until: number
        last_error: string
      }
      out.set(Number(r.node_id), {
        nodeId: Number(r.node_id),
        state: r.state as Health['state'],
        latencyMs: Number(r.latency_ms),
        successRate: Number(r.success_rate),
        failStreak: Number(r.fail_streak),
        checkedAt: Number(r.checked_at),
        cooldownUntil: Number(r.cooldown_until),
        lastError: r.last_error
      })
    }
    return out
  }

  saveHealth(health: Health): void {
    this.db
      .prepare(`INSERT INTO node_health(node_id,state,latency_ms,success_rate,fail_streak,checked_at,cooldown_until,last_error)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(node_id) DO UPDATE SET state=excluded.state, latency_ms=excluded.latency_ms,
        success_rate=excluded.success_rate, fail_streak=excluded.fail_streak,
        checked_at=excluded.checked_at, cooldown_until=excluded.cooldown_until, last_error=excluded.last_error`)
      .run(
        health.nodeId,
        health.state,
        health.latencyMs,
        health.successRate,
        health.failStreak,
        health.checkedAt,
        health.cooldownUntil,
        health.lastError
      )
  }

  addUsage(taskId: number, nodeId: number, requests: number, failures: number, bytesIn: number, bytesOut: number): void {
    const bucket = Math.floor(Date.now() / 3_600_000) * 3600
    this.db
      .prepare(`INSERT INTO usage(task_id,node_id,bucket,requests,failures,bytes_in,bytes_out)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(task_id,node_id,bucket) DO UPDATE SET requests=requests+excluded.requests,
        failures=failures+excluded.failures, bytes_in=bytes_in+excluded.bytes_in, bytes_out=bytes_out+excluded.bytes_out`)
      .run(taskId, nodeId, bucket, requests, failures, bytesIn, bytesOut)
  }

  fanoutUsed(taskId: number, bucket: number): number {
    const row = this.db.prepare('SELECT used FROM fanout_usage WHERE task_id=? AND bucket=?').get(taskId, bucket) as
      | { used: number }
      | undefined
    return row ? Number(row.used) : 0
  }

  addFanout(taskId: number, bucket: number, n: number): void {
    if (n <= 0) return
    this.db
      .prepare(`INSERT INTO fanout_usage(task_id,bucket,used) VALUES (?,?,?)
        ON CONFLICT(task_id,bucket) DO UPDATE SET used=used+excluded.used`)
      .run(taskId, bucket, n)
  }

  // ---------- subscriptions ----------

  subscriptions(): Subscription[] {
    return this.db.prepare('SELECT * FROM subscriptions ORDER BY id').all().map((row) => toSubscription(row as Record<string, unknown>))
  }

  subscription(id: number): Subscription | undefined {
    const row = this.db.prepare('SELECT * FROM subscriptions WHERE id=?').get(id) as Record<string, unknown> | undefined
    return row ? toSubscription(row) : undefined
  }

  saveSubscription(sub: Partial<Subscription>): number {
    const name = (sub.name ?? '').trim()
    const url = (sub.url ?? '').trim()
    if (!name || !url) throw new Error('订阅名称与 URL 不能为空')
    const interval = Math.max(300, sub.intervalSeconds ?? 3600)
    if (sub.id) {
      this.db
        .prepare('UPDATE subscriptions SET name=?,url=?,pool_id=?,tags=?,interval_seconds=?,enabled=? WHERE id=?')
        .run(name, url, sub.poolId ?? 0, (sub.tags ?? []).join(','), interval, sub.enabled === false ? 0 : 1, sub.id)
      return sub.id
    }
    const res = this.db
      .prepare('INSERT INTO subscriptions(name,url,pool_id,tags,interval_seconds,enabled,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(name, url, sub.poolId ?? 0, (sub.tags ?? []).join(','), interval, sub.enabled === false ? 0 : 1, Math.floor(Date.now() / 1000))
    return Number(res.lastInsertRowid)
  }

  deleteSubscription(id: number): void {
    this.db.prepare('DELETE FROM subscriptions WHERE id=?').run(id)
  }

  setSubscriptionResult(id: number, added: number, removed: number, changed: number, diff: string, lastError: string): void {
    this.db
      .prepare(`UPDATE subscriptions SET last_fetch_at=?, last_error=?, last_added=?, last_removed=?,
        last_changed=?, last_diff=? WHERE id=?`)
      .run(Math.floor(Date.now() / 1000), lastError, added, removed, changed, diff, id)
  }

  // ---------- settings / sessions / leases ----------

  settings(): HealthSettings {
    const rows = this.db.prepare('SELECT key,value FROM settings').all() as { key: string; value: string }[]
    const map = new Map(rows.map((r) => [r.key, r.value]))
    return {
      defaultPool: Number(map.get('default_pool') ?? 0),
      listenerAuth: map.get('listener_auth') === '1'
    }
  }

  saveSettings(input: Partial<HealthSettings>): void {
    const put = this.db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    if (input.defaultPool !== undefined) put.run('default_pool', String(input.defaultPool))
    if (input.listenerAuth !== undefined) put.run('listener_auth', input.listenerAuth ? '1' : '0')
  }

  saveSession(spec: SessionSpec & { key: string; secret: string }): void {
    this.db
      .prepare(`INSERT INTO sessions(key,secret,spec,last_seen) VALUES (?,?,?,?)
        ON CONFLICT(key) DO UPDATE SET secret=excluded.secret, spec=excluded.spec, last_seen=excluded.last_seen`)
      .run(spec.key, spec.secret, JSON.stringify(spec), Math.floor(Date.now() / 1000))
  }

  sessions(): { key: string; secret: string; spec: SessionSpec; lastSeen: number }[] {
    return this.db.prepare('SELECT * FROM sessions').all().map((row) => {
      const r = row as { key: string; secret: string; spec: string; last_seen: number }
      return {
        key: r.key,
        secret: r.secret,
        spec: JSON.parse(r.spec) as SessionSpec,
        lastSeen: Number(r.last_seen)
      }
    })
  }

  deleteSession(key: string): void {
    this.db.prepare('DELETE FROM sessions WHERE key=?').run(key)
  }

  saveLease(lease: { key: string; poolId: number; nodeId: number; expires: number }): void {
    this.db
      .prepare(`INSERT INTO leases(key,pool_id,node_id,expires) VALUES (?,?,?,?)
        ON CONFLICT(key) DO UPDATE SET pool_id=excluded.pool_id, node_id=excluded.node_id, expires=excluded.expires`)
      .run(lease.key, lease.poolId, lease.nodeId, lease.expires)
  }

  leases(): Map<string, { poolId: number; nodeId: number; expires: number }> {
    const out = new Map<string, { poolId: number; nodeId: number; expires: number }>()
    for (const row of this.db.prepare('SELECT * FROM leases').all()) {
      const r = row as { key: string; pool_id: number; node_id: number; expires: number }
      out.set(r.key, { poolId: Number(r.pool_id), nodeId: Number(r.node_id), expires: Number(r.expires) })
    }
    return out
  }

  deleteLeases(prefix: string): void {
    this.db.prepare('DELETE FROM leases WHERE key LIKE ?').run(`${prefix}%`)
  }

  // ---------- private ----------

  private toNode(row: NodeRow): StoredNode {
    return {
      id: Number(row.id),
      name: row.name,
      protocol: row.protocol,
      server: row.server,
      port: Number(row.port),
      config: JSON.parse(row.config || '{}') as Record<string, unknown>,
      secrets: row.secrets ? (JSON.parse(this.open(row.secrets)) as Record<string, string>) : {},
      fingerprint: row.fingerprint,
      tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
      weight: Number(row.weight),
      maxConns: Number(row.max_conns),
      enabled: Number(row.enabled) === 1,
      note: row.note,
      egressIp: row.egress_ip,
      source: row.source,
      viaNodeId: Number(row.via_node_id) || undefined,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    }
  }

  private tx(fn: () => void): void {
    this.db.exec('BEGIN')
    try {
      fn()
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  private seal(plain: string): string {
    if (!plain || plain === '{}') return ''
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')
  }

  private open(sealed: string): string {
    const raw = Buffer.from(sealed, 'base64')
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const ct = raw.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
  }
}

function loadOrCreateKey(path: string): Buffer {
  if (existsSync(path)) {
    const key = readFileSync(path)
    if (key.length === 32) return key
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const key = randomBytes(32)
  writeFileSync(path, key, { mode: 0o600 })
  return key
}

function normalizePool(input: Partial<Pool>) {
  const num = (v: unknown, def: number) => (typeof v === 'number' && v > 0 ? v : def)
  return {
    name: (input.name ?? '').trim(),
    strategy: input.strategy || 'balanced',
    modeDefault: (input.modeDefault || 'sticky') as Mode,
    fallback: (input.fallback || 'block') as Fallback,
    fanoutK: Math.min(8, Math.max(1, num(input.fanoutK, 3))),
    maxConns: num(input.maxConns, 128),
    healthUrl: input.healthUrl || 'http://www.gstatic.com/generate_204',
    ipProbeUrl: input.ipProbeUrl || 'https://api.ipify.org',
    checkSeconds: Math.max(30, num(input.checkSeconds, 300)),
    stickyTtl: Math.max(60, num(input.stickyTtl, 1800)),
    note: input.note ?? ''
  }
}

function toPool(row: PoolRow): Pool {
  return {
    id: Number(row.id),
    name: row.name,
    strategy: row.strategy,
    modeDefault: row.mode_default as Mode,
    fallback: row.fallback as Fallback,
    fanoutK: Number(row.fanout_k),
    maxConns: Number(row.max_conns),
    healthUrl: row.health_url,
    ipProbeUrl: row.ip_probe_url,
    checkSeconds: Number(row.check_seconds),
    stickyTtl: Number(row.sticky_ttl),
    note: row.note,
    createdAt: Number(row.created_at)
  }
}

function toSubscription(row: Record<string, unknown>): Subscription {
  return {
    id: Number(row.id),
    name: String(row.name),
    url: String(row.url),
    poolId: Number(row.pool_id),
    tags: String(row.tags ?? '').split(',').filter(Boolean),
    intervalSeconds: Number(row.interval_seconds),
    enabled: Number(row.enabled) === 1,
    lastFetchAt: Number(row.last_fetch_at),
    lastError: String(row.last_error ?? ''),
    lastAdded: Number(row.last_added),
    lastRemoved: Number(row.last_removed),
    lastChanged: Number(row.last_changed),
    lastDiff: String(row.last_diff ?? ''),
    createdAt: Number(row.created_at)
  }
}
