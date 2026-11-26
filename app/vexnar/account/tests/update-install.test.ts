// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 应用内在线更新的下载与安装决策。
 *
 * 这里不联网、不写用户目录、不起子进程：只钉住三件容易出错的事——校验和怎么从
 * `SHA256SUMS` 里取、没下载完时安装要拒绝、以及各平台到底交给谁去装。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { digestFromSums, downloadState, installUpdate } from '../src/update-install.ts'

const SUMS = [
  'a'.repeat(64) + '  VEXNAR-0.0.12-mac-arm64.dmg',
  'b'.repeat(64) + ' *VEXNAR-0.0.12-win-x64.exe',
  ''
].join('\n')

test('digestFromSums 取得到带星号与不带星号的条目', () => {
  assert.equal(digestFromSums(SUMS, 'VEXNAR-0.0.12-mac-arm64.dmg'), 'a'.repeat(64))
  assert.equal(digestFromSums(SUMS, 'VEXNAR-0.0.12-win-x64.exe'), 'b'.repeat(64))
})

test('digestFromSums 对未知文件返回 undefined，而不是拿第一条凑数', () => {
  assert.equal(digestFromSums(SUMS, 'VEXNAR-0.0.13-mac-arm64.dmg'), undefined)
})

test('没有就绪的安装包时安装被拒绝', () => {
  const result = installUpdate(downloadState(), 'darwin', () => { throw new Error('不该起进程') })
  assert.equal(result.started, false)
  assert.match(result.message, /还没有下载好的安装包/u)
})

test('dmg 走 macOS 安装脚本，exe 走静默安装，其它平台只定位文件', () => {
  const calls: Array<[string, string[]]> = []
  const run = (command: string, args: string[]): void => { calls.push([command, args]) }
  const dir = mkdtempSync(join(tmpdir(), 'vexnar-install-'))
  const dmg = join(dir, 'a.dmg')
  const exe = join(dir, 'a.exe')
  const archive = join(dir, 'a.tar.gz')
  for (const path of [dmg, exe, archive]) writeFileSync(path, 'x')
  const ready = {
    phase: 'ready' as const, asset: 'a.dmg', received: 1, total: 1,
    file: dmg, error: null, verified: true
  }
  assert.equal(installUpdate(ready, 'darwin', run).started, true)
  assert.equal(calls[0]?.[0], '/bin/sh')
  assert.match(String(calls[0]?.[1]?.[1]), /ditto/u)

  calls.length = 0
  assert.equal(installUpdate({ ...ready, file: exe }, 'win32', run).started, true)
  assert.deepEqual(calls[0], [exe, ['/S']])

  calls.length = 0
  assert.equal(installUpdate({ ...ready, file: archive }, 'linux', run).started, true)
  assert.deepEqual(calls[0], ['xdg-open', [archive]])
})
