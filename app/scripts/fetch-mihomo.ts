// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 下载并校验协议引擎（mihomo）到 app/.vexnar-bin/mihomo。
 *
 * - 版本与 sha256 固定在 scripts/mihomo.lock.json；
 * - 校验失败拒绝落盘；
 * - 只负责“把二进制放到开发机/打包环境”，应用运行时通过 VEXNAR_MIHOMO_BIN
 *   或默认路径发现它（见 app/vexnar-core/src/egress/engine.ts）。
 *
 *   tsx scripts/fetch-mihomo.ts            # 下载当前平台
 *   tsx scripts/fetch-mihomo.ts --force    # 强制重下
 *   tsx scripts/fetch-mihomo.ts --print-env
 */

import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, chmodSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(scriptDir, '..')
const binDir = join(appDir, '.vexnar-bin')
const lockPath = join(scriptDir, 'mihomo.lock.json')
const target = join(binDir, process.platform === 'win32' ? 'mihomo.exe' : 'mihomo')

const args = new Set(process.argv.slice(2))
const force = args.has('--force')
const printEnv = args.has('--print-env')

const platformKey = `${process.platform}-${process.arch}`
const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
const asset = lock.assets[platformKey]
if (!asset) {
  console.error(`[mihomo] 不支持的平台 ${platformKey}；可用：${Object.keys(lock.assets).join(', ')}`)
  process.exit(1)
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  hash.update(await readFile(path))
  return hash.digest('hex')
}

async function download(url: string, dest: string): Promise<void> {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(300_000) })
  if (!response.ok || !response.body) throw new Error(`下载失败 HTTP ${response.status}`)
  await pipeline(response.body, createWriteStream(dest))
}

function gunzip(src: string, dest: string): void {
  const result = spawnSync('gunzip', ['-c', src], { maxBuffer: 200 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`gunzip 失败：${result.stderr?.toString() ?? ''}`)
  writeFileSync(dest, result.stdout, { mode: 0o755 })
}

function unzip(src: string, dest: string): void {
  const dir = dirname(dest)
  const result = spawnSync('unzip', ['-o', src, '-d', dir], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`unzip 失败：${result.stderr}`)
  const produced = join(dir, 'mihomo.exe')
  if (!existsSync(produced)) throw new Error('zip 内没有 mihomo.exe')
  renameSync(produced, dest)
}

async function main(): Promise<void> {
  mkdirSync(binDir, { recursive: true })
  if (existsSync(target) && !force) {
    const meta = join(binDir, 'mihomo.version')
    const current = existsSync(meta) ? readFileSync(meta, 'utf8').trim() : 'unknown'
    if (current === lock.version) {
      console.log(`[mihomo] 已存在 ${target}（${lock.version}）`)
      if (printEnv) console.log(`export VEXNAR_MIHOMO_BIN="${target}"`)
      return
    }
  }

  const archive = join(binDir, asset.file)
  const url = `https://github.com/MetaCubeX/mihomo/releases/download/${lock.version}/${asset.file}`
  console.log(`[mihomo] 下载 ${url}`)
  await download(url, archive)
  const digest = await sha256(archive)
  if (digest !== asset.sha256) {
    rmSync(archive, { force: true })
    throw new Error(`sha256 校验失败：期望 ${asset.sha256}，实际 ${digest}`)
  }

  if (asset.archive === 'gz') gunzip(archive, target)
  else unzip(archive, target)
  chmodSync(target, 0o755)
  const probe = spawnSync(target, ['-v'], { encoding: 'utf8' })
  if (probe.status !== 0) throw new Error(`mihomo 无法运行：${probe.stderr || probe.stdout}`)
  rmSync(archive, { force: true })
  writeFileSync(join(binDir, 'mihomo.version'), `${lock.version}\n`)
  console.log(`[mihomo] 就绪：${target}`)
  console.log(probe.stdout.trim().split('\n')[0])
  if (printEnv) console.log(`export VEXNAR_MIHOMO_BIN="${target}"`)
}

main().catch((error: unknown) => {
  console.error(`[mihomo] ${(error as Error).message}`)
  process.exit(1)
})
