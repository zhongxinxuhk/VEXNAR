// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Upstream boundary check.
 *
 * Fails when:
 *   1. app/dsh is missing, or its HEAD no longer matches upstream.lock.json;
 *   2. the upstream tree has local modifications (someone edited vendored code);
 *   3. the upstream API surface VEXNAR depends on disappeared or was renamed;
 *   4. VEXNAR's own artifacts (bundle patch, client plugin) stopped matching
 *      the contract they rely on;
 *   5. a second package manager appeared under app/ (pnpm only).
 *
 * Run after every upstream upgrade, and before shipping: `pnpm run upstream:check`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const app = join(here, '..')
const dsh = join(app, 'dsh')
const lock = JSON.parse(readFileSync(join(app, 'upstream.lock.json'), 'utf8'))

const failures = []
const passes = []

function ok(label, condition, detail = '') {
  if (condition) passes.push(label)
  else failures.push(detail === '' ? label : `${label}: ${detail}`)
}

function git(args) {
  return execFileSync('git', ['-C', dsh, ...args], { encoding: 'utf8' }).trim()
}

// ── 1. pinned upstream identity ────────────────────────────────────────────
ok('app/dsh exists', existsSync(join(dsh, '.git')), 'run `pnpm run upstream:check` after scripts/fetch-dsh.sh')
if (existsSync(join(dsh, '.git'))) {
  const head = git(['rev-parse', 'HEAD'])
  ok('upstream commit matches lock', head === lock.commit, `HEAD ${head} != ${lock.commit} (${lock.tag})`)
  const dirty = git(['status', '--porcelain'])
  ok('upstream tree is pristine', dirty === '', `local modifications:\n${dirty}`)

  const tagCommit = git(['rev-list', '-n', '1', lock.tag])
  ok('lock tag resolves to lock commit', tagCommit === lock.commit, `${lock.tag} -> ${tagCommit}`)
}

// ── 2. upstream surface VEXNAR depends on ──────────────────────────────────
function contains(rel, needle, label) {
  const file = join(dsh, rel)
  if (!existsSync(file)) return ok(label, false, `${rel} missing`)
  const text = readFileSync(file, 'utf8')
  return ok(label, text.includes(needle), `${rel} has no ${JSON.stringify(needle)}`)
}

contains('packages/client/ui-tool/src/client/contract/slots.ts', 'tool.call.toolview', 'slot tool.call.toolview')
contains('packages/client/ui-sidebar/src/client/contract/slots.ts', 'sidebar.brand.mark', 'slot sidebar.brand.mark')
contains('packages/client/ui-sidebar/src/client/contract/slots.ts', 'sidebar.brand.name', 'slot sidebar.brand.name')
contains('packages/bundle/base/cordis.patch.yml', 'llm-pi-ai', 'base row llm-pi-ai')
contains('packages/bundle/base/cordis.patch.yml', 'deepseek-account', 'base row deepseek-account')
contains('packages/bundle/base/cordis.patch.yml', 'llm-deepseek-account', 'base row llm-deepseek-account')
contains('packages/bundle/web-app/cordis.patch.yml', 'mcp-manager', 'web row mcp-manager')
contains('packages/bundle/web-app/cordis.patch.yml', 'ui-brand-official', 'web row ui-brand-official')
contains('packages/bundle/web-app/cordis.patch.yml', 'ui-settings-account', 'web row ui-settings-account')
contains('packages/client/modules/src/index.ts', '__ModuleLoader__', 'client module loader')

ok('pi-ai adapter exists', existsSync(join(dsh, 'packages/llm/llm-pi-ai')))
ok('client plugin loader exists', existsSync(join(dsh, 'packages/client/modules')))
contains('packages/mcp/mcp-client/src/index.ts', "z.const('streamable-http')", 'MCP transport streamable-http')

// ── 3. VEXNAR artifacts ────────────────────────────────────────────────────
const patch = readFileSync(join(app, 'vexnar/cordis.patch.yml'), 'utf8')
for (const row of ['mcp-manager', 'ui-brand-official', 'deepseek-account', 'llm-deepseek-account']) {
  ok(`bundle patch targets ${row}`, patch.includes(`id: ${row}`))
}

