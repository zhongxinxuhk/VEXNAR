// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Launch the dsh desktop shell from this checkout.
 *
 * Prefers a built desktop app inside app/dsh; falls back to the installed
 * DeepSeek Harness.app with this checkout's DSH_HOME so the same profile,
 * provider and MCP wiring apply.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { dshHome, resolveRuntime } from './dsh-runtime.mjs'

const runtime = resolveRuntime()
const desktopEntry = join(runtime, 'apps', 'desktop', 'out', 'main', 'index.js')
const env = { ...process.env, DSH_HOME: dshHome() }

let child
if (existsSync(desktopEntry)) {
  console.log(`[dsh] desktop source entry=${desktopEntry}`)
  child = spawn(join(runtime, 'node_modules', '.bin', 'electron'), [desktopEntry], { stdio: 'inherit', env })
} else {
  const app = '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness'
  console.log(`[dsh] desktop app=${app}`)
  child = spawn(app, [], { stdio: 'inherit', env })
}
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
