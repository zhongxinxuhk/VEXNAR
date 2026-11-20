// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackendManager } from '../src/main/backend'
const mocks = vi.hoisted(() => ({ confirm: vi.fn() }))
vi.mock('electron', () => ({ app: {}, dialog: { showMessageBox: mocks.confirm } }))
vi.mock('../src/main/db', () => ({ listSessions: async () => [{ id: 'session', workspace: '/fixture/project' }] }))
vi.mock('../src/main/settings', () => ({ getSettings: () => ({ workspaceRoot: '/other-project', model: 'vision' }) }))
import { AgentManager } from '../src/main/agent'
beforeEach(() => mocks.confirm.mockReset())

function fixture(): AgentManager {
  const backend = { request: vi.fn(async () => ({ access_mode: 'request' })) } as unknown as BackendManager
  return new AgentManager(() => undefined, backend)
}
describe('native per-send consent', () => {
  it('does not start inference when consent is declined and releases its lock', async () => {
    mocks.confirm.mockResolvedValueOnce({ response: 0 })
    const agent = fixture()
    await expect(agent.send({ sessionId: 'session', text: 'private message' })).rejects.toThrow('已取消模型联网请求')
    expect(mocks.confirm).toHaveBeenCalled()
    expect(agent.isBusy()).toBe(false)
    agent.dispose()
  })
  it('locks repeated sends while the consent dialog is still open', async () => {
    let decline: (result: { response: number }) => void = () => undefined
    mocks.confirm.mockImplementationOnce(() => new Promise((resolve) => { decline = resolve }))
    const agent = fixture()
    const pending = agent.send({ sessionId: 'session', text: 'first' })
    const rejected = expect(pending).rejects.toThrow('已取消')
    await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalled())
    await expect(agent.send({ sessionId: 'session', text: 'second' })).rejects.toThrow('仍在运行')
    decline({ response: 0 })
    await rejected
    expect(agent.isBusy()).toBe(false)
    agent.dispose()
  })
})
