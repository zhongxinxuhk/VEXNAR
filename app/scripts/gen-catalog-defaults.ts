// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Generate `app/vexnar-core/src/catalog/defaults.ts` from a catalog dump.
 *
 * The tool catalog and the MCP registry used to be seeded by the Go service
 * (`agent.BuiltinToolSeeds()` and the `mcp_servers` table). The TypeScript core
 * now owns both registries, so their content has to live in code as defaults.
 * This script turns a dump of the Go-side catalog into that module; rerun it
 * whenever the Go seed catalog changes, so the two never drift silently.
 *
 *   tsx app/scripts/gen-catalog-defaults.ts --from <dump.json> [--out <file>]
 *
 * `<dump.json>` is `{ "tools": [...], "mcp": [...] }` — the `tools` / `mcp`
 * tables of a store that still carries the Go catalog (a `meta.json` works:
 * pass `--meta` and the script reads its `tables` field).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = join(repo, 'app', 'vexnar-core', 'src', 'catalog', 'defaults.ts')

/** Only these tables become defaults; everything else in a store is user data. */
const TOOL_FIELDS = ['key', 'description', 'schema', 'agents', 'enabled', 'kind', 'exec', 'deferred']

/** 一行目录数据：来自 store 的 JSON，字段按需读取，不假设形状。 */
type CatalogRow = Record<string, unknown>
type Args = { from: string; out: string; meta: boolean }

function parseArgs(argv: string[]): Args {
  const args: Args = { from: '', out, meta: false }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--from') args.from = argv[++i]
    else if (flag === '--out') args.out = argv[++i]
    else if (flag === '--meta') args.meta = true
    else throw new Error(`unknown argument: ${flag}`)
  }
  if (!args.from) throw new Error('missing --from <dump.json>')
  return args
}

function loadTables(file: string, metaFile: boolean): { tools: CatalogRow[]; mcp: CatalogRow[] } {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { tables?: Record<string, unknown> } & Record<string, unknown>
  const tables = metaFile ? raw.tables ?? {} : raw
  const tools: CatalogRow[] = Array.isArray(tables.tools) ? (tables.tools as CatalogRow[]) : []
  const mcp: CatalogRow[] = Array.isArray(tables.mcp) ? (tables.mcp as CatalogRow[]) : []
  return { tools, mcp }
}

/** 系统工具才是「默认」；用户建的自定义工具留在库里，不进默认。 */
function defaultTools(rows: readonly CatalogRow[]): Record<string, unknown>[] {
  return rows
    .filter((row) => row && row.system === true && typeof row.key === 'string' && row.key)
    .map((row): Record<string, unknown> => {
      const out: Record<string, unknown> = {}
      for (const field of TOOL_FIELDS) {
        if (row[field] !== undefined) out[field] = row[field]
      }
      out.agents = Array.isArray(out.agents) ? out.agents : []
      out.enabled = out.enabled !== false
      out.kind = typeof out.kind === 'string' ? out.kind : 'builtin'
      out.deferred = out.deferred === true
      return out
    })
    .sort((a, b) => String(a.key).localeCompare(String(b.key)))
}

/** 测试残留（key/name 带随机后缀的临时 server）不是默认的一部分。 */
function defaultServers(rows: readonly CatalogRow[]): Record<string, unknown>[] {
  return rows
    .filter((row) => row && typeof row.name === 'string' && row.name && !/^vexnar-test-/.test(row.name))
    .map((row) => ({
      name: row.name,
      transport: row.transport ?? 'stdio',
      ...(row.command ? { command: row.command } : {}),
      ...(row.url ? { url: row.url } : {}),
      args: Array.isArray(row.args) ? row.args : [],
      env: row.env && typeof row.env === 'object' ? row.env : {},
      enabled: row.enabled !== false,
      insecure: row.insecure === true
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
}

function json(value: unknown, indent: string): string {
  return JSON.stringify(value, null, 2).split('\n').join(`\n${indent}`)
}

const args = parseArgs(process.argv.slice(2))
const { tools, mcp } = loadTables(args.from, args.meta)
const toolDefaults = defaultTools(tools)
const serverDefaults = defaultServers(mcp)
if (toolDefaults.length === 0) throw new Error('dump carries no system tools — refusing to generate an empty catalog')

const body = `// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 默认工具目录与默认 MCP 注册表（生成文件，勿手改）。
 *
 * 工具与 MCP 的注册表已经从 Go 服务迁到 TypeScript core：路由、存储、发现都在
 * 这边，缺的只是「出厂默认」——一份写在代码里、可以在空库上重新注册回来的清单。
 * 内容来自 Go 侧目录（${toolDefaults.length} 个系统工具、${serverDefaults.length} 个 MCP server），
 * 由 \`app/scripts/gen-catalog-defaults.ts\` 生成；Go 侧的种子变了就重跑一次，
 * 不要在这个文件里手改。
 */

export interface DefaultTool {
  key: string
  description: string
  schema: unknown
  agents: string[]
  enabled: boolean
  kind: string
  exec?: unknown
  deferred: boolean
}

export interface DefaultServer {
  name: string
  transport: string
  command?: string
  url?: string
  args: unknown[]
  env: Record<string, unknown>
  enabled: boolean
  insecure: boolean
}

export const DEFAULT_TOOLS: readonly DefaultTool[] = ${json(toolDefaults, '')}

export const DEFAULT_SERVERS: readonly DefaultServer[] = ${json(serverDefaults, '')}
`

writeFileSync(args.out, body)
console.log(`generated ${args.out}: ${toolDefaults.length} tools, ${serverDefaults.length} servers`)
