// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { API_BASE, api, errorText } from './data/client.ts'
import { useQuery } from './data/query.ts'

/**
 * 领域接口的兼容入口。
 *
 * 这些名字（`callApi` / `useApi` / `CORE_BASE`）在插件里用了很久，逐个改调用点
 * 只会制造噪音；真正要修的是它们背后的实现——现在统一走 `data/client.ts`，
 * 因此超时、错误类型、查询串规则与新的数据层完全一致，不再有第二条 fetch 路径。
 */
export const CORE_BASE = API_BASE

export async function responseError(response: Response): Promise<Error> {
  const data = await response.json().catch(() => null)
  return new Error((data as { error?: string } | null)?.error || `HTTP ${response.status}`)
}

export async function callApi(path: string, method = 'GET', body?: unknown): Promise<any> {
  const verb = method.toUpperCase()
  if (verb === 'GET') return api.get(path)
  if (verb === 'POST') return api.post(path, body)
  if (verb === 'PUT') return api.put(path, body)
  if (verb === 'PATCH') return api.patch(path, body)
  if (verb === 'DELETE') return api.del(path, body)
  throw new Error(`不支持的请求方法：${method}`)
}

/**
 * 读一次接口。
 *
 * `deps` 参与缓存键：依赖变化即换 key，等价于「重新取一次」，但同 key 的并发
 * 请求会被合并。返回形状保持 `{ data, error, loading }`，调用方无需改动。
 */
export function useApi(path: string, deps: unknown[] = []): { data: any; error: string; loading: boolean } {
  const result = useQuery(
    `legacy:${path}:${JSON.stringify(deps)}`,
    (signal) => api.get<unknown>(path, signal),
    { ttlMs: 2000 }
  )
  return {
    data: result.data ?? null,
    error: result.error === undefined ? '' : errorText(result.error),
    loading: result.loading
  }
}
