// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Update dsh-plugin-shop in the app profile.
 *
 *   node scripts/shop-update.mjs          install the latest version
 *   node scripts/shop-update.mjs --check  print the installed version
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dshHome, resolveRuntime } from './dsh-runtime.mjs'

const profile = 'web'
const bin = join(resolveRuntime(), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
if (!existsSync(bin)) throw new Error(`dsh CLI not found: ${bin}`)
const manifestPath = join(dshHome(), 'profiles', profile, 'package.json')
const installed = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).dependencies?.['dsh-plugin-shop'] ?? '' : ''

if (process.argv.includes('--check')) {
  console.log(`dsh-plugin-shop: installed=${installed || 'none'}`)
  process.exit(0)
}

const args = [bin, 'plugin', '--profile', profile, 'add', 'dsh-plugin-shop@latest']
const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, DSH_HOME: dshHome() } })
if (result.status !== 0) process.exit(result.status ?? 1)
spawnSync(process.execPath, [bin, 'plugin', '--profile', profile, 'list', '--depth', '0'], { stdio: 'inherit', env: { ...process.env, DSH_HOME: dshHome() } })
