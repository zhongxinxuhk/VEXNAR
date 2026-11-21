// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * TS 版 egress 运行时：节点快照、会话/租约、健康探测、对抗模式、订阅调度。
 * 网关（gateway.ts）只负责协议与字节转发，所有选择/预算/审计都在这里。
 */

import { EventEmitter } from 'node:events'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { connect as tlsConnect, type TLSSocket } from 'node:tls'
import type { Socket } from 'node:net'

import { dialNode, type Dialed } from './dialer.ts'
import { ProtocolEngine } from './engine.ts'
import { fingerprint, parseInput } from './parse.ts'
import { EgressStore } from './store.ts'
import type {
  Binding,
  Endpoint,
  Fallback,
  Health,
  HealthSettings,
  Lease,
  Mode,
  Pool,
  SessionSpec,
  StoredNode,
  Subscription
} from './types.ts'

export const FANOUT_BUDGET_PER_HOUR = 600
const FANOUT_MAX_K = 8
const SESSION_IDLE_MS = 4 * 3_600_000

export interface EgressOptions {
  dir: string
  engineBinary?: string
  basePort?: number
}

export interface Route {
  session: Session
  mode?: Mode
  pin?: number
  /** fanout/internal callers pin the pool explicitly instead of the default. */
  poolId?: number
}

interface Counters {
  requests: number
  failures: number
  lastError: string
  recent: Attempt[]
}

export interface Attempt {
  at: number
  nodeId: number
  ok: boolean
  status?: number
  ms?: number
  bytesIn?: number
  bytesOut?: number
  error?: string
}

interface NodeState {
  node: StoredNode
  health: Health
  requests: number
  failures: number
  inflight: number
  latencyEw: number
  sem: Semaphore
}

interface PoolState {
  pool: Pool
  nodes: NodeState[]
  sem: Semaphore
}

export interface Session {
  spec: Required<Pick<SessionSpec, 'key'>> & SessionSpec
  secret: string
  sem: Semaphore
  lease?: Lease
  lastSeen: number
  counters: Counters
}

export interface FanoutOptions {
  k?: number
  timeoutMs?: number
  jitterMs?: number
  headers?: Record<string, string>
  body?: string
  idempotent?: boolean
}

export interface FanoutAttemptResult {
  node_id: number
  node_name?: string
  egress_ip?: string
  status?: number
  verdict: 'pass' | 'block' | 'unknown'
  ms?: number
  bytes?: number
  error?: string
}

export interface FanoutResult {
  status: number
  blocked: boolean
  winner_node: number
  attempts: FanoutAttemptResult[]
  body?: string
  header?: Record<string, string>
}

export interface Acquired {
  node: NodeState
  release: (status: number, bytesIn: number, bytesOut: number, error?: Error) => void
  direct: boolean
}

class Semaphore {
  private active = 0
  private queue: (() => void)[] = []
  readonly limit: number

  constructor(limit: number) {
    this.limit = limit
  }

  tryTake(): boolean {
    if (this.active < this.limit) {
      this.active++
      return true
    }
    return false
  }

  take(): Promise<void> {
    if (this.tryTake()) return Promise.resolve()
    return new Promise((resolve) => this.queue.push(resolve))
  }

  give(): void {
    const next = this.queue.shift()
    if (next) next()
    else this.active = Math.max(0, this.active - 1)
  }
}

export class EgressManager {
  readonly store: EgressStore
  readonly engine: ProtocolEngine
  readonly events = new EventEmitter()
  readonly settings: HealthSettings

  private nodes = new Map<number, NodeState>()
  private pools = new Map<number, PoolState>()
  private bindings = new Map<number, Binding>()
  private sessions = new Map<string, Session>()
  private timer?: NodeJS.Timeout
  private hostMemory = new Map<string, { prefer: Map<number, number>; blocked: Map<number, number> }>()
  private started = false

  constructor(options: EgressOptions) {
    this.store = EgressStore.open(options.dir)
    this.engine = new ProtocolEngine({
      binary: options.engineBinary,
      workDir: options.dir,
      basePort: options.basePort
    })
    this.settings = this.store.settings()
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    await this.reload()
    // 首次体检/订阅放到后台：状态接口不应等待几十个节点探测完才返回。
    void this.runHealthDue(true)
    void this.runSubscriptions()
    this.timer = setInterval(() => {
      void this.tick()
    }, 30_000)
    this.timer.unref?.()
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    await this.engine.stop()
    this.store.close()
  }

  async tick(): Promise<void> {
    try {
      await this.runHealthDue(false)
      await this.runSubscriptions()
      this.evictIdleSessions()
    } catch (error) {
      console.error('[egress] tick failed:', (error as Error).message)
    }
  }

