// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { app } from 'electron'
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { Client } from 'pg'

const PG_USER = 'vexnar'
const PG_DATABASE = 'vexnar'
const PG_BACKEND_DATABASE = 'vexnar_backend'
const READY_TIMEOUT_MS = 30_000

export type PostgresRuntime = {
  dsn: string
  backendDsn: string
  port: number
  external: boolean
  stop: () => Promise<void>
}

type CommandResult = {
  stdout: string
  stderr: string
}

function binPath(binDir: string, name: string): string {
  return path.join(binDir, process.platform === 'win32' ? `${name}.exe` : name)
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('无法分配 PostgreSQL 端口'))
        return
      }
      const port = address.port
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

function portableEnv(binDir: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra }
  if (process.platform === 'linux') {
    const libDir = path.join(binDir, '..', 'lib')
    env.LD_LIBRARY_PATH = [libDir, env.LD_LIBRARY_PATH].filter(Boolean).join(':')
  }
  return env
}

function run(bin: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: portableEnv(path.dirname(bin), env),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${path.basename(bin)} 退出码 ${code}: ${tail(stderr || stdout)}`))
    })
  })
}

function tail(value: string, max = 2000): string {
  return value.trim().slice(-max)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function lockPid(dataDir: string): number | null {
  const file = path.join(dataDir, 'postmaster.pid')
  try {
    const text = readFileSync(file, 'utf8')
    const pid = Number.parseInt(text.split('\n')[0] ?? '', 10)
    return Number.isFinite(pid) ? pid : null
  } catch {
    return null
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function resolveBinDir(): string | null {
  const override = process.env.VEXNAR_PG_BIN?.trim()
  if (override) {
    if (existsSync(binPath(override, 'initdb'))) return override
    throw new Error(`VEXNAR_PG_BIN 指向的目录缺少 initdb: ${override}`)
  }

  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'pg', 'bin'), path.join(process.resourcesPath, 'resources', 'pg', 'bin')]
    : [
        path.join(app.getAppPath(), 'resources', 'pg', 'bin'),
        path.join(app.getAppPath(), '..', '..', '.pg-build', 'pg-16.16', 'bin')
      ]

  return candidates.find((candidate) => existsSync(binPath(candidate, 'initdb'))) ?? null
}

async function loadPassword(home: string, initialized: boolean): Promise<string> {
  const passwordPath = path.join(home, 'pgpassword')
  try {
    const password = (await fs.readFile(passwordPath, 'utf8')).trim()
    if (password.length >= 16) return password
  } catch {
    // First launch: generate a new password below.
  }
  if (initialized) {
    throw new Error(`PostgreSQL 已初始化但密码文件缺失或损坏：${passwordPath}`)
  }
  const password = randomBytes(24).toString('hex')
  await fs.writeFile(passwordPath, password, { mode: 0o600 })
  return password
}

async function stopLeftover(binDir: string, dataDir: string): Promise<void> {
  const pidFile = path.join(dataDir, 'postmaster.pid')
  if (!existsSync(pidFile)) return
  try {
    await run(binPath(binDir, 'pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', '-t', '10', 'stop'])
  } catch {
    // A crashed cluster may not answer pg_ctl; fall back to the PID file.
  }
  if (!existsSync(pidFile)) return
  const pid = lockPid(dataDir)
  if (pid && processAlive(pid)) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // Best effort only.
    }
    await sleep(500)
  }
  if (existsSync(pidFile) && (!pid || !processAlive(pid))) {
    await fs.rm(pidFile, { force: true })
  }
}

async function waitReady(
  port: number,
  password: string,
  childExited: () => boolean
): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  let lastError = ''
  while (Date.now() < deadline) {
    if (childExited()) throw new Error('postgres 提前退出，请查看 logs/postgres.log')
    const client = new Client({
      host: '127.0.0.1',
      port,
      user: PG_USER,
      password,
      database: 'postgres',
      connectionTimeoutMillis: 800
    })
    try {
      await client.connect()
      await client.query('SELECT 1')
      await client.end()
      return
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      try {
        await client.end()
      } catch {
        // Ignore connection cleanup errors.
      }
    }
    await sleep(200)
  }
  throw new Error(`postgres 在 ${READY_TIMEOUT_MS / 1000} 秒内未就绪: ${lastError}`)
}

async function ensureBackendDatabase(dsn: string): Promise<string> {
  const url = new URL(dsn)
  url.pathname = `/${PG_BACKEND_DATABASE}`
  const client = new Client({ connectionString: dsn, connectionTimeoutMillis: 3000 })
  await client.connect()
  try {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      PG_BACKEND_DATABASE
    ])
    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE "${PG_BACKEND_DATABASE}"`)
    }
  } finally {
    await client.end()
  }
  return url.toString()
}

