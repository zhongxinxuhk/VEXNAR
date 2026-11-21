#!/usr/bin/env tsx
// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { appDir } from './vexnar-runtime.ts'

type Launch = [file: string, args: string[]]

const [command, ...args] = process.argv.slice(2)
const usage = '用法：vexnar setup | vexnar web [--port 3099] | vexnar desktop'

/** 子进程同样由 tsx 载入：脚本本身是 TS，`process.execPath` 单跑会在非 erasable 语法上翻车。 */
const tsx = (file: string, ...rest: string[]): string[] => ['--import', 'tsx', file, ...rest]

let launch: Launch | undefined
try {
  switch (command) {
    case undefined:
    case '--help':
    case '-h':
      console.log(usage)
      break
    case 'setup':
      if (args.length) throw new Error(usage)
      launch = [process.execPath, tsx(join(import.meta.dirname, 'setup-app-profile.ts'))]
      break
    case 'web': {
      const port = args.length ? Number(args[1]) : 3099
      if (args.length && (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1]) || port > 65535)) {
        throw new Error(usage)
      }
      launch = [process.execPath, tsx(join(import.meta.dirname, 'vexnar-web.ts'), String(port))]
      break
    }
    case 'desktop': {
      if (args.length) throw new Error(usage)
      const require = createRequire(import.meta.url)
      launch = [String(require('electron')), [join(import.meta.dirname, 'vexnar-desktop.ts')]]
      break
    }
    default:
      throw new Error(usage)
  }
  if (launch) {
    const env: NodeJS.ProcessEnv = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(launch[0], launch[1], { cwd: appDir, env, stdio: 'inherit' })
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal))
    child.on('error', (error: Error) => { console.error(`[vexnar] ${error.message}`); process.exitCode = 1 })
    child.on('exit', (code: number | null) => { process.exitCode = code ?? 1 })
  }
} catch (error) {
  console.error(`[vexnar] ${(error as Error).message}`)
  process.exitCode = 1
}
