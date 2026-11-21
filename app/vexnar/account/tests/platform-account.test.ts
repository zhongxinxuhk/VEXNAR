// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 平台账号（TS 侧）的行为测试。
 *
 * 用一个假平台 + 假上游跑完整链路：密码登录 → 建令牌 → 取 key → 读模型 →
 * 添加第三方提供方 → 移除 → 退出。重点覆盖两件事：
 *   1. 登录不再依赖 Go，也不依赖任何"运行中的旧构建"；
 *   2. 上游回纯文本（旧后端的 `404 page not found`、反代的 HTML）时，抛的是人话，
 *      不是 `Unexpected non-whitespace character after JSON at position 4`。
 */

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { Server, ServerResponse } from 'node:http'
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { createPlatformAccount, PlatformError } from '../src/platform-account.ts'
import type { AccountProvider, AccountView } from '../src/platform-account.ts'

let platform: Server
let api: Server
// before() 里才赋真实地址；`if (!upstream)` 那个旧写法保留原意，所以这里带着 undefined。
let upstream: string | undefined
let base: string
let models: Server
let accounts: string
let plainTextMode = false

const listen = (server: Server): Promise<number> => new Promise<number>((resolve) => {
  server.listen(0, '127.0.0.1', () => {
    // server.address() 是 AddressInfo | string | null；监听的是 TCP，只取 port。
    const address = server.address()
    resolve(typeof address === 'object' && address !== null ? address.port : 0)
  })
})

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

/**
 * `catch (error)` / `assert.rejects` 收上来的 error 是 unknown。旧代码直接读 `error.status`，
 * 这里只把这一处读法写成窄化函数，判定条件与原断言完全一致。
 */
function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const { status } = error as { status?: unknown }
  return typeof status === 'number' ? status : undefined
}

before(async () => {
  models = createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer sk-good') return json(res, 401, { error: 'bad key' })
    if (req.url === '/v1/models') return json(res, 200, { data: [{ id: 'm-1', name: 'Model One' }, { id: 'm-2' }] })
    if (req.url === '/custom/v1/models') return json(res, 200, { data: [{ id: 'c-1' }] })
    json(res, 404, { error: 'not found' })
  })
  const modelsPort = await listen(models)
  const modelsOrigin = `http://127.0.0.1:${modelsPort}`

  platform = createServer((req, res) => {
    if (plainTextMode) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('404 page not found')
      return
    }
    // req.url 在类型上是 string | undefined；假平台只发路径，缺省按根路径解析。
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/api/status') {
      return json(res, 200, {
        success: true,
        data: { password_login_enabled: true, password_login_encryption_enabled: false, turnstile_check: false, github_oauth: true }
      })
    }
    if (url.pathname === '/api/user/login' && req.method === 'POST') {
      return json(res, 200, {
        success: true,
        data: { id: 7, username: 'alice', access_token: 'platform-access' }
      }, { 'Set-Cookie': 'session=cookie-value; Path=/; HttpOnly' })
    }
    if (url.pathname === '/api/user/self') {
      if (!req.headers.cookie && !req.headers.authorization) return json(res, 401, { success: false })
      return json(res, 200, {
        success: true,
        data: { id: 7, username: 'alice', display_name: 'Alice', request_count: 42 }
      })
    }
    if (url.pathname === '/api/user/token') return json(res, 200, { success: true, data: { token: 'manage-token' } })
    if (url.pathname === '/api/token/' && req.method === 'POST') return json(res, 200, { success: true })
    if (url.pathname === '/api/token/search') {
      return json(res, 200, { success: true, data: { items: [{ id: 11, name: url.searchParams.get('keyword') }] } })
    }
    if (url.pathname === '/api/token/11/key') return json(res, 200, { success: true, data: { key: 'good' } })
    json(res, 404, { success: false, message: 'missing' })
  })
  const platformPort = await listen(platform)
  base = `http://127.0.0.1:${platformPort}`

  process.env.VEXNAR_NEWAPI_PLATFORM = base
  process.env.VEXNAR_NEWAPI_API = modelsOrigin
  process.env.VEXNAR_DEEPSEEK_API = `${modelsOrigin}/custom/v1`

  if (!upstream) upstream = modelsOrigin
  accounts = await mkdtemp(join(tmpdir(), 'vexnar-account-'))
})

after(async () => {
  await new Promise((resolve) => platform.close(resolve))
  await new Promise((resolve) => models.close(resolve))
})

