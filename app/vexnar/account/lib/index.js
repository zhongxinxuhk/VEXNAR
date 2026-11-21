// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Host half of @vexnar/dsh-account.
 *
 * Model access is TypeScript end to end: login obtains a NewAPI API key, stores
 * it in dsh's credential store, and configures the pi-ai provider route so the
 * agent calls NewAPI directly. The Go desktop gateway is not involved.
 *
 * Login lanes (all methods the NewAPI deployment enables):
 *   - password:  POST {newapi}/api/user/login, then create an API key
 *   - everything else (GitHub/GitCode/Gitee/Modelscope/LinuxDO/OIDC/WeChat/
 *     Telegram/Discord/passkey/2FA): a real Chrome window on the NewAPI origin;
 *     the user logs in there and we read the session, create the key, close it
 *   - manual: paste an API key
 *
 * After any lane: credential `VEXNAR_NEWAPI_KEY` + settings namespace
 * `llm-pi-ai` provider `vexnar` (baseURL, model catalog) are written. Requests
 * resolve the credential per call, so rotating the key needs no restart.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const name = '@vexnar/dsh-account'

export const inject = ['webServer', 'credentials', 'settings']

const KEY_REF = 'VEXNAR_NEWAPI_KEY'
const PROVIDER = 'vexnar'

function newapiBase() {
  return (process.env.VEXNAR_NEWAPI_BASE || 'https://api.sec.hn.cn').replace(/\/+$/, '')
}
function accountFile() {
  const home = process.env.DSH_HOME || join(process.cwd(), '.dsh-home')
  return join(home, 'vexnar-account.json')
}

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
  const match = Array.isArray(rows) ? rows.find((row) => row?.name === name) ?? rows[0] : undefined
  if (!match?.id) throw new Error('创建成功但找不到该 API Key')
  const keyRes = await call(`/api/token/${match.id}/key`, { method: 'POST' })
  const key = keyRes.body?.data?.key
  if (!key) throw new Error(keyRes.body?.message || '读取 API Key 失败')
  return key
}

/** Model catalog for the pi-ai route: everything the key may call. */
async function listModels(apiKey) {
  const response = await fetch(`${newapiBase()}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  })
  if (!response.ok) return []
  const body = await response.json().catch(() => ({}))
  return (body?.data ?? [])
    .map((row) => ({ id: String(row?.id ?? ''), name: String(row?.name ?? row?.id ?? '') }))
    .filter((row) => row.id !== '')
}

async function persist(account) {
  const path = accountFile()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(account, null, 2)}\n`, { mode: 0o600 })
}

async function readAccount() {
  try {
    return JSON.parse(await readFile(accountFile(), 'utf8'))
  } catch {
    return null
  }
}

/** Write the credential and the provider route into dsh. */
async function applyAccount(ctx, account, key) {
  await ctx.credentials.set(KEY_REF, key)
  await ctx.settings.update('llm-pi-ai', {
    providers: {
      [PROVIDER]: {
        displayName: 'VEXNAR · NewAPI',
        api: 'openai-completions',
        baseURL: `${account.base}/v1`,
        apiKeyEnv: KEY_REF,
        models: account.models.map((model) => ({ id: model.id, name: model.name || model.id }))
      }
    }
  })
  await persist({ base: account.base, models: account.models, user: account.user ?? '', savedAt: Date.now() })
}

/** Re-apply the stored route on boot so a restart keeps working. */
async function restore(ctx) {
  const account = await readAccount()
  if (!account?.base || !Array.isArray(account.models) || account.models.length === 0) return
  const stored = await ctx.credentials.resolve(KEY_REF)
  if (!stored?.value) return
  await ctx.settings.update('llm-pi-ai', {
    providers: {
      [PROVIDER]: {
        displayName: 'VEXNAR · NewAPI',
        api: 'openai-completions',
        baseURL: `${account.base}/v1`,
        apiKeyEnv: KEY_REF,
        models: account.models.map((model) => ({ id: model.id, name: model.name || model.id }))
      }
    }
  })
}

function statusOf(account, credential) {
  return {
    configured: Boolean(credential?.value) && Boolean(account?.base),
    base: account?.base ?? newapiBase(),
    user: account?.user ?? '',
    models: account?.models?.length ?? 0,
    keySet: Boolean(credential?.value),
    model: account?.models?.[0]?.id ?? ''
  }
}

// ── browser lane ───────────────────────────────────────────────────────────
const browserLogin = { state: 'idle', message: '', user: '', startedAt: 0 }

async function runBrowserLogin(ctx) {
  Object.assign(browserLogin, { state: 'starting', message: '正在打开 Chrome…', user: '', startedAt: Date.now() })
  let context
  try {
    const { chromium } = await import('playwright-core')
    const home = process.env.DSH_HOME || join(process.cwd(), '.dsh-home')
    const profile = process.env.VEXNAR_BROWSER_PROFILE || join(home, 'browser')
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
      return { status: response.status(), body: await response.json().catch(() => ({})) }
    }
    const key = await createApiKey(call, `vexnar-app-${Date.now()}`)
    const models = await listModels(key)
    if (models.length === 0) throw new Error('读取模型列表失败')
    await applyAccount(ctx, { base: newapiBase(), user, models }, key)
    Object.assign(browserLogin, { state: 'done', message: `已登录：${user}`, user })
  } catch (error) {
    Object.assign(browserLogin, { state: 'error', message: String(error?.message || error) })
  } finally {
    await context?.close().catch(() => {})
  }
}

// ── routes ─────────────────────────────────────────────────────────────────
export function apply(ctx) {
  // Restore runs in the background: settings settles after every entry mounts,
  // so awaiting it inside apply would deadlock startup.
  void restore(ctx).catch((error) => console.warn('[vexnar-account] restore failed:', String(error?.message || error)))

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
          const models = await listModels(key)
          if (models.length === 0) throw new Error('读取模型列表失败')
          await applyAccount(ctx, { base: newapiBase(), user: username, models }, key)
          send(res, 200, statusOf({ base: newapiBase(), models, user: username }, { value: key }))
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
        void runBrowserLogin(ctx)
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
          const { base_url = '', api_key = '' } = await readJson(req)
          const base = String(base_url).replace(/\/+$/, '')
          const key = String(api_key).trim()
          if (base === '' || key === '') {
            send(res, 400, { error: 'base_url 与 api_key 必填' })
            return
          }
          const models = await listModels(key)
          if (models.length === 0) {
            send(res, 400, { error: '该 Key 读取不到模型列表' })
            return
          }
          await applyAccount(ctx, { base: base.replace(/\/v1$/, ''), user: '', models }, key)
          send(res, 200, statusOf({ base, models }, { value: key }))
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
        const account = await readAccount()
        const credential = await ctx.credentials.resolve(KEY_REF)
        send(res, 200, statusOf(account, credential))
      }
    })
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: '/vexnar-account/logout',
      handler: async (_req, res) => {
        await ctx.credentials.unset(KEY_REF)
        await persist({ base: '', models: [] })
        send(res, 200, { configured: false })
      }
    })
  )
}
