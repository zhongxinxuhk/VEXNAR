// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 唯一的 HTTP 出口。
 *
 * 这一层之前不存在：`api.ts` 与 `tasks/api.ts` 各写了一份 `fetch`，一个不回
 * 超时、一个不解析错误体，于是同一个后端故障在不同页面上表现为「一直转圈」
 * 与「HTTP 500」两种样子。现在所有面板都从这里出网，因此：
 *
 *   - 超时是统一的（默认 20s），而不是各页自己拍；
 *   - 错误是同一个类型（`ApiError`：status + code + message），页面只管渲染；
 *   - 查询串由 `query` 拼，空值自动丢弃，不会再出现 `?host=&q=`；
 *   - 外部 `AbortSignal` 与超时信号合并，组件卸载能真正掐断在途请求。
 */

/** 账户插件把 `/vexnar-api/*` 转给本机 core；同源，不带凭据。 */
export const API_BASE = '/vexnar-api'

export interface ApiErrorInit {
  status?: number
  code?: string
  detail?: unknown
}

/** 后端错误的统一形状。`code` 用后端的业务码（如 `ADVERSARIAL_NOT_ENABLED`）。 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly detail: unknown

  constructor(message: string, init: ApiErrorInit = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = init.status ?? 0
    this.code = init.code ?? ''
    this.detail = init.detail
  }

  /** 4xx 是「请求不对」，5xx/超时是「服务不对」，重试价值不同。 */
  get retryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500
  }
}

export type QueryValue = string | number | boolean | null | undefined

/** 拼查询串：`undefined`/`null`/空串一律丢弃，数字保持数字。 */
export function query(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export function apiUrl(path: string, params?: Record<string, QueryValue>): string {
  return `${API_BASE}${path}${params === undefined ? '' : query(params)}`
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  timeoutMs?: number
  headers?: Record<string, string>
}

const DEFAULT_TIMEOUT_MS = 20_000

/** 后端错误体：`{ error }` / `{ error, code }` / `{ message }` / 纯文本，都收口。 */
function messageOf(value: unknown, fallback: string): { message: string; code: string } {
  if (typeof value === 'string' && value.trim() !== '') return { message: value.trim(), code: '' }
  if (value !== null && typeof value === 'object') {
    const row = value as Record<string, unknown>
    const message = row['error'] ?? row['message'] ?? row['detail']
    const code = row['code'] ?? row['error_code']
    return {
      message: typeof message === 'string' && message !== '' ? message : fallback,
      code: typeof code === 'string' ? code : ''
    }
  }
  return { message: fallback, code: '' }
}

/**
 * 发一次请求。
 *
 * 空响应体返回 `null`（DELETE 类接口就是 200 空体），非 JSON 的成功响应按文本
 * 返回，避免把 `text/html` 硬解成 JSON 抛错。
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const external = options.signal
  const onAbort = (): void => controller.abort()
  if (external !== undefined) {
    if (external.aborted) controller.abort()
    else external.addEventListener('abort', onAbort, { once: true })
  }

  const headers: Record<string, string> = { Accept: 'application/json', ...(options.headers ?? {}) }
  const init: RequestInit = { method: options.method ?? 'GET', headers, signal: controller.signal, cache: 'no-store' }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }

  try {
    const response = await fetch(API_BASE + path, init)
    const text = await response.text()
    let parsed: unknown = null
    if (text !== '') {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = text
      }
    }
    if (!response.ok) {
      const detail = messageOf(parsed, `HTTP ${response.status}`)
      throw new ApiError(detail.message, { status: response.status, code: detail.code, detail: parsed })
    }
    return parsed as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (timedOut) throw new ApiError(`请求超时（${timeoutMs}ms）：${path}`, { status: 408, code: 'TIMEOUT' })
    // 外部取消不是错误，交给调用方按 `signal.aborted` 判断；这里保留原名。
    if (external?.aborted === true) throw new ApiError('请求已取消', { status: 499, code: 'ABORTED' })
    throw new ApiError(String((error as Error)?.message ?? error), { status: 0, code: 'NETWORK' })
  } finally {
    clearTimeout(timer)
    external?.removeEventListener('abort', onAbort)
  }
}

/**
 * 领域层只应该用这些方法，不要直接 fetch。
 *
 * `request` 负责拼 `API_BASE`，所以这里只交代"路径 + 查询串"。曾经这里传的是
 * `apiUrl(path, params)`（已含前缀），于是浏览器发出 `/vexnar-api/vexnar-api/api/traffic`，
 * 账户插件剥掉第一层后 core 收到 `/vexnar-api/api/traffic` → 501。
 * 三个页面同时"接口未实现"就是这个双前缀，而不是路由缺失。
 */
export const api = {
  get: <T>(path: string, signal?: AbortSignal, params?: Record<string, QueryValue>): Promise<T> =>
    request<T>(`${path}${params === undefined ? '' : query(params)}`, signal === undefined ? {} : { signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> =>
    request<T>(path, { method: 'POST', body: body ?? {}, ...(signal === undefined ? {} : { signal }) }),
  put: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'PUT', body: body ?? {} }),
  patch: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'PATCH', body: body ?? {} }),
  del: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, body === undefined ? { method: 'DELETE' } : { method: 'DELETE', body })
}

/** 把任意异常压成一行文案，页面不必各自 `instanceof`。 */
export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return String(error ?? '未知错误')
}
