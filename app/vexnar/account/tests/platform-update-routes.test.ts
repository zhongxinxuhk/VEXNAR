// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 应用内更新的路由级行为：假 ctx 装插件，假 fetch 提供 Release 与安装包。
 *
 * 这里钉住三件用户能感知的事：
 *   1. 没有当前平台资产时，`POST /update/download` 回 400，而不是启动一次空下载；
 *   2. 下载启动后，`GET /update/progress` 能读到进度，最终变成 `ready` 且校验通过；
 *   3. 没有就绪安装包时，`POST /update/install` 不会起安装进程。
 *
 * 下载文件落在临时 `HOME`，不碰真实用户目录；GitHub 与安装包都由假 fetch 返回。
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { installPlatform } from '../src/platform.ts'
import { resetUpdateCache } from '../src/update.ts'
import type { DownloadState } from '../src/update-install.ts'

interface Capture {
  status: number
  headers: Record<string, string>
  body: string
}

interface ReleaseAssetFixture {
  name: string
  browser_download_url: string
  size: number
}

const prefix = '/vexnar-api/platform'
const downloadPath = `${prefix}/update/download`
const progressPath = `${prefix}/update/progress`
const installPath = `${prefix}/update/install`
const releaseApi = 'https://api.github.com/repos/zhongxinxuhk/VEXNAR/releases/latest'
const payload = Buffer.from('VEXNAR update route test payload\n', 'utf8')
const digest = createHash('sha256').update(payload).digest('hex')

const assetName = process.platform === 'darwin'
  ? `VEXNAR-9.9.9-mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}.dmg`
  : process.platform === 'win32'
    ? 'VEXNAR-9.9.9-win-x64.exe'
    : 'VEXNAR-9.9.9-linux-x64.AppImage'
const assetUrl = `https://updates.test/${assetName}`
const sumsUrl = new URL('SHA256SUMS', assetUrl).toString()
const canDownload = process.platform === 'darwin' || process.platform === 'win32'

const routes = new Map<string, (req: unknown, res: unknown) => void | Promise<unknown>>()
const disposers: Array<() => void> = []
let home = ''
let originalHome: string | undefined
let originalVexnarHome: string | undefined
let originalFetch: typeof fetch
let releaseAssets: ReleaseAssetFixture[] = []

const fakeFetch = async (input: unknown): Promise<Response> => {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : (input as { url: string }).url
  if (url === releaseApi) {
    return Response.json({
      tag_name: 'app-v9.9.9',
      published_at: '2026-11-27T00:00:00Z',
      body: 'update route test',
      html_url: 'https://github.com/zhongxinxuhk/VEXNAR/releases/tag/app-v9.9.9',
      assets: releaseAssets
    })
  }
  if (url === assetUrl) {
    return new Response(payload, {
      status: 200,
      headers: {
        'content-length': String(payload.length),
        'content-type': 'application/octet-stream'
      }
    })
  }
  if (url === sumsUrl) {
    return new Response(`${digest}  ${assetName}\n`, {
      status: 200,
      headers: { 'content-type': 'text/plain' }
    })
  }
  throw new Error(`测试没有准备这个请求：${url}`)
}

const fakeReq = (method: string, url: string): Record<string, unknown> => ({
  method,
  url,
  headers: {},
  socket: { remoteAddress: '127.0.0.1' }
})

const fakeRes = (): { res: Record<string, unknown>; done: Promise<Capture> } => {
  const capture: Capture = { status: 0, headers: {}, body: '' }
  let settle: (value: Capture) => void = () => {}
  const done = new Promise<Capture>(resolve => { settle = resolve })
  const res = {
    writeHead(status: number, headers: Record<string, string> = {}) {
      capture.status = status
      Object.assign(capture.headers, headers)
      return res
    },
    end(body?: string) {
      capture.body = body ?? ''
      settle(capture)
      return res
    }
  }
  return { res, done }
}

const call = async (method: string, path: string): Promise<Capture> => {
  const handler = routes.get(path)
  assert.ok(handler, `应注册 ${path}`)
  const { res, done } = fakeRes()
  await handler(fakeReq(method, path), res)
  return await done
}

