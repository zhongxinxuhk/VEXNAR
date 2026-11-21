// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from 'hono'
import { db, parseJson, rfc3339, sql, unix } from './db.js'
import { openStore } from '../../vexnar-store/src/index.ts'

const store = await openStore()

export const api = new Hono()

api.get('/api/health', (c) => c.json({ ok: true, service: 'vexnar', version: process.env.VEXNAR_VERSION ?? 'dev' }))

// ── agents ────────────────────────────────────────────────────────────────
api.get('/api/agents', async (c) => {
  const rows = await db.selectFrom('agents').selectAll().orderBy('id').execute()
  return c.json({
    agents: rows.map((row) => ({
      id: String(row.id),
      key: row.key,
      name: row.name,
      description: row.description,
      role: row.role,
      builtin: row.builtin,
      enabled: row.enabled,
      max_turns: row.max_turns,
      run_seconds: row.run_seconds,
      web_search: row.web_search,
      interactive_shell: row.interactive_shell,
      llm_profile_id: row.llm_profile_id ?? null,
      trigger_run_mode: row.trigger_run_mode,
      trigger_merge_mode: row.trigger_merge_mode,
      trigger_max_parallel: row.trigger_max_parallel,
      mcp_count: 0,
      skill_count: 0,
      tool_count: 0
    }))
  })
})

api.get('/api/agents/:key', async (c) => {
  const row = await db.selectFrom('agents').selectAll().where('key', '=', c.req.param('key')).executeTakeFirst()
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json({ agent: row })
})

// ── LLM profiles ──────────────────────────────────────────────────────────
api.get('/api/llm/profiles', async (c) => {
  const rows = await db.selectFrom('llm_profiles').selectAll().orderBy('id').execute()
  return c.json({
    profiles: rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      format: row.format,
      ...(row.base_url == null ? {} : { base_url: row.base_url }),
      model: row.model,
      api_key_hint: row.api_key_hint,
      rate_per_second: row.rate_per_second,
      rate_per_minute: row.rate_per_minute,
      context_window_k: row.context_window_k,
      thinking_type: row.thinking_type,
      reasoning_effort: row.reasoning_effort,
      is_default: row.is_default,
      priority: row.priority,
      pool_exclude: row.pool_exclude,
      streaming: row.streaming,
      max_tokens: row.max_tokens,
      max_tokens_field: row.max_tokens_field,
      session_header_key: row.session_header_key,
      retry: {
        connect: { attempts: row.retry_connect_attempts, interval_ms: row.retry_connect_interval_ms },
        empty: { attempts: row.retry_empty_attempts, interval_ms: row.retry_empty_interval_ms },
        stream: { attempts: row.retry_stream_attempts, interval_ms: row.retry_stream_interval_ms }
      },
      created_at: row.created_at,
      updated_at: row.updated_at
    }))
  })
})

// ── categories / templates / companies ────────────────────────────────────
api.get('/api/task-categories', async (c) => {
  const rows = await db
    .selectFrom('task_categories as c')
    .selectAll('c')
    .select((eb) => eb.selectFrom('tasks').select(sql<number>`count(*)::int`).whereRef('tasks.category_id', '=', 'c.id').as('task_count'))
    .orderBy('c.id')
    .execute()
  return c.json({
    categories: rows.map((row) => ({
      id: row.id,
      name: row.name,
      task_count: Number(row.task_count ?? 0),
      created_at: row.created_at,
      updated_at: row.updated_at
    }))
  })
})

api.get('/api/task-templates', async (c) => {
  const rows = await db
    .selectFrom('task_templates')
    .selectAll()
    .select([rfc3339('created_at').as('created_text'), rfc3339('updated_at').as('updated_text')])
    .orderBy('updated_at', 'desc')
    .orderBy('id', 'desc')
    .execute()
  return c.json({
    templates: rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      goal: row.goal,
      category_id: row.category_id,
      intercept_rules: parseJson(row.intercept_rules) ?? [],
      created_at: row.created_at,
      updated_at: row.updated_at
    }))
  })
})

