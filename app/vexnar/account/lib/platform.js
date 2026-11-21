// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * VEXNAR 账号插件：登录壳、模型提供方注册、启动门禁。
 *
 * 账号状态与平台交互都在 ./platform-account.js 里完成（TS 直连 HXSEC AI
 * Platform），这里只做三件事：
 *   1. 未登录时用登录页替换工作区，并用 connection.admit 把其他请求挡在 401；
 *   2. 登录后把平台模型与用户自带提供方写进 llm-pi-ai，密钥进 dsh 凭据库；
 *   3. 把 /vexnar-api/platform/* 暴露给登录页与设置页。
 *
 * 这里不再拼 Go 的地址、不再注入 X-VEXNAR-Desktop-Token：模型请求由 dsh 直接
 * 发往上游，密钥按请求从凭据库解析。
 */

import { readFile } from 'node:fs/promises'
import { loginPage, workspaceSessionScript } from './login-page.js'
import { startModelGateway } from './model-gateway.js'
import {
  catalog,
  createPlatformAccount,
  gateOpen,
  PlatformError,
  platformOrigin,
  publicView
} from './platform-account.js'

const clientPrefix = '/vexnar-api/platform'
const maxBody = 16 * 1024

/** 凭据名必须是 POSIX shell 标识符，提供方 id 里的 `-` 换成 `_`。 */
function credentialName(providerID) {
  return `VEXNAR_${providerID.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}_API_KEY`
}

