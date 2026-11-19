import {
  clearBackendSession,
  getBackendConfig,
  getSettings,
  setBackendSession
} from './settings'
import type {
  BackendLoginInput,
  BackendRequestInput,
  BackendStatus,
  PublicSettings
} from '@shared/contracts'

const REQUEST_TIMEOUT_MS = 15_000

export function normalizeBackendUrl(raw: string): string {
  const value = raw.trim()
  if (!value) throw new Error('请填写后端地址')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('后端地址不是合法 URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('后端地址只支持 http/https')
  }
  const path = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${path}`
}

function apiUrl(baseUrl: string, path: string): string {
  if (!path.startsWith('/')) throw new Error('后端路径必须以 / 开头')
  if (path.includes('..')) throw new Error('后端路径不允许包含 ..')
  return `${normalizeBackendUrl(baseUrl)}/api${path}`
}

async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  if (!text) return `HTTP ${response.status}`
  try {
    const payload = JSON.parse(text) as { error?: unknown; message?: unknown }
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim()
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim()
  } catch {
    // Fall back to a bounded text response.
  }
  return text.slice(0, 600)
}

async function call(
  baseUrl: string,
  path: string,
  init: { method: string; token?: string; body?: unknown }
): Promise<unknown> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (init.token) headers.authorization = `Bearer ${init.token}`
  let body: string | undefined
  if (init.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(init.body)
  }
  const response = await fetch(apiUrl(baseUrl, path), {
    method: init.method,
    headers,
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!response.ok) throw new Error(await readError(response))
  if (response.status === 204) return undefined
  const text = await response.text()
  if (!text) return undefined
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) return JSON.parse(text) as unknown
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export async function backendStatus(): Promise<BackendStatus> {
  const config = getBackendConfig()
  let baseUrl = config.baseUrl
  try {
    baseUrl = normalizeBackendUrl(baseUrl)
  } catch (error) {
    return {
      baseUrl,
      connected: false,
      authenticated: Boolean(config.token),
      error: error instanceof Error ? error.message : String(error)
    }
  }
  try {
    const health = (await call(baseUrl, '/health', { method: 'GET' })) as {
      ok?: boolean
      service?: string
      version?: string
    }
    return {
      baseUrl,
      connected: health?.ok !== false,
      authenticated: Boolean(config.token),
      service: health?.service,
      version: health?.version
    }
  } catch (error) {
    return {
      baseUrl,
      connected: false,
      authenticated: Boolean(config.token),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function backendLogin(input: BackendLoginInput): Promise<PublicSettings> {
  const config = getBackendConfig()
  const baseUrl = normalizeBackendUrl(input.baseUrl?.trim() || config.baseUrl)
  const payload = (await call(baseUrl, '/auth/login', {
    method: 'POST',
    body: { username: input.username, password: input.password }
  })) as { token?: unknown }
  const token = typeof payload?.token === 'string' ? payload.token.trim() : ''
  if (!token) throw new Error('后端没有返回登录 token')
  await setBackendSession(baseUrl, token)
  return getSettings()
}

export async function backendLogout(): Promise<PublicSettings> {
  await clearBackendSession()
  return getSettings()
}

export async function backendRequest(input: BackendRequestInput): Promise<unknown> {
  const config = getBackendConfig()
  const baseUrl = normalizeBackendUrl(config.baseUrl)
  return call(baseUrl, input.path, {
    method: input.method,
    token: config.token,
    body: input.body
  })
}
