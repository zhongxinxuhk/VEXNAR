// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'

/**
 * VEXNAR 的应用目录：插件源码、运行时依赖、预装 profile 都在它下面。
 *
 * 源码里跑就是 `app/`；安装包里由桌面主进程用 `VEXNAR_APP_DIR` 指到
 * `Contents/Resources/app`。这个变量必须在加载本模块**之前**设好——主进程
 * 用动态 import 就是为了它。
 */
export const appDir = process.env.VEXNAR_APP_DIR
  ? resolve(process.env.VEXNAR_APP_DIR)
  : resolve(import.meta.dirname, '..')

/** 是否跑在安装包里：决定数据目录与受管资源的位置。 */
export const packaged = Boolean(process.env.VEXNAR_APP_DIR)

export const profileName = 'vexnar'
export const bundleFiles: Record<string, string[]> = {
  '@vexnar/app-bundle': ['cordis.patch.yml'],
  '@vexnar/dsh-ui': ['lib/index.js', 'lib/client.js'],
  '@vexnar/dsh-account': ['lib/index.js', 'lib/platform.js', 'lib/platform-account.js', 'lib/billing.js', 'lib/login-page.js', 'lib/login-client.js', 'lib/client.js', 'lib/core-embedded.js', 'lib/settings-embedded.js', 'lib/yak-history.js', 'lib/yak-history.proto', 'lib/yak-history.NOTICES.txt'],
  // egress 排在最后：它的产物是单文件 index.js，缺了就不该拿 profile 里的旧副本凑数。
  '@vexnar/dsh-egress': ['index.js']
}
/**
 * 安装包里各 bundle 的源目录（相对 {@link appDir}）。profile 清单里的 `file:`
 * 依赖指向这里，`ensureProfile` 也按它把安装包里的产物同步进 profile。
 */
export const bundleSources: Record<string, string> = {
  '@vexnar/app-bundle': 'vexnar',
  '@vexnar/dsh-ui': 'vexnar/ui',
  '@vexnar/dsh-account': 'vexnar/account',
  '@vexnar/dsh-egress': 'vexnar-egress'
}

const binPart = join('node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

export function runtimeBin(): string {
  // `runtime` 是安装包里的布局（`Resources/app/runtime`），其余是源码工作区的几种。
  const candidates = [process.env.VEXNAR_RUNTIME, appDir, join(appDir, 'runtime'), join(appDir, 'dsh')]
    .filter((value): value is string => Boolean(value))
  for (const directory of candidates) {
    const bin = resolve(directory, binPart)
    if (existsSync(bin)) return bin
  }
  throw new Error('找不到 VEXNAR 的运行时依赖，请在 app/ 执行 pnpm install')
}

function canonical(target: string): string {
  if (existsSync(target)) return realpathSync(target)
  const parent = dirname(target)
  return parent === target ? target : resolve(canonical(parent), target.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)))
}

function contains(parent: string, child: string): boolean {
  const normalize = (value: string): string =>
    process.platform === 'win32' || process.platform === 'darwin' ? value.toLowerCase() : value
  const left = normalize(parent)
  const right = normalize(child)
  return right === left || right.startsWith(left + sep)
}

export function vexnarHome(): string {
  // 安装包里数据目录必须落在用户主目录：`Contents/Resources` 可能是只读的
  // （/Applications、Program Files），升级安装包还会整个替换。
  const fallback = packaged ? join(homedir(), '.vexnar') : join(appDir, '.vexnar-home')
  const proposed = resolve(process.env.VEXNAR_HOME || fallback)
  const home = canonical(proposed)
  const configHome = process.env.APPDATA || process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  const originalHomes = [
    join(homedir(), '.dsh'),
    join(homedir(), 'Library', 'Application Support', '@deepseek-ai', 'dsh-desktop'),
    join(homedir(), 'Library', 'Application Support', 'DeepSeek Harness'),
    join(configHome, '@deepseek-ai', 'dsh-desktop'),
    join(configHome, 'DeepSeek Harness'),
    process.env.DSH_HOME
  ].filter((value): value is string => Boolean(value)).map(candidate => canonical(resolve(candidate)))
  if (originalHomes.some(candidate => contains(candidate, home) || contains(home, candidate))) {
    throw new Error('VEXNAR_HOME 必须独立于原版客户端的数据目录')
  }
  return home
}

