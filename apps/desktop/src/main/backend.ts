// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, renameSync, statSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import type { BackendRequestInput, BackendStatus, BackendUploadInput, BackendUploadResult } from '@shared/contracts'

const READY_TIMEOUT_MS = 45_000
const REQUEST_TIMEOUT_MS = 30_000

export type LLMStatus = {
  configured: boolean
  provider: string
  /** Wire format the Go backend is using ('openai-responses' by default). */
  format?: string
  model: string
  base_url: string
  key_set: boolean
}

export type AgentBackendConfig = {
  model: string
  baseUrl: string
  apiKey: string
  /** Selected wire format; the runtime picks /responses or /chat/completions. */
  format: string
}

export type ConfigureLLMInput = {
  baseUrl: string
  apiKey: string
  model: string
  /** Defaults to openai-responses — the format the NewAPI platform serves. */
  provider?: 'openai' | 'openai-responses'
}

type HealthPayload = { ok?: boolean; service?: string; version?: string }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('无法分配 Go 后端端口'))
        return
      }
      const port = address.port
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

function binaryName(): string {
  return process.platform === 'win32' ? 'vexnar.exe' : 'vexnar'
}

function resolveBackendBinary(): string {
  const override = process.env.VEXNAR_BACKEND_BIN?.trim()
  if (override) {
    if (!existsSync(override)) throw new Error(`VEXNAR_BACKEND_BIN 不存在: ${override}`)
    return override
  }
  const name = binaryName()
  const appPath = app.getAppPath()
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'vexnar', name),
        path.join(process.resourcesPath, 'backend', name),
        path.join(process.resourcesPath, 'resources', 'vexnar', name)
      ]
    : [
        path.join(appPath, 'resources', 'vexnar', name),
        path.resolve(appPath, '..', '..', 'desktop', 'binaries', name),
        path.join(process.cwd(), 'desktop', 'binaries', name)
      ]
  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found) {
    throw new Error(
      `未找到 Go 后端可执行文件（查找：${candidates.join(', ')}）。请先运行 npm run backend:prepare。`
    )
  }
  return found
}

function readError(text: string, status: number): string {
  if (!text) return `HTTP ${status}`
  try {
    const payload = JSON.parse(text) as { error?: unknown; message?: unknown }
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim()
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim()
  } catch {
    // Fall back to a bounded text response.
  }
  return text.slice(0, 600)
}

/**
 * Supervises the bundled Go service on a random loopback port. Every call is
 * authenticated with a random per-launch token; the renderer never receives
 * either the port or the token.
 */
export class BackendManager {
  private child: ChildProcess | null = null
  private baseUrl = ''
  private token = ''
  private model = ''
  private format = 'openai-responses'
  private logPath = ''
  private logFd: number | null = null
  private stopping = false

  get ready(): boolean {
    return this.child !== null && this.baseUrl !== '' && this.token !== ''
  }

  async start(dsn: string): Promise<void> {
    if (this.child) return
    const bin = resolveBackendBinary()
    const root = path.join(app.getPath('userData'), 'backend')
    const dataDir = path.join(root, 'data')
    mkdirSync(dataDir, { recursive: true })
    this.logPath = path.join(root, 'vexnar.log')
    if (existsSync(this.logPath) && statSync(this.logPath).size > 5 * 1024 * 1024) {
      renameSync(this.logPath, `${this.logPath}.1`)
    }
    this.logFd = openSync(this.logPath, 'a')

    const port = await freePort()
    this.baseUrl = `http://127.0.0.1:${port}`
    this.token = randomBytes(32).toString('hex')

    const skillDir = process.env.VEXNAR_SKILL_DIR?.trim() || this.resolveSkillDir()
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      VEXNAR_PG_DSN: dsn,
      VEXNAR_DESKTOP_TOKEN: this.token
    }
    if (skillDir) env.VEXNAR_SKILL_DIR = skillDir

    const child = spawn(
      bin,
      ['-addr', `127.0.0.1:${port}`, '-data', dataDir, '-keydir', root, '-proxy', ''],
      {
        cwd: root,
        env,
        stdio: ['ignore', this.logFd, this.logFd],
        windowsHide: true
      }
    )
    this.child = child
    this.stopping = false