test('未登录时状态为空，ready 为假', async () => {
  const account = createPlatformAccount({ home: accounts })
  const status = await account.status()
  assert.equal(status.signed_in, false)
  assert.equal(status.ready, false)
  assert.deepEqual(status.providers, [])
})

test('读取登录方式不需要 Go', async () => {
  const account = createPlatformAccount({ home: accounts })
  const methods = await account.methods()
  assert.equal(methods.password, true)
  assert.deepEqual(methods.methods, ['密码', 'GitHub'])
})

test('密码登录把平台令牌、key 与模型目录都落到本地', async () => {
  const account = createPlatformAccount({ home: accounts })
  const result = await account.password('alice', 'secret')
  // `password()` 的类型是 `AccountView | LoginChallenge`：本用例的平台不需要两步验证，
  // 这里把旧代码的隐含前提写成断言，读到的仍是同一个视图。
  assert.ok(!('challenge' in result), '本用例平台不应要求两步验证')
  const view: AccountView = result
  assert.equal(view.signed_in, true)
  assert.equal(view.ready, true)
  assert.equal(view.username, 'alice')
  assert.equal(view.display_name, 'Alice')
  assert.equal(view.request_count, 42)
  assert.equal(view.access_token_ready, true)
  assert.equal(view.providers.length, 1)
  // noUncheckedIndexedAccess：下标读出来可能是 undefined，先按「视图里确实有这一行」窄化。
  const platformProvider = view.providers[0]
  assert.ok(platformProvider, '登录后应带平台提供方')
  assert.equal(platformProvider.id, 'vexnar')
  assert.equal(platformProvider.format, 'openai-responses')
  assert.deepEqual(platformProvider.models.map((model) => model.id), ['m-1', 'm-2'])
  assert.equal('key' in platformProvider, false, '浏览器视图不能带密钥')

  const raw = JSON.parse(await readFile(join(accounts, 'vexnar-account.json'), 'utf8'))
  assert.equal(raw.providers[0].key, 'sk-good')
  assert.equal(raw.providers[0].base, `${upstream}/v1`)
  assert.equal((await stat(join(accounts, 'vexnar-account.json'))).mode & 0o777, 0o600)
})

test('重复登录被拒，必须先退出', async () => {
  const account = createPlatformAccount({ home: accounts })
  await assert.rejects(() => account.password('alice', 'secret'), (error: unknown) => statusOf(error) === 409)
})

test('用户可以接入自己的第三方 API', async () => {
  const account = createPlatformAccount({ home: accounts })
  const wrong = await account.addProvider({ kind: 'custom', name: '坏地址', base_url: 'https://example.com/v1?x=1', api_key: 'sk-good' })
    .then(() => null, (error) => error)
  assert.equal(statusOf(wrong), 400)

  const refused = await account.addProvider({ kind: 'custom', name: 'Bad', base_url: `${upstream}/custom/v1`, api_key: 'sk-wrong' })
    .then(() => null, (error) => error)
  assert.equal(statusOf(refused), 422)

  const view = await account.addProvider({ kind: 'custom', name: '自建网关', base_url: `${upstream}/custom/v1`, api_key: 'sk-good' })
  const custom = view.providers.find((provider) => provider.id.startsWith('custom-'))
  assert.ok(custom, '第三方提供方应出现在视图里')
  assert.equal(custom.name, '自建网关')
  assert.equal(custom.format, 'openai-completions')
  assert.deepEqual(custom.models.map((model) => model.id), ['c-1'])

  const deepseek = await account.addProvider({ kind: 'deepseek', api_key: 'sk-good' })
  assert.ok(deepseek.providers.some((provider) => provider.id === 'deepseek'))
  assert.equal(deepseek.providers.find((provider) => provider.id === 'deepseek')?.format, 'openai-completions')
})