api.get('/api/companies', async (c) => {
  const rows = await db
    .selectFrom('companies as co')
    .select(['co.id', 'co.name', 'co.nkey'])
    .select([sql<string>`co.created_at::text`.as('created_text'), sql<string>`co.updated_at::text`.as('updated_text')])
    .select((eb) => eb.selectFrom('assets').select(sql<number>`count(*)::int`).whereRef('assets.company_id', '=', 'co.id').as('asset_count'))
    .orderBy('co.name')
    .execute()
  const scopes = await db
    .selectFrom('company_scope')
    .select(['id', 'company_id', 'kind', 'domain', 'net', 'value', 'raw', 'reason'])
    .execute()
  const byCompany = new Map<number, unknown[]>()
  for (const scope of scopes) {
    const list = byCompany.get(Number(scope.company_id)) ?? []
    list.push({
      id: Number(scope.id),
      company_id: Number(scope.company_id),
      kind: scope.kind,
      ...(scope.domain ? { domain: scope.domain } : {}),
      ...(scope.net ? { net: scope.net } : {}),
      ...(scope.value ? { value: scope.value } : {}),
      raw: scope.raw,
      ...(scope.reason ? { reason: scope.reason } : {})
    })
    byCompany.set(Number(scope.company_id), list)
  }
  return c.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      nkey: row.nkey,
      created_at: row.created_text,
      updated_at: row.updated_text,
      scope: byCompany.get(Number(row.id)) ?? [],
      asset_count: Number(row.asset_count ?? 0)
    }))
  )
})

// ── tools / mcp / notify / settings ───────────────────────────────────────
api.get('/api/tools', async (c) => {
  const rows = await db.selectFrom('tools').selectAll().orderBy('key').execute()
  const counts = await db
    .selectFrom('tool_usage')
    .select(['tool_key'])
    .select(sql<number>`count(*)::int`.as('n'))
    .groupBy('tool_key')
    .execute()
  const calls = new Map(counts.map((row) => [row.tool_key, Number(row.n)]))
  return c.json({
    tools: rows.map((row) => ({
      key: row.key,
      system: row.system,
      description: row.description,
      schema: parseJson(row.schema),
      agents: parseJson(row.agents) ?? [],
      enabled: row.enabled,
      kind: row.kind,
      exec: row.exec,
      deferred: row.deferred,
      calls: calls.get(row.key) ?? 0
    }))
  })
})

api.get('/api/mcp', async (c) => {
  const rows = await db.selectFrom('mcp_servers').selectAll().orderBy('id').execute()
  return c.json({
    servers: rows.map((row) => ({
      id: row.id,
      name: row.name,
      transport: row.transport,
      command: row.command ?? undefined,
      args: parseJson(row.args) ?? [],
      env: parseJson(row.env) ?? {},
      url: row.url ?? undefined,
      enabled: row.enabled,
      insecure: row.insecure,
      tools: []
    }))
  })
})

api.get('/api/notify/channels', async (c) => {
  const rows = await db.selectFrom('notification_channels').selectAll().orderBy('id').execute()
  return c.json({
    channels: rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      enabled: row.enabled,
      config: parseJson(row.config),
      mode: row.mode,
      filter: parseJson(row.filter),
      rate_per_min: row.rate_per_min
    }))
  })
})

const SETTINGS_DEFAULTS: Record<string, unknown> = {
  traffic_capture: false,
  agent_traffic_binding: false,
  llm_record: false,
  web_search_enabled: false,
  web_search_backend: 'ddgs',
  brave_key_set: false,
  tavily_key_set: false,
  web_search_proxy: '',
  global_proxy: '',
  python_interpreter: '',
  workers: 3,
  task_concurrency_enabled: false,
  task_concurrency_limit: 5,
  llm_pool_enabled: false,
  llm_pool_bind_fallback: false,
  constraints_inject_planner: false,
  constraints_inject_worker: false,
  noa_compaction: false,
  finding_auto_verify: false,
  notify_enabled: true,
  notify_public_base_url: '',
  notify_digest_interval_min: 30
}

