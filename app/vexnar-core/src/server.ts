// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { auth, serviceToken } from './auth.js'
import { api } from './routes.js'
import { ensureInterceptRulesSeeded } from './intercept-seed.ts'
import { runtimeInfo, runtimeMode, startRuntime } from './runtime.ts'

const app = new Hono()
const fallback = (process.env.VEXNAR_GO_FALLBACK || '').replace(/\/$/, '')
const fallbackAllow = (process.env.VEXNAR_FALLBACK_ALLOW || '')
  .split(',')
  .map((prefix) => prefix.trim())
  .filter(Boolean)
const fallbackMethods = (process.env.VEXNAR_FALLBACK_METHODS || '')
  .split(',')
  .map((method) => method.trim().toUpperCase())
  .filter(Boolean)

app.use('/api/*', cors({ origin: (origin) => origin ?? '*', allowHeaders: ['authorization', 'content-type', 'x-vexnar-token'], allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'] }))
app.use('/api/*', auth)
app.route('/', api)

/** Routes the TypeScript core serves natively; everything else is proxied. */
const NATIVE = [
  '/api/health', '/api/agents', '/api/llm/profiles', '/api/task-categories', '/api/task-templates',
  '/api/companies', '/api/tools', '/api/mcp', '/api/notify/channels', '/api/settings',
  '/api/tasks', '/api/assets', '/api/exploration/findings', '/api/exploration/nodes'
]

app.get('/api/_migration', (c) => c.json({
  mode: runtimeMode(), native: NATIVE, fallback: fallback || null,
  methods: fallbackMethods.length ? fallbackMethods : 'all', allow: fallbackAllow.length ? fallbackAllow : 'all'
}))

// M3 transition: unported routes fall through to the Go service, so the web
// console can point at the TS core before every write is migrated.
app.all('/api/*', async (c) => {
  if (!fallback) {
    return c.json({ error: 'route not migrated', path: c.req.path, fallback: null }, 501)
  }
  if (fallbackMethods.length && !fallbackMethods.includes(c.req.method)) {
    return c.json({ error: 'method not proxied', path: c.req.path, method: c.req.method, allowed: fallbackMethods }, 501)
  }
  if (fallbackAllow.length && !fallbackAllow.some((prefix) => c.req.path.startsWith(prefix))) {
    return c.json({ error: 'path not proxied', path: c.req.path, allow: fallbackAllow }, 501)
  }
  const url = new URL(c.req.url)
  const target = `${fallback}${url.pathname}${url.search}`
  const headers = new Headers()
  if (!c.req.header('authorization')) headers.set('authorization', `Bearer ${serviceToken()}`)
  for (const key of ['authorization', 'cookie', 'content-type', 'accept', 'x-requested-with']) {
    const value = c.req.header(key)
    if (value) headers.set(key, value)
  }
  const body = ['GET', 'HEAD'].includes(c.req.method) ? undefined : await c.req.arrayBuffer()
  const upstream = await fetch(target, { method: c.req.method, headers, body, redirect: 'manual' })
  const responseHeaders = new Headers()
  for (const key of ['content-type', 'cache-control', 'content-disposition', 'etag']) {
    const value = upstream.headers.get(key)
    if (value) responseHeaders.set(key, value)
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
})

// 拦截规则的一次性迁移先跑：它是数据搬迁，与底座的触发器/锁无关，
// 失败也不能挡住服务启动。
await ensureInterceptRulesSeeded().then(
  (outcome) => {
    if (outcome.seeded > 0) console.log(`[vexnar] 拦截规则迁移：${outcome.seeded} 条（来源 ${outcome.source}）`)
  },
  (error) => console.error('[vexnar] 拦截规则迁移失败（不影响其它接口）', error)
)
const port = Number(process.env.PORT ?? 8790)
await startRuntime({ signals: true })
serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, (info) => {
  const runtime = runtimeInfo()
  console.log(`vexnar-core listening on http://127.0.0.1:${info.port} (runtime=${runtime.mode} store=${runtime.store} triggers=${runtime.triggers})`)
})
