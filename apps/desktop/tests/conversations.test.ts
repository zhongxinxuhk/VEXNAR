// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { describeToolPayload } from '@/lib/tool-inspection'
import { parseReplyView } from '@/lib/reply-view'
import { executionGroup } from '@/lib/execution-groups'
import {
  lastTurnUsage,
  mergeActivities,
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
    expect(tool).toMatchObject({ name: 'Bash', status: 'done' })
    expect(tool).not.toHaveProperty('input')
    expect(tool).not.toHaveProperty('output')
    expect(assistant.toolCalls).toHaveLength(1)
    expect(JSON.stringify(assistant)).not.toContain('先列目录')
  })

  it('derives signed-off turn duration only from the observed user and terminal events', () => {
    const user = step({ kind: 'user', ts: '2026-11-20T10:00:00Z' })
    const text = step({ kind: 'text', worker: 'reviewer', detail: '完成' })
    const result = step({ kind: 'result', ts: '2026-11-20T10:00:05Z' })
    const expected = {
      worker: 'reviewer',
      startedAt: Date.parse(user.ts),
      completedAt: Date.parse(result.ts)
    }
    expect(toChatMessages([user, text, result], '1')[1].execution).toMatchObject(expected)
    expect(toChatMessages([text, result], '1')[0].execution?.startedAt).toBeUndefined()
    expect(toChatMessages([user, text], '1')[1].execution?.completedAt).toBeUndefined()
  })

  it('preserves the last responding model in each turn without assigning old records a label', () => {
    const first = step({ kind: 'user' })
    const initialModel = step({ kind: 'model', summary: 'model-a' })
    const finalModel = step({ kind: 'model', summary: 'model-b' })
    const final = step({ kind: 'text', detail: '答复' })
    const end = step({ kind: 'result' })
    const oldMessage = step({ kind: 'user' })
    const oldAnswer = step({ kind: 'text', detail: '旧答复' })
    const messages = toChatMessages([first, initialModel, finalModel, final, end, oldMessage, oldAnswer], '1')
    expect(messages[1].execution?.model).toBe('model-b')
    expect(messages[1].content).toBe('答复')
    expect(messages[3].execution?.model).toBeUndefined()
  })

  it('keeps recorded partial replies and separates explicit stops from failures', () => {
    const user = step({ kind: 'user', detail: 'fixture' })
    const partial = step({ kind: 'text', detail: '已有部分答复' })
    const cancelled = step({ kind: 'result', outcome: 'cancelled', is_error: true, detail: 'diagnostic output' })
    const reply = toChatMessages([user, partial, cancelled], '1')[1]
    expect(reply.content).toBe('已有部分答复')
    expect(reply.execution?.cancelled).toBe(true)
    expect(reply.failed).toBeUndefined()
    expect(toChatMessages([user, cancelled], '1')[1].execution?.cancelled).toBe(true)
  })

  it('derives visible phases from observed events without displaying their private text', () => {
    const user = step({ kind: 'user' })
    const reasoning = step({ kind: 'thinking', summary: 'private', detail: 'secret thoughts' })
    const tool = step({ kind: 'tool_use', tool_use_id: 'read-1' })
    const reply = step({ kind: 'text', detail: '公开答复' })
    const flow = [user, reasoning, tool, reply]
    const phases = [2, 3, 4].map((limit) => toChatMessages(flow.slice(0, limit), 'turn')[1])
    expect(phases.map((row) => row.execution?.phase)).toEqual(['reasoning', 'tools', 'answer'])
    expect(JSON.stringify(phases)).not.toContain('secret thoughts')
  })

  it('preserves public text, reasoning markers and distinct call groups in transcript order', () => {
    const first = step({ kind: 'thinking', detail: 'secret raw chain' })
    const call1 = step({ kind: 'tool_use', tool_use_id: 'read-1' })
    const narration = step({ kind: 'text', detail: '检查目录。' })
    const later = step({ kind: 'thinking', detail: 'more secret reasoning' })
    const call2 = step({ kind: 'tool_use', tool_use_id: 'read-2' })
    const result = step({ kind: 'tool_result', tool_use_id: 'read-1' })
    const final = step({ kind: 'result', detail: '目录存在。' })
    const [message] = toChatMessages([first, call1, narration, later, call2, result, final], '1')
    expect(message.flow?.map((row) => [row.kind, row.sequence])).toEqual([
      ['reasoning', first.seq], ['calls', call1.seq], ['text', narration.seq],
      ['reasoning', later.seq], ['calls', call2.seq], ['text', final.seq]
    ])
    expect(message.flow?.[1]).toMatchObject({ calls: [{ status: 'done' }] })
    expect(JSON.stringify(message.flow)).not.toContain('secret')
  })

  it('preserves the assistant identity when a private reasoning row becomes an answer', () => {
    const user = step({ kind: 'user', detail: '你好' })
    const first = step({ kind: 'thinking', summary: 'private summary', detail: 'private detail' })
    const waiting = toChatMessages([user, first], '1')[1]
    const replied = toChatMessages([user, first, step({ kind: 'text', detail: '你好！' })], '1')[1]
    expect(waiting).toMatchObject({ id: replied.id, content: '', toolCalls: [] })
    expect(replied.content).toBe('你好！')
    expect(JSON.stringify(waiting)).not.toContain('private')
  })

  it('pairs out-of-order results with their own calls and does not cross turn boundaries', () => {
    const messages = toChatMessages(
      [
        step({ kind: 'tool_use', tool: 'stat_file', tool_use_id: 'a' }),
        step({ kind: 'tool_use', tool: 'read_file', tool_use_id: 'b' }),
        step({ kind: 'tool_result', tool_use_id: 'b', detail: 'missing file', is_error: true }),
        step({ kind: 'tool_result', tool_use_id: 'a', detail: 'regular file' }),
        step({ kind: 'result' }),
        step({ kind: 'user', detail: '检查另一个文件' }),
        step({ kind: 'tool_result', tool_use_id: 'a', detail: 'unmatched tool result' }),
        step({ kind: 'text', detail: '完成' })
      ],
      '3'
    )
    expect(messages[0].toolCalls).toMatchObject([
      { id: 'a', status: 'done' },
      { id: 'b', status: 'error' }
    ])
    expect(messages[2].toolCalls).toEqual([])
    expect(messages[0].toolEvents).toMatchObject([
      { tool: 'stat_file', outcome: 'invoked' },
      { tool: 'read_file', outcome: 'invoked' },
      { tool: 'read_file', outcome: 'error' },
      { tool: 'stat_file', outcome: 'done' }
    ])
    const events = messages[0].toolEvents!
    expect(events[2].relatedCallSequence).toBe(events[1].sequence)
    expect(events[3].relatedCallSequence).toBe(events[0].sequence)
    expect(messages[2].toolEvents).toMatchObject([{ outcome: 'done', relatedCallSequence: undefined }])
  })

  it('keeps duplicate call IDs isolated by worker and surfaces ambiguous results without guessing', () => {
    const a = step({ kind: 'tool_use', worker: 'a', tool: 'read_file', tool_use_id: 'shared' })
    const b = step({ kind: 'tool_use', worker: 'b', tool: 'read_file', tool_use_id: 'shared' })
    const bResult = step({ kind: 'tool_result', worker: 'b', tool_use_id: 'shared' })
    const wrongWorker = step({ kind: 'tool_result', worker: 'c', tool_use_id: 'shared' })
    const aResult = step({ kind: 'tool_result', worker: '', tool_use_id: 'shared' })
    const duplicate1 = step({ kind: 'tool_use', worker: 'a', tool_use_id: 'ambiguous' })
    const duplicate2 = step({ kind: 'tool_use', worker: 'a', tool_use_id: 'ambiguous' })
    const ambiguous = step({ kind: 'tool_result', worker: 'a', tool_use_id: 'ambiguous' })
    const [message] = toChatMessages([a, b, bResult, wrongWorker, aResult, duplicate1, duplicate2, ambiguous], '1')
    expect(message.toolEvents?.[2].relatedCallSequence).toBe(b.seq)
    expect(message.toolEvents?.[3]).toMatchObject({ relation: 'unmatched', relatedCallSequence: undefined })
    expect(message.toolEvents?.[4].relatedCallSequence).toBe(a.seq)
    expect(message.toolEvents?.[7]).toMatchObject({ relation: 'ambiguous', relatedCallSequence: undefined })
    expect(message.toolCalls?.slice(-2).every((call) => !call.finished)).toBe(true)
  })

  it('retains the recorded worker and timestamps when a tool result arrives', () => {
    const call = step({ kind: 'tool_use', worker: 'reviewer', tool_use_id: 'read-1' })
    const result = step({ kind: 'tool_result', worker: 'reviewer', tool_use_id: 'read-1' })
    const live = toChatMessages([call], '3')[0].toolCalls?.[0]
    expect(live).toMatchObject({
      worker: 'reviewer',
      started: { sequence: call.seq, timestamp: call.ts },
      status: 'running'
    })
    expect(live?.finished).toBeUndefined()
    const settled = toChatMessages([call, result], '3')[0].toolCalls?.[0]
    expect(settled).toMatchObject({
      id: live?.id,
      started: live?.started,
      finished: { sequence: result.seq, timestamp: result.ts },
      status: 'done'
    })
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
    expect(messages[1].error).toContain('401')
  })

  it('keeps the upstream error apart from narration that already streamed', () => {
    const error =
      'openai-responses: status 403: {"error":{"code":"insufficient_user_quota","message":"Not enough quota"}}'
    const messages = toChatMessages(
      [
        step({ kind: 'user', detail: 'hi' }),
        step({ kind: 'text', detail: '我先看一下目录。' }),
        step({ kind: 'result', is_error: true, summary: error, detail: error })
      ],
      '4'
    )
    // 部分正文照常显示，403 原文留在 error 上，供配额提示卡识别与「错误详情」展开。
    expect(messages[1].content).toBe('我先看一下目录。')
    expect(messages[1].failed).toBe(true)
    expect(messages[1].error).toContain('insufficient_user_quota')
  })

  // 后端把「与终态文本相同的流式增量」去重掉了，成功回合的正文只落在 result 行
  // （agent/capture.go）。客户端不取 result.detail 就会整轮没有回复。
  it('renders the answer that only exists on the successful result step', () => {
    const messages = toChatMessages(
      [
        step({ kind: 'user', detail: '你好' }),
        step({ kind: 'thinking', detail: 'The user just said "你好" again. Respond briefly.' }),
        step({ kind: 'usage', input_tokens: 10, output_tokens: 5 }),
        step({ kind: 'result', summary: '你好！有什么需要我帮忙的吗？', detail: '你好！有什么需要我帮忙的吗？' })
      ],
      '655'
    )
    expect(messages).toHaveLength(2)
    expect(messages[1].role).toBe('assistant')
    expect(messages[1].content).toBe('你好！有什么需要我帮忙的吗？')
    expect(messages[1].toolCalls).toEqual([])
    expect(JSON.stringify(messages[1])).not.toContain('Respond briefly')
  })

  // 流式回合:正文是 text 行,终态 result 行只带用量。别为一个空 result 再造一条消息。
  it('closes a streamed turn without adding an empty answer', () => {
    const messages = toChatMessages(
      [
        step({ kind: 'user', detail: '你好' }),
        step({ kind: 'text', detail: '你好！我是 Auto。' }),
        step({ kind: 'result', input_tokens: 12, output_tokens: 6 })
      ],
      '10'
    )
    expect(messages).toHaveLength(2)
    expect(messages[1].role).toBe('assistant')
    expect(messages[1].content).toBe('你好！我是 Auto。')
  })

  it('appends the terminal answer after narration but never duplicates it', () => {
    const withNarration = toChatMessages(
      [
        step({ kind: 'user', detail: '看下目录' }),
        step({ kind: 'text', detail: '我先看一下目录。' }),
        step({ kind: 'result', detail: '目录里只有 a.png。' })
      ],
      '8'
    )
    expect(withNarration[1].content).toBe('我先看一下目录。\n\n目录里只有 a.png。')

    const alreadyStreamed = toChatMessages(
      [
        step({ kind: 'user', detail: '看下目录' }),
        step({ kind: 'text', detail: '目录里只有 a.png。' }),
        step({ kind: 'result', detail: '目录里只有 a.png。' })
      ],
      '9'
    )
    expect(alreadyStreamed[1].content).toBe('目录里只有 a.png。')
  })
})

