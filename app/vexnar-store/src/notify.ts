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

/** Fan out one event to enabled notification channels. */
export function createNotifier(channels: any[], send?: Send) {
  const dispatch = async (event: NotifyEvent) => {
    const results = []
    for (const channel of channels) {
      if (channel.enabled === false) continue
      const filter = channel.filter ?? {}
      if (Array.isArray(filter.events) && filter.events.length && !filter.events.includes(event.kind)) continue
      try {
        const result = send ? await send(channel, event) : await defaultSend(channel, event)
        results.push({ id: channel.id, ok: result.ok, detail: result.detail })
      } catch (error: any) {
        results.push({ id: channel.id, ok: false, detail: String(error?.message ?? error) })
      }
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
