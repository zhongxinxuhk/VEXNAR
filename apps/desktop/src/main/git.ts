// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { promises as fs } from 'node:fs'
import { simpleGit } from 'simple-git'
import type { DiffPayload, GitStatus } from '@shared/contracts'
import { ensureInside, isProbablyBinary, languageFor, relativeTo } from './paths'
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
    modified = isProbablyBinary(buffer) ? '[binary file]' : buffer.toString('utf8')
  } catch {
    modified = ''
  }

  return { path: rel, original, modified, language: languageFor(rel) }
}
