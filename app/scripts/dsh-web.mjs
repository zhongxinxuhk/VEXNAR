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
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dshHome, readToken, resolveRuntime } from './dsh-runtime.mjs'

const repoRoot = join(import.meta.dirname, '..', '..')

const runtime = resolveRuntime()
const bin = join(runtime, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const args = ['--profile', 'web', ...process.argv.slice(2)]

console.log(`[dsh] runtime=${runtime}`)
console.log(`[dsh] home=${dshHome()}`)


/** Profile plugins are pnpm deps: restore them when node_modules was pruned. */
function ensureProfileDeps(profile) {
  const required = ['@vexnar/dsh-ui', '@vexnar/dsh-account']
  const missing = required.some((name) => !existsSync(join(profile, 'node_modules', name, 'package.json')))
  const stale = !missing && [['vexnar/ui', '@vexnar/dsh-ui'], ['vexnar/account', '@vexnar/dsh-account']]
    .some(([dir, name]) => {
      return ['lib/client.js', 'lib/index.js'].some((file) => {
        const source = join(repoRoot, 'app', dir, file)
        const copy = join(profile, 'node_modules', name, file)
        if (!existsSync(source) || !existsSync(copy)) return false
        return !readFileSync(source).equals(readFileSync(copy))
      })
    })
  if (!missing && !stale) return true
  console.log(`[dsh] ${missing ? 'profile plugins missing' : 'plugin bundles changed'}; syncing profile`)
  const args = missing ? ['install', '--frozen-lockfile'] : ['install', '--force']
  const result = spawnSync('pnpm', args, { cwd: profile, stdio: 'inherit' })
  if (result.status !== 0) {
    console.error('[dsh] restore failed; run the "Setup app profile" run configuration once')
    return false
  }
  return true
}

if (!ensureProfileDeps(join(dshHome(), 'profiles', 'web'))) process.exit(1)

const child = spawn(process.execPath, [bin, ...args], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DSH_HOME: dshHome(),
    VEXNAR_MCP_TOKEN: process.env.VEXNAR_MCP_TOKEN || readToken('mcp.token'),
    VEXNAR_DESKTOP_TOKEN: process.env.VEXNAR_DESKTOP_TOKEN || readToken('desktop.token', 'devtoken')
  }
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