async function ensureDatabase(port: number, password: string): Promise<void> {
  const client = new Client({
    host: '127.0.0.1',
    port,
    user: PG_USER,
    password,
    database: 'postgres',
    connectionTimeoutMillis: 3000
  })
  await client.connect()
  try {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      PG_DATABASE
    ])
    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE "${PG_DATABASE}"`)
    }
  } finally {
    await client.end()
  }
}

/**
 * 读取"项目配置文件"里的 PostgreSQL 连接信息（与 `cmd/vexnar`、web 控制台同源）。
 *
 * 存在的意义：桌面端默认用内置 PG + 独立库（`vexnar` / `vexnar_backend`），
 * 而自托管部署的 MCP / 技能数据在 `config.json` 指向的库里。开发或本地自托管时
 * 需要"同一份数据两边都能看到"，因此允许把 **Go 后端的库** 指到 config.json：
 *
 *   - Electron 会话库仍然独立（`vexnar` 或内置 PG），绝不与 Go 的 sessions 表混用；
 *   - 支持三种来源，优先级从高到低：`VEXNAR_BACKEND_PG_DSN` → 项目/config.json
 *     → 内置 PG；`VEXNAR_IGNORE_CONFIG_JSON=1` 可强制忽略 config.json。
 *   - 连接不上（docker 没起、端口不对）时返回 null，调用方回落到内置 PG。
 */
function projectConfigPaths(): string[] {
  const paths: string[] = []
  const explicit = process.env.VEXNAR_CONFIG_PATH?.trim()
  if (explicit) paths.push(explicit)
  paths.push(path.join(app.getPath('userData'), 'config.json'))
  if (!app.isPackaged) {
    // 开发态：仓库根目录（apps/desktop/../../config.json）
    paths.push(path.resolve(app.getAppPath(), '..', '..', 'config.json'))
  } else {
    // 打包态：允许把 config.json 放在 .app 旁边（release/mac-arm64/ 或 release/），
    // 不进安装包，避免把自托管库的凭据打进 dmg。
    const exeDir = path.dirname(app.getPath('exe'))
    paths.push(path.resolve(exeDir, '..', '..', '..', 'config.json'))
    paths.push(path.resolve(exeDir, '..', '..', '..', '..', 'config.json'))
  }
  paths.push(path.join(process.cwd(), 'config.json'))
  return paths
}

type DatabaseBlock = {
  dsn?: string
  host?: string
  port?: number | string
  user?: string
  password?: string
  dbname?: string
  sslmode?: string
}

function dsnFromDatabaseBlock(block: DatabaseBlock | undefined): string | null {
  if (!block) return null
  if (typeof block.dsn === 'string' && block.dsn.trim()) return block.dsn.trim()
  if (!block.host || !block.dbname) return null
  const user = encodeURIComponent(block.user ?? 'postgres')
  const password = block.password ? `:${encodeURIComponent(block.password)}` : ''
  const port = block.port ? `:${block.port}` : ''
  const sslmode = block.sslmode ? `?sslmode=${encodeURIComponent(block.sslmode)}` : ''
  return `postgres://${user}${password}@${block.host}${port}/${block.dbname}${sslmode}`
}

async function probeDsn(dsn: string): Promise<string | null> {
  const client = new Client({ connectionString: dsn, connectionTimeoutMillis: 2500 })
  try {
    await client.connect()
    await client.query('SELECT 1')
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  } finally {
    try {
      await client.end()
    } catch {
      // ignore
    }
  }
}

/** 返回 config.json（或显式环境变量）指定的 **Go 后端** 库连接串。 */
export async function resolveConfiguredBackendDsn(): Promise<{ dsn: string; source: string } | null> {
  const explicit = process.env.VEXNAR_BACKEND_PG_DSN?.trim()
  if (explicit) {
    const problem = await probeDsn(explicit)
    if (problem) {
      console.error(`[pg] VEXNAR_BACKEND_PG_DSN 连接失败，回落内置 PG: ${problem}`)
      return null
    }
    return { dsn: explicit, source: 'VEXNAR_BACKEND_PG_DSN' }
  }
  if (process.env.VEXNAR_IGNORE_CONFIG_JSON === '1') return null
  for (const candidate of projectConfigPaths()) {
    let raw: string
    try {
      raw = await fs.readFile(candidate, 'utf8')
    } catch {
      continue
    }
    let parsed: { database?: DatabaseBlock }
    try {
      parsed = JSON.parse(raw) as { database?: DatabaseBlock }
    } catch (error) {
      console.error(`[pg] ${candidate} 不是合法 JSON，已忽略: ${String(error)}`)
      continue
    }
    const dsn = dsnFromDatabaseBlock(parsed.database)
    if (!dsn) continue
    const problem = await probeDsn(dsn)
    if (problem) {
      console.error(`[pg] ${candidate} 的数据库连不上，回落内置 PG: ${problem}`)
      continue
    }
    return { dsn, source: candidate }
  }
  return null
}