function readToken(name: string): string {
  // 源码工作区的令牌放在仓库 data/ 下；安装包里没有那个目录，改为数据目录。
  const base = packaged ? join(vexnarHome(), 'data') : join(appDir, '..', 'data')
  try {
    return readFileSync(join(base, name), 'utf8').trim()
  } catch {
    return ''
  }
}

export function craftBinary(): string {
  return process.env.CRAFT_ANYTHING_CLI || join(vexnarHome(), 'plugins-data', 'craft-anything', 'craft-anything-cli')
}

/**
 * 插件用的 Python：`@furongjun1999/dsh-memory` 的 md_cg 在模块顶层用了 PEP 604
 * （`str | None`），Python 3.9 会在 import 时直接抛 TypeError。macOS 自带的
 * `/usr/bin/python3` 就是 3.9，所以不能只依赖 PATH 里的 `python3`。
 *
 * 解析顺序：显式 `MDCG_PYTHON` → PATH 里的 python3.x → Homebrew/usr-local 的绝对路径。
 * 探测用 `-c` 检查 version_info，避免把 3.9 当成可用解释器。
 */
const PYTHON_CANDIDATES = [
  'python3', 'python3.14', 'python3.13', 'python3.12', 'python3.11', 'python3.10',
  '/opt/homebrew/bin/python3.14', '/opt/homebrew/bin/python3.13', '/opt/homebrew/bin/python3.12',
  '/usr/local/bin/python3.14', '/usr/local/bin/python3.13', '/usr/local/bin/python3.12'
]

let cachedPython: string | null | undefined

/** 测试用：清掉解释器探测缓存。 */
export function resetPythonCache(): void {
  cachedPython = undefined
}

/** 返回一个 ≥3.10 的 Python 可执行文件；找不到时返回 undefined（不阻断启动）。 */
export function modernPython(): string | undefined {
  if (cachedPython !== undefined) return cachedPython ?? undefined
  const explicit = process.env.MDCG_PYTHON?.trim()
  if (explicit) {
    cachedPython = explicit
    return explicit
  }
  for (const candidate of PYTHON_CANDIDATES) {
    if (candidate.startsWith('/') && !existsSync(candidate)) continue
    const probe = spawnSync(candidate, ['-c', 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'], {
      stdio: 'ignore', timeout: 3000
    })
    if (probe.status !== 0) continue
    if (candidate.startsWith('/')) {
      cachedPython = candidate
      return candidate
    }
    const which = spawnSync('sh', ['-c', `command -v ${candidate}`], { encoding: 'utf8' })
    const resolved = which.stdout?.trim()
    if (resolved) {
      cachedPython = resolved
      return resolved
    }
  }
  cachedPython = null
  return undefined
}

/**
 * 给子进程一个 `python3` 垫片：把选中的解释器链到 `<VEXNAR_HOME>/bin/python3`。
 * 这样不认 `MDCG_PYTHON` 的插件也能拿到 ≥3.10；垫片目录只加在 VEXNAR 子进程的
 * PATH 最前面，不改宿主与其它工具。
 */
function pythonShim(python: string): string | undefined {
  const dir = join(vexnarHome(), 'bin')
  try {
    mkdirSync(dir, { recursive: true })
    const link = join(dir, 'python3')
    // 解释器可能随 Homebrew 升级换路径；每次启动重建，避免垫片指向已删除的旧版本。
    rmSync(link, { force: true })
    symlinkSync(python, link)
    return dir
  } catch {
    return undefined
  }
}

