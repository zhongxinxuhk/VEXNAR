// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Launch the dsh web profile against this checkout.
 *
 * The web profile serves the browser client; the VEXNAR app bundle
 * (app/vexnar/cordis.patch.yml) points its model route at the Go gateway and
 * mounts the Go MCP endpoint. Go must already be running on 127.0.0.1:8787.
 */
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { dshHome, resolveRuntime } from './dsh-runtime.mjs'

const runtime = resolveRuntime()
const bin = join(runtime, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const args = ['--profile', 'web', ...process.argv.slice(2)]

console.log(`[dsh] runtime=${runtime}`)
console.log(`[dsh] home=${dshHome()}`)

const child = spawn(process.execPath, [bin, ...args], {
  stdio: 'inherit',
  env: { ...process.env, DSH_HOME: dshHome() }
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
