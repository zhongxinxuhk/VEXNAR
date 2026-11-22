// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Hono } from 'hono'

const repo = 'zhongxinxuhk/vexnar'
const reason = '此客户端随 dsh 工作区更新，请使用安装来源提供的更新方式'
const progress = { phase: 'idle', percent: -1, message: reason }

export function register(api: Hono) {
  // This process runs Node. Go release archives only belong to the Go service.
  api.get('/api/update/check', (c) => c.json({
    current: process.env.VEXNAR_VERSION ?? 'dev',
    mode: 'managed',
    os: process.platform === 'win32' ? 'windows' : process.platform,
    arch: process.arch === 'x64' ? 'amd64' : process.arch === 'ia32' ? '386' : process.arch,
    has_backup: false,
    has_update: false,
    asset_available: false,
    comparable: false,
    repo,
    boot_notice: '',
    rolled_back: false,
    reason,
  }))
  api.post('/api/update/apply', (c) => c.json({ error: reason }, 409))
  api.post('/api/update/rollback', (c) => c.json({ error: reason }, 409))
  api.get('/api/update/stream', () => new Response(`data: ${JSON.stringify(progress)}\n\n`, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' },
  }))
}
