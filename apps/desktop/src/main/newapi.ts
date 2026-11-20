import { clipboard, safeStorage, shell } from 'electron'
import { readSetting, writeSetting } from './db'
import type {
  NewApiLoginInput,
  NewApiQuota,
  NewApiState,
  NewApiToken,
  NewApiUser,
  NewApiVerifyInput
} from '@shared/contracts'
import { IPC } from '@shared/contracts'
import {
  applyManagedConnection,
  clearManagedConnection,
  getAgentConfig,
  getSettings
} from './settings'
import {
  isAuthBundle,
  normalizeApiKey,
  normalizeModels,
  parseTokenItems,
  pickDefaultModel,
  quotaFromUser,
  tokenFromRecord,
  type TokenRecord
} from './newapi-utils'

export const NEWAPI_ORIGIN = 'https://platform.sec.hn.cn'
export const NEWAPI_API_BASE = 'https://api.sec.hn.cn/v1'
const AUTH_SETTING_KEY = 'newapi.auth'
const MANAGED_TOKEN_NAME = 'App-managed'

type RawUser = Record<string, unknown>

type Emit = (channel: string, payload: unknown) => void

type StoredAuth = {
  accessToken: string
  accessExpiresAt: number
  refreshToken: string
  sessionId: string
}

type ApiResult = {
  status: number
  ok: boolean
  json: unknown
  text: string
  headers: Headers
}

class SessionExpiredError extends Error {}

function toUser(raw: RawUser): NewApiUser {
  return {
    id: Number(raw.id ?? 0),
    username: String(raw.username ?? ''),
    displayName: String(raw.display_name ?? ''),
    email: String(raw.email ?? ''),
    group: String(raw.group ?? ''),
    role: Number(raw.role ?? 0)
  }
}

function messageOf(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const message = (payload as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message.trim()
  }
  return fallback
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function readCookie(headers: Headers, name: string): string {
  const values =
    typeof (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : [headers.get('set-cookie') ?? '']
  for (const value of values) {
    for (const cookie of value.split(/,(?=[^;]+?=)/)) {
      const pair = cookie.split(';', 1)[0]?.trim() ?? ''
      const index = pair.indexOf('=')
      if (index <= 0) continue
      if (pair.slice(0, index).trim() !== name) continue
      return pair.slice(index + 1).trim()
    }
  }
  return ''
}

function verificationMethods(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const methods = value
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>
        return String(record.method ?? record.name ?? record.type ?? '')
      }
      return ''
    })
    .map((item) => item.trim())
    .filter(Boolean)
  return Array.from(new Set(methods))
}

export class NewApiManager {
  private state: NewApiState = {
    stage: 'checking',
    authenticated: false,
    user: null,
    quota: null,
    token: null,
    models: [],
    verificationMethods: [],
    error: null,
    updatedAt: null
  }
  private auth: StoredAuth | null = null
  private pendingFlowToken = ''
  private bootstrapped = false
  private busy = false
  private readonly emit: Emit

  constructor(emit: Emit) {
    this.emit = emit
  }

  getState(): NewApiState {
    return this.state
  }

