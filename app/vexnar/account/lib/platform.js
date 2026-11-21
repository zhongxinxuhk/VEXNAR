// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

const namespace = '/api/desktop/vexnar'
const clientPrefix = '/vexnar-api/platform'
const adapterRef = 'VEXNAR_LOOPBACK_ADAPTER'
const loopback = new Set(['127.0.0.1', '[::1]'])
const platform = () => new URL(process.env.VEXNAR_NEWAPI_PLATFORM || 'https://platform.sec.hn.cn').origin
const token = () => process.env.VEXNAR_DESKTOP_TOKEN?.trim()

function goOrigin() {
  const base = new URL(process.env.VEXNAR_GO_URL || 'http://127.0.0.1:8787')
  if (!['http:', 'https:'].includes(base.protocol) || !loopback.has(base.hostname) || base.username || base.password) {
    throw new Error('VEXNAR_GO_URL 必须指向本机 Go 服务')
  }
  return base.origin
}

async function go(path, method = 'GET', input) {
  if (!token()) throw new Error('缺少 VEXNAR Go 服务的启动令牌')
  let response
  try {
    response = await fetch(goOrigin() + namespace + path, {
      method,
      headers: { 'X-VEXNAR-Desktop-Token': token(), 'Content-Type': 'application/json' },
      body: input === undefined ? undefined : JSON.stringify(input),
      redirect: 'error',
      signal: AbortSignal.timeout(90_000)
    })
  } catch {
    throw new Error('无法连接本机 VEXNAR Go 服务')
  }
  const body = await response.json()
  if (!response.ok) {
    const error = body.error?.includes('桌面端令牌无效') ? 'VEXNAR 启动令牌与 Go 服务不匹配' : body.error
    throw Object.assign(new Error(error || `Go HTTP ${response.status}`), { status: response.status })
  }
  return body
}

async function methods() {
  const response = await fetch(platform() + '/api/status', {
    redirect: 'error', signal: AbortSignal.timeout(10_000)
  })
  const body = await response.json()
  if (!response.ok || body.success !== true || !body.data) throw new Error('无法读取 HXSEC AI Platform 登录方式')
  const d = body.data
  const names = [
    [d.password_login_enabled, '密码'], [d.passkey_login, 'Passkey'],
    [d.github_oauth, 'GitHub'], [d.linuxdo_oauth, 'LinuxDO'],
    [d.oidc_enabled, d.oidc_display_name || 'OIDC'],
    [d.wechat_login, '微信'], [d.telegram_oauth, 'Telegram'], [d.discord_oauth, 'Discord']
  ].filter(([enabled]) => enabled === true).map(([, name]) => name)
  for (const provider of d.custom_oauth_providers ?? []) {
    if (provider.name || provider.slug) names.push(provider.name || provider.slug)
  }
  return { platform: platform(), methods: [...new Set(names)] }
}

async function readJson(req) {
  const chunks = []
  let length = 0
  for await (const chunk of req) {
    length += chunk.length
    if (length > 16_384) throw Object.assign(new Error('请求正文过大'), { status: 413 })
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('无效的 JSON 请求'), { status: 400 })
  }
}

