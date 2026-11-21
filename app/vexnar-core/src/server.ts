// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { auth } from './auth.js'
import { api } from './routes.js'

const app = new Hono()
app.use('/api/*', auth)
app.route('/', api)

const port = Number(process.env.PORT ?? 8790)
serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, (info) => {
  console.log(`vexnar-core listening on http://127.0.0.1:${info.port}`)
})
