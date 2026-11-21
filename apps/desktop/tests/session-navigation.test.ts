// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import type { Session } from '@shared/contracts'
import { movePinned, sessionNavigation } from '@/lib/session-navigation'

const row = (id: string, fields: Partial<Session> = {}): Session => ({
  id, title: id, workspace: '', projectId: null, createdAt: 0, updatedAt: 0, pinned: false, ...fields
})

describe('project sidebar navigation', () => {
  it('shows empty registered projects and keeps each chat in exactly one section', () => {
    const sessions = [
      row('unassigned', { workspace: '/shared/root', updatedAt: 7 }),
      row('owned', { workspace: '/shared/root', projectId: 'a', updatedAt: 9 }),
      row('pinned', { projectId: 'b', pinned: true, pinnedAt: 3, updatedAt: 10 })
    ]
    const catalog = [
      { id: 'a', name: 'A', root_path: '/shared/root' },
      { id: 'b', name: 'B', root_path: '/work/root' },
      { id: 'c', name: 'C', root_path: '/empty/root' }
    ]
    const sidebar = sessionNavigation(sessions, catalog, [], 'recent')
    expect(sidebar.pinned.map((item) => item.id)).toEqual(['pinned'])
    expect(sidebar.recent.map((item) => item.id)).toEqual(['unassigned'])
    expect(sidebar.projects.map((item) => [item.id, item.sessions.map((session) => session.id)]))
      .toEqual([['b', []], ['a', ['owned']], ['c', []]])
    expect(sessionNavigation(sessions, catalog, [], 'name').projects.map((item) => item.id))
      .toEqual(['a', 'b', 'c'])
  })

  it('orders pins independently of reply timestamps and supports a stable manual move', () => {
    const sessions = [
      row('first', { pinned: true, pinnedAt: 20, updatedAt: 30 }),
      row('second', { pinned: true, pinnedAt: 10, updatedAt: 1000 })
    ]
    const initial = sessionNavigation(sessions, [], [], 'recent').pinned.map((item) => item.id)
    expect(initial).toEqual(['first', 'second'])
    const order = movePinned(initial, 'second', -1)
    expect(sessionNavigation(sessions, [], order, 'recent').pinned.map((item) => item.id)).toEqual(['second', 'first'])
  })
})
