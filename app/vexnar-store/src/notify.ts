// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

export interface NotifyEvent {
  kind: string
  title: string
  text: string
  task_id?: string
  finding_id?: string
}

export type Send = (channel: any, event: NotifyEvent) => Promise<{ ok: boolean; detail?: string }>
export type RecordResult = (channel: any, event: NotifyEvent, result: { ok: boolean; attempts: number; detail?: string }) => Promise<void>

/** Fan out one event to enabled notification channels. */
export function createNotifier(channels: any[], send?: Send, record?: RecordResult, maxAttempts = 3) {
  const dispatch = async (event: NotifyEvent) => {
    const results = []
    for (const channel of channels) {
      if (channel.enabled === false) continue
      const filter = channel.filter ?? {}
      if (Array.isArray(filter.events) && filter.events.length && !filter.events.includes(event.kind)) continue
      let result = { ok: false, detail: 'not attempted' }
      let attempts = 0
      for (; attempts < maxAttempts; attempts++) {
        try {
          result = send ? await send(channel, event) : await defaultSend(channel, event)
        } catch (error: any) {
          result = { ok: false, detail: String(error?.message ?? error) }
        }
        if (result.ok) break
      }
      const final = { ok: result.ok, attempts: attempts + 1, detail: result.detail }
      results.push({ id: channel.id, ok: final.ok, detail: final.detail })
      if (record) await record(channel, event, final).catch(() => {})
    }
    return results
  }
  return { dispatch }
}

async function defaultSend(channel: any, event: NotifyEvent) {
  if (channel.kind !== 'webhook' || !channel.config?.url) return { ok: false, detail: `unsupported channel: ${channel.kind}` }
  const response = await fetch(channel.config.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event: event.kind, title: event.title, text: event.text, task_id: event.task_id, finding_id: event.finding_id })
  })
  return { ok: response.ok, detail: `HTTP ${response.status}` }
}
