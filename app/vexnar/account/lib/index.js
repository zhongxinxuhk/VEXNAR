// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Host half of @vexnar/dsh-account.
 *
 * Login is delegated to NewAPI itself, so every method the deployment enables
 * works without re-implementing providers:
 *
 *   - discovery:  GET {newapi}/api/status -> password / oauth / passkey / 2FA
 *   - password:   POST {newapi}/api/user/login, then create an API key over the
 *                 session cookie
 *   - everything else (GitHub, GitCode, LinuxDO, OIDC, WeChat, Telegram,
 *     passkey, 2FA): a real Chrome window on the NewAPI origin; the user logs in
 *     there with whatever method is configured, and we read the session cookie,
 *     create an API key and close the window
 *   - manual:     API root + key, for deployments where automation is unwanted
 *
 * After any lane succeeds the key is handed to the Go gateway
 * (POST /api/desktop/llm/configure); the browser never receives the key or the
 * desktop token.
 */

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export const name = '@vexnar/dsh-account'

export const inject = ['webServer']

// ── configuration ──────────────────────────────────────────────────────────
function newapiBase() {
  return (process.env.VEXNAR_NEWAPI_BASE || 'https://api.sec.hn.cn').replace(/\/+$/, '')
}
function goBase() {
  return (process.env.VEXNAR_API_BASE || 'http://127.0.0.1:8787').replace(/\/+$/, '')
}
function desktopToken() {
  return process.env.VEXNAR_DESKTOP_TOKEN || ''
}

// ── helpers ────────────────────────────────────────────────────────────────
function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function newapiJson(path, init = {}, cookie = '') {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers || {}) }
  if (cookie) headers.Cookie = cookie
  const response = await fetch(`${newapiBase()}${path}`, { ...init, headers, redirect: 'manual' })
  const text = await response.text()
  let body
  try {
    body = text === '' ? {} : JSON.parse(text)
  } catch {
    body = { raw: text }
  }
  const setCookie = response.headers.getSetCookie?.() ?? []
  return { status: response.status, body, setCookie }
}

function cookieHeader(setCookie) {
  return setCookie.map((line) => line.split(';')[0]).join('; ')
}

async function goConfigure(apiKey, model) {
  const token = desktopToken()
  if (token === '') throw new Error('VEXNAR_DESKTOP_TOKEN 未设置，Go 网关未启用')
  const response = await fetch(`${goBase()}/api/desktop/llm/configure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-VEXNAR-Desktop-Token': token },
    body: JSON.stringify({
      provider: 'openai-responses',
      base_url: `${newapiBase()}/v1`,
      api_key: apiKey,
      model
    })
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Go 网关返回 HTTP ${response.status}`)
  return body
}

/** Create a NewAPI API key over an authenticated session. */
async function createApiKey(call, name) {
  const created = await call('/api/token/', {
    method: 'POST',
    body: JSON.stringify({ name, unlimited_quota: true, remain_quota: 0, expired_time: -1 })
  })
  if (created.status < 200 || created.status >= 300 || created.body?.success === false) {
    throw new Error(created.body?.message || `创建 API Key 失败 (HTTP ${created.status})`)
  }
  const list = await call(`/api/token/search?keyword=${encodeURIComponent(name)}`)
  const rows = list.body?.data?.items ?? list.body?.data ?? []
  const match = Array.isArray(rows)
    ? rows.find((row) => row?.name === name) ?? rows[0]
    : undefined
  if (!match?.id) throw new Error('创建成功但找不到该 API Key')
  const keyRes = await call(`/api/token/${match.id}/key`, { method: 'POST' })
  const key = keyRes.body?.data?.key
  if (!key) throw new Error(keyRes.body?.message || '读取 API Key 失败')
  return key
}

