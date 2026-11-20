// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { app } from 'electron'
import { AgentManager } from './agent'
import { appendMessage, closeDb, createSession, listMessages } from './db'
import { TerminalManager } from './terminal'
import type { AgentEvent } from '@shared/contracts'

type PostgresHandle = { stop: () => Promise<void> }

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))
  ])
}

export async function runSmoke(pg: PostgresHandle): Promise<void> {
  console.log('[smoke] Electron desktop smoke starting')
  try {
    const session = await createSession({ title: 'Smoke', workspace: '' })
    const message = await appendMessage({
      sessionId: session.id,
      role: 'user',
      content: 'ping'
    })
    const messages = await listMessages(session.id)
    if (messages.length !== 1 || messages[0]?.id !== message.id) {
      throw new Error('PostgreSQL round-trip failed')
    }
    console.log('[smoke] postgres ok')

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
      if (event.type === 'error') console.error(`[smoke] agent error: ${event.message}`)
    })
    agent.send({ sessionId: session.id, text: 'smoke' })
    await withTimeout(agentDone, 15_000, 'Agent Runtime')
    agent.dispose()
    console.log('\n[smoke] agent runtime ok')

    await closeDb()
    await pg.stop()
    console.log('[smoke] ok')
    app.exit(0)
  } catch (error) {
    console.error('[smoke] failed', error)
    await closeDb().catch(() => undefined)
    await pg.stop().catch(() => undefined)
    app.exit(1)
  }
}
