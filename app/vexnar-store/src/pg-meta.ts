// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import pg from 'pg'
import type { MetaStore, ToolDocumentation } from './meta-store.ts'

/**
 * PostgreSQL-backed meta domain.
 *
 * The store already reads its per-record domains (tasks, findings, assets, …)
 * straight from the PostgreSQL the Go service owns. The configuration domain was
 * still read from a private SQLite file, so a client in front of the same
 * database reported 0 agents, 0 tools and 0 MCP servers while the console next
 * to it listed all of them. This adapter closes that split: every table below is
 * read from the very same rows the Go service serves, with the same JSON tags,
 * so both surfaces can only ever show one answer.
 *
 * Rows are mapped onto the shapes `Go` serializes (db/config.go, db/tools.go,
 * db/notification.go, …): snake_case keys, RFC3339 timestamps, `api_key` never
 * leaving the database.
 *
 * Tables without a PostgreSQL counterpart (`trafficCaptures`) stay in the local
 * SQLite meta store: capture state is a client-owned fact, and writing it into a
 * shared table would show up as configuration the Go service never wrote.
 */

export interface PgConnection {
  host: string
  port: number
  user: string
  password: string
  database: string
  ssl?: boolean
}

// int8 arrives as a string otherwise; every id here fits a JS number and the Go
// JSON encodes them as numbers.
pg.types.setTypeParser(20, (value: string) => Number(value))

const iso = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString()
  return value
}