  async bootstrap(): Promise<NewApiState> {
    if (this.bootstrapped) return this.state
    this.bootstrapped = true
    this.update({ stage: 'checking', authenticated: false, error: null })
    const stored = await this.readStoredAuth()
    if (!stored) {
      this.setAnonymous()
      return this.state
    }
    this.auth = stored
    try {
      if (this.accessExpired()) await this.refreshSession()
      await this.loadAccount()
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        await this.clearAuth()
        this.setAnonymous()
      } else {
        this.update({
          stage: 'error',
          authenticated: false,
          error: errorMessage(error)
        })
      }
    }
    return this.state
  }

  async login(input: NewApiLoginInput): Promise<NewApiState> {
    if (this.busy) throw new Error('登录正在进行中')
    this.busy = true
    this.bootstrapped = true
    this.pendingFlowToken = ''
    this.update({
      stage: 'authenticating',
      authenticated: false,
      verificationMethods: [],
      error: null
    })
    try {
      const result = await this.request('/api/user/login', {
        method: 'POST',
        body: JSON.stringify({ username: input.username.trim(), password: input.password })
      })
      await this.acceptAuthResponse(result)
    } catch (error) {
      const message = errorMessage(error)
      this.update({
        stage: 'error',
        authenticated: false,
        verificationMethods: [],
        error: message
      })
    } finally {
      this.busy = false
    }
    return this.state
  }

  async verify(input: NewApiVerifyInput): Promise<NewApiState> {
    if (this.busy) throw new Error('验证正在进行中')
    if (!this.pendingFlowToken) throw new Error('登录验证已失效，请重新登录')
    this.busy = true
    this.update({ stage: 'authenticating', error: null })
    try {
      const result = await this.request('/api/user/login/verify', {
        method: 'POST',
        body: JSON.stringify({
          flow_token: this.pendingFlowToken,
          method: '2fa',
          code: input.code.trim()
        })
      })
      await this.acceptAuthResponse(result)
    } catch (error) {
      this.update({
        stage: 'verification',
        authenticated: false,
        error: errorMessage(error)
      })
    } finally {
      this.busy = false
    }
    return this.state
  }

  async cancelLogin(): Promise<NewApiState> {
    this.pendingFlowToken = ''
    this.setAnonymous()
    return this.state
  }

  async refresh(): Promise<NewApiState> {
    if (!this.bootstrapped) return this.bootstrap()
    if (!this.auth) {
      this.setAnonymous()
      return this.state
    }
    try {
      if (this.accessExpired()) await this.refreshSession()
      await this.loadAccount()
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        await this.clearAuth()
        this.setAnonymous()
      } else if (this.state.authenticated) {
        this.update({ error: errorMessage(error) })
      } else {
        this.update({ stage: 'error', authenticated: false, error: errorMessage(error) })
      }
    }
    return this.state
  }

  async logout(): Promise<{ loggedOut: true }> {
    const auth = this.auth
    this.pendingFlowToken = ''
    if (auth) {
      await this.request(
        '/api/user/auth/logout',
        { method: 'POST', body: '{}' },
        { token: auth.accessToken, cookie: this.refreshCookie(auth), sessionId: auth.sessionId }
      ).catch(() => undefined)
    }
    this.auth = null
    await this.clearAuth()
    await clearManagedConnection()
    this.setAnonymous()
    return { loggedOut: true }
  }

  copyKey(): { copied: true } {
    const { apiKey } = getAgentConfig()
    if (!apiKey) throw new Error('尚未配置 App-managed API Key')
    clipboard.writeText(apiKey)
    return { copied: true }
  }

  async openPlatform(): Promise<{ opened: true }> {
    await shell.openExternal(NEWAPI_ORIGIN)
    return { opened: true }
  }

  dispose(): void {
    this.auth = null
    this.pendingFlowToken = ''
  }

  private statusCache: {
    quota_per_unit?: unknown
    display_in_currency?: unknown
    usd_exchange_rate?: unknown
  } = {}

  private accessExpired(): boolean {
    if (!this.auth) return true
    if (!this.auth.accessToken) return true
    const expiresAt = Number(this.auth.accessExpiresAt)
    return !Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000) + 30
  }

  private refreshCookie(auth: StoredAuth): string {
    return auth.refreshToken ? `new_api_refresh=${auth.refreshToken}` : ''
  }

  private async request(
    path: string,
    init: RequestInit = {},
    auth?: { token?: string; cookie?: string; sessionId?: string }
  ): Promise<ApiResult> {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    headers.set('Origin', NEWAPI_ORIGIN)
    headers.set('Referer', `${NEWAPI_ORIGIN}/`)
    headers.set('User-Agent', 'VEXNAR Desktop')
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    if (auth?.token) headers.set('Authorization', `Bearer ${auth.token}`)
    if (auth?.cookie) headers.set('Cookie', auth.cookie)
    if (auth?.sessionId) headers.set('X-Auth-Session', auth.sessionId)

    let response: Response
    try {
      response = await fetch(`${NEWAPI_ORIGIN}${path}`, { ...init, headers })
    } catch (error) {
      throw new Error(`无法连接 HXSEC 平台：${errorMessage(error)}`)
    }
    const text = await response.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      // A non-JSON response is reported through text/messageOf below.
    }
    return {
      status: response.status,
      ok: response.ok,
      json,
      text,
      headers: response.headers
    }
  }

  private async authRequest(path: string, init: RequestInit = {}): Promise<ApiResult> {
    if (!this.auth) throw new SessionExpiredError('登录已过期')
    let result = await this.request(path, init, { token: this.auth.accessToken })
    if (result.status !== 401) return result
    await this.refreshSession()
    if (!this.auth) throw new SessionExpiredError('登录已过期')
    result = await this.request(path, init, { token: this.auth.accessToken })
    if (result.status === 401) throw new SessionExpiredError('登录已过期')
    return result
  }

  private async acceptAuthResponse(result: ApiResult): Promise<void> {
    const payload = result.json as
      | { success?: boolean; data?: unknown; message?: string }
      | null
    if (!result.ok) {
      throw new Error(messageOf(payload, `登录失败（HTTP ${result.status}）`))
    }
    if (payload?.success === false) {
      throw new Error(messageOf(payload, '登录失败'))
    }
    const data = payload?.data
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>
      if (record.require_verification === true) {
        const flowToken = String(record.flow_token ?? '')
        if (!flowToken) throw new Error('登录验证响应不完整')
        this.pendingFlowToken = flowToken
        this.update({
          stage: 'verification',
          authenticated: false,
          verificationMethods: verificationMethods(record.methods),
          error: null
        })
        return
      }
    }
    if (!isAuthBundle(data)) {
      throw new Error(messageOf(payload, '登录响应缺少访问令牌'))
    }
    const session = data.session as { sid?: unknown } | undefined
    const refreshToken =
      readCookie(result.headers, 'new_api_refresh') || this.auth?.refreshToken || ''
    const expiresAt = Number(data.access_expires_at ?? 0)
    this.auth = {
      accessToken: data.access_token,
      accessExpiresAt:
        Number.isFinite(expiresAt) && expiresAt > 0
          ? expiresAt
          : Math.floor(Date.now() / 1000) + 3600,
      refreshToken,
      sessionId: String(session?.sid ?? '')
    }
    this.pendingFlowToken = ''
    await this.persistAuth(this.auth)
    this.update({ stage: 'authenticating', authenticated: false, error: null })
    await this.loadAccount()
  }

  private async refreshSession(): Promise<void> {
    const auth = this.auth
    if (!auth?.refreshToken) throw new SessionExpiredError('登录已过期')
    const result = await this.request(
      '/api/user/auth/refresh',
      { method: 'POST', body: '{}' },
      { cookie: this.refreshCookie(auth), sessionId: auth.sessionId }
    )
    if (result.status === 401 || result.status === 403) {
      throw new SessionExpiredError('登录已过期')
    }
    const payload = result.json as { success?: boolean; data?: unknown; message?: string } | null
    if (!result.ok || payload?.success === false || !isAuthBundle(payload?.data)) {
      throw new Error(messageOf(payload, '刷新登录状态失败'))
    }
    const data = payload.data
    const session = data.session as { sid?: unknown } | undefined
    const expiresAt = Number(data.access_expires_at ?? 0)
    this.auth = {
      accessToken: data.access_token,
      accessExpiresAt:
        Number.isFinite(expiresAt) && expiresAt > 0
          ? expiresAt
          : Math.floor(Date.now() / 1000) + 3600,
      refreshToken: readCookie(result.headers, 'new_api_refresh') || auth.refreshToken,
      sessionId: String(session?.sid ?? auth.sessionId)
    }
    await this.persistAuth(this.auth)
  }

  private async loadAccount(): Promise<void> {
    const self = await this.authRequest('/api/user/self')
    if (!self.ok) {
      throw new Error(messageOf(self.json, '无法读取 HXSEC 账户信息'))
    }
    const selfPayload = self.json as { success?: boolean; data?: RawUser; message?: string } | null
    if (!selfPayload?.success || !selfPayload.data) {
      throw new Error(messageOf(selfPayload, '无法读取 HXSEC 账户信息'))
    }
    const rawUser = selfPayload.data
    const user = toUser(rawUser)

    const modelsResult = await this.authRequest('/api/user/models')
    const modelsPayload = modelsResult.json as { success?: boolean; data?: unknown } | null
    const models = normalizeModels(modelsPayload?.data)

    const statusResult = await this.authRequest('/api/status')
    const statusPayload = statusResult.json as { data?: Record<string, unknown> } | null
    this.statusCache = statusPayload?.data ?? {}

    let token: NewApiToken | null = null
    let tokenError: string | null = null
    try {
      const managed = await this.ensureManagedToken(user, rawUser)
      token = managed.token
      const current = getSettings()
      const model = pickDefaultModel(models, current.model)
      await applyManagedConnection({
        baseUrl: NEWAPI_API_BASE,
        apiKey: managed.apiKey,
        model,
        models
      })
    } catch (error) {
      tokenError = errorMessage(error)
    }

    const quota: NewApiQuota = quotaFromUser(
      rawUser,
      this.statusCache,
      Boolean(token?.unlimitedQuota)
    )
    this.update({
      stage: 'ready',
      authenticated: true,
      user,
      quota,
      token,
      models,
      verificationMethods: [],
      error: tokenError,
      updatedAt: Date.now()
    })
  }

  private async ensureManagedToken(
    user: NewApiUser,
    rawUser: RawUser
  ): Promise<{ token: NewApiToken; apiKey: string }> {
    const tokens = await this.listTokens()
    let found = tokens.find((token) => token.name === MANAGED_TOKEN_NAME)
    if (!found) {
      const group = String(rawUser.group ?? user.group ?? '')
      const created = await this.authRequest('/api/token/', {
        method: 'POST',
        body: JSON.stringify({
          name: MANAGED_TOKEN_NAME,
          remain_quota: 0,
          expired_time: -1,
          unlimited_quota: true,
          model_limits_enabled: false,
          model_limits: '',
          allow_ips: '',
          group,
          allow_user_quota_query: true
        })
      })
      if (!created.ok) throw new Error(messageOf(created.json, '创建 App-managed API Key 失败'))
      const payload = created.json as { success?: boolean; message?: string } | null
      if (payload?.success === false) {
        throw new Error(messageOf(payload, '创建 App-managed API Key 失败'))
      }
      for (let attempt = 0; attempt < 4 && !found; attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 250))
        found = (await this.listTokens()).find((token) => token.name === MANAGED_TOKEN_NAME)
      }
      if (!found) throw new Error('已创建 API Key，但未能从中转站列表读取')
    }

    const keyResult = await this.authRequest(`/api/token/${found.id}/key`, {
      method: 'POST',
      body: '{}'
    })
    const keyPayload = keyResult.json as
      | { success?: boolean; data?: { key?: unknown }; message?: string }
      | null
    const rawKey = keyPayload?.data?.key
    if (!keyResult.ok || typeof rawKey !== 'string' || !rawKey.trim()) {
      throw new Error(messageOf(keyPayload, '无法读取 App-managed API Key'))
    }
    return {
      token: tokenFromRecord({ ...found, key: rawKey }),
      apiKey: normalizeApiKey(rawKey)
    }
  }

  private async listTokens(): Promise<TokenRecord[]> {
    const result = await this.authRequest('/api/token/?p=1&size=100')
    if (!result.ok) throw new Error(messageOf(result.json, '无法读取中转站 API Key 列表'))
    return parseTokenItems(result.json)
  }

  private async readStoredAuth(): Promise<StoredAuth | null> {
    const raw = await readSetting(AUTH_SETTING_KEY)
    if (!raw?.startsWith('enc:')) return null
    try {
      if (!safeStorage.isEncryptionAvailable()) return null
      const decrypted = safeStorage.decryptString(Buffer.from(raw.slice(4), 'base64'))
      const parsed = JSON.parse(decrypted) as Partial<StoredAuth>
      if (!parsed.accessToken) return null
      return {
        accessToken: parsed.accessToken,
        accessExpiresAt: Number(parsed.accessExpiresAt ?? 0),
        refreshToken: String(parsed.refreshToken ?? ''),
        sessionId: String(parsed.sessionId ?? '')
      }
    } catch {
      return null
    }
  }

  private async persistAuth(auth: StoredAuth): Promise<void> {
    try {
      if (!safeStorage.isEncryptionAvailable()) return
      const sealed = safeStorage.encryptString(JSON.stringify(auth)).toString('base64')
      await writeSetting(AUTH_SETTING_KEY, `enc:${sealed}`)
    } catch {
      // A session remains usable even when the OS keychain is unavailable.
    }
  }

  private async clearAuth(): Promise<void> {
    this.auth = null
    try {
      await writeSetting(AUTH_SETTING_KEY, '')
    } catch {
      // The in-memory session is already cleared.
    }
  }

  private setAnonymous(): void {
    this.update({
      stage: 'anonymous',
      authenticated: false,
      user: null,
      quota: null,
      token: null,
      models: [],
      verificationMethods: [],
      error: null
    })
  }

  private update(patch: Partial<NewApiState>): void {
    const next = { ...this.state, ...patch }
    if (JSON.stringify(next) === JSON.stringify(this.state)) return
    this.state = next
    this.emit(IPC.newapiChanged, next)
  }
}