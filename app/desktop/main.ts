// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * VEXNAR Harness 的桌面主进程。
 *
 * 和 `pnpm run desktop` 走的是同一条路径（`scripts/vexnar-desktop.ts`）：起一个
 * `dsh web --profile vexnar` 子进程，拿到地址后开窗。区别只有资源在哪：
 *
 *   - 源码里：`app/`，profile 在 `app/.vexnar-home`；
 *   - 安装包里：`Contents/Resources/app`，profile 与插件源都在里面，首启由
 *     `seedProfile()` 复制到 `~/.vexnar`。
 *
 * 为什么不复用 vendored 上游的桌面壳：它有 DeepSeek 平台的登录门禁
 * （`needsWelcome()`），没登录就只弹「欢迎使用 / 登录 / 添加 API Key」，
 * 根本不会走到 VEXNAR 的 web UI。VEXNAR 的登录由 `@vexnar/dsh-account` 接管。
 *
 * `VEXNAR_SMOKE=1` 时不建窗口，只验证服务起得来、页面是 VEXNAR 的，然后退出。
 * 打包后的冒烟测试用它。
 */

import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { BrowserWindow as BrowserWindowInstance } from 'electron'

const require = createRequire(import.meta.url)
const { app, BrowserWindow, shell } = require('electron') as typeof import('electron')

/**
 * 资源根目录。Electron 才提供 `process.resourcesPath`；本地直接 node 跑
 * （冒烟测试、调试）时退回仓库里的准备目录。
 */
const resources = (process as unknown as { resourcesPath?: string }).resourcesPath
  ?? join(import.meta.dirname, '..', 'desktop-resources')

// 必须在 import 运行时模块**之前**设好：`appDir` / `packaged` 在模块初始化时求值。
process.env.VEXNAR_APP_DIR ??= join(resources, 'app')
process.env.VEXNAR_HOME ??= join(homedir(), '.vexnar')

// 解构里不能带 `type` 修饰符，类型单独取。
const web = await import('../scripts/vexnar-web.ts')
const { startWeb } = web
type WebHost = Awaited<ReturnType<typeof startWeb>>
const { seedProfile } = await import('./seed-profile.ts')

const smoke = process.env.VEXNAR_SMOKE === '1'

app.setName('VEXNAR Harness')
if (process.platform === 'win32') app.setAppUserModelId('com.vexnar.harness')
// Electron 自己的缓存也放进数据目录：安装目录只读，默认的 userData 会写不进去。
const userData = join(homedir(), '.vexnar', 'electron')
app.setPath('userData', userData)
app.setPath('sessionData', userData)

let window: BrowserWindowInstance | undefined
let host: WebHost | undefined

function quit(error: string): void {
  console.error(`[vexnar] ${error}`)
  app.exit(1)
}

function iconPath(): string {
  const candidate = join(process.env.VEXNAR_APP_DIR!, 'vexnar', 'account', 'assets', 'logo.png')
  return existsSync(candidate) ? candidate : join(resources, 'app-icon.png')
}

function openWindow(url: string): void {
  const origin = new URL(url).origin
  window = new BrowserWindow({
    title: 'VEXNAR Harness',
    width: 1350,
    height: 880,
    icon: iconPath(),
    webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true }
  })
  const openExternal = (destination: string): void => {
    if (['https:', 'http:'].includes(new URL(destination).protocol)) void shell.openExternal(destination)
  }
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    // 站内跳转留在窗口里，外链交给系统浏览器，别把 Electron 变成浏览器。
    if (new URL(target).origin === origin) void window?.loadURL(target)
    else openExternal(target)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, destination) => {
    if (new URL(destination).origin === origin) return
    event.preventDefault()
    openExternal(destination)
  })
  window.on('closed', () => { window = undefined })
  void window.loadURL(url)
}

/** 冒烟：服务起来、页面回 200、内容是 VEXNAR 的。失败以非零码退出。 */
async function verify(url: string, running: WebHost): Promise<void> {
  try {
    const response = await fetch(url)
    const html = await response.text()
    if (!response.ok) throw new Error(`首页返回 HTTP ${response.status}`)
    if (!/vexnar/i.test(html)) throw new Error('首页里没有 VEXNAR 标识')
    console.log(`[smoke] PASS HTTP ${response.status} / ${html.length} bytes / ${new URL(url).origin}`)
    running.stop()
    app.exit(0)
  } catch (error) {
    console.error(`[smoke] FAIL ${error instanceof Error ? error.message : String(error)}`)
    running.stop()
    app.exit(1)
  }
}

if (!smoke && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => window?.focus())
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => host?.stop())
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => app.quit())

  app.whenReady().then(async () => {
    seedProfile()
    host = await startWeb(0, (url) => {
      if (smoke) {
        void verify(url, host!)
        return
      }
      openWindow(url)
    })
    host.child.on('error', (error: Error) => quit(error.message))
    host.child.on('exit', (code: number | null) => {
      if (code === 0) app.quit()
      else quit(`本机客户端服务退出 (${code})`)
    })
  }).catch((error: unknown) => quit((error as Error).message))
}
