// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 准备安装包的资源目录 `app/desktop-resources/app`。
 *
 * 安装包里 `Resources/app` 的全部内容都在这里生成，四块：
 *
 *   vexnar/          VEXNAR bundle（cordis 补丁 + ui + account，含 core-embedded）
 *   vexnar-egress/   出口工具插件
 *   vexnar-tools/    领域工具插件（P1-1 骨架）
 *   profile/         装好 extras.json 全部插件的 profile（含 node_modules）
 *   runtime/         `@deepseek-ai/dsh` 及其依赖，提供 `dsh web` 命令
 *
 * 为什么自己装 runtime 而不是复用 vendored 的 app/dsh：那边是 245 MB 的开发工作树，
 * 带 electron、测试与全部 workspace 包；这里只要一个能跑 `dsh web` 的运行时
 * （约 850 MB 解压、压缩后三百兆以内），装在独立目录里，版本由 app/package.json
 * 的 devDependency 锁定。
 *
 * 用法（在 app/ 下）：
 *   node scripts/prepare-desktop-app.mjs
 *   node scripts/prepare-desktop-app.mjs --reuse-profile DIR   # 复用已装好的 profile
 *   node scripts/prepare-desktop-app.mjs --skip-runtime        # 运行时已装好时跳过
 */

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundleNames, packages } from './vexnar-packages.mjs'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)

function option(name, fallback) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} 需要一个参数`)
  return value
}

const out = resolve(option('--out', join(app, 'desktop-resources', 'app')))
const home = resolve(option('--home', join(app, 'desktop-resources', 'home')))
const reuseProfile = option('--reuse-profile', undefined)
const skipRuntime = args.includes('--skip-runtime')
const profileName = 'vexnar'

/** VEXNAR 插件源只带运行时需要的东西。 */
const COPY_IGNORE = new Set(['node_modules', '.git', 'client.cjs', '.plugin-manager', 'cordis.yml', 'lock', 'pnpm-debug.log'])
/** profile 复制时只丢运行时状态，`node_modules` 必须带上——它就是「装完即用」的本体。 */
const PROFILE_IGNORE = new Set(['.plugin-manager', 'cordis.yml', 'lock', 'pnpm-debug.log'])
/**
 * 依赖包里的测试与示例目录不进安装包：运行时用不到，却能把 profile 撑大几十兆
 * （光 zod 一个包，`src` 下的 tests 目录就有几兆的 TypeScript 源码）。
 */
const SKIP_SEGMENTS = new Set(['test', 'tests', '__tests__', 'example', 'examples', 'docs', '.github'])

const log = (message) => console.log(`[desktop] ${message}`)

/**
 * Windows 上 pnpm 是 `pnpm.cmd`，Node 直接 spawn 会 ENOENT——执行 .cmd 必须经过
 * shell。参数里没有空格与通配符，走 shell 是安全的。
 */
const PNPM = process.platform === 'win32'
  ? { file: 'pnpm.cmd', shell: true }
  : { file: 'pnpm', shell: false }

/** 复制目录，按名字过滤。 */
function copyTree(from, to, ignore = COPY_IGNORE) {
  cpSync(from, to, {
    recursive: true,
    // 软链一律解引用：安装包里不能出现指向构建机的一次性路径。
    dereference: true,
    filter: (source) => {
      // Windows 用反斜杠，两种分隔符都要认，否则过滤形同虚设。
      const cut = Math.max(source.lastIndexOf('/'), source.lastIndexOf(sep))
      if (ignore.has(source.slice(cut + 1))) return false
      if (ignore === COPY_IGNORE) return true
      // 只有 profile（含 node_modules）走这条：依赖包里的测试、示例、文档不带。
      return !source.split(/[/\\]/u).some(part => SKIP_SEGMENTS.has(part))
    }
  })
}

/**
 * `extras.json` 的 `spec` 是喂给 `pnpm add` 的完整说明符（`name@version` 或
 * `github:owner/repo#sha`），manifest 的 `dependencies` 要的是值那半边。
 */
function dependencySpec(item) {
  const prefix = `${item.name}@`
  return item.spec.startsWith(prefix) ? item.spec.slice(prefix.length) : item.spec
}

/**
 * 装一份 profile：VEXNAR 五个包 + `vexnar/extras.json` 里的全部插件。
 *
 * 不调 `vexnar.ts setup`：setup 走 `runtimeBin()` 解析 dsh 运行时，要求打包机把
 * 整个 app/ 依赖装齐。这里只需要 pnpm。
 *
 * bundle 层顺序照 `setup-app-profile.ts` 的 mergeBundleLayer：模板 → 预置 →
 * 皮肤 → VEXNAR bundle。
 */
