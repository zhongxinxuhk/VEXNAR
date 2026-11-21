// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 桌面壳：把 dsh web 装进一个 Electron 窗口。
 *
 * 主进程入口是 `.ts`（Electron 44 自带 Node 24，按类型擦除直接执行），但
 * `import { app } from 'electron'` 在 ESM 主进程里走不到内置模块——裸说明符会被
 * 解析成 npm 包 `electron`（其 ESM 只有默认导出，值是二进制路径）。所以这里用
 * `createRequire` 拿主进程 API，既过类型又能在两种加载方式下都拿到真对象。
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserWindow as BrowserWindowInstance } from 'electron'
import { appDir, vexnarHome } from './vexnar-runtime.ts'
import { startWeb, type WebHost } from './vexnar-web.ts'

const require = createRequire(import.meta.url)
const { app, BrowserWindow, shell } = require('electron') as typeof import('electron')

app.setName('VEXNAR')
if (process.platform === 'win32') app.setAppUserModelId('cn.hn.sec.vexnar')
const userData = join(vexnarHome(), 'electron')
mkdirSync(userData, { recursive: true, mode: 0o700 })
app.setPath('userData', userData)
app.setPath('sessionData', userData)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let window: BrowserWindowInstance | undefined
  let host: WebHost | undefined
  const quit = (error: string): void => {
    console.error(`[vexnar] ${error}`)
    app.exit(1)
  }
  app.on('second-instance', () => window?.focus())
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => host?.stop())
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => app.quit())
  app.whenReady().then(async () => {
    host = await startWeb(0, url => {
      const origin = new URL(url).origin
      const icon = join(appDir, 'vexnar', 'account', 'assets', 'logo.png')
      app.dock?.setIcon(icon)
      window = new BrowserWindow({
        title: 'VEXNAR', width: 1350, height: 880, icon,
        webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true }
      })
      const openExternal = (destination: string): void => {
        if (['https:', 'http:'].includes(new URL(destination).protocol)) void shell.openExternal(destination)
      }
      window.webContents.setWindowOpenHandler(({ url: target }) => {
        if (new URL(target).origin === origin) void window?.loadURL(target)
        else openExternal(target)
        return { action: 'deny' }
      })
      window.webContents.on('will-navigate', (event, destination: string) => {
        if (new URL(destination).origin === origin) return
        event.preventDefault()
        openExternal(destination)
      })
      window.on('closed', () => { window = undefined })
      void window.loadURL(url)
    }, () => {
      window?.show()
      window?.focus()
    })
    host.child.on('error', (error: Error) => quit(error.message))
    host.child.on('exit', (code: number | null) => code === 0 ? app.quit() : quit(`本机客户端服务退出 (${code})`))
  }).catch((error: unknown) => quit((error as Error).message))
}
