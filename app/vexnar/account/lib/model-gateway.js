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
import { createServer } from 'node:http'

const MAX_BODY = 4 * 1024 * 1024

function send(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw Object.assign(new Error('请求正文过大'), { status: 413 })
    chunks.push(chunk)
  }
  if (size === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('无效的 JSON 请求'), { status: 400 })
  }
}

async function upstream(provider, path, payload) {
  let response
  try {
    response = await fetch(`${provider.base.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.key}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180_000)
    })
  } catch {
    throw Object.assign(new Error(`无法连接模型提供方 ${provider.name}`), { status: 502 })
  }
  const text = await response.text()
  let data
  try {
    data = text === '' ? {} : JSON.parse(text)
  } catch {
    data = undefined
  }
  if (!response.ok) {
    throw Object.assign(new Error(`${provider.name} 返回 ${response.status}${data?.error?.message ? `：${data.error.message}` : ''}`), { status: 502 })
  }
  if (data === undefined) throw Object.assign(new Error(`${provider.name} 返回了无法解析的响应`), { status: 502 })
  return data
}

const textOf = (data) => data?.output_text ??
  data?.output?.flatMap((item) => item?.content ?? []).map((part) => part?.text ?? '').join('') ??
  data?.choices?.[0]?.message?.content

function chatOf(data) {
  const content = typeof textOf(data) === 'string' ? textOf(data) : ''
  return { object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }
}

function responsesOf(data) {
  const text = typeof textOf(data) === 'string' ? textOf(data) : ''
  return { object: 'response', output_text: text, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] }
}

/**
 * @param getProviders 返回 `catalog()` 的结果（带 base/key/models）
 * @returns `{ url, token, close }`
 */
export async function startModelGateway(getProviders) {
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
      if (providers.length === 0) return send(res, 503, { error: { message: '尚未配置可用的模型提供方' } })
      const chat = providers.find((provider) => provider.id !== 'vexnar') ?? undefined
      const responses = providers.find((provider) => provider.id === 'vexnar') ?? providers[0]
      const body = await readBody(req)
      const model = typeof body.model === 'string' && body.model.trim() !== ''
        ? body.model
        : (providers[0].models[0]?.id ?? 'default')

      if (req.url === '/chat/completions') {
        const target = chat ?? responses
        if (chat) return send(res, 200, await upstream(chat, '/chat/completions', { ...body, model }))
        // 只有 Responses 提供方：messages → input，结果再折回 chat 形状。
        const created = await upstream(responses, '/responses', {
          model,
          input: Array.isArray(body.messages) ? body.messages : [],
          stream: false
        })
        return send(res, 200, chatOf(created))
      }
      if (req.url === '/responses') {
        const targetChat = chat ?? responses
        if (chat) return send(res, 200, await upstream(chat, '/chat/completions', {
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
      send(res, error?.status ?? 502, { error: { message: error?.message ?? '模型网关失败' } })
    }
  })

  await new Promise((done, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', done)
  })
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    token,
    close: () => new Promise((done) => server.close(() => done()))
  }
}
