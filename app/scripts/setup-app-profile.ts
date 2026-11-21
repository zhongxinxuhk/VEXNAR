// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Prepare the isolated VEXNAR dsh profile.
 *
 * The profile is written once, from the shipped web template, and then only
 * ever patched — never recreated — so bundles the user installs from the
 * Plugins page survive every `pnpm run setup`. When the launcher moves to a new
 * data directory, the bundles the previous home still lists are carried over
 * (see `profile-migration.ts`): without that step a new home makes the plugin
 * shop and Craft Anything look deleted while they sit untouched next door.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { planLegacyBundles, readLegacyManifests } from './profile-migration.ts'
import { appDir, profileName, runtimeBin, runtimeEnv, vexnarHome } from './vexnar-runtime.ts'

const bin = runtimeBin()
const require = createRequire(await realpath(bin))
const runtimeModule = (name: string): Promise<Record<string, any>> => import(pathToFileURL(require.resolve(name)).href)
const [{ initProfile }, { PROFILE_TEMPLATES }] = await Promise.all([
  runtimeModule('@deepseek-ai/dsh-app-boot'),
  runtimeModule('@deepseek-ai/dsh-official-bundles')
])
const profile = join(vexnarHome(), 'profiles', profileName)
const template: string[] = [...PROFILE_TEMPLATES.web.bundles]
initProfile(profile, template)

const theme = process.env.VEXNAR_THEME === 'off' ? [] : ['dsh-claude-style@^0.21.6']
const themeNames = ['dsh-claude-style']
const bundle = '@vexnar/app-bundle'
const manifestPath = join(profile, 'package.json')

interface Manifest {
  name?: string
  dependencies?: Record<string, string>
  dsh: { profile: { bundles: string[] } }
}

const readManifest = async (): Promise<Manifest> => JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest

const first = await readManifest()
first.name = 'vexnar-profile'
await writeFile(manifestPath, JSON.stringify(first, null, 2) + '\n')

const bundleRoot = process.env.VEXNAR_BUNDLES || process.env.VEXNAR_DSH_BUNDLES
const vxDir = bundleRoot ? resolve(bundleRoot, 'app', 'vexnar') : join(appDir, 'vexnar')
const addons = [vxDir, join(vxDir, 'ui'), join(vxDir, 'account'), join(appDir, 'vexnar-egress')].map(dir => `file:${dir}`)
const installed = spawnSync('pnpm', ['add', '--force', ...addons, ...theme], {
  cwd: profile, env: runtimeEnv(), stdio: 'inherit'
})
if (installed.error) throw installed.error
if (installed.status !== 0) process.exit(installed.status ?? 1)

// ── Legacy homes ────────────────────────────────────────────────────────────
// Bundles the previous data directory lists are reinstalled one by one, so a
// single incompatible package cannot fail the whole setup. VEXNAR_LEGACY_HOME
// adds a source; VEXNAR_MIGRATE_PROFILE=off skips the step.
const legacyHomes: string[] = [process.env.VEXNAR_LEGACY_HOME, join(appDir, '.dsh-home')]
  .filter((home): home is string => home !== undefined && home !== '' && existsSync(home))
const skip = (name: string): boolean => template.includes(name) || themeNames.includes(name) || name === bundle || name.startsWith('@vexnar/')
/** Whether the runtime itself ships a package, in which case only its bundle layer entry is missing. */
const provided = (name: string): boolean => {
  try {
    require.resolve(name)
    return true
  } catch {
    return false
  }
}
const plan = process.env.VEXNAR_MIGRATE_PROFILE === 'off'
  ? []
  : planLegacyBundles(readLegacyManifests(legacyHomes), {
    skip,
    provided,
    installed: [...((await readManifest()).dsh.profile.bundles ?? [])]
  })
const carried: string[] = []
for (const { name, version } of plan) {
  // A runtime-shipped bundle has no registry dependency of its own: listing it in the layer is the whole restore.
  if (version === undefined) {
    carried.push(name)
    console.log(`[vexnar] 旧配置里的 ${name} 由运行时自带，已恢复其插件层条目`)
    continue
  }
  const added = spawnSync(process.execPath, [bin, 'plugin', '--profile', profileName, 'add', `${name}@${version}`], {
    cwd: profile, env: runtimeEnv(), stdio: 'inherit'
  })
  if (added.status !== 0) console.warn(`[vexnar] 旧配置里的 ${name}@${version} 未装回，稍后可在插件面板重新安装`)
  else console.log(`[vexnar] 已从旧配置装回 ${name}@${version}`)
}

// ── Bundle layer ────────────────────────────────────────────────────────────
// One entry per bundle, VEXNAR's own rows last: re-running setup reorders but
// never drops a bundle the user installed.
const mine = new Set([...themeNames, bundle])
const last = await readManifest()
const ordered = (last.dsh.profile.bundles ?? []).filter(name => !mine.has(name))
last.dsh.profile.bundles = [...new Set([...ordered, ...carried, ...themeNames, bundle])]
await writeFile(manifestPath, JSON.stringify(last, null, 2) + '\n')
console.log('[vexnar] 隔离配置已就绪')