  /** 重新读取库并让协议引擎与快照一致。 */
  async reload(): Promise<void> {
    const nodeList = this.store.listNodes()
    const pools = this.store.listPools()
    const health = this.store.health()
    const members = new Map<number, number[]>()
    for (const pool of pools) members.set(pool.id, this.store.poolNodes(pool.id))

    this.nodes = new Map()
    const engineNodes: { id: number; node: StoredNode }[] = []
    for (const node of nodeList) {
      const h = health.get(node.id) ?? {
        nodeId: node.id,
        state: 'unknown' as const,
        latencyMs: 0,
        successRate: 1,
        failStreak: 0,
        checkedAt: 0,
        cooldownUntil: 0,
        lastError: ''
      }
      this.nodes.set(node.id, {
        node,
        health: h,
        requests: 0,
        failures: 0,
        inflight: 0,
        latencyEw: h.latencyMs,
        sem: new Semaphore(Math.max(1, node.maxConns))
      })
      const member = [...members.values()].some((ids) => ids.includes(node.id))
      if (node.enabled && member && node.protocol !== 'socks5' && node.protocol !== 'http') {
        engineNodes.push({ id: node.id, node })
      }
    }

    this.pools = new Map()
    for (const pool of pools) {
      const sem = new Semaphore(Math.max(1, pool.maxConns))
      const nodes = (members.get(pool.id) ?? [])
        .map((id) => this.nodes.get(id))
        .filter((state): state is NodeState => Boolean(state))
      this.pools.set(pool.id, { pool, nodes, sem })
    }
    this.bindings = this.store.bindings()
    this.settings.defaultPool = this.store.settings().defaultPool
    this.settings.listenerAuth = this.store.settings().listenerAuth

    if (engineNodes.length === 0) {
      await this.engine.stop()
    } else if (this.engine.available) {
      await this.engine.reconcile(
        engineNodes.map(({ id, node }) => ({
          id,
          name: node.name,
          protocol: node.protocol,
          server: node.server,
          port: node.port,
          config: node.config,
          secrets: node.secrets
        }))
      )
    }
  }

  // ---------- sessions ----------

  endpoint(spec: SessionSpec): Endpoint {
    const key = sanitizeKey(spec.key)
    let session = this.sessions.get(key)
    if (!session) {
      session = {
        spec: {
          ...spec,
          key,
          mode: normalizeMode(spec.mode ?? 'sticky'),
          fallback: normalizeFallback(spec.fallback ?? 'block'),
          maxConns: Math.max(1, spec.maxConns ?? 8),
          fanoutK: Math.min(FANOUT_MAX_K, Math.max(1, spec.fanoutK ?? 3))
        },
        secret: randomBytes(24).toString('base64url'),
        sem: new Semaphore(Math.max(1, spec.maxConns ?? 8)),
        lastSeen: Date.now(),
        counters: { requests: 0, failures: 0, lastError: '', recent: [] }
      }
      this.sessions.set(key, session)
    } else {
      session.spec = {
        ...session.spec,
        ...spec,
        key,
        mode: normalizeMode(spec.mode ?? session.spec.mode ?? 'sticky'),
        fallback: normalizeFallback(spec.fallback ?? session.spec.fallback ?? 'block'),
        maxConns: Math.max(1, spec.maxConns ?? session.spec.maxConns ?? 8)
      }
    }
    const poolId = this.poolIdFor(session)
    const pool = poolId ? this.pools.get(poolId) : undefined
    const gateway = this.gatewayAddress()
    return {
      url: gateway ? `http://sess_${key}:${session.secret}@${gateway}` : '',
      session: key,
      poolId,
      poolName: pool?.pool.name ?? '',
      mode: session.spec.mode ?? 'sticky'
    }
  }

