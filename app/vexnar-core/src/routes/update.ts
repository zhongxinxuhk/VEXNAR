// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { chmod, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
import { spawn } from 'node:child_process'
import { Hono } from 'hono'
import { storeRoot } from '../context.ts'

// ─────────────────────────────────────────────────────────────────────────────
// 页面一键更新的 HTTP 面，语义对齐 server/update.go + selfupdate/。
//
// 真正的下载 / SHA256 校验 / 暂存逻辑在下面内联的 selfupdate 小节里，这里只负责
// 鉴权边界、并发互斥、进度广播，以及"该退出了"的信号。重启不由本进程完成：暂存好
// 新版本后设置 restartRequested，由宿主（start.sh / start.bat / Docker ENTRYPOINT）
// 重新拉起，下一轮启动时再做原子换装。
// ─────────────────────────────────────────────────────────────────────────────

const REPO = 'zhongxinxuhk/vexnar'
const latestURL = `https://api.github.com/repos/${REPO}/releases/latest`
const allowedHosts = new Set([
  'api.github.com',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'raw.githubusercontent.com'
])

const releaseTTL = 30 * 60 * 1000
const releaseErrTTL = 2 * 60 * 1000
const releaseTimeoutDefault = 20_000

const BUILD_VERSION = process.env.VEXNAR_VERSION ?? 'dev'

function releaseTimeoutMs(): number {
  const n = Number(process.env.VEXNAR_UPDATE_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : releaseTimeoutDefault
}

function goos(): string {
  return process.platform === 'win32' ? 'windows' : process.platform
}
function goarch(): string {
  return process.arch === 'x64' ? 'amd64' : process.arch === 'ia32' ? '386' : process.arch
}

function assetName(tag: string, os: string, arch: string): string {
  return `vexnar-${String(tag).replace(/^v/, '')}-${os}-${arch}.zip`
}

function parseVersion(s: string): number[] | null {
  s = String(s ?? '').trim().replace(/^v/, '')
  if (!s) return null
  const parts = s.split('.')
  if (parts.length !== 3) return null
  const out: number[] = []
  for (const p of parts) {
    const n = Number(p)
    if (!Number.isInteger(n) || n < 0) return null
    out.push(n)
  }
  return out
}

function compareVersions(a: string, b: string): { cmp: number; comparable: boolean } {
  const av = parseVersion(a)
  const bv = parseVersion(b)
  if (!av || !bv) return { cmp: 0, comparable: false }
  for (let i = 0; i < 3; i++) {
    if (av[i] !== bv[i]) return { cmp: av[i] < bv[i] ? -1 : 1, comparable: true }
  }
  return { cmp: 0, comparable: true }
}

function inDocker(): boolean {
  if (existsSync('/.dockerenv')) return true
  try {
    const s = readFileSync('/proc/1/cgroup', 'utf8')
    return s.includes('docker') || s.includes('containerd')
  } catch {
    return false
  }
}

function assertAllowedUrl(rawURL: string): void {
  const u = new URL(rawURL)
  if (u.protocol !== 'https:') throw new Error(`拒绝非 HTTPS 地址: ${u.protocol}//${u.host}`)
  if (!allowedHosts.has(u.hostname.toLowerCase())) throw new Error(`拒绝非 GitHub 域名: ${u.hostname}`)
}

function humanSize(n: number): string {
  const unit = 1024
  if (n < unit) return `${n} B`
  let div = unit
  let exp = 0
  for (let v = Math.floor(n / unit); v >= unit; v = Math.floor(v / unit)) {
    div *= unit
    exp++
  }
  return `${(n / div).toFixed(1)} ${'KMGT'[exp]}B`
}

function short(sum: string): string {
  return sum.length > 12 ? sum.slice(0, 12) + '…' : sum
}

// ─────────────────────────────────────────────────────────────────────────────
// 自更新文件路径 + 换装（对齐 selfupdate.ResolvePaths / Stage / Rollback）
// ─────────────────────────────────────────────────────────────────────────────

function resolvePaths() {
  const dir = resolve(process.env.VEXNAR_SELFUPDATE_DIR || storeRoot())
  const current = process.execPath
  const name = basename(current)
  const ext = extname(name)
  const stem = ext ? name.slice(0, -ext.length) : name
  return {
    dir,
    current,
    new: join(dir, `${stem}.new${ext}`),
    sum: join(dir, `${stem}.new${ext}.sha256`),
    old: join(dir, `${stem}.old${ext}`),
    marker: join(dir, `${stem}.upgrade.json`)
  }
}

function hasBackup(): boolean {
  try {
    return existsSync(resolvePaths().old)
  } catch {
    return false
  }
}

async function checkWritable(dir: string): Promise<void> {
  const probe = join(dir, `.vexnar-update-probe-${Date.now()}`)
  try {
    await writeFile(probe, '')
    await rm(probe, { force: true })
  } catch (e: any) {
    throw new Error(`程序目录 ${dir} 不可写，无法自动更新（请检查权限或改用手动升级）: ${e?.message ?? e}`)
  }
}

async function fileSHA256(path: string): Promise<string> {
  const buf = await readFile(path)
  return createHash('sha256').update(buf).digest('hex')
}

function parseSums(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const fields = line.trim().split(/\s+/)
    if (fields.length !== 2 || !/^[0-9a-fA-F]{64}$/.test(fields[0])) continue
    const name = fields[1].replace(/^\*/, '')
    if (name) out[name] = fields[0].toLowerCase()
  }
  return out
}

