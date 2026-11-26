// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 登录门禁的两条边界。
 *
 * 1. 门禁关着时，`/api/*` 会被 `connection.admit` 拒成 401——这正是界面上
 *    「workspace create failed: … transport failure for /api/workspace/create: HTTP 401」
 *    的来源。登录用的启动路径必须仍然放行，否则页面连「登录过期」都问不到。
 * 2. 账号文件读不到或读坏时不能当成退出登录：空账号会把提供方与密钥清掉，
 *    并把已经打开的工作区变成「每个动作都 401」的僵尸页面。
 */
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { installPlatform, keepsSessionOnUnreadable } from '../src/platform.ts'

interface AccountShape {
  user_id: number
  username: string
  display_name: string
  avatar_url: string
  request_count: number
  access_token: string
  credential_version: number
  expires_at: number
  providers: Array<{
    id: string
    name: string
    base: string
    key: string
    models: Array<{ id: string }>
    retry: 'normal'
  }>
}

const signedIn = (expiresAt = Date.now() + 3_600_000): AccountShape => ({
  user_id: 1,
  username: 'tester',
  display_name: 'tester',
  avatar_url: '',
  request_count: 0,
  access_token: 'nac-test-token',
  credential_version: 1,
  expires_at: expiresAt,
  providers: [{
    id: 'vexnar',
    name: 'HXSEC AI Platform',
    base: 'https://api.sec.hn.cn/v1',
    key: 'sk-platform-secret',
    models: [{ id: 'deepsec-flash' }],
    retry: 'normal'
  }]
})

/** `read()` 在文件缺失/为空/JSON 坏了时给出的形状。 */
const unreadable = {
  user_id: 0,
  username: '',
  display_name: '',
  avatar_url: '',
  request_count: 0,
  access_token: '',
  credential_version: 0,
  expires_at: 0,
  providers: []
} as unknown as AccountShape

const disposers: Array<() => void> = []
let home = ''
let admit: ((request: unknown) => { peer?: unknown; rejection?: number }) | undefined

before(async () => {
  home = await mkdtemp(join(tmpdir(), 'vexnar-gate-'))
  process.env.VEXNAR_HOME = home

  const ctx = {
    credentials: {
      async set() {},
      async unset() {}
    },
    settings: { async replace() {} },
    effect(body: () => (() => void) | void) {
      const disposer = body()
      if (typeof disposer === 'function') disposers.push(disposer)
    },
    connection: {
      admit() { return { peer: { dispose: async () => {} } } },
      requestRejection() { return undefined },
      createPeer() { return { dispose: async () => {} } },
      fetch: { register() { return async () => {} } }
    },
    agentDefaultModel: {
      currentSelection: () => ({ provider: 'vexnar', model: 'deepsec-flash' }),
      async saveSelection() {}
    },
    typertGateway: { async invoke() { return {} } },
    webServer: {
      register() { return () => {} },
      tapIndex() { return () => {} }
    }
  }

  installPlatform(ctx as never)
  admit = (ctx.connection as { admit: typeof admit }).admit
})

after(() => {
  for (const dispose of disposers.reverse()) dispose()
  delete process.env.VEXNAR_HOME
})

const request = (url: string, method = 'POST'): Record<string, unknown> => ({
  url,
  method,
  headers: {},
  socket: { remoteAddress: '127.0.0.1' }
})

test('未登录时 /api/* 被门禁拒成 401，登录路径仍放行', () => {
  assert.ok(admit, 'installPlatform 应当替换 connection.admit')
  // 没有账号文件：门禁是关的，工作区 RPC 一律 401（客户端把它显示成 transport failure）。
  assert.deepEqual(admit(request('/api/workspace/create')), { rejection: 401 })
  assert.deepEqual(admit(request('/api/session/create')), { rejection: 401 })
  // 登录页自己的入口不能被自己的门禁挡住，否则「登录已过期」都问不出来。
  assert.equal(admit(request('/vexnar-api/platform/ready', 'GET')).rejection, undefined)
  assert.equal(admit(request('/vexnar-api/platform/entry.js', 'GET')).rejection, undefined)
})

test('账号文件读坏按读失败处理，不当成退出登录', () => {
  assert.equal(keepsSessionOnUnreadable(signedIn(), unreadable), true)
  // 上一次就已经是空账号（没登录 / 已退出）：没有"保留"可言。
  assert.equal(keepsSessionOnUnreadable(undefined, unreadable), false)
  assert.equal(keepsSessionOnUnreadable(unreadable, unreadable), false)
  // 真正的过期：同一份账号时间过了，门禁该关。
  const expired = { ...signedIn(), expires_at: Date.now() - 1_000 }
  assert.equal(keepsSessionOnUnreadable(signedIn(), expired), false)
})

test('账号有效时同名读取照常应用', async () => {
  const account = signedIn()
  await writeFile(join(home, 'vexnar-account.json'), JSON.stringify(account), 'utf8')
  assert.equal(keepsSessionOnUnreadable(account, account), false)
})
