// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { app, BrowserWindow, shell } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { appDir, vexnarHome } from './vexnar-runtime.mjs'
import { startWeb } from './vexnar-web.mjs'

app.setName('VEXNAR')
if (process.platform === 'win32') app.setAppUserModelId('cn.hn.sec.vexnar')
const userData = join(vexnarHome(), 'electron')
mkdirSync(userData, { recursive: true, mode: 0o700 })
app.setPath('userData', userData)
app.setPath('sessionData', userData)

if (!app.requestSingleInstanceLock()) app.quit()
else {
  let window
  let host
  const quit = error => {
    console.error(`[vexnar] ${error}`)
    app.exit(1)
  }
  app.on('second-instance', () => window?.focus())
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => host?.kill('SIGTERM'))
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.quit())
  app.whenReady().then(() => {
    host = startWeb(0, url => {
      const origin = new URL(url).origin
      const icon = join(appDir, 'vexnar', 'account', 'assets', 'logo.png')
      app.dock?.setIcon(icon)
      window = new BrowserWindow({
        title: 'VEXNAR', width: 1350, height: 880, icon,
        webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true }
      })
      const openExternal = destination => {
        if (['https:', 'http:'].includes(new URL(destination).protocol)) void shell.openExternal(destination)
      }
      window.webContents.setWindowOpenHandler(({ url: destination }) => {
        if (new URL(destination).origin === origin) void window.loadURL(destination)
        else openExternal(destination)
        return { action: 'deny' }
      })
      window.webContents.on('will-navigate', (event, destination) => {
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
    host.on('error', error => quit(error.message))
    host.on('exit', code => code === 0 ? app.quit() : quit(`本机客户端服务退出 (${code})`))
  }).catch(error => quit(error.message))
}
