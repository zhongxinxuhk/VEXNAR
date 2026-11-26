// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 生成桌面安装包里的 VEXNAR 覆盖层（overlay）。
 *
 * 安装包原来只装上游 dsh 加一层换名换图标，用户装完打开的是 DeepSeek Harness：
 * VEXNAR 的卡片、账号页、拦截守卫、出口工具、以及 profile 里装过的第三方插件
 * 一个都不在。这里把这些东西打成一个可直接落地的目录，随安装包一起发：
 *
 *   <out>/vexnar/             VEXNAR bundle（cordis 补丁 + 两个客户端插件）
 *   <out>/vexnar-egress/      出口工具插件
 *   <out>/vexnar-tools/       领域工具插件（P1-1 骨架）
 *   <out>/profile/            预装好的 profile（含 node_modules，插件全在里面）
 *   <out>/overlay.json        来源清单：这些 file: 依赖原本指向哪里
 *
 * 首启由 `app/desktop/vexnar-bootstrap.js` 把 profile 复制到
 * `~/.vexnar/profiles/desktop`，并把 package.json 里指向构建机的绝对路径改写
 * 成安装后 `~/.vexnar/bundles/…`。所以这里是「在打包机上装一次，用户机器上
 * 不用再联网装一遍」。
 *
 * 用法（在 app/ 下）：
 *   node scripts/prepare-desktop-overlay.mjs                       # 现装一份 profile
 *   node scripts/prepare-desktop-overlay.mjs --reuse-profile DIR   # 复用已装好的
 *   node scripts/prepare-desktop-overlay.mjs --out DIR --home DIR
 */

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)

function option(name, fallback) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} 需要一个参数`)
  return value
}

const out = resolve(option('--out', join(app, '.desktop-overlay')))
const home = resolve(option('--home', join(out, 'home')))
const reuseProfile = option('--reuse-profile', undefined)
const profileName = 'vexnar'

/** VEXNAR 插件源只带运行时需要的东西：node_modules 与可复现的中间产物不进包。 */
const COPY_IGNORE = new Set(['node_modules', '.git', 'client.cjs', '.plugin-manager', 'cordis.yml', 'lock', 'pnpm-debug.log'])

/**
 * profile 复制时只丢运行时状态，`node_modules` 必须带上——那份依赖就是「安装即用」
 * 的全部内容，不带它用户首启就得联网重装四百兆的插件。
 */
const PROFILE_IGNORE = new Set(['.plugin-manager', 'cordis.yml', 'lock', 'pnpm-debug.log'])

/** 安装后 VEXNAR 各包在 `~/.vexnar/bundles/` 下的位置。与 overlay 内部结构一一对应。 */
const BUNDLE_PATHS = {
  '@vexnar/app-bundle': 'vexnar',
  '@vexnar/dsh-ui': 'vexnar/ui',
  '@vexnar/dsh-account': 'vexnar/account',
  '@vexnar/dsh-egress': 'vexnar-egress',
  '@vexnar/dsh-tools': 'vexnar-tools'
}

function log(message) {
  console.log(`[overlay] ${message}`)
}

/** 复制目录，按名字过滤——`cp -r` 在这种场合会把手边的 node_modules 一起拖进来。 */
function copyTree(from, to, ignore = COPY_IGNORE) {
  cpSync(from, to, {
    recursive: true,
    // 软链一律解引用：安装包里不能出现指向构建机的一次性路径。
    dereference: true,
    filter: (source) => !ignore.has(source.slice(source.lastIndexOf('/') + 1))
  })
}

// ── 0. 产物必须齐：包缺插件比包大更糟 ─────────────────────────────────────
log('校验构建产物')
const check = spawnSync(process.execPath, [join(app, 'scripts', 'check-built-artifacts.mjs')], { stdio: 'inherit' })
if (check.status !== 0) {
  console.error('[overlay] 产物不齐，先执行 pnpm run build')
  process.exit(1)
}

/**
 * `extras.json` 的 `spec` 是喂给 `pnpm add` 的完整说明符（`name@version` 或
 * `github:owner/repo#sha`），而 manifest 的 `dependencies` 需要的是「值」那半边。
 * 直接把整串当版本号写进去会变成 `pkg@pkg@1.2.3`，pnpm 报
 * ERR_PNPM_SPEC_NOT_SUPPORTED_BY_ANY_RESOLVER。
 */
function dependencySpec(item) {
  const prefix = `${item.name}@`
  return item.spec.startsWith(prefix) ? item.spec.slice(prefix.length) : item.spec
}

/**
 * 装一份 profile：VEXNAR 五个包 + `vexnar/extras.json` 里的全部插件。
 *
 * 这里不调 `vexnar.ts setup`：setup 走 `runtimeBin()` 解析 dsh 运行时，要求
 * 打包机把整个 app/ 依赖装齐（含 electron）。打包任务只需要 pnpm，直接写
 * manifest 再装，省掉那层依赖。
 *
 * bundle 层顺序照 `setup-app-profile.ts` 的 mergeBundleLayer：模板 → 预置 →
 * 皮肤 → VEXNAR bundle。全新机器上没有「用户自己装的」和「旧 home 迁回的」
 * 两层，它们本来就是空的。
 */
