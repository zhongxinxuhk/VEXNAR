// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 引擎的模型网关：在 dsh 进程内起一个只监听 127.0.0.1 的 OpenAI 兼容端点，
 * 用登录时拿到的提供方密钥把请求转给上游。
 *
 * 以前这条路由由 Go 的 `/api/desktop/openai/v1` 提供（`gateway.ts` 里的
 * VEXNAR_GATEWAY_URL 默认指向 8787）。现在 Go 默认不在环，模型调用必须由 TS 侧
 * 自己给出同样的两类端点：
 *
 *   - `POST /chat/completions`：优先用 chat 类提供方（DeepSeek / 自定义）；只有平台
 *     Responses 提供方时，把 messages 折成 `input` 再取回文本；
 *   - `POST /responses`：优先用 Responses 提供方（平台）；只有 chat 类时反向折一次；
 *   - `GET /models`：汇总当前可用模型，便于引擎选名。
 *
 * 令牌每次启动随机生成，只通过 `VEXNAR_GATEWAY_TOKEN` 交给引擎；上游密钥不出进程。
 */

import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

const MAX_BODY = 4 * 1024 * 1024

/**
 * 网关在 `catalog()` 结果上真正读的字段。`platform-account.ts` 的
 * `AccountProvider` 结构上可直接赋值（多出的 `retry` 不参与本模块）。
 */
export interface GatewayProvider {
  id: string
  name: string
  base: string
  key: string
  models: readonly { id: string }[]
}

export interface ModelGateway {
  url: string
  token: string
  /** 关闭监听；调用方 await 到端口真正释放。 */
  close(): Promise<void>
}

/** JSON 对象：正文来自 HTTP 边界，字段逐个在使用点收窄。 */
type Fields = Record<string, unknown>

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 带 HTTP 状态码的错误；服务端的 catch 用它挑响应状态。 */
type StatusError = Error & { status: number }

function failure(status: number, message: string): StatusError {
  return Object.assign(new Error(message), { status })
}

function statusOf(error: unknown): number {
  if (isFields(error) && typeof error.status === 'number') return error.status
  return 502
}

function errorText(error: unknown): string {
  if (isFields(error) && typeof error.message === 'string') return error.message
  return '模型网关失败'
}

/** 上游 `{ error: { message } }`：只有真值才拼进错误文本。 */
function upstreamError(data: unknown): string {
  if (!isFields(data) || !isFields(data.error)) return ''
  const message = data.error.message
  return message ? String(message) : ''
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}

async function readBody(req: IncomingMessage): Promise<Fields> {
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Uint8Array>) {
    size += chunk.length
    if (size > MAX_BODY) throw failure(413, '请求正文过大')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw failure(400, '无效的 JSON 请求')
  }
  return isFields(parsed) ? parsed : {}
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
 * 退到 chat 的 `choices[0].message.content`。非字符串由调用点当空串处理。
 */
const textOf = (data: Fields): unknown => {
  const outputText = data.output_text
  if (outputText !== undefined && outputText !== null) return outputText
  const output = data.output
  if (Array.isArray(output)) {
    const items: unknown[] = output
    const parts = items.flatMap((item) => {
      const content: unknown[] = isFields(item) && Array.isArray(item.content) ? item.content : []
      return content
    })
    return parts.map((part) => (isFields(part) && part.text !== undefined && part.text !== null ? part.text : '')).join('')
  }
  const choices = data.choices
  if (Array.isArray(choices)) {
    const first: unknown = choices[0]
    if (isFields(first) && isFields(first.message)) return first.message.content
  }
  return undefined
}

function textValue(data: Fields): string {
  const text = textOf(data)
  return typeof text === 'string' ? text : ''
}

function chatOf(data: Fields): Fields {
  const content = textValue(data)
  return { object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }
}

function responsesOf(data: Fields): Fields {
  const text = textValue(data)
  return { object: 'response', output_text: text, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] }
}

/**
 * @param getProviders 返回 `catalog()` 的结果（带 base/key/models）
 * @returns `{ url, token, close }`
 */
export async function startModelGateway(getProviders: () => readonly GatewayProvider[]): Promise<ModelGateway> {
  // 默认每次启动随机；显式给了 VEXNAR_GATEWAY_TOKEN 就沿用（排障/对照用）。
  const token = process.env.VEXNAR_GATEWAY_TOKEN?.trim() || randomBytes(24).toString('hex')
  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/models') {
        const models = getProviders().flatMap((provider) => provider.models)
        return send(res, 200, { object: 'list', data: models })
      }
      if (req.method !== 'POST') return send(res, 405, { error: { message: '请求方法不受支持' } })
      if (req.headers['x-vexnar-desktop-token'] !== token) {
        return send(res, 401, { error: { message: '模型网关令牌无效' } })
      }
      const providers = getProviders()
      const primary = providers[0]
      if (primary === undefined) return send(res, 503, { error: { message: '尚未配置可用的模型提供方' } })
      const chat = providers.find((provider) => provider.id !== 'vexnar')
      const responses = providers.find((provider) => provider.id === 'vexnar') ?? primary
      const body = await readBody(req)
      const requested = body.model
      const model = typeof requested === 'string' && requested.trim() !== ''
        ? requested
        : (primary.models[0]?.id ?? 'default')

      if (req.url === '/chat/completions') {
        if (chat !== undefined) return send(res, 200, await upstream(chat, '/chat/completions', { ...body, model }))
        // 只有 Responses 提供方：messages → input，结果再折回 chat 形状。
        const messages = body.messages
        const created = await upstream(responses, '/responses', {
          model,
          input: Array.isArray(messages) ? messages : [],
          stream: false
        })
        return send(res, 200, chatOf(created))
      }
      if (req.url === '/responses') {
        const targetChat = chat ?? responses
        if (chat !== undefined) return send(res, 200, await upstream(chat, '/chat/completions', {
          model,
          messages: Array.isArray(body.input)
            ? body.input.map((item) => typeof item === 'string' ? { role: 'user', content: item } : item)
            : [],
          stream: false
        }).then(responsesOf))
        return send(res, 200, await upstream(targetChat, '/responses', { ...body, model }))
      }
      return send(res, 404, { error: { message: `未实现的网关端点 ${req.url}` } })
    } catch (error) {
      send(res, statusOf(error), { error: { message: errorText(error) } })
    }
  })

  await new Promise<void>((done, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', done)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('模型网关没有拿到监听端口')
  return {
    url: `http://127.0.0.1:${address.port}`,
    token,
    close: () => new Promise<void>((done) => server.close(() => done()))
  }
}
