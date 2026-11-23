// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Session-aware HTTP Testing Engine（第二～五层的编排者）。
 *
 * 它把五层串成一条确定性流水线：
 *   Policy Gate（policy.ts）→ Session Manager（vault.ts + 本文件）
 *   → Scheduler/Transport（本文件队列 + transport.ts）
 *   → Response Observer（analyzer.ts 分类/特征）→ Evidence Store（store.ts）
 *
 * 三条不可让渡的行为约束：
 *   1. **串行**：同一会话的请求排队执行，不并发打同一个站点；
 *   2. **可停**：429/挑战页立刻把会话置 blocked，不换载荷、不换出口继续试；
 *   3. **可回溯**：每条记录带 requestId / testCaseId / parentRequestId / sequence，
 *      正文只以密文落库，记录里只有 hash 与脱敏头部。
 */

import { createHash, randomBytes } from 'node:crypto'
import { join } from 'node:path'

import { AesGcmBox } from './crypto-box.ts'
import {
  classifyResponse, detectWafMarkers, diffExchanges, excerptOf, extractJsonKeys,
  extractStructure, looksLikeHtml, looksLikeJson, redactHeaders, redactUrl
} from './analyzer.ts'
import {
  PolicyError, assertAdversarialAllowed, checkRequest, checkSessionUsable, defaultPolicy, isOriginAllowed, normalizeOrigin
} from './policy.ts'
import { DEFAULT_LIMITS, decide, describeAction, initialPlan } from './adversarial.ts'
import { EgressPool, type EgressEntry } from './egress.ts'
import { identities, identityAt, identityById, mergeIdentityHeaders } from './identity.ts'
import { tamperRequest } from './tamper.ts'
import { WebStore, type StoredExchange } from './store.ts'
import { SessionTransport, type FetchLike } from './transport.ts'
import type {
  AnalyzeResult, Classification, EvidenceRef, ExchangeOutcome, PolicyConfig, RequestInput,
  ResponseSignals, SessionCreateInput, SessionStatus, WebTestSession
} from './types.ts'
import { SessionVault, isSensitiveHeader } from './vault.ts'

interface SentResponse {
  status: number
  headers: Record<string, string>
  body: Buffer
  bytes: number
  truncated: boolean
  durationMs: number
  hops: string[]
}

interface EvidenceInput {
  ref: string
  kind: 'request' | 'response' | 'extract'
  hash: string
  bytes: number
  truncated: boolean
  body: Buffer
}

const DEDUPE_WINDOW_SECONDS = 300
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])
const HOP_HEADERS = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'content-length'])

export interface EngineOptions {
  /** 数据根目录：SQLite、vault.key 都在这里。 */
  root: string
  policy?: Partial<PolicyConfig>
  /** 测试注入（undici MockAgent 或自定义 fetch）。 */
  fetchImpl?: FetchLike
  log?: (message: string) => void
}

export class WebTestingEngine {
  readonly store: WebStore
  readonly vault: SessionVault
  readonly policy: PolicyConfig
  private readonly box: AesGcmBox
  private readonly transports = new Map<string, SessionTransport>()
  private readonly egress = new EgressPool()
  private readonly queues = new Map<string, Promise<unknown>>()
  private readonly window = new Map<string, number[]>()
  private readonly intervalFactor = new Map<string, number>()
  private closed = false

  constructor(private readonly options: EngineOptions) {
    this.box = new AesGcmBox(options.root)
    this.store = new WebStore(join(options.root, 'web.sqlite'), this.box)
    this.vault = new SessionVault(this.box, this.store)
    this.policy = { ...defaultPolicy(), ...(options.policy ?? {}) }
  }

  private log(message: string): void {
    this.options.log?.(message)
  }

