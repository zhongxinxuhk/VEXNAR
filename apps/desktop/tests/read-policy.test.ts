// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { it, expect } from 'vitest'
const { resolveReadPath } = createRequire(import.meta.url)(
  '../src/agent-runtime/read-policy.cjs'
)
it('requires approval for actual outside paths including symlinks; full access allows reads', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vexnar-read-policy-'))
  try {
    const workspace = path.join(root, 'workspace')
    const external = path.join(root, 'outside.txt')
    await mkdir(workspace)
    await writeFile(external, 'fixture')
    await symlink(external, path.join(workspace, 'link.txt'))
    let asked = 0
    const deny = async () => {
      asked++
      return false
    }
    await expect(
      resolveReadPath(workspace, '.', 'balanced', deny)
    ).resolves.toBe(
      await import('node:fs/promises').then((fs) => fs.realpath(workspace))
    )
    expect(asked).toBe(0)
    await expect(
      resolveReadPath(workspace, 'link.txt', 'balanced', deny)
    ).rejects.toThrow('未批准')
    expect(asked).toBe(1)
    await expect(
      resolveReadPath(workspace, '../outside.txt', 'request', async () => true)
    ).resolves.toContain('outside.txt')
    await expect(
      resolveReadPath(workspace, 'link.txt', 'full', deny)
    ).resolves.toContain('outside.txt')
    expect(asked).toBe(1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
