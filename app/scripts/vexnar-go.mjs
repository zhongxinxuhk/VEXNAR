// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 由 app/ 自己编译、启动、回收 Go 后端。
 *
 * 以前 Go 是"你自己另开一个终端跑 go run"的外部依赖：客户端连的是 8787 上碰巧
 * 在跑的那个二进制，于是出现过登录页拿到旧构建的纯文本 404、全站跟着报错这种事。
 * 现在版本由 app 决定：
 *
 *   1. 用 Go 源码内容算一个 stamp（git HEAD + 未提交的 .go 改动），构建到
 *      `app/.vexnar-bin/vexnar-<stamp>`，并以 `-X main.version=go-<stamp>` 注入；
 *   2. 启动时先探 8787：version 与 stamp 一致就复用（避免第二个写库进程），
 *      是别人的旧构建就报错并给出 PID，绝不悄悄连上一个对不上的后端；
 *   3. 自己起的进程随客户端退出一起回收，data/ 与 jwt.key 仍指回仓库根，
 *      不搬家、不产生第二份 SQLite。
 *
 * 逃生口：`VEXNAR_GO=off` 不启动（用外部 Go），`VEXNAR_GO_URL` 指定外部地址，
 * `VEXNAR_GO_BIN` 直接指定现成二进制（打包环境没有 Go 工具链时用）。
 */

import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { appDir, runtimeEnv } from './vexnar-runtime.mjs'

/** Go 源码所在的仓库根；打包后没有它时只认 VEXNAR_GO_BIN。 */
const repoRoot = resolve(appDir, '..')
const goSourceDirs = ['cmd', 'server', 'agent', 'traffic', 'db', 'intercept', 'notify', 'selfupdate',
  'sidequestion', 'mcphttp', 'mcpserver', 'llmrec', 'llmpool', 'evidence', 'report', 'enrich',
  'vulnclass', 'capability', 'guard', 'config']
const defaultPort = 8787

/** 内置后端的端口；测试与多实例用 VEXNAR_GO_PORT 改。 */
const goPort = () => Number(process.env.VEXNAR_GO_PORT || defaultPort)

const git = (args) => {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : ''
}

/**
 * Go 源码指纹。干净树只看 commit；有未提交的 Go 改动时把改动文件的路径和内容一起
 * 折进去，这样"改了代码但没提交"也会重编，不会用到上一次的二进制。
 */
export function goSourceStamp() {
  if (!existsSync(join(repoRoot, 'go.mod'))) return ''
  const head = git(['rev-parse', '--short', 'HEAD']) || 'nogit'
  const dirty = git(['status', '--porcelain', '--', '*.go', 'go.mod', 'go.sum'])
  if (dirty === '') return `go-${head}`
  const hash = createHash('sha256').update(head).update(dirty)
  for (const line of dirty.split('\n')) {
    const path = line.slice(3).trim()
    if (!path.endsWith('.go')) continue
    try {
      hash.update(path).update(readFileSync(join(repoRoot, path)))
    } catch {
      hash.update(path).update('missing')
    }
  }
  return `go-${head}-${hash.digest('hex').slice(0, 8)}`
}

/** 没有 git 时的退路：用 Go 源码最新修改时间兜底，宁多重编也不要跑旧码。 */
function mtimeStamp() {
  let newest = 0
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.go')) newest = Math.max(newest, statSync(path).mtimeMs)
    }
  }
  for (const dir of goSourceDirs) walk(join(repoRoot, dir))
  return newest === 0 ? '' : `go-m${Math.floor(newest)}`
}

export function goBinaryPath(stamp) {
  return join(appDir, '.vexnar-bin', `vexnar-${stamp || 'local'}`)
}

/**
 * 桌面令牌：客户端与 Go 必须用同一个值。仓库里已有就沿用，没有就生成一份 0600 的
 * `data/desktop.token`——否则 Go 会以"未配置令牌"启动，域数据接口全部 503。
 */
