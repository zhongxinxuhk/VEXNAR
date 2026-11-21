// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { ensureProfile, profileName, runtimeBin, runtimeEnv } from './vexnar-runtime.mjs'
import { startGoService } from './vexnar-go.mjs'

/**
 * 数据面由谁回答：默认 `ts`（core 原生读 SQLite，Go 不用启动）；
 * `VEXNAR_RUNTIME_MODE=go` 回到旧路径（拉起/复用 Go，整段转发）。
 */
export function runtimeMode() {
  return String(process.env.VEXNAR_RUNTIME_MODE || 'ts').trim().toLowerCase() === 'go' ? 'go' : 'ts'
}

/**
 * 起 dsh web 客户端。
 *
 * `ts` 模式下不再编译、不再拉起 Go：数据面由 in-process 的 core 直接回答。
 * `go` 模式保留原行为——由本模块拉起（或复用同版本）Go，并把 `VEXNAR_GO_URL`
 * 注进客户端环境。返回 `{ child, go, stop }`，`stop()` 一起收掉两个进程，
 * 避免留下孤儿 Go 继续写库。
 */
export async function startWeb(port, onReady, onAccountHandoff) {
  ensureProfile()
  const mode = runtimeMode()
  const go = mode === 'go' ? await startGoService() : null
  const env = { ...runtimeEnv(), VEXNAR_RUNTIME_MODE: mode, ...(go ? { VEXNAR_GO_URL: go.url } : {}) }
  if (!go) console.log('[vexnar] 运行时底座：TS core（不启动 Go）')
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1'
  const child = spawn(process.execPath, [runtimeBin(), '--profile', profileName,
    '--host', '127.0.0.1', '--port', String(port), '--no-open'], {
    stdio: ['ignore', 'pipe', 'inherit'], env
  })
  const lines = createInterface({ input: child.stdout })
  lines.on('line', line => {
    const ready = /^dsh web: (http:\/\/127\.0\.0\.1:\d+\/\S*)$/.exec(line)
    if (line === 'vexnar: account-handoff') onAccountHandoff?.()
    else if (ready) onReady(ready[1])
    else console.log(line.replace(/^dsh(?=[:\s])/, 'vexnar'))
  })
  const stop = (signal = 'SIGTERM') => {
    if (child.exitCode === null) child.kill(signal)
    go?.stop(signal)
  }
  child.once('exit', () => go?.stop())
  return { child, go, stop }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] || 3099)
  let host
  try {
    host = await startWeb(port, url => console.log(`vexnar web: ${url}`))
  } catch (error) {
    console.error(`[vexnar] ${error.message}`)
    process.exitCode = 1
  }
  if (host) {
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => host.stop(signal))
    host.child.on('error', error => { console.error(error.message); process.exitCode = 1 })
    host.child.on('exit', code => {
      host.go?.stop()
      process.exitCode = code ?? 1
    })
  }
}