/** 客户端子进程的环境：去掉上游的 DSH_/DEEPSEEK_ 前缀变量，再注入 VEXNAR 自己的那一套。 */
export function runtimeEnv(): Record<string, string> {
  const home = vexnarHome()
  const inherited: Record<string, string> = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (name.startsWith('DSH_') || name.startsWith('DEEPSEEK_')) continue
    inherited[name] = value
  }
  // Python 解释器：先修 dsh-memory 的 3.9 崩溃，再让所有子进程默认拿到 ≥3.10。
  const python = modernPython()
  const shim = python ? pythonShim(python) : undefined
  if (shim) inherited.PATH = [shim, inherited.PATH].filter(Boolean).join(':')
  return {
    ...inherited,
    ...(python ? { MDCG_PYTHON: process.env.MDCG_PYTHON?.trim() || python } : {}),
    VEXNAR_HOME: home,
    VEXNAR_TRAFFIC_DIR: process.env.VEXNAR_TRAFFIC_DIR
      || (packaged ? join(home, 'traffic') : join(appDir, '..', 'data', 'traffic')),
    VEXNAR_LOOPBACK_ADAPTER: 'vexnar-loopback',
    DSH_HOME: home,
    DSH_AGENTS_HOME: join(home, 'agents'),
    DSH_CLIENT_TITLE: 'VEXNAR',
    DSH_TELEMETRY_DISABLED: '1',
    VEXNAR_MCP_TOKEN: process.env.VEXNAR_MCP_TOKEN || readToken('mcp.token'),
    VEXNAR_DESKTOP_TOKEN: process.env.VEXNAR_DESKTOP_TOKEN || readToken('desktop.token'),
    CRAFT_ANYTHING_CLI: craftBinary()
  }
}

export function ensureProfile(): void {
  const profile = join(vexnarHome(), 'profiles', profileName)
  const manifestPath = join(profile, 'package.json')
  if (!existsSync(manifestPath)) throw new Error('请先执行 pnpm run setup 初始化 VEXNAR')
  const dependencies: Record<string, string> = JSON.parse(readFileSync(manifestPath, 'utf8')).dependencies ?? {}
  if (Object.keys(bundleFiles).some(name => !dependencies[name]?.startsWith('file:'))) {
    throw new Error('VEXNAR 插件清单不完整，请重新执行 pnpm run setup')
  }
  const modulePath = (name: string): string => join(profile, 'node_modules', name)
  const missing = Object.keys(dependencies).some(name => !existsSync(join(modulePath(name), 'package.json')))
  const stale = !missing && Object.entries(bundleFiles).some(([name, files]) => {
    const source = resolve(profile, dependencies[name].slice('file:'.length))
    return files.some((file: string) => {
      const original = join(source, file)
      const copy = join(modulePath(name), file)
      if (!existsSync(original)) throw new Error(`VEXNAR bundle 未生成：${name} / ${file}`)
      return !existsSync(copy) || !readFileSync(original).equals(readFileSync(copy))
    })
  })
  if (!missing && !stale) return
  if (packaged) {
    // 安装包里没有 pnpm，也不该要求用户装：直接拿安装目录的产物覆盖 profile 里的
    // 副本。升级安装包后第一次启动就走这条路，插件随之更新。
    for (const [name, files] of Object.entries(bundleFiles)) {
      const relative = bundleSources[name]
      if (relative === undefined) continue
      for (const file of files) {
        const from = join(appDir, relative, file)
        if (!existsSync(from)) continue
        const to = join(modulePath(name), file)
        if (existsSync(to) && readFileSync(to).equals(readFileSync(from))) continue
        mkdirSync(dirname(to), { recursive: true, mode: 0o700 })
        copyFileSync(from, to)
      }
    }
    return
  }
  // Windows 上是 pnpm.cmd，spawn 不带 shell 会 ENOENT。
  const windows = process.platform === 'win32'
  const result = spawnSync(windows ? 'pnpm.cmd' : 'pnpm', ['install', missing ? '--frozen-lockfile' : '--force'], {
    cwd: profile, env: runtimeEnv(), stdio: 'inherit', shell: windows
  })
  if (result.status !== 0) throw new Error('无法更新 VEXNAR 插件，请重新执行 pnpm run setup')
}
