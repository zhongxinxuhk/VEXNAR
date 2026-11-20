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
    const workspace = await mkdtemp(
      path.join(os.tmpdir(), 'vexnar-agent-test-')
    )
    await mkdir(path.join(workspace, 'src'))
    await writeFile(
      path.join(workspace, 'src', 'hello.ts'),
      'export const hello = 1\n'
    )

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
    child.send({
      type: 'user_message',
      sessionId: 's1',
      text: 'inspect the workspace'
    })

    const seen: AgentEvent[] = []
    const onMessage = (event: AgentEvent): void => {
      seen.push(event)
    }
    child.on('message', onMessage)

    const done = await waitForEvent(
      child,
      (event) => event.type === 'assistant_done'
    )
    child.off('message', onMessage)

    expect(done.type).toBe('assistant_done')
    expect(seen.some((event) => event.type === 'assistant_delta')).toBe(true)
    expect(
      seen.some(
        (event) => event.type === 'tool_start' && event.name === 'list_files'
      )
    ).toBe(true)
    expect(
      seen.some(
        (event) =>
          event.type === 'tool_end' && event.name === 'list_files' && event.ok
      )
    ).toBe(true)
  }, 15000)
})

it('sends pasted image content and approval through the configured loopback gateway', async () => {
  const { createServer } = await import('node:http')
  let captured: Record<string, any> | null = null
  const gateway = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const part of request) chunks.push(Buffer.from(part))
    captured = {
      body: JSON.parse(Buffer.concat(chunks).toString()),
      approved: request.headers['x-vexnar-user-approved']
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.end(
      'data: {"choices":[{"delta":{"content":"image accepted"}}]}\n\ndata: {"usage":{"prompt_tokens":72}}\n\ndata: [DONE]\n\n'
    )
  })
  await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve))
  try {
    const address = gateway.address() as { port: number }
    const child = startRuntime()
    await waitForEvent(child, (event) => event.type === 'ready')
    child.send({
      type: 'init',
      workspace: '/fixture/project',
      model: 'vision',
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      apiKey: 'loopback-fixture'
    })
    const done = waitForEvent(child, (event) => event.type === 'assistant_done')
    const usage = waitForEvent(child, (event) => event.type === 'context_usage')
    child.send({
      type: 'user_message',
      sessionId: 'image',
      text: 'describe',
      accessMode: 'request',
      networkApproved: true,
      reasoningEffort: 'high',
      attachments: [
        {
          id: 'png',
          name: 'paste.png',
          dataUrl: 'data:image/png;base64,aGVsbG8='
        }
      ]
    })
    const [usageEvent] = await Promise.all([usage, done])
    expect(usageEvent).toMatchObject({ type: 'context_usage', model: 'vision', promptTokens: 72 })
    expect(captured).not.toBeNull()
    const result = captured as unknown as Record<string, any>
    expect(result.body.reasoning_effort).toBe('high')
    expect(result.body.stream_options).toEqual({ include_usage: true })
    expect(result.approved).toBe('1')
    expect(result.body.messages[1].content).toEqual([
      { type: 'text', text: 'describe' },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,aGVsbG8=' }
      }
    ])
    expect(result.body.messages[0].content).toContain('/fixture/project')
    captured = null
    const denied = waitForEvent(child, (event) => event.type === 'error')
    child.send({
      type: 'user_message',
      sessionId: 'denied',
      text: 'do not send',
      accessMode: 'request',
      networkApproved: false
    })
    expect(await denied).toMatchObject({
      type: 'error',
      message: '模型联网请求尚未批准'
    })
    expect(captured).toBeNull()
  } finally {
    gateway.closeAllConnections()
    gateway.close()
  }
})
