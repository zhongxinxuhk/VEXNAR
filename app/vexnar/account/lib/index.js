// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Host half of @vexnar/dsh-account.
 *
 * The client never sees the Go desktop token or any upstream API key. This
 * plugin registers three same-origin routes on the dsh web server and forwards
 * them to the Go desktop gateway:
 *
 *   GET  /vexnar-account/status  -> GET  /api/desktop/llm
 *   POST /vexnar-account/login   -> POST /api/desktop/llm/configure
 *   POST /vexnar-account/logout  -> POST /api/desktop/llm/clear
 *
 * Loopback only by composition: the dsh web server binds a loopback host and
 * the Go gateway rejects non-loopback callers.
 */

export const name = '@vexnar/dsh-account'

export const inject = ['webServer']

function apiBase() {
  return (process.env.VEXNAR_API_BASE || 'http://127.0.0.1:8787').replace(/\/+$/, '')
}

function desktopToken() {
  return process.env.VEXNAR_DESKTOP_TOKEN || ''
}

async function callGo(path, init) {
  const token = desktopToken()
  if (token === '') {
    return { status: 503, body: { error: 'VEXNAR_DESKTOP_TOKEN 未设置，Go 网关未启用' } }
  }
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-VEXNAR-Desktop-Token': token,
      ...(init?.headers || {})
    }
  })
  const text = await response.text()
  let body
  try {
    body = text === '' ? {} : JSON.parse(text)
  } catch {
    body = { raw: text }
  }
  return { status: response.status, body }
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

export function apply(ctx) {
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/vexnar-account/status',
      handler: async (_req, res) => {
        try {
          const { status, body } = await callGo('/api/desktop/llm', { method: 'GET' })
          send(res, status, body)
        } catch (error) {
          send(res, 502, { error: String(error?.message || error) })
        }
      }
    })
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/vexnar-account/login',
      handler: async (req, res) => {
        try {
          const payload = await readJson(req)
          const { status, body } = await callGo('/api/desktop/llm/configure', {
            method: 'POST',
            body: JSON.stringify(payload)
          })
          send(res, status, body)
        } catch (error) {
          send(res, 400, { error: String(error?.message || error) })
        }
      }
    })
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/vexnar-account/logout',
      handler: async (_req, res) => {
        try {
          const { status, body } = await callGo('/api/desktop/llm/clear', { method: 'POST' })
          send(res, status, body)
        } catch (error) {
          send(res, 502, { error: String(error?.message || error) })
        }
      }
    })
  )
}
