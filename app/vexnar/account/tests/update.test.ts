// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 设置页「关于与更新」的数据层。
 *
 * 这些断言覆盖的是版本号从哪来、怎么比、以及 GitHub 返回的形状怎么翻成页面上那
 * 几行字：一条都不写的话，出错时只能看到页面上一个空表格。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  checkForUpdate,
  compareVersions,
  currentVersion,
  parseVersion,
  platformAssetName,
  resetUpdateCache
} from '../src/update.ts'

const release = {
  tag_name: 'app-v0.0.9',
  published_at: '2026-11-26T13:06:46Z',
  body: '本次修复门禁 401。',
  html_url: 'https://github.com/zhongxinxuhk/VEXNAR/releases/tag/app-v0.0.9',
  assets: [
    { name: 'VEXNAR-0.0.9-win-x64.exe', browser_download_url: 'https://example.invalid/win.exe', size: 372565389 },
    { name: 'VEXNAR-0.0.9-mac-arm64.dmg', browser_download_url: 'https://example.invalid/mac.dmg', size: 322011500 },
    { name: 'SHA256SUMS', browser_download_url: 'https://example.invalid/sums', size: 287 }
  ]
}

/** 只回一份固定正文的 fetch，不联网。 */
const fetcher = (payload: unknown, status = 200) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload
})

test('版本号来自打包时写进应用的构建版本', () => {
  assert.equal(currentVersion({ DSH_CLIENT_VERSION: '0.0.9' }), '0.0.9')
  assert.equal(currentVersion({ VEXNAR_APP_VERSION: '0.0.10' }), '0.0.10')
  // 源码直接跑：没有构建版本，明确报 dev，不冒充发行版。
  assert.equal(currentVersion({}), 'dev')
})

test('版本解析与比较', () => {
  assert.deepEqual(parseVersion('app-v0.0.9'), [0, 0, 9])
  assert.deepEqual(parseVersion('v1.2.3'), [1, 2, 3])
  assert.equal(parseVersion('dev'), undefined)
  assert.equal(compareVersions('0.0.9', '0.0.10'), -1)
  assert.equal(compareVersions('0.0.9', '0.0.9'), 0)
  assert.equal(compareVersions('0.0.10', '0.0.9'), 1)
  // 解析不出的值按相等处理：宁可不提示更新，也不给一个假的"有新版本"。
  assert.equal(compareVersions('dev', '0.0.9'), 0)
})

test('按平台挑安装包', () => {
  const names = release.assets.map(asset => asset.name)
  assert.equal(platformAssetName(names, 'win32', 'x64'), 'VEXNAR-0.0.9-win-x64.exe')
  assert.equal(platformAssetName(names, 'darwin', 'arm64'), 'VEXNAR-0.0.9-mac-arm64.dmg')
  // 发行流程不产 macOS x64 / Linux 包：不硬塞一个不对的产物。
  assert.equal(platformAssetName(names, 'darwin', 'x64'), undefined)
  assert.equal(platformAssetName(names, 'linux', 'x64'), undefined)
})

test('查到更新的发行版', async () => {
  resetUpdateCache()
  const value = await checkForUpdate({
    current: '0.0.8', platform: 'win32', arch: 'x64', fetcher: fetcher(release), now: 1_000
  })
  assert.equal(value.latest, '0.0.9')
  assert.equal(value.tag, 'app-v0.0.9')
  assert.equal(value.available, true)
  assert.equal(value.asset?.name, 'VEXNAR-0.0.9-win-x64.exe')
  assert.equal(value.notes, '本次修复门禁 401。')
  assert.equal(value.error, undefined)
})

test('已经是最新时不给下载提示', async () => {
  resetUpdateCache()
  const value = await checkForUpdate({
    current: '0.0.9', platform: 'darwin', arch: 'arm64', fetcher: fetcher(release), now: 2_000
  })
  assert.equal(value.available, false)
  assert.equal(value.asset?.name, 'VEXNAR-0.0.9-mac-arm64.dmg')
})

test('网络失败翻成人话，不抛给页面', async () => {
  resetUpdateCache()
  const offline = await checkForUpdate({
    current: '0.0.9', fetcher: async () => { throw new Error('offline') }, now: 3_000
  })
  assert.equal(offline.error, '连不上 GitHub，请检查网络后重试')
  assert.equal(offline.available, false)
})

test('还没有发行版时说明白', async () => {
  resetUpdateCache()
  const missing = await checkForUpdate({ current: '0.0.9', fetcher: fetcher({}, 404), now: 4_000 })
  assert.equal(missing.error, '还没有正式发行版')
  assert.equal(missing.latest, null)
})