test('编辑提供方：显示名称、模型目录与重试策略都落到本地', async () => {
  const account = createPlatformAccount({ home: accounts })
  const before = await account.status()
  const target = before.providers.find((provider) => provider.id.startsWith('custom-'))
  assert.ok(target, '上一个用例添加的自定义提供方应还在')
  assert.deepEqual(target.models.map((model) => model.id), ['c-1'])
  assert.equal(target.retry, 'normal')
  assert.equal(target.key_configured, true)
  assert.equal(target.base, `${upstream}/custom/v1`)
  assert.equal('key' in target, false, '编辑响应同样不能带密钥')

  const view = await account.updateProvider({
    id: target.id,
    name: '自建网关 v2',
    api_key: '',
    base_url: `${upstream}/custom/v1`,
    retry: 'always',
    models: [{ id: 'c-1', name: 'One' }, { id: 'c-2' }, { id: 'c-2' }]
  })
  const edited = view.providers.find((provider) => provider.id === target.id)
  assert.ok(edited, '更新后的提供方应还在视图里')
  assert.equal(edited.name, '自建网关 v2')
  assert.equal(edited.retry, 'always')
  assert.deepEqual(edited.models, [{ id: 'c-1', name: 'One' }, { id: 'c-2' }], '重复 ID 只留一条')

  const raw = JSON.parse(await readFile(join(accounts, 'vexnar-account.json'), 'utf8'))
  const stored = raw.providers.find((provider: AccountProvider) => provider.id === target.id)
  assert.equal(stored.key, 'sk-good', '密钥留空即沿用已存的那把')
  assert.equal(stored.retry, 'always')
})

test('编辑提供方：坏 key 整笔拒绝，原配置不动', async () => {
  const account = createPlatformAccount({ home: accounts })
  const before = await account.status()
  const target = before.providers.find((provider) => provider.id.startsWith('custom-'))
  assert.ok(target, '上一个用例添加的自定义提供方应还在')
  const refused = await account.updateProvider({ id: target.id, api_key: 'sk-wrong' })
    .then(() => null, (error) => error)
  assert.equal(statusOf(refused), 422)

  const after = await account.status()
  const kept = after.providers.find((provider) => provider.id === target.id)
  assert.ok(kept, '拒绝后原配置应仍在视图里')
  assert.equal(kept.name, target.name)
  assert.equal(kept.key_configured, true)
})

test('编辑提供方：平台行的地址与密钥由平台签发，不能改', async () => {
  const account = createPlatformAccount({ home: accounts })
  const baseChange = await account.updateProvider({ id: 'vexnar', base_url: 'https://evil.example.com/v1' })
    .then(() => null, (error) => error)
  assert.equal(statusOf(baseChange), 400)
  const key = await account.updateProvider({ id: 'vexnar', api_key: 'sk-good' })
    .then(() => null, (error) => error)
  assert.equal(statusOf(key), 400)
  const unknown = await account.updateProvider({ id: 'nope', name: 'x' })
    .then(() => null, (error) => error)
  assert.equal(statusOf(unknown), 404)
})

test('平台提供方不可移除，第三方可以移除', async () => {
  const account = createPlatformAccount({ home: accounts })
  await assert.rejects(() => account.removeProvider('vexnar'), (error: unknown) => statusOf(error) === 400)
  const view = await account.removeProvider('deepseek')
  assert.equal(view.providers.some((provider) => provider.id === 'deepseek'), false)
  assert.equal(view.ready, true, '移除第三方提供方不影响平台可用性')
})

test('退出登录清空本地状态', async () => {
  const account = createPlatformAccount({ home: accounts })
  const view = await account.logout()
  assert.equal(view.signed_in, false)
  assert.equal(view.ready, false)
  assert.equal(view.providers.length, 0)
})

test('平台没发模型凭据时，用户仍可添加自己的提供方', async () => {
  const home = await mkdtemp(join(tmpdir(), 'vexnar-account-empty-'))
  await writeFile(join(home, 'vexnar-account.json'), JSON.stringify({
    user_id: 7, username: 'alice', credential_version: 1, expires_at: Date.now() + 86_400_000, providers: []
  }), { mode: 0o600 })
  const account = createPlatformAccount({ home })
  const before = await account.status()
  assert.equal(before.signed_in, true, '有身份就不用再登录')
  assert.equal(before.ready, false, '但确实没有能用的模型')

  const view = await account.addProvider({ kind: 'custom', name: '自建网关', base_url: `${upstream}/custom/v1`, api_key: 'sk-good' })
  assert.equal(view.providers.length, 1)
  assert.equal(view.ready, true, '自己的 Key 接上后即可用')
})

test('上游回纯文本时抛人话，不泄露 JSON 解析器原文', async () => {
  plainTextMode = true
  try {
    const account = createPlatformAccount({ home: accounts })
    const error = await account.password('alice', 'secret').then(() => null, (caught) => caught)
    assert.ok(error instanceof PlatformError, '应是带状态码的账号错误')
    assert.equal(error.status, 502)
    assert.doesNotMatch(error.message, /Unexpected|JSON at position/)
  } finally {
    plainTextMode = false
  }
})