    let spawnError: Error | null = null
    child.once('error', (error) => {
      spawnError = error
    })
    child.once('exit', (code, signal) => {
      this.child = null
      if (!this.stopping) {
        console.error(`[backend] exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
      }
    })

    try {
      await this.waitReady(() => spawnError)
      console.log(`[backend] Go service ready on ${this.baseUrl}`)
    } catch (error) {
      await this.stop()
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n日志：${this.logPath}`
      )
    }
  }

  async stop(): Promise<void> {
    this.stopping = true
    const child = this.child
    this.child = null
    if (child) {
      child.kill('SIGTERM')
      for (let attempt = 0; attempt < 20 && child.exitCode === null; attempt += 1) {
        await sleep(100)
      }
      if (child.exitCode === null) child.kill('SIGKILL')
    }
    if (this.logFd !== null) {
      closeSync(this.logFd)
      this.logFd = null
    }
    this.baseUrl = ''
    this.token = ''
  }

  async status(): Promise<BackendStatus> {
    if (!this.ready) {
      return { connected: false, error: 'Go 后端尚未启动' }
    }
    try {
      const health = await this.call<HealthPayload>('/api/health', { method: 'GET' })
      return {
        connected: health?.ok !== false,
        service: health?.service,
        version: health?.version
      }
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async request(input: BackendRequestInput): Promise<unknown> {
    const route = input.path.startsWith('/api/') ? input.path : `/api${input.path}`
    return this.call(
      route,
      {
        method: input.method,
        body: input.body
      },
      input.timeoutMs ?? REQUEST_TIMEOUT_MS
    )
  }

  /**
   * Multipart upload to the Go backend (the same /api/chat/upload route the web
   * client uses). The renderer never learns the backend URL or token; it hands
   * bytes to the main process, which performs the authenticated request.
   */
  async upload(input: BackendUploadInput): Promise<BackendUploadResult> {
    if (!this.ready) throw new Error('Go 后端尚未启动')
    const route = input.path.startsWith('/api/') ? input.path : `/api${input.path}`
    const form = new FormData()
    for (const file of input.files) {
      const bytes = Buffer.from(file.base64, 'base64')
      form.append('file', new Blob([new Uint8Array(bytes)], { type: file.type }), file.name)
    }
    const response = await fetch(`${this.baseUrl}${route}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'x-vexnar-desktop-token': this.token
      },
      body: form,
      signal: AbortSignal.timeout(120_000)
    })
    const text = await response.text()
    if (!response.ok) throw new Error(readError(text, response.status))
    try {
      return JSON.parse(text) as BackendUploadResult
    } catch {
      throw new Error('上传响应不是合法 JSON')
    }
  }

  async llmStatus(): Promise<LLMStatus> {
    const status = await this.call<LLMStatus>('/api/desktop/llm', { method: 'GET' })
    // The Go backend is authoritative for model + format. Mirroring them here
    // keeps the runtime in step with whatever the web page shows for the same
    // PostgreSQL row, instead of trusting the locally cached settings.
    if (status?.format) this.format = status.format
    if (status?.model) this.model = status.model
    return status
  }

  async configureLLM(input: ConfigureLLMInput): Promise<LLMStatus> {
    const baseUrl = input.baseUrl.trim()
    const apiKey = input.apiKey.trim()
    const model = input.model.trim()
    if (!baseUrl || !apiKey || !model) throw new Error('模型连接配置不完整')
    // Responses is the platform's primary protocol; the Go backend stores this
    // exact format in PostgreSQL and both the app and the web page read it back.
    const status = await this.call<LLMStatus>('/api/desktop/llm/configure', {
      method: 'POST',
      body: {
        provider: input.provider ?? 'openai-responses',
        base_url: baseUrl,
        api_key: apiKey,
        model
      }
    })
    this.model = model
    if (status?.format) this.format = status.format
    return status
  }

  async syncModel(model: string): Promise<void> {
    const next = model.trim()
    if (!next || next === this.model) return
    try {
      await this.call<LLMStatus>('/api/desktop/llm/configure', {
        method: 'POST',
        body: { model: next }
      })
      this.model = next
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // A fresh install has a model preference but no provider yet. The first
      // NewAPI login configures the gateway; don't surface this as a UI error.
      if (message.includes('不能为空') || message.includes('尚未配置')) return
      throw error
    }
  }

  async listModels(): Promise<string[]> {
    const payload = await this.call<{ data?: unknown[] }>('/api/desktop/llm/models', {
      method: 'GET'
    })
    const items = Array.isArray(payload?.data) ? payload.data : []
    const models = items
      .map((item) => {
        if (typeof item === 'string') return item
        if (!item || typeof item !== 'object') return ''
        const record = item as Record<string, unknown>
        return String(record.id ?? record.name ?? record.model ?? '')
      })
      .map((item) => item.trim())
      .filter(Boolean)
    return Array.from(new Set(models))
  }

  async clearLLM(): Promise<void> {
    await this.call('/api/desktop/llm/clear', { method: 'POST' })
    this.model = ''
  }

  async apiKey(): Promise<string> {
    const payload = await this.call<{ api_key?: string }>('/api/desktop/llm/key', {
      method: 'GET'
    })
    const key = String(payload?.api_key ?? '').trim()
    if (!key) throw new Error('尚未配置 App-managed API Key')
    return key
  }

  agentConfig(model?: string): AgentBackendConfig {
    if (!this.ready) throw new Error('Go 后端尚未启动')
    return {
      model: model?.trim() || this.model,
      baseUrl: `${this.baseUrl}/api/desktop/openai/v1`,
      apiKey: this.token,
      format: this.format
    }
  }

  private resolveSkillDir(): string {
    const candidates = app.isPackaged
      ? [path.join(process.resourcesPath, 'skills')]
      : [
          path.resolve(app.getAppPath(), '..', '..', 'skills'),
          path.join(process.cwd(), 'skills')
        ]
    return candidates.find((candidate) => existsSync(candidate)) ?? ''
  }

  private async waitReady(spawnError: () => Error | null): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS
    while (Date.now() < deadline) {
      const error = spawnError()
      if (error) throw new Error(`Go 后端启动失败: ${error.message}`)
      if (!this.child) throw new Error('Go 后端已退出')
      try {
        const health = await this.call<HealthPayload>('/api/health', { method: 'GET' }, 2_000)
        if (health?.ok !== false) return
      } catch {
        // The service is still opening stores / running migrations.
      }
      await sleep(300)
    }
    throw new Error('等待 Go 后端就绪超时')
  }

  private async call<T>(
    route: string,
    init: { method: string; body?: unknown },
    timeoutMs = REQUEST_TIMEOUT_MS
  ): Promise<T> {
    if (!this.ready) throw new Error('Go 后端尚未启动')
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-vexnar-desktop-token': this.token
    }
    let body: string | undefined
    if (init.body !== undefined) {
      headers['content-type'] = 'application/json'
      body = JSON.stringify(init.body)
    }
    const response = await fetch(`${this.baseUrl}${route}`, {
      method: init.method,
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs)
    })
    const text = await response.text()
    if (!response.ok) throw new Error(readError(text, response.status))
    if (!text) return undefined as T
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json') || text.trim().startsWith('{')) {
      return JSON.parse(text) as T
    }
    return text as T
  }
}
