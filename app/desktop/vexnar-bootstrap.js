// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * VEXNAR Harness 的启动前置：把安装包里的覆盖层落到 `~/.vexnar`，再交给 dsh。
 *
 * 安装包是拿 vendored 上游 dsh 打的，本身只有换名换图标；VEXNAR 的插件、
 * profile 里的第三方插件、以及这些插件依赖的 node_modules 都在
 * `resources/vexnar-overlay` 里。这一步把它们就位，然后才加载 `lib/main.js`。
 *
 * 只做三件事，全部幂等：
 *   1. 首次启动：整份预装 profile 复制到 `profiles/desktop`（dsh 桌面认这个目录名）；
 *   2. 每次升级安装包：把 `bundles/` 下的 VEXNAR 插件换成安装包里的新版本，
 *      并覆盖 profile 的 `node_modules/@vexnar/*` 副本——用户自己装的其他插件不动；
 *   3. 把 profile 清单里指向构建机的 `file:` 绝对路径改写成安装后的位置。
 *
 * 为什么必须改写：预装 profile 是在打包机上 `pnpm add file:…` 装的，清单里记着
 * `/home/runner/work/.../app/vexnar/ui` 这种路径。换台机器那些路径不存在，
 * 插件面板一动就会报错。node_modules 里是实体文件，不依赖这些路径，所以只改清单。
 *
 * 读不到覆盖层（源码里直接跑 dsh）时什么也不做，原样交给 main。
 */

import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const resources = process.env.VEXNAR_RESOURCES || process.resourcesPath
const overlayRoot = join(resources, 'vexnar-overlay')

/** VEXNAR 自己的包：安装包升级时要跟着换，用户装的第三方插件不在此列。 */
const OWN_PACKAGES = ['vexnar', 'vexnar-egress']

function log(message) {
  console.log(`[vexnar] ${message}`)
}

function warn(message) {
  console.warn(`[vexnar] ${message}`)
}

/**
 * Harness home。dsh 的品牌补丁把默认目录从 `.dsh` 改成了 `.vexnar`，
 * 但环境变量优先——用户显式指定时必须听用户的。
 */
function harnessHome() {
  return process.env.DSH_HOME || process.env.VEXNAR_HOME || join(homedir(), '.vexnar')
}

/**
 * 覆盖层指纹：只看 VEXNAR 自己的产物。安装包换了版本，指纹就变；用户自己的
 * 插件与配置不参与，所以不会被无谓重刷。
 */
function overlayDigest() {
  const hash = createHash('sha256')
  const walk = (path) => {
    if (!existsSync(path)) return
    const stats = statSync(path)
    if (stats.isDirectory()) {
      for (const name of readdirSync(path).sort()) walk(join(path, name))
      return
    }
    hash.update(path.slice(overlayRoot.length)).update(String(stats.size))
  }
  for (const name of OWN_PACKAGES) walk(join(overlayRoot, name))
  const manifest = join(overlayRoot, 'profile', 'package.json')
  if (existsSync(manifest)) hash.update(readFileSync(manifest, 'utf8'))
  return hash.digest('hex')
}

function install() {
  const overlay = JSON.parse(readFileSync(join(overlayRoot, 'overlay.json'), 'utf8'))
  const home = harnessHome()
  const profileDir = join(home, 'profiles', 'desktop')
  const bundlesDir = join(home, 'bundles')
  const stampFile = join(profileDir, '.vexnar-overlay')
  const digest = overlayDigest()

  const fresh = !existsSync(join(profileDir, 'package.json'))
  const upgraded = !fresh && (!existsSync(stampFile) || readFileSync(stampFile, 'utf8').trim() !== digest)
  if (!fresh && !upgraded) return

  if (fresh) {
    log(`首次启动：安装预装配置到 ${profileDir}`)
    mkdirSync(dirname(profileDir), { recursive: true, mode: 0o700 })
    cpSync(join(overlayRoot, 'profile'), profileDir, { recursive: true, dereference: true })
  } else {
    log('安装包已更新：同步 VEXNAR 插件')
  }

  // 插件源码放在 home 下而不是安装目录：安装目录可能只读（macOS 的 .app 在
  // /Applications 里，Windows 在 Program Files 里），而且升级安装包会被整目录替换。
  for (const name of OWN_PACKAGES) {
    const from = join(overlayRoot, name)
    if (!existsSync(from)) continue
    const to = join(bundlesDir, name)
    rmSync(to, { recursive: true, force: true })
    mkdirSync(dirname(to), { recursive: true, mode: 0o700 })
    cpSync(from, to, { recursive: true, dereference: true })
  }

  const manifestPath = join(profileDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.dependencies ??= {}
  for (const dep of overlay.fileDeps ?? []) {
    // `path` 是相对打包机 app/ 的路径（vexnar/ui 之类），落到 home 下同名位置。
    manifest.dependencies[dep.name] = `file:${join(bundlesDir, dep.path)}`
  }

  // 升级时 profile 里已有的 @vexnar 副本也要换成新的：dsh 从 profile 的
  // node_modules 加载插件，不会回头看 bundles/ 里的源码目录。
  if (upgraded) {
    for (const dep of overlay.fileDeps ?? []) {
      const source = join(bundlesDir, dep.path)
      const target = join(profileDir, 'node_modules', ...dep.name.split('/'))
      if (!existsSync(source) || !existsSync(target)) continue
      rmSync(target, { recursive: true, force: true })
      cpSync(source, target, { recursive: true, dereference: true })
    }
  }

  // bundles 层必须含 VEXNAR 的 bundle，否则补丁根本不加载。补齐但不重排：
  // 用户自己装的、预置的、皮肤的既有顺序原样保留。
  manifest.dsh ??= { profile: { bundles: [] } }
  manifest.dsh.profile ??= { bundles: [] }
  if (!manifest.dsh.profile.bundles.includes('@vexnar/app-bundle')) {
    manifest.dsh.profile.bundles.push('@vexnar/app-bundle')
  }

  writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`, { mode: 0o600 })
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(stampFile, `${digest}\n`)
}

try {
  if (existsSync(join(overlayRoot, 'overlay.json'))) install()
} catch (error) {
  // 覆盖层坏了不该让应用打不开：dsh 会退回它自己的 profile，用户至少能进设置页
  // 看到出了什么事。把原因留在 stderr 里。
  warn(`覆盖层就位失败：${error instanceof Error ? error.message : String(error)}`)
}

// 打包后的调试出口：只跑就位、不加载 main，方便验证「装完东西在哪」。
if (process.env.VEXNAR_OVERLAY_ONLY === '1') process.exit(0)

await import('./lib/main.js')
