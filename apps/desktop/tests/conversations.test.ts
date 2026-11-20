// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import {
  lastTurnUsage,
  parseUserActivity,
  toChatMessages,
  toSession,
  type BackendActivity
} from '@/lib/conversations'

let seq = 0
const step = (over: Partial<BackendActivity>): BackendActivity => ({
  seq: ++seq,
  worker: 'auto',
  ts: new Date(1_700_000_000_000 + seq).toISOString(),
  kind: 'text',
  summary: '',
  ...over
})

describe('parseUserActivity', () => {
  it('reads the {text, attachments} detail JSON stored for uploaded files', () => {
    const parsed = parseUserActivity(
      step({
        kind: 'user',
        summary: '报告.pdf',
        detail: JSON.stringify({
          text: '分析这个报告',
          attachments: [{ name: '报告.pdf', path: 'uploads/报告.pdf', size: 42 }]
        })
      })
    )
    expect(parsed.text).toBe('分析这个报告')
    expect(parsed.files).toEqual([{ name: '报告.pdf', size: 42 }])
  })

  it('treats a plain-text detail as the message body', () => {
    expect(parseUserActivity(step({ kind: 'user', detail: '你好' }))).toEqual({
      text: '你好',
      files: []
    })
  })

  it('falls back to summary when detail was not loaded', () => {
    expect(parseUserActivity(step({ kind: 'user', summary: '仅摘要' })).text).toBe('仅摘要')
  })
})

describe('toChatMessages', () => {
  it('rebuilds user + assistant bubbles and pairs tool calls with results', () => {
    const messages = toChatMessages(
      [
        step({
          kind: 'user',
          detail: JSON.stringify({ text: '看下目录', attachments: [{ name: 'a.png', size: 1 }] })
        }),
        step({ kind: 'thinking', detail: '先列目录' }),
        step({
          kind: 'tool_use',
          tool: 'Bash',
          tool_use_id: 'tool-1',
          summary: 'Bash ls',
          detail: '{"command":"ls"}'
        }),
        step({ kind: 'tool_result', tool: 'Bash', tool_use_id: 'tool-1', detail: 'a.png\n' }),
        step({ kind: 'text', summary: '目录里有 a.png', detail: '目录里有 a.png' }),
        step({ kind: 'result', input_tokens: 12 })
      ],
      '7'
    )

    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({
      role: 'user',
      content: '看下目录',
      files: [{ name: 'a.png', size: 1 }]
    })
    const assistant = messages[1]
    expect(assistant.role).toBe('assistant')
    expect(assistant.content).toBe('目录里有 a.png')
    expect(assistant.sessionId).toBe('7')
    const tool = assistant.toolCalls?.find((call) => call.id === 'tool-1')
    expect(tool).toMatchObject({ name: 'Bash', status: 'done', output: 'a.png\n' })
    expect(tool?.input).toEqual({ command: 'ls' })
    expect(assistant.toolCalls?.some((call) => call.name === '思考')).toBe(true)
  })

  it('marks a failed turn from the terminal error result', () => {
    const messages = toChatMessages(
      [
        step({ kind: 'user', detail: 'hi' }),
        step({ kind: 'result', is_error: true, summary: '执行出错: 401', detail: '执行出错: 401' })
      ],
      '3'
    )
    expect(messages[1]).toMatchObject({ role: 'assistant', failed: true })
    expect(messages[1].content).toContain('401')
  })
})

describe('lastTurnUsage', () => {
  it('returns the newest result step token count', () => {
    const usage = lastTurnUsage([
      step({ kind: 'result', input_tokens: 10 }),
      step({ kind: 'text' }),
      step({ kind: 'result', input_tokens: 42 })
    ])
    expect(usage).toEqual({ promptTokens: 42 })
  })

  it('returns null when no terminal usage was recorded', () => {
    expect(lastTurnUsage([step({ kind: 'text' })])).toBeNull()
  })
})

describe('toSession', () => {
  it('maps the shared conversation row onto the sidebar session shape', () => {
    const session = toSession(
      {
        id: 9,
        agent_key: 'auto',
        title: '排查 XSS',
        pinned: true,
        created_at: '2026-11-20T10:00:00Z',
        updated_at: '2026-11-20T10:05:00Z'
      },
      '/work'
    )
    expect(session).toMatchObject({
      id: '9',
      title: '排查 XSS',
      workspace: '/work',
      pinned: true
    })
    expect(session.updatedAt).toBeGreaterThan(session.createdAt)
  })
})
