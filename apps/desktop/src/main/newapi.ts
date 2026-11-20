// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { BrowserWindow, clipboard, safeStorage, session, shell } from 'electron'
import { readSetting, writeSetting } from './db'
import type {
  NewApiAuthProvider,
  NewApiExternalAuthInput,
  NewApiLoginInput,
  NewApiQuota,
  NewApiState,
  NewApiToken,
  NewApiUser,
  NewApiVerifyInput
} from '@shared/contracts'
import { defaultNewApiAuthMethods, IPC } from '@shared/contracts'
import {
  applyManagedConnection,
  clearManagedConnection,
  getAgentConfig,
  getSettings
} from './settings'
import {
  authMethodsFromStatus,
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
const AUTH_PARTITION = 'vexnar-newapi-auth'
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
    authMethods: { ...defaultNewApiAuthMethods },
    externalAuth: null,
    error: null,
    updatedAt: null
  }
  private auth: StoredAuth | null = null
  private pendingFlowToken = ''
  private bootstrapped = false
  private busy = false
  private authWindow: BrowserWindow | null = null
  private authPollTimer: ReturnType<typeof setInterval> | null = null
  private authTimeoutTimer: ReturnType<typeof setTimeout> | null = null
  private authGeneration = 0
  private externalCompleted = false
  private externalStarting = false
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
    try {
      await this.loadPublicAuthMethods()
    } catch (error) {
      if (!stored) {
        this.setAnonymous()
        this.update({ stage: 'error', error: errorMessage(error) })
        return this.state
      }
    }
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
      externalAuth: null,
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

  async startExternalAuth(input: NewApiExternalAuthInput): Promise<NewApiState> {
    if (this.busy || this.externalStarting) throw new Error('登录正在进行中')
    if (this.authWindow) {
      this.authWindow.focus()
      return this.state
    }

    const methods = this.state.authMethods
    if (input.kind === 'passkey' && !methods.passkeyLogin) {
      throw new Error('平台未开放 Passkey 登录')
    }
    if (input.kind === 'register' && !methods.register) {
      throw new Error('平台未开放注册')
    }
    let provider: NewApiAuthProvider | null = null
    if (input.kind === 'oauth') {
      provider = methods.providers.find((item) => item.key === input.provider) ?? null
      if (!provider) throw new Error('该登录方式已不可用，请刷新登录方式')
    }

    const label = provider?.name ?? (input.kind === 'passkey' ? 'Passkey' : '注册')
    const generation = ++this.authGeneration
    this.pendingFlowToken = ''
    this.externalCompleted = false
    this.update({
      stage: 'authenticating',
      authenticated: false,
      verificationMethods: [],
      externalAuth: {
        kind: input.kind,
        label,
        provider: provider?.key ?? null
      },
      error: null
    })

    try {
      this.externalStarting = true
      await this.openExternalAuthWindow(input, provider, generation)
    } catch (error) {
      this.finishExternalError(errorMessage(error))
    } finally {
      this.externalStarting = false
    }
    return this.state
  }

  async cancelExternalAuth(): Promise<NewApiState> {
    this.externalCompleted = true
    this.authGeneration += 1
    this.stopAuthTimers()
    const win = this.authWindow
    this.authWindow = null
    if (win && !win.isDestroyed()) win.destroy()
    this.setAnonymous()
    return this.state
  }

  async refreshAuthMethods(): Promise<NewApiState> {
    try {
      await this.loadPublicAuthMethods()
    } catch (error) {
      if (!this.state.authenticated) {
        this.update({ error: errorMessage(error) })
      }
    }
    return this.state
  }

  async refresh(): Promise<NewApiState> {
    if (!this.bootstrapped) return this.bootstrap()
    if (!this.auth) {
      try {
        await this.loadPublicAuthMethods()
        this.setAnonymous()
      } catch (error) {
        this.update({ stage: 'error', authenticated: false, error: errorMessage(error) })
      }
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
    this.externalCompleted = true
    this.stopAuthTimers()
    const win = this.authWindow
    this.authWindow = null
    if (win && !win.isDestroyed()) win.destroy()
  }

  private async loadPublicAuthMethods(): Promise<void> {
    const result = await this.request('/api/status')
    const payload = result.json as
      | { success?: boolean; data?: Record<string, unknown>; message?: string }
      | null
    if (!result.ok || payload?.success === false || !payload?.data) {
      throw new Error(messageOf(payload, `无法读取平台登录方式（HTTP ${result.status}）`))
    }
    this.update({ authMethods: authMethodsFromStatus(payload.data) })
  }

  private async openExternalAuthWindow(
    input: NewApiExternalAuthInput,
    provider: NewApiAuthProvider | null,
    generation: number
  ): Promise<void> {
    const authSession = session.fromPartition(AUTH_PARTITION)
    await authSession
      .clearStorageData({ origin: NEWAPI_ORIGIN })
      .catch(() => undefined)
    const existing = await authSession.cookies.get({ url: NEWAPI_ORIGIN })
    await Promise.all(
      existing.map((cookie) =>
        authSession.cookies.remove(NEWAPI_ORIGIN, cookie.name).catch(() => undefined)
      )
    )
    if (this.externalCompleted || generation !== this.authGeneration) return

    const parent = BrowserWindow.getFocusedWindow()
    const win = new BrowserWindow({
      width: 520,
      height: 760,
      minWidth: 420,
      minHeight: 560,
      show: false,
      title: 'HXSEC 安全登录',
      backgroundColor: '#ffffff',
      autoHideMenuBar: true,
      parent: parent ?? undefined,
      webPreferences: {
        partition: AUTH_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    this.authWindow = win

    const showWindow = (): void => {
      if (win.isDestroyed() || this.authWindow !== win) return
      if (!win.isVisible()) win.show()
      win.focus()
    }

    win.once('ready-to-show', showWindow)
    win.on('closed', () => {
      if (this.authWindow === win) this.authWindow = null
      this.stopAuthTimers()
      if (this.externalCompleted || generation !== this.authGeneration) return
      if (this.state.externalAuth) this.setAnonymous()
    })
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void win.loadURL(url).catch(() => undefined)
      return { action: 'deny' }
    })
    win.webContents.on('did-finish-load', () => {
      if (win.isDestroyed() || this.authWindow !== win) return
      showWindow()
      void this.prepareAuthPage(win, input, provider)
    })
    win.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) showWindow()
    })

    const path = input.kind === 'register' ? '/sign-up' : '/sign-in'
    this.startAuthWatcher(win, generation)
    void win.loadURL(`${NEWAPI_ORIGIN}${path}`).catch(() => undefined)
  }

  private async prepareAuthPage(
    win: BrowserWindow,
    input: NewApiExternalAuthInput,
    provider: NewApiAuthProvider | null
  ): Promise<void> {
    if (win.isDestroyed() || this.authWindow !== win) return
    let page: URL
    try {
      page = new URL(win.webContents.getURL())
    } catch {
      return
    }
    if (page.origin !== NEWAPI_ORIGIN) return

    if (input.kind === 'register') {
      if (page.pathname === '/sign-up') await this.watchRegisterSuccess(win)
      return
    }
    if (page.pathname !== '/sign-in') return

    if (input.kind === 'oauth' && provider) {
      await this.clickAuthTarget(win, [provider.name, provider.key])
      return
    }
    if (input.kind === 'passkey') {
      await this.clickAuthTarget(win, ['passkey'], /another website|其他网站|另一个网站/i)
    }
  }

  private async clickAuthTarget(
    win: BrowserWindow,
    targets: string[],
    exclude?: RegExp
  ): Promise<void> {
    const normalized = targets.map((target) => target.trim().toLowerCase()).filter(Boolean)
    if (normalized.length === 0) return
    const script = `(() => {
      const targets = ${JSON.stringify(normalized)};
      const exclude = ${exclude ? exclude.toString() : 'null'};
      const nodes = Array.from(document.querySelectorAll('button, a, [role="button"]'));
      const node = nodes.find((item) => {
        if (item.disabled || item.getAttribute('aria-disabled') === 'true') return false;
        const rect = item.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const text = ((item.innerText || item.textContent || '') + ' ' + (item.getAttribute('aria-label') || '')).trim().toLowerCase();
        if (!text) return false;
        if (exclude && exclude.test(text)) return false;
        return targets.some((target) => text.includes(target));
      });
      if (!node) return false;
      node.scrollIntoView({ block: 'center' });
      node.click();
      return true;
    })()`;

    for (let attempt = 0; attempt < 14; attempt += 1) {
      if (win.isDestroyed() || this.authWindow !== win) return
      const clicked = await win.webContents.executeJavaScript(script, true).catch(() => false)
      if (clicked === true) return
      await new Promise((resolve) => setTimeout(resolve, 650))
    }
  }

  private async watchRegisterSuccess(win: BrowserWindow): Promise<void> {
    const script = `(() => {
      if (window.__vexnarRegisterWatch) return true;
      window.__vexnarRegisterWatch = true;
      const check = () => {
        const text = document.body ? (document.body.innerText || '') : '';
        if (/Account created|账号创建成功|注册成功|Registration successful/i.test(text)) {
          window.location.assign('/sign-in');
        }
      };
      window.setInterval(check, 800);
      return true;
    })()`
    await win.webContents.executeJavaScript(script, true).catch(() => undefined)
  }

  private startAuthWatcher(win: BrowserWindow, generation: number): void {
    this.stopAuthTimers()
    let checking = false
    const tick = async (): Promise<void> => {
      if (
        checking ||
        this.externalCompleted ||
        this.authWindow !== win ||
        generation !== this.authGeneration ||
        win.isDestroyed()
      ) {
        return
      }
      checking = true
      try {
        const cookies = await win.webContents.session.cookies.get({
          url: NEWAPI_ORIGIN,
          name: 'new_api_refresh'
        })
        const token = cookies.find((cookie) => cookie.value)?.value ?? ''
        if (token) await this.completeExternalAuth(token, win)
      } catch {
        // Transient cookie read failures are retried on the next tick.
      } finally {
        checking = false
      }
    }
    this.authPollTimer = setInterval(() => void tick(), 650)
    void tick()
    this.authTimeoutTimer = setTimeout(() => {
      if (this.authWindow === win && !this.externalCompleted) {
        this.finishExternalError('登录窗口已超时，请重新尝试')
      }
    }, 10 * 60 * 1000)
  }

  private async completeExternalAuth(token: string, win: BrowserWindow): Promise<void> {
    if (this.externalCompleted) return
    this.externalCompleted = true
    this.stopAuthTimers()
    this.auth = {
      accessToken: '',
      accessExpiresAt: 0,
      refreshToken: token,
      sessionId: ''
    }
    try {
      await this.refreshSession()
      await this.loadAccount()
    } catch (error) {
      await this.clearAuth()
      this.update({
        stage: 'error',
        authenticated: false,
        externalAuth: null,
        error: errorMessage(error)
      })
    } finally {
      if (!win.isDestroyed()) win.close()
    }
  }

  private finishExternalError(message: string): void {
    this.externalCompleted = true
    this.stopAuthTimers()
    const win = this.authWindow
    this.authWindow = null
    if (win && !win.isDestroyed()) win.destroy()
    this.update({
      stage: 'error',
      authenticated: false,
      externalAuth: null,
      error: message
    })
  }

  private stopAuthTimers(): void {
    if (this.authPollTimer) {
      clearInterval(this.authPollTimer)
      this.authPollTimer = null
    }
    if (this.authTimeoutTimer) {
      clearTimeout(this.authTimeoutTimer)
      this.authTimeoutTimer = null
    }
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
    const statusData = statusResult.ok ? statusPayload?.data : undefined
    this.statusCache = statusData ?? {}

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
      authMethods: statusData
        ? authMethodsFromStatus(statusData)
        : this.state.authMethods,
      externalAuth: null,
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
      externalAuth: null,
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