  route(user: string, pass: string): Route {
    let base = user
    let mode: Mode | undefined
    let pin: number | undefined
    const dot = user.lastIndexOf('.')
    if (dot > 0) {
      const suffix = user.slice(dot + 1)
      if (suffix === 'sticky' || suffix === 'rotate' || suffix === 'fanout') {
        mode = suffix
        base = user.slice(0, dot)
      } else if (suffix.startsWith('node_')) {
        const id = Number(suffix.slice('node_'.length))
        if (Number.isInteger(id)) pin = id
        base = user.slice(0, dot)
      }
    }
    const key = base.startsWith('sess_') ? base.slice('sess_'.length) : base
    const session = this.sessions.get(sanitizeKey(key))
    if (!session) throw new EgressError('EGRESS_SESSION_REVOKED', 407, '会话已撤销')
    const given = Buffer.from(pass)
    const expected = Buffer.from(session.secret)
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new EgressError('EGRESS_BAD_CREDENTIAL', 407, '代理认证失败')
    }
    session.lastSeen = Date.now()
    return { session, mode, pin }
  }

  hasSession(key: string): boolean {
    return this.sessions.has(sanitizeKey(key))
  }

  sessionCredential(key: string): { user: string; secret: string } | undefined {
    const session = this.sessions.get(sanitizeKey(key))
    return session ? { user: `sess_${sanitizeKey(key)}`, secret: session.secret } : undefined
  }

  revoke(key: string): void {
    this.sessions.delete(sanitizeKey(key))
  }

  revokeTask(taskId: number): void {
    for (const [key, session] of this.sessions) {
      if (session.spec.taskId === taskId || key.startsWith(`task-${taskId}-`)) this.sessions.delete(key)
    }
  }

  // ---------- acquire / release ----------

  async acquire(route: Route): Promise<Acquired> {
    const session = route.session
    const poolId = route.poolId ?? this.poolIdFor(session)
    const pool = poolId ? this.pools.get(poolId) : undefined
    if (!pool) {
      if (this.fallbackOf(session) === 'direct') {
        return { node: undefined as unknown as NodeState, direct: true, release: () => {} }
      }
      throw new EgressError('EGRESS_NO_POOL', 502, '会话没有可用的代理池')
    }
    await pool.sem.take()
    await session.sem.take()
    const candidates = this.candidates(pool)
    const mode = route.mode ?? session.spec.mode ?? 'sticky'
    let chosen: NodeState | undefined
    if (route.pin !== undefined) {
      chosen = candidates.find((state) => state.node.id === route.pin)
      if (!chosen) {
        pool.sem.give()
        session.sem.give()
        throw new EgressError('EGRESS_NO_NODE', 502, `指定节点 ${route.pin} 不在池内或不可用`)
      }
    } else if (mode === 'sticky' && session.lease && session.lease.expires > Date.now()) {
      chosen = candidates.find((state) => state.node.id === session.lease?.nodeId)
    }
    if (!chosen) chosen = pickWeighted(candidates, pool.pool.strategy)
    if (!chosen) {
      pool.sem.give()
      session.sem.give()
      if (this.fallbackOf(session) === 'direct') {
        return { node: undefined as unknown as NodeState, direct: true, release: () => {} }
      }
      throw new EgressError('EGRESS_NO_NODE', 502, '池内没有可用节点')
    }
    if (!(await chosen.sem.take().then(() => true))) {
      pool.sem.give()
      session.sem.give()
      throw new EgressError('EGRESS_BUSY', 429, '节点并发已满')
    }
    chosen.inflight++
    if (mode === 'sticky' || pool.pool.strategy === 'sticky') {
      session.lease = {
        key: session.spec.key,
        poolId: pool.pool.id,
        nodeId: chosen.node.id,
        expires: Date.now() + pool.pool.stickyTtl * 1000
      }
    }
    const started = Date.now()
    let released = false
    return {
      node: chosen,
      direct: false,
      release: (status, bytesIn, bytesOut, error) => {
        if (released) return
        released = true
        chosen.inflight--
        chosen.sem.give()
        session.sem.give()
        pool.sem.give()
        const ok = !error && status > 0 && status < 500
        this.report(chosen, ok, Date.now() - started, error)
        this.note(session, chosen, ok, status, bytesIn, bytesOut, Date.now() - started, error)
      }
    }
  }

  /** 直接给协议引擎/健康探测用：不经会话。 */
  nodeById(id: number): NodeState | undefined {
    return this.nodes.get(id)
  }

  poolState(id: number): PoolState | undefined {
    return this.pools.get(id)
  }

  candidates(pool: PoolState): NodeState[] {
    const now = Date.now()
    return pool.nodes.filter((state) => {
      if (!state.node.enabled) return false
      if (state.health.state === 'cooldown' && state.health.cooldownUntil > now) return false
      return true
    })
  }

  // ---------- health ----------

  async checkNode(id: number): Promise<Health> {
    const state = this.nodes.get(id)
    if (!state) throw new Error(`节点 ${id} 不存在`)
    const pool = [...this.pools.values()].find((p) => p.nodes.some((n) => n.node.id === id))
    const healthUrl = pool?.pool.healthUrl ?? 'http://www.gstatic.com/generate_204'
    const target = new URL(healthUrl)
    const started = Date.now()
    let health: Health = {
      nodeId: id,
      state: 'down',
      latencyMs: 0,
      successRate: 0,
      failStreak: state.health.failStreak + 1,
      checkedAt: Date.now(),
      cooldownUntil: 0,
      lastError: ''
    }
    try {
      const socket = await dialNode(state.node, this.engine, target.hostname, Number(target.port || 80), 10_000)
      const status = await httpProbe(socket, target)
      socket.destroy()
      health = {
        ...health,
        state: 'up',
        latencyMs: Date.now() - started,
        successRate: 1,
        failStreak: 0
      }
      if (status >= 400) throw new Error(`探测返回 HTTP ${status}`)
      state.latencyEw = health.latencyMs
    } catch (error) {
      health.lastError = (error as Error).message.slice(0, 200)
    }
    state.health = health
    this.store.saveHealth(health)
    this.emit({ type: 'node_health', node_id: id, state: health.state, message: health.lastError })
    return health
  }

  async checkPool(poolId: number): Promise<Health[]> {
    const pool = this.pools.get(poolId)
    if (!pool) return []
    const results: Health[] = []
    for (const state of pool.nodes) {
      results.push(await this.checkNode(state.node.id))
    }
    return results
  }

  private async runHealthDue(force: boolean): Promise<void> {
    const now = Date.now()
    for (const pool of this.pools.values()) {
      for (const state of pool.nodes) {
        if (!state.node.enabled) continue
        const due = state.health.checkedAt === 0 || now - state.health.checkedAt >= pool.pool.checkSeconds * 1000
        const cooled = state.health.cooldownUntil > 0 && state.health.cooldownUntil <= now
        if (force || due || cooled) await this.checkNode(state.node.id)
      }
    }
  }

  // ---------- fanout ----------

  async fanout(sessionKey: string, method: string, url: string, options: FanoutOptions = {}): Promise<FanoutResult> {
    const session = this.sessions.get(sanitizeKey(sessionKey))
    if (!session) throw new EgressError('EGRESS_SESSION_REVOKED', 407, '会话已撤销')
    const target = new URL(url)
    const upper = (method || 'GET').toUpperCase()
    const idempotent =
      options.idempotent === true || ['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(upper)
    const poolId = this.poolIdFor(session)
    const pool = poolId ? this.pools.get(poolId) : undefined
    if (!pool) throw new EgressError('EGRESS_NO_POOL', 502, '会话没有可用的代理池')
    let k = options.k ?? session.spec.fanoutK ?? pool.pool.fanoutK ?? 3
    k = Math.min(FANOUT_MAX_K, Math.max(1, k))
    if (!idempotent) k = 1
    const candidates = this.rankForHost(target.hostname, this.candidates(pool))
    if (candidates.length === 0) throw new EgressError('EGRESS_NO_NODE', 502, '池内没有可用节点')
    k = Math.min(k, candidates.length)
    const taskId = session.spec.taskId ?? 0
    const allowed = this.consumeFanout(taskId, k)
    if (allowed <= 0) throw new EgressError('EGRESS_FANOUT_BUDGET', 429, '对抗模式预算已用完（本小时）')
    k = Math.min(k, allowed)

    const attempts: FanoutAttemptResult[] = []
    let winner: { status: number; body: string; header: Record<string, string> } | undefined
    let winnerNode = 0
    let fallback: { status: number; body: string; header: Record<string, string>; node: number } | undefined
    let blocked = true

    const chosen: NodeState[] = []
    for (let index = 0; index < k; index++) chosen.push(candidates[index % candidates.length])
    const settled = await Promise.all(
      chosen.map((state) => this.fanoutAttempt(state, target, upper, options, pool.pool.id))
    )
    for (let index = 0; index < settled.length; index++) {
      const state = chosen[index]
      const result = settled[index]
      attempts.push({
        node_id: state.node.id,
        node_name: state.node.name,
        egress_ip: state.node.egressIp || undefined,
        status: result.status,
        verdict: result.verdict,
        ms: result.ms,
        bytes: result.body?.length,
        error: result.error
      })
      if (result.verdict === 'pass' && !winner) {
        winner = { status: result.status ?? 0, body: result.body ?? '', header: result.header ?? {} }
        winnerNode = state.node.id
        blocked = false
      }
      if (!fallback || (result.status ?? 0) > (fallback.status ?? 0)) {
        fallback = { status: result.status ?? 0, body: result.body ?? '', header: result.header ?? {}, node: state.node.id }
      }
    }
    if (!winner && fallback) {
      winnerNode = fallback.node
      winner = { status: fallback.status, body: fallback.body, header: fallback.header }
    }
    this.rememberHost(target.hostname, winnerNode, attempts)
    return {
      status: winner?.status ?? 0,
      blocked,
      winner_node: winnerNode,
      attempts,
      body: truncate(winner?.body ?? '', 64 * 1024),
      header: winner?.header
    }
  }

  private async fanoutAttempt(
    state: NodeState,
    target: URL,
    method: string,
    options: FanoutOptions,
    poolId: number
  ): Promise<{ status?: number; body?: string; header?: Record<string, string>; verdict: 'pass' | 'block' | 'unknown'; ms: number; error?: string }> {
    const started = Date.now()
    const timeout = options.timeoutMs ?? 30_000
    try {
      const acquired = await this.acquire({ session: this.internalSession(state), pin: state.node.id, poolId })
      if (acquired.direct) throw new Error('节点不可用')
      const socket = await dialNode(state.node, this.engine, target.hostname, Number(target.port || 80), timeout)
      const response = await httpRequest(socket, target, method, options.headers ?? {}, options.body)
      socket.destroy()
      acquired.release(response.status, response.body.length, (options.body ?? '').length, undefined)
      const verdict = defaultVerdict(response.status, response.body)
      return { status: response.status, body: response.body, header: response.header, verdict, ms: Date.now() - started }
    } catch (error) {
      const message = (error as Error).message
      return { verdict: 'unknown', ms: Date.now() - started, error: message }
    }
  }

  private internalSession(state: NodeState): Session {
    const key = `internal-${state.node.id}`
    let session = this.sessions.get(key)
    if (!session) {
      session = {
        spec: { key, mode: 'rotate', fallback: 'block', maxConns: 4, fanoutK: 1 },
        secret: '',
        sem: new Semaphore(4),
        lastSeen: Date.now(),
        counters: { requests: 0, failures: 0, lastError: '', recent: [] }
      }
      this.sessions.set(key, session)
    }
    return session
  }

  // ---------- subscriptions ----------

  async refreshSubscription(id: number): Promise<{ added: number; removed: number; changed: number; issues: unknown[]; diff: { added: string[]; removed: string[] } }> {
    const sub = this.store.subscription(id)
    if (!sub) throw new EgressError('EGRESS_NOT_FOUND', 404, '订阅不存在')
    const source = `sub:${id}`
    let text: string
    try {
      text = await fetchSubscription(sub.url)
    } catch (error) {
      this.store.setSubscriptionResult(id, 0, 0, 0, '', (error as Error).message.slice(0, 300))
      throw error
    }
    const parsed = parseInput(text)
    if (parsed.nodes.length === 0) {
      this.store.setSubscriptionResult(id, 0, 0, 0, '', '订阅没有解析到可用节点')
      throw new Error('订阅没有解析到可用节点')
    }
    const existing = new Map(this.store.nodesBySource(source).map((node) => [node.fingerprint, node]))
    const seen = new Set<string>()
    const diff = { added: [] as string[], removed: [] as string[] }
    let added = 0
    let removed = 0
    let changed = 0
    const upserts: StoredNode[] = []
    for (const config of parsed.nodes) {
      const fp = fingerprint(config)
      seen.add(fp)
      const old = existing.get(fp)
      upserts.push({
        ...config,
        id: old?.id ?? 0,
        fingerprint: fp,
        tags: sub.tags,
        weight: old?.weight ?? 1,
        maxConns: old?.maxConns ?? 32,
        enabled: old?.enabled ?? true,
        note: old?.note ?? '',
        egressIp: old?.egressIp ?? '',
        source,
        createdAt: old?.createdAt ?? Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000)
      })
      if (old) {
        if (old.name !== config.name) changed++
      } else {
        added++
        diff.added.push(config.name)
      }
    }
    for (const [fp, node] of existing) {
      if (!seen.has(fp)) {
        removed++
        diff.removed.push(node.name)
        this.store.deleteNode(node.id)
      }
    }
    this.store.upsertNodes(upserts, sub.tags)
    if (sub.poolId > 0) {
      const all = this.store.nodesBySource(source)
      const importedIds = new Set([...existing.values()].map((node) => node.id))
      const manual = this.store.poolNodes(sub.poolId).filter((nid) => !importedIds.has(nid))
      this.store.setPoolNodes(sub.poolId, [...new Set([...manual, ...all.map((n) => n.id)])])
    }
    this.store.setSubscriptionResult(id, added, removed, changed, JSON.stringify(diff), '')
    await this.reload()
    this.emit({ type: 'subscription_refreshed', pool_id: sub.poolId, message: `${sub.name}: +${added} -${removed} ~${changed}` })
    return { added, removed, changed, issues: parsed.issues, diff }
  }

  private async runSubscriptions(): Promise<void> {
    for (const sub of this.store.subscriptions()) {
      if (!sub.enabled) continue
      const interval = Math.max(300, sub.intervalSeconds) * 1000
      if (sub.lastFetchAt > 0 && Date.now() - sub.lastFetchAt * 1000 < interval) continue
      try {
        await this.refreshSubscription(sub.id)
      } catch (error) {
        console.error(`[egress] 订阅 ${sub.name} 刷新失败:`, (error as Error).message)
      }
    }
  }

  // ---------- views ----------

  state(): Record<string, unknown> {
    const nodes = [...this.nodes.values()].map((state) => ({
      id: state.node.id,
      name: state.node.name,
      protocol: state.node.protocol,
      server: state.node.server,
      port: state.node.port,
      tags: state.node.tags,
      weight: state.node.weight,
      max_conns: state.node.maxConns,
      enabled: state.node.enabled,
      egress_ip: state.node.egressIp || undefined,
      note: state.node.note || undefined,
      source: state.node.source || undefined,
      config: state.node.config,
      state: state.health.state,
      latency_ms: state.health.latencyMs,
      requests: state.requests,
      failures: state.failures,
      inflight: state.inflight,
      success_rate: state.requests ? (state.requests - state.failures) / state.requests : 1
    }))
    const pools = [...this.pools.values()].map((pool) => ({
      id: pool.pool.id,
      name: pool.pool.name,
      strategy: pool.pool.strategy,
      mode_default: pool.pool.modeDefault,
      fallback: pool.pool.fallback,
      fanout_k: pool.pool.fanoutK,
      max_conns: pool.pool.maxConns,
      health_url: pool.pool.healthUrl,
      ip_probe_url: pool.pool.ipProbeUrl,
      check_interval: pool.pool.checkSeconds,
      sticky_ttl: pool.pool.stickyTtl,
      note: pool.pool.note,
      node_count: pool.nodes.length,
      healthy_count: pool.nodes.filter((n) => n.health.state === 'up').length,
      members: pool.nodes.map((n) => n.node.id)
    }))
    const sessions = [...this.sessions.values()]
      .filter((session) => !session.spec.key.startsWith('internal-'))
      .map((session) => ({
        session: session.spec.key,
        task_id: session.spec.taskId ?? 0,
        role: session.spec.role ?? '',
        pool_id: this.poolIdFor(session),
        pool_name: this.pools.get(this.poolIdFor(session))?.pool.name ?? '',
        mode: session.spec.mode,
        fallback: session.spec.fallback,
        node_id: session.lease?.nodeId,
        node_name: session.lease ? this.nodes.get(session.lease.nodeId)?.node.name : undefined,
        expires_at: session.lease ? new Date(session.lease.expires).toISOString() : undefined,
        requests: session.counters.requests,
        failures: session.counters.failures,
        last_error: session.counters.lastError || undefined
      }))
    return {
      enabled: true,
      gateway: this.gatewayAddress(),
      socks: this.socksAddress(),
      recordings: 0,
      engine: { available: this.engine.available, error: this.engine.error || null },
      default_pool: this.settings.defaultPool,
      pools,
      nodes,
      sessions
    }
  }

  gatewayAddress(): string {
    return this.gatewayPort ? `127.0.0.1:${this.gatewayPort}` : ''
  }

  socksAddress(): string {
    return this.socksPort ? `127.0.0.1:${this.socksPort}` : ''
  }

  setGatewayPorts(http?: number, socks?: number): void {
    if (http) this.gatewayPort = http
    if (socks) this.socksPort = socks
  }

  setDefaultPool(id: number): void {
    this.settings.defaultPool = id
    this.store.saveSettings({ defaultPool: id })
  }

  setListenerAuth(on: boolean): void {
    this.settings.listenerAuth = on
    this.store.saveSettings({ listenerAuth: on })
  }

  fanoutRemaining(taskId: number): number {
    const bucket = Math.floor(Date.now() / 3_600_000) * 3600
    return Math.max(0, FANOUT_BUDGET_PER_HOUR - this.store.fanoutUsed(taskId, bucket))
  }

  // ---------- internals ----------

  private gatewayPort?: number
  private socksPort?: number

  private poolIdFor(session: Session): number {
    if (session.spec.poolId && session.spec.poolId > 0) return session.spec.poolId
    const taskId = session.spec.taskId ?? 0
    const binding = this.bindings.get(taskId)
    if (binding) return binding.poolId
    return this.settings.defaultPool
  }

  private fallbackOf(session: Session): Fallback {
    if (session.spec.fallback) return session.spec.fallback
    const binding = this.bindings.get(session.spec.taskId ?? 0)
    return binding?.fallback ?? 'block'
  }

  private report(state: NodeState, ok: boolean, latency: number, error?: Error): void {
    const previous = state.health.state
    if (ok) {
      state.failures = 0
      state.health = {
        ...state.health,
        state: 'up',
        failStreak: 0,
        latencyMs: latency,
        checkedAt: Date.now(),
        cooldownUntil: 0,
        successRate: 1
      }
      state.latencyEw = state.latencyEw ? state.latencyEw * 0.7 + latency * 0.3 : latency
    } else {
      state.failures++
      state.health.failStreak++
      if (error) state.health.lastError = error.message.slice(0, 200)
      if (state.health.failStreak >= 3) {
        const backoff = Math.min(300_000, 2000 * 2 ** Math.min(state.health.failStreak - 3, 7))
        state.health.state = 'cooldown'
        state.health.cooldownUntil = Date.now() + backoff
      } else {
        state.health.state = 'degraded'
      }
    }
    if (previous !== state.health.state) {
      this.emit({ type: 'node_health', node_id: state.node.id, state: state.health.state, message: state.health.lastError })
      this.store.saveHealth(state.health)
    }
  }

  private note(
    session: Session,
    state: NodeState,
    ok: boolean,
    status: number,
    bytesIn: number,
    bytesOut: number,
    latency: number,
    error?: Error
  ): void {
    session.counters.requests++
    state.requests++
    if (!ok) {
      session.counters.failures++
      session.counters.lastError = (error?.message ?? `HTTP ${status}`).slice(0, 200)
    }
    session.counters.recent.push({
      at: Date.now(),
      nodeId: state.node.id,
      ok,
      status,
      ms: latency,
      bytesIn,
      bytesOut,
      error: error?.message
    })
    if (session.counters.recent.length > 10) session.counters.recent.shift()
    this.store.addUsage(session.spec.taskId ?? 0, state.node.id, 1, ok ? 0 : 1, bytesIn, bytesOut)
  }

  private consumeFanout(taskId: number, want: number): number {
    if (taskId <= 0) return want
    const bucket = Math.floor(Date.now() / 3_600_000) * 3600
    const used = this.store.fanoutUsed(taskId, bucket)
    const remaining = FANOUT_BUDGET_PER_HOUR - used
    if (remaining <= 0) return 0
    const allowed = Math.min(want, remaining)
    this.store.addFanout(taskId, bucket, allowed)
    return allowed
  }

  private rankForHost(host: string, nodes: NodeState[]): NodeState[] {
    if (!host) return nodes
    const memory = this.hostMemory.get(host) ?? {
      prefer: new Map<number, number>(),
      blocked: new Map<number, number>()
    }
    this.hostMemory.set(host, memory)
    const now = Date.now()
    const score = (id: number): number => {
      if ((memory.prefer.get(id) ?? 0) > now) return -1
      if ((memory.blocked.get(id) ?? 0) > now) return 1
      return 0
    }
    const ranked = [...nodes].sort((a, b) => score(a.node.id) - score(b.node.id))
    const usable = ranked.filter((state) => score(state.node.id) !== 1)
    return usable.length ? usable : ranked
  }

  private rememberHost(host: string, winner: number, attempts: FanoutAttemptResult[]): void {
    if (!host || attempts.length === 0) return
    const memory = this.hostMemory.get(host) ?? {
      prefer: new Map<number, number>(),
      blocked: new Map<number, number>()
    }
    const now = Date.now()
    for (const attempt of attempts) {
      if (attempt.verdict === 'block') memory.blocked.set(attempt.node_id, now + 30 * 60_000)
      else if (attempt.verdict === 'pass' && attempt.node_id === winner) memory.prefer.set(attempt.node_id, now + 3_600_000)
    }
    this.hostMemory.set(host, memory)
  }

  private evictIdleSessions(): void {
    const cutoff = Date.now() - SESSION_IDLE_MS
    for (const [key, session] of this.sessions) {
      if (key.startsWith('internal-') || key.startsWith('global-')) continue
      if (session.lastSeen < cutoff) this.sessions.delete(key)
    }
  }

  private emit(event: Record<string, unknown>): void {
    this.events.emit('event', { at: new Date().toISOString(), ...event })
  }
}

