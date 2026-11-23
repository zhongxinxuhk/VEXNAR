// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'

export const appDir = resolve(import.meta.dirname, '..')
export const profileName = 'vexnar'
export const bundleFiles: Record<string, string[]> = {
  '@vexnar/app-bundle': ['cordis.patch.yml'],
  '@vexnar/dsh-ui': ['lib/index.js', 'lib/client.js'],
  '@vexnar/dsh-account': ['lib/index.js', 'lib/platform.js', 'lib/platform-account.js', 'lib/billing.js', 'lib/login-page.js', 'lib/login-client.js', 'lib/client.js', 'lib/core-embedded.js', 'lib/settings-embedded.js', 'lib/yak-history.js', 'lib/yak-history.proto', 'lib/yak-history.NOTICES.txt'],
  // egress 排在最后：它的产物是单文件 index.js，缺了就不该拿 profile 里的旧副本凑数。
  '@vexnar/dsh-egress': ['index.js']
}
const binPart = join('node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

export function runtimeBin(): string {
  const candidates = [process.env.VEXNAR_RUNTIME, appDir, join(appDir, 'dsh')]
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
  const proposed = resolve(process.env.VEXNAR_HOME || join(appDir, '.vexnar-home'))
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
  try {
    return readFileSync(join(appDir, '..', 'data', name), 'utf8').trim()
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
    VEXNAR_TRAFFIC_DIR: process.env.VEXNAR_TRAFFIC_DIR || join(appDir, '..', 'data', 'traffic'),
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
  const result = spawnSync('pnpm', ['install', missing ? '--frozen-lockfile' : '--force'], {
    cwd: profile, env: runtimeEnv(), stdio: 'inherit'
  })
  if (result.status !== 0) throw new Error('无法更新 VEXNAR 插件，请重新执行 pnpm run setup')
}
