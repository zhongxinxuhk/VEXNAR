// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { ensureProfile, profileName, runtimeBin, runtimeEnv } from './vexnar-runtime.ts'
import { startGoService, type GoService } from './vexnar-go.ts'

/** 一个在跑的客户端：dsh web 子进程 + 它用的 Go 后端（默认是空壳）。 */
export type WebHost = {
  child: ChildProcess
  go: GoService
  stop: (signal?: NodeJS.Signals) => void
}

/**
 * 起 dsh web 客户端。
 *
 * 客户端的数据保存在 profile 的 SQLite 中。旧 Go 服务有独立的数据库配置。
 * 返回 `{ child, go, stop }`，`stop()` 一起收掉这两个进程。
 */
export async function startWeb(
  port: number,
  onReady: (url: string) => void,
  onAccountHandoff?: () => void
): Promise<WebHost> {
  ensureProfile()
  const go = await startGoService()
  const mode = String(process.env.VEXNAR_RUNTIME_MODE || 'ts').trim().toLowerCase() === 'go' ? 'go' : 'ts'
  const env: Record<string, string> = {
    ...runtimeEnv(), VEXNAR_STORE: 'sqlite', VEXNAR_CLIENT_SQLITE: '1',
    VEXNAR_RUNTIME_MODE: mode, ...(go.url ? { VEXNAR_GO_URL: go.url } : {})
  }
  delete env.VEXNAR_PG_DSN
  delete env.VEXNAR_PG_URL
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1'
  const child = spawn(process.execPath, [runtimeBin(), '--profile', profileName,
    '--host', '127.0.0.1', '--port', String(port), '--no-open'], {
    stdio: ['ignore', 'pipe', 'inherit'], env
  })
  const lines = createInterface({ input: child.stdout! })
  lines.on('line', (line: string) => {
    const ready = /^dsh web: (http:\/\/127\.0\.0\.1:\d+\/\S*)$/.exec(line)
    if (line === 'vexnar: account-handoff') onAccountHandoff?.()
    else if (ready) onReady(ready[1]!)
    else console.log(line.replace(/^dsh(?=[:\s])/, 'vexnar'))
  })
  const stop = (signal: NodeJS.Signals = 'SIGTERM'): void => {
    if (child.exitCode === null) child.kill(signal)
    go.stop(signal)
  }
  child.once('exit', () => go.stop())
  return { child, go, stop }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.argv[2] || 3099)
  let host: WebHost | undefined
  try {
    host = await startWeb(port, url => console.log(`vexnar web: ${url}`))
  } catch (error) {
    console.error(`[vexnar] ${(error as Error).message}`)
    process.exitCode = 1
  }
  if (host) {
    const running = host
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => running.stop(signal))
    running.child.on('error', (error: Error) => { console.error(error.message); process.exitCode = 1 })
    running.child.on('exit', (code: number | null) => {
      running.go.stop()
      process.exitCode = code ?? 1
    })
  }
}
