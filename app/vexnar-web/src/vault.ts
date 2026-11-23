// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 第二层的保密部分：Session Vault。
 *
 * 纪律（来自 spec）：**Cookie / Bearer / CSRF 不进 Agent 上下文**。Agent 只拿到
 * `sessionId`；真实凭据只存在于引擎内存与加密落盘里，接口一律不回显。
 *
 * 加密交给 `AesGcmBox`（与证据正文共用一把密钥、同一套 AEAD），AAD 绑 sessionId：
 * 把密文搬到别的会话上会直接解失败。
 */

import { CookieJar } from 'tough-cookie'

import type { AesGcmBox } from './crypto-box.ts'

export interface VaultPersistence {
  readVault: (sessionId: string) => string | null
  writeVault: (sessionId: string, payload: string) => void
  removeVault: (sessionId: string) => void
}

interface VaultState {
  jar: CookieJar
  secrets: Record<string, string>
}

const SENSITIVE_HEADERS = new Set([
  'authorization', 'cookie', 'set-cookie', 'proxy-authorization', 'x-csrf-token',
  'x-xsrf-token', 'x-api-key', 'api-key', 'x-auth-token', 'x-session-token'
])

export function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADERS.has(String(name).toLowerCase())
}

export class SessionVault {
  private readonly cache = new Map<string, VaultState>()

  constructor(private readonly box: AesGcmBox, private readonly store: VaultPersistence) {}

  load(sessionId: string): VaultState {
    const cached = this.cache.get(sessionId)
    if (cached) return cached
    const payload = this.store.readVault(sessionId)
    let state: VaultState = { jar: new CookieJar(), secrets: {} }
    if (payload) {
      try {
        const parsed = JSON.parse(this.box.open(payload, sessionId).toString('utf8')) as {
          cookies?: unknown
          secrets?: Record<string, string>
        }
        state = {
          jar: parsed.cookies ? CookieJar.deserializeSync(parsed.cookies as never) : new CookieJar(),
          secrets: parsed.secrets ?? {}
        }
      } catch (error) {
        // 解不开就是坏档：不静默复用空身份（会用错身份发请求），直接报错。
        throw new Error(`会话 ${sessionId} 的 Vault 解密失败（密钥不匹配或密文损坏）：${(error as Error).message}`)
      }
    }
    this.cache.set(sessionId, state)
    return state
  }

  save(sessionId: string): void {
    const state = this.cache.get(sessionId)
    if (!state) return
    const plaintext = JSON.stringify({ cookies: state.jar.serializeSync(), secrets: state.secrets })
    this.store.writeVault(sessionId, this.box.seal(plaintext, sessionId))
  }

  /** 换身份时清空 cookie（保留 secrets：Bearer 等仍属于同一授权身份）。 */
  resetCookies(sessionId: string): void {
    const state = this.load(sessionId)
    state.jar = new CookieJar()
    this.save(sessionId)
  }

  drop(sessionId: string): void {
    this.cache.delete(sessionId)
    this.store.removeVault(sessionId)
  }

  cookieHeader(sessionId: string, url: string): Promise<string> {
    return this.load(sessionId).jar.getCookieString(url)
  }

  async storeSetCookie(sessionId: string, url: string, setCookie: string[]): Promise<void> {
    if (!setCookie.length) return
    const { jar } = this.load(sessionId)
    for (const cookie of setCookie) {
      try { await jar.setCookie(cookie, url) } catch { /* 非法 cookie 不影响主流程 */ }
    }
    this.save(sessionId)
  }

  secrets(sessionId: string): Record<string, string> {
    return { ...this.load(sessionId).secrets }
  }

  /** 创建会话时写入身份；敏感头统一收进 secrets（不回显、不进记录）。 */
  seed(sessionId: string, auth: Record<string, string> = {}): void {
    const state = this.load(sessionId)
    for (const [name, value] of Object.entries(auth)) {
      state.secrets[String(name).toLowerCase()] = String(value)
    }
    this.save(sessionId)
  }

  /** Cookie 串没有 URL 定不了域，等首次请求时再铺进 jar。 */
  async primeCookies(sessionId: string, url: string): Promise<void> {
    const state = this.load(sessionId)
    const raw = state.secrets.cookie
    if (!raw) return
    const { hostname } = new URL(url)
    for (const pair of raw.split(';')) {
      const [name, ...rest] = pair.split('=').map((item) => item.trim())
      if (!name || !rest.length) continue
      try {
        await state.jar.setCookie(`${name}=${rest.join('=')}; Domain=${hostname}; Path=/`, url, { ignoreError: true })
      } catch { /* 单个 cookie 失败不阻断 */ }
    }
    delete state.secrets.cookie
    this.save(sessionId)
  }
}
