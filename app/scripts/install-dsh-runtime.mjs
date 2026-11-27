// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 装一份只含 `@deepseek-ai/dsh` 及其依赖的运行时目录。
 *
 * 版本取 `app/package.json` 的 devDependency，桌面安装包与容器镜像因此始终
 * 用同一版运行时。`allowBuilds` 是 pnpm 的构建白名单：koffi / node-pty 这些
 * 原生模块不写进去，安装会以 `ERR_PNPM_IGNORED_BUILDS` 直接失败。
 *
 * 用法（在 app/ 下）：node scripts/install-dsh-runtime.mjs [目标目录]
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(process.argv[2] ?? join(app, 'desktop-resources', 'app', 'runtime'))
const version = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).devDependencies?.['@deepseek-ai/dsh']
if (version === undefined) throw new Error('app/package.json 没有锁定 @deepseek-ai/dsh 版本')

mkdirSync(target, { recursive: true, mode: 0o700 })
writeFileSync(
  join(target, 'package.json'),
  `${JSON.stringify({ name: 'vexnar-dsh-runtime', private: true, type: 'module' }, undefined, 2)}\n`
)
writeFileSync(
  join(target, 'pnpm-workspace.yaml'),
  `packages:
  - .

allowBuilds:
  esbuild: true
  koffi: true
  node-pty: true
  '@deepseek-ai/dsh-subprocess-local': true
  '@google/genai': false
  protobufjs: false
`
)

/** Windows 上 pnpm 是 `pnpm.cmd`，Node 直接 spawn 会 ENOENT，必须经过 shell。 */
const pnpm = process.platform === 'win32' ? { file: 'pnpm.cmd', shell: true } : { file: 'pnpm', shell: false }

console.log(`[runtime] 安装 @deepseek-ai/dsh@${version} -> ${target}`)
const install = spawnSync(pnpm.file, ['add', `@deepseek-ai/dsh@${version}`], {
  cwd: target,
  stdio: 'inherit',
  shell: pnpm.shell,
  env: { ...process.env, CI: '1' }
})
if (install.error) throw install.error
process.exit(install.status ?? 1)
