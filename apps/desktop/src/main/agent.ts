// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { fork, type ChildProcess } from 'node:child_process'
import { app, dialog } from 'electron'
import { listSessions } from './db'
import path from 'node:path'
import type { AgentEvent, AgentSendInput } from '@shared/contracts'
import { agentEventSchema } from '@shared/contracts'
import type { BackendManager } from './backend'
import { getSettings } from './settings'

export class AgentManager {
  private child: ChildProcess | null = null
  private ready = false
  private busy = false

  isBusy(): boolean {
    return this.busy
  }

  private disposed = false

  private starting: Promise<void> | null = null

  constructor(
    private readonly onEvent: (event: AgentEvent) => void,
    private readonly backend: BackendManager
  ) {}

  async send(input: AgentSendInput): Promise<{ accepted: true }> {
    if (this.busy) throw new Error('当前对话仍在运行')
    this.busy = true
    try {
      const preferences = (await this.backend.request({
        path: '/desktop/preferences',
        method: 'GET'
      })) as { access_mode: string }
      const session = (await listSessions()).find(
        (item) => item.id === input.sessionId
      )
      if (!session) throw new Error('会话不存在')
      let networkApproved = false
      if (preferences.access_mode === 'request') {
        const approval = await dialog.showMessageBox({
          type: 'question',
          title: '批准模型联网请求',
          message: '允许将本条消息及所附图片发送给当前模型服务？',
          detail: '此批准仅适用于本次发送。取消后不会发起模型请求。',
          buttons: ['取消', '允许本次'],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        })
        if (approval.response !== 1) throw new Error('已取消模型联网请求')
        networkApproved = true
      }
      await this.ensureStarted()
      await this.reconfigure(session.workspace)
      if (!this.child || !this.child.connected)
        throw new Error('Agent Runtime 尚未就绪')
      this.busy = true
      this.child.send({
        type: 'user_message',
        sessionId: input.sessionId,
        text: input.text,
        attachments: input.attachments ?? [],
        reasoningEffort: input.reasoningEffort,
        networkApproved,
        accessMode: preferences.access_mode
      })
      return { accepted: true }
    } catch (error) {
      this.busy = false
      throw error
    }
  }

  cancel(): { cancelled: true } {
    this.child?.send({ type: 'cancel' })
    return { cancelled: true }
  }

  /** Push new workspace/model/provider settings into a live runtime. */
  async reconfigure(workspace?: string): Promise<void> {
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
        workspace: workspace ?? settings.workspaceRoot,
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

    child.stdout?.on('data', (chunk: Buffer) =>
      console.log(`[agent] ${chunk.toString().trimEnd()}`)
    )
    child.stderr?.on('data', (chunk: Buffer) =>
      console.error(`[agent] ${chunk.toString().trimEnd()}`)
    )
    child.on('error', (error) => {
      if (this.disposed) return
      this.onEvent({
        type: 'error',
        message: `Agent Runtime 启动失败：${error.message}`
      })
    })

    child.on('message', (message) => {
      if (
        message &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === 'approval_request'
      ) {
        const request = message as { id?: unknown; path?: unknown }
        if (
          typeof request.id !== 'string' ||
          request.id.length > 100 ||
          typeof request.path !== 'string' ||
          request.path.length > 4096
        )
          return
        const id = request.id
        void dialog
          .showMessageBox({
            type: 'question',
            title: '批准工作区外文件读取',
            message: '允许本次读取工作区外的文件或目录？',
            detail: request.path,
            buttons: ['取消', '允许本次'],
            defaultId: 0,
            cancelId: 0,
            noLink: true
          })
          .then((result) => {
            if (child.connected)
              child.send({
                type: 'approval_response',
                id,
                allowed: result.response === 1
              })
          })
          .catch(() => {
            if (child.connected)
              child.send({ type: 'approval_response', id, allowed: false })
          })
        return
      }
      const parsed = agentEventSchema.safeParse(message)
      if (!parsed.success) {
        console.error('[agent] invalid event', parsed.error.message)
        return
      }
      if (['assistant_done', 'error'].includes(parsed.data.type))
        this.busy = false
      if (parsed.data.type === 'ready') this.ready = true
      this.onEvent(parsed.data)
    })

    child.on('exit', (code, signal) => {
      this.busy = false
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
