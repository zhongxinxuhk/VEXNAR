// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 默认目录注册的行为测试。
 *
 * 三个承诺必须成立，否则用户会在真实 profile 里丢掉自己的编辑或删掉的 server：
 *   1. 空库启动 → 默认工具与默认 MCP 全部就位；
 *   2. 已经有行 → 一个字都不改（编辑、启停、绑定都是用户的决定）；
 *   3. 显式重新注册 → 只补缺的，不复活也没有覆盖。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_SERVERS, DEFAULT_TOOLS } from '../src/catalog/defaults.ts'
import { defaultTool, registerCatalogDefaults, type MetaTables } from '../src/catalog/register.ts'

/** 内存版 meta：load 返回深拷贝，模拟每次从存储读一遍。 */
function fakeMeta(initial: Record<string, any> = {}): MetaTables & { stored: Record<string, any> } {
  const stored: Record<string, any> = structuredClone(initial)
  return {
    stored,
    async load() { return structuredClone(stored) },
    async save(tables) {
      // 原地覆盖：让测试里持有的 `stored` 引用始终指向当前内容。
      for (const key of Object.keys(stored)) delete stored[key]
      Object.assign(stored, structuredClone(tables))
    },
    reload() {}
  }
}

test('空库首次注册：默认工具与默认 MCP server 全部就位', async () => {
  const meta = fakeMeta()
  const result = await registerCatalogDefaults(meta, { firstRunOnly: true })
  assert.equal(result.toolsAdded, DEFAULT_TOOLS.length)
  assert.equal(result.serversAdded, DEFAULT_SERVERS.length)
  assert.equal(result.toolsTotal, DEFAULT_TOOLS.length)
  assert.equal(result.serversTotal, DEFAULT_SERVERS.length)
  const tools = meta.stored.tools as any[]
  assert.ok(tools.every((row) => row.system === true), '默认工具都是系统工具')
  assert.ok(tools.every((row) => typeof row.key === 'string' && row.key.length > 0))
  const servers = meta.stored.mcp as any[]
  assert.deepEqual(
    servers.map((row) => row.name).sort(),
    DEFAULT_SERVERS.map((row) => row.name).sort()
  )
  assert.equal(new Set(servers.map((row) => row.id)).size, servers.length, 'id 必须唯一')
})

test('第二次启动不重复插入', async () => {
  const meta = fakeMeta()
  await registerCatalogDefaults(meta, { firstRunOnly: true })
  const again = await registerCatalogDefaults(meta, { firstRunOnly: true })
  assert.equal(again.toolsAdded, 0)
  assert.equal(again.serversAdded, 0)
  assert.equal((meta.stored.tools as any[]).length, DEFAULT_TOOLS.length)
})

test('用户编辑过的行不会被覆盖', async () => {
  const first = DEFAULT_TOOLS[0]!
  const meta = fakeMeta({
    tools: [{ ...first, system: true, description: '用户改过的描述', agents: ['worker'], enabled: false }],
    mcp: [],
    settings: { catalogSeeded: true }
  })
  await registerCatalogDefaults(meta, {})
  const row = (meta.stored.tools as any[]).find((item) => item.key === first.key)
  assert.equal(row.description, '用户改过的描述')
  assert.deepEqual(row.agents, ['worker'])
  assert.equal(row.enabled, false)
})

test('删掉的 MCP server 不会被启动补齐，但显式重注册会补回来', async () => {
  const meta = fakeMeta()
  await registerCatalogDefaults(meta, { firstRunOnly: true })
  const removed = (meta.stored.mcp as any[])[0]
  meta.stored.mcp = (meta.stored.mcp as any[]).filter((row) => row.id !== removed.id)

  const boot = await registerCatalogDefaults(meta, { firstRunOnly: true })
  assert.equal(boot.serversAdded, 0, '启动路径不该复活用户删掉的 server')
  assert.equal((meta.stored.mcp as any[]).length, DEFAULT_SERVERS.length - 1)

  const explicit = await registerCatalogDefaults(meta, { only: 'mcp' })
  assert.equal(explicit.serversAdded, 1)
  assert.equal((meta.stored.mcp as any[]).length, DEFAULT_SERVERS.length)
})

test('只注册工具时不动 MCP', async () => {
  const meta = fakeMeta()
  const result = await registerCatalogDefaults(meta, { only: 'tools' })
  assert.ok(result.toolsAdded > 0)
  assert.equal(result.serversAdded, 0)
  assert.equal((meta.stored.mcp ?? []).length, 0)
})

test('reset 用的出厂定义存在且带 schema', () => {
  const sample = defaultTool('add_company_scope') ?? defaultTool(DEFAULT_TOOLS[0]!.key)
  assert.ok(sample, '内置工具必须能在默认清单里查到')
  assert.ok(sample.schema && typeof sample.schema === 'object')
  assert.equal(defaultTool('definitely_not_a_tool'), undefined)
})