async function fetchLatest(signal: AbortSignal): Promise<any> {
  assertAllowedUrl(latestURL)
  const res = await fetch(latestURL, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'vexnar-selfupdate' },
    signal
  })
  if (res.status === 403 || res.status === 429) throw new Error('GitHub 接口限流（每小时 60 次），请稍后再试')
  if (res.status === 404) throw new Error(`仓库 ${REPO} 尚未发布任何正式版本`)
  if (!res.ok) throw new Error(`GitHub 返回 ${res.status}`)
  const rel: any = await res.json()
  if (!String(rel?.tag_name ?? '').trim()) throw new Error('Release 缺少 tag')
  return rel
}

async function fetchSums(rel: any): Promise<Record<string, string>> {
  const asset = (rel.assets ?? []).find((a: any) => a.name === 'SHA256SUMS')
  if (!asset) throw new Error('该 Release 没有 SHA256SUMS，无法校验完整性，拒绝升级')
  assertAllowedUrl(asset.url)
  const res = await fetch(asset.url, { headers: { 'user-agent': 'vexnar-selfupdate' } })
  if (!res.ok) throw new Error(`下载 SHA256SUMS: HTTP ${res.status}`)
  const raw = (await res.text()).slice(0, 1 << 20)
  const out = parseSums(raw)
  if (!Object.keys(out).length) throw new Error('SHA256SUMS 内容为空或格式无法识别')
  return out
}

async function download(url: string, dst: string, total: number, prog: (ph: string, pct: number, msg: string) => void): Promise<string> {
  assertAllowedUrl(url)
  const res = await fetch(url, { headers: { 'user-agent': 'vexnar-selfupdate' } })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
  const h = createHash('sha256')
  const fh = await open(dst, 'w')
  const reader = res.body.getReader()
  let written = 0
  let last = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const buf = Buffer.from(value)
      h.update(buf)
      await fh.write(buf)
      written += buf.length
      const now = Date.now()
      if (now - last >= 300) {
        last = now
        const pct = total > 0 ? Math.min(100, Math.floor((written * 100) / total)) : -1
        prog('downloading', pct, `下载中 ${humanSize(written)} / ${humanSize(total)}`)
      }
    }
  } finally {
    await fh.close()
  }
  if (total > 0 && written !== total) throw new Error(`下载不完整：期望 ${total} 字节，实际 ${written} 字节`)
  return h.digest('hex')
}

