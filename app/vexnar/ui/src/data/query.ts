// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 键控查询缓存。
 *
 * 存在的理由是「同一件事只能有一个数」：概览的流量总量、流量页的计数、代理池
 * 的健康节点数，读的必须是同一份响应。缓存以 `key` 为唯一身份——
 *
 *   - 同 key 的并发请求合并成一次（`pending` 复用）；
 *   - 有数据时刷新不闪空（stale-while-revalidate）；
 *   - 写操作后 `invalidate(前缀)` 让所有挂载点一起重取，而不是各页各自刷新；
 *   - 轮询在标签页隐藏时停摆，回到前台立刻补一次（省掉后台无谓的请求）。
 *
 * 这里刻意不引入 react-query 之类：插件被打进 dsh 客户端，多一个运行时依赖就
 * 多一份与宿主版本冲突的可能，而需要的能力只有上面四条。
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import { ApiError, errorText } from './client.ts'

type Fetcher<T> = (signal: AbortSignal) => Promise<T>

interface Entry<T> {
  key: string
  status: 'idle' | 'loading' | 'ready' | 'error'
  data: T | undefined
  error: ApiError | undefined
  updatedAt: number
  pending: Promise<void> | null
  controller: AbortController | null
  fetcher: Fetcher<T> | null
  listeners: Set<() => void>
}

const entries = new Map<string, Entry<unknown>>()

function entryFor<T>(key: string): Entry<T> {
  const existing = entries.get(key)
  if (existing !== undefined) return existing as Entry<T>
  const created: Entry<T> = {
    key,
    status: 'idle',
    data: undefined,
    error: undefined,
    updatedAt: 0,
    pending: null,
    controller: null,
    fetcher: null,
    listeners: new Set()
  }
  entries.set(key, created as Entry<unknown>)
  return created
}

function notify<T>(entry: Entry<T>): void {
  for (const listener of entry.listeners) listener()
}

/** 读缓存快照（可能还没取过）。 */
export function peek<T>(key: string): Entry<T> | undefined {
  const entry = entries.get(key)
  return entry === undefined ? undefined : (entry as Entry<T>)
}

/** 直接把外部拿到的数据塞进缓存（SSE 首帧就是这样用的）。 */
export function prime<T>(key: string, data: T): void {
  const entry = entryFor<T>(key)
  entry.data = data
  entry.error = undefined
  entry.status = 'ready'
  entry.updatedAt = Date.now()
  notify(entry)
}

function load<T>(key: string, fetcher: Fetcher<T>, force: boolean): Promise<void> {
  const entry = entryFor<T>(key)
  entry.fetcher = fetcher
  if (entry.pending !== null && !force) return entry.pending

  entry.controller?.abort()
  const controller = new AbortController()
  entry.controller = controller
  // 有旧数据时不回到 loading：刷新期间界面保持可读。
  entry.status = entry.data === undefined ? 'loading' : 'ready'

  const run = (async (): Promise<void> => {
    try {
      const data = await fetcher(controller.signal)
      if (controller.signal.aborted) return
      entry.data = data
      entry.error = undefined
      entry.status = 'ready'
      entry.updatedAt = Date.now()
    } catch (error) {
      if (controller.signal.aborted) return
      entry.error = error instanceof ApiError ? error : new ApiError(errorText(error))
      if (entry.data === undefined) entry.status = 'error'
    } finally {
      // 只有自己仍是「当前请求」时才清 pending，否则会把后来者抹掉。
      if (entry.controller === controller) {
        entry.controller = null
        entry.pending = null
      }
      notify(entry)
    }
  })()

  entry.pending = run
  notify(entry)
  return run
}

/** 取一次：新鲜就用缓存，否则等待（或发起）一次请求。给非组件代码与聚合用。 */
export async function ensure<T>(key: string, fetcher: Fetcher<T>, ttlMs = 3000): Promise<T> {
  const entry = entryFor<T>(key)
  const fresh = entry.data !== undefined && entry.error === undefined && Date.now() - entry.updatedAt < ttlMs
  if (fresh) return entry.data as T
  await load(key, fetcher, false)
  if (entry.error !== undefined && entry.data === undefined) throw entry.error
  if (entry.data === undefined) throw new ApiError(`没有取到数据：${key}`, { code: 'EMPTY' })
  return entry.data
}

/** 让某个前缀下的键全部过期；有挂载点的立即重取（写操作后调用）。 */
export function invalidate(prefix: string): void {
  for (const [key, entry] of entries) {
    if (!key.startsWith(prefix)) continue
    entry.updatedAt = 0
    if (entry.listeners.size > 0 && entry.fetcher !== null) {
      void load(key, entry.fetcher, true)
    } else {
      notify(entry)
    }
  }
}

