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
  // 桌面壳不拦人：上游的 welcome 窗口认的是 DeepSeek 平台凭证（OAuth + PKCE 走
  // /auth_init → /dsh/authorize → /oauth/callback → /auth_exchange），VEXNAR 的
  // 登录在中转站，两边协议不通。门禁关掉，进入工作区后由 @vexnar/dsh-account
  // 的登录页接管——它支持访问令牌与账号密码两种登录。
  {
    file: 'apps/desktop/src/welcome-api.ts',
    from: '  return !authentication.loggedIn && !authentication.hasApiKey',
    to: '  // VEXNAR：桌面壳不做登录门禁，登录由 @vexnar/dsh-account 接管。\n  void authentication\n  return false'
  },
  // 读不到欢迎态不该让应用打不开。上游把 `readWelcomeState()` 当成 openInitialWindow
  // 的第一步，任何非 2xx（host 刚重启、cookie 过期、settings 描述超时）都会直接崩，
  // 用户只看到「应用无法启动或已意外停止」。门禁已经关掉了，这里的数据只用来定主题
  // 与语言，给一组安全默认值即可。
  // 第二处阻塞：客户端的 locale 服务通过 IPC 拿语言偏好，同样走 welcome backend 的
  // `settings/describe`。它一失败，`@deepseek-ai/dsh-client-locale` 就 failed，依赖
  // locale 的 sidebar / layout / 快捷键全部 pending，web boot 报
  // 「3 required entries did not activate」——窗口白了。读不到就跟系统。
  {
    file: 'apps/desktop/src/main.ts',
    from: '    return { languages: systemLanguages, preference: await welcomeBackend.readLocalePreference() }',
    to: [
      '    // VEXNAR：语言偏好读不到就跟随系统，不能让客户端的 locale 服务起不来。',
      '    const preference = await welcomeBackend.readLocalePreference().catch(() => null)',
      '    return { languages: systemLanguages, preference }'
    ].join('\n')
  },
  {
    file: 'apps/desktop/src/main.ts',
    from: '    const state = await readWelcomeState()',
    to: [
      '    // VEXNAR：欢迎态读不到就走默认值，不能因此拒绝启动。',
      '    const state = await readWelcomeState().catch(() => ({',
      '      loggedIn: false, hasApiKey: false, writable: true, localePreference: null,',
      "      themePreference: 'system' as const,",
      '    }))'
    ].join('\n')
  },
  { file: 'packages/util/home-paths/src/index.ts', from: "DSH_HOME_DIR_NAME = '.dsh'", to: "DSH_HOME_DIR_NAME = '.vexnar'" },
  { file: 'packages/experimental/liveshare/src/host/share-host.ts', from: "join(homedir(), '.dsh')", to: "join(homedir(), '.vexnar')" }
]

const changed = []

/**
 * 安装包自带的 VEXNAR 覆盖层目录，由 scripts/prepare-desktop-overlay.mjs 生成。
 *
 * 允许外部指定（`VEXNAR_OVERLAY`）：Windows runner 的 260 字符路径上限算不住
 * 覆盖层——profile 的 node_modules 里最长相对路径就有 232 字符，落在
 * `D:\a\VEXNAR\VEXNAR\app\` 下必然溢出，只能在短目录里解压。
 */
const OVERLAY = process.env.VEXNAR_OVERLAY
  ? resolve(process.env.VEXNAR_OVERLAY)
  : join(app, '.desktop-overlay')

/**
 * 按 `marker` 判断这一行是否已经写过：写过就把它换成新内容，没写过才插到锚点后面。
 *
 * 不能只看「文件里有没有这段文本」——覆盖层的绝对路径会随 checkout 位置变
 * （主工作区、worktree、CI 的 runner 路径各不相同），那样每换一个工作区就多插
 * 一条 `extraResources`，打包时会重复拷贝同一份五百兆的目录。
 */
function upsertLine(rel, anchor, line, marker) {
  const text = read(rel)
  if (text.includes(marker)) {
    const pattern = new RegExp(`^.*${marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}.*$`, 'mu')
    const next = text.replace(pattern, line.trimEnd())
    if (next !== text) {
      writeFileSync(join(dsh, rel), next, 'utf8')
      changed.push(rel)
    }
    return
  }
  if (!text.includes(anchor)) throw new Error(`brand: ${rel} 里找不到锚点 ${JSON.stringify(anchor)}，上游可能改过这一段`)
  writeFileSync(join(dsh, rel), text.replace(anchor, anchor + line), 'utf8')
  changed.push(rel)
}

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