// 最小 ZIP 提取器（支持 STORED=0 与 DEFLATE=8），只取基名匹配的可执行文件。
function extractZipFile(zip: Buffer, want: string): Buffer {
  let eocd = -1
  const tailStart = Math.max(0, zip.length - 22 - 65535)
  for (let i = zip.length - 22; i >= tailStart; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('不是合法的 zip（缺少 EOCD）')
  const count = zip.readUInt16LE(eocd + 10)
  let p = zip.readUInt32LE(eocd + 16)
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) break
    const method = zip.readUInt16LE(p + 10)
    const nameLen = zip.readUInt16LE(p + 28)
    const extraLen = zip.readUInt16LE(p + 30)
    const commentLen = zip.readUInt16LE(p + 32)
    const compSize = zip.readUInt32LE(p + 20)
    const localOffset = zip.readUInt32LE(p + 42)
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen)
    if (basename(name).toLowerCase() === want.toLowerCase()) {
      if (zip.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('本地文件头损坏')
      const lNameLen = zip.readUInt16LE(localOffset + 26)
      const lExtraLen = zip.readUInt16LE(localOffset + 28)
      const dataStart = localOffset + 30 + lNameLen + lExtraLen
      const data = zip.subarray(dataStart, dataStart + compSize)
      if (method === 0) return Buffer.from(data)
      if (method === 8) return inflateRawSync(data)
      throw new Error(`不支持的 zip 压缩方式 ${method}`)
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  throw new Error(`发布包里没有找到 ${want}`)
}

async function smokeTest(bin: string): Promise<void> {
  await chmod(bin, 0o755)
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(bin, ['-h'], { env: { ...process.env, VEXNAR_SELFUPDATE_SMOKE: '1' } })
    let out = ''
    child.stdout?.on('data', (d) => (out += d))
    child.stderr?.on('data', (d) => (out += d))
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('冒烟测试超时（新二进制无响应）'))
    }, 30_000)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolvePromise()
      else reject(new Error(`冒烟测试失败: ${out.slice(0, 300)}`))
    })
  })
}

async function stage(rel: any, currentVersion: string, prog: (ph: string, pct: number, msg: string) => void): Promise<void> {
  const p = resolvePaths()
  await checkWritable(p.dir)
  const name = assetName(rel.tag_name, goos(), goarch())
  const asset = (rel.assets ?? []).find((a: any) => String(a.name).toLowerCase() === name.toLowerCase())
  if (!asset) throw new Error(`该版本没有提供 ${goos()}/${goarch()} 的发布包（缺少 ${name}）`)

  prog('downloading', 0, '获取校验和清单…')
  const sums = await fetchSums(rel)
  const want = sums[name]
  if (!want) throw new Error(`SHA256SUMS 未收录 ${name}，拒绝安装未经校验的二进制`)

  const zipPath = `${p.new}.zip.part`
  const binPath = `${p.new}.part`
  try {
    prog('downloading', 0, `下载 ${name}（${humanSize(asset.size)}）…`)
    const got = await download(asset.url, zipPath, asset.size, prog)

    prog('verifying', -1, '校验 SHA256…')
    if (got.toLowerCase() !== want.toLowerCase()) {
      throw new Error(`SHA256 不匹配：期望 ${short(want)}，实际 ${short(got)}（下载损坏或被篡改）`)
    }

    prog('extracting', -1, '解压并冒烟测试…')
    const zip = await readFile(zipPath)
    const bin = extractZipFile(zip, process.platform === 'win32' ? 'vexnar.exe' : 'vexnar')
    await writeFile(binPath, bin, { mode: 0o755 })
    await smokeTest(binPath)

    const binSum = await fileSHA256(binPath)
    await writeFile(p.sum, binSum)
    await rename(binPath, p.new)

    try {
      await writeFile(
        p.marker,
        `${JSON.stringify({ from: currentVersion, to: String(rel.tag_name).replace(/^v/, ''), staged_at: Math.floor(Date.now() / 1000) }, null, 2)}\n`
      )
    } catch {
      prog('staged', -1, '警告：写入升级标记失败，本次升级将没有自动回滚保护')
    }
    prog('staged', 100, '新版本已就绪，正在重启…')
  } finally {
    await rm(zipPath, { force: true }).catch(() => {})
    await rm(binPath, { force: true }).catch(() => {})
  }
}

