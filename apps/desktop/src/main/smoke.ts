// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { app, nativeImage } from 'electron'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { simpleGit } from 'simple-git'
import { createChatWorktree } from './git'
import { AgentManager } from './agent'
import type { BackendManager } from './backend'
import { appendMessage, closeDb, createSession, listMessages } from './db'
import { TerminalManager } from './terminal'
import type { AgentEvent } from '@shared/contracts'

type PostgresHandle = { stop: () => Promise<void> }

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    )
  ])
}

export async function runSmoke(
  pg: PostgresHandle,
  backend: BackendManager
): Promise<void> {
  console.log('[smoke] Electron desktop smoke starting')
  try {
    const session = await createSession({ title: 'Smoke', workspace: '' })
    const message = await appendMessage({
      sessionId: session.id,
      role: 'user',
      content: 'ping',
      attachments: [
        {
          id: 'smoke-image',
          name: 'smoke.png',
          dataUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg=='
        }
      ]
    })
    const messages = await listMessages(session.id)
    if (messages.length !== 1 || messages[0]?.id !== message.id) {
      throw new Error('PostgreSQL round-trip failed')
    }
    if (
      nativeImage.createFromDataURL(message.attachments![0].dataUrl).isEmpty()
    )
      throw new Error('Native pasted image decoding failed')
    if (messages[0]?.attachments?.[0]?.id !== 'smoke-image')
      throw new Error('Image attachment persistence failed')
    await appendMessage({
      sessionId: session.id,
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'git-status',
          name: 'git_status',
          status: 'done',
          output: 'clean'
        }
      ]
    })
    const history = await listMessages(session.id)
    if (
      history.find((entry) => entry.role === 'assistant')?.toolCalls?.[0]
        ?.output !== 'clean'
    ) {
      throw new Error('Tool activity persistence failed')
    }
    console.log('[smoke] postgres, image and tool activity persistence ok')

    const project = await mkdtemp(path.join(os.tmpdir(), 'vexnar-git-smoke-'))
    let worktree: string | undefined
    const git = simpleGit(project)
    try {
      await git.raw(['init', '-b', 'main'])
      await git.raw([
        '-c',
        'user.name=VEXNAR Smoke',
        '-c',
        'user.email=smoke@example.invalid',
        'commit',
        '--allow-empty',
        '-m',
        'fixture'
      ])
      worktree = await createChatWorktree(project, 'main')
      const original = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim()
      const linked = (
        await simpleGit(worktree).revparse(['--abbrev-ref', 'HEAD'])
      ).trim()
      if (original !== 'main' || !linked.startsWith('vexnar/'))
        throw new Error('Worktree branch isolation failed')
      console.log('[smoke] isolated git worktree ok')
    } finally {
      if (worktree) await git.raw(['worktree', 'remove', worktree])
      await rm(project, { recursive: true, force: true })
    }

    const backendStatus = await backend.status()
    if (!backendStatus.connected) {
      throw new Error(
        `Go backend health failed: ${backendStatus.error ?? 'unknown'}`
      )
    }
    console.log('[smoke] Go backend ok')
    const previous = (await backend.request({
      path: '/settings',
      method: 'GET'
    })) as { workers: number }
    const saved = (await backend.request({
      path: '/settings',
      method: 'PUT',
      body: { workers: 4 }
    })) as { workers: number }
    const reread = (await backend.request({
      path: '/settings',
      method: 'GET'
    })) as { workers: number }
    if (saved.workers !== 4 || reread.workers !== 4)
      throw new Error('Backend settings round-trip failed')
    await backend.request({
      path: '/settings',
      method: 'PUT',
      body: { workers: previous.workers }
    })
    console.log('[smoke] Go settings read/write ok')
    const before = (await backend.request({
      path: '/desktop/preferences',
      method: 'GET'
    })) as { access_mode: string }
    await backend.request({
      path: '/desktop/preferences',
      method: 'PUT',
      body: { access_mode: 'request' }
    })
    const policy = (await backend.request({
      path: '/desktop/preferences',
      method: 'GET'
    })) as { access_mode: string }
    if (policy.access_mode !== 'request')
      throw new Error('Access mode persistence failed')
    try {
      await backend.request({
        path: '/desktop/openai/v1/chat/completions',
        method: 'POST',
        body: { messages: [] }
      })
      throw new Error('Gateway bypassed approval')
    } catch (error) {
      if (!String(error).includes('批准模型联网请求')) throw error
    }
    await backend.request({
      path: '/desktop/preferences',
      method: 'PUT',
      body: { access_mode: before.access_mode }
    })
    console.log('[smoke] Go access preference and approval gate ok')

    let ptyData = ''
    let ptyResolve: (() => void) | null = null
    const ptyDone = new Promise<void>((resolve) => {
      ptyResolve = resolve
    })
    const terminal = new TerminalManager({
      onData: (event) => {
        ptyData += event.data
        if (ptyData.includes('VEXNAR_PTY_OK')) ptyResolve?.()
      },
      onExit: () => undefined
    })
    const { id } = terminal.create({ cols: 80, rows: 24 })
    terminal.write(id, "printf 'VEXNAR_PTY_OK\\n'\r")
    await withTimeout(ptyDone, 10_000, 'PTY')
    terminal.dispose(id)
    terminal.disposeAll()
    console.log('[smoke] pty ok')

    let doneResolve: (() => void) | null = null
    const agentDone = new Promise<void>((resolve) => {
      doneResolve = resolve
    })
    const agent = new AgentManager((event: AgentEvent) => {
      if (event.type === 'assistant_delta') process.stdout.write(event.text)
      if (event.type === 'assistant_done') doneResolve?.()
      if (event.type === 'error')
        console.error(`[smoke] agent error: ${event.message}`)
    }, backend)
    await agent.send({ sessionId: session.id, text: 'smoke' })
    await withTimeout(agentDone, 15_000, 'Agent Runtime')
    agent.dispose()
    console.log('\n[smoke] agent runtime ok')

    await closeDb()
    await backend.stop()
    await pg.stop()
    console.log('[smoke] ok')
    app.exit(0)
  } catch (error) {
    console.error('[smoke] failed', error)
    await closeDb().catch(() => undefined)
    await backend.stop().catch(() => undefined)
    await pg.stop().catch(() => undefined)
    app.exit(1)
  }
}
