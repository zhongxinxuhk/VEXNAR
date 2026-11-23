// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 数据层回归测试。
 *
 * 第一条用例来自一次真实事故：`api.get()` 把已含 `/vexnar-api` 的 `apiUrl()`
 * 又交给会再拼一次前缀的 `request()`，浏览器于是请求
 * `/vexnar-api/vexnar-api/api/traffic`，账户插件剥掉一层后 core 收到
 * `/vexnar-api/api/traffic` → 501「接口未实现」。三个页面同时报错，而 curl 直接
 * 打正确路径一直 200，所以只靠手工验证发现不了。
 *
 * 这里用桩 fetch 断言"真实发出去的 URL"，把这类前缀/查询串错误钉死在单测里。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { API_BASE, ApiError, api, apiUrl, request } from '../src/data/client.ts'

type Captured = { url: string; init: RequestInit | undefined }

function stubFetch(reply: () => Response): { seen: Captured[]; restore: () => void } {
  const seen: Captured[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: typeof input === 'string' ? input : String(input), init })
    return reply()
  }) as typeof globalThis.fetch
  return { seen, restore: () => { globalThis.fetch = original } }
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('api.get 只拼一次前缀：/vexnar-api/api/...', async () => {
  const { seen, restore } = stubFetch(() => json({ ok: true }))
  try {
    await api.get('/api/traffic', undefined, { size: 1, page: 0, host: '' })
  } finally {
    restore()
  }
  assert.equal(seen.length, 1)
  assert.equal(seen[0]?.url, `${API_BASE}/api/traffic?size=1&page=0`,
    '空串参数被丢弃，数字 0 保留；前缀只出现一次')
})

test('apiUrl 与 request 组合不会重复前缀', async () => {
  const { seen, restore } = stubFetch(() => json({}))
  try {
    // 直接给 request 一个完整 URL 是错误的用法，这里断言它的正常用法：
    await request(apiUrl('/api/proxy/state').replace(API_BASE, ''))
  } finally {
    restore()
  }
  assert.equal(seen[0]?.url, `${API_BASE}/api/proxy/state`)
})

test('写方法带 JSON body，GET 不带 content-type', async () => {
  const { seen, restore } = stubFetch(() => json({}))
  try {
    await api.post('/api/proxy/settings', { default_pool: 3 })
    await api.get('/api/tasks')
  } finally {
    restore()
  }
  const post = seen[0]?.init as RequestInit
  assert.equal(post.method, 'POST')
  assert.equal(post.body, JSON.stringify({ default_pool: 3 }))
  assert.equal((post.headers as Record<string, string>)['content-type'], 'application/json')
  const get = seen[1]?.init as RequestInit
  assert.equal((get.headers as Record<string, string>)['content-type'], undefined)
})

test('错误体归一化：message/code/detail 都保留', async () => {
  const { restore } = stubFetch(() => json({ error: '该接口未在本地服务中注册', path: '/api/x' }, 501))
  try {
    await assert.rejects(
      () => api.get('/api/x'),
      (error: unknown) => {
        assert.ok(error instanceof ApiError)
        assert.equal(error.status, 501)
        assert.equal(error.message, '该接口未在本地服务中注册')
        assert.deepEqual(error.detail, { error: '该接口未在本地服务中注册', path: '/api/x' })
        assert.equal(error.retryable, true)
        return true
      }
    )
  } finally {
    restore()
  }
})

test('空响应体不抛错（DELETE 类接口）', async () => {
  const { restore } = stubFetch(() => new Response('', { status: 200 }))
  try {
    assert.equal(await api.del('/api/tasks/1'), null)
  } finally {
    restore()
  }
})
