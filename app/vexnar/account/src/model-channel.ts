// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 引擎的模型通道：一个函数，不是端点。
 *
 * 以前这里是「在 dsh 进程里再起一个只监听 127.0.0.1 的 OpenAI 兼容服务」，
 * 引擎拿着 `VEXNAR_GATEWAY_URL` + 每次启动随机令牌回来访问自己所在的进程。
 * 那条路除了多开一个端口、多存一份令牌，没有任何收益：引擎与账号插件本来就在
 * 同一个进程里，提供方目录也在同一个闭包里。
 *
 * 现在宿主插件把 `createModelCompletion()` 的结果装进 core 的 `setModelCompletion`，
 * 引擎直接调用：没有监听、没有端口、没有令牌，上游密钥仍然只留在本进程内。
 */

/** 一次对话消息。与 core 的 `ChatMessage` 结构一致。 */
export interface ChatMessage {
  role: string
  content: string
}

/** 把一轮对话发给上游，拿回助手文本。 */
export type ModelCompletion = (messages: readonly ChatMessage[]) => Promise<string>

/**
 * 通道在 `catalog()` 结果上真正读的字段。`platform-account.ts` 的
 * `AccountProvider` 结构上可直接赋值（多出的 `retry` 不参与本模块）。
 */
export interface GatewayProvider {
  id: string
  name: string
  base: string
  key: string
  models: readonly { id: string }[]
}

/** JSON 对象：正文来自上游响应，字段逐个在使用点收窄。 */
type Fields = Record<string, unknown>

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 带 HTTP 状态码的错误；路由层的 catch 用它挑响应状态。 */
type StatusError = Error & { status: number }

function failure(status: number, message: string): StatusError {
  return Object.assign(new Error(message), { status })
}

/** 上游 `{ error: { message } }`：只有真值才拼进错误文本。 */
function upstreamError(data: unknown): string {
  if (!isFields(data) || !isFields(data.error)) return ''
  const message = data.error.message
  return message ? String(message) : ''
}

async function upstream(provider: GatewayProvider, path: string, payload: Fields): Promise<Fields> {
  let response: Response
  try {
    response = await fetch(`${provider.base.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.key}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180_000)
    })
  } catch {
    throw failure(502, `无法连接模型提供方 ${provider.name}`)
  }
  const text = await response.text()
  let data: unknown
  try {
    data = text === '' ? {} : JSON.parse(text)
  } catch {
    data = undefined
  }
  if (!response.ok) {
    const detail = upstreamError(data)
    throw failure(502, `${provider.name} 返回 ${response.status}${detail === '' ? '' : `：${detail}`}`)
  }
  if (data === undefined) throw failure(502, `${provider.name} 返回了无法解析的响应`)
  return isFields(data) ? data : {}
}

/**
 * 从两种上游形状里抠出文本：Responses 的 `output_text` / `output[].content[].text`，
 * 退到 chat 的 `choices[0].message.content`。
 */
function textOf(data: Fields): string {
  const outputText = data.output_text
  if (typeof outputText === 'string') return outputText
  const output = data.output
  if (Array.isArray(output)) {
    const parts = (output as unknown[]).flatMap((item) => {
      const content: unknown[] = isFields(item) && Array.isArray(item.content) ? item.content : []
      return content
    })
    return parts.map((part) => (isFields(part) && typeof part.text === 'string' ? part.text : '')).join('')
  }
  const choices = data.choices
  if (Array.isArray(choices)) {
    const first: unknown = choices[0]
    if (isFields(first) && isFields(first.message) && typeof first.message.content === 'string') return first.message.content
  }
  return ''
}

/**
 * 建一条进程内的模型通道。
 * @param getProviders 返回当前 `catalog()`（带 base/key/models）；每次调用现读，换号不用重启。
 * @param preferred 返回当前选定的模型名（宿主从设置里给），空则用目录第一行。
 * @returns 引擎直接调用的完成函数。
 */
export function createModelCompletion(
  getProviders: () => readonly GatewayProvider[],
  preferred?: () => string | undefined,
): ModelCompletion {
  return async (messages) => {
    const providers = getProviders()
    const primary = providers[0]
    if (primary === undefined) throw failure(503, '尚未配置可用的模型提供方')
    const model = (preferred?.() ?? '').trim() || primary.models[0]?.id || 'default'
    // chat 类提供方（DeepSeek / 自定义）优先走 /chat/completions；只有平台 Responses
    // 提供方时，把 messages 折成 `input` 再取回文本。
    const chat = providers.find((provider) => provider.id !== 'vexnar')
    const input = messages.map((message) => ({ role: message.role, content: message.content }))
    if (chat !== undefined) {
      return textOf(await upstream(chat, '/chat/completions', { model, messages: input, stream: false }))
    }
    const responses = providers.find((provider) => provider.id === 'vexnar') ?? primary
    return textOf(await upstream(responses, '/responses', { model, input, stream: false }))
  }
}
