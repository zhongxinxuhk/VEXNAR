// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 应用内在线更新：下载安装包 → 校验 → 交给系统安装。
 *
 * 全部发生在宿主进程（dsh）里，渲染进程只轮询进度。放在宿主的原因有三个：
 *
 *   1. `dsh-app://app` 页面的跨域请求要过 CORS，GitHub 的下载域不保证给；
 *   2. 下载 300 MB 到页面内存里再写磁盘，桌面端会先被内存吃掉；
 *   3. 安装要落盘并起子进程，渲染进程没有这个权限。
 *
 * 安装方式按平台分开：
 *
 *   - macOS：把 dmg 挂到临时目录，`ditto` 覆盖到 `/Applications`，卸载镜像后重启新版本。
 *     没有签名，所以只做"用户点了才装"，不做静默升级。
 *   - Windows：起 NSIS 安装程序（`/S` 静默）；安装器自己处理正在运行的实例。
 *   - 其它平台：只在文件管理器里定位文件，由用户手动处理。
 *
 * 下载与校验都可以注入，测试不联网、不写用户目录。
 */

import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/** 下载状态机的阶段。 */
export type DownloadPhase = 'idle' | 'downloading' | 'verifying' | 'ready' | 'failed'

/** 设置页轮询的那一份状态。 */
export interface DownloadState {
  phase: DownloadPhase
  /** 正在下载/已就绪的资产名。 */
  asset: string | null
  /** 已写入的字节数。 */
  received: number
  /** 资产声明的总字节数；0 表示不知道。 */
  total: number
  /** 就绪后的本地绝对路径。 */
  file: string | null
  /** 失败原因（人话）。 */
  error: string | null
  /** SHA256 校验结果；没有 sums 可查时为 null。 */
  verified: boolean | null
}

/** 一个可下载的资产。 */
export interface InstallAsset {
  name: string
  url: string
  size: number
}

const idle: DownloadState = {
  phase: 'idle', asset: null, received: 0, total: 0, file: null, error: null, verified: null
}

let state: DownloadState = { ...idle }
let running: Promise<DownloadState> | null = null

/** 当前下载状态（副本，调用方不能改内部对象）。 */
export function downloadState(): DownloadState {
  return { ...state }
}

/** 更新包的落地目录：`~/.vexnar/updates`；测试与部署可以用参数替换。 */
export function updateDirectory(home: string = homedir()): string {
  return join(home, '.vexnar', 'updates')
}

/** 资产名只取文件名部分：GitHub 给的 name 不该带路径。 */
function safeName(name: string): string {
  const clean = basename(name).replace(/[^\w.+-]/gu, '_')
  if (clean === '' || clean === '.' || clean === '..') throw new Error('安装包文件名不可用')
  return clean
}

/** 从 `SHA256SUMS` 的文本里找某个文件的摘要（格式：`<hex>  <name>`）。 */
export function digestFromSums(sums: string, name: string): string | undefined {
  for (const line of sums.split('\n')) {
    const matched = /^([0-9a-f]{64})\s+\*?(.+)$/u.exec(line.trim())
    if (matched !== null && basename(matched[2] ?? '') === name) return matched[1]
  }
  return undefined
}

