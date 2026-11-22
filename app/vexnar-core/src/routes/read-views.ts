// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Hono } from 'hono'
import { summarizeTasks } from '../../../vexnar-store/src/task-status.ts'
import { meta, parseJson, store } from '../context.ts'

export const taskDto = (row: any, metrics?: any) => ({
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
  last_activity_unix: Number(metrics?.last_activity_unix ?? 0),
  paused: row.paused,
  queued: row.queued,
  tokens: {
    input_tokens: Number(metrics?.input_tokens ?? 0),
    output_tokens: Number(metrics?.output_tokens ?? 0),
    cache_read_tokens: Number(metrics?.cache_read_tokens ?? 0),
    cache_write_tokens: Number(metrics?.cache_write_tokens ?? 0)
  },
  goals_total: Number(metrics?.goals_total ?? 0),
  goals_met: Number(metrics?.goals_met ?? 0),
  in_flight: Number(metrics?.in_flight ?? 0),
  findings: {
    critical: Number(metrics?.findings?.critical ?? 0),
    high: Number(metrics?.findings?.high ?? 0),
    medium: Number(metrics?.findings?.medium ?? 0),
    low: Number(metrics?.findings?.low ?? 0)
  },
  ...(row.llm_profile_id == null ? {} : { llm_profile_id: row.llm_profile_id }),
  llm_profile_ids: [],
  ...(row.active_llm_profile_id == null ? {} : { active_llm_profile_id: row.active_llm_profile_id }),
  llm_failover_state: 'default',
  source_task_ids: [],
  company_ids: [],
  coverage_enabled: row.coverage_enabled
})

