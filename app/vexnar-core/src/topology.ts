// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Harness 组合面的只读快照。
 *
 * 这个模块回答一个以前只能靠读代码和猜的问题：**当前这套 harness 到底由什么组成**。
 * 它只读 meta 配置与进程环境，不启动 Web 引擎、不打开监听、不触发后台循环——
 * 因此可以安全地挂在 `/api/_topology` 上，也可以被冒烟脚本反复调用。
 *
 * 输出刻意保持稳定：字段顺序固定，数组保留 meta 的原始顺序，便于快照测试。
 * 任何 token / DSN / 密钥都不进来；`env` 只列非敏感开关。
 */

import { backend, dbPath, pgConnection, storeRoot } from '../../vexnar-store/src/index.ts'
import { meta } from './context.ts'
import { storeBackend } from './mode.ts'
import { runtimeInfo } from './runtime.ts'

type Row = Record<string, unknown>

export interface ListenerSnapshot {
  name: string
  kind: 'http' | 'external'
  address: string
  source: string
}

export interface TopologySnapshot {
  generated_at: string
  runtime: {
    mode: string
    store: string
    started: boolean
    started_at: number
    triggers: number
    schedules: boolean
    store_locked: boolean
    engine: string
    task_concurrency: number
    web_mcp: null
    go: {
      enabled: boolean
      url_configured: boolean
    }
  }
  store: {
    root: string
    backend: string
    driver: string
    db_path: string | null
    postgres_configured: boolean
  }
  agents: {
    source: 'core-meta'
    total: number
    enabled: number
    run_artifacts: number
    keys: string[]
  }
  tools: {
    total: number
    enabled: number
    bound: number
    keys: string[]
  }
  mcp: {
    total: number
    enabled: number
    servers: Array<{
      name: string
      transport: string
      enabled: boolean
      tools: number
    }>
  }
  web: {
    mcp_port: null
    mcp_url: null
    mode: 'in-process'
    adversarial: boolean
  }
  listeners: ListenerSnapshot[]
  env: Record<string, string | null>
}

function rows(value: unknown): Row[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Row => item !== null && typeof item === 'object' && !Array.isArray(item))
}

function envValue(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

function isOn(name: string): boolean {
  return /^(1|on|true|yes)$/i.test(process.env[name]?.trim() ?? '')
}

function listeners(goEnabled: boolean): ListenerSnapshot[] {
  const found: ListenerSnapshot[] = [
    { name: 'dsh-web', kind: 'external', address: 'dsh', source: 'dsh' }
  ]
  const corePort = envValue('PORT')
  if (corePort) {
    found.push({ name: 'core-http', kind: 'http', address: `127.0.0.1:${corePort}`, source: 'PORT' })
  }
  if (goEnabled) {
    found.push({ name: 'go-service', kind: 'http', address: 'configured', source: 'VEXNAR_GO' })
  }
  return found
}

export async function topology(): Promise<TopologySnapshot> {
  const [agentRows, toolRows, mcpRows] = await Promise.all([
    meta.table<Row[]>('agents'),
    meta.table<Row[]>('tools'),
    meta.table<Row[]>('mcp')
  ])
  const agents = rows(agentRows)
  const tools = rows(toolRows)
  const servers = rows(mcpRows)
  const info = runtimeInfo()
  const goUrl = envValue('VEXNAR_GO_URL')
  const goEnabled = isOn('VEXNAR_GO') || goUrl !== null

  return {
    generated_at: new Date().toISOString(),
    runtime: {
      mode: info.mode,
      store: info.store,
      started: info.started,
      started_at: info.started_at,
      triggers: info.triggers,
      schedules: info.schedules,
      store_locked: info.store_locked,
      engine: info.engine,
      task_concurrency: info.task_concurrency,
      web_mcp: info.web_mcp,
      go: { enabled: goEnabled, url_configured: goUrl !== null }
    },
    store: {
      root: storeRoot(),
      backend: storeBackend(),
      driver: backend(),
      db_path: storeBackend() === 'sqlite' ? dbPath() : null,
      postgres_configured: pgConnection() !== undefined
    },
    agents: {
      source: 'core-meta',
      total: agents.length,
      enabled: agents.filter((row) => row.enabled === true).length,
      run_artifacts: agents.filter((row) => /^(?:lock_agent|write_lock_agent)_/.test(String(row.key ?? ''))).length,
      keys: agents.map((row) => String(row.key ?? '')).filter(Boolean)
    },
    tools: {
      total: tools.length,
      enabled: tools.filter((row) => row.enabled === true).length,
      bound: tools.filter((row) => Array.isArray(row.agents) && row.agents.length > 0).length,
      keys: tools.map((row) => String(row.key ?? '')).filter(Boolean)
    },
    mcp: {
      total: servers.length,
      enabled: servers.filter((row) => row.enabled === true).length,
      servers: servers.map((row) => ({
        name: String(row.name ?? ''),
        transport: String(row.transport ?? ''),
        enabled: row.enabled === true,
        tools: Array.isArray(row.tools) ? row.tools.length : 0
      }))
    },
    web: {
      mcp_port: null,
      mcp_url: null,
      mode: 'in-process',
      adversarial: isOn('VEXNAR_WEB_ADVERSARIAL')
    },
    listeners: listeners(goEnabled),
    env: {
      VEXNAR_RUNTIME_MODE: envValue('VEXNAR_RUNTIME_MODE'),
      VEXNAR_STORE: envValue('VEXNAR_STORE'),
      VEXNAR_EGRESS: envValue('VEXNAR_EGRESS'),
      VEXNAR_GO: envValue('VEXNAR_GO'),
      VEXNAR_CORE_EMBEDDED: envValue('VEXNAR_CORE_EMBEDDED'),
      VEXNAR_WEB_ADVERSARIAL: envValue('VEXNAR_WEB_ADVERSARIAL'),
      VEXNAR_TASK_CONCURRENCY: envValue('VEXNAR_TASK_CONCURRENCY')
    }
  }
}
