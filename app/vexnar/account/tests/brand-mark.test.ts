// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 「门禁」页与工作区的品牌标记。
 *
 * 皮肤 dsh-claude-style 画品牌标记只认它自己那套 CSS 变量，`brand: deepseek` 时
 * 到处是 DeepSeek 的鲸鱼。本插件注入的脚本必须做两件事：
 *   1. 把 `--dsh-claude-image-deepseek-mark` 与 `--dsh-claude-custom-mark` 指向本项目 logo，
 *      并打开皮肤的 `[data-dsh-claude-custom-mark]` 规则；
 *   2. 让 `/vexnar-brand/logo.png` 真的能用这份字节。
 */
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { apply } from '../src/index.ts'

const account = {
  user_id: 1,
  username: 'tester',
  display_name: 'tester',
  avatar_url: '',
  request_count: 0,
  access_token: 'nac-test-token',
  credential_version: 1,
  expires_at: Date.now() + 3_600_000,
  providers: [{
    id: 'vexnar',
    name: 'HXSEC AI Platform',
    base: 'https://api.sec.hn.cn/v1',
    key: 'sk-platform-secret',
    models: [{ id: 'deepsec-flash' }],
    retry: 'normal'
  }]
}

interface Capture {
  status: number
  headers: Record<string, string>
  bytes: Buffer
}

const routes = new Map<string, (req: unknown, res: unknown) => void | Promise<unknown>>()
const taps: Array<(html: string) => string> = []
const disposers: Array<() => void> = []
let home = ''

const fakeRes = (): { res: Record<string, unknown>; done: Promise<Capture> } => {
  const capture: Capture = { status: 0, headers: {}, bytes: Buffer.alloc(0) }
  let settle: (value: Capture) => void = () => {}
  const done = new Promise<Capture>(resolve => { settle = resolve })
  const res = {
    statusCode: 0,
    setHeader(name: string, value: string) { capture.headers[name.toLowerCase()] = value },
    writeHead(status: number, headers: Record<string, string> = {}) {
      capture.status = status
      for (const [key, value] of Object.entries(headers)) capture.headers[key.toLowerCase()] = value
      return res
    },
    end(body?: string | Buffer) {
      capture.status ||= res.statusCode
      capture.bytes = Buffer.isBuffer(body) ? body : Buffer.from(body ?? '')
      settle(capture)
      return res
    }
  }
  return { res, done }
}

before(async () => {
  home = await mkdtemp(join(tmpdir(), 'vexnar-brand-'))
  process.env.VEXNAR_HOME = home
  // 只测品牌注入：不拉起嵌入 core（那是进程级副作用，和这里的断言无关）。
  process.env.VEXNAR_CORE_EMBEDDED = '0'
  // 工作区页才带皮肤注入；没登录时 index 是登录页，测不到品牌标记。
  await writeFile(join(home, 'vexnar-account.json'), JSON.stringify(account), 'utf8')

  const ctx = {
    provide() {},
    on() { return () => true },
    sessions: { get() { return undefined } },
    tools: { register() {} },
    credentials: { async set() {}, async unset() {} },
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

  apply(ctx as never)

  // 首次后台刷新是异步的：等到门禁真的打开（index 才会是工作区而不是登录页）。
  const ready = routes.get('/vexnar-api/platform/ready')
  assert.ok(ready, '应注册 /ready 路由')
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const { res, done } = fakeRes()
    await ready({ method: 'GET', url: '/vexnar-api/platform/ready', headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res)
    const capture = await done
    if (capture.bytes.toString('utf8').includes('"ready":true')) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.fail('门禁没有在测试时限内打开')
})

after(() => {
  for (const dispose of disposers.reverse()) dispose()
  delete process.env.VEXNAR_HOME
  delete process.env.VEXNAR_CORE_EMBEDDED
})

test('注入的品牌脚本把皮肤的品牌标记换成 VEXNAR logo', () => {
  assert.ok(taps.length > 0, '应注册 tapIndex')
  // 多个 tap 按注册顺序串起来跑（品牌注入在前，登录页替换在后）。
  const html = taps.reduce(
    (current, transform) => transform(current),
    '<html><head><title>DeepSeek Harness</title></head><body></body></html>'
  )
  assert.match(html, /<title>VEXNAR<\/title>/)
  assert.match(html, /--dsh-claude-image-deepseek-mark/)
  assert.match(html, /--dsh-claude-custom-mark/)
  assert.match(html, /\/vexnar-brand\/logo\.png/)
  assert.match(html, /data-dsh-claude-custom-mark/)
})

test('/vexnar-brand/logo.png 返回项目 logo', async () => {
  const handler = routes.get('/vexnar-brand/logo.png')
  assert.ok(handler, '应注册 /vexnar-brand/logo.png')
  const { res, done } = fakeRes()
  await handler({ method: 'GET', url: '/vexnar-brand/logo.png', headers: {} }, res)
  const capture = await done
  assert.equal(capture.status, 200)
  assert.equal(capture.headers['content-type'], 'image/png')
  assert.ok(capture.bytes.length > 1024, `logo 太小：${capture.bytes.length} 字节`)
})
