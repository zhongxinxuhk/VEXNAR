// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { simpleGit } from 'simple-git'
import type { DiffPayload, GitStatus } from '@shared/contracts'
import {
  ensureInside,
  isProbablyBinary,
  languageFor,
  relativeTo
} from './paths'
import { getSettings } from './settings'

function root(): string {
  const workspace = getSettings().workspaceRoot
  if (!workspace) throw new Error('尚未选择工作区')
  return workspace
}

export async function gitStatus(): Promise<GitStatus> {
  const baseDir = root()
  const git = simpleGit({ baseDir })
  if (!(await git.checkIsRepo())) throw new Error('当前工作区不是 Git 仓库')
  const status = await git.status()
  return {
    branch: status.current ?? '(detached)',
    ahead: status.ahead,
    behind: status.behind,
    files: status.files.map((file) => ({
      path: file.path,
      index: file.index,
      working: file.working_dir
    }))
  }
}

export async function gitDiff(filePath: string): Promise<DiffPayload> {
  const baseDir = root()
  const absolute = ensureInside(baseDir, filePath)
  const rel = relativeTo(baseDir, absolute)
  const git = simpleGit({ baseDir })

  let original = ''
  try {
    original = await git.show([`HEAD:${rel}`])
  } catch {
    // Untracked files have no HEAD version; show them as an addition.
  }

  let modified = ''
  try {
    const buffer = await fs.readFile(absolute)
    modified = isProbablyBinary(buffer)
      ? '[binary file]'
      : buffer.toString('utf8')
  } catch {
    modified = ''
  }

  return { path: rel, original, modified, language: languageFor(rel) }
}

export async function gitBranches(): Promise<string[]> {
  const refs = await simpleGit({ baseDir: root() }).raw([
    'for-each-ref',
    '--format=%(refname:short)',
    'refs/heads'
  ])
  return refs.split('\n').filter(Boolean)
}

export async function checkoutBranch(branch: string): Promise<{ branch: string }> {
  const name = branch.trim()
  if (!name) throw new Error('分支名不能为空')
  await simpleGit({ baseDir: root() }).raw(['checkout', name])
  return { branch: name }
}

export async function createBranch(branch: string): Promise<{ branch: string }> {
  const name = branch.trim()
  if (!name) throw new Error('分支名不能为空')
  await simpleGit({ baseDir: root() }).raw(['checkout', '-b', name])
  return { branch: name }
}

export async function createChatWorktree(
  baseDir: string,
  branch: string
): Promise<string> {
  if (!baseDir) throw new Error('该会话没有工作区')
  const git = simpleGit({ baseDir })
  const refs = await git.raw([
    'for-each-ref',
    '--format=%(refname:short)',
    'refs/heads'
  ])
  if (!refs.split('\n').includes(branch)) throw new Error('请选择现有本地分支')
  const parent = path.join(app.getPath('userData'), 'worktrees')
  await fs.mkdir(parent, { recursive: true })
  const id = randomUUID()
  const target = path.join(
    parent,
    `${path.basename(baseDir).slice(0, 48)}-${id.slice(0, 8)}`
  )
  await git.raw([
    'worktree',
    'add',
    '-b',
    `vexnar/${id}`,
    target,
    `refs/heads/${branch}`
  ])
  return target
}
