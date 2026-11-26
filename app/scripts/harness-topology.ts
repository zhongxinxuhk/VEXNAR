#!/usr/bin/env tsx
// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Harness 拓扑 CLI：把「当前这套 VEXNAR 由什么组成」打在一张表里。
 *
 * 读取两处：
 *   1. profile 的 `package.json`（bundle 层与依赖）和随包发布的
 *      `cordis.patch.yml`（8 个 agent preset）；
 *   2. P0-1 的 `GET /api/_topology`，或进程没起时直接调用同一个
 *      `topology()` 读本地 store。
 *
 * 默认直接读 store：dsh web 把 core 嵌在同一个进程里，没有一个稳定的
 * 8790 监听可探测；显式给 `--url`（或 `VEXNAR_TOPOLOGY_URL`）时才走 HTTP，
 * 失败则回退到本地读，并把原因写进 stderr / JSON 的 `http_error`。
 *
 * 只读：不启动 Web 引擎、不开监听、不写 store。token 不打印。
 *
 * 用法：
 *   pnpm exec tsx scripts/harness-topology.ts
 *   pnpm exec tsx scripts/harness-topology.ts --json
 *   pnpm exec tsx scripts/harness-topology.ts --url http://127.0.0.1:8790
 */

import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { appDir, profileName, vexnarHome } from './vexnar-runtime.ts'
import { readExtras } from './vexnar-extras.ts'
import { scanProfile, type InstalledBundle, type ProfileManifest } from './plugin-inventory.ts'
import type { TopologySnapshot } from '../vexnar-core/src/topology.ts'

export interface PresetRow {
  /** patch 行 id，例如 `preset-vexnar-main`。 */
  patch_id: string
  /** preset 自己的 id，例如 `vexnar-main`。 */
  id: string
  name: string
}

export interface ProfileReport {
  dir: string
  exists: boolean
  name?: string
  /** `dsh.profile.bundles` 的原始顺序，就是实际参与组装的 bundle 层。 */
  layer: string[]
  bundles: InstalledBundle[]
  presets: PresetRow[]
  missing: string[]
  error?: string
}

export interface TopologyReport {
  generated_at: string
  source: 'http' | 'store'
  http_error?: string
  profile: ProfileReport
  topology: TopologySnapshot
}

interface Options {
  json: boolean
  help: boolean
  profileDir: string
  url?: string
  token?: string
  strictHttp: boolean
}

const USAGE = `用法：pnpm exec tsx scripts/harness-topology.ts [选项]

  --json              输出 JSON（可交给 jq）
  --profile <dir>     profile 目录，默认 <VEXNAR_HOME>/profiles/vexnar
  --url <base>        先读运行中的 core（例如 http://127.0.0.1:8790/api/_topology 的根）
  --token <token>     HTTP 读取用的 x-vexnar-token；默认取 VEXNAR_API_TOKEN
  --strict-http       HTTP 失败时直接报错，不回退本地 store
  -h, --help          显示本帮助
`

function takeValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag} 缺少参数`)
  return value
}

export function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    json: false,
    help: false,
    profileDir: join(vexnarHome(), 'profiles', profileName),
    url: process.env.VEXNAR_TOPOLOGY_URL,
    token: process.env.VEXNAR_API_TOKEN,
    strictHttp: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    switch (arg) {
      case '--json':
        options.json = true
        break
      case '--profile':
        options.profileDir = takeValue(argv, index, arg)
        index += 1
        break
      case '--url':
        options.url = takeValue(argv, index, arg)
        index += 1
        break
      case '--token':
        options.token = takeValue(argv, index, arg)
        index += 1
        break
      case '--strict-http':
        options.strictHttp = true
        break
      case '-h':
      case '--help':
        options.help = true
        break
      default:
        throw new Error(`未知参数：${arg}`)
    }
  }
  return options
}

/**
 * 从 bundle patch 里取 agent preset。
 *
 * patch 是手写 YAML，结构稳定（`- id: preset-*` → `config:` → `id` / `name`），
 * 这里只做只读扫描，不引入 YAML 依赖，也不把整个 patch 解释成对象。
 */
export function readPresets(file: string): PresetRow[] {
  if (!existsSync(file)) return []
  const rows: PresetRow[] = []
  let current: PresetRow | undefined
  let inConfig = false
  const flush = (): void => {
    if (current?.id && current.name) rows.push(current)
    current = undefined
    inConfig = false
  }
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/u)) {
    const start = /^\s*-\s+id:\s+(preset-[A-Za-z0-9_-]+)\s*$/u.exec(line)
    if (start) {
      flush()
      current = { patch_id: start[1]!, id: '', name: '' }
      continue
    }
    if (!current) continue
    if (/^\s*config:\s*$/u.test(line)) {
      inConfig = true
      continue
    }
    if (!inConfig) continue
    const id = /^\s+id:\s+([A-Za-z0-9_-]+)\s*$/u.exec(line)
    if (id && !current.id) {
      current.id = id[1]!
      continue
    }
    const name = /^\s+name:\s+(.+?)\s*$/u.exec(line)
    if (name && !current.name) current.name = name[1]!
  }
  flush()
  return rows
}

async function readProfile(dir: string): Promise<ProfileReport> {
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) {
    return {
      dir,
      exists: false,
      layer: [],
      bundles: [],
      presets: readPresets(join(appDir, 'vexnar', 'cordis.patch.yml')),
      missing: [],
      error: `找不到 profile 清单：${manifestPath}`
    }
  }
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ProfileManifest & { name?: string }
    const extras = await readExtras(join(appDir, 'vexnar', 'extras.json')).catch(() => [])
    const inventory = scanProfile({
      profile: manifest,
      extras,
      theme: ['dsh-claude-style']
    })
    const layer = manifest.dsh?.profile?.bundles ?? []
    return {
      dir,
      exists: true,
      ...(manifest.name ? { name: manifest.name } : {}),
      layer,
      bundles: inventory.bundles,
      presets: readPresets(join(appDir, 'vexnar', 'cordis.patch.yml')),
      missing: inventory.missing
    }
  } catch (error) {
    return {
      dir,
      exists: true,
      layer: [],
      bundles: [],
      presets: readPresets(join(appDir, 'vexnar', 'cordis.patch.yml')),
      missing: [],
      error: (error as Error).message
    }
  }
}

async function readHttpTopology(base: string, token: string | undefined, strict: boolean): Promise<{
  snapshot?: TopologySnapshot
  error?: string
}> {
  const url = new URL('/api/_topology', base)
  const headers: Record<string, string> = {}
  if (token) headers['x-vexnar-token'] = token
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) })
    const text = await response.text()
    if (!response.ok) throw new Error(`HTTP ${response.status}：${text.slice(0, 200)}`)
    return { snapshot: JSON.parse(text) as TopologySnapshot }
  } catch (error) {
    const message = (error as Error).message
    if (strict) throw new Error(`${url} 读取失败：${message}`)
    console.error(`[harness-topology] ${url} 不可用，改为直接读本地 store：${message}`)
    return { error: message }
  }
}

async function readTopology(options: Options): Promise<{ snapshot: TopologySnapshot; source: 'http' | 'store'; error?: string }> {
  let httpError: string | undefined
  if (options.url) {
    const http = await readHttpTopology(options.url, options.token, options.strictHttp)
    if (http.snapshot) return { snapshot: http.snapshot, source: 'http' }
    httpError = http.error
  }
  // topology() 的 storeRoot() 跟随 DSH_HOME；启动器把 DSH_HOME 指向 VEXNAR_HOME。
  const home = vexnarHome()
  if (!process.env.VEXNAR_HOME) process.env.VEXNAR_HOME = home
  if (!process.env.DSH_HOME) process.env.DSH_HOME = home
  const { topology } = await import('../vexnar-core/src/topology.ts')
  return {
    snapshot: await topology(),
    source: 'store',
    ...(httpError ? { error: `HTTP 不可用，已回退本地 store：${httpError}` } : {})
  }
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length)
}

function printReport(report: TopologyReport): void {
  const { profile, topology } = report
  const lines: string[] = []
  lines.push('VEXNAR harness topology')
  lines.push(`source     ${report.source}${report.http_error ? `（回退原因：${report.http_error}）` : ''}`)
  lines.push(`generated  ${report.generated_at}`)
  lines.push('')
  lines.push('runtime')
  lines.push(`  mode=${topology.runtime.mode} store=${topology.runtime.store} started=${topology.runtime.started} engine=${topology.runtime.engine}`)
  lines.push(`  triggers=${topology.runtime.triggers} schedules=${topology.runtime.schedules} task_concurrency=${topology.runtime.task_concurrency}`)
  lines.push(`  web_mcp=${topology.runtime.web_mcp} go_enabled=${topology.runtime.go.enabled} go_url=${topology.runtime.go.url_configured}`)
  lines.push('')
  lines.push('store')
  lines.push(`  root=${topology.store.root}`)
  lines.push(`  backend=${topology.store.backend} driver=${topology.store.driver} db=${topology.store.db_path ?? '-'}`)
  lines.push(`  postgres_configured=${topology.store.postgres_configured}`)
  lines.push('')
  lines.push('web')
  lines.push(`  mcp=${topology.web.mcp_url} mode=${topology.web.mode} adversarial=${topology.web.adversarial}`)
  lines.push('')
  lines.push('listeners')
  for (const listener of topology.listeners) {
    lines.push(`  ${pad(listener.name, 12)} ${pad(listener.kind, 9)} ${listener.address} (${listener.source})`)
  }
  lines.push('')
  lines.push(`profile  ${profile.dir}`)
  if (profile.error) lines.push(`  ! ${profile.error}`)
  if (profile.name) {
    lines.push(`  name=${profile.name} bundles=${profile.bundles.length} layer=${profile.layer.length} presets=${profile.presets.length}`)
  }
  if (profile.missing.length > 0) lines.push(`  ! preset 未覆盖的 bundle：${profile.missing.join(', ')}`)
  lines.push('  bundles:')
  for (const bundle of profile.bundles) {
    lines.push(`    ${pad(bundle.name, 58)} ${pad(bundle.version ?? '-', 24)} ${bundle.source}`)
  }
  lines.push('  presets:')
  for (const preset of profile.presets) {
    lines.push(`    ${pad(preset.id, 20)} ${preset.name}`)
  }
  lines.push('')
  lines.push(`agents  total=${topology.agents.total} enabled=${topology.agents.enabled} run_artifacts=${topology.agents.run_artifacts}`)
  lines.push(`  ${topology.agents.keys.join(', ') || '-'}`)
  lines.push('')
  lines.push(`tools   total=${topology.tools.total} enabled=${topology.tools.enabled} bound=${topology.tools.bound}`)
  lines.push(`  ${topology.tools.keys.join(', ') || '-'}`)
  lines.push('')
  lines.push(`mcp     total=${topology.mcp.total} enabled=${topology.mcp.enabled}`)
  for (const server of topology.mcp.servers) {
    lines.push(`  ${pad(server.name, 20)} ${pad(server.transport, 18)} enabled=${server.enabled} tools=${server.tools}`)
  }
  console.log(lines.join('\n'))
}

export async function main(argv: readonly string[]): Promise<number> {
  const options = parseArgs(argv)
  if (options.help) {
    console.log(USAGE)
    return 0
  }
  const [profile, topology] = await Promise.all([readProfile(options.profileDir), readTopology(options)])
  const report: TopologyReport = {
    generated_at: new Date().toISOString(),
    source: topology.source,
    ...(topology.error ? { http_error: topology.error } : {}),
    profile,
    topology: topology.snapshot
  }
  if (options.json) console.log(JSON.stringify(report, null, 2))
  else printReport(report)
  return 0
}

// `tsx scripts/harness-topology.ts`：直接执行时跑 CLI；被测试 import 时只导出函数。
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(`[harness-topology] ${(error as Error).message}`)
    return 1
  })
}
