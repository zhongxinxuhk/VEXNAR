// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 已装插件与依赖的盘点。
 *
 * 安装流程有两条独立的真相：profile 里**实际装了什么**（package.json 依赖 +
 * bundle 层），和出厂预设里**承诺带什么**（`vexnar/extras.json` + 模板 + 皮肤）。
 * 两者一旦分叉，换一台机器重跑 setup 就会少装几个插件，而当前这台机器看起来
 * 一切正常——这正是最难发现的那类回归。
 *
 * 这里只读、只在 CLI 里打印，并把「装了但预设没带」当成失败（退出码 1），
 * 让 `pnpm run plugins:check` 能进 CI。
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { readExtras, type ExtraBundle } from './vexnar-extras.ts'

/** dsh 安装自带的模板 bundle：不需要在预设里重复声明。 */
export const TEMPLATE_BUNDLES: readonly string[] = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-headless',
  '@deepseek-ai/dsh-acp-app',
  '@deepseek-ai/dsh-sdk-app',
  '@deepseek-ai/dsh-sdk-minimal'
]

/** VEXNAR 自己的包：由 setup 用 file: 依赖装上，也不进 extras 清单。 */
export const OWN_BUNDLES: readonly string[] = ['@vexnar/app-bundle', '@vexnar/dsh-ui', '@vexnar/dsh-account', '@vexnar/dsh-egress']

export interface ProfileManifest {
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
}

export type BundleSource = 'template' | 'own' | 'extras' | 'theme' | 'runtime' | 'unknown'

export interface InstalledBundle {
  name: string
  version?: string
  source: BundleSource
  /** 在预设里有对应条目（含 runtime 条目）。 */
  preset: boolean
}

export interface Inventory {
  bundles: InstalledBundle[]
  /** 装进 profile 依赖、但预设没有带上的第三方包。 */
  missing: string[]
  /** 预设里有、但这台机器没装的包（不算失败，只提示）。 */
  absent: string[]
}

/** 依赖 spec 里的版本（`^1.2.3`、`file:`、`github:` 原样保留，用于报告）。 */
export function specVersion(spec: string | undefined): string | undefined {
  if (spec === undefined) return undefined
  if (spec.startsWith('file:') || spec.startsWith('link:') || spec.startsWith('workspace:')) return spec
  return spec
}

/**
 * 一份 profile + 预设 → 盘点结果。
 *
 * `runtime` 只看预设条目的 `runtime` 标记：这类包由 dsh 安装自带（例如
 * `@deepseek-ai/dsh-cua-bundle`），setup 只补 bundle 层条目；其余条目必须在
 * profile 依赖里能找到对应 spec。
 */
export function scanProfile(input: {
  profile: ProfileManifest
  extras: readonly ExtraBundle[]
  theme?: readonly string[]
}): Inventory {
  const deps = input.profile.dependencies ?? {}
  const bundles = input.profile.dsh?.profile?.bundles ?? []
  const theme = new Set(input.theme ?? [])
  const extraNames = new Set(input.extras.map((item) => item.name))
  const runtime = new Set(input.extras.filter((item) => item.runtime === true).map((item) => item.name))
  const rows: InstalledBundle[] = []
  const seen = new Set<string>()

  const push = (name: string): void => {
    if (seen.has(name) || name.startsWith('cordis:')) return
    seen.add(name)
    const source: BundleSource = TEMPLATE_BUNDLES.includes(name) ? 'template'
      : OWN_BUNDLES.includes(name) ? 'own'
        : theme.has(name) ? 'theme'
          : extraNames.has(name) ? (runtime.has(name) ? 'runtime' : 'extras')
            : 'unknown'
    rows.push({ name, version: specVersion(deps[name]), source, preset: source !== 'unknown' })
    if (source === 'unknown' && deps[name] !== undefined) rows[rows.length - 1]!.preset = false
  }

  for (const name of bundles) push(name)
  // 依赖里有、但 bundle 层没列的包：装了却没启用，同样是分叉。
  for (const name of Object.keys(deps)) push(name)

  const missing = rows
    .filter((row) => row.source === 'unknown')
    .map((row) => row.name)
    .sort()
  const installed = new Set(rows.map((row) => row.name))
  const absent = [...extraNames].filter((name) => !installed.has(name)).sort()
  return { bundles: rows.sort((a, b) => a.name.localeCompare(b.name)), missing, absent }
}

const pad = (value: string, width: number): string => value.length >= width ? value : value + ' '.repeat(width - value.length)

/** CLI：`tsx scripts/plugin-inventory.ts [--profile DIR] [--json]`。 */
export async function main(argv: readonly string[]): Promise<number> {
  const json = argv.includes('--json')
  const at = argv.indexOf('--profile')
  const profileDir = at >= 0 ? argv[at + 1] : join(process.env.VEXNAR_HOME ?? join(import.meta.dirname, '..', '.vexnar-home'), 'profiles', 'vexnar')
  const profile = JSON.parse(await readFile(join(String(profileDir), 'package.json'), 'utf8')) as ProfileManifest
  const extras = await readExtras(join(import.meta.dirname, '..', 'vexnar', 'extras.json'))
  const inventory = scanProfile({ profile, extras, theme: ['dsh-claude-style'] })
  if (json) {
    console.log(JSON.stringify({ profile: profileDir, ...inventory }, null, 2))
  } else {
    console.log(`profile: ${profileDir}`)
    console.log(`${pad('bundle', 56)}${pad('source', 10)}version`)
    for (const row of inventory.bundles) {
      console.log(`${pad(row.name, 56)}${pad(row.source, 10)}${row.version ?? '-'}`)
    }
    if (inventory.absent.length > 0) console.log(`未安装的预设条目：${inventory.absent.join(', ')}`)
    if (inventory.missing.length > 0) {
      console.log(`预设未覆盖：${inventory.missing.join(', ')}`)
      console.log('把这些包补进 app/vexnar/extras.json（运行时自带的标 "runtime": true）。')
    } else {
      console.log('预设覆盖：全部已装 bundle 都在 extras / 模板 / 皮肤里')
    }
  }
  return inventory.missing.length === 0 ? 0 : 1
}

// `tsx scripts/plugin-inventory.ts`：被直接执行时跑 CLI，被测试 import 时只导出函数。
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2))
}