describe('mergeActivities', () => {
  // 流式答复是同一 seq 的一行,文本持续变长。追加会重复,替换才是一份最新的。
  it('replaces a growing row instead of appending it twice', () => {
    const first = mergeActivities([], [step({ kind: 'text', seq: 42, detail: '你' })])
    expect(first).toHaveLength(1)
    const grown = mergeActivities(first, [{ ...first[0], detail: '你好，我是 Auto。' }])
    expect(grown).toHaveLength(1)
    expect(grown[0].detail).toBe('你好，我是 Auto。')
  })

  it('keeps rows ordered by seq and skips empty input', () => {
    const merged = mergeActivities(
      [step({ seq: 5 }), step({ seq: 1 })],
      [null, step({ seq: 3 }), undefined]
    )
    expect(merged.map((row) => row.seq)).toEqual([1, 3, 5])
    expect(mergeActivities(merged, [null, undefined])).toBe(merged)
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
        updated_at: '2026-11-20T10:05:00Z',
        project_id: 3,
        workspace: '/work'
      }
    )
    expect(session).toMatchObject({
      id: '9',
      title: '排查 XSS',
      workspace: '/work',
      projectId: '3',
      pinned: true
    })
    expect(session.updatedAt).toBeGreaterThan(session.createdAt)
  })
})

