// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 把 vendored 的 dsh 换成 VEXNAR 品牌。
 *
 * `app/dsh` 是上游只读工作树（见 app/upstream.lock.json 与 AGENTS.md），我们的改动
 * 不进仓库历史；但安装包是拿它打出来的，用户看到的必须是 VEXNAR Harness，而不是
 * 上游的 DeepSeek Harness。折中办法就是这里：**每次构建前就地改一遍**，改了哪些
 * 文件写进 `app/.vexnar-brand.json`，`check-upstream` 据此把「只差品牌补丁」判为
 * 正常，其它改动照样报错。
 *
 * 覆盖四层（都在用户能看见的地方）：
 *   1. 安装包身份：productName、产物前缀、macOS .app 目录名（打包脚本按名字找 bundle）；
 *   2. 桌面端文案：关于 / 退出 / 欢迎页 / 更新标题；
 *   3. 应用图标与 Windows 托盘图标：用本仓库 assets/app-icon-* 覆盖；
 *   4. CLI 与数据目录：`dsh` 命令 → `vexnar`，默认 home `~/.dsh` → `~/.vexnar`。
 *
 * 只改 apps/desktop/{src,scripts}、apps/cli/src 三处，加上两个明确点名的文件；
 * 上游的测试与文档不碰（我们也不跑它们），避免把上游断言改坏。
 *
 * 幂等，可以重复跑。用法：node app/scripts/brand-desktop.mjs
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PRODUCT_NAME = 'VEXNAR Harness'
const UPSTREAM_NAME = 'DeepSeek Harness'
/** 产物前缀：`vexnar-harness-<版本>-<平台>-<架构>.<ext>`。 */
const ARTIFACT_PREFIX = { from: '`deepseek-harness-', to: '`vexnar-harness-' }

const here = dirname(fileURLToPath(import.meta.url))
const app = join(here, '..')
const repo = join(app, '..')
const dsh = join(app, 'dsh')
/** 记录本脚本改过哪些文件，check-upstream 靠它区分「品牌补丁」与「有人手改了 vendored 代码」。 */
const MARKER = join(app, '.vexnar-brand.json')

/** 品牌字符串的搜索范围（相对 app/dsh）。测试与文档不在里面。 */
const SCOPE = ['apps/desktop/src', 'apps/desktop/scripts', 'apps/desktop/installer', 'apps/cli/src']
const SKIP = /\/tests?\/|\.spec\.|\.e2e\.|\.md$/u
const TEXT_FILE = /\.(?:ts|tsx|mjs|js|json)$/u

/** 单独点名、不在上面的目录里的文件。 */
const EXPLICIT_BRAND_FILES = [
  'packages/util/home-paths/src/index.ts',
  'packages/experimental/liveshare/src/host/share-host.ts'
]

/** 图标：本仓库生成好的应用图标覆盖上游资源。 */
const ICONS = [
  { from: join(repo, 'assets/app-icon-1024.png'), to: 'apps/desktop/resources/icon-macos.png' },
  { from: join(repo, 'assets/app-icon-1024.png'), to: 'apps/desktop/resources/icon-windows.png' },
  { from: join(repo, 'assets/app-icon-1024.png'), to: 'apps/desktop/resources/icon.png' },
  { from: join(repo, 'assets/app-icon.ico'), to: 'apps/desktop/resources/tray-windows.ico' }
]

/** 纯文本规则：`from` 不存在时必须已经有 `to`，否则上游真改行了，应当立刻失败。 */
const TEXT_RULES = [
  { file: 'apps/desktop/scripts/electron-builder-config.mjs', ...ARTIFACT_PREFIX },
  // macOS 的 --unsigned 走内置本地默认（不读打包配置），bundle id 在这里改。
  { file: 'apps/desktop/scripts/desktop-package-environment.mjs', from: "DSH_DESKTOP_APP_ID: 'com.deepseek.harness'", to: "DSH_DESKTOP_APP_ID: 'com.vexnar.harness'" },
  { file: 'packages/util/home-paths/src/index.ts', from: "DSH_HOME_DIR_NAME = '.dsh'", to: "DSH_HOME_DIR_NAME = '.vexnar'" },
  { file: 'packages/experimental/liveshare/src/host/share-host.ts', from: "join(homedir(), '.dsh')", to: "join(homedir(), '.vexnar')" }
]

