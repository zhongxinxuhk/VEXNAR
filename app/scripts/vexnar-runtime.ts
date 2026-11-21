// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'

export const appDir = resolve(import.meta.dirname, '..')
export const profileName = 'vexnar'
export const bundleFiles: Record<string, string[]> = {
  '@vexnar/app-bundle': ['cordis.patch.yml'],
  '@vexnar/dsh-ui': ['lib/index.js', 'lib/client.js'],
  '@vexnar/dsh-account': ['lib/index.js', 'lib/platform.js', 'lib/platform-account.js', 'lib/login-page.js', 'lib/login-client.js', 'lib/client.js', 'lib/core-embedded.js']
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

/** 客户端子进程的环境：去掉上游的 DSH_/DEEPSEEK_ 前缀变量，再注入 VEXNAR 自己的那一套。 */
export function runtimeEnv(): Record<string, string> {
  const home = vexnarHome()
  const inherited: Record<string, string> = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (name.startsWith('DSH_') || name.startsWith('DEEPSEEK_')) continue
    inherited[name] = value
  }
  return {
    ...inherited,
    VEXNAR_HOME: home,
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