async function capturePlatformLogin(context, page, origin, signal) {
  // Observe only this isolated browser's successful requests to the configured platform.
  // Current deployments return a short-lived auth bundle; older ones use a session cookie.
  let proof
  const observe = async (response) => {
    try {
      const url = new URL(response.url())
      if (url.origin !== origin || !response.ok() || !url.pathname.startsWith('/api/')) return
      const identityRequest = url.pathname === '/api/user/self'
      const knownAuthRequest = url.pathname.startsWith('/api/user/auth/') ||
        url.pathname.startsWith('/api/oauth/') || url.pathname === '/api/user/login'
      // New platform builds may return the same explicit auth bundle from a new OAuth endpoint.
      if (!identityRequest && !knownAuthRequest && response.request().method() !== 'POST') return
      const body = await response.json()
      const data = body.data
      if (!identityRequest && !knownAuthRequest && !data?.session?.sid) return
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
  let catalog = new Map()
  let browserState = { state: 'idle', message: '' }
  let browserTask
  let chrome
  let operations = Promise.resolve()
  const life = new AbortController()
  const serial = (operation) => {
    const next = operations.then(operation)
    operations = next.catch(() => {})
    return next
  }

  const syncCatalog = async (status) => {
    const providers = Object.fromEntries(status.providers.map(provider => [provider.id, {
      displayName: provider.name,
      api: 'openai-completions',
      baseURL: `${goOrigin()}${namespace}/openai/${provider.id}/v1`,
      apiKeyEnv: adapterRef,
      models: provider.models.map(({ id, name }) => ({ id, name: name || id }))
    }]))
    const fingerprint = JSON.stringify(providers)
    if (fingerprint !== lastCatalog) {
      await ctx.settings.replace('llm-pi-ai', { providers })
      catalog = new Map(Object.entries(providers))
      lastCatalog = fingerprint
    }
    const current = ctx.agentDefaultModel.currentSelection()
    if (status.providers.length && !catalog.get(current.provider)?.models.some(model => model.id === current.model)) {
      const first = status.providers[0]
      await ctx.agentDefaultModel.saveSelection({ provider: first.id, model: first.models[0].id })
    }
    return status
  }
  let lastCatalog
  const refresh = async () => {
    try {
      return await syncCatalog(await go('/account'))
    } catch (error) {
      await syncCatalog({ providers: [] })
      throw error
    }
  }
  // Keep ordinary settings available, but route all provider writes and discovery
  // through VEXNAR's Go service. Exact owner-only HTTP routes precede Typert RPC.
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
            code: 'settings/rejected', message: '请在 VEXNAR 的模型设置中管理提供方', details: {}
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

  // The adapter receives a non-secret placeholder. The actual loopback token is
  // added to requests for the exact Go URL at dispatch time.
  ctx.on('llm-pi-ai/request-headers', (request, headers, next) => {
    const provider = catalog.get(request.provider)
    if (!provider || provider.baseURL !== request.baseURL || !token()) {
      throw new Error('请通过 VEXNAR 设置选择已验证的模型')
    }
    headers.set('X-VEXNAR-Desktop-Token', token())
    return next()
  })

  function startLogin() {
    if (browserTask) return browserState
    browserState = { state: 'waiting', message: '请在浏览器中完成 HXSEC AI Platform 登录' }
    browserTask = (async () => {
      try {
        const status = await serial(refresh)
        if (status.signed_in) throw new Error('请先退出当前 VEXNAR 账号')
        const { chromium } = await import('playwright-core')
        chrome = await chromium.launch({
          channel: process.env.VEXNAR_LOGIN_BROWSER || 'chrome',
          headless: false, ignoreDefaultArgs: ['--enable-automation']
        })
        life.signal.throwIfAborted()
        const context = await chrome.newContext()
        const page = await context.newPage()
        const proof = await capturePlatformLogin(context, page, platform(), life.signal)
        await serial(async () => syncCatalog(await go('/account', 'POST', proof)))
        browserState = { state: 'done', message: '已登录 HXSEC AI Platform' }
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
        if (req.method !== 'GET' && req.headers['content-type']?.split(';')[0] !== 'application/json') {
          return send(415, { error: '需要 application/json 请求' })
        }
        try {
          send(200, await handler(req))
        } catch (error) {
          send(error?.status || 502, { error: error?.message || 'VEXNAR 请求失败' })
        }
      }
    }))
  }

  route('/methods', { GET: methods })
  route('/account', {
    GET: () => serial(refresh),
    DELETE: () => serial(async () => {
      if (browserTask) throw Object.assign(new Error('请关闭平台登录窗口后再试'), { status: 409 })
      return syncCatalog(await go('/account', 'DELETE'))
    })
  })
  route('/login', { POST: startLogin, GET: () => browserState })
  route('/providers', {
    POST: async req => {
      const input = await readJson(req)
      return serial(async () => syncCatalog(await go('/providers', 'POST', input)))
    },
    DELETE: async req => {
      const { id } = await readJson(req)
      if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) {
        throw Object.assign(new Error('无效的模型提供方'), { status: 400 })
      }
      return serial(async () => syncCatalog(await go(`/providers/${id}`, 'DELETE')))
    }
  })

  const refreshInBackground = () => void serial(refresh).catch(() => {})
  ctx.effect(() => {
    const timer = setInterval(refreshInBackground, 15_000)
    timer.unref()
    refreshInBackground()
    return () => {
      clearInterval(timer)
      life.abort()
      void chrome?.close().catch(() => {})
    }
  })
}