/** First model the key may use, used as the Go profile default. */
async function pickModel(apiKey) {
  const response = await fetch(`${newapiBase()}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  })
  if (!response.ok) return ''
  const body = await response.json().catch(() => ({}))
  return body?.data?.[0]?.id || ''
}

// ── browser lane state ─────────────────────────────────────────────────────
const browserLogin = { state: 'idle', message: '', user: '', startedAt: 0 }

async function runBrowserLogin() {
  Object.assign(browserLogin, { state: 'starting', message: '正在打开 Chrome…', user: '', startedAt: Date.now() })
  let context
  try {
    const { chromium } = await import('playwright-core')
    const profile = process.env.VEXNAR_BROWSER_PROFILE || join(process.cwd(), '.dsh-home', 'browser')
    await mkdir(profile, { recursive: true })
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chrome',
      headless: false,
      viewport: { width: 1100, height: 780 }
    })
    const page = context.pages()[0] ?? (await context.newPage())
    await page.goto(`${newapiBase()}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    browserLogin.state = 'waiting'
    browserLogin.message = '请在 Chrome 窗口里完成登录（任意已启用的方式）'

    const deadline = Date.now() + 5 * 60 * 1000
    let user = ''
    while (Date.now() < deadline) {
      if (context.pages().length === 0) throw new Error('登录窗口已关闭')
      const me = await page.request.get(`${newapiBase()}/api/user/self`).catch(() => null)
      if (me && me.ok()) {
        const body = await me.json().catch(() => ({}))
        if (body?.data?.username) {
          user = body.data.username
          break
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    if (user === '') throw new Error('等待登录超时')

    const call = async (path, init) => {
      const response = await page.request.fetch(`${newapiBase()}${path}`, {
        method: init?.method ?? 'GET',
        data: init?.body,
        headers: init?.body ? { 'Content-Type': 'application/json' } : undefined
      })
      const body = await response.json().catch(() => ({}))
      return { status: response.status(), body }
    }
    const key = await createApiKey(call, `vexnar-app-${Date.now()}`)
    const model = await pickModel(key)
    await goConfigure(key, model)
    Object.assign(browserLogin, { state: 'done', message: `已登录：${user}`, user })
  } catch (error) {
    Object.assign(browserLogin, { state: 'error', message: String(error?.message || error) })
  } finally {
    await context?.close().catch(() => {})
  }
}

// ── routes ─────────────────────────────────────────────────────────────────
export function apply(ctx) {
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/vexnar-account/methods',
      handler: async (_req, res) => {
        try {
          const status = await newapiJson('/api/status')
          const d = status.body?.data ?? {}
          const oauth = []
          if (d.github_oauth) oauth.push({ slug: 'github', name: 'GitHub' })
          if (d.linuxdo_oauth) oauth.push({ slug: 'linuxdo', name: 'LinuxDO' })
          if (d.oidc_enabled) oauth.push({ slug: 'oidc', name: d.oidc_display_name || 'OIDC' })
          if (d.wechat_login) oauth.push({ slug: 'wechat', name: '微信' })
          if (d.telegram_oauth) oauth.push({ slug: 'telegram', name: 'Telegram' })
          if (d.discord_oauth) oauth.push({ slug: 'discord', name: 'Discord' })
          for (const provider of d.custom_oauth_providers ?? []) {
            oauth.push({ slug: provider.slug, name: provider.name || provider.slug })
          }
          send(res, 200, {
            base: newapiBase(),
            password: d.password_login_enabled !== false,
            passkey: d.passkey_login === true,
            emailVerification: d.email_verification === true,
            turnstile: d.turnstile_check === true,
            oauth
          })
        } catch (error) {
          send(res, 502, { error: `读取 NewAPI 登录配置失败: ${String(error?.message || error)}` })
        }
      }
    })
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/vexnar-account/login/password',
      handler: async (req, res) => {
        try {
          const { username = '', password = '' } = await readJson(req)
          const login = await newapiJson('/api/user/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
          })
          if (login.status < 200 || login.status >= 300) {
            send(res, login.status, { error: login.body?.message || '登录失败' })
            return
          }
          const cookie = cookieHeader(login.setCookie)
          if (cookie === '') {
            send(res, 409, { error: login.body?.message || '该账号需要二次验证，请使用浏览器登录' })
            return
          }
          const call = (path, init) => newapiJson(path, init, cookie)
          const key = await createApiKey(call, `vexnar-app-${Date.now()}`)
          const model = await pickModel(key)
          const status = await goConfigure(key, model)
          send(res, 200, { ...status, model })
        } catch (error) {
          send(res, 400, { error: String(error?.message || error) })
        }
      }
    })
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/vexnar-account/login/browser',
      handler: async (_req, res) => {
        if (browserLogin.state === 'starting' || browserLogin.state === 'waiting') {
          send(res, 202, browserLogin)
          return
        }
        void runBrowserLogin()
        send(res, 202, browserLogin)
      }
    })
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/vexnar-account/login/browser/status',
      handler: async (_req, res) => send(res, 200, browserLogin)
    })
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/vexnar-account/login',
      handler: async (req, res) => {
        try {
          const payload = await readJson(req)
          const token = desktopToken()
          if (token === '') {
            send(res, 503, { error: 'VEXNAR_DESKTOP_TOKEN 未设置，Go 网关未启用' })
            return
          }
          const response = await fetch(`${goBase()}/api/desktop/llm/configure`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-VEXNAR-Desktop-Token': token },
            body: JSON.stringify(payload)
          })
          send(res, response.status, await response.json().catch(() => ({})))
        } catch (error) {
          send(res, 400, { error: String(error?.message || error) })
        }
      }
    })
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/vexnar-account/status',
      handler: async (_req, res) => {
        const token = desktopToken()
        if (token === '') {
          send(res, 503, { error: 'VEXNAR_DESKTOP_TOKEN 未设置，Go 网关未启用' })
          return
        }
        try {
          const response = await fetch(`${goBase()}/api/desktop/llm`, {
            headers: { 'X-VEXNAR-Desktop-Token': token }
          })
          send(res, response.status, await response.json().catch(() => ({})))
        } catch (error) {
          send(res, 502, { error: `Go 网关不可达: ${String(error?.message || error)}` })
        }
      }
    })
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/vexnar-account/logout',
      handler: async (_req, res) => {
        const token = desktopToken()
        if (token === '') {
          send(res, 503, { error: 'VEXNAR_DESKTOP_TOKEN 未设置，Go 网关未启用' })
          return
        }
        try {
          const response = await fetch(`${goBase()}/api/desktop/llm/clear`, {
            method: 'POST',
            headers: { 'X-VEXNAR-Desktop-Token': token }
          })
          send(res, response.status, await response.json().catch(() => ({})))
        } catch (error) {
          send(res, 502, { error: String(error?.message || error) })
        }
      }
    })
  )
}
