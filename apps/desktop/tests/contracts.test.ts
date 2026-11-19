import { describe, expect, it } from 'vitest'
import {
  agentEventSchema,
  messageAppendSchema,
  publicSettingsSchema,
  sessionCreateSchema,
  settingsSchema
} from '@shared/contracts'

describe('settings contracts', () => {
  it('applies desktop defaults', () => {
    const settings = settingsSchema.parse({})
    expect(settings.theme).toBe('dark')
    expect(settings.workspaceRoot).toBe('')
    expect(settings.model).toBe('gpt-5-codex')
    expect(settings.baseUrl).toBe('')
  })

  it('keeps the API key out of public settings', () => {
    const publicSettings = publicSettingsSchema.parse({
      theme: 'system',
      model: 'local-model',
      hasApiKey: true
    })
    expect(publicSettings.hasApiKey).toBe(true)
    expect('apiKey' in publicSettings).toBe(false)
  })

  it('rejects an empty model', () => {
    expect(settingsSchema.safeParse({ model: '   ' }).success).toBe(false)
  })
})

describe('session and message contracts', () => {
  it('defaults a new session title and workspace', () => {
    const session = sessionCreateSchema.parse({})
    expect(session.title).toBe('New chat')
    expect(session.workspace).toBe('')
  })

  it('requires message content', () => {
    expect(
      messageAppendSchema.safeParse({ sessionId: 's1', role: 'user', content: '' }).success
    ).toBe(false)
  })
})

describe('agent event contract', () => {
  it('accepts the runtime event union', () => {
    const events = [
      { type: 'ready' },
      { type: 'assistant_delta', text: 'hello' },
      { type: 'assistant_done' },
      { type: 'tool_start', id: 't1', name: 'list_files', input: { depth: 2 } },
      { type: 'tool_end', id: 't1', name: 'list_files', ok: true, output: 'src/' },
      { type: 'error', message: 'boom' }
    ]
    for (const event of events) {
      expect(agentEventSchema.safeParse(event).success).toBe(true)
    }
  })

  it('rejects unknown events', () => {
    expect(agentEventSchema.safeParse({ type: 'mystery' }).success).toBe(false)
  })
})
