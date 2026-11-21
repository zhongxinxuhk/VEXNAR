// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Launch the dsh web profile.
 *
 * The web profile serves the browser client; the VEXNAR app bundle
 * (app/vexnar/cordis.patch.yml) points its model route at the Go gateway and
 * mounts the Go MCP endpoint. Go must already be running on 127.0.0.1:8787.
 *
 * The profile's VEXNAR plugins are ordinary pnpm `file:` dependencies, so the
 * profile already knows which tree it runs. This script must not copy one tree's
 * `core-embedded.js` over another tree's account plugin: `handle` and
 * `isGoDataRequest` are a contract between those two halves, and mixing trees
 * shows up as `isGoDataRequest is not a function` plus a wall of unresolved
 * route modules. Point the profile at a tree with `VEXNAR_DSH_BUNDLES=<repo>`
 * when you deliberately want to switch.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dshHome, readToken, resolveRuntime } from './dsh-runtime.mjs'

const repoRoot = join(import.meta.dirname, '..', '..')

const runtime = resolveRuntime()
const bin = join(runtime, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const args = ['--profile', 'web', ...process.argv.slice(2)]

console.log(`[dsh] runtime=${runtime}`)
console.log(`[dsh] home=${dshHome()}`)

/** Repoint the profile's VEXNAR bundles at an explicit tree (opt-in). */
function pinProfileBundles(profile, bundleRoot) {
  if (!bundleRoot) return false
  const manifest = join(profile, 'package.json')
  if (!existsSync(manifest)) return false
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
  const deps = { ...(pkg.dependencies ?? {}) }
  let changed = false
  for (const [name, dir] of [
    ['@vexnar/dsh-ui', 'ui'],
    ['@vexnar/dsh-account', 'account']
  ]) {
    const spec = `file:${join(bundleRoot, 'app', 'vexnar', dir)}`
    if (deps[name] !== spec) {
      deps[name] = spec
      changed = true
    }
  }
  if (!changed) return false
  pkg.dependencies = deps
  writeFileSync(manifest, `${JSON.stringify(pkg, null, 2)}\n`)
  console.log(`[dsh] profile bundles -> ${bundleRoot}`)
  return true
}

/**
 * Profile plugins are pnpm deps: restore them when node_modules was pruned.
 *
 * The staleness check compares the profile's copy against this checkout, which is
 * only meaningful when the profile is supposed to run this checkout. A profile
 * pinned elsewhere keeps its own bundles; VEXNAR_DSH_BUNDLES is how you move it.
 */
function ensureProfileDeps(profile, thisCheckout) {
  // dsh-claude-style is a registry dependency: it is absent after a fresh clone
  // and the boot would fail on an unresolved bundle, so check it here too.
  const required = ['@vexnar/dsh-ui', '@vexnar/dsh-account', 'dsh-claude-style']
  const missing = required.some((name) => !existsSync(join(profile, 'node_modules', name, 'package.json')))
  const stale =
    thisCheckout &&
    !missing &&
    [
      ['vexnar/ui', '@vexnar/dsh-ui'],
      ['vexnar/account', '@vexnar/dsh-account']
    ].some(([dir, name]) =>
      ['lib/client.js', 'lib/index.js'].some((file) => {
        const source = join(repoRoot, 'app', dir, file)
        const copy = join(profile, 'node_modules', name, file)
        if (!existsSync(source) || !existsSync(copy)) return false
        return !readFileSync(source).equals(readFileSync(copy))
      })
    )
  if (!missing && !stale) return true
  console.log(`[dsh] ${missing ? 'profile plugins missing' : 'plugin bundles changed'}; syncing profile`)
  const result = spawnSync('pnpm', ['install', missing ? '--frozen-lockfile' : '--force'], {
    cwd: profile,
    stdio: 'inherit'
  })
  if (result.status !== 0) {
    console.error('[dsh] restore failed; run the "Setup app profile" run configuration once')
    return false
  }
  return true
}

const profile = join(dshHome(), 'profiles', 'web')
const pinned = pinProfileBundles(profile, process.env.VEXNAR_DSH_BUNDLES)
if (!ensureProfileDeps(profile, Boolean(process.env.VEXNAR_DSH_BUNDLES) || pinned)) process.exit(1)

const accountDir = join(profile, 'node_modules', '@vexnar', 'dsh-account')
const embedded = join(accountDir, 'lib', 'core-embedded.js')
if (!existsSync(embedded)) {
  console.error(`[dsh] ${embedded} missing; run the "Setup app profile" run configuration once`)
  process.exit(1)
}
if (!accountDir.startsWith(repoRoot)) {
  console.log(`[dsh] app bundles come from ${accountDir}`)
}

const child = spawn(process.execPath, [bin, ...args], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DSH_HOME: dshHome(),
    VEXNAR_MCP_TOKEN: process.env.VEXNAR_MCP_TOKEN || readToken('mcp.token'),
    DSH_CLIENT_TITLE: 'VEXNAR',
    VEXNAR_DESKTOP_TOKEN: process.env.VEXNAR_DESKTOP_TOKEN || readToken('desktop.token', 'devtoken'),
    CRAFT_ANYTHING_CLI: process.env.CRAFT_ANYTHING_CLI || join(process.env.HOME || '', '.dsh', 'plugins-data', 'craft-anything', 'craft-anything-cli')
  }
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