export class EgressError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, status: number, message: string) {
    super(message)
    this.code = code
    this.status = status
  }
}

// ---------- shared helpers ----------

export function sanitizeKey(key: string): string {
  return key.trim().replaceAll(':', '-').replaceAll('@', '-').replaceAll('/', '-').replaceAll(' ', '-')
}

function normalizeMode(mode: string): Mode {
  return mode === 'rotate' || mode === 'fanout' ? mode : 'sticky'
}

function normalizeFallback(value: string): Fallback {
  return value === 'direct' ? 'direct' : 'block'
}

function pickWeighted(nodes: NodeState[], strategy: string): NodeState | undefined {
  if (nodes.length === 0) return undefined
  if (strategy === 'failover') return nodes[0]
  const weights = nodes.map((state) => {
    const latency = state.latencyEw || 400
    const success = state.requests ? (state.requests - state.failures) / state.requests : 1
    const penalty = Math.min(state.health.failStreak * 0.15, 0.6)
    return Math.max(0.01, 0.5 * (1 / (1 + latency / 1000)) + 0.35 * success + 0.15 * Math.min(state.node.weight / 10, 1) - penalty)
  })
  const total = weights.reduce((sum, w) => sum + w, 0)
  let roll = Math.random() * total
  for (let i = 0; i < nodes.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return nodes[i]
  }
  return nodes[nodes.length - 1]
}