/**
 * 把 VEXNAR 覆盖层塞进桌面安装包。
 *
 * 上游的 electron-builder 配置只打 `lib/main.js` 那几个文件和图标，装出来的
 * 就是一个换名换图标的 DeepSeek Harness。三处改动缺一不可：
 *
 *   1. `vexnar-bootstrap.js` 拷进桌面包根，`package.json` 的 `main` 指向它——
 *      它先把预装 profile 就位到 `~/.vexnar/profiles/desktop`，再加载真正的
 *      `lib/main.js`；
 *   2. `files` 带上这个文件（默认是按名字点着打的，不在名单里就不进 asar）；
 *   3. `extraResources` 带上覆盖层目录，安装后落在 `Resources/vexnar-overlay`。
 *
 * 覆盖层由 scripts/prepare-desktop-overlay.mjs 生成。这里不在缺失时跳过：
 * 照样写入 patch，让 electron-builder 打包时报错——比静默产出一个没有 VEXNAR
 * 的空壳好得多。
 */
function applyOverlay() {
  const bootstrap = join(app, 'desktop', 'vexnar-bootstrap.js')
  const bootstrapTo = 'apps/desktop/vexnar-bootstrap.js'
  copyFileSync(bootstrap, join(dsh, bootstrapTo))
  changed.push(bootstrapTo)

  const desktopManifest = 'apps/desktop/package.json'
  const manifest = JSON.parse(read(desktopManifest))
  if (manifest.main !== 'vexnar-bootstrap.js') {
    manifest.main = 'vexnar-bootstrap.js'
    writeFileSync(join(dsh, desktopManifest), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    changed.push(desktopManifest)
  }

  upsertLine('apps/desktop/scripts/electron-builder-config.mjs',
    "    files: [\n      'lib/main.js',\n",
    "      'vexnar-bootstrap.js',\n",
    "'vexnar-bootstrap.js'")

  upsertLine('apps/desktop/scripts/electron-builder-config.mjs',
    '    extraResources: [\n',
    `      { from: ${JSON.stringify(OVERLAY)}, to: 'vexnar-overlay' },\n`,
    "to: 'vexnar-overlay'")

  if (!existsSync(OVERLAY)) {
    console.warn(`[!] 覆盖层尚未生成：${OVERLAY}`)
    console.warn('    先执行 pnpm run overlay:prepare，否则安装包里没有 VEXNAR 的插件与配置')
  }
}

function applyBrand() {
  // ── 0. 发行版号 ──────────────────────────────────────────────────────────
  // `DSH_CLIENT_VERSION` 由上游从 dsh/package.json 的 version 推出，那是上游自己的
  // 构建号（0.2.2-rc.5）。用户在「关于与更新」里看到的必须是本仓库的发行版号，所以
  // 发版构建时把这份 version 改写成 release 版本（`VEXNAR_RELEASE_VERSION`，CI 由
  // scripts/release.mjs version 给出）；本地开发不设这个变量就保持上游原样。
  const releaseVersion = process.env.VEXNAR_RELEASE_VERSION?.trim()
  if (releaseVersion !== undefined && releaseVersion !== '') {
    // 上游 scripts/release/families.ts 的 DshFamily 把 `packages/*/*` 与 `apps/*`
    // 下所有非 private 包当成一个 release family，要求它们共享同一个版本（一个 tag
    // 命名整个 family）。所以只改几个入口包会在打包时被三段校验连续拒掉：
    //   - desktopRelease()：apps/desktop 与根 package.json 必须同版本；
    //   - core-package-set.ts 的 RELEASE_PACKAGES：`@deepseek-ai/dsh`（CLI）与
    //     `@deepseek-ai/dsh-desktop-host` 必须等于 Desktop 版本；
    //   - families.ts 的 verifyVersions()：整个 family 只允许一个版本。
    // 根包（`@deepseek-ai/dsh-root`）不在 family 里，但 desktopRelease() 要它，
    // 所以单独放进清单；private 包不参与 family，保持上游版本。
    // apps/desktop 与 apps/desktop-host 是 private 包，不进 family，但上游的
    // desktopRelease() / readDesktopRuntime() 仍要求它们等于发行版号，所以显式列入。
    const releaseManifests = new Set([
      'package.json',
      'apps/desktop/package.json',
      'apps/desktop-host/package.json',
    ])
    const familyManifests = git('ls-files', '--', 'apps/*/package.json', 'packages/*/*/package.json')
      .split('\n').filter(Boolean)
    for (const path of familyManifests) {
      if (JSON.parse(read(path)).private !== true) releaseManifests.add(path)
    }
    let bumped = 0
    for (const manifestPath of releaseManifests) {
      const manifest = JSON.parse(read(manifestPath))
      if (manifest.version === releaseVersion) continue
      manifest.version = releaseVersion
      writeFileSync(join(dsh, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
      changed.push(manifestPath)
      bumped += 1
    }
    console.log(`  ~ ${bumped} 个 manifest version → ${releaseVersion}（清单 ${releaseManifests.size} 个）`)
  }

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

  // ── 5. 覆盖层：安装包必须自带 VEXNAR 的插件与预装 profile ─────────────────
  applyOverlay()

  // ── 6. 记录 + 自证 ───────────────────────────────────────────────────────
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