const uiPkg = JSON.parse(readFileSync(join(app, 'vexnar/ui/package.json'), 'utf8'))
const inject = uiPkg.dsh?.client?.inject ?? []
for (const dep of ['@deepseek-ai/dsh-client-ui-tool', '@deepseek-ai/dsh-client-ui-sidebar']) {
  ok(`ui client injects ${dep}`, inject.includes(dep))
}

const accountPkg = JSON.parse(readFileSync(join(app, 'vexnar/account/package.json'), 'utf8'))
const accountInject = accountPkg.dsh?.client?.inject ?? []
ok('account client injects settings', accountInject.includes('@deepseek-ai/dsh-client-ui-settings'))

const accountHost = readFileSync(join(app, 'vexnar/account/lib/index.js'), 'utf8')
ok('account host configures pi-ai directly', accountHost.includes("ctx.settings.update('llm-pi-ai'"))
ok('account host does not call the Go gateway', !accountHost.includes('/api/desktop/llm'))

const accountBundle = join(app, 'vexnar/account/lib/client.js')
ok('account bundle built', existsSync(accountBundle), 'run `pnpm run account:build`')
if (existsSync(accountBundle)) {
  ok('account bundle uses loader factory', readFileSync(accountBundle, 'utf8').includes('window.__ModuleLoader__.load({ id: "@vexnar/dsh-account"'))
}

const bundle = join(app, 'vexnar/ui/lib/client.js')
ok('ui bundle built', existsSync(bundle), 'run `pnpm run ui:build`')
if (existsSync(bundle)) {
  const code = readFileSync(bundle, 'utf8')
  ok('ui bundle uses loader factory', code.includes('window.__ModuleLoader__.load({ id: "@vexnar/dsh-ui"'))
  ok('ui bundle keeps react external', code.includes('require("react")'))
}

// ── 4. 单一包管理器（pnpm）──────────────────────────────────────────────────
// app/ 只认 pnpm：一个根 workspace、一个根 lockfile，子包不许自带包管理器状态。
const SKIP_DIRS = new Set(['node_modules', 'dsh', '.dsh-home', '.git', '.idea', 'lib'])

function walk(rel = '') {
  const found = []
  for (const entry of readdirSync(join(app, rel), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...walk(rel === '' ? entry.name : `${rel}/${entry.name}`))
    } else {
      found.push(rel === '' ? entry.name : `${rel}/${entry.name}`)
    }
  }
  return found
}

const files = walk()
const foreignLocks = files.filter((f) => f.endsWith('package-lock.json') || f.endsWith('yarn.lock'))
ok('no npm/yarn lockfiles under app/', foreignLocks.length === 0, `found ${foreignLocks.join(', ')}`)

const pnpmLocks = files.filter((f) => f.endsWith('pnpm-lock.yaml'))
ok('exactly one pnpm lockfile (app/pnpm-lock.yaml)', pnpmLocks.length === 1 && pnpmLocks[0] === 'pnpm-lock.yaml', `found ${pnpmLocks.join(', ') || 'none'}`)

const nestedWorkspaces = files.filter((f) => f.endsWith('pnpm-workspace.yaml') && f !== 'pnpm-workspace.yaml')
ok('workspace defined only at app/pnpm-workspace.yaml', nestedWorkspaces.length === 0, `found ${nestedWorkspaces.join(', ')}`)

const rootPkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
ok('root package.json pins packageManager pnpm', String(rootPkg.packageManager ?? '').startsWith('pnpm@'), `packageManager=${rootPkg.packageManager ?? 'unset'}`)
ok('root ui:build uses pnpm', String(rootPkg.scripts?.['ui:build'] ?? '').startsWith('pnpm '), `ui:build=${rootPkg.scripts?.['ui:build'] ?? 'unset'}`)

// ── report ────────────────────────────────────────────────────────────────
for (const line of passes) console.log(`  ✓ ${line}`)
for (const line of failures) console.error(`  ✗ ${line}`)
console.log(`\nupstream: ${lock.tag} (${lock.commit.slice(0, 8)}) — ${passes.length} passed, ${failures.length} failed`)
process.exit(failures.length === 0 ? 0 : 1)