export function defaultVerdict(status: number, body: string): 'pass' | 'block' | 'unknown' {
  if (status === 403 || status === 429 || status === 503) return 'block'
  const lower = body.slice(0, 4096).toLowerCase()
  for (const marker of [
    'just a moment',
    'attention required',
    'access denied',
    'cf-challenge',
    'captcha-delivery',
    'checking your browser',
    'request blocked'
  ]) {
    if (lower.includes(marker)) return 'block'
  }
  if (status >= 200 && status < 400) return 'pass'
  return 'unknown'
}

/** 在已连通的 socket 上发一个 HTTP 请求并读完响应（fanout/健康探测共用）。 */
export async function httpRequest(
  socket: Dialed,
  target: URL,
  method: string,
  headers: Record<string, string>,
  body?: string
): Promise<{ status: number; header: Record<string, string>; body: string }> {
  const path = `${target.pathname || '/'}${target.search}`
  const lines = [`${method} ${path} HTTP/1.1`, `Host: ${target.host}`, 'Connection: close']
  for (const [key, value] of Object.entries(headers)) lines.push(`${key}: ${value}`)
  if (!headers['User-Agent'] && !headers['user-agent']) lines.push('User-Agent: Mozilla/5.0 (compatible; VEXNAR/egress)')
  if (body) lines.push(`Content-Length: ${Buffer.byteLength(body)}`)
  lines.push('', '')
  socket.write(lines.join('\r\n') + (body ?? ''))

  const chunks: Buffer[] = []
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('响应超时'))
    }, 30_000)
    const onData = (chunk: Buffer) => chunks.push(chunk)
    socket.on('data', onData)
    socket.once('end', () => {
      clearTimeout(timer)
      const raw = Buffer.concat(chunks).toString('latin1')
      const split = raw.indexOf('\r\n\r\n')
      const head = split >= 0 ? raw.slice(0, split) : raw
      const status = Number(head.split(' ')[1] ?? 0)
      const header: Record<string, string> = {}
      for (const line of head.split('\r\n').slice(1)) {
        const index = line.indexOf(':')
        if (index > 0) header[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim()
      }
      const payload = Buffer.from(split >= 0 ? raw.slice(split + 4) : '', 'latin1')
      const final = (header['transfer-encoding'] ?? '').toLowerCase().includes('chunked') ? dechunk(payload) : payload
      resolve({ status, header, body: final.toString('utf8') })
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function httpProbe(socket: Dialed, target: URL): Promise<number> {
  const response = await httpRequest(socket, target, 'GET', {})
  return response.status
}

function dechunk(input: Buffer): Buffer {
  const out: Buffer[] = []
  let offset = 0
  while (offset < input.length) {
    const lineEnd = input.indexOf('\r\n', offset)
    if (lineEnd < 0) break
    const size = Number.parseInt(input.subarray(offset, lineEnd).toString('latin1').split(';')[0], 16)
    if (!Number.isFinite(size) || size === 0) break
    const start = lineEnd + 2
    out.push(input.subarray(start, start + size))
    offset = start + size + 2
  }
  return Buffer.concat(out)
}

/** 订阅拉取：仅 http/https、25s、8MB、非 2xx 报错。 */
export async function fetchSubscription(url: string): Promise<string> {
  const trimmed = (url ?? '').trim()
  if (!/^https?:\/\//i.test(trimmed)) throw new Error('订阅 URL 只允许 http/https')
  const response = await fetch(trimmed, {
    headers: { 'user-agent': 'vexnar/egress' },
    signal: AbortSignal.timeout(25_000),
    redirect: 'error'
  })
  if (!response.ok) throw new Error(`订阅返回 HTTP ${response.status}`)
  const reader = response.body?.getReader()
  if (!reader) throw new Error('订阅响应为空')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 8 << 20) {
      await reader.cancel()
      throw new Error('订阅内容超过 8MB')
    }
    chunks.push(value)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text.trim()) throw new Error('订阅内容为空')
  return text
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(0, limit)
}

// 供调试/测试使用的稳定指纹别名。
export { fingerprint }
export type { Pool, Subscription, StoredNode, PoolState }