export const findingDto = (row: any) => ({
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

export const goalDto = (row: any) => {
  const payload = typeof row.payload === 'string' ? parseJson(row.payload) : row.payload ?? {}
  return {
    id: String(row.id),
    text: String((payload as any).text ?? ''),
    ...((payload as any).vulnclass ? { vulnclass: (payload as any).vulnclass } : {}),
    state: row.state,
    ...(row.origin == null ? {} : { origin: row.origin }),
    ts: String(row.created_at).replace(/\.\d+/, '')
  }
}

export function activityDto(row: any) {
  const out: Record<string, unknown> = {
    seq: Number(row.id),
    ...(row.node_id == null ? {} : { node_id: Number(row.node_id) }),
    ...(row.worker ? { worker: row.worker } : {}),
    ts: String(row.created_at ?? '').replace(/\.\d+/, ''),
    ...(row.kind ? { kind: row.kind } : {}),
    ...(row.tool ? { tool: row.tool } : {}),
    ...(row.tool_use_id ? { tool_use_id: row.tool_use_id } : {}),
    is_error: Boolean(row.is_error),
    summary: row.summary ?? '',
    metadata: row.metadata ?? {},
    ...(row.input_tokens == null ? {} : { input_tokens: Number(row.input_tokens) }),
    ...(row.output_tokens == null ? {} : { output_tokens: Number(row.output_tokens) }),
    ...(row.cache_read_tokens == null ? {} : { cache_read_tokens: Number(row.cache_read_tokens) }),
    ...(row.cache_write_tokens == null ? {} : { cache_write_tokens: Number(row.cache_write_tokens) }),
    ...(row.main_seg == null ? {} : { main_seg: Number(row.main_seg) })
  }
  return out
}

/** Stored task, finding and usage views shared by the standalone and embedded hosts. */
export function registerReadViews(api: Hono): void {
  // ── agents / profiles / categories / templates (vexnar-meta) ─────────────
  api.get('/api/agents', async (c) => c.json({ agents: await meta.table('agents') }))

  api.get('/api/agents/:key', async (c) => {
    const agents = await meta.table<any[]>('agents')
    const row = agents.find((agent) => agent.key === c.req.param('key'))
    if (!row) return c.json({ error: 'not found' }, 404)
    return c.json({ agent: row })
  })

  api.get('/api/task-categories', async (c) => c.json({ categories: await meta.table('taskCategories') }))

  api.get('/api/task-templates', async (c) => c.json({ templates: await meta.table('taskTemplates') }))

  api.get('/api/companies', async (c) => c.json(await store.companies.list()))

  // 任务清单：无 page/size → 全量（web 控制台、概览卡、MCP 调用方照旧）；带 page/size →
  // {tasks,total,page,size} 窗口。status/q 先收窄集合再取窗口，所以 total 描述的是筛选后的
  // 全集而不是当前页 —— 与 Go 的 listTasks 同一套语义。
  const TASK_PAGE_MAX_SIZE = 200

  api.get('/api/tasks', async (c) => {
    const status = (c.req.query('status') ?? '').trim()
    const needle = (c.req.query('q') ?? '').trim().toLowerCase()
    const rows = await store.tasks.list()
    const metrics = await store.taskMetrics()
    const all = rows
      .map((row) => taskDto(row, metrics.get(Number(row.exploration_id))))
      .filter((task) => status === '' || String(task.status) === status)
      .filter((task) => needle === '' || [task.id, task.name, task.description, task.goal]
        .some((field) => String(field ?? '').toLowerCase().includes(needle)))
    const paged = c.req.query('page') != null || c.req.query('size') != null
    if (!paged) return c.json({ tasks: all })
    const page = Math.max(Number(c.req.query('page') ?? 1) || 1, 1)
    const size = Math.min(Math.max(Number(c.req.query('size') ?? 50) || 50, 1), TASK_PAGE_MAX_SIZE)
    return c.json({
      tasks: all.slice((page - 1) * size, (page - 1) * size + size),
      total: all.length,
      page,
      size
    })
  })

  // 任务清单的**聚合口径**：一次回答「有多少任务、各自什么状态、完成率/目标达成/
  // 在途意图/漏洞/Token 各是多少、窗口内新建了多少」。KPI 卡与健康度读这一条，
  // 不再各自拿清单（或更糟：当前页）去重算。契约与 Go 的 GET /api/tasks/summary 一致。
  api.get('/api/tasks/summary', async (c) => {
    const days = Math.max(Number(c.req.query('days') ?? 30) || 30, 1)
    const rows = await store.tasks.list()
    const metrics = await store.taskMetrics()
    return c.json(summarizeTasks(rows, metrics, { days }))
  })

  api.get('/api/tasks/:id', async (c) => {
    const row = await store.tasks.get(c.req.param('id'))
    if (!row) return c.json({ error: 'not found' }, 404)
    const metrics = await store.taskMetrics()
    return c.json(taskDto(row, metrics.get(Number(row.exploration_id))))
  })

  api.get('/api/tasks/:id/metrics', async (c) => {
    const task = await store.tasks.get(c.req.param('id'))
    if (!task) return c.json({ error: 'not found' }, 404)
    const metrics = (await store.taskMetrics()).get(Number(task.exploration_id))
    return c.json({
      task_id: Number(task.id),
      exploration_id: Number(task.exploration_id),
      mttd_seconds: null,
      findings_total: metrics ? Object.values(metrics.findings).reduce((a, b) => a + b, 0) : 0,
      findings_by_severity: metrics ? { critical: metrics.findings.critical, high: metrics.findings.high, medium: metrics.findings.medium, low: metrics.findings.low } : {},
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

  api.get('/api/assets/counts', async (c) => c.json(await store.assets.counts(c.req.query('task_id') || undefined)))

  // ── findings / nodes ──────────────────────────────────────────────────────
  api.get('/api/exploration/findings', async (c) => {
    const page = c.req.query('page')
    const limit = c.req.query('limit')
    if (page == null && limit == null) {
      const rows = await store.findings.list(500)
      return c.json(rows.map(findingDto))
    }
    const size = Math.min(Number(limit ?? 20) || 20, 200)
    const current = Math.max(Number(page ?? 1) || 1, 1)
    const severity = (c.req.query('severity') ?? '').trim().toLowerCase()
    const status = (c.req.query('status') ?? '').trim().toLowerCase()
    const vulnclass = (c.req.query('vulnclass') ?? '').trim()
    const taskId = (c.req.query('task_id') ?? '').trim()
    const query = (c.req.query('q') ?? '').trim().toLowerCase()
    let rows = await store.findings.list(100000)
    if (severity) rows = rows.filter((row: any) => String(row.severity).toLowerCase() === severity)
    if (status) rows = rows.filter((row: any) => String(row.status).toLowerCase() === status)
    if (vulnclass) rows = rows.filter((row: any) => String(row.vulnclass) === vulnclass)
    if (taskId) rows = rows.filter((row: any) => String(row.task_id ?? '') === taskId)
    if (query) {
      rows = rows.filter((row: any) => [row.name, row.summary, row.evidence, row.vulnclass].some((value) => String(value ?? '').toLowerCase().includes(query)))
    }
    const total = rows.length
    const pageRows = rows.slice((current - 1) * size, current * size)
    return c.json({ items: pageRows.map(findingDto), total, page: current, page_size: size })
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

  api.get('/api/tasks/:id/coverage', async (c) => {
    const task = await store.tasks.get(c.req.param('id'))
    if (!task) return c.json({ error: 'task not found' }, 404)
    if (task.coverage_enabled === false) {
      return c.json({ enabled: false, scope_rows: 0, denominator: 0, tested: 0, pct: null, by_type: [] })
    }
    return c.json({ enabled: true, ...(await store.coverage(c.req.param('id'))) })
  })

  api.get('/api/tasks/:id/goals', async (c) => {
    const taskId = c.req.param('id')
    const task = await store.tasks.get(taskId)
    if (!task) return c.json({ error: 'task not found' }, 404)
    const { items } = await store.nodes.page({ taskId, page: 1, size: 200, order: 'desc', kinds: ['goal'] })
    const goals = items.map(goalDto)
    return c.json({ goals })
  })

  api.get('/api/tokens/daily', async (c) => {
    const days = Math.max(Number(c.req.query('days') ?? 30) || 30, 1)
    return c.json(await store.activity.dailyTokens(days))
  })

  api.get('/api/exploration/intents', async (c) => {
    const taskId = c.req.query('task') ?? ''
    const limit = Math.min(Number(c.req.query('limit') ?? 300) || 300, 500)
    const before = c.req.query('before') ?? ''
    if (!taskId) return c.req.query('page') ? c.json({ items: [], has_more: false }) : c.json([])
    const result = await store.nodes.page({ taskId, page: 1, size: limit, order: 'desc', kinds: ['intent'], before: before && before !== '0' ? before : undefined })
    const items = result.items.map((row: any) => ({
      id: String(row.id),
      type: row.kind,
      payload: JSON.stringify(typeof row.payload === 'string' ? parseJson(row.payload) : row.payload ?? {}),
      priority: row.priority,
      state: row.state,
      ...(row.origin == null ? {} : { origin: row.origin }),
      ts: row.created_at
    }))
    if (c.req.query('page')) return c.json({ items, has_more: result.total > items.length })
    return c.json(items)
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

  // ── exploration activity list ───────────────────────────────────────────
  // No `task` → the station-wide feed (dsh overview's activity card); with a
  // `task` → that task's activity. Both answer the same DTO, so every surface
  // reads `seq`/`ts` instead of the raw store columns.
  api.get('/api/exploration/activity', async (c) => {
    const taskId = c.req.query('task') ?? ''
    const limit = Math.min(Number(c.req.query('limit') ?? 200) || 200, 500)
    const before = Number(c.req.query('before') ?? 0) || 0
    const page = taskId === ''
      ? await store.activity.recent({ limit, before })
      : await store.activity.history({ taskId, limit, before })
    const items = page.items.map(activityDto)
    return c.json({ items, snapshot: page.snapshot, cursor: page.snapshot, has_more: page.hasMore })
  })
}
