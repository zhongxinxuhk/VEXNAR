// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 会话抓包开关（chat 头部）。
 *
 * 抓包按会话发起：点一下把本会话的 scope 记到 capture 状态上，再把该会话
 * 专属的 Yakit 镜像脚本复制出来；概览据此显示"N 个会话抓包中"。停止同样
 * 只影响本会话，其它会话的抓包不受影响。
 */
import { useEffect, useState } from 'react'

const CORE_BASE = '/vexnar-api'

interface Endpoint {
  enabled?: boolean
  scope?: string
  capture?: { active?: boolean; items?: number; last_ts?: number }
  hook?: string
}

async function readJSON(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(CORE_BASE + path, init)
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`)
  return data
}

export function SessionCaptureAction({ sessionId }: { sessionId?: string }) {
  const [endpoint, setEndpoint] = useState<Endpoint | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!sessionId) return
    let alive = true
    readJSON(`/api/sessions/${encodeURIComponent(sessionId)}/traffic/endpoint`)
      .then((data) => { if (alive) setEndpoint(data) })
      .catch(() => { if (alive) setEndpoint(null) })
    return () => { alive = false }
  }, [sessionId])

  if (!sessionId) return null

  const active = endpoint?.enabled === true
  const items = Number(endpoint?.capture?.items ?? 0)

  async function toggle(): Promise<void> {
    if (!sessionId || busy) return
    setBusy(true)
    try {
      const action = active ? 'stop' : 'start'
      const body = await readJSON(`/api/sessions/${encodeURIComponent(sessionId)}/traffic/capture`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action })
      })
      setEndpoint({ enabled: body?.enabled === true, scope: body?.scope, capture: body?.summary ?? body?.capture, hook: body?.hook })
      setNote(action === 'start' ? '已发起抓包：复制脚本到 Yakit 热加载' : '已停止抓包')
    } catch (error) {
      setNote(String((error as Error)?.message ?? error))
    } finally {
      setBusy(false)
    }
  }

  async function copyHook(): Promise<void> {
    try {
      await navigator.clipboard.writeText(String(endpoint?.hook ?? ''))
      setNote('抓包脚本已复制')
    } catch {
      setNote('复制失败')
    }
  }

  return (
    <span className="vx-capture-action">
      <button type="button" disabled={busy} onClick={() => { void toggle() }}
        title={active ? '停止本会话抓包' : '为本会话发起抓包'}>
        {active ? `抓包中 ${items}` : '抓包'}
      </button>
      {active && endpoint?.hook ? (
        <button type="button" onClick={() => { void copyHook() }} title="复制本会话的 Yakit 抓包脚本">脚本</button>
      ) : null}
      {note !== '' ? <em>{note}</em> : null}
    </span>
  )
}
