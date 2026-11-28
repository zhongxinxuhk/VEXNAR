// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * VEXNAR 自研包清单的读取与校验。
 *
 * `vexnar-packages.json` 是「哪些包必须随 dsh 发布、各自的产物在哪」的唯一来源：
 *
 *   - scripts/check-built-artifacts.mjs   按 shipped[].files 校验产物
 *   - scripts/prepare-desktop-overlay.mjs 按它复制 overlay、写 profile 依赖
 *   - scripts/vexnar-runtime.ts           按它同步 profile 里的 bundle
 *   - scripts/setup-app-profile.ts        按它装 file: 依赖与 bundle 层
 *   - desktop/vexnar-bootstrap.js         读 overlay.json 的 fileDeps（由这里生成）
 *
 * 新增一个 VEXNAR 包只改 JSON；漏改会被 `pnpm run check:packages` 拦下：
 * 它扫 pnpm-workspace.yaml，任何 `@vexnar/*` 包既不在 `shipped` 也不在
 * `embedded` 里就报错，而不是等到用户装完才发现插件没进包。
 *
 * 只用 Node 内置模块：CI 的打包任务在 `pnpm install` 前后都要能跑。
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const manifestPath = join(appRoot, 'scripts', 'vexnar-packages.json')

/** 读清单并做结构校验；写坏了直接抛错，不要退化成「空清单 = 检查通过」。 */
export function readPackages() {
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (raw?.format !== 1) throw new Error(`${manifestPath}: 不支持的清单格式 ${raw?.format}`)
  if (!Array.isArray(raw.shipped) || raw.shipped.length === 0) {
    throw new Error(`${manifestPath}: shipped 为空，打包清单失效`)
  }
  const seen = new Set()
  for (const item of raw.shipped) {
    for (const field of ['name', 'dir', 'overlay']) {
      if (typeof item[field] !== 'string' || item[field] === '') {
        throw new Error(`${manifestPath}: 条目缺少 ${field}：${JSON.stringify(item)}`)
      }
    }
    if (item.name.startsWith('@vexnar/') === false) {
      throw new Error(`${manifestPath}: ${item.name} 不是 @vexnar/* 包，清单只描述自研包`)
    }
    if (seen.has(item.name)) throw new Error(`${manifestPath}: ${item.name} 重复声明`)
    seen.add(item.name)
    if (!Array.isArray(item.files) || item.files.length === 0) {
      throw new Error(`${manifestPath}: ${item.name} 没有声明运行时产物`)
    }
  }
  return raw
}

export const packages = readPackages()

/** name → 条目。 */
export const shippedByName = new Map(packages.shipped.map(item => [item.name, item]))

/** name → overlay 内的相对目录（bootstrap 落到 ~/.vexnar/bundles/<overlay>）。 */
export const overlayPaths = new Map(packages.shipped.map(item => [item.name, item.overlay]))

/** 作为 dsh bundle 进入 profile bundle 层的包名。 */
export const bundleNames = packages.shipped.filter(item => item.bundle === true).map(item => item.name)

/** 每条 shipped 的运行时产物绝对路径，缺文件时由调用方报错。 */
export function artifactPaths() {
  return packages.shipped.flatMap(item =>
    item.files.map(file => ({ name: item.name, file, path: join(appRoot, item.dir, file) }))
  )
}

/** 解析 pnpm-workspace.yaml 的 packages 段，返回每个包目录的绝对路径。 */
export function workspaceDirs(root = appRoot) {
  const yamlPath = join(root, 'pnpm-workspace.yaml')
  const text = readFileSync(yamlPath, 'utf8')
  const lines = text.split('\n')
  const start = lines.findIndex(line => /^packages:\s*$/.test(line))
  if (start === -1) throw new Error(`${yamlPath}: 找不到 packages 段`)
  const globs = []
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break
    const match = /^\s*-\s*([^\s#]+)\s*$/.exec(line)
    if (match) globs.push(match[1])
  }
  const dirs = []
  for (const glob of globs) {
    if (!glob.includes('*')) {
      dirs.push(join(root, glob))
      continue
    }
    const [head, tail] = glob.split('*')
    const parent = join(root, head.replace(/\/$/, ''))
    if (!existsSync(parent)) continue
    for (const entry of readdirSync(parent)) {
      const candidate = join(parent, entry, tail.replace(/^\//, ''))
      if (existsSync(candidate)) dirs.push(candidate)
    }
  }
  return dirs.filter(dir => existsSync(join(dir, 'package.json')) && statSync(dir).isDirectory())
}

/** 工作区里所有 @vexnar/* 包，带目录与 package.json。 */
export function workspacePackages(root = appRoot) {
  return workspaceDirs(root).flatMap(dir => {
    let pkg
    try {
      pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    } catch {
      return []
    }
    if (typeof pkg.name !== 'string' || !pkg.name.startsWith('@vexnar/')) return []
    return [{ dir, name: pkg.name, version: pkg.version, pkg }]
  })
}

/**
 * profile 是否包含全部随包发布的包。`--reuse-profile` 指向旧 profile 时最容易
 * 在这里出问题：目录还在、node_modules 也在，只是少了一个新包，打出来的安装包
 * 装的还是旧插件。缺任何一个都直接失败，不要“先打出来再说”。
 */
export function profileProblems(manifest) {
  const problems = []
  const deps = manifest?.dependencies ?? {}
  for (const item of packages.shipped) {
    if (!String(deps[item.name] ?? '').startsWith('file:')) problems.push(`缺少 file: 依赖 ${item.name}`)
  }
  const bundles = manifest?.dsh?.profile?.bundles ?? []
  for (const name of bundleNames) {
    if (!bundles.includes(name)) problems.push(`bundle 层缺少 ${name}`)
  }
  return problems
}

/**
 * 清单与工作区的差异。返回问题列表；空数组表示每个自研包都有归属。
 * `check:packages` 与 `check:artifacts` 都调用它，新增包漏登记会直接失败。
 */
export function classificationProblems(root = appRoot) {
  const problems = []
  const own = workspacePackages(root)
  const known = new Set([
    ...shippedByName.keys(),
    ...Object.keys(packages.embedded ?? {}),
    ...Object.keys(packages.excluded ?? {})
  ])
  for (const item of own) {
    if (!known.has(item.name)) {
      problems.push(
        `${item.name}（${item.dir.slice(root.length + 1)}）没有在 scripts/vexnar-packages.json 里登记：` +
        '加进 shipped（随安装包发布）、embedded（打进别的包）或 excluded（明确不发布并写明原因）'
      )
    }
  }
  for (const name of shippedByName.keys()) {
    if (!own.some(item => item.name === name)) {
      problems.push(`清单声明的 ${name} 不在 pnpm-workspace.yaml 的 packages 里`)
    }
  }
  return problems
}