describe('executionGroup', () => {
  it('groups recorded tool names without inferring a runtime parent or session', () => {
    expect(executionGroup('Skill')).toEqual({ category: 'skill' })
    expect(executionGroup('Bash')).toEqual({ category: 'terminal' })
    expect(executionGroup('mcp__local_files__read')).toEqual({ category: 'mcp', source: 'local_files' })
    expect(executionGroup('mcp__browser__open')).toEqual({ category: 'browser', source: 'browser' })
    expect(executionGroup('mcp__software__inspect_window')).toEqual({ category: 'software', source: 'software' })
    expect(executionGroup('WebFetch')).toEqual({ category: 'api' })
    expect(executionGroup('browser_unknown')).toEqual({ category: 'other' })
  })
})

describe('describeToolPayload', () => {
  it('presents skill and planning records using explicit fields', () => {
    expect(describeToolPayload('Skill', '{"name":"docs"}', 'ack').fields)
      .toEqual([{ key: 'skill', label: 'chat.inspectSkill', value: 'docs' }])
    expect(describeToolPayload('TodoWrite', '{"todos":[{"content":"check","status":"completed"},{"content":"other","status":"unknown"}]}', '').todos)
      .toEqual([{ text: 'check', status: 'chat.inspectTodoDone' }])
  })

  it('keeps terminal streams distinct and displays only explicit session IDs', () => {
    const terminal = describeToolPayload('Bash', '{"command":"ls"}', '{"exit_code":0,"stdout":"files","stderr":"notice"}')
    expect(terminal).toMatchObject({ stdout: 'files', stderr: 'notice' })
    expect(terminal.fields.find((field) => field.key === 'exitCode')?.value).toBe(0)
    expect(describeToolPayload('mcp__browser__navigate', '{"session_id":"transport"}', '').fields)
      .not.toContainEqual(expect.objectContaining({ key: 'session' }))
    expect(describeToolPayload('mcp__software__inspect', '{}', '{"software_session_id":"editor"}').fields)
      .toContainEqual(expect.objectContaining({ key: 'session', value: 'editor' }))
  })
})

describe('parseReplyView', () => {
  it('validates explicit result views and rejects malformed grids', () => {
    expect(parseReplyView('{"kind":"structured-data","title":"Inventory","columns":["File"],"rows":[["README.md"]]}'))
      .toMatchObject({ kind: 'structured-data', rows: [['README.md']] })
    expect(parseReplyView('{"kind":"structured-data","title":"Bad","columns":["File"],"rows":[["README.md",null]]}'))
      .toBeNull()
    expect(parseReplyView('{"kind":"artifact","title":"Unsafe","versions":[{"url":"javascript:alert(1)"}]}'))
      .toBeNull()
    expect(parseReplyView('x'.repeat(256 * 1024 + 1))).toBeNull()
  })
})