function ensureDesktopToken() {
  const file = join(repoRoot, 'data', 'desktop.token')
  try {
    const existing = readFileSync(file, 'utf8').trim()
    if (existing !== '') return existing
  } catch {
    // 还没有令牌文件，下面生成
  }
  const token = randomBytes(32).toString('hex')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${token}\n`, { mode: 0o600 })
  return token
}

async function canBind(port) {
  return new Promise((done) => {
    const probe = createServer()
    probe.once('error', () => done(false))
    probe.once('listening', () => probe.close(() => done(true)))
    probe.listen(port, '127.0.0.1')
  })
}

async function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => done(port))
    })
  })
}

/** `/api/health` 的 JSON；连不上返回 undefined。 */
export async function probeHealth(origin) {
  try {
    const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1_500) })
    if (!response.ok) return undefined
    const body = await response.json()
    return body?.service === 'vexnar' ? body : undefined
  } catch {
    return undefined
  }
}

async function waitForHealth(origin, signal, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('启动已取消')
    const health = await probeHealth(origin)
    if (health?.ok === true) return health
    await new Promise((done) => setTimeout(done, 250))
  }
  throw new Error(`Go 服务在 ${timeoutMs / 1000}s 内没有就绪（${origin}/api/health）`)
}

/**
 * 按 stamp 构建二进制。源码没变就跳过；返回构建后的路径。
 *
 * `log` 接一行行输出，CLI 直接打到终端，桌面版进主进程日志。
 */
export function ensureGoBinary(stamp, log = console.log) {
  const binary = goBinaryPath(stamp)
  const prepared = join(dirname(binary), `${stamp}.ready`)
  if (existsSync(binary) && existsSync(prepared) && readFileSync(prepared, 'utf8').trim() === stamp) {
    return binary
  }
  const version = spawnSync('go', ['version'], { encoding: 'utf8' })
  if (version.status !== 0) {
    const detail = (version.stderr || version.error?.message || '').trim().split('\n')[0]
    throw new Error(
      '无法执行 `go version`，因此编不了内置 Go 后端。' +
      (detail ? `\n  原因：${detail}` : '') +
      '\n  装好 Go（go.mod 要求 1.26）后重试，或用 VEXNAR_GO_BIN 指定已编译的二进制'
    )
  }
  mkdirSync(dirname(binary), { recursive: true })
  log(`[vexnar] 编译 Go 后端（${stamp}）…`)
  const build = spawnSync('go', ['build', '-ldflags', `-X main.version=${stamp}`, '-o', binary, './cmd/vexnar'], {
    cwd: repoRoot, stdio: 'inherit'
  })
  if (build.status !== 0) throw new Error('Go 后端编译失败，见上方输出')
  writeFileSync(prepared, `${stamp}\n`)
  return binary
}

/** 目标端口上那个进程如果是同版本就复用；是别的版本就停下来说明清楚。 */
async function reuseOrRefuse(stamp, log) {
  const port = goPort()
  const origin = `http://127.0.0.1:${port}`
  if (await canBind(port)) return undefined
  const health = await probeHealth(origin)
  if (health && stamp !== '' && health.version === stamp) {
    log(`[vexnar] 复用已运行的 Go 后端（${stamp}）`)
    return origin
  }
  if (!health) {
    throw new Error(`端口 ${port} 被其他程序占用；请停掉它，或用 VEXNAR_GO_URL 指定别的地址`)
  }
  throw new Error(
    `端口 ${port} 上的 VEXNAR Go 是另一个构建（version=${health.version || '未知'}，本次需要 ${stamp || '未知'}）。\n` +
    `  停掉它再启动：lsof -nP -iTCP:${port} -sTCP:LISTEN\n` +
    `  或临时跳过内置后端：VEXNAR_GO=off（此时请自行设置 VEXNAR_GO_URL）`
  )
}

/**
 * 启动（或复用）Go 后端。
 *
 * 返回 `{ url, version, child, stop }`；`stop()` 只杀本次自己起的进程。
 */
export async function startGoService(options = {}) {
  const log = options.log ?? console.log
  const env = runtimeEnv()
  const explicit = process.env.VEXNAR_GO_URL?.trim()
  if (process.env.VEXNAR_GO === 'off') {
    log('[vexnar] VEXNAR_GO=off：不启动内置 Go，沿用外部服务')
    return { url: explicit || `http://127.0.0.1:${goPort()}`, version: '', stop: () => {} }
  }
  if (explicit) {
    log(`[vexnar] VEXNAR_GO_URL=${explicit}：使用外部 Go 服务`)
    return { url: explicit, version: '', stop: () => {} }
  }

  const stamp = goSourceStamp() || mtimeStamp()
  const reused = await reuseOrRefuse(stamp, log)
  if (reused) return { url: reused, version: stamp, stop: () => {} }

  // 外部二进制由操作者负责版本，只记录不拒绝；自己编的必须与 stamp 一致。
  const external = process.env.VEXNAR_GO_BIN?.trim()
  const binary = external || ensureGoBinary(stamp, log)
  if (!existsSync(binary)) throw new Error(`Go 二进制不存在：${binary}`)

  const wanted = goPort()
  const port = (await canBind(wanted)) ? wanted : await freePort()
  const dataDir = existsSync(join(repoRoot, 'data')) ? join(repoRoot, 'data') : join(appDir, '.vexnar-go')
  mkdirSync(dataDir, { recursive: true })

  const child = spawn(binary, [
    '-addr', `127.0.0.1:${port}`,
    '-data', dataDir,
    '-keydir', repoRoot
  ], {
    cwd: repoRoot,
    env: { ...env, VEXNAR_DESKTOP_TOKEN: process.env.VEXNAR_DESKTOP_TOKEN || ensureDesktopToken() },
    stdio: ['ignore', 'pipe', 'inherit']
  })

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    for (const line of chunk.split('\n')) if (line.trim() !== '') log(`[go] ${line}`)
  })
  const url = `http://127.0.0.1:${port}`
  const stop = (signal = 'SIGTERM') => {
    if (child.exitCode === null) child.kill(signal)
  }
  child.once('exit', (code, signal) => {
    if (code !== 0 && code !== null) log(`[vexnar] Go 后端退出 (code=${code}${signal ? `, ${signal}` : ''})`)
  })

  const health = await waitForHealth(url)
  if (!external && stamp !== '' && health.version && health.version !== stamp) {
    stop()
    throw new Error(`Go 后端版本不符（跑的是 ${health.version}，需要 ${stamp}）`)
  }
  if (external) log(`[vexnar] 外部 Go 二进制版本 ${health.version || '未知'}（源码指纹 ${stamp || '未知'}）`)
  log(`[vexnar] Go 后端就绪：${url}（${stamp || health.version || 'dev'}）`)
  return { url, version: stamp || health.version || '', child, stop }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [command] = process.argv.slice(2)
  try {
    if (command === 'build') {
      const stamp = goSourceStamp() || mtimeStamp()
      console.log(ensureGoBinary(stamp))
    } else if (command === 'stamp') {
      console.log(goSourceStamp() || mtimeStamp())
    } else {
      const go = await startGoService()
      const shutdown = () => {
        go.stop()
        process.exit(0)
      }
      for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, shutdown)
      console.log(`go: ${go.url}`)
    }
  } catch (error) {
    console.error(`[vexnar] ${error.message}`)
    process.exitCode = 1
  }
}
