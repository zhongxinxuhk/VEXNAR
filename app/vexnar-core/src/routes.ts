// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from 'hono'
import { db, parseJson, rfc3339, sql, unix } from './db.js'

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
const taskSelect = (where?: (qb: any) => any) => {
  let query = db
    .selectFrom('tasks')
    .select([
      'id', 'exploration_id', 'name', 'description', 'goal', 'status', 'paused', 'queued',
      'category_id', 'pinned_at', 'llm_profile_id', 'active_llm_profile_id', 'coverage_enabled',
      'created_at', 'completed_at'
    ])
    .select([rfc3339('created_at').as('created_at_text'), rfc3339('completed_at').as('completed_at_text')])
    .select([unix('created_at').as('created_unix'), unix('completed_at').as('completed_unix')])
  if (where) query = where(query)
  return query
}

const taskDto = (row: any) => ({
  id: String(row.id),
  exploration_id: Number(row.exploration_id),
  name: row.name,
  ...(row.category_id == null ? {} : { category_id: row.category_id }),
  pinned: row.pinned_at != null,
  ...(row.pinned_at == null ? {} : { pinned_at: row.pinned_at.toISOString?.() ?? String(row.pinned_at) }),
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
  const rows = await taskSelect((q) => q.orderBy('id', 'desc')).execute()
  return c.json({ tasks: rows.map(taskDto) })
})

api.get('/api/tasks/:id', async (c) => {
  const id = c.req.param('id')
  const row = await taskSelect((q) => q.where('id', '=', id)).executeTakeFirst()
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(taskDto(row))
})