/** jsonb columns are already parsed by node-pg; legacy text columns are not. */
const json = (value: unknown): unknown => {
  if (value == null) return null
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

interface Loader {
  sql: string
  row: (row: Record<string, any>) => Record<string, any>
}

const LOADERS: Record<string, Loader> = {
  // db/config.go · Agent
  agents: {
    sql: `SELECT id, key, name, COALESCE(description,'') AS description, role, builtin, enabled,
        llm_profile_id, COALESCE(max_turns,0) AS max_turns, COALESCE(run_seconds,0) AS run_seconds,
        COALESCE(web_search,false) AS web_search, COALESCE(interactive_shell,false) AS interactive_shell,
        COALESCE(wrapup_prompt,'') AS wrapup_prompt, COALESCE(wrapup_max_turns,0) AS wrapup_max_turns,
        COALESCE(task_timeout_wrapup_prompt,'') AS task_timeout_wrapup_prompt,
        COALESCE(task_timeout_wrapup_max_turns,0) AS task_timeout_wrapup_max_turns,
        COALESCE(trigger_run_mode,'serial') AS trigger_run_mode,
        COALESCE(trigger_merge_mode,'all') AS trigger_merge_mode,
        COALESCE(trigger_max_parallel,0) AS trigger_max_parallel
      FROM agents ORDER BY id`,
    row: (row) => ({ ...row })
  },
  // db/tools.go · Tool
  tools: {
    sql: `SELECT key, system, COALESCE(description,'') AS description, schema, COALESCE(agents,'[]'::jsonb) AS agents,
        enabled, COALESCE(kind,'builtin') AS kind, exec, COALESCE(deferred,false) AS deferred
      FROM tools ORDER BY key`,
    row: (row) => ({
      ...row,
      schema: json(row.schema) ?? {},
      exec: json(row.exec),
      agents: (json(row.agents) as string[] | null) ?? []
    })
  },
  // db/config.go · MCPServer (+ cached tool names, as ListMCP attaches)
  mcp: {
    sql: `SELECT m.id, m.name, m.transport, COALESCE(m.command,'') AS command,
        COALESCE(m.args,'[]'::jsonb) AS args, COALESCE(m.env,'{}'::jsonb) AS env,
        COALESCE(m.url,'') AS url, m.enabled, m.insecure,
        COALESCE((SELECT json_agg(t.tool_name ORDER BY t.tool_name)
                    FROM mcp_tools_cache t WHERE t.server_id = m.id), '[]'::json) AS tools
      FROM mcp_servers m ORDER BY m.id`,
    row: (row) => ({
      ...row,
      args: json(row.args) ?? [],
      env: json(row.env) ?? {},
      tools: (json(row.tools) as string[] | null) ?? []
    })
  },
  // db/config.go · LLMProfile — `api_key` never leaves the database.
  llmProfiles: {
    sql: `SELECT id, name, COALESCE(format,'') AS format, COALESCE(base_url,'') AS base_url,
        COALESCE(proxy,'') AS proxy, COALESCE(model,'') AS model, COALESCE(api_key_hint,'') AS api_key_hint,
        COALESCE(rate_per_second,0) AS rate_per_second, COALESCE(rate_per_minute,0) AS rate_per_minute,
        COALESCE(context_window_k,0) AS context_window_k,
        COALESCE(thinking_type,'') AS thinking_type, COALESCE(reasoning_effort,'') AS reasoning_effort,
        COALESCE(is_default,false) AS is_default, COALESCE(priority,0) AS priority,
        COALESCE(pool_exclude,false) AS pool_exclude, COALESCE(streaming,true) AS streaming,
        COALESCE(max_tokens,0) AS max_tokens, COALESCE(max_tokens_field,'') AS max_tokens_field,
        COALESCE(session_header_key,'') AS session_header_key,
        COALESCE(retry_connect_attempts,0) AS retry_connect_attempts,
        COALESCE(retry_connect_interval_ms,0) AS retry_connect_interval_ms,
        COALESCE(retry_empty_attempts,0) AS retry_empty_attempts,
        COALESCE(retry_empty_interval_ms,0) AS retry_empty_interval_ms,
        COALESCE(retry_stream_attempts,0) AS retry_stream_attempts,
        COALESCE(retry_stream_interval_ms,0) AS retry_stream_interval_ms
      FROM llm_profiles ORDER BY id`,
    row: (row) => ({ ...row })
  },
  // db/task_categories.go · TaskCategory — `nkey` is not serialized by Go.
  taskCategories: {
    sql: `SELECT c.id, c.name,
        (SELECT count(*) FROM tasks t WHERE t.category_id = c.id AND t.deleted_at IS NULL)::int AS task_count,
        c.created_at, c.updated_at
      FROM task_categories c ORDER BY c.id`,
    row: (row) => ({ ...row, created_at: iso(row.created_at), updated_at: iso(row.updated_at) })
  },
  // db/task_templates.go · TaskTemplate — `nkey` is not serialized by Go.
  taskTemplates: {
    sql: `SELECT id, name, COALESCE(description,'') AS description, COALESCE(goal,'') AS goal,
        category_id, COALESCE(intercept_rules,'[]'::jsonb) AS intercept_rules, created_at, updated_at
      FROM task_templates ORDER BY id`,
    row: (row) => ({
      ...row,
      intercept_rules: json(row.intercept_rules) ?? [],
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at)
    })
  },
  // db/notification.go · NotificationChannel
  notify: {
    sql: `SELECT id, name, kind, COALESCE(mode,'') AS mode, COALESCE(config,'{}'::jsonb) AS config,
        COALESCE(filter,'{}'::jsonb) AS filter, enabled, COALESCE(rate_per_min,0) AS rate_per_min,
        created_at, updated_at
      FROM notification_channels ORDER BY id`,
    row: (row) => ({
      ...row,
      config: json(row.config) ?? {},
      filter: json(row.filter) ?? {},
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at)
    })
  }
}

/**
 * Keys that must never reach a client. Go's `/api/settings` answers a hand-built
 * whitelist; this table also stores rows the console never shows — the password
 * hash, provider keys, credentials — and those stay in the database.
 */
const SENSITIVE_SETTING = /(password|passwd|secret|credential|private_key|api_?key|(^|_)token)/i

/** `settings` is a key/value table; the API hands clients one flat object. */
function settingsRow(row: { key: string; value: string | null }): [string, unknown] {
  const raw = row.value ?? ''
  if (raw === '') return [row.key, '']
  try {
    return [row.key, JSON.parse(raw)]
  } catch {
    return [row.key, raw]
  }
}

/** Read the catalog projections through the caller's PostgreSQL snapshot. */
export async function readPgCatalog(query: (sql: string) => Promise<Record<string, any>[]>): Promise<Record<string, unknown>> {
  const catalog: Record<string, unknown> = {}
  for (const [name, loader] of Object.entries(LOADERS)) {
    catalog[name] = (await query(loader.sql)).map(loader.row)
  }
  const settings = await query('SELECT key, value FROM settings ORDER BY key') as { key: string; value: string | null }[]
  catalog.settings = Object.fromEntries(settings.filter(row => !SENSITIVE_SETTING.test(row.key)).map(settingsRow))
  return catalog
}

function settingsValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  return JSON.stringify(value)
}

export function pgMetaStore(connection: PgConnection, fallback: MetaStore): MetaStore {
  const pool = new pg.Pool({
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
    database: connection.database,
    ssl: connection.ssl === false ? false : { rejectUnauthorized: false },
    max: 4
  })
  const q = async (text: string, values: unknown[] = []) => (await pool.query(text, values)).rows

  async function settings(): Promise<Record<string, unknown>> {
    const rows = (await q('SELECT key, value FROM settings ORDER BY key')) as Array<{ key: string; value: string | null }>
    return Object.fromEntries(rows.filter((row) => !SENSITIVE_SETTING.test(row.key)).map(settingsRow))
  }

  async function read(name: string): Promise<any> {
    if (name === 'settings') return settings()
    const loader = LOADERS[name]
    if (!loader) return fallback.table(name)
    const rows = (await q(loader.sql)) as Array<Record<string, any>>
    return rows.map(loader.row)
  }

  async function writeSettings(next: Record<string, unknown>): Promise<void> {
    // Partial update, never a replace: callers hand over the object they read
    // (which excludes the sensitive rows above), and a wholesale delete would
    // silently drop the password hash and every provider key.
    for (const [key, value] of Object.entries(next)) {
      if (SENSITIVE_SETTING.test(key)) continue
      await q(
        `INSERT INTO settings(key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, settingsValue(value)]
      )
    }
  }

  return {
    backend: 'postgres',
    notificationChannels: {
      async create(input) {
        const [row] = await q(
          `INSERT INTO notification_channels(name,kind,enabled,config,mode,filter,rate_per_min)
           VALUES($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7) RETURNING id`,
          [input.name, input.kind, input.enabled, JSON.stringify(input.config), input.mode, JSON.stringify(input.filter), input.rate_per_min]
        )
        return Number(row.id)
      },
      async update(id, input) {
        const rows = await q(
          `UPDATE notification_channels SET name=COALESCE($2,name), kind=COALESCE($3,kind),
           enabled=COALESCE($4,enabled), config=COALESCE($5::jsonb,config), mode=COALESCE($6,mode),
           filter=COALESCE($7::jsonb,filter), rate_per_min=COALESCE($8,rate_per_min) WHERE id=$1 RETURNING id`,
          [id, input.name, input.kind, input.enabled, JSON.stringify(input.config),
            input.mode, JSON.stringify(input.filter), input.rate_per_min]
        )
        return rows.length > 0
      },
      async remove(id) {
        return (await q('DELETE FROM notification_channels WHERE id=$1 RETURNING id', [id])).length > 0
      }
    },
    async editBuiltinToolDocumentation(key, edit) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const { rows: [row] } = await client.query<ToolDocumentation>(
          "SELECT COALESCE(description, '') AS description, COALESCE(schema, '{}'::jsonb) AS schema FROM tools WHERE key = $1 AND system FOR UPDATE",
          [key]
        )
        if (row) {
          const next = edit(row)
          await client.query(
            'UPDATE tools SET description = $2, schema = $3::jsonb, updated_at = now() WHERE key = $1',
            [key, next.description, JSON.stringify(next.schema)]
          )
        }
        await client.query('COMMIT')
        return row !== undefined
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    async load() {
      const out: Record<string, any[] | Record<string, unknown>> = {}
      for (const name of Object.keys(LOADERS)) out[name] = await read(name)
      out.settings = await settings()
      // Client-owned tables (trafficCaptures, …) keep their local rows; a
      // wholesale replace must not drop them.
      const local = await fallback.load()
      for (const [name, rows] of Object.entries(local)) {
        if (!(name in out)) out[name] = rows
      }
      return out
    },
    reload() {
      fallback.reload()
    },
    async table<T = any[]>(name: string): Promise<T> {
      return (await read(name)) as T
    },
    async save(next) {
      if ('settings' in next) await writeSettings((next.settings ?? {}) as Record<string, unknown>)
      const local: Record<string, any[] | Record<string, unknown>> = {}
      for (const [name, rows] of Object.entries(next)) {
        if (name === 'settings' || name in LOADERS) continue
        local[name] = rows
      }
      if (Object.keys(local).length > 0) await fallback.save({ ...(await fallback.load()), ...local })
      fallback.reload()
    }
  }
}
