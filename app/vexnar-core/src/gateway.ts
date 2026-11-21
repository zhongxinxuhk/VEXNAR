// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { runtimeMode } from './mode.ts'

/**
 * 引擎的模型通道。
 *
 * 上游 key 只住在桌面网关里（`/api/desktop/openai/v1/*`），引擎只拿每次启动的
 * 桌面令牌，不持有任何上游凭据。走哪条通道由运行时底座决定：
 *
 * - `ts`（默认）：同进程直接调 core 自己的桌面网关，不监听端口、不依赖 Go；
 * - `go`：POST 到 `VEXNAR_GATEWAY_URL`（默认 8787 的 Go 回环网关），沿用旧路径。
 */

type Message = { role: string; content: string }

function model() {
  return process.env.VEXNAR_GATEWAY_MODEL || 'deepseek-flash'
}

function inProcess() {
  return runtimeMode() === 'ts' && !process.env.VEXNAR_GATEWAY_URL?.trim()
}

function desktopToken() {
  return (process.env.VEXNAR_GATEWAY_TOKEN || process.env.VEXNAR_DESKTOP_TOKEN || '').trim()
}

/** 引擎能不能调模型：ts 模式只要能拿到桌面令牌（网关在进程内），go 模式要求网关令牌。 */
export function gatewayAvailable() {
  if (inProcess()) return Boolean(desktopToken())
  return Boolean(process.env.VEXNAR_GATEWAY_TOKEN)
}

async function post(path: string, body: unknown): Promise<Response> {
  if (inProcess()) {
    const token = desktopToken()
    if (!token) throw Object.assign(new Error('VEXNAR_DESKTOP_TOKEN 未配置，模型调用不可用'), { status: 503 })
    const { api } = await import('./routes.ts')
    return await api.fetch(new Request(`http://vexnar-core/api/desktop/openai/v1${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-vexnar-desktop-token': token },
      body: JSON.stringify(body)
    }))
  }
  const base = (process.env.VEXNAR_GATEWAY_URL || 'http://127.0.0.1:8787/api/desktop/openai/v1').replace(/\/$/, '')
  const token = process.env.VEXNAR_GATEWAY_TOKEN || ''
  if (!token) throw Object.assign(new Error('VEXNAR_GATEWAY_TOKEN 未配置，模型调用不可用'), { status: 503 })
  return await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vexnar-desktop-token': token },
    body: JSON.stringify(body)
  })
}

async function responsesComplete(messages: Message[]) {
  const response = await post('/responses', { model: model(), input: messages, stream: false })
  if (!response.ok) throw Object.assign(new Error(`gateway responses ${response.status}: ${await response.text()}`), { status: 502 })
  const data: any = await response.json()
  const direct = data?.output_text ?? data?.output?.[0]?.content?.[0]?.text ?? data?.choices?.[0]?.message?.content
  if (typeof direct === 'string') return direct
  throw Object.assign(new Error('responses 返回缺少文本'), { status: 502 })
}

export async function gatewayComplete(messages: Message[]) {
  const response = await post('/chat/completions', { model: model(), messages, stream: false })
  if (response.status === 409) {
    const text = await response.text()
    if (text.includes('openai-responses')) return responsesComplete(messages)
    throw Object.assign(new Error(`gateway 409: ${text}`), { status: 502 })
  }
  if (!response.ok) throw Object.assign(new Error(`gateway ${response.status}: ${await response.text()}`), { status: 502 })
  const data: any = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw Object.assign(new Error('gateway 返回缺少 content'), { status: 502 })
  return content
}