api.get('/api/tasks/:id/metrics', async (c) => {
  const task = await db.selectFrom('tasks').select(['id', 'exploration_id']).where('id', '=', c.req.param('id')).executeTakeFirst()
  if (!task) return c.json({ error: 'not found' }, 404)
  return c.json({
    task_id: task.id,
    exploration_id: task.exploration_id,
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
api.get('/api/assets', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 20) || 20, 200)
  const offset = Math.max(Number(c.req.query('offset') ?? 0) || 0, 0)
  const type = c.req.query('type')
  let query = db.selectFrom('assets').selectAll()
  let countQuery = db.selectFrom('assets').select(sql<number>`count(*)::int`.as('n'))
  if (type) {
    query = query.where('type', '=', type)
    countQuery = countQuery.where('type', '=', type)
  }
  const rows = await query.orderBy('last_seen', 'desc').orderBy('id', 'desc').limit(limit).offset(offset).execute()
  const [{ n }] = await countQuery.execute()
  return c.json({
    assets: rows.map((row) => ({
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
    })),
    count: rows.length,
    total: Number(n)
  })
})

api.get('/api/assets/counts', async (c) => {
  const rows = await db.selectFrom('assets').select(['type']).select(sql<number>`count(*)::int`.as('n')).groupBy('type').execute()
  return c.json(Object.fromEntries(rows.map((row) => [row.type, Number(row.n)])))
})

// ── findings / nodes ──────────────────────────────────────────────────────
const findingSelect = () =>
  db
    .selectFrom('findings as f')
    .leftJoin('exploration_nodes as n', 'n.id', 'f.node_id')
    .select(['f.id', 'f.node_id', 'f.vulnclass', 'f.name', 'f.severity', 'f.status', 'f.summary', 'f.evidence', 'f.task_id', 'f.created_at'])
    .select([rfc3339('f.created_at').as('ts')])

const findingDto = (row: any) => ({
  traffic_count: 0,
  evidence_version: 0,
  report_evidence_version: 0,
  report_stale: false,
  id: String(row.node_id ?? row.id),
  finding_id: String(row.id),
  vulnclass: row.vulnclass,
  ...(row.name ? { name: row.name } : {}),
  severity: row.severity,
  status: row.status,
  summary: row.summary,
  evidence: row.evidence,
  ...(row.task_id == null ? {} : { task_id: String(row.task_id) }),
  ts: row.ts
})

api.get('/api/exploration/findings', async (c) => {
  const page = c.req.query('page')
  const limit = c.req.query('limit')
  if (page == null && limit == null) {
    const rows = await findingSelect().orderBy('f.created_at', 'desc').limit(500).execute()
    return c.json(rows.map(findingDto))
  }
  const size = Math.min(Number(limit ?? 20) || 20, 200)
  const current = Math.max(Number(page ?? 1) || 1, 1)
  const rows = await findingSelect().orderBy('f.created_at', 'desc').limit(size).offset((current - 1) * size).execute()
  const [{ n }] = await db.selectFrom('findings').select(sql<number>`count(*)::int`.as('n')).execute()
  return c.json({ items: rows.map(findingDto), total: Number(n), page: current, page_size: size })
})

api.get('/api/exploration/findings/stats', async (c) => {
  const bySeverity = await db.selectFrom('findings').select(['severity']).select(sql<number>`count(*)::int`.as('n')).groupBy('severity').execute()
  const byStatus = await db.selectFrom('findings').select(['status']).select(sql<number>`count(*)::int`.as('n')).groupBy('status').execute()
  const classes = await db.selectFrom('findings').select('vulnclass').distinct().where('vulnclass', '<>', '').orderBy('vulnclass').execute()
  const severity = Object.fromEntries(bySeverity.map((row) => [row.severity, Number(row.n)]))
  const status = Object.fromEntries(byStatus.map((row) => [row.status, Number(row.n)]))
  return c.json({
    total: Object.values(severity).reduce((a, b) => a + b, 0),
    pending: status.pending ?? 0,
    critical: severity.critical ?? 0,
    high: severity.high ?? 0,
    medium: severity.medium ?? 0,
    low: severity.low ?? 0,
    vulnclasses: classes.map((row) => row.vulnclass),
    tasks: await db
      .selectFrom('findings as f')
      .leftJoin('tasks as t', 't.id', 'f.task_id')
      .select(['f.task_id as id', sql<string>`coalesce(t.name, '')`.as('name'), sql<string>`coalesce(t.description, '')`.as('description')])
      .select(sql<number>`count(*)::int`.as('count'))
      .where('f.task_id', 'is not', null)
      .groupBy(['f.task_id', 't.name', 't.description'])
      .orderBy(sql`max(f.created_at)`, 'desc')
      .execute()
  })
})

api.get('/api/exploration/findings/:id', async (c) => {
  const id = c.req.param('id')
  const row = await db
    .selectFrom('findings')
    .selectAll()
    .where((eb) => eb.or([eb('id', '=', id), eb('node_id', '=', id)]))
    .executeTakeFirst()
  if (!row) return c.json({ error: 'not found' }, 404)
  const node = row.node_id ? await db.selectFrom('exploration_nodes').select(['payload', 'created_at']).where('id', '=', row.node_id).executeTakeFirst() : null
  const payload = parseJson(node?.payload) as any
  return c.json({
    traffic_count: 0,
    evidence_version: 0,
    report_evidence_version: 0,
    report_stale: false,
    id: String(row.node_id ?? row.id),
    finding_id: String(row.id),
    vulnclass: row.vulnclass,
    ...(row.name ? { name: row.name } : {}),
    severity: row.severity,
    status: row.status,
    summary: row.summary,
    evidence: row.evidence,
    ...(row.report ? { report: row.report } : {}),
    ...(payload?.summary && !row.summary ? { summary: payload.summary } : {}),
    ...(row.task_id == null ? {} : { task_id: String(row.task_id) }),
    ts: (node?.created_at ?? row.created_at).toISOString()
  })
})

api.get('/api/exploration/nodes', async (c) => {
  const taskId = c.req.query('task') ?? ''
  const page = Math.max(Number(c.req.query('page') ?? 1) || 1, 1)
  const size = Math.min(Number(c.req.query('size') ?? 20) || 20, 200)
  const task = taskId
    ? await db.selectFrom('tasks').select(['id', 'exploration_id']).where('id', '=', taskId).executeTakeFirst()
    : null
  if (!task) return c.json({ items: [], total: 0, page, size, edges: [], refs: {} })

  const kinds = (c.req.query('kind') ?? '').split(',').filter(Boolean)
  const states = (c.req.query('state') ?? '').split(',').filter(Boolean)
  let query = db.selectFrom('exploration_nodes').selectAll().where('exploration_id', '=', task.exploration_id)
  let countQuery = db.selectFrom('exploration_nodes').select(sql<number>`count(*)::int`.as('n')).where('exploration_id', '=', task.exploration_id)
  if (kinds.length) {
    query = query.where('kind', 'in', kinds)
    countQuery = countQuery.where('kind', 'in', kinds)
  }
  if (states.length) {
    query = query.where('state', 'in', states)
    countQuery = countQuery.where('state', 'in', states)
  }
  const order = c.req.query('order') === 'asc' ? 'asc' : 'desc'
  const rows = await query.orderBy('priority', 'desc').orderBy('id', order).limit(size).offset((page - 1) * size).execute()
  const [{ n }] = await countQuery.execute()
  const ids = rows.map((row) => row.id)
  const edges = ids.length
    ? await db.selectFrom('exploration_edges').selectAll().where((eb) => eb.or([eb('src_id', 'in', ids), eb('dst_id', 'in', ids)])).execute()
    : []
  return c.json({
    items: rows.map((row) => ({
      id: String(row.id),
      type: row.kind,
      payload: JSON.stringify(parseJson(row.payload) ?? {}),
      priority: row.priority,
      state: row.state,
      ...(row.origin == null ? {} : { origin: row.origin }),
      ts: row.created_at.toISOString()
    })),
    total: Number(n),
    page,
    size,
    edges: edges.map((edge) => ({ src: String(edge.src_id), dst: String(edge.dst_id), rel: edge.rel })),
    refs: {}
  })
})
