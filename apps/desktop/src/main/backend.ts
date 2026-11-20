// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { BackendRequestInput, BackendStatus } from '@shared/contracts'

/**
 * The Go service is shipped with the desktop app. Renderer never sees or edits
 * an endpoint; the main process owns the loopback address (overridable only by
 * the build/runtime environment for local development).
 */
const DEFAULT_SERVICE_URL = 'http://127.0.0.1:8787'
const REQUEST_TIMEOUT_MS = 15_000

function serviceUrl(): string {
  const raw = (process.env.VEXNAR_SERVICE_URL ?? DEFAULT_SERVICE_URL).trim()
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('内置服务地址无效')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('内置服务地址只支持 http/https')
  }
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new Error('内置服务必须监听本机回环地址')
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

function apiUrl(path: string): string {
  if (!path.startsWith('/')) throw new Error('内置服务路径必须以 / 开头')
  if (path.includes('..')) throw new Error('内置服务路径不允许包含 ..')
  return `${serviceUrl()}/api${path}`
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
  path: string,
  init: { method: string; body?: unknown }
): Promise<unknown> {
  const headers: Record<string, string> = { accept: 'application/json' }
  let body: string | undefined
  if (init.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(init.body)
  }
  const response = await fetch(apiUrl(path), {
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
  try {
    const health = (await call('/health', { method: 'GET' })) as {
      ok?: boolean
      service?: string
      version?: string
    }
    return {
      connected: health?.ok !== false,
      service: health?.service,
      version: health?.version
    }
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function backendRequest(input: BackendRequestInput): Promise<unknown> {
  return call(input.path, {
    method: input.method,
    body: input.body
  })
}