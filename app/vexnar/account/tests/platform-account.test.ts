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
let managedModelKey = ''
let createdModelKeys = 0

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
    if (req.url === '/official/models') return json(res, 200, { data: [{
      id: 'deepseek-flash',
      name: 'DeepSeek-V4.1-Flash',
      context_window: 1048576,
      max_output_tokens: 393216,
      input_modalities: ['text', 'image'],
      effort: { supported_levels: ['low', 'high', 'max'] }
    }] })
    if (req.url === '/completion-only/chat/completions' && req.method === 'POST') {
      void (async () => {
        const chunks: Uint8Array[] = []
        for await (const chunk of req) chunks.push(chunk)
        const body = JSON.parse(Buffer.concat(chunks).toString())
        if (body.model !== 'manual-chat') return json(res, 400, { error: 'unknown model' })
        json(res, 200, { choices: [{ message: { role: 'assistant', content: 'ok' } }] })
      })()
      return
    }
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
        data: { password_login_enabled: true, password_login_encryption_enabled: false, turnstile_check: false, github_oauth: true,
          quota_per_unit: 500000, quota_display_type: 'CNY', usd_exchange_rate: 2 }
      })
    }
    if (url.pathname === '/api/user/login' && req.method === 'POST') {
      return json(res, 200, {
        success: true,
        data: { id: 7, username: 'alice', access_token: 'platform-access' }
      }, { 'Set-Cookie': 'session=cookie-value; Path=/; HttpOnly' })
    }
    if (url.pathname === '/api/user/self') {
      if (req.headers.authorization === 'Bearer nap_fixture-other-user') {
        return json(res, 200, { success: true, data: { id: 8, username: 'bob' } })
      }
      if (!req.headers.cookie && !['Bearer platform-access', 'Bearer nap_fixture-access-1234567890'].includes(req.headers.authorization ?? '')) {
        return json(res, 401, { success: false })
      }
      return json(res, 200, {
        success: true,
        data: { id: 7, username: 'alice', display_name: 'Alice', request_count: 42, quota: 750000,
          avatar_url: 'https://example.com/avatar.png' }
      })
    }
    if (url.pathname === '/api/user/token') return json(res, 200, { success: true, data: { token: 'manage-token' } })
    if (url.pathname === '/api/token/' && req.method === 'POST') {
      void (async () => {
        const chunks: Uint8Array[] = []
        for await (const chunk of req) chunks.push(chunk)
        managedModelKey = JSON.parse(Buffer.concat(chunks).toString()).name
        createdModelKeys++
        json(res, 200, { success: true })
      })()
      return
    }
    if (url.pathname === '/api/token/search') {
      const keyword = url.searchParams.get('keyword')
      const items = keyword && managedModelKey.startsWith(keyword) ? [{ id: 11, name: managedModelKey }] : []
      return json(res, 200, { success: true, data: { items } })
    }
    if (url.pathname === '/api/token/11/key') return json(res, 200, { success: true, data: { key: 'good' } })
    if (url.pathname === '/api/user/topup/info') {
      return json(res, 200, { success: true, data: { pay_methods: [{ type: 'alipay', name: '支付宝' }] } })
    }
    if (url.pathname === '/api/subscription/plans') {
      return json(res, 200, { success: true, data: [{ plan: {
        id: 5, title: '测试套餐', enabled: true, price_amount: 10, currency: 'CNY', duration_unit: 'month', duration_value: 1
      } }] })
    }
    if (url.pathname === '/api/subscription/self') {
      return json(res, 200, { success: true, data: { subscriptions: [
        { subscription: { plan_id: 5, amount_total: 1000, amount_used: 200, end_time: 2000000000 } }
      ] } })
    }
    json(res, 404, { success: false, message: 'missing' })
  })
  const platformPort = await listen(platform)
  base = `http://127.0.0.1:${platformPort}`

  process.env.VEXNAR_NEWAPI_PLATFORM = base
  process.env.VEXNAR_NEWAPI_API = modelsOrigin
  process.env.VEXNAR_DEEPSEEK_API = `${modelsOrigin}/official`

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

