// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 安装包首启：把内置的预装 profile 落到用户目录。
 *
 * 安装包里的 `Resources/app` 是只读的（/Applications、Program Files），而且升级
 * 会整个替换，所以 dsh 的 profile 必须住在 `~/.vexnar`。这里做两件事：
 *
 *   1. 首次启动把 `app/profile`（已装好 extras 全部插件与 node_modules）整份复制；
 *   2. 把清单里 `file:` 指向打包机的绝对路径，改写成安装目录里的插件源。
 *
 * node_modules 里是实体副本（pnpm 的 file: 依赖），复制后照样能用，不需要在用户
 * 机器上再跑一次 pnpm。升级安装包时由 `ensureProfile` 负责把插件产物换成新的。
 */

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { appDir, bundleSources, profileName, vexnarHome } from '../scripts/vexnar-runtime.ts'

/** profile 清单里的 `file:` 依赖改写成安装目录里的位置。幂等。 */
export function rewriteProfileManifest(profileDir: string): void {
  const path = join(profileDir, 'package.json')
  let manifest: { dependencies?: Record<string, string> }
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8')) as { dependencies?: Record<string, string> }
  } catch {
    return
  }
  if (manifest.dependencies === undefined) return
  let changed = false
  for (const [name, relative] of Object.entries(bundleSources)) {
    if (!(name in manifest.dependencies)) continue
    const next = `file:${join(appDir, relative)}`
    if (manifest.dependencies[name] !== next) {
      manifest.dependencies[name] = next
      changed = true
    }
  }
  if (changed) writeFileSync(path, `${JSON.stringify(manifest, undefined, 2)}\n`, { mode: 0o600 })
}

/**
 * 首次启动安装预装 profile；已存在时只修清单里的路径。
 * 不抛错：安装包坏了也要让 dsh 起来，用户至少能看到发生了什么。
 */
export function seedProfile(): void {
  const source = join(appDir, 'profile')
  if (!existsSync(join(source, 'package.json'))) {
    console.warn(`[vexnar] 安装包缺少预装 profile：${source}（插件不会出现）`)
    return
  }
  const target = join(vexnarHome(), 'profiles', profileName)
  if (existsSync(join(target, 'package.json'))) {
    rewriteProfileManifest(target)
    return
  }
  console.log(`[vexnar] 首次启动：安装预装插件到 ${target}`)
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
  cpSync(source, target, { recursive: true, dereference: true })
  rewriteProfileManifest(target)
}
