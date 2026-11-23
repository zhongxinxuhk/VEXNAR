// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 代理池事件流（`GET /api/proxy/events`，SSE）。
 *
 * core 的首帧是完整的 `mgr.state()`，之后是逐条事件（`node_health` /
 * `subscription_refreshed` …）。这里做两件事：
 *
 *   1. 首帧直接写进 `proxy:state` 缓存 —— 页面不必等轮询，打开就是最新状态；
 *   2. 事件累积成有上限的环形缓冲，供页面右侧的实时流展示。
 *
 * EventSource 自带重连，没有额外退避逻辑；页面只需知道「当前是否连着」。
 */
import { useEffect, useRef, useState } from 'react'

import { API_BASE } from './client.ts'
import { prime } from './query.ts'
import { normalizeProxyState } from './resources.ts'

export interface ProxyEvent {
  at: string
  type: string
  nodeId: number
  poolId: number
  state: string
  message: string
}

export interface ProxyEventStream {
  events: ProxyEvent[]
  connected: boolean
}

const MAX_EVENTS = 40

function eventOf(payload: Record<string, unknown>): ProxyEvent {
  return {
    at: String(payload['at'] ?? new Date().toISOString()),
    type: String(payload['type'] ?? 'event'),
    nodeId: Number(payload['node_id'] ?? 0) || 0,
    poolId: Number(payload['pool_id'] ?? 0) || 0,
    state: String(payload['state'] ?? ''),
    message: String(payload['message'] ?? '')
  }
}

/** 是否像是完整 state 帧（首帧）——有 pools/nodes 两个数组。 */
function looksLikeState(payload: Record<string, unknown>): boolean {
  return Array.isArray(payload['pools']) && Array.isArray(payload['nodes'])
}

export function useProxyEventStream(enabled = true): ProxyEventStream {
  const [events, setEvents] = useState<ProxyEvent[]>([])
  const [connected, setConnected] = useState(false)
  const eventsRef = useRef<ProxyEvent[]>([])
  eventsRef.current = events

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof window.EventSource !== 'function') return
    const source = new window.EventSource(`${API_BASE}/api/proxy/events`)

    const onMessage = (message: MessageEvent<string>): void => {
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(message.data) as Record<string, unknown>
      } catch {
        return
      }
      if (looksLikeState(payload)) {
        prime('proxy:state', normalizeProxyState(payload))
        return
      }
      const next = [eventOf(payload), ...eventsRef.current]
      eventsRef.current = next.slice(0, MAX_EVENTS)
      setEvents(eventsRef.current)
    }

    source.addEventListener('message', onMessage as EventListener)
    source.addEventListener('open', () => setConnected(true))
    source.addEventListener('error', () => setConnected(false))
    return () => {
      source.removeEventListener('message', onMessage as EventListener)
      source.close()
      setConnected(false)
    }
  }, [enabled])

  return { events, connected }
}