async function readJson(req) {
  const chunks = []
  let length = 0
  for await (const chunk of req) {
    length += chunk.length
    if (length > maxBody) throw new PlatformError(413, '请求正文过大')
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (raw.trim() === '') return {}
  try {
    return JSON.parse(raw)
  } catch {
    throw new PlatformError(400, '无效的 JSON 请求')
  }
}

async function capturePlatformLogin(context, page, origin, signal) {
  // Observe only this isolated browser's successful requests to the configured platform.
  // Current deployments return a short-lived auth bundle; older ones use a session cookie.
  let proof
  const observe = async (response) => {
    try {
      const url = new URL(response.url())
      if (url.origin !== origin || !response.ok()) return
      const identityRequest = url.pathname === '/api/user/self'
      const authResponse = /^\/api\/(?:oauth\/[a-z0-9_-]+|user\/(?:auth\/refresh|login(?:\/verify|\/2fa|\/passkey\/finish)?|passkey\/login\/finish))$/i.test(url.pathname)
      if (!identityRequest && !authResponse) return
      const body = await response.json()
      const data = body.data
      const userID = data?.user?.id ?? (identityRequest ? data?.id : undefined)
      if (body.success !== true || !Number.isSafeInteger(userID) || userID <= 0) return
      const authorization = data?.access_token
        ? `Bearer ${data.access_token}`
        : await response.request().headerValue('authorization')
      const cookie = (await response.request().headerValue('cookie')) ?? ''
      if (authorization || cookie) proof = { user_id: userID, authorization, cookie }
    } catch {
      // OAuth navigation may close a request before its response can be read.
    }
  }
  context.on('response', observe)
  try {
    await page.goto(origin + '/login', { waitUntil: 'domcontentloaded', timeout: 30_000 })
    const deadline = Date.now() + 5 * 60 * 1000
    while (Date.now() < deadline) {
      signal.throwIfAborted()
      if (proof) return proof
      if (context.pages().length === 0 || page.isClosed()) throw new Error('登录窗口已关闭')
      if (new URL(page.url()).origin === origin) {
        const userID = await page.evaluate(() => {
          try {
            return Number(JSON.parse(localStorage.getItem('user') ?? 'null')?.id ?? localStorage.getItem('uid'))
          } catch {
            return 0
          }
        }).catch(() => 0)
        if (Number.isSafeInteger(userID) && userID > 0) {
          const cookie = (await context.cookies(origin + '/api/user/self')).map(item => `${item.name}=${item.value}`).join('; ')
          if (cookie) {
            const me = await context.request.get(origin + '/api/user/self', {
              headers: { 'New-Api-User': String(userID) }, maxRedirects: 0, timeout: 3_000
            }).then(res => res.ok() ? res.json() : null).catch(() => null)
            if (me?.success === true && me.data?.id === userID) return { user_id: userID, cookie }
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 750))
    }
    throw new Error('等待平台登录超时，请重试')
  } finally {
    context.off('response', observe)
  }
}

export function installPlatform(ctx) {
  const account = createPlatformAccount()
  let ready = false
  let lastCatalog = ''
  let syncedProviders = new Set()
  let browserState = { state: 'idle', message: '' }
  let lastState
  let gateway
  let browserTask
  let chrome
  const life = new AbortController()
  const activeSockets = new Set()
  const setReady = (value) => {
    ready = value
    if (!ready) {
      for (const socket of activeSockets) socket.destroy()
      activeSockets.clear()
    }
  }

  /**
   * 把账号里的提供方写进 llm-pi-ai：baseURL 指向真实上游，apiKeyEnv 指向本插件
   * 刚写进凭据库的键。dsh 每次请求自己解析密钥，不经过任何中转进程。
   */
  /**
   * 引擎的模型调用走这里：一次启动、按请求读当前目录，登录换号或加提供方都不用重启。
   * 以前这条路由是 Go 的 /api/desktop/openai/v1，现在由本进程给出同样的契约。
   */
  const ensureGateway = async () => {
    if (gateway) return gateway
    gateway = await startModelGateway(() => catalog(lastState))
    process.env.VEXNAR_GATEWAY_URL = gateway.url
    process.env.VEXNAR_GATEWAY_TOKEN = gateway.token
    console.log(`[vexnar] 模型网关 ${gateway.url}`)
    return gateway
  }

  const syncCatalog = async (state) => {
    lastState = state
    const providers = {}
    const present = new Set()
    for (const provider of catalog(state)) {
      const ref = credentialName(provider.id)
      await ctx.credentials.set(ref, provider.key)
      present.add(provider.id)
      providers[provider.id] = {
        displayName: provider.name,
        api: provider.id === 'vexnar' ? 'openai-responses' : 'openai-completions',
        baseURL: provider.base,
        apiKeyEnv: ref,
        models: provider.models,
        // 只有「所有错误都重试」需要显式写入；normal 就是适配器自己的默认策略，
        // 写进去只会把默认值冻结在这一版代码上。
        ...provider.retry === 'always' ? { retryPolicy: { mode: 'always' } } : {}
      }
    }
    for (const id of syncedProviders) {
      if (!present.has(id)) await ctx.credentials.unset(credentialName(id)).catch(() => {})
    }
    syncedProviders = present

    const fingerprint = JSON.stringify(providers)
    if (fingerprint !== lastCatalog) {
      await ctx.settings.replace('llm-pi-ai', { providers })
      lastCatalog = fingerprint
    }

    const first = Object.keys(providers)[0]
    if (first && providers[first].models[0]) process.env.VEXNAR_GATEWAY_MODEL = providers[first].models[0].id
    if (Object.keys(providers).length > 0) await ensureGateway()

    const current = ctx.agentDefaultModel.currentSelection()
    const selected = providers[current.provider]?.models.find((model) => model.id === current.model)
    if (!selected) {
      const [firstID] = Object.keys(providers)
      if (firstID) await ctx.agentDefaultModel.saveSelection({ provider: firstID, model: providers[firstID].models[0].id })
    }
    setReady(gateOpen(state))
    return publicView(state)
  }

  /** 一次刷新：读状态 → 同步目录 → 返回给浏览器的视图。 */
  const refresh = async () => syncCatalog(await account.read())

  // The pinned carrier routes Workspace RPC and stream upgrades through the
  // same Host admission. Keep the carrier's origin/cookie checks for every route.
  const startupPaths = new Set(['entry.js', 'ready', 'methods', 'account', 'login', 'login/password', 'login/verify']
    .map(path => clientPrefix + '/' + path))
  ctx.effect(() => {
    const connection = ctx.connection[Symbol.for('cordis.original')] ?? ctx.connection
    const admit = connection.admit
    const ownAdmission = Object.getOwnPropertyDescriptor(connection, 'admit')
    const guarded = function (request) {
      const result = admit.call(this, request)
      if ('rejection' in result) return result
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      if (!ready && !startupPaths.has(path)) return { rejection: 401 }
      const socket = request.socket
      if (request.headers?.upgrade?.toLowerCase() === 'websocket' && socket && !activeSockets.has(socket)) {
        activeSockets.add(socket)
        socket.once('close', () => activeSockets.delete(socket))
      }
      return result
    }
    connection.admit = guarded
    return () => {
      setReady(false)
      if (connection.admit === guarded) {
        if (ownAdmission) Object.defineProperty(connection, 'admit', ownAdmission)
        else delete connection.admit
      }
    }
  })

  // 未登录时整个工作区换成登录页：没有半登录状态，也没有"能动但全是空数据"的控制台。
  ctx.effect(() => ctx.webServer.tapIndex(html => ready
    ? html.replace('</head>', workspaceSessionScript + '</head>')
    : loginPage))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: clientPrefix + '/entry.js',
    handler: async (req, res) => {
      const rejection = ctx.connection.requestRejection(req)
      if (rejection || req.method !== 'GET') {
        res.writeHead(rejection || 405)
        return res.end()
      }
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(await readFile(new URL('./login-client.js', import.meta.url)))
    }
  }))

  // Keep ordinary settings available, but route provider writes and discovery
  // through VEXNAR's own model section. Exact owner-only HTTP routes precede Typert RPC.
  for (const method of ['update', 'replace', 'mutate', 'discoverModels']) {
    const rpcNamespace = method === 'discoverModels' ? 'llm' : 'settings'
    ctx.connection.fetch.register({
      path: `/api/${rpcNamespace}/${method}`, methods: ['POST'],
      fetch: async (request) => {
        const message = await request.json().catch(() => null)
        if (message?.type !== 'client-request' || typeof message.rpcId !== 'string' ||
            message.method !== `${rpcNamespace}/${method}` || !message.payload?.args) {
          return new Response('invalid request', { status: 400 })
        }
        const respond = result => Response.json({ type: 'server-response', rpcId: message.rpcId, result })
        if (rpcNamespace === 'llm' || message.payload.args.ns === 'llm-pi-ai') {
          return respond({ ok: false, error: {
            code: 'settings/rejected', message: '请在 VEXNAR 的 设置 → 模型 中管理提供方', details: {}
          } })
        }
        const peer = ctx.connection.createPeer({ principal: { kind: 'owner' } })
        try {
          const value = await ctx.typertGateway.invoke({
            namespace: rpcNamespace, method, args: message.payload.args, signal: request.signal, peer
          })
          return respond({ ok: true, value })
        } catch (error) {
          return respond({ ok: false, error: {
            code: error.code || 'settings/rejected', message: error.message, details: error.details || {}
          } })
        } finally {
          await peer.dispose()
        }
      }
    })
  }

  function startLogin() {
    if (browserTask) return browserState
    browserState = { state: 'waiting', message: '请在浏览器中完成 HXSEC AI Platform 登录' }
    browserTask = (async () => {
      try {
        const status = await refresh()
        if (status.signed_in) throw new Error('请先退出当前 VEXNAR 账号')
        const { chromium } = await import('playwright-core')
        chrome = await chromium.launch({
          channel: process.env.VEXNAR_LOGIN_BROWSER || 'chrome',
          headless: false, ignoreDefaultArgs: ['--enable-automation']
        })
        life.signal.throwIfAborted()
        const context = await chrome.newContext()
        const page = await context.newPage()
        const proof = await capturePlatformLogin(context, page, platformOrigin(), life.signal)
        const result = await account.login(proof)
        await syncCatalog(await account.read())
        browserState = { state: 'done', message: '已验证 HXSEC AI Platform 身份' }
        if (result.signed_in) console.log('vexnar: account-handoff')
      } catch (error) {
        browserState = {
          state: 'error',
          message: String(error?.message ?? '').includes('Executable')
            ? '找不到登录浏览器，请安装 Google Chrome，或设置 VEXNAR_LOGIN_BROWSER'
            : error?.status ? error.message : chrome ? '登录未完成。请在平台窗口完成验证后重试。' : (error?.message || '无法打开平台登录')
        }
      } finally {
        await chrome?.close().catch(() => {})
        chrome = undefined
        browserTask = undefined
      }
    })()
    return browserState
  }

  function route(suffix, handlers) {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: clientPrefix + suffix,
      handler: async (req, res) => {
        const send = (status, body) => {
          res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(body))
        }
        const rejection = ctx.connection.requestRejection(req)
        if (rejection) return send(rejection, { error: '请从本机 VEXNAR 客户端访问' })
        const handler = handlers[req.method]
        if (!handler) return send(405, { error: '请求方法不受支持' })
        // 只有带正文的请求才要求 JSON；DELETE /account 这类无正文调用不该被 415 拦住。
        const hasBody = Number(req.headers['content-length'] ?? 0) > 0 ||
          req.headers['transfer-encoding'] !== undefined
        if (hasBody && req.headers['content-type']?.split(';')[0] !== 'application/json') {
          return send(415, { error: '需要 application/json 请求' })
        }
        try {
          send(200, await handler(req))
        } catch (error) {
          // 账号层只会抛 PlatformError；其他异常也翻成人话，绝不把解析器原文丢给页面。
          const status = error instanceof PlatformError ? error.status : 502
          send(status, { error: error instanceof PlatformError ? error.message : 'VEXNAR 请求失败，请重试' })
        }
      }
    }))
  }

  route('/ready', { GET: () => ({ ready }) })
  route('/methods', { GET: () => account.methods() })
  route('/account', {
    GET: () => refresh(),
    DELETE: async () => {
      if (browserTask) throw new PlatformError(409, '请关闭平台登录窗口后再试')
      await account.logout()
      return syncCatalog(await account.read())
    }
  })
  route('/login', { POST: startLogin, GET: () => browserState })
  route('/login/password', {
    POST: async (req) => {
      const input = await readJson(req)
      const result = await account.password(input.username, input.password)
      if (result?.challenge) return result
      return syncCatalog(await account.read())
    }
  })
  route('/login/verify', {
    POST: async (req) => {
      const input = await readJson(req)
      await account.verify(input.challenge, input.code)
      return syncCatalog(await account.read())
    }
  })
  route('/providers', {
    POST: async (req) => {
      const input = await readJson(req)
      await account.addProvider(input)
      return syncCatalog(await account.read())
    },
    PATCH: async (req) => {
      const input = await readJson(req)
      await account.updateProvider(input)
      return syncCatalog(await account.read())
    },
    DELETE: async (req) => {
      const { id } = await readJson(req)
      await account.removeProvider(id)
      return syncCatalog(await account.read())
    }
  })

  const refreshInBackground = () => void refresh().catch(() => {})
  ctx.effect(() => {
    const timer = setInterval(refreshInBackground, 15_000)
    timer.unref()
    refreshInBackground()
    return () => {
      clearInterval(timer)
      life.abort()
      void chrome?.close().catch(() => {})
      void gateway?.close().catch(() => {})
      gateway = undefined
    }
  })
  return () => ready
}
