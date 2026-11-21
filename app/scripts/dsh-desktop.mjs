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
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dshHome, readToken, resolveRuntime } from './dsh-runtime.mjs'

const repoRoot = join(import.meta.dirname, '..', '..')


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

const runtime = resolveRuntime()
const desktopEntry = join(runtime, 'apps', 'desktop', 'out', 'main', 'index.js')
const env = {
  ...process.env,
  DSH_HOME: dshHome(),
  VEXNAR_MCP_TOKEN: process.env.VEXNAR_MCP_TOKEN || readToken('mcp.token'),
  VEXNAR_DESKTOP_TOKEN: process.env.VEXNAR_DESKTOP_TOKEN || readToken('desktop.token', 'devtoken')
}

let child
if (!ensureProfileDeps(join(dshHome(), 'profiles', 'web'))) process.exit(1)
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
