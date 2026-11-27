// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * `/api/_topology` 快照测试。
 *
 * 目标不是“字段存在”，而是锁住三件事：
 *   1. 组合面数字来自 meta（agents/tools/mcp），不是写死的；
 *   2. 存储/监听面的关键事实可核对（sqlite 路径、无 8792 监听、Go 默认关闭）；
 *   3. token 与 DSN 不进入响应。
 */

import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 临时根目录必须在 import context（顶层 openStore/openMeta）之前设置。
const root = await mkdtemp(join(tmpdir(), 'vexnar-topology-'))
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_STORE_ROOT = root
process.env.VEXNAR_RUNTIME_MODE = 'ts'
process.env.VEXNAR_WEB_MCP_PORT = '18792'
process.env.VEXNAR_WEB_MCP_TOKEN = 'super-secret-web-token'
process.env.VEXNAR_DESKTOP_TOKEN = 'super-secret-desktop-token'
delete process.env.VEXNAR_PG_DSN
delete process.env.VEXNAR_PG_URL
delete process.env.VEXNAR_GO
delete process.env.VEXNAR_GO_URL
delete process.env.PORT

const { meta } = await import('./src/context.ts')
await meta.save({
  agents: [
    { key: 'planner', enabled: true },
    { key: 'retester', enabled: false },
    { key: 'lock_agent_1', enabled: true }
  ],
  tools: [
    { key: 'traffic_search', enabled: true, agents: ['mainagent'] },
    { key: 'report_finding', enabled: false, agents: [] },
    { key: 'record_finding_retest_result', enabled: true, agents: ['retester'] }
  ],
  mcp: [
    { name: 'vexnar-web', transport: 'streamable-http', enabled: true, tools: ['web_session_create', 'web_request_execute'] },
    { name: 'browser', transport: 'stdio', enabled: false, tools: [] }
  ],
  settings: {}
})

const { api } = await import('./src/routes.ts')
const response = await api.request('/api/_topology')
assert.equal(response.status, 200)
const body = await response.json() as any

// ── runtime / store ────────────────────────────────────────────────────────
assert.equal(body.runtime.mode, 'ts')
assert.equal(body.runtime.go.enabled, false)
assert.equal(body.store.backend, 'sqlite')
assert.equal(body.store.driver, 'sqlite')
assert.equal(body.store.db_path, join(root, 'vexnar.sqlite'))
assert.equal(body.store.postgres_configured, false)
assert.ok(!Number.isNaN(Date.parse(body.generated_at)))

// ── agent 名册：总数、启用数、run artifact 分开算 ──────────────────────────
assert.equal(body.agents.source, 'core-meta')
assert.equal(body.agents.total, 3)
assert.equal(body.agents.enabled, 2)
assert.equal(body.agents.run_artifacts, 1)
assert.deepEqual(body.agents.keys, ['planner', 'retester', 'lock_agent_1'])

// ── 工具：目录总数、启用数、已绑定 agent 数 ───────────────────────────────
assert.equal(body.tools.total, 3)
assert.equal(body.tools.enabled, 2)
assert.equal(body.tools.bound, 2)
assert.deepEqual(body.tools.keys, ['traffic_search', 'report_finding', 'record_finding_retest_result'])

// ── MCP：只报 server 与工具数，不猜测连接状态 ─────────────────────────────
assert.equal(body.mcp.total, 2)
assert.equal(body.mcp.enabled, 1)
assert.deepEqual(body.mcp.servers[0], {
  name: 'vexnar-web',
  transport: 'streamable-http',
  enabled: true,
  tools: 2
})

// ── Web 引擎：P1-6 起只在进程内提供 REST，环境里的旧端口不再表示监听 ──────
assert.equal(body.runtime.web_mcp, null)
assert.equal(body.web.mcp_port, null)
assert.equal(body.web.mcp_url, null)
assert.equal(body.web.mode, 'in-process')
assert.equal(body.web.adversarial, false)

// ── 监听面：只有 dsh；没有 PORT / VEXNAR_GO / 8792 时不应多报 ───────────────
assert.deepEqual(body.listeners.map((item: any) => item.name), ['dsh-web'])
assert.equal(body.listeners.some((item: any) => item.name === 'web-mcp'), false)
assert.equal(body.listeners.some((item: any) => item.name === 'core-http'), false)
assert.equal(body.listeners.some((item: any) => item.name === 'go-service'), false)

// ── 安全：token 不能因为“方便排查”被带进响应 ──────────────────────────────
const text = JSON.stringify(body)
assert.equal(text.includes('super-secret'), false)
assert.equal('VEXNAR_WEB_MCP_TOKEN' in body.env, false)
assert.equal('VEXNAR_WEB_MCP_PORT' in body.env, false)
assert.equal('VEXNAR_DESKTOP_TOKEN' in body.env, false)
assert.equal('VEXNAR_PG_DSN' in body.env, false)

console.log('topology.test.ts: 21 assertions passed')