async function rollback(): Promise<void> {
  const p = resolvePaths()
  if (!existsSync(p.old)) throw new Error(`没有可回滚的上一版本（${p.old} 不存在）`)
  await rm(p.new, { force: true }).catch(() => {})
  await rm(p.sum, { force: true }).catch(() => {})
  await smokeTest(p.old)
  const tmp = `${p.current}.swap`
  await rm(tmp, { force: true }).catch(() => {})
  try {
    await rename(p.current, tmp)
  } catch (e: any) {
    throw new Error(`移走当前版本: ${e?.message ?? e}`)
  }
  try {
    await rename(p.old, p.current)
  } catch (e: any) {
    await rename(tmp, p.current).catch(() => {})
    throw new Error(`装入上一版本: ${e?.message ?? e}`)
  }
  try {
    await rename(tmp, p.old)
  } catch (e: any) {
    console.log(`[update] 回滚后整理备份失败（不影响运行）：${e?.message ?? e}`)
  }
  await rm(p.marker, { force: true }).catch(() => {})
}

// ─────────────────────────────────────────────────────────────────────────────
// 版本缓存 + 进度广播
// ─────────────────────────────────────────────────────────────────────────────

const relCache = {
  rel: null as any,
  err: null as any,
  at: 0,
  async get(signal: AbortSignal, force: boolean): Promise<any> {
    const now = Date.now()
    const ttl = this.err ? releaseErrTTL : releaseTTL
    if (!force && this.at && now - this.at < ttl) {
      if (this.err) throw this.err
      return this.rel
    }
    try {
      const rel = await fetchLatest(signal)
      this.rel = rel
      this.err = null
      this.at = now
      return rel
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.name === 'TimeoutError') throw e
      this.err = e
      this.rel = null
      this.at = now
      throw e
    }
  }
}

type Progress = { phase: string; percent: number; message: string; version?: string; error?: string }

const updHub = {
  running: false,
  cur: { phase: 'idle', percent: -1, message: '', version: '' } as Progress,
  subs: new Set<(p: Progress) => void>(),
  begin(version: string): boolean {
    if (this.running) return false
    this.running = true
    this.cur = { phase: 'downloading', percent: 0, message: '准备中…', version }
    this.fanout(this.cur)
    return true
  },
  finish(err: any) {
    this.running = false
    if (err) this.cur = { phase: 'failed', percent: -1, message: '更新失败', error: String(err?.message ?? err), version: this.cur.version }
    else this.cur = { phase: 'staged', percent: 100, message: '新版本已就绪，正在重启…', version: this.cur.version }
    this.fanout(this.cur)
  },
  publish(ph: string, pct: number, msg: string) {
    this.cur = { phase: ph, percent: pct, message: msg, version: this.cur.version }
    this.fanout(this.cur)
  },
  fanout(p: Progress) {
    for (const cb of this.subs) {
      try {
        cb(p)
      } catch {
        // 订阅方异常不影响升级本身
      }
    }
  },
  snapshot(): { cur: Progress; running: boolean } {
    return { cur: this.cur, running: this.running }
  },
  subscribe(cb: (p: Progress) => void): () => void {
    this.subs.add(cb)
    return () => this.subs.delete(cb)
  }
}

let restartRequested = false
function requestRestart() {
  restartRequested = true
  console.log('[update] 请求退出以完成换装（exit 75）')
}