test('访问令牌登录校验身份、复用 VERNAX API 密钥并读取账单', async () => {
  const home = await mkdtemp(join(tmpdir(), 'vexnar-account-token-'))
  const account = createPlatformAccount({ home })
  await assert.rejects(() => account.wallet(), { status: 401 })
  await assert.rejects(() => account.loginWithToken('sk-this-is-not-a-pat'), { status: 400 })
  await assert.rejects(() => account.loginWithToken('nap_invalid-test-token'), (error: unknown) =>
    statusOf(error) === 401 && /访问令牌无效或已过期/.test(String((error as Error).message)))
  assert.equal((await account.status()).signed_in, false)

  assert.match(managedModelKey, /^VERNAX-[0-9a-f-]{36}$/)
  assert.equal(createdModelKeys, 1)
  const token = 'nap_fixture-access-1234567890'
  const view = await account.loginWithToken(`Bearer ${token}`)
  assert.equal(view.signed_in, true)
  assert.equal(view.avatar_url, 'https://example.com/avatar.png')
  assert.equal(view.providers[0]?.id, 'vexnar')
  assert.equal(JSON.stringify(view).includes(token), false)
  assert.equal(createdModelKeys, 1, '已有可用的 VERNAX 密钥时不再签发')

  // 已登录时再粘一次令牌：更新令牌而不是报"请先退出"（登录页可能因启动竞态出现）。
  const again = await account.loginWithToken(token)
  assert.equal(again.signed_in, true)
  assert.equal(again.username, 'alice')
  assert.equal(createdModelKeys, 1, '同一账户重复登录不重复签发模型密钥')

  const result = await account.wallet()
  assert.equal(result.platform.amount, 3)
  assert.equal(result.platform.currency, 'CNY')
  assert.deepEqual(result.platform.methods, ['支付宝'])
  assert.deepEqual(result.platform.plans, [{ id: 5, title: '测试套餐', price: 10, currency: 'CNY', duration: '1 个月' }])
  assert.deepEqual(result.platform.subscriptions, [{ id: 5, remaining: 800, ends: 2000000000 }])
  assert.equal(result.deepseek.status, 'unconfigured')

  const withDeepSeek = await account.addProvider({ kind: 'deepseek', api_key: 'sk-good' })
  await assert.rejects(() => account.renewWithToken('nap_fixture-other-user'), { status: 409 })
  assert.deepEqual(await account.status(), withDeepSeek)
  const renewed = await account.renewWithToken(token)
  assert.deepEqual(renewed.providers, withDeepSeek.providers)
  assert.equal(createdModelKeys, 1)

  // 已登录时粘另一个账户的令牌：切换账户，不继承上一个账户的第三方提供方。
  const switched = await account.loginWithToken('nap_fixture-other-user')
  assert.equal(switched.signed_in, true)
  assert.equal(switched.username, 'bob')
  assert.deepEqual(switched.providers.map((provider) => provider.id), ['vexnar'])

  await account.logout()
  await assert.rejects(() => account.wallet(), { status: 401 })
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
  assert.deepEqual(deepseek.providers.find((provider) => provider.id === 'deepseek')?.models, [{
    id: 'deepseek-flash',
    name: 'DeepSeek-V4.1-Flash',
    contextWindow: 1048576,
    maxOutputTokens: 393216,
    inputTypes: ['text', 'image'],
    reasoningEfforts: { low: 'low', high: 'high', max: 'max' }
  }])
})

test('只提供对话接口的自定义 API 可以手动填写模型并验证', async () => {
  const account = createPlatformAccount({ home: accounts })
  const endpoint = {
    kind: 'custom',
    name: '手动配置',
    base_url: `${upstream}/completion-only/chat/completions/`,
    api_key: 'sk-good'
  }
  const before = await account.status()
  await assert.rejects(() => account.addProvider(endpoint), /手动填写模型 ID/)
  await assert.rejects(() => account.addProvider({ ...endpoint, models: [{ id: 'unknown' }] }), /HTTP 400/)
  await assert.rejects(() => account.addProvider({
    ...endpoint, api_key: 'sk-wrong', models: [{ id: 'manual-chat' }]
  }), /HTTP 401/)
  assert.deepEqual(await account.status(), before)

  const models = [{ id: 'manual-chat', name: 'Manual Chat' }]
  const added = await account.addProvider({ ...endpoint, models })
  const provider = added.providers.find((entry) => entry.name === endpoint.name)
  assert.ok(provider)
  assert.equal(provider.base, `${upstream}/completion-only`)
  assert.deepEqual(provider.models, models)
  const updated = await account.updateProvider({ id: provider.id, api_key: 'sk-good' })
  assert.deepEqual(updated.providers.find((entry) => entry.id === provider.id)?.models, models)
  await account.removeProvider(provider.id)
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
