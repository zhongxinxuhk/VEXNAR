// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { fork, type ChildProcess } from 'node:child_process'
import { app } from 'electron'
import path from 'node:path'
import type { AgentEvent, AgentSendInput } from '@shared/contracts'
import { agentEventSchema } from '@shared/contracts'
import type { BackendManager } from './backend'
import { getSettings } from './settings'

export class AgentManager {
  private child: ChildProcess | null = null
  private ready = false
  private disposed = false

  private starting: Promise<void> | null = null

  constructor(
    private readonly onEvent: (event: AgentEvent) => void,
    private readonly backend: BackendManager
  ) {}

  async send(input: AgentSendInput): Promise<{ accepted: true }> {
    await this.ensureStarted()
    await this.reconfigure()
    if (!this.child || !this.child.connected) throw new Error('Agent Runtime 尚未就绪')
    this.child.send({ type: 'user_message', sessionId: input.sessionId, text: input.text })
    return { accepted: true }
  }

  cancel(): { cancelled: true } {
    this.child?.send({ type: 'cancel' })
    return { cancelled: true }
  }

  /** Push new workspace/model/provider settings into a live runtime. */
  async reconfigure(): Promise<void> {
    const settings = getSettings()
    if (this.child && this.child.connected) {
      try {
        await this.backend.syncModel(settings.model)
      } catch (error) {
        this.onEvent({
          type: 'error',
          message: `同步模型到 Go 后端失败：${error instanceof Error ? error.message : String(error)}`
        })
      }
    }
    if (!this.child || !this.child.connected) return
    try {
      this.child.send({
        type: 'init',
        workspace: settings.workspaceRoot,
        ...this.backend.agentConfig(settings.model)
      })
    } catch (error) {
      this.onEvent({
        type: 'error',
        message: `Agent Runtime 配置失败：${error instanceof Error ? error.message : String(error)}`
      })
    }
  }

  dispose(): void {
    this.disposed = true
    this.ready = false
    if (!this.child) return
    this.child.removeAllListeners()
    this.child.kill()
    this.child = null
  }

  private async ensureStarted(): Promise<void> {
    if ((this.child && this.child.connected) || this.disposed) return
    if (this.starting) return this.starting
    this.starting = this.startRuntime()
    try {
      await this.starting
    } finally {
      this.starting = null
    }
  }

  private async startRuntime(): Promise<void> {
    const runtime = app.isPackaged
      ? path.join(process.resourcesPath, 'agent-runtime', 'index.cjs')
      : path.join(app.getAppPath(), 'src', 'agent-runtime', 'index.cjs')
    const settings = getSettings()
    try {
      await this.backend.syncModel(settings.model)
    } catch {
      // No model configured yet; the gateway will report a clear error when used.
    }
    const config = this.backend.agentConfig(settings.model)

    const child = fork(runtime, [], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    })
    this.child = child

    child.stdout?.on('data', (chunk: Buffer) => console.log(`[agent] ${chunk.toString().trimEnd()}`))
    child.stderr?.on('data', (chunk: Buffer) => console.error(`[agent] ${chunk.toString().trimEnd()}`))
    child.on('error', (error) => {
      if (this.disposed) return
      this.onEvent({ type: 'error', message: `Agent Runtime 启动失败：${error.message}` })
    })

    child.on('message', (message) => {
      const parsed = agentEventSchema.safeParse(message)
      if (!parsed.success) {
        console.error('[agent] invalid event', parsed.error.message)
        return
      }
      if (parsed.data.type === 'ready') this.ready = true
      this.onEvent(parsed.data)
    })

    child.on('exit', (code, signal) => {
      this.ready = false
      this.child = null
      if (this.disposed) return
      this.onEvent({
        type: 'error',
        message: `Agent Runtime 已退出（code=${code ?? 'null'}, signal=${signal ?? 'null'}）`
      })
    })

    child.send({
      type: 'init',
      workspace: settings.workspaceRoot,
      model: config.model,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey
    })
  }
}