before(async () => {
  home = await mkdtemp(join(tmpdir(), 'vexnar-update-routes-'))
  originalHome = process.env.HOME
  originalVexnarHome = process.env.VEXNAR_HOME
  originalFetch = globalThis.fetch
  process.env.HOME = home
  process.env.VEXNAR_HOME = home
  globalThis.fetch = fakeFetch as typeof fetch

  const ctx = {
    credentials: {
      async set() {},
      async unset() {}
    },
    settings: {
      async replace() {}
    },
    effect(body: () => (() => void) | void) {
      const disposer = body()
      if (typeof disposer === 'function') disposers.push(disposer)
    },
    connection: {
      admit() { return { peer: { dispose: async () => {} } } },
      requestRejection() { return undefined },
      createPeer() { return { dispose: async () => {} } },
      fetch: { register() { return async () => {} } }
    },
    agentDefaultModel: {
      currentSelection: () => ({ provider: 'vexnar', model: 'deepsec-flash' }),
      async saveSelection() {}
    },
    typertGateway: { async invoke() { return {} } },
    webServer: {
      register(route: { path: string; handler: (req: unknown, res: unknown) => void | Promise<unknown> }) {
        routes.set(route.path, route.handler)
        return () => {}
      },
      tapIndex() {
        return () => {}
      }
    }
  }

  installPlatform(ctx as never)
})

after(async () => {
  for (const dispose of disposers.reverse()) dispose()
  globalThis.fetch = originalFetch
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  if (originalVexnarHome === undefined) delete process.env.VEXNAR_HOME
  else process.env.VEXNAR_HOME = originalVexnarHome
  resetUpdateCache()
  if (home !== '') await rm(home, { recursive: true, force: true })
})

test('三条更新路由都注册在平台前缀下', () => {
  for (const path of [downloadPath, progressPath, installPath]) {
    assert.ok(routes.has(path), `缺少 ${path}`)
  }
})

test('没有就绪安装包时 /update/install 不启动安装', async () => {
  const capture = await call('POST', installPath)
  assert.equal(capture.status, 200)
  const body = JSON.parse(capture.body) as { started: boolean; message: string }
  assert.equal(body.started, false)
  assert.match(body.message, /还没有下载好的安装包/u)
})

test('下载前 /update/progress 可读，状态为 idle', async () => {
  const capture = await call('GET', progressPath)
  assert.equal(capture.status, 200)
  const body = JSON.parse(capture.body) as DownloadState
  assert.equal(body.phase, 'idle')
  assert.equal(body.file, null)
  assert.equal(body.received, 0)
})

test('没有当前平台资产时 /update/download 返回 400', async () => {
  releaseAssets = []
  resetUpdateCache()
  const capture = await call('POST', downloadPath)
  assert.equal(capture.status, 400)
  const body = JSON.parse(capture.body) as { error: string }
  assert.match(body.error, /当前平台没有可下载的安装包/u)

  // 400 之外还要确认没有偷偷启动下载：进度仍是 idle，文件为空。
  const progress = await call('GET', progressPath)
  const state = JSON.parse(progress.body) as DownloadState
  assert.equal(state.phase, 'idle')
  assert.equal(state.file, null)
})

test('下载启动后 /update/progress 能读到进度，最终 ready 且校验通过', {
  skip: canDownload ? false : '当前平台没有可用的官方安装包'
}, async () => {
  releaseAssets = [{ name: assetName, browser_download_url: assetUrl, size: payload.length }]
  resetUpdateCache()

  const started = await call('POST', downloadPath)
  assert.equal(started.status, 200)
  let state = JSON.parse(started.body) as DownloadState
  assert.equal(state.asset, assetName)
  assert.equal(state.total, payload.length)
  assert.ok(state.phase === 'downloading' || state.phase === 'ready')

  for (let attempt = 0; attempt < 80 && state.phase !== 'ready' && state.phase !== 'failed'; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 25))
    const progress = await call('GET', progressPath)
    assert.equal(progress.status, 200)
    state = JSON.parse(progress.body) as DownloadState
  }

  assert.equal(state.phase, 'ready')
  assert.equal(state.verified, true)
  assert.equal(state.received, payload.length)
  assert.equal(state.total, payload.length)
  assert.ok(state.file, 'ready 状态应带本地路径')
  assert.ok(state.file.startsWith(home), `安装包应落在临时 HOME：${state.file}`)
  assert.ok(existsSync(state.file))
  assert.deepEqual(await readFile(state.file), payload)
})