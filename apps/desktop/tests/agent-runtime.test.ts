// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { fork, type ChildProcess } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentEvent } from '@shared/contracts'

const runtimePath = path.resolve(process.cwd(), 'src/agent-runtime/index.cjs')
const children: ChildProcess[] = []

function startRuntime(): ChildProcess {
  const child = fork(runtimePath, [], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  })
  children.push(child)
  return child
}

function waitForEvent(
  child: ChildProcess,
  predicate: (event: AgentEvent) => boolean,
  timeoutMs = 8000
): Promise<AgentEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('timed out waiting for agent event'))
    }, timeoutMs)
    const onMessage = (message: AgentEvent): void => {
      if (!predicate(message)) return
      cleanup()
      resolve(message)
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    const cleanup = (): void => {
      clearTimeout(timer)
      child.off('message', onMessage)
      child.off('error', onError)
    }
    child.on('message', onMessage)
    child.on('error', onError)
  })
}

afterEach(() => {
  for (const child of children.splice(0)) {
    if (child.connected) child.disconnect()
    child.kill()
  }
})

describe('agent runtime', () => {
  it('runs the local tool loop and streams a completed answer', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'vexnar-agent-test-'))
    await mkdir(path.join(workspace, 'src'))
    await writeFile(path.join(workspace, 'src', 'hello.ts'), 'export const hello = 1\n')

    const child = startRuntime()
    const ready = waitForEvent(child, (event) => event.type === 'ready')
    await ready
    child.send({
      type: 'init',
      workspace,
      model: 'test-model',
      baseUrl: '',
      apiKey: ''
    })
    child.send({ type: 'user_message', sessionId: 's1', text: 'inspect the workspace' })

    const seen: AgentEvent[] = []
    const onMessage = (event: AgentEvent): void => {
      seen.push(event)
    }
    child.on('message', onMessage)

    const done = await waitForEvent(child, (event) => event.type === 'assistant_done')
    child.off('message', onMessage)

    expect(done.type).toBe('assistant_done')
    expect(seen.some((event) => event.type === 'assistant_delta')).toBe(true)
    expect(
      seen.some((event) => event.type === 'tool_start' && event.name === 'list_files')
    ).toBe(true)
    expect(
      seen.some(
        (event) => event.type === 'tool_end' && event.name === 'list_files' && event.ok
      )
    ).toBe(true)
  }, 15000)
})