/**
 * Starts the portable PostgreSQL shipped inside the desktop app.
 *
 * An explicit VEXNAR_PG_DSN always wins (useful for development and CI). The
 * app never falls back to SQLite: a missing PG runtime is a hard startup error.
 */
export async function startPortablePostgres(): Promise<PostgresRuntime> {
  const externalDsn = process.env.VEXNAR_PG_DSN?.trim()
  if (externalDsn) {
    console.log('[pg] using VEXNAR_PG_DSN')
    return {
      dsn: externalDsn,
      backendDsn: await ensureBackendDatabase(externalDsn),
      port: 0,
      external: true,
      stop: async () => undefined
    }
  }

  const binDir = resolveBinDir()
  if (!binDir) {
    throw new Error(
      '未找到内置 PostgreSQL。请运行 `npm run pg:fetch`，或设置 VEXNAR_PG_DSN/VEXNAR_PG_BIN 使用外部实例。桌面端不会回退到 SQLite。'
    )
  }

  const home = app.getPath('userData')
  const dataDir = path.join(home, 'pgdata')
  const logDir = path.join(home, 'logs')
  await fs.mkdir(home, { recursive: true })
  await fs.mkdir(logDir, { recursive: true })

  const initialized = existsSync(path.join(dataDir, 'PG_VERSION'))
  if (initialized) await stopLeftover(binDir, dataDir)
  const password = await loadPassword(home, initialized)

  if (!initialized) {
    if (existsSync(dataDir)) {
      const entries = await fs.readdir(dataDir)
      if (entries.length > 0) {
        throw new Error(`PostgreSQL 数据目录非空但缺少 PG_VERSION：${dataDir}`)
      }
    }
    await fs.mkdir(dataDir, { recursive: true })
    const pwfile = path.join(home, '.pg-initdb-pw')
    await fs.writeFile(pwfile, password, { mode: 0o600 })
    try {
      await run(binPath(binDir, 'initdb'), [
        '-D',
        dataDir,
        '-U',
        PG_USER,
        '--auth-local=trust',
        '--auth-host=scram-sha-256',
        '--pwfile',
        pwfile,
        '--encoding=UTF8',
        '--locale=C'
      ])
    } finally {
      await fs.rm(pwfile, { force: true })
    }
  }

  const port = await freePort()
  const logPath = path.join(logDir, 'postgres.log')
  const logStream = createWriteStream(logPath, { flags: 'a' })
  const child = spawn(
    binPath(binDir, 'postgres'),
    ['-D', dataDir, '-p', String(port), '-c', 'listen_addresses=127.0.0.1'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: portableEnv(binDir, { PGPASSWORD: password })
    }
  )
  child.stdout?.pipe(logStream)
  child.stderr?.pipe(logStream)

  let exited = false
  let spawnError: Error | null = null
  child.once('error', (error) => {
    spawnError = error
    exited = true
  })
  child.once('exit', () => {
    exited = true
  })

  const runtime: PostgresRuntime = {
    dsn: `postgres://${PG_USER}:${encodeURIComponent(password)}@127.0.0.1:${port}/${PG_DATABASE}?sslmode=disable`,
    backendDsn: '',
    port,
    external: false,
    stop: async () => {
      if (exited) return
      try {
        await run(binPath(binDir, 'pg_ctl'), [
          '-D',
          dataDir,
          '-m',
          'fast',
          '-w',
          '-t',
          '10',
          'stop'
        ])
      } catch {
        // Fall through to process termination.
      }
      if (!exited) {
        child.kill('SIGTERM')
        await sleep(500)
      }
      if (!exited) child.kill('SIGKILL')
      logStream.end()
    }
  }

  try {
    await waitReady(port, password, () => {
      if (spawnError) throw new Error(`postgres 启动失败: ${spawnError.message}`)
      return exited
    })
    await ensureDatabase(port, password)
    runtime.backendDsn = await ensureBackendDatabase(runtime.dsn)
    process.env.VEXNAR_PG_DSN = runtime.dsn
    console.log(`[pg] portable PostgreSQL ready on 127.0.0.1:${port}`)
    return runtime
  } catch (error) {
    await runtime.stop()
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n日志：${path.join(logDir, 'postgres.log')}`
    )
  }
}
