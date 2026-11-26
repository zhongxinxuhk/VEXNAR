// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 登录门禁的三条边界。
 *
 * 1. 门禁不再改写 `connection.admit`：以前门禁关着时把 `/api/*` 一律拒成 401，
 *    桌面端在账号还没读完时发出的 `workspace/initializeDefault` 被拒，界面就退回
 *    「请先选择工作区」，用户手动挑目录时同一个 401 又变成「无法打开文件夹」。
 *    认证继续由上游 carrier 的 cookie/token 负责，门禁只负责换掉首页 HTML。
 * 2. 账号文件读不到或读坏时不能当成退出登录：空账号会把提供方与密钥清掉，
 *    并把已经打开的工作区变成「每个动作都 401」的僵尸页面。
 * 3. 门禁一打开就在进程内把默认工作区建好，页面不必先让用户选目录。
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
const routes = new Map<string, (req: unknown, res: unknown) => unknown>()
const invokes: Array<{ namespace: string; method: string }> = []
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
    typertGateway: {
      async invoke(request: { namespace: string; method: string }) {
        invokes.push({ namespace: request.namespace, method: request.method })
        return { workspace: { workspaceId: 'default' } }
      }
    },
    webServer: {
      register(route: { path: string; handler: (req: unknown, res: unknown) => unknown }) {
        routes.set(route.path, route.handler)
        return () => {}
      },
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

/** 调一条插件自己注册的 JSON 路由，返回解析后的正文。 */
async function callRoute(path: string, method = 'GET'): Promise<Record<string, unknown>> {
  const handler = routes.get(path)
  assert.ok(handler, `缺少路由 ${path}`)
  return await new Promise((resolve, reject) => {
    const res = {
      status: 0,
      writeHead(status: number) { this.status = status; return this },
      end(body?: string) {
        try { resolve(body === undefined ? {} : JSON.parse(body) as Record<string, unknown>) }
        catch (error) { reject(error as Error) }
      }
    }
    Promise.resolve(handler({ url: path, method, headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res))
      .catch(reject)
  })
}

test('门禁关着时也不再把 /api/* 拒成 401', () => {
  assert.ok(admit, 'installPlatform 应当保留 connection.admit 的包装')
  // 没有账号文件：上一层的判定必须是"没有拒绝"，否则桌面端建默认工作区时只会
  // 拿到一个与真实原因无关的 401。
  assert.equal(admit(request('/api/workspace/create')).rejection, undefined)
  assert.equal(admit(request('/api/session/create')).rejection, undefined)
  assert.equal(admit(request('/vexnar-api/platform/ready', 'GET')).rejection, undefined)
})

test('账号有效时在进程内预建默认工作区', async () => {
  invokes.length = 0
  await writeFile(join(home, 'vexnar-account.json'), JSON.stringify(signedIn()), 'utf8')
  // 读一次账号即触发目录同步与门禁打开；页面来问的时候默认工作区应当已经建好。
  await callRoute('/vexnar-api/platform/account')
  const bootstrapped = invokes.filter(entry =>
    entry.namespace === 'workspace' && entry.method === 'initializeDefault')
  assert.equal(bootstrapped.length, 1, '门禁打开后应当调用一次 workspace/initializeDefault')
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
