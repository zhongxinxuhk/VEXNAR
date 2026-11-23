// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 预置插件包（extras preset）。
 *
 * 插件商店装进来的 bundle 只写当前 profile 的 package.json；换一台机器重新
 * `pnpm run setup` 时它们不会自动回来。`app/vexnar/extras.json` 把选定的 bundle
 * 固化成一份清单：setup 读清单 → `pnpm add` 每个 spec → 把包名写进
 * `dsh.profile.bundles`（排在皮肤与 `@vexnar/app-bundle` 之前）。
 *
 * 只做两件事：校验清单、组装 bundle 层顺序。文件读写与 pnpm 调用留在
 * `setup-app-profile.ts`，这样这里可以在没有网络与 profile 的情况下单测。
 */

import { readFile } from 'node:fs/promises'

/** 一个预置 bundle：`name` 是包名（写进 bundle 层），`spec` 是 pnpm add 的参数。 */
export interface ExtraBundle {
  name: string
  spec?: string
  note?: string
  /**
   * 由 dsh 安装自带的 bundle（例如 `@deepseek-ai/dsh-cua-bundle`）：预设只需要把
   * 包名写进 bundle 层，`pnpm add` 与版本都跟着运行时走，升级 dsh 时不会漂移。
   */
  runtime?: boolean
}

/** `extras.json` 的形状。`preset` 只用于日志与文档。 */
export interface ExtrasManifest {
  preset?: string
  bundles: ExtraBundle[]
}

/** 读并校验清单；缺字段、重名、空数组都直接报错，避免静默装半套。 */
export async function readExtras(file: string): Promise<ExtraBundle[]> {
  const raw = JSON.parse(await readFile(file, 'utf8')) as ExtrasManifest
  if (!Array.isArray(raw.bundles)) throw new Error(`${file}: bundles 必须是数组`)
  const seen = new Set<string>()
  const out: ExtraBundle[] = []
  for (const [index, row] of raw.bundles.entries()) {
    const name = String(row?.name ?? '').trim()
    const spec = String(row?.spec ?? '').trim()
    const runtime = row?.runtime === true
    if (!name) throw new Error(`${file}: bundles[${index}] 缺 name`)
    if (runtime && spec !== '') throw new Error(`${file}: ${name} 是运行时自带的 bundle，不能写 spec`)
    if (!runtime && spec === '') throw new Error(`${file}: bundles[${index}] 缺 spec`)
    if (seen.has(name)) throw new Error(`${file}: bundle ${name} 重复`)
    seen.add(name)
    out.push({ name, ...(runtime ? { runtime: true as const } : { spec }), ...(row.note ? { note: String(row.note) } : {}) })
  }
  return out
}

/**
 * `pnpm add` 的参数列表。registry 包用 `name@version`，GitHub 包用
 * `github:owner/repo#sha`；运行时自带的条目没有 spec，只进 bundle 层。
 */
export function extrasSpecs(list: readonly ExtraBundle[]): string[] {
  return list.filter((item) => item.spec !== undefined).map((item) => item.spec as string)
}

/**
 * 组装 profile 的 bundle 层。
 *
 * 顺序即 dsh 的 patch 应用顺序：用户自己装的 bundle → 从旧 home 迁回的 →
 * 预置包 → 皮肤 → `@vexnar/app-bundle`。受管条目从原位置摘掉后按固定顺序追加，
 * 所以重跑 setup 只会稳定顺序，不会丢用户装的 bundle；重复项只留一个。
 */
export function mergeBundleLayer(input: {
  existing: readonly string[]
  carried?: readonly string[]
  extras?: readonly string[]
  theme?: readonly string[]
  bundle: string
}): string[] {
  const extras = input.extras ?? []
  const carried = input.carried ?? []
  const theme = input.theme ?? []
  const managed = new Set([...theme, ...extras, ...carried, input.bundle])
  const ordered = input.existing.filter((name) => !managed.has(name))
  return [...new Set([...ordered, ...carried, ...extras, ...theme, input.bundle])]
}