  // ── 会话 ────────────────────────────────────────────────────────────────
  async createSession(input: SessionCreateInput, agentSession = 'local'): Promise<{ session: WebTestSession; policy: PolicyConfig }> {
    if (this.closed) throw new PolicyError('BAD_REQUEST', '引擎已关闭', 409)
    const origin = normalizeOrigin(input.origin)
    if (!isOriginAllowed(origin, this.policy)) {
      throw new PolicyError('OUT_OF_SCOPE', `目标 ${origin} 不在授权 origin 白名单内（VEXNAR_WEB_ALLOWED_ORIGINS）`, 403)
    }
    const profile = input.authProfileId ? this.profile(input.authProfileId) : null
    if (input.authProfileId && !profile) {
      throw new PolicyError('BAD_REQUEST', `auth_profile_id "${input.authProfileId}" 未在 VEXNAR_WEB_PROFILES 中定义`, 400)
    }
    const sessionId = `ws-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
    const now = Date.now() / 1000
    const budget = Math.min(
      Math.max(1, Number(input.requestBudget ?? this.policy.maxRequestsPerSession)),
      this.policy.maxRequestsPerSession
    )
    const adversarial = Boolean(input.adversarial)
    if (adversarial) assertAdversarialAllowed({ requested: true, policy: this.policy, origin })
    const session: WebTestSession = {
      sessionId,
      adversarial,
      scopeId: String(input.scopeId ?? agentSession),
      origin,
      label: String(input.label ?? origin).slice(0, 120),
      authProfileId: String(input.authProfileId ?? ''),
      status: 'active',
      requestCount: 0,
      requestBudget: budget,
      createdAt: now,
      updatedAt: now,
      lastRequestAt: 0,
      meta: { agentSession, userAgent: 'Authorized-Web-Test/1.0' }
    }
    this.store.putSession(session, agentSession)
    // 身份来自 profile 或显式 auth；两者都只进 Vault，不进任何返回值。
    this.vault.seed(sessionId, { ...(profile?.headers ?? {}), ...(input.auth ?? {}) })
    this.store.recordPolicyEvent(
      sessionId, 'session_created',
      `origin=${origin} budget=${budget} adversarial=${adversarial} egress=${this.policy.egressMode}`
    )
    return { session, policy: this.policy }
  }

  private profile(id: string): { headers: Record<string, string> } | null {
    const raw = process.env.VEXNAR_WEB_PROFILES
    if (!raw) return null
    try {
      const table = JSON.parse(raw) as Record<string, { headers?: Record<string, string> }>
      const entry = table[id]
      return entry ? { headers: entry.headers ?? {} } : null
    } catch {
      return null
    }
  }

  private owned(sessionId: string, agentSession: string): WebTestSession & { agentSession: string } {
    const session = this.store.getSession(sessionId)
    if (!session) throw new PolicyError('BAD_REQUEST', `会话不存在：${sessionId}`, 404)
    if (agentSession !== 'local' && session.agentSession && session.agentSession !== agentSession) {
      throw new PolicyError('OUT_OF_SCOPE', `会话 ${sessionId} 属于另一个 Harness 会话，不能跨会话操作`, 403)
    }
    return session
  }

  listSessions(agentSession = 'local'): WebTestSession[] {
    return this.store.listSessions(agentSession === 'local' ? undefined : agentSession)
  }

  // ── 执行 ────────────────────────────────────────────────────────────────
  async execute(sessionId: string, input: RequestInput, agentSession = 'local'): Promise<ExchangeOutcome> {
    const session = this.owned(sessionId, agentSession)
    const method = String(input.method ?? 'GET').toUpperCase()
    let url: URL
    try {
      url = new URL(input.path, session.origin)
    } catch {
      throw new PolicyError('BAD_REQUEST', `path 无法解析：${input.path}`, 400)
    }
    // 范围检查在发出前做，重定向每一跳再做一次（见下）。
    if (url.origin !== session.origin) {
      this.store.recordPolicyEvent(sessionId, 'out_of_scope', `${method} ${url.origin}`)
      throw new PolicyError('OUT_OF_SCOPE', `目标 ${url.origin} 与会话授权 origin ${session.origin} 不一致`, 403)
    }

    const window = this.pruneWindow(sessionId)
    checkRequest({ policy: this.policy, session, input, windowCount: window.length })

    const queued = (this.queues.get(sessionId) ?? Promise.resolve()).then(
      () => this.perform(session, input, method, url),
      () => this.perform(session, input, method, url)
    )
    this.queues.set(sessionId, queued.then(() => undefined, () => undefined))
    return queued
  }

  private async perform(session: WebTestSession & { agentSession: string }, input: RequestInput, method: string, url: URL): Promise<ExchangeOutcome> {
    const sessionId = session.sessionId
    const testCaseId = String(input.testCaseId ?? '')
    // 队列是串行的，但进入队列那一刻读到的 session 可能已过期：进队后重读一次。
    const fresh = this.store.getSession(sessionId) ?? session
    const sequence = fresh.requestCount + 1
    const startedAt = Date.now() / 1000
    const adversarial = Boolean(input.evade ?? session.adversarial)
    if (adversarial) assertAdversarialAllowed({ requested: true, policy: this.policy, origin: session.origin })

    // 去重只对"非对抗的只读请求"生效：变异过的请求不是一个用例，复用会掩盖结论。
    if (!adversarial && (method === 'GET' || method === 'HEAD') && !input.aggressive) {
      const reusable = this.store.findReusable(sessionId, method, url.toString(), startedAt - DEDUPE_WINDOW_SECONDS)
      if (reusable) return this.reuse(session, reusable, input, sequence)
    }

    const limits = this.policy.adversarial
    const baseRequestId = `rq-${sessionId.slice(3)}-${String(sequence).padStart(4, '0')}`
    const maxAttempts = adversarial ? Math.max(1, limits.maxAttempts) : 1
    let plan = initialPlan()
    // 非对抗模式保持诚实 UA；对抗模式才从"看起来像浏览器"的身份起步。
    plan.identityIndex = adversarial
      ? 0
      : Math.max(0, identities().findIndex((item) => item.id === (identityById('api-client')?.id ?? 'api-client')))
    const actions: string[] = []
    let stoppedReason = ''
    let outcome: ExchangeOutcome | null = null
    let lastRecord: StoredExchange | null = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const requestId = attempt === 1 ? baseRequestId : `${baseRequestId}-a${attempt}`
      const identity = identityAt(plan.identityIndex)
      const egressEntry = this.egress.choose(plan.egressIndex)
      const prepared = tamperRequest({
        path: `${url.pathname}${url.search}`,
        body: input.body,
        headers: mergeIdentityHeaders(identity, input.headers ?? {}),
        mutation: plan.mutation,
        seed: hashSeed(requestId)
      })
      const attemptUrl = new URL(prepared.path, session.origin)
      if (attemptUrl.origin !== session.origin) {
        throw new PolicyError('OUT_OF_SCOPE', `变异后目标 ${attemptUrl.origin} 超出授权范围`, 403)
      }
      const headers = await this.buildHeaders(session, attemptUrl, prepared.headers, prepared.body ?? '')
      const transport = this.transportFor(sessionId, egressEntry)
      this.egress.noteRequest(egressEntry)
      await this.waitTurn(sessionId, session)

      let sent: SentResponse
      try {
        sent = await this.sendWithRedirects({ session, input, method, url: attemptUrl, headers, body: prepared.body, transport })
        this.egress.noteResult(egressEntry, true)
      } catch (error) {
        this.egress.noteResult(egressEntry, false)
        this.store.recordPolicyEvent(sessionId, 'transport_failed', `${egressEntry.id}: ${(error as Error).message}`)
        if (!adversarial || attempt >= maxAttempts) throw error
        // 传输层失败也走升级（换出口往往就能通），但不产生交换记录。
        const decision = decide(plan, 'unknown', limits, { egressCount: this.egress.size, identityCount: identities().length })
        if (decision.action === 'stop') throw error
        actions.push(`${describeAction(decision.action)}（传输失败：${(error as Error).message}）`)
        plan = decision.plan
        if (decision.waitMs > 0) await sleep(decision.waitMs)
        continue
      }

      const bodyText = sent.body.subarray(0, 20_000).toString('utf8')
      const wafMarkers = detectWafMarkers(sent.headers, bodyText)
      const classification = classifyResponse({ status: sent.status, headers: sent.headers, bodyText, wafMarkers })
      const built = this.makeRecord({
        session, input, method, url: attemptUrl, requestId, sequence, attempt, startedAt,
        latencyMs: sent.durationMs, status: sent.status, classification, headers, body: prepared.body,
        response: sent, wafMarkers, mutation: prepared.applied, egressId: egressEntry.id, identityId: identity.id
      })
      lastRecord = built.record
      this.store.addExchange(built.record, built.evidence)
      outcome = this.outcomeOf(lastRecord, sent.body, classification, actions, stoppedReason, attempt, adversarial)
      this.log(`[web] ${requestId} ${method} ${attemptUrl.pathname} → ${sent.status} ${classification} ${sent.durationMs}ms`
        + `${adversarial ? ` attempt=${attempt} mutation=${prepared.applied} egress=${egressEntry.id} identity=${identity.id}` : ''}`)

      if (!adversarial) {
        if (classification === 'rate_limited' || classification === 'waf_blocked') this.block(sessionId, classification, sent.status, wafMarkers)
        break
      }
      // 已经通过就没有"升级"可言：直接收工，不写一条"因正常而停止"的噪声事件。
      if (classification === 'normal') break

      const decision = decide(plan, classification, limits, {
        egressCount: this.egress.size,
        identityCount: identities().length
      }, retryAfterMs(sent.headers))
      if (decision.action === 'stop') {
        stoppedReason = decision.reason
        this.store.recordPolicyEvent(sessionId, 'evasion_stopped', `${classification} → ${decision.reason}`)
        if (classification === 'rate_limited' || classification === 'waf_blocked') this.block(sessionId, classification, sent.status, wafMarkers)
        break
      }
      actions.push(describeAction(decision.action))
      this.store.recordPolicyEvent(sessionId, `evasion_${decision.action}`, `${classification} → ${decision.reason}`)
      plan = decision.plan
      if (decision.action === 'retry_identity') await this.vault.resetCookies(sessionId)
      if (decision.waitMs > 0) await sleep(decision.waitMs)
    }

    if (!outcome) throw new PolicyError('BAD_REQUEST', '请求未产生任何记录（全部尝试在传输层失败）', 502)
    // 熔断/预算是在记录生成之后发生的：返回前按最终会话状态回填，避免给出"还没停"的假象。
    const finalSession = this.store.getSession(sessionId)!
    return {
      ...outcome,
      attempts: outcome.attempts,
      budgetLeft: Math.max(0, Math.min(finalSession.requestBudget, this.policy.maxRequestsPerSession) - finalSession.requestCount),
      paused: finalSession.status === 'blocked',
      evasion: adversarial ? { rotations: plan.rotations, actions, stoppedReason } : undefined
    }
  }

  /** 一次尝试的记录构造：字段全部脱敏，证据单独存。 */
  private makeRecord(options: {
    session: WebTestSession
    input: RequestInput
    method: string
    url: URL
    requestId: string
    sequence: number
    attempt: number
    startedAt: number
    latencyMs: number
    status: number
    classification: Classification
    headers: Record<string, string>
    body?: string
    response: SentResponse
    wafMarkers: string[]
    mutation: string
    egressId: string
    identityId: string
  }): { record: StoredExchange; evidence: EvidenceInput[] } {
    const { session, input, method, url, requestId, sequence, attempt, startedAt, response } = options
    const contentType = String(response.headers['content-type'] ?? '')
    const bodyText = response.body.toString('utf8')
    const structure = looksLikeHtml(contentType, response.body) ? extractStructure(bodyText, url.toString()) : null
    const responseHash = sha256(response.body)
    const requestBody = options.body ?? ''
    const requestHash = requestBody ? sha256(requestBody) : ''
    const evidence: EvidenceInput[] = [
      { ref: `ev-${requestId}-req`, kind: 'request', hash: requestHash || sha256(''), bytes: Buffer.byteLength(requestBody), truncated: false, body: Buffer.from(requestBody, 'utf8') },
      { ref: `ev-${requestId}-resp`, kind: 'response', hash: responseHash, bytes: response.bytes, truncated: response.truncated, body: response.body }
    ]
    const parentRequestId = attempt > 1 ? options.requestId.replace(/-a\d+$/, '') : input.parentRequestId
    const record: StoredExchange = {
      sessionId: session.sessionId,
      testCaseId: String(input.testCaseId ?? ''),
      requestId,
      ...(parentRequestId ? { parentRequestId } : {}),
      sequence,
      attempt,
      mutation: options.mutation,
      egressId: options.egressId,
      identityId: options.identityId,
      method,
      url: redactUrl(url.toString()),
      path: `${url.pathname}${url.search}`,
      host: url.host,
      status: options.status,
      classification: options.classification,
      durationMs: options.latencyMs,
      requestHeaders: redactHeaders(options.headers),
      requestBodyHash: requestHash || undefined,
      requestBytes: Buffer.byteLength(requestBody),
      responseHeaders: redactHeaders(response.headers),
      responseBodyHash: responseHash,
      responseBytes: response.bytes,
      contentType,
      truncated: response.truncated,
      title: structure?.title ?? '',
      deduplicated: false,
      timestamp: startedAt,
      note: [input.note, response.hops.length ? `redirects=${response.hops.length}` : '', attempt > 1 ? `attempt=${attempt}` : '']
        .filter(Boolean).join('; '),
      evidence: evidence.map(({ ref, kind, hash, bytes, truncated }) => ({ ref, kind: kind as 'request' | 'response', hash, bytes, stored: true, truncated }))
    }
    return { record, evidence }
  }

  /** 组装对外结果：片段 + 结构信号 + 预算。 */
  private outcomeOf(
    record: StoredExchange,
    body: Buffer,
    classification: Classification,
    actions: string[],
    stoppedReason: string,
    attempts: number,
    adversarial: boolean
  ): ExchangeOutcome {
    const structure = looksLikeHtml(record.contentType, body) ? extractStructure(body.toString('utf8'), record.url) : null
    const updated = this.store.getSession(record.sessionId)!
    return {
      record,
      attempts,
      excerpt: excerptOf(body, record.contentType),
      signals: {
        contentType: record.contentType,
        title: structure?.title ?? record.title,
        forms: structure?.forms.length ?? 0,
        links: structure?.links.length ?? 0,
        scripts: structure?.scripts.length ?? 0,
        jsonKeys: looksLikeJson(record.contentType, body) ? extractJsonKeys(body) : [],
        wafMarkers: detectWafMarkers(record.responseHeaders, body.toString('utf8')),
        serverTech: [record.responseHeaders['server']].filter(Boolean) as string[],
        setCookieNames: parseCookieNames(record.responseHeaders),
        redirectTo: ''
      },
      budgetLeft: Math.max(0, Math.min(updated.requestBudget, this.policy.maxRequestsPerSession) - updated.requestCount),
      paused: updated.status === 'blocked',
      evasion: adversarial ? { rotations: actions.length, actions, stoppedReason } : undefined
    } as ExchangeOutcome
  }

  /** 发送 + 同源重定向逐跳复查（每一跳都计入预算与窗口）。 */
  private async sendWithRedirects(options: {
    session: WebTestSession & { agentSession: string }
    input: RequestInput
    method: string
    url: URL
    headers: Record<string, string>
    body?: string
    transport: SessionTransport
  }): Promise<SentResponse> {
    const { session, input, transport } = options
    const sessionId = session.sessionId
    let currentUrl = options.url
    let currentMethod = options.method
    let currentBody = options.body
    const hops: string[] = []
    let status = 0
    let headers: Record<string, string> = {}
    let body: Buffer = Buffer.alloc(0)
    let bytes = 0
    let truncated = false
    let durationMs = 0

    for (let hop = 0; hop <= this.policy.maxRedirects; hop++) {
      const live = this.store.getSession(sessionId) ?? session
      const windowRows = this.pruneWindow(sessionId)
      checkRequest({ policy: this.policy, session: live, input: { ...input, method: currentMethod as RequestInput['method'] }, windowCount: windowRows.length })
      if (currentUrl.origin !== session.origin) {
        this.store.recordPolicyEvent(sessionId, 'redirect_blocked', currentUrl.toString())
        throw new PolicyError('OUT_OF_SCOPE', `重定向目标 ${currentUrl.origin} 超出授权范围，已阻断`, 403)
      }
      const response = await transport.request({
        url: currentUrl.toString(),
        method: currentMethod,
        headers: options.headers,
        body: currentBody,
        timeoutMs: this.policy.requestTimeoutMs,
        maxBytes: this.policy.maxResponseBytes
      })
      durationMs += response.durationMs
      await this.vault.storeSetCookie(sessionId, currentUrl.toString(), response.setCookie)
      this.bumpBudget(sessionId)
      status = response.status
      headers = response.headers
      body = response.body
      bytes = response.bytes
      truncated = response.truncated
      const location = response.location
      const followable = REDIRECT_STATUS.has(status) && location !== '' && this.policy.followRedirects === 'same-origin'
      if (!followable) break
      const next = new URL(location, currentUrl)
      if (next.origin !== session.origin) {
        this.store.recordPolicyEvent(sessionId, 'redirect_blocked', `${currentUrl} → ${next.origin}`)
        break
      }
      hops.push(next.toString())
      if (status === 303 || ((status === 301 || status === 302) && currentMethod === 'POST')) {
        currentMethod = 'GET'
        currentBody = undefined
      }
      currentUrl = next
    }
    return { status, headers, body, bytes, truncated, durationMs, hops }
  }

  private block(sessionId: string, classification: Classification, status: number, markers: string[]): void {
    this.adjustInterval(sessionId, classification === 'rate_limited' ? 3 : 2)
    this.setStatus(sessionId, 'blocked')
    this.store.recordPolicyEvent(sessionId, classification, `${status} ${markers.join(',') || 'rate limit'}`)
  }

  private transportFor(sessionId: string, entry: EgressEntry): SessionTransport {
    const key = `${sessionId}|${entry.id}`
    const existing = this.transports.get(key)
    if (existing) return existing
    const created = new SessionTransport({
      allowPrivateNetwork: this.policy.allowPrivateNetwork,
      fetchImpl: this.options.fetchImpl,
      dispatcher: this.egress.dispatcher(entry)
    })
    this.transports.set(key, created)
    return created
  }
  /** 去重复用：不重复请求，创建一条指向原记录的新记录，保证 requestId 可追踪。 */
  private async reuse(
    session: WebTestSession & { agentSession: string },
    source: StoredExchange,
    input: RequestInput,
    sequence: number
  ): Promise<ExchangeOutcome> {
    const requestId = `rq-${session.sessionId.slice(3)}-${String(sequence).padStart(4, '0')}`
    this.bumpBudget(session.sessionId)
    const body = this.store.evidence(`ev-${source.requestId}-resp`)?.bytes ?? Buffer.alloc(0)
    const evidence = [
      { ref: `ev-${requestId}-req`, kind: 'request' as const, hash: source.requestBodyHash ?? '', bytes: source.requestBytes, stored: true, truncated: false },
      { ref: `ev-${requestId}-resp`, kind: 'response' as const, hash: source.responseBodyHash ?? '', bytes: source.responseBytes, stored: true, truncated: source.truncated }
    ]
    const record = {
      ...source,
      requestId,
      parentRequestId: source.requestId,
      sequence,
      attempt: 1,
      mutation: 'none',
      egressId: source.egressId || 'direct',
      identityId: source.identityId || 'api-client',
      deduplicated: true,
      durationMs: 0,
      timestamp: Date.now() / 1000,
      note: [input.note, 'deduplicated'].filter(Boolean).join('; '),
      evidence
    }
    // 复用记录不产生新证据正文：把原证据复制一份引用，保证 requestId → 证据仍可解。
    const original = this.store.evidence(`ev-${source.requestId}-resp`)
    const originalReq = this.store.evidence(`ev-${source.requestId}-req`)
    this.store.addExchange(record, [
      { ref: `ev-${requestId}-req`, kind: 'request', hash: originalReq?.hash ?? '', bytes: originalReq?.bytes.length ?? 0, truncated: false, body: originalReq?.bytes ?? Buffer.alloc(0) },
      { ref: `ev-${requestId}-resp`, kind: 'response', hash: original?.hash ?? '', bytes: original?.bytes.length ?? 0, truncated: original?.truncated ?? false, body: original?.bytes ?? Buffer.alloc(0) }
    ])
    const updated = this.store.getSession(session.sessionId)!
    const contentType = record.contentType
    const structure = looksLikeHtml(contentType, body) ? extractStructure(body.toString('utf8'), record.url) : null
    return {
      record,
      excerpt: excerptOf(body, contentType),
      signals: {
        contentType,
        title: structure?.title ?? record.title,
        forms: structure?.forms.length ?? 0,
        links: structure?.links.length ?? 0,
        scripts: structure?.scripts.length ?? 0,
        jsonKeys: looksLikeJson(contentType, body) ? extractJsonKeys(body) : [],
        wafMarkers: [],
        serverTech: [record.responseHeaders['server']].filter(Boolean) as string[],
        setCookieNames: parseCookieNames(record.responseHeaders),
        redirectTo: ''
      },
      budgetLeft: Math.max(0, Math.min(updated.requestBudget, this.policy.maxRequestsPerSession) - updated.requestCount),
      paused: updated.status === 'blocked',
      attempts: 1
    }
  }

  // ── 分析 ────────────────────────────────────────────────────────────────
  analyze(sessionId: string, requestId: string, options: { baselineRequestId?: string; mode?: 'structure' | 'diff' | 'auto' } = {}, agentSession = 'local'): AnalyzeResult {
    this.owned(sessionId, agentSession)
    const exchange = this.store.getExchange(requestId)
    if (!exchange || exchange.sessionId !== sessionId) {
      throw new PolicyError('BAD_REQUEST', `请求记录不存在：${requestId}`, 404)
    }
    const evidence = this.store.evidence(`ev-${requestId}-resp`)
    const body = evidence?.bytes ?? Buffer.alloc(0)
    const mode = options.mode === 'auto' || !options.mode
      ? (options.baselineRequestId ? 'diff' : 'structure')
      : options.mode

    if (mode === 'diff') {
      const baselineId = String(options.baselineRequestId ?? exchange.parentRequestId ?? '')
      if (!baselineId) throw new PolicyError('BAD_REQUEST', '差异分析需要 baseline_request_id（或候选记录自带 parent_request_id）', 400)
      const baseline = this.store.getExchange(baselineId)
      if (!baseline || baseline.sessionId !== sessionId) {
        throw new PolicyError('BAD_REQUEST', `基线记录不存在：${baselineId}`, 404)
      }
      const baselineBody = this.store.evidence(`ev-${baselineId}-resp`)?.bytes.toString('utf8') ?? ''
      const candidateBody = body.toString('utf8')
      const marker = markerOf(exchange)
      return {
        requestId,
        mode: 'diff',
        diff: diffExchanges({
          baseline,
          candidate: exchange,
          baselineBody,
          candidateBody,
          marker
        }),
        excerpt: excerptOf(body, exchange.contentType)
      }
    }

    const structure = looksLikeHtml(exchange.contentType, body)
      ? extractStructure(body.toString('utf8'), exchange.url)
      : {
          title: exchange.title,
          forms: [],
          links: [],
          scripts: [],
          jsonKeys: looksLikeJson(exchange.contentType, body) ? extractJsonKeys(body) : [],
          comments: []
        }
    return { requestId, mode: 'structure', structure, excerpt: excerptOf(body, exchange.contentType) }
  }

  /**
   * 对抗效果报告：把"拦截 → 升级 → 结果"摊平成可判读的矩阵。
   *
   * 这份报告是给**写测试报告的人**看的，不是给模型自我表扬的：
   * 它只回答三个可核验的问题——哪种编码过了、哪个出口过了、哪一轮放弃；
   * 不承诺"绕过成功"，也不把一次通过说成"WAF 无效"。
   */
  evasionReport(sessionId: string, options: { testCaseId?: string; limit?: number } = {}, agentSession = 'local') {
    const session = this.owned(sessionId, agentSession)
    const all = this.store.listExchanges(sessionId, Math.min(Math.max(options.limit ?? 300, 1), 500))
      .filter((row) => !options.testCaseId || row.testCaseId === options.testCaseId)
      .sort((left, right) => left.sequence - right.sequence || left.attempt - right.attempt)

    const groups = new Map<string, typeof all>()
    for (const row of all) {
      const base = row.requestId.replace(/-a\d+$/, '')
      const list = groups.get(base) ?? []
      list.push(row)
      groups.set(base, list)
    }

    const mutations = new Map<string, { attempts: number; passed: number }>()
    const egresses = new Map<string, { attempts: number; passed: number }>()
    const identities = new Map<string, { attempts: number; passed: number }>()
    const bump = (table: typeof mutations, key: string, passed: boolean) => {
      const entry = table.get(key) ?? { attempts: 0, passed: 0 }
      entry.attempts += 1
      if (passed) entry.passed += 1
      table.set(key, entry)
    }

    const logical: Array<{
      requestId: string
      path: string
      attempts: number
      first: string
      last: string
      mutations: string[]
      egresses: string[]
      identities: string[]
      escalated: boolean
      succeeded: boolean
    }> = []

    for (const [base, rows] of groups) {
      for (const row of rows) {
        const passed = row.classification === 'normal'
        bump(mutations, row.mutation || 'none', passed)
        bump(egresses, row.egressId || 'direct', passed)
        bump(identities, row.identityId || 'api-client', passed)
      }
      const first = rows[0]
      const last = rows[rows.length - 1]
      logical.push({
        requestId: base,
        path: first.path,
        attempts: rows.length,
        first: first.classification,
        last: last.classification,
        mutations: [...new Set(rows.map((row) => row.mutation).filter((item) => item !== 'none'))],
        egresses: [...new Set(rows.map((row) => row.egressId).filter(Boolean))],
        identities: [...new Set(rows.map((row) => row.identityId).filter(Boolean))],
        escalated: rows.length > 1,
        succeeded: last.classification === 'normal' && first.classification !== 'normal'
      })
    }

    const escalations = logical.filter((item) => item.escalated)
    const passedAfterEscalation = escalations.filter((item) => item.succeeded)
    const toTable = (table: typeof mutations) =>
      [...table.entries()].map(([key, value]) => ({ key, attempts: value.attempts, passed: value.passed }))

    return {
      session,
      adversarial: session.adversarial,
      egress_mode: this.policy.egressMode,
      limits: this.policy.adversarial,
      totals: {
        logical_requests: logical.length,
        attempts: all.length,
        escalated: escalations.length,
        passed_after_escalation: passedAfterEscalation.length,
        blocked_final: logical.filter((item) => item.last === 'waf_blocked' || item.last === 'rate_limited').length
      },
      mutations: toTable(mutations).sort((left, right) => right.passed - left.passed || right.attempts - left.attempts),
      egresses: toTable(egresses),
      identities: toTable(identities),
      escalations: escalations.slice(0, 20),
      policy_events: this.store.listPolicyEvents(sessionId, 40)
    }
  }

  // ── 查询与控制 ──────────────────────────────────────────────────────────
  inspect(sessionId: string, options: { limit?: number; requestId?: string } = {}, agentSession = 'local') {
    const session = this.owned(sessionId, agentSession)
    const history = this.store.listExchanges(sessionId, options.limit ?? 20, options.requestId)
    return {
      session,
      budgetLeft: Math.max(0, Math.min(session.requestBudget, this.policy.maxRequestsPerSession) - session.requestCount),
      stats: this.store.stats(sessionId),
      policyEvents: this.store.listPolicyEvents(sessionId, 20),
      history: history.map((row) => ({
        ...row,
        evidence: []
      }))
    }
  }

  control(sessionId: string, action: 'pause' | 'resume' | 'close' | 'reset_budget', options: { budget?: number } = {}, agentSession = 'local') {
    const session = this.owned(sessionId, agentSession)
    if (action === 'close') {
      this.setStatus(sessionId, 'closed')
      for (const [key, transport] of this.transports) {
        if (!key.startsWith(`${sessionId}|`)) continue
        void transport.close()
        this.transports.delete(key)
      }
      this.vault.drop(sessionId)
      this.store.recordPolicyEvent(sessionId, 'session_closed', 'by harness')
    } else if (action === 'pause') {
      if (session.status !== 'closed') this.setStatus(sessionId, 'paused')
      this.store.recordPolicyEvent(sessionId, 'session_paused', 'by harness')
    } else if (action === 'resume') {
      if (session.status === 'closed') throw new PolicyError('SESSION_CLOSED', '会话已关闭，不能 resume', 409)
      this.setStatus(sessionId, 'active')
      this.intervalFactor.delete(sessionId)
      this.store.recordPolicyEvent(sessionId, 'session_resumed', 'by harness')
    } else {
      const budget = Math.min(
        Math.max(1, Number(options.budget ?? session.requestBudget + this.policy.maxRequestsPerSession)),
        this.policy.maxRequestsPerSession
      )
      this.store.putSession({ ...session, requestBudget: budget, updatedAt: Date.now() / 1000 }, session.agentSession)
      this.store.recordPolicyEvent(sessionId, 'budget_reset', `budget=${budget}`)
    }
    return this.store.getSession(sessionId)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    for (const transport of this.transports.values()) await transport.close().catch(() => undefined)
    this.transports.clear()
    await this.egress.close()
    this.store.close()
  }

  // ── 内部工具 ────────────────────────────────────────────────────────────
  private async buildHeaders(session: WebTestSession, url: URL, extra: Record<string, string>, body: string): Promise<Record<string, string>> {
    await this.vault.primeCookies(session.sessionId, url.toString())
    const secrets = this.vault.secrets(session.sessionId)
    const headers: Record<string, string> = {
      'user-agent': 'Authorized-Web-Test/1.0',
      accept: 'text/html,application/json;q=0.9,*/*;q=0.5',
      'accept-encoding': 'gzip, deflate'
    }
    for (const [name, value] of Object.entries(secrets)) {
      if (name === 'cookie') continue
      headers[name] = value
    }
    const cookie = await this.vault.cookieHeader(session.sessionId, url.toString())
    if (cookie) headers.cookie = cookie
    for (const [name, value] of Object.entries(extra)) {
      const key = name.toLowerCase()
      if (HOP_HEADERS.has(key)) continue
      headers[key] = value
    }
    if (body && !headers['content-type']) headers['content-type'] = 'application/json'
    return headers
  }

  private waitTurn(sessionId: string, session: WebTestSession): Promise<void> {
    const factor = this.intervalFactor.get(sessionId) ?? 1
    const interval = Math.max(0, Math.round(this.policy.minIntervalMs * factor))
    const lastAt = (this.store.getSession(sessionId) ?? session).lastRequestAt
    const elapsed = Date.now() - lastAt * 1000
    const wait = interval - elapsed
    return wait > 0 ? new Promise((resolve) => setTimeout(resolve, wait)) : Promise.resolve()
  }

  private bumpBudget(sessionId: string): void {
    const session = this.store.getSession(sessionId)
    if (!session) return
    const now = Date.now() / 1000
    this.store.putSession(
      { ...session, requestCount: session.requestCount + 1, lastRequestAt: now, updatedAt: now },
      session.agentSession
    )
    const stamps = this.window.get(sessionId) ?? []
    stamps.push(now)
    this.window.set(sessionId, stamps)
  }

  private pruneWindow(sessionId: string): number[] {
    const cutoff = Date.now() / 1000 - this.policy.windowSeconds
    const stamps = (this.window.get(sessionId) ?? []).filter((ts) => ts >= cutoff)
    this.window.set(sessionId, stamps)
    return stamps
  }

  private adjustInterval(sessionId: string, factor: number): void {
    const current = this.intervalFactor.get(sessionId) ?? 1
    this.intervalFactor.set(sessionId, Math.min(5, Math.max(current, factor)))
  }

  private setStatus(sessionId: string, status: SessionStatus): void {
    const session = this.store.getSession(sessionId)
    if (!session) return
    this.store.putSession({ ...session, status, updatedAt: Date.now() / 1000 }, session.agentSession)
  }
}

function hashSeed(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0)
}

function retryAfterMs(headers: Record<string, string>): number {
  const raw = headers['retry-after']
  if (!raw) return 0
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 10_000)
  const date = Date.parse(raw)
  if (Number.isFinite(date)) return Math.max(0, Math.min(date - Date.now(), 10_000))
  return 0
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sha256(input: Buffer | string): string {
  return createHash('sha256').update(input).digest('hex')
}

function parseCookieNames(headers: Record<string, string>): string[] {
  const raw = headers['set-cookie'] ?? ''
  if (!raw) return []
  return raw.split(/,(?=[^;]+=)/).map((item) => item.split('=')[0].trim()).filter(Boolean).slice(0, 10)
}

/** 差异分析的"标记"：从候选请求的查询串/正文里取一个可回显的值。 */
function markerOf(exchange: StoredExchange): string {
  try {
    const url = new URL(exchange.url)
    for (const [, value] of url.searchParams) {
      if (value && value !== '***' && value.length >= 4) return value.slice(0, 32)
    }
  } catch { /* url 无效就退回正文标记 */ }
  return ''
}

export { checkSessionUsable, isSensitiveHeader }
