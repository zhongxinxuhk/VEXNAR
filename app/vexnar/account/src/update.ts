// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 「设置 → 关于与更新」的数据来源。
 *
 * 版本号来自打包时写进应用的那一份（`DSH_CLIENT_VERSION`：桌面端由
 * `desktopClientVersion()` 交给宿主进程），不在运行时猜。没打包（`dsh web` 开发
 * 模式）时没有这个值，明确报 `dev`，不冒充某个发行版。
 *
 * 在线更新只做「查 + 引导下载」：正式发行版在 GitHub Releases，安装包是未签名的
 * exe/dmg。自己下载并替换正在运行的程序既做不到也没必要——Windows 会锁住正在运行
 * 的 exe，macOS 的 .app 在运行中替换会破坏签名。这里给出最新版本、发行说明和对应
 * 平台的安装包直链，用户点一下由系统去下载。
 */

/** 发行版资产。 */
export interface ReleaseAsset {
  name: string
  url: string
  size: number
}

/** 一次检查的结果，字段与设置页一一对应。 */
export interface UpdateCheck {
  /** 当前运行的版本（打包时写入；开发模式为 `dev`）。 */
  current: string
  /** 最新发行版的版本号，没有发行版时为 null。 */
  latest: string | null
  /** 最新发行版的标签（`app-v0.0.9`）。 */
  tag: string | null
  publishedAt: string | null
  /** 发行说明正文（Markdown）。 */
  notes: string
  /** 当前平台对应的安装包。 */
  asset: ReleaseAsset | null
  /** Release 页面。 */
  page: string
  /** 是否有比当前更新的版本。 */
  available: boolean
  /** 检查失败时的人话。 */
  error?: string
}

/** 正式发行版所在仓库。 */
export const RELEASE_REPO = 'zhongxinxuhk/VEXNAR'

/** 检查结果的缓存时间：同一分钟里反复点「检查更新」不该反复打 GitHub。 */
const CACHE_MS = 5 * 60 * 1000

/**
 * 当前运行的版本。
 *
 * `DSH_CLIENT_VERSION` 是桌面端打包时写进应用的构建版本（宿主进程继承该环境
 * 变量）；`VEXNAR_APP_VERSION` 留给将来别的入口。两者都没有就说明这是源码直接
 * 跑的开发模式。
 *
 * @param env - 进程环境，测试可替换。
 * @returns 版本号，或 `dev`。
 */
export function currentVersion(env: NodeJS.ProcessEnv = process.env): string {
  for (const key of ['DSH_CLIENT_VERSION', 'VEXNAR_APP_VERSION']) {
    const value = env[key]?.trim()
    if (value !== undefined && value !== '') return value
  }
  return 'dev'
}

/**
 * 把 `0.0.9` / `app-v0.0.9` / `v0.0.9` 解析成数字段。
 *
 * @param value - 版本或发行标签。
 * @returns 三段数字；解析不出时 undefined。
 */
export function parseVersion(value: string): [number, number, number] | undefined {
  const matched = /(\d+)\.(\d+)\.(\d+)/.exec(value)
  if (matched === null) return undefined
  return [Number(matched[1]), Number(matched[2]), Number(matched[3])]
}

/**
 * 比较两个版本。
 *
 * @param left - 左侧版本。
 * @param right - 右侧版本。
 * @returns 左小右时为 -1，相等 0，左大右为 1；任一侧解析不出时按相等处理。
 */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === undefined || b === undefined) return 0
  for (let index = 0; index < 3; index += 1) {
    const left = a[index] ?? 0
    const right = b[index] ?? 0
    if (left !== right) return left < right ? -1 : 1
  }
  return 0
}

/**
 * 当前平台该用哪个安装包。
 *
 * 发行流程只产出 macOS arm64 的 dmg 与 Windows x64 的 exe；其它平台返回 undefined，
 * 设置页据此只给 Release 页面链接。
 *
 * @param names - 资产文件名。
 * @param platform - `process.platform`。
 * @param arch - `process.arch`。
 * @returns 资产文件名，或 undefined。
 */
export function platformAssetName(
  names: readonly string[], platform: NodeJS.Platform = process.platform, arch: string = process.arch
): string | undefined {
  const suffix = platform === 'win32' ? '-win-x64.exe'
    : platform === 'darwin' ? `-mac-${arch === 'arm64' ? 'arm64' : 'x64'}.dmg`
      : undefined
  if (suffix === undefined) return undefined
  return names.find(name => name.endsWith(suffix))
}

/** `fetch` 的最小面：测试里用假实现替换，不真的联网。 */
export type Fetcher = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

let cached: { at: number; value: UpdateCheck } | undefined

/**
 * 查 GitHub 上的最新正式发行版。
 *
 * @param options - 当前版本、平台与可注入的 fetch；默认读进程环境与全局 fetch。
 * @returns 检查结果；网络或解析失败时 `error` 给出人话，不抛。
 */
export async function checkForUpdate(options: {
  current?: string
  platform?: NodeJS.Platform
  arch?: string
  fetcher?: Fetcher
  now?: number
} = {}): Promise<UpdateCheck> {
  const current = options.current ?? currentVersion()
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const now = options.now ?? Date.now()
  if (cached !== undefined && now - cached.at < CACHE_MS && cached.value.current === current) {
    return cached.value
  }
  const empty: UpdateCheck = {
    current, latest: null, tag: null, publishedAt: null, notes: '',
    asset: null, page: `https://github.com/${RELEASE_REPO}/releases`, available: false
  }
  const fetcher: Fetcher = options.fetcher ?? (async (url, init) =>
    await fetch(url, init) as unknown as Awaited<ReturnType<Fetcher>>)
  let payload: unknown
  try {
    const response = await fetcher(`https://api.github.com/repos/${RELEASE_REPO}/releases/latest`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': `VEXNAR/${current}`
      }
    })
    if (!response.ok) {
      const value = { ...empty, error: response.status === 404 ? '还没有正式发行版' : `GitHub 返回 HTTP ${response.status}` }
      cached = { at: now, value }
      return value
    }
    payload = await response.json()
  } catch {
    const value = { ...empty, error: '连不上 GitHub，请检查网络后重试' }
    return value
  }
  const release = (payload ?? {}) as {
    tag_name?: unknown; published_at?: unknown; body?: unknown; html_url?: unknown
    assets?: Array<{ name?: unknown; browser_download_url?: unknown; size?: unknown }>
  }
  const tag = typeof release.tag_name === 'string' ? release.tag_name : null
  const parsed = tag === null ? undefined : parseVersion(tag)
  const latest = parsed === undefined ? null : parsed.join('.')
  const assets: ReleaseAsset[] = (release.assets ?? []).flatMap(asset => {
    const name = typeof asset.name === 'string' ? asset.name : undefined
    const url = typeof asset.browser_download_url === 'string' ? asset.browser_download_url : undefined
    if (name === undefined || url === undefined) return []
    return [{ name, url, size: typeof asset.size === 'number' ? asset.size : 0 }]
  })
  const wanted = platformAssetName(assets.map(asset => asset.name), platform, arch)
  const asset = assets.find(candidate => candidate.name === wanted) ?? null
  const value: UpdateCheck = {
    current,
    latest,
    tag,
    publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
    notes: typeof release.body === 'string' ? release.body : '',
    asset,
    page: typeof release.html_url === 'string' ? release.html_url : empty.page,
    available: latest !== null && compareVersions(latest, current) > 0
  }
  cached = { at: now, value }
  return value
}

/** 清掉缓存：测试用，也让设置页可以显式重查。 */
export function resetUpdateCache(): void {
  cached = undefined
}