const SETTINGS_TYPES: Record<string, 'bool' | 'int'> = {
  traffic_capture: 'bool', agent_traffic_binding: 'bool', llm_record: 'bool', web_search_enabled: 'bool',
  brave_key_set: 'bool', tavily_key_set: 'bool', task_concurrency_enabled: 'bool', llm_pool_enabled: 'bool',
  llm_pool_bind_fallback: 'bool', constraints_inject_planner: 'bool', constraints_inject_worker: 'bool',
  noa_compaction: 'bool', finding_auto_verify: 'bool', notify_enabled: 'bool',
  workers: 'int', task_concurrency_limit: 'int', notify_digest_interval_min: 'int'
}

api.get('/api/settings', async (c) => {
  const rows = await db.selectFrom('settings').selectAll().execute()
  const stored = new Map(rows.map((row) => [row.key, row.value]))
  const out: Record<string, unknown> = {}
  for (const [key, fallback] of Object.entries(SETTINGS_DEFAULTS)) {
    const raw = stored.get(key)
    if (raw === undefined) {
      out[key] = fallback
      continue
    }
    const type = SETTINGS_TYPES[key]
    out[key] = type === 'bool' ? raw === 'true' : type === 'int' ? Number(raw) : raw
  }
  return c.json(out)
})

// ── tasks ─────────────────────────────────────────────────────────────────
const taskDto = (row: any) => ({
  id: String(row.id),
  exploration_id: Number(row.exploration_id),
  name: row.name,
  ...(row.category_id == null ? {} : { category_id: row.category_id }),
  pinned: row.pinned_at != null,
  ...(row.pinned_at == null ? {} : { pinned_at: String(row.pinned_at) }),
  description: row.description,
  goal: row.goal,
  status: row.status,
  created_at: row.created_at_text,
  created_unix: Number(row.created_unix ?? 0),
  completed_at: row.completed_at_text ?? '',
  completed_unix: Number(row.completed_unix ?? 0),
  last_activity_unix: 0,
  paused: row.paused,
  queued: row.queued,
  tokens: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 },
  goals_total: 0,
  goals_met: 0,
  in_flight: 0,
  findings: { critical: 0, high: 0, medium: 0, low: 0 },
  ...(row.llm_profile_id == null ? {} : { llm_profile_id: row.llm_profile_id }),
  llm_profile_ids: [],
  ...(row.active_llm_profile_id == null ? {} : { active_llm_profile_id: row.active_llm_profile_id }),
  llm_failover_state: 'default',
  source_task_ids: [],
  company_ids: [],
  coverage_enabled: row.coverage_enabled
})

api.get('/api/tasks', async (c) => {
  const rows = await store.tasks.list()
  return c.json({ tasks: rows.map(taskDto) })
})

api.get('/api/tasks/:id', async (c) => {
  const row = await store.tasks.get(c.req.param('id'))
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(taskDto(row))
})

api.get('/api/tasks/:id/metrics', async (c) => {
  const task = await store.tasks.get(c.req.param('id'))
  if (!task) return c.json({ error: 'not found' }, 404)
  return c.json({
    task_id: Number(task.id),
    exploration_id: Number(task.exploration_id),
    mttd_seconds: null,
    findings_total: 0,
    findings_by_severity: {},
    findings_by_vulnclass: {},
    findings_by_status: {},
    verify_sessions: 0,
    verify_reproduced: 0,
    verify_false_positive: 0,
    verify_inconclusive: 0,
    intents: {},
    done_intents: 0,
    no_yield_done: 0,
    yield_rate: 0,
    class_coverage: {}
  })
})

