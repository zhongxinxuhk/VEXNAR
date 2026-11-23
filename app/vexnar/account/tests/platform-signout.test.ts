// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 退出登录的端到端行为：删密钥、删账号文件、回登录页。
 *
 * 这里不连平台、不起 HTTP：把 `installPlatform` 装进一个假 ctx，用真实账号文件
 * 让插件进入"已登录"，再打 `/signout`。断言的是用户关心的三件事：
 *   1. 访问令牌所在文件被删除；
 *   2. 每个提供方的 APIKEY 凭据引用都被 unset（凭据库不是回收站）；
 *   3. 浏览器拿到 303 与 `/?signed-out=1`，登录页随之成为新的 index。
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { installPlatform } from '../src/platform.ts'

interface Capture {
  status: number
  headers: Record<string, string>
  body: string
}

const routes = new Map<string, (req: unknown, res: unknown) => void | Promise<unknown>>()
const taps: Array<(html: string) => string> = []
const credentials = new Map<string, string>()
const unset: string[] = []
const settingsWrites: Array<{ ns: string; section: object }> = []
const disposers: Array<() => void> = []
let home = ''

const account = {
  user_id: 1,
  username: 'tester',
  display_name: 'tester',
  avatar_url: '',
  request_count: 0,
  access_token: 'nac-test-token',
  credential_version: 1,
  expires_at: Date.now() + 3_600_000,
  providers: [
    {
      id: 'vexnar',
      name: 'HXSEC AI Platform',
      base: 'https://api.sec.hn.cn/v1',
      key: 'sk-platform-secret',
      models: [{ id: 'deepsec-flash' }],
      retry: 'normal'
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      base: 'https://api.deepseek.com',
      key: 'sk-user-secret',
      models: [{ id: 'deepseek-v4-pro' }],
      retry: 'normal'
    }
  ]
}

const fakeRes = (): { res: Record<string, unknown>; done: Promise<Capture> } => {
  const capture: Capture = { status: 0, headers: {}, body: '' }
  let settle: (value: Capture) => void = () => {}
  const done = new Promise<Capture>(resolve => { settle = resolve })
  const res = {
    writeHead(status: number, headers: Record<string, string> = {}) {
      capture.status = status
      Object.assign(capture.headers, headers)
      return res
    },
    end(body?: string) {
      capture.body = body ?? ''
      settle(capture)
      return res
    }
  }
  return { res, done }
}

const fakeReq = (method: string, url = '/vexnar-api/platform/signout'): Record<string, unknown> => ({
  method,
  url,
  headers: {},
  socket: { remoteAddress: '127.0.0.1' }
})

before(async () => {
  home = await mkdtemp(join(tmpdir(), 'vexnar-signout-'))
  process.env.VEXNAR_HOME = home
  await writeFile(join(home, 'vexnar-account.json'), JSON.stringify(account), 'utf8')

  const ctx = {
    credentials: {
      async set(ref: string, value: string) { credentials.set(ref, value) },
      async unset(ref: string) { credentials.delete(ref); unset.push(ref) }
    },
    settings: {
      async replace(ns: string, section: object) { settingsWrites.push({ ns, section }) }
    },
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
      register(route: { path: string; handler: (req: unknown, res: unknown) => void | Promise<unknown> }) {
        routes.set(route.path, route.handler)
        return () => {}
      },
      tapIndex(transform: (html: string) => string) {
        taps.push(transform)
        return () => {}
      }
    }
  }

  installPlatform(ctx as never)
})

after(() => {
  for (const dispose of disposers.reverse()) dispose()
  delete process.env.VEXNAR_HOME
})

test('未登录时 index 被替换成登录页', async () => {
  const transform = taps.at(-1)
  assert.ok(transform, '应注册 tapIndex')
  // 已登录时注入工作区脚本；退出后再看就是登录页。
  const signedIn = transform('<html><head></head><body></body></html>')
  assert.match(signedIn, /platform\/entry\.js/)
})

test('signout 删除访问令牌、APIKEY 与 llm 提供方，并 303 回登录页', async () => {
  const handler = routes.get('/vexnar-api/platform/signout')
  assert.ok(handler, '应注册 /signout 路由')

  const { res, done } = fakeRes()
  await handler(fakeReq('GET'), res)
  const capture = await done

  assert.equal(capture.status, 303)
  assert.equal(capture.headers.Location, '/?signed-out=1')
  assert.equal(capture.headers['Cache-Control'], 'no-store')

  // 账号文件（访问令牌 + providers[].key）被删掉。
  await assert.rejects(() => stat(join(home, 'vexnar-account.json')), /ENOENT/)

  // 每个提供方的凭据引用都被 unset，凭据库里不留 APIKEY。
  assert.ok(unset.includes('VEXNAR_VEXNAR_API_KEY'), `未清理平台密钥：${unset.join(',')}`)
  assert.ok(unset.includes('VEXNAR_DEEPSEEK_API_KEY'), `未清理第三方密钥：${unset.join(',')}`)
  assert.equal(credentials.size, 0)

  // llm-pi-ai 的提供方目录被清空，后台同步不会把旧密钥写回来。
  const last = settingsWrites.at(-1)
  assert.deepEqual(last, { ns: 'llm-pi-ai', section: { providers: {} } })

  // 退出后加载 index 得到登录页，而不是工作区。
  const html = taps.at(-1)?.('<html><head></head><body></body></html>') ?? ''
  assert.match(html, /登录 VEXNAR/)
  assert.match(html, /id="vexnar-sign-in"/)
  assert.doesNotMatch(html, /data-vexnar-perm-injected/)
})

test('signout 只接受 GET/POST；登录页带出签名状态', async () => {
  const handler = routes.get('/vexnar-api/platform/signout')
  assert.ok(handler)
  const { res, done } = fakeRes()
  await handler(fakeReq('DELETE'), res)
  const capture = await done
  assert.equal(capture.status, 405)
  assert.equal(capture.headers.Allow, 'GET, POST')
})

test('登录页脚本与新模板对得上（元素与状态位都存在）', async () => {
  const page = await readFile(join(import.meta.dirname, '..', 'src', 'login-page.ts'), 'utf8')
  for (const id of ['notice', 'token-login', 'reveal', 'retry', 'methods', 'online', 'vexnar-sign-in']) {
    assert.ok(page.includes(`id="${id}"`), `登录页缺 #${id}`)
  }
  // 登录页自己会把 ?signed-out=1 讲清楚；这条文案在客户端脚本里。
  const script = await readFile(join(import.meta.dirname, '..', 'src', 'login-client.ts'), 'utf8')
  assert.match(script, /signed-out/)
  assert.match(script, /访问令牌与保存的 APIKEY 已删除/)
})
