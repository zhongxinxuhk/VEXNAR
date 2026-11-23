// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { register } from './src/routes/gaps.ts'

process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_STORE_ROOT = await mkdtemp(join(tmpdir(), 'vexnar-gaps-'))
const api = new Hono()
register(api)
const paths = api.routes.map((r) => `${r.method} ${r.path}`).sort()
const want = [
  'PATCH /api/triggers/:id', 'DELETE /api/triggers/:id',
  'GET /api/side-questions/:requestID/events', 'POST /api/side-questions/:requestID/cancel',
  'POST /api/settings/python/detect', 'POST /api/settings/web-search/test',
  'POST /api/task-archives/delete/batch', 'POST /api/task-archives/restore/batch',
  'POST /api/tools/custom/test', 'POST /api/tools/:key/reset'
  // GET /api/exploration/activity 由 routes/read-views.ts 提供（任务与全站活动流），
  // 不属于本模块；把它写进这里的 want 只会让自检在正确的代码上失败。
]
const missing = want.filter((w) => !paths.includes(w))
console.log('routes:', paths.length, 'missing:', missing)
const r = await api.request('/api/exploration/activity?task=1')
console.log('activity (owned by read-views, not this module):', r.status)
if (missing.length) { console.error('MISSING', missing); process.exit(1) }
console.log('OK — gap routes registered')
