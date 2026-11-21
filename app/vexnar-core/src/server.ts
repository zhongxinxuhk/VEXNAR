// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { auth } from './auth.js'
import { api } from './routes.js'

const app = new Hono()
const fallback = (process.env.VEXNAR_GO_FALLBACK || '').replace(/\/$/, '')

app.use('/api/*', auth)
app.route('/', api)

/** Routes the TypeScript core serves natively; everything else is proxied. */
const NATIVE = [
  '/api/health', '/api/agents', '/api/llm/profiles', '/api/task-categories', '/api/task-templates',
  '/api/companies', '/api/tools', '/api/mcp', '/api/notify/channels', '/api/settings',
  '/api/tasks', '/api/assets', '/api/exploration/findings', '/api/exploration/nodes'
]

app.get('/api/_migration', (c) => c.json({ native: NATIVE, fallback: fallback || null }))

// M3 transition: unported routes fall through to the Go service, so the web
// console can point at the TS core before every write is migrated.
app.all('/api/*', async (c) => {
  if (!fallback) {
    return c.json({ error: 'route not migrated', path: c.req.path, fallback: null }, 501)
  }
  const url = new URL(c.req.url)
  const target = `${fallback}${url.pathname}${url.search}`
  const headers = new Headers()
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

const port = Number(process.env.PORT ?? 8790)
serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, (info) => {
  console.log(`vexnar-core listening on http://127.0.0.1:${info.port}`)
})