/** 计算文件的 SHA256（十六进制）。 */
async function fileDigest(path: string): Promise<string> {
  const { createReadStream } = await import('node:fs')
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

/**
 * 下载安装包。
 *
 * 同一资产重复调用只会返回正在跑的那一次；已经下载好的直接回 `ready`。
 *
 * @param asset - 要下载的资产。
 * @param options - 目录与 fetcher，测试可替换。
 * @returns 结束时的状态（成功或失败都在返回值里，不抛）。
 */
export async function downloadUpdate(
  asset: InstallAsset,
  options: { directory?: string; fetcher?: typeof fetch } = {}
): Promise<DownloadState> {
  const name = safeName(asset.name)
  if (state.asset === name && state.phase === 'ready' && state.file !== null && existsSync(state.file)) {
    return downloadState()
  }
  if (running !== null && state.asset === name) return await running
  const directory = options.directory ?? updateDirectory()
  mkdirSync(directory, { recursive: true })
  const file = join(directory, name)
  state = { phase: 'downloading', asset: name, received: 0, total: asset.size, file: null, error: null, verified: null }
  const fetcher = options.fetcher ?? fetch
  running = (async (): Promise<DownloadState> => {
    try {
      const response = await fetcher(asset.url, { redirect: 'follow' })
      if (!response.ok || response.body === null) throw new Error(`下载失败（HTTP ${response.status}）`)
      if (existsSync(file)) unlinkSync(file)
      let received = 0
      const body = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
      body.on('data', (chunk: Buffer) => {
        received += chunk.length
        state = { ...state, received }
      })
      await pipeline(body, createWriteStream(file))
      const written = statSync(file).size
      if (asset.size > 0 && written !== asset.size) {
        throw new Error(`下载不完整（${written} / ${asset.size} 字节），请重试`)
      }
      state = { ...state, phase: 'verifying', received: written, total: asset.size || written }
      const digest = await verifyAgainstSums(fetcher, asset.url, name, file)
      state = { ...state, phase: 'ready', file, verified: digest }
      return downloadState()
    } catch (error) {
      state = {
        ...state,
        phase: 'failed',
        file: null,
        error: error instanceof Error ? error.message : String(error)
      }
      return downloadState()
    } finally {
      running = null
    }
  })()
  return await running
}

/**
 * 用同一发行版里的 `SHA256SUMS` 校验下载结果。
 *
 * @returns `true` 校验通过，`false` 不一致，`null` 发行版没提供 sums（跳过校验）。
 */
async function verifyAgainstSums(
  fetcher: typeof fetch, assetUrl: string, name: string, file: string
): Promise<boolean | null> {
  const sumsUrl = new URL(assetUrl)
  sumsUrl.pathname = sumsUrl.pathname.replace(/[^/]+$/u, 'SHA256SUMS')
  let sums: string
  try {
    const response = await fetcher(sumsUrl.toString(), { redirect: 'follow' })
    if (!response.ok) return null
    sums = await response.text()
  } catch {
    return null
  }
  const expected = digestFromSums(sums, name)
  if (expected === undefined) return null
  const actual = await fileDigest(file)
  if (actual !== expected) {
    throw new Error('安装包校验失败（SHA256 不一致），已停止安装。请重试或到发行页手动下载。')
  }
  return true
}

/** 安装脚本：把 dmg 里的 .app 覆盖到 /Applications，然后重启。 */
const DARWIN_INSTALL = `set -e
mount=$(mktemp -d /tmp/vexnar-update.XXXXXX)
cleanup() { hdiutil detach "$mount" >/dev/null 2>&1 || true; rmdir "$mount" 2>/dev/null || true; }
trap cleanup EXIT
hdiutil attach -nobrowse -readonly "$1" -mountpoint "$mount" >/dev/null
bundle=$(find "$mount" -maxdepth 1 -name '*.app' -print -quit)
if [ -z "$bundle" ]; then echo "安装包里没有 .app" >&2; exit 1; fi
target="/Applications/$(basename "$bundle")"
rm -rf "$target"
/usr/bin/ditto "$bundle" "$target"
cleanup
trap - EXIT
open "$target"`

/**
 * 安装已经下载好的包。
 *
 * @param state - 当前下载状态（必须 `ready`）。
 * @param platform - 目标平台，测试可替换。
 * @param run - 启动子进程的实现，测试可替换。
 * @returns 给用户看的一句话。
 */
export function installUpdate(
  current: DownloadState = state,
  platform: NodeJS.Platform = process.platform,
  run: (command: string, args: string[]) => void = (command, args) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.unref()
  }
): { started: boolean; message: string } {
  if (current.phase !== 'ready' || current.file === null) {
    return { started: false, message: '还没有下载好的安装包。' }
  }
  const file = current.file
  if (!existsSync(file)) return { started: false, message: '安装包已不存在，请重新下载。' }
  if (platform === 'darwin' && file.endsWith('.dmg')) {
    run('/bin/sh', ['-c', DARWIN_INSTALL, 'vexnar-update', file])
    return { started: true, message: '正在安装，完成后会自动打开新版本。' }
  }
  if (platform === 'win32' && file.endsWith('.exe')) {
    run(file, ['/S'])
    return { started: true, message: '正在启动安装程序，安装完成后请重新打开 VEXNAR。' }
  }
  if (platform === 'darwin') {
    run('/usr/bin/open', [file])
  } else if (platform === 'win32') {
    run('explorer.exe', [`/select,${file}`])
  } else {
    run('xdg-open', [file])
  }
  return { started: true, message: '已打开安装包所在位置，请手动完成安装。' }
}
