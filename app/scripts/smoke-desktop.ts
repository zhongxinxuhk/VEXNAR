// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 打包后的冒烟测试：拿安装包里的资源，真启动一次客户端服务。
 *
 * CI 在打完之后跑它，验证的不是「构建成功」，而是「装出来的东西能不能起来」：
 *
 *   1. 预装 profile 能落到独立的数据目录；
 *   2. 包内的 `@deepseek-ai/dsh` 运行时能跑 `dsh web`；
 *   3. VEXNAR 的 core 插件真的加载了（日志里有 `[vexnar]`）；
 *   4. 首页回 200 且内容是 VEXNAR 的；
 *   5. 全程不出现 DeepSeek 的登录门禁。
 *
 * 用法：`tsx scripts/smoke-desktop.ts <Resources/app>`
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const target = resolve(process.argv[2] ?? join(import.meta.dirname, '..', 'desktop-resources', 'app'))
const port = Number(process.env.VEXNAR_SMOKE_PORT ?? 3399)

function fail(message: string): never {
  console.error(`[smoke] FAIL ${message}`)
  process.exit(1)
}

if (!existsSync(target)) fail(`资源目录不存在：${target}`)

// 必须在 import 运行时模块之前设好：appDir / packaged 在模块初始化时求值。
process.env.VEXNAR_APP_DIR = target
process.env.VEXNAR_HOME = process.env.VEXNAR_SMOKE_HOME ?? join(tmpdir(), `vexnar-smoke-${process.pid}`)
process.env.DSH_TELEMETRY_DISABLED = '1'

const { seedProfile } = await import('../desktop/seed-profile.ts')
const { runtimeBin, runtimeEnv, vexnarHome, profileName } = await import('./vexnar-runtime.ts')

seedProfile()

const profile = join(vexnarHome(), 'profiles', profileName)
const required = [
  'node_modules/@vexnar/dsh-account/lib/client.js',
  'node_modules/@vexnar/dsh-account/lib/core-embedded.js',
  'node_modules/@vexnar/dsh-ui/lib/client.js',
  'node_modules/@vexnar/dsh-egress/index.js'
]
for (const file of required) {
  if (!existsSync(join(profile, file))) fail(`profile 里缺少 ${file}`)
}

let bin: string
try {
  bin = runtimeBin()
} catch (error) {
  fail(`找不到运行时：( ${error instanceof Error ? error.message : String(error)} )`)
}

console.log(`[smoke] 启动 ${bin}（profile=${profile}）`)
const child = spawn(process.execPath, [bin, '--profile', profileName, '--host', '127.0.0.1', '--port', String(port), '--no-open'], {
  cwd: profile,
  // 必须和 startWeb 用同一套环境：dsh 靠 DSH_HOME 找 profile，缺了它就会去
  // 默认的 ~/.dsh 里找，报「profile 不存在」。
  env: { ...runtimeEnv(), VEXNAR_STORE: 'sqlite', VEXNAR_CLIENT_SQLITE: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
})

let url: string | undefined
let sawPlugin = false
let stderr = ''
const timer = setTimeout(() => {
  console.error(stderr.slice(-4000))
  child.kill('SIGTERM')
  fail('120 秒内没有看到 dsh web 就绪')
}, 120_000)

const trim = (chunk: Buffer): string => chunk.toString('utf8')

child.stderr.on('data', (chunk: Buffer) => {
  const text = trim(chunk)
  stderr = (stderr + text).slice(-20000)
  if (text.includes('[vexnar]')) sawPlugin = true
  if (text.includes('needsWelcome') || text.includes('desktop welcome')) fail('启动日志里出现桌面登录门禁')
})
child.stdout.on('data', (chunk: Buffer) => {
  const text = trim(chunk)
  if (text.includes('[vexnar]')) sawPlugin = true
  const matched = /^dsh web: (http:\/\/127\.0\.0\.1:\d+\/\S*)$/mu.exec(text)
  if (matched !== null && url === undefined) {
    url = matched[1]
    void verify()
  }
})
child.on('exit', (code) => {
  if (url === undefined) fail(`客户端服务提前退出（code=${String(code)}）\n${stderr.slice(-4000)}`)
})

async function verify(): Promise<void> {
  try {
    // 首启是未登录状态：客户端会 302 到 VEXNAR 自己的登录页。跟随重定向会把
    // 登录页的 HTML 拉回来，看不出是不是它接管的，所以手动看这一跳。
    const response = await fetch(url!, { redirect: 'manual' })
    const location = response.headers.get('location') ?? ''
    if (response.status >= 500) throw new Error(`首页 HTTP ${response.status}`)
    if (/deepseek/i.test(location)) throw new Error(`被 DeepSeek 登录页接管：${location}`)
    if (!sawPlugin) throw new Error('日志里没有 [vexnar]，说明 core 插件没加载')
    // 200 说明直接进了工作区；3xx 说明跳去了登录页——两者都算启动成功。
    if (response.status === 200) {
      const html = await response.text()
      if (!/vexnar/i.test(html)) throw new Error('首页没有 VEXNAR 标识')
      console.log(`[smoke] PASS HTTP 200 / ${html.length} bytes / ${new URL(url!).origin}`)
    } else if (response.status >= 300 && response.status < 400) {
      console.log(`[smoke] PASS HTTP ${response.status} → ${location}`)
    } else {
      throw new Error(`首页 HTTP ${response.status}`)
    }
    clearTimeout(timer)
    child.kill('SIGTERM')
    process.exit(0)
  } catch (error) {
    clearTimeout(timer)
    child.kill('SIGTERM')
    fail(error instanceof Error ? error.message : String(error))
  }
}
