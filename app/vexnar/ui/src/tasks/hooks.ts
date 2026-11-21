// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'

export type Resource<T> = { data: T | undefined; error: string | undefined; loading: boolean; reload: () => void }

/**
 * 一个最小的“取一次、可重取”的 hook：任务面板里每个区块都只读自己的接口，
 * 用 key 字符串判断依赖，避免对象依赖每次渲染都触发请求。
 */
export function useResource<T>(key: string, load: () => Promise<T>, enabled = true): Resource<T> {
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>()
  const [tick, setTick] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    if (!enabled) return
    let alive = true
    loadRef
      .current()
      .then((data) => alive && setState({ key, data }))
      .catch((error: Error) => alive && setState({ key, error: error.message }))
    return () => {
      alive = false
    }
  }, [key, enabled, tick])
  const current = state?.key === key ? state : undefined
  return {
    data: current?.data,
    error: current?.error,
    loading: enabled && current === undefined,
    reload: () => setTick((value) => value + 1)
  }
}
