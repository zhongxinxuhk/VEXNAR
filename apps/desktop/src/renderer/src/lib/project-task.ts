// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

export type ProjectTask = {
  id: string
  name: string
  description: string
  goal: string
  status: string
  paused: boolean
  queued: boolean
  pinned: boolean
}

export type ProjectTaskFocus = {
  workspace: string
  projectId: string
  projectName: string
  task: ProjectTask
  sessionKey: string
  sessionTitle?: string
}

export function projectTaskRoute(projectId: string, taskId?: string): string {
  const list = `/desktop/projects/${projectId}/tasks`
  return taskId === undefined ? list : `${list}/${taskId}`
}

export function projectTaskTitle(task: ProjectTask): string {
  return task.name || task.description || `#${task.id}`
}

export function projectTaskStatus(task: ProjectTask): string {
  return task.paused ? 'paused' : task.queued ? 'queued' : task.status
}