function installProfile() {
  const extras = JSON.parse(readFileSync(join(app, 'vexnar', 'extras.json'), 'utf8')).bundles
  // `runtime: true` 的条目由 dsh 安装自带，只补 bundle 层、不写依赖——与
  // setup-app-profile.ts 的规则一致。连 bundle 层一起丢掉的话，用户首启会少了
  // CUA、会话标题、思维链翻译、Codex 子代理、Forge、自动评审、插件市场这七个入口。
  const installed = extras.filter(item => item.runtime !== true)
  const profileDir = join(home, 'profiles', profileName)
  mkdirSync(profileDir, { recursive: true, mode: 0o700 })

  const dependencies = {
    '@vexnar/app-bundle': `file:${join(out, 'vexnar')}`,
    '@vexnar/dsh-ui': `file:${join(out, 'vexnar', 'ui')}`,
    '@vexnar/dsh-account': `file:${join(out, 'vexnar', 'account')}`,
    '@vexnar/dsh-egress': `file:${join(out, 'vexnar-egress')}`,
    '@vexnar/dsh-tools': `file:${join(out, 'vexnar-tools')}`,
    // 与 setup-app-profile.ts 的 theme 规格保持一致。
    'dsh-claude-style': '^0.21.6'
  }
  for (const item of installed) dependencies[item.name] = dependencySpec(item)

  const manifest = {
    name: 'vexnar-profile',
    private: true,
    dependencies,
    dsh: {
      profile: {
        bundles: [
          // 上游 web 模板的两层。名字来自 PROFILE_TEMPLATES.web；dsh 升级后若改名，
          // `pnpm run plugins:check` 会报 unknown，届时同步这里。
          '@deepseek-ai/dsh-base',
          '@deepseek-ai/dsh-web-app',
          ...extras.map(item => item.name),
          'dsh-claude-style',
          '@vexnar/app-bundle'
        ]
      }
    }
  }
  writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`, { mode: 0o600 })
  // 必须有自己的 workspace 声明：否则 pnpm 会往上把 app/pnpm-workspace.yaml 当成
  // 父级 workspace，把这份 profile 当成员一起处理。
  writeFileSync(join(profileDir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n', { mode: 0o600 })
  // 空 patch 层：VEXNAR 的配置全在 bundle 自己的 cordis.patch.yml 里，这一层留给
  // 用户改过的值（皮肤面板写这里）。
  writeFileSync(join(profileDir, 'cordis.patch.yml'), '# 用户覆盖层，默认值见 @vexnar/app-bundle 的 cordis.patch.yml\n[]\n', { mode: 0o600 })

  log(`安装预装插件：${installed.length} 个依赖 + ${extras.length - installed.length} 个运行时自带 bundle`)
  const install = spawnSync('pnpm', ['install'], { cwd: profileDir, stdio: 'inherit', env: { ...process.env, CI: '1' } })
  if (install.error) throw install.error
  if (install.status !== 0) {
    console.error('[overlay] profile 安装失败；离线环境用 --reuse-profile 指向一份已装好的 profile')
    process.exit(install.status ?? 1)
  }
}

// ── 1. 清空输出 ─────────────────────────────────────────────────────────
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

// ── 2. VEXNAR 插件源：安装后仍要能读到 cordis 补丁与 extras 清单 ──────────
for (const name of ['vexnar', 'vexnar-egress', 'vexnar-tools']) {
  log(`复制 ${name}`)
  copyTree(join(app, name), join(out, name))
}

// ── 3. 预装 profile ─────────────────────────────────────────────────────
const profileSource = reuseProfile ? resolve(reuseProfile) : join(home, 'profiles', profileName)

if (reuseProfile === undefined) installProfile()

if (!existsSync(join(profileSource, 'package.json'))) {
  console.error(`[overlay] ${profileSource} 不是有效的 profile（缺 package.json）`)
  process.exit(1)
}

log(`复制 profile：${profileSource}`)
copyTree(profileSource, join(out, 'profile'), PROFILE_IGNORE)

// 临时 home 只为了跑 pnpm，profile 已经复制到 out/profile，留着会跟着进安装包
// （默认就落在 out/ 里，几百兆的重复内容）。
if (home !== profileSource && home.startsWith(out + sep)) {
  rmSync(home, { recursive: true, force: true })
}

// profile 的 patch 层是用户自己的配置，跟着一起走；pnpm 的 lock 与 workspace
// 声明留着，用户之后自己在插件面板装插件时 pnpm 能就地增量（不必重装全部）。
for (const name of ['package.json', 'cordis.patch.yml', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']) {
  const path = join(profileSource, name)
  if (existsSync(path) && !existsSync(join(out, 'profile', name))) {
    cpSync(path, join(out, 'profile', name))
  }
}

// ── 4. 来源清单：bootstrap 靠它把 file: 绝对路径改写成安装后的位置 ─────────
// 路径不从打包机算：`--reuse-profile` 指向别的 checkout 时那样算出来的相对路径
// 毫无意义。VEXNAR 五个包在 overlay 里的位置是固定的，按名字给。
const manifest = JSON.parse(readFileSync(join(out, 'profile', 'package.json'), 'utf8'))
const fileDeps = Object.entries(manifest.dependencies ?? {})
  .filter(([, spec]) => typeof spec === 'string' && spec.startsWith('file:'))
  .flatMap(([name, spec]) => {
    const path = BUNDLE_PATHS[name]
    if (path === undefined) {
      console.warn(`[overlay] 忽略未知的本地依赖 ${name}（${spec}）：安装包里没有它的副本`)
      return []
    }
    return [{ name, path }]
  })

writeFileSync(join(out, 'overlay.json'), `${JSON.stringify({
  format: 1,
  generatedFrom: app,
  profile: profileName,
  fileDeps,
  bundles: manifest.dsh?.profile?.bundles ?? []
}, undefined, 2)}\n`)

const size = spawnSync('du', ['-sh', out], { encoding: 'utf8' }).stdout?.trim() ?? ''
log(`完成：${out} ${size}`)
for (const dep of fileDeps) log(`  ${dep.name} -> bundles/${dep.path}`)