export function register(api: Hono) {
  // GET /api/update/check
  api.get('/api/update/check', async (c) => {
    const current = BUILD_VERSION
    const mode = inDocker() ? 'docker' : 'binary'
    const out: any = {
      current,
      mode,
      os: goos(),
      arch: goarch(),
      has_backup: hasBackup(),
      repo: REPO,
      boot_notice: '',
      rolled_back: false
    }
    const force = (c.req.query('force') ?? '') !== ''
    try {
      const rel = await relCache.get(AbortSignal.timeout(releaseTimeoutMs()), force)
      const latest = rel.tag_name
      out.latest = latest
      out.notes = rel.body
      out.html_url = rel.html_url
      if (rel.published_at) out.published_at = rel.published_at
      const asset = assetName(latest, goos(), goarch())
      out.asset = asset
      const found = (rel.assets ?? []).find((a: any) => String(a.name).toLowerCase() === asset.toLowerCase())
      if (found) {
        out.asset_available = true
        out.size = found.size
      } else {
        out.asset_available = false
      }
      const cmp = compareVersions(current, latest)
      out.comparable = cmp.comparable
      out.has_update = cmp.comparable && cmp.cmp < 0
      if (!cmp.comparable) out.reason = `当前版本 "${current}" 不是正式发布版本，已禁用一键更新`
    } catch (e: any) {
      out.error = String(e?.message ?? e)
    }
    return c.json(out)
  })

  // POST /api/update/apply — 下载并暂存新版本，完成后请求退出交给守护脚本重启。
  api.post('/api/update/apply', async (c) => {
    const current = BUILD_VERSION
    let rel: any
    try {
      rel = await relCache.get(AbortSignal.timeout(releaseTimeoutMs()), false)
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, 502)
    }
    const cmp = compareVersions(current, rel.tag_name)
    if (!cmp.comparable) return c.json({ error: `当前版本 "${current}" 不是正式发布版本，已禁用一键更新` }, 400)
    if (cmp.cmp >= 0) return c.json({ error: `当前已是最新版本 ${current}` }, 400)
    if (!updHub.begin(rel.tag_name)) return c.json({ error: '已有一个更新正在进行中' }, 409)

    void (async () => {
      let err: any = null
      try {
        await stage(rel, current, (ph, pct, msg) => updHub.publish(ph, pct, msg))
      } catch (e: any) {
        err = e
      }
      updHub.finish(err)
      if (err) {
        console.error('[update] 更新失败：', err?.message ?? err)
        return
      }
      console.log(`[update] ${current} → ${rel.tag_name} 已暂存，即将退出以完成换装`)
      await new Promise((r) => setTimeout(r, 1500))
      requestRestart()
    })()

    return c.json({ ok: true, target: rel.tag_name }, 202)
  })

  // POST /api/update/rollback — 主动退回上一版本。
  api.post('/api/update/rollback', async (c) => {
    if (updHub.snapshot().running) return c.json({ error: '更新正在进行中，无法回滚' }, 409)
    try {
      await rollback()
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, 400)
    }
    console.log('[update] 已手动回滚到上一版本，即将退出以完成切换')
    void (async () => {
      await new Promise((r) => setTimeout(r, 500))
      requestRestart()
    })()
    return c.json({ ok: true }, 202)
  })

  // GET /api/update/stream — SSE 推送更新进度。
  api.get('/api/update/stream', async (c) => {
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder()
        const send = (p: Progress) => {
          try {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(p)}\n\n`))
          } catch {
            // 连接已关闭
          }
        }
        const unsub = updHub.subscribe(send)
        send(updHub.snapshot().cur)
        const ping = setInterval(() => {
          try {
            controller.enqueue(enc.encode(': ping\n\n'))
          } catch {
            // ignore
          }
        }, 20_000)
        const cleanup = () => {
          clearInterval(ping)
          unsub()
        }
        if (c.req.raw.signal?.aborted) cleanup()
        else c.req.raw.signal?.addEventListener('abort', cleanup)
      }
    })
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'x-accel-buffering': 'no'
      }
    })
  })
}

// 供宿主进程检查是否需要以 ExitRestart 退出（不实际调用 process.exit）。
export function restartRequestedForExit(): boolean {
  return restartRequested
}
