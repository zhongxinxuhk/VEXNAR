// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { ensureProfile, profileName, runtimeBin, runtimeEnv } from './vexnar-runtime.mjs'

export function startWeb(port, onReady) {
  ensureProfile()
  const env = runtimeEnv()
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1'
  const child = spawn(process.execPath, [runtimeBin(), '--profile', profileName,
    '--host', '127.0.0.1', '--port', String(port), '--no-open'], {
    stdio: ['ignore', 'pipe', 'inherit'], env
  })
  const lines = createInterface({ input: child.stdout })
  lines.on('line', line => {
    const ready = /^dsh web: (http:\/\/127\.0\.0\.1:\d+\/\S*)$/.exec(line)
    if (ready) onReady(ready[1])
    else console.log(line.replace(/^dsh(?=[:\s])/, 'vexnar'))
  })
  return child
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] || 3099)
  const child = startWeb(port, url => console.log(`vexnar web: ${url}`))
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
  child.on('error', error => { console.error(error.message); process.exitCode = 1 })
  child.on('exit', code => { process.exitCode = code ?? 1 })
}
