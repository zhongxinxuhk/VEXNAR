// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Session } from '@shared/contracts'
import type { BackendProject } from './conversations'
import { basename } from './utils'

export type SidebarProject = { id: string; name: string; rootPath: string; sessions: Session[]; updatedAt: number }

export function sessionNavigation(
  sessions: Session[], catalog: BackendProject[], pinOrder: string[], sortMode: 'recent' | 'name'
): { pinned: Session[]; recent: Session[]; projects: SidebarProject[] } {
  const ordered = sessions.filter((row) => !row.pendingFirstSend).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
  const projects = new Map<string, SidebarProject>()
  for (const project of catalog) {
    projects.set(project.id, {
      id: project.id, name: project.name, rootPath: project.root_path, sessions: [], updatedAt: 0
    })
  }
  const recent: Session[] = []
  const pins = new Map<string, Session>()
  for (const session of ordered) {
    if (session.pinned) pins.set(session.id, session)
    if (!session.projectId) {
      if (!session.pinned) recent.push(session)
      continue
    }
    let project = projects.get(session.projectId)
    if (!project) {
      project = {
        id: session.projectId, name: basename(session.workspace) || session.projectId,
        rootPath: session.workspace, sessions: [], updatedAt: 0
      }
      projects.set(project.id, project)
    }
    project.updatedAt = Math.max(project.updatedAt, session.updatedAt)
    if (!session.pinned) project.sessions.push(session)
  }
  const pinned: Session[] = []
  for (const id of pinOrder) {
    const row = pins.get(id)
    if (row) {
      pinned.push(row)
      pins.delete(id)
    }
  }
  pinned.unshift(...[...pins.values()].sort((a, b) =>
    (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0) || a.id.localeCompare(b.id)
  ))
  return {
    pinned, recent,
    projects: [...projects.values()].sort((a, b) =>
      (sortMode === 'recent' ? b.updatedAt - a.updatedAt : 0) ||
      a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  }
}

export function movePinned(ids: string[], id: string, offset: -1 | 1): string[] {
  const index = ids.indexOf(id)
  const destination = index + offset
  if (index < 0 || destination < 0 || destination >= ids.length) return ids
  const next = [...ids]
  ;[next[index], next[destination]] = [next[destination], next[index]]
  return next
}

export const SESSION_PREVIEW_SIZE = 5

export function visibleSessionPreview(sessions: Session[], limit: number, activeId: string | null): Session[] {
  let watermark = limit
  for (const [index, session] of sessions.entries()) {
    if (session.id === activeId || (session.running && index < 50)) watermark = Math.max(watermark, index + 1)
  }
  return sessions.slice(0, watermark)
}
