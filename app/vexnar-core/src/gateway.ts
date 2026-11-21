// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Model transport for the engine. Per project rules the upstream provider is
 * only reachable through the Go loopback gateway, so this client needs the
 * gateway URL plus its per-launch token and never holds an upstream API key.
 */
export async function gatewayComplete(messages: Array<{ role: string; content: string }>) {
  const base = (process.env.VEXNAR_GATEWAY_URL || 'http://127.0.0.1:8787/api/desktop/v1').replace(/\/$/, '')
  const token = process.env.VEXNAR_GATEWAY_TOKEN || ''
  if (!token) throw Object.assign(new Error('VEXNAR_GATEWAY_TOKEN 未配置，模型调用不可用'), { status: 503 })
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ model: process.env.VEXNAR_GATEWAY_MODEL || 'deepseek-flash', messages, stream: false })
  })
  if (!response.ok) throw Object.assign(new Error(`gateway ${response.status}: ${await response.text()}`), { status: 502 })
  const data: any = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw Object.assign(new Error('gateway 返回缺少 content'), { status: 502 })
  return content
}
