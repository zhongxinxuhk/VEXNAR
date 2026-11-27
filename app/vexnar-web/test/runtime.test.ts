// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { startWebRuntime } from '../src/index.ts'

test('mcp:false 只启动进程内引擎，不监听 8792、不生成 MCP token', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vexnar-web-runtime-'))
  const runtime = await startWebRuntime({
    root,
    mcp: false,
    token: 'should-not-be-used'
  })
  try {
    assert.equal(runtime.mcp, null)
    assert.equal(runtime.mcpUrl, '')
    assert.equal(runtime.tokenSource, '')
    assert.equal(existsSync(join(root, 'mcp.token')), false)
    assert.ok(runtime.engine)
  } finally {
    await runtime.stop()
    rmSync(root, { recursive: true, force: true })
  }
})