// ── assets ────────────────────────────────────────────────────────────────
const assetDto = (row: any) => ({
  id: row.id,
  type: row.type,
  ...(row.company_id == null ? {} : { company_id: row.company_id }),
  task_ids: row.task_ids ?? [],
  ...(row.domain == null ? {} : { domain: row.domain }),
  ...(row.root_domain == null ? {} : { root_domain: row.root_domain }),
  ...(row.ip == null ? {} : { ip: row.ip }),
  ...(row.port == null ? {} : { port: row.port }),
  ...(row.url == null ? {} : { url: row.url }),
  last_seen: row.last_seen
})

api.get('/api/assets', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 20) || 20, 200)
  const offset = Math.max(Number(c.req.query('offset') ?? 0) || 0, 0)
  const type = c.req.query('type') || undefined
  const { rows, total } = await store.assets.list({ type, limit, offset })
  return c.json({ assets: rows.map(assetDto), count: rows.length, total })
})

api.get('/api/assets/counts', async (c) => c.json(await store.assets.counts()))

// ── findings / nodes ──────────────────────────────────────────────────────
const findingDto = (row: any) => ({
  traffic_count: 0,
  evidence_version: 0,
  report_evidence_version: 0,
  report_stale: false,
  id: String(row.id),
  finding_id: String(row.id),
  vulnclass: row.vulnclass,
  ...(row.name ? { name: row.name } : {}),
  severity: row.severity,
  status: row.status,
  summary: row.summary,
  evidence: row.evidence,
  ...(row.task_id == null ? {} : { task_id: String(row.task_id) }),
  ts: row.created_at_text
})

api.get('/api/exploration/findings', async (c) => {
  const page = c.req.query('page')
  const limit = c.req.query('limit')
  const stats = await store.findings.stats()
  if (page == null && limit == null) {
    const rows = await store.findings.list(500)
    return c.json(rows.map(findingDto))
  }
  const size = Math.min(Number(limit ?? 20) || 20, 200)
  const current = Math.max(Number(page ?? 1) || 1, 1)
  const rows = (await store.findings.list(current * size)).slice((current - 1) * size, current * size)
  return c.json({ items: rows.map(findingDto), total: stats.total, page: current, page_size: size })
})

api.get('/api/exploration/findings/stats', async (c) => c.json(await store.findings.stats()))

api.get('/api/exploration/findings/:id', async (c) => {
  const id = c.req.param('id')
  const row = await store.findings.get(id)
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json({
    ...findingDto(row),
    ...(row.report ? { report: row.report } : {})
  })
})

api.get('/api/exploration/nodes', async (c) => {
  const taskId = c.req.query('task') ?? ''
  const page = Math.max(Number(c.req.query('page') ?? 1) || 1, 1)
  const size = Math.min(Number(c.req.query('size') ?? 20) || 20, 200)
  if (!taskId) return c.json({ items: [], total: 0, page, size, edges: [], refs: {} })
  const kinds = (c.req.query('kind') ?? '').split(',').filter(Boolean)
  const states = (c.req.query('state') ?? '').split(',').filter(Boolean)
  const order = c.req.query('order') === 'asc' ? 'asc' : 'desc'
  const { items, total, edges } = await store.nodes.page({ taskId, page, size, order, kinds, states })
  return c.json({
    items: items.map((row: any) => ({
      id: String(row.id),
      type: row.kind,
      payload: JSON.stringify(typeof row.payload === 'string' ? parseJson(row.payload) : row.payload ?? {}),
      priority: row.priority,
      state: row.state,
      ...(row.origin == null ? {} : { origin: row.origin }),
      ts: row.created_at
    })),
    total,
    page,
    size,
    edges: edges.map((edge: any) => ({ src: String(edge.src), dst: String(edge.dst), rel: edge.rel })),
    refs: {}
  })
})