const changed = []

function git(...args) {
  return execFileSync('git', ['-C', dsh, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
}

function read(rel) {
  const file = join(dsh, rel)
  if (!existsSync(file)) throw new Error(`brand: ${rel} 不存在，先跑 app/scripts/fetch-dsh.sh`)
  return readFileSync(file, 'utf8')
}

function replaceAll(rel, from, to) {
  const text = read(rel)
  if (text.includes(from)) {
    writeFileSync(join(dsh, rel), text.replaceAll(from, to), 'utf8')
    changed.push(rel)
    return
  }
  if (!text.includes(to)) throw new Error(`brand: ${rel} 里找不到 ${JSON.stringify(from)}，上游可能改过这一行`)
}

function applyBrand() {
  // ── 1. 品牌字符串（用户可见的文案与 .app 目录名） ──────────────────────────
  const files = git('ls-files', '--', ...SCOPE)
    .split('\n')
    .filter(Boolean)
    .filter(path => TEXT_FILE.test(path) && !SKIP.test(path))
  for (const path of files) {
    const text = readFileSync(join(dsh, path), 'utf8')
    if (!text.includes(UPSTREAM_NAME)) continue
    writeFileSync(join(dsh, path), text.replaceAll(UPSTREAM_NAME, PRODUCT_NAME), 'utf8')
    changed.push(path)
  }

  // ── 2. 点名规则 ──────────────────────────────────────────────────────────
  for (const { file, from, to } of TEXT_RULES) replaceAll(file, from, to)

  // ── 3. CLI 命令名：dsh → vexnar ───────────────────────────────────────────
  const cliManifest = 'apps/cli/package.json'
  const manifest = JSON.parse(read(cliManifest))
  if (manifest.bin?.dsh !== undefined) {
    manifest.bin = { ...manifest.bin, vexnar: manifest.bin.dsh }
    delete manifest.bin.dsh
    writeFileSync(join(dsh, cliManifest), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    changed.push(cliManifest)
  }

  // ── 4. 图标 ──────────────────────────────────────────────────────────────
  for (const { from, to } of ICONS) {
    const source = statSync(from)
    if (existsSync(join(dsh, to)) && statSync(join(dsh, to)).size === source.size) continue
    copyFileSync(from, join(dsh, to))
    changed.push(to)
  }

  // ── 5. 记录 + 自证 ───────────────────────────────────────────────────────
  // 标记按并集累计：同一个工作树重复跑，前面已经改过的文件不会被漏记。
  const previous = existsSync(MARKER) ? JSON.parse(readFileSync(MARKER, 'utf8')).files ?? [] : []
  const tracked = new Set([...previous, ...changed])
  writeFileSync(MARKER, `${JSON.stringify({
    product: PRODUCT_NAME,
    upstream: git('rev-parse', 'HEAD').trim(),
    files: [...tracked].sort()
  }, null, 2)}\n`, 'utf8')

  const leftovers = files.filter(path => readFileSync(join(dsh, path), 'utf8').includes(UPSTREAM_NAME))
  console.log(`✓ 品牌补丁 → ${PRODUCT_NAME}：本轮改 ${changed.length} 个文件，累计 ${tracked.size} 个`)
  for (const path of [...new Set(changed)]) console.log(`  ~ ${relative(app, join(dsh, path))}`)
  if (leftovers.length > 0) {
    console.error(`✗ 仍有文件写着 ${UPSTREAM_NAME}：\n  ${leftovers.join('\n  ')}`)
    process.exit(1)
  }
}

// 只在直接执行时打补丁：check-upstream 只读标记文件，不 import 本模块。
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) applyBrand()
