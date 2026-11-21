// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'

/**
 * 领域接口的统一入口。
 *
 * 面板与工具目录共用同一套调用：请求走同源 `/vexnar-api`，由账户插件转给本机
 * Go 服务。放进独立模块是因为设置页里的目录视图也要读写同一批接口，而
 * `client.tsx` 只负责注册与面板装配。
 */
export const CORE_BASE = '/vexnar-api'

export async function responseError(response: Response): Promise<Error> {
  const data = await response.json().catch(() => null)
  return new Error(data?.error || `HTTP ${response.status}`)
}

export async function callApi(path: string, method = 'GET', body?: unknown): Promise<any> {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  const response = await fetch(CORE_BASE + path, init)
  if (!response.ok) throw await responseError(response)
  return response.json()
}

/** 读一次接口；deps 变化时重取，卸载后丢弃迟到的结果。 */
export function useApi(path: string, deps: unknown[] = []): { data: any; error: string; loading: boolean } {
  const [state, setState] = useState<{ data: any; error: string; loading: boolean }>({ data: null, error: '', loading: true })
  useEffect(() => {
    let alive = true
    fetch(CORE_BASE + path)
      .then(async (response) => {
        if (!response.ok) throw await responseError(response)
        return response.json()
      })
      .then((data) => { if (alive) setState({ data, error: '', loading: false }) })
      .catch((error) => { if (alive) setState({ data: null, error: String(error?.message ?? error), loading: false }) })
    return () => { alive = false }
  }, deps)
  return state
}