/** 清空整个缓存（切站点/退出登录级别的动作才会用到）。 */
export function clearCache(): void {
  for (const entry of entries.values()) entry.controller?.abort()
  entries.clear()
}

export interface QueryOptions {
  /** 数据新鲜期（毫秒）。期内挂载不再发请求。 */
  ttlMs?: number
  /** 轮询间隔（毫秒）；0 表示不轮询。隐藏标签页自动停摆。 */
  pollMs?: number
  /** 为 false 时不取数（用于依赖条件的查询）。 */
  enabled?: boolean
}

export interface QueryResult<T> {
  data: T | undefined
  error: ApiError | undefined
  /** 后端错误体（如 501 的 `{path, method, hint}`），用于把"哪个接口没实现"说清楚。 */
  detail: unknown
  /** 首次加载（还没有任何数据）。 */
  loading: boolean
  /** 后台刷新中（已有数据）。 */
  refreshing: boolean
  updatedAt: number
  refresh: () => void
}

/**
 * 订阅一个键。
 *
 * `fetcher` 每次渲染都会新建闭包，因此只放在 ref 里；真正触发重取的是 `key`
 * 的变化。参数编码进 key（见 `resources.ts`），所以「同 key 同数据」是结构性的。
 */
export function useQuery<T>(key: string | null, fetcher: Fetcher<T>, options: QueryOptions = {}): QueryResult<T> {
  const { ttlMs = 1000, pollMs = 0, enabled = true } = options
  const [, force] = useReducer((value: number) => value + 1, 0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const ttlRef = useRef(ttlMs)
  ttlRef.current = ttlMs

  useEffect(() => {
    if (key === null || !enabled) return
    const entry = entryFor<T>(key)
    const listener = (): void => force()
    entry.listeners.add(listener)
    const current = fetcherRef.current
    const stale = entry.data === undefined || Date.now() - entry.updatedAt >= ttlRef.current
    if (stale && entry.pending === null) void load(key, current, false)

    let timer = 0
    const tick = (): void => {
      if (document.visibilityState === 'hidden') return
      void load(key, fetcherRef.current, true)
    }
    if (pollMs > 0) timer = window.setInterval(tick, pollMs)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible' && pollMs > 0) tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      entry.listeners.delete(listener)
      if (timer !== 0) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [key, enabled, pollMs])

  const entry = key === null ? undefined : peek<T>(key)
  const refresh = useCallback((): void => {
    if (key === null) return
    void load(key, fetcherRef.current, true)
  }, [key])

  return {
    data: entry?.data,
    error: entry?.error,
    detail: entry?.error?.detail,
    loading: entry === undefined || (entry.data === undefined && (entry.status === 'idle' || entry.status === 'loading')),
    refreshing: entry !== undefined && entry.data !== undefined && entry.status !== 'error' && entry.pending !== null,
    updatedAt: entry?.updatedAt ?? 0,
    refresh
  }
}

export interface ActionState {
  busy: boolean
  error: string
  notice: string
}

/**
 * 写操作的状态机：一次只跑一个，成功后按前缀失效缓存。
 *
 * 之前每个页面都自己写 `busy/error` 三个 state，错误文案还各写一套；统一到
 * 这里之后，「按钮转圈 + 红字报错 + 成功后自动刷新」的行为在四页里一致。
 */
export function useAction(): ActionState & {
  run: <T>(task: () => Promise<T>, options?: { success?: string; invalidate?: string | string[] }) => Promise<T | undefined>
  reset: () => void
} {
  const [state, setState] = useState<ActionState>({ busy: false, error: '', notice: '' })

  const run = useCallback(async <T,>(
    task: () => Promise<T>,
    options: { success?: string; invalidate?: string | string[] } = {}
  ): Promise<T | undefined> => {
    setState({ busy: true, error: '', notice: '' })
    try {
      const result = await task()
      const prefixes = options.invalidate === undefined
        ? []
        : Array.isArray(options.invalidate) ? options.invalidate : [options.invalidate]
      for (const prefix of prefixes) invalidate(prefix)
      setState({ busy: false, error: '', notice: options.success ?? '' })
      return result
    } catch (error) {
      setState({ busy: false, error: errorText(error), notice: '' })
      return undefined
    }
  }, [])

  return { ...state, run, reset: () => setState({ busy: false, error: '', notice: '' }) }
}
