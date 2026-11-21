// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { DEFAULT_SERVERS, DEFAULT_TOOLS, type DefaultTool } from './defaults.ts'

/**
 * 默认目录的注册：工具与 MCP 的注册表在 TypeScript core 里，但「出厂清单」要能
 * 重新灌回去。
 *
 * 两条路径共用这份逻辑：
 *   - 首次启动：空库自动补齐默认工具与默认 MCP server，装好即用；
 *   - 显式「重新注册」：把缺的补回来（用户删掉的、升级后新增的），已有的行一律
 *     不动——页面上的编辑、启停、绑定都是用户的决定，重注册不是重置。
 *
 * MCP 的自动补齐只在第一次做（settings 里记一个标记），因为 server 允许删除：
 * 如果每次启动都补，「删掉就不要了」这个意思会被下一次启动抹掉。显式重新注册
 * 不受这个标记限制。
 */

/** 只依赖 meta store 的读/存两个动作，方便在 core 之外单测。 */
export interface MetaTables {
  load(): Promise<Record<string, any>>
  save(tables: Record<string, any>): Promise<void>
  reload(): void
}

export interface RegisterResult {
  toolsAdded: number
  toolsTotal: number
  serversAdded: number
  serversTotal: number
  seeded: boolean
}

const SEED_MARKER = 'catalogSeeded'

function rowsOf(tables: Record<string, any>, name: string): any[] {
  const rows = tables[name]
  if (Array.isArray(rows)) return rows
  const fresh: any[] = []
  tables[name] = fresh
  return fresh
}

function settingsOf(tables: Record<string, any>): Record<string, any> {
  const row = tables.settings
  if (row && typeof row === 'object' && !Array.isArray(row)) return row as Record<string, any>
  const fresh: Record<string, any> = {}
  tables.settings = fresh
  return fresh
}

/** 默认工具行：与 Go 的 `SeedTool` 一致——system 固定为 true，调用计数从 0 起。 */
export function toolRowFromDefault(def: DefaultTool): Record<string, any> {
  return {
    key: def.key,
    system: true,
    description: def.description,
    schema: def.schema,
    agents: [...def.agents],
    enabled: def.enabled,
    kind: def.kind,
    ...(def.exec === undefined ? {} : { exec: def.exec }),
    deferred: def.deferred,
    calls: 0
  }
}

/**
 * 把缺失的默认项补进两张表。
 *
 * `firstRunOnly` 为真时（启动路径）只看标记：标记已在就什么都不做，避免把用户
 * 删掉的 MCP server 一直复活。显式注册走 `firstRunOnly: false`。
 */
export async function registerCatalogDefaults(
  meta: MetaTables,
  options: { only?: 'tools' | 'mcp'; firstRunOnly?: boolean } = {}
): Promise<RegisterResult> {
  const tables = await meta.load()
  const tools = rowsOf(tables, 'tools')
  const servers = rowsOf(tables, 'mcp')
  const settings = settingsOf(tables)
  const firstRunOnly = options.firstRunOnly === true
  const seeded = settings[SEED_MARKER] === true
  const wantTools = options.only === undefined || options.only === 'tools'
  const wantServers = options.only === undefined || options.only === 'mcp'
  const proceed = !firstRunOnly || !seeded

  let toolsAdded = 0
  let serversAdded = 0
  if (proceed && wantTools) {
    const known = new Set(tools.map((row) => String(row?.key ?? '')))
    for (const def of DEFAULT_TOOLS) {
      if (known.has(def.key)) continue
      tools.push(toolRowFromDefault(def))
      known.add(def.key)
      toolsAdded += 1
    }
  }
  if (proceed && wantServers) {
    const known = new Set(servers.map((row) => String(row?.name ?? '').toLowerCase()))
    let nextId = Math.max(0, ...servers.map((row) => Number(row?.id ?? 0))) + 1
    for (const def of DEFAULT_SERVERS) {
      const name = def.name.toLowerCase()
      if (known.has(name)) continue
      servers.push({
        id: nextId++,
        name: def.name,
        transport: def.transport,
        ...(def.command === undefined ? {} : { command: def.command }),
        ...(def.url === undefined ? {} : { url: def.url }),
        args: [...def.args],
        env: { ...def.env },
        enabled: def.enabled,
        insecure: def.insecure,
        tools: []
      })
      known.add(name)
      serversAdded += 1
    }
  }
  const markNow = proceed && (toolsAdded > 0 || serversAdded > 0 || !seeded)
  if (markNow) settings[SEED_MARKER] = true
  if (markNow || toolsAdded > 0 || serversAdded > 0) {
    await meta.save(tables)
    meta.reload()
  }
  return {
    toolsAdded,
    toolsTotal: tools.length,
    serversAdded,
    serversTotal: servers.length,
    seeded
  }
}

/** 内置工具的出厂定义；`reset` 用它把描述、schema、绑定、启停还原。 */
export function defaultTool(key: string): DefaultTool | undefined {
  return DEFAULT_TOOLS.find((def) => def.key === key)
}
