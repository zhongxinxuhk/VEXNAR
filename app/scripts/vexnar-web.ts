// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { appDir, ensureProfile, profileName, runtimeBin, runtimeEnv } from './vexnar-runtime.ts'
import { startGoService, type GoService } from './vexnar-go.ts'

/** 一个在跑的客户端：dsh web 子进程 + 它用的 Go 后端（默认是空壳）。 */
export type WebHost = {
  child: ChildProcess
  go: GoService
  stop: (signal?: NodeJS.Signals) => void
}

/**
 * 与 Go 服务读同一份 `config.json`：把 `database` 段落折成 `VEXNAR_PG_DSN`。
 *
 * 客户端的领域数据由 TypeScript core 自己读写，但库必须是同一个——否则同一个任务
 * 在客户端和 `web/` 控制台里会变成两行。环境里已经给了 DSN 就尊重环境。
 */
function databaseEnv(): Record<string, string> {
  if (process.env.VEXNAR_PG_DSN || process.env.VEXNAR_PG_URL || process.env.VEXNAR_STORE) return {}
  try {
    const config = JSON.parse(readFileSync(join(appDir, '..', 'config.json'), 'utf8'))
    const db = config?.database
    if (!db?.host || !db?.dbname) return {}
    const auth = db.user
      ? `${encodeURIComponent(db.user)}${db.password ? `:${encodeURIComponent(db.password)}` : ''}@`
      : ''
    const ssl = db.sslmode === 'disable' ? '?sslmode=disable' : ''
    return { VEXNAR_PG_DSN: `postgres://${auth}${db.host}:${db.port ?? 5432}/${db.dbname}${ssl}` }
  } catch {
    return {}
  }
}

/**
 * 起 dsh web 客户端。
 *
 * 领域接口由内置 TS core 回答（`vexnar-core`），数据面走 `VEXNAR_PG_DSN` 指向的
 * PostgreSQL。Go 后端默认不启动；`VEXNAR_GO=on` 才会编译并拉起它做对照验证。
 * 返回 `{ child, go, stop }`，`stop()` 一起收掉这两个进程。
 */
export async function startWeb(
  port: number,
  onReady: (url: string) => void,
  onAccountHandoff?: () => void
): Promise<WebHost> {
  ensureProfile()
  const go = await startGoService()
  // 数据面由谁回答：默认 `ts`（core 原生读库，Go 不用启动）；`VEXNAR_RUNTIME_MODE=go`
  // 回到旧路径（拉起/复用 Go，整段转发）。这个开关要传给子进程，core 的 mode.ts 读它。
  const mode = String(process.env.VEXNAR_RUNTIME_MODE || 'ts').trim().toLowerCase() === 'go' ? 'go' : 'ts'
  const env: Record<string, string> = {
    ...runtimeEnv(), ...databaseEnv(), VEXNAR_RUNTIME_MODE: mode, ...(go.url ? { VEXNAR_GO_URL: go.url } : {})
  }
  if (mode === 'ts') console.log('[vexnar] 运行时底座：TS core（不启动 Go）')
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
