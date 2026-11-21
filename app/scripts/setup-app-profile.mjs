// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { spawnSync } from 'node:child_process'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { appDir, profileName, runtimeBin, runtimeEnv, vexnarHome } from './vexnar-runtime.mjs'

const bin = runtimeBin()
const require = createRequire(await realpath(bin))
const runtimeModule = name => import(pathToFileURL(require.resolve(name)).href)
const [{ initProfile }, { PROFILE_TEMPLATES }] = await Promise.all([
  runtimeModule('@deepseek-ai/dsh-app-boot'),
  runtimeModule('@deepseek-ai/dsh-official-bundles')
])
const profile = join(vexnarHome(), 'profiles', profileName)
initProfile(profile, PROFILE_TEMPLATES.web.bundles)

const theme = process.env.VEXNAR_THEME === 'off' ? [] : ['dsh-claude-style@^0.21.6']
const bundle = '@vexnar/app-bundle'
const manifestPath = join(profile, 'package.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
manifest.name = 'vexnar-profile'
manifest.dsh.profile.bundles = [
  ...manifest.dsh.profile.bundles.filter(name => name !== bundle && name !== 'dsh-claude-style'),
  ...theme.map(() => 'dsh-claude-style'),
  bundle
]
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
const bundleRoot = process.env.VEXNAR_BUNDLES || process.env.VEXNAR_DSH_BUNDLES
const vxDir = bundleRoot ? resolve(bundleRoot, 'app', 'vexnar') : join(appDir, 'vexnar')
const addons = [vxDir, join(vxDir, 'ui'), join(vxDir, 'account')].map(dir => `file:${dir}`)
const installed = spawnSync('pnpm', ['add', '--force', ...addons, ...theme], {
  cwd: profile, env: runtimeEnv(), stdio: 'inherit'
})
if (installed.error) throw installed.error
if (installed.status !== 0) process.exit(installed.status ?? 1)
console.log('[vexnar] 隔离配置已就绪')
