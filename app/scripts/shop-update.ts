// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Update dsh-plugin-shop in the app profile.
 *
 *   tsx scripts/shop-update.ts          install the latest version
 *   tsx scripts/shop-update.ts --check  print the installed version
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { profileName, runtimeBin, runtimeEnv, vexnarHome } from './vexnar-runtime.ts'

const bin = runtimeBin()
const manifestPath = join(vexnarHome(), 'profiles', profileName, 'package.json')
const installed = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).dependencies?.['dsh-plugin-shop'] ?? '' : ''

if (process.argv.includes('--check')) {
  console.log(`dsh-plugin-shop: installed=${installed || 'none'}`)
  process.exit(0)
}

const args = [bin, 'plugin', '--profile', profileName, 'add', 'dsh-plugin-shop@latest']
const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: runtimeEnv() })
if (result.status !== 0) process.exit(result.status ?? 1)
spawnSync(process.execPath, [bin, 'plugin', '--profile', profileName, 'list', '--depth', '0'], { stdio: 'inherit', env: runtimeEnv() })
