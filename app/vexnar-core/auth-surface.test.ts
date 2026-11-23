// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// 登录面回归：`POST /api/auth/login` 不认识 `Captcha`，也不会执行其中的内容。
//
// 背景：2026-11 公开报道的 ARTEX 二开项目后门，用
// `{"username":"x","password":"y","Captcha":"!id"}` 在登录接口触发命令执行。
// VEXNAR 的登录只读 username / password（Go 与 TS 两侧都是），未知字段被
// JSON 解码器直接丢弃。这条测试把「未知字段一律忽略、绝不执行」钉死，防止以后
// 有人照抄那段 fork 代码，也防止有人把 Captcha 接进「人机校验」时顺手执行。
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'

const root = await mkdtemp(join(tmpdir(), 'vexnar-auth-surface-'))
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_STORE_ROOT = root
process.env.VEXNAR_SQLITE_PATH = join(root, 'vexnar.sqlite')

const { register } = await import('./src/routes/auth.ts')
const app = new Hono()
register(app)

const post = async (path: string, body: unknown) => {
  const response = await app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return { status: response.status, text: await response.text() }
}

const marker = join(root, 'captcha-executed')
const commandCaptcha = (password: string) => ({ username: 'VEXNAR', password, Captcha: `!touch ${marker}` })

try {
  const init = await post('/api/auth/init', { password: 'Passw0rd-abcdef' })
  assert.equal(init.status, 200, '初始化密码应成功')

  // 报道里的原始 payload：用户名不匹配 → 401，且不执行 `!id`
  const article = await post('/api/auth/login', { username: 'x', password: 'y', Captcha: '!id' })
  assert.equal(article.status, 401, '非 VEXNAR 用户名应被拒绝')
  assert.ok(!/uid=|gid=/.test(article.text), '响应不得包含命令输出')

  // 正确密码 + 命令型 Captcha：登录成功，但 Captcha 必须被忽略
  const ok = await post('/api/auth/login', commandCaptcha('Passw0rd-abcdef'))
  assert.equal(ok.status, 200, '正确密码应登录成功')
  assert.ok(JSON.parse(ok.text).token, '应返回 token')
  assert.equal(existsSync(marker), false, 'Captcha 不得触发命令执行')

  // 错误密码 + 命令型 Captcha：401，同样不执行
  const bad = await post('/api/auth/login', commandCaptcha('wrong-password'))
  assert.equal(bad.status, 401, '错误密码应被拒绝')
  assert.equal(existsSync(marker), false, '失败路径也不得执行 Captcha')

  // 其他未知字段（含伪造 role）不改变结果，也不会被当成权限
  const extra = await post('/api/auth/login', {
    username: 'VEXNAR',
    password: 'Passw0rd-abcdef',
    Captcha: '!id',
    role: 'admin',
    is_admin: true
  })
  assert.equal(extra.status, 200, '未知字段应被忽略而不是报错')
  assert.ok(!/uid=/.test(extra.text), '响应不得包含命令输出')
  assert.equal(existsSync(marker), false, '未知字段不得触发命令执行')

  // 空 body / 非 JSON 也不应 500
  const empty = await app.request('/api/auth/login', { method: 'POST' })
  assert.ok(empty.status >= 400 && empty.status < 500, `空正文应是 4xx，实际 ${empty.status}`)
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('auth login surface: 12 checks passed')