function installProfile() {
  const extras = JSON.parse(readFileSync(join(app, 'vexnar', 'extras.json'), 'utf8')).bundles
  // `runtime: true` 由 dsh 自带，只补 bundle 层、不写依赖。漏掉它们用户会少
  // CUA、会话标题、思维链翻译、Codex 子代理、Forge、自动评审、插件市场七个入口。
  const installed = extras.filter(item => item.runtime !== true)
  const profileDir = join(home, 'profiles', profileName)
  mkdirSync(profileDir, { recursive: true, mode: 0o700 })

  const dependencies = {}
  for (const item of packages.shipped) {
    dependencies[item.name] = `file:${join(out, item.overlay)}`
  }
  dependencies['dsh-claude-style'] = '^0.21.6'
  for (const item of installed) dependencies[item.name] = dependencySpec(item)

  writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify({
    name: 'vexnar-profile',
    private: true,
    dependencies,
    dsh: {
      profile: {
        bundles: [
          // 上游 web 模板的两层。dsh 升级后若改名，`pnpm run plugins:check` 会报 unknown。
          '@deepseek-ai/dsh-base',
          '@deepseek-ai/dsh-web-app',
          ...extras.map(item => item.name),
          'dsh-claude-style',
          ...bundleNames
        ]
      }
    }
  }, undefined, 2)}\n`, { mode: 0o600 })
  // 必须有自己的 workspace 声明：否则 pnpm 会往上把 app/pnpm-workspace.yaml 当父级。
  writeFileSync(join(profileDir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n', { mode: 0o600 })
  writeFileSync(join(profileDir, 'cordis.patch.yml'), '# 用户覆盖层，默认值见 @vexnar/app-bundle 的 cordis.patch.yml\n[]\n', { mode: 0o600 })

  log(`安装预装插件：${installed.length} 个依赖 + ${extras.length - installed.length} 个运行时自带 bundle`)
  const install = spawnSync(PNPM.file, ['install'], { cwd: profileDir, stdio: 'inherit', shell: PNPM.shell, env: { ...process.env, CI: '1' } })
  if (install.error) throw install.error
  if (install.status !== 0) {
    console.error('[desktop] profile 安装失败；离线环境用 --reuse-profile 指向一份已装好的 profile')
    process.exit(install.status ?? 1)
  }
}

/** 装 dsh 运行时：一个只含 `@deepseek-ai/dsh` 及其依赖的独立目录。 */
function installRuntime() {
  const version = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).devDependencies?.['@deepseek-ai/dsh']
  if (version === undefined) throw new Error('app/package.json 没有锁定 @deepseek-ai/dsh 版本')
  const dir = join(out, 'runtime')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'vexnar-dsh-runtime', private: true, type: 'module' }, undefined, 2)}\n`)
  // pnpm 在 CI 下会拦未批准的构建脚本（koffi / node-pty 是原生模块，
  // dsh-subprocess-local 的 postinstall 还要生成 spawn helper）。不写这份白名单，
  // 安装直接以 ERR_PNPM_IGNORED_BUILDS 失败。
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), `packages:
  - .

allowBuilds:
  esbuild: true
  koffi: true
  node-pty: true
  '@deepseek-ai/dsh-subprocess-local': true
  '@google/genai': false
  protobufjs: false
`)
  log(`安装 dsh 运行时 @deepseek-ai/dsh@${version}`)
  const install = spawnSync(PNPM.file, ['add', `@deepseek-ai/dsh@${version}`], { cwd: dir, stdio: 'inherit', shell: PNPM.shell, env: { ...process.env, CI: '1' } })
  if (install.error) throw install.error
  if (install.status !== 0) {
    console.error('[desktop] 运行时安装失败')
    process.exit(install.status ?? 1)
  }
  const bin = join(dir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  if (!existsSync(bin)) {
    console.error(`[desktop] 运行时缺少入口：${bin}`)
    process.exit(1)
  }
}

// ── 0. 产物必须齐 ────────────────────────────────────────────────────────
log('校验构建产物')
const check = spawnSync(process.execPath, [join(app, 'scripts', 'check-built-artifacts.mjs')], { stdio: 'inherit' })
if (check.status !== 0) {
  console.error('[desktop] 产物不齐，先执行 pnpm run build')
  process.exit(1)
}

// ── 1. 清空 ──────────────────────────────────────────────────────────────
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

// ── 2. 插件源 ────────────────────────────────────────────────────────────
const copied = []
for (const item of [...packages.shipped].sort((left, right) => left.dir.length - right.dir.length)) {
  const from = join(app, item.dir)
  if (copied.some(root => from === root || from.startsWith(root + sep))) continue
  log(`复制 ${item.dir} -> ${item.overlay}`)
  copyTree(from, join(out, item.overlay))
  copied.push(from)
}

// ── 3. profile ───────────────────────────────────────────────────────────
if (reuseProfile === undefined && !existsSync(join(home, 'profiles', profileName, 'package.json'))) installProfile()
const profileSource = reuseProfile ? resolve(reuseProfile) : join(home, 'profiles', profileName)
if (!existsSync(join(profileSource, 'package.json'))) {
  console.error(`[desktop] ${profileSource} 不是有效的 profile（缺 package.json）`)
  process.exit(1)
}
log(`复制 profile：${profileSource}`)
copyTree(profileSource, join(out, 'profile'), PROFILE_IGNORE)
for (const name of ['pnpm-workspace.yaml', 'pnpm-lock.yaml', 'cordis.patch.yml']) {
  const path = join(profileSource, name)
  if (existsSync(path) && !existsSync(join(out, 'profile', name))) cpSync(path, join(out, 'profile', name))
}
// 临时 home 只是为了跑 pnpm，profile 已经在 out/profile，留着会跟着进安装包。
// 只删自己建的默认目录：`--home` 指到别处时那是别人的东西。
if (home.startsWith(join(app, 'desktop-resources') + sep)) rmSync(home, { recursive: true, force: true })

// ── 4. 运行时 ────────────────────────────────────────────────────────────
if (skipRuntime) {
  log('跳过运行时安装（--skip-runtime）')
} else {
  installRuntime()
}

const size = spawnSync('du', ['-sh', out], { encoding: 'utf8' }).stdout?.trim() ?? ''
log(`完成：${out} ${size}`)
