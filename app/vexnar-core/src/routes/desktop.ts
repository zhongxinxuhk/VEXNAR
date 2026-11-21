// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { timingSafeEqual } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, resolve } from 'node:path'
import { Hono, type MiddlewareHandler } from 'hono'
import { meta, operations, parseJson, store } from '../context.ts'

/**
 * /api/desktop/* — the loopback model gateway plus preferences and project
 * ownership, migrated from the Go `server/desktop_*.go` handlers. Upstream
 * base URLs and API keys live only in the local SQLite meta store and never
 * leave this process except on the outbound model request itself.
 *
 * Every route is guarded by the per-launch token (`VEXNAR_DESKTOP_TOKEN`, or
 * `settings.desktop_token` in meta); an empty token disables the namespace.
 */
const DESKTOP_TOKEN_HEADER = 'x-vexnar-desktop-token'
const APPROVAL_HEADER = 'x-vexnar-user-approved'
const TASK_PAGE_SIZE = 50
const HISTORY_SIZE = 40

const REASONING_EFFORTS = new Set(['', 'low', 'medium', 'high', 'xhigh', 'max'])
const THINKING_TYPES = new Set(['', 'disabled', 'enabled'])
const ACCESS_MODES = new Set(['request', 'balanced', 'full'])

interface DesktopLLM {
  provider: string
  model: string
  base_url: string
  api_key: string
  reasoning_effort: string
  thinking_type: string
}

function rfc3339(date: Date): string {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = (value: number) => String(Math.floor(Math.abs(value))).padStart(2, '0')
  return `${date.toISOString().slice(0, 23)}${sign}${pad(offset / 60)}:${pad(offset % 60)}`
}

function apiErr(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

// ── meta helpers ────────────────────────────────────────────────────────────

async function readSettings(): Promise<Record<string, any>> {
  const value = await meta.table<any>('settings')
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

async function writeSettings(next: Record<string, any>): Promise<void> {
  meta.reload()
  const tables = await meta.load()
  tables['settings'] = next
  await meta.save(tables)
}

async function readLLM(): Promise<DesktopLLM> {
  const settings = await readSettings()
  const llm = settings.desktop_llm ?? {}
  return {
    provider: String(llm.provider ?? ''),
    model: String(llm.model ?? ''),
    base_url: String(llm.base_url ?? ''),
    api_key: String(llm.api_key ?? ''),
    reasoning_effort: String(llm.reasoning_effort ?? ''),
    thinking_type: String(llm.thinking_type ?? '')
  }
}

async function writeLLM(llm: DesktopLLM): Promise<void> {
  const settings = await readSettings()
  settings.desktop_llm = llm
  await writeSettings(settings)
}

function llmStatus(llm: DesktopLLM) {
  return {
    configured: Boolean(llm.provider && llm.base_url && llm.model && llm.api_key),
    provider: llm.provider,
    format: llm.provider,
    model: llm.model,
    base_url: llm.base_url,
    key_set: Boolean(llm.api_key),
    reasoning_effort: llm.reasoning_effort,
    thinking_type: llm.thinking_type
  }
}

/** Keep only the API root: the provider appends its own endpoint path. */
function normalizeBaseURL(raw: string): string {
  let base = (raw ?? '').trim()
  for (const suffix of ['/chat/completions', '/v1/messages', '/responses']) {
    base = base.replace(/\/+$/, '')
    if (base.endsWith(suffix)) base = base.slice(0, base.length - suffix.length)
  }
  return base.replace(/\/+$/, '')
}

async function accessMode(): Promise<string> {
  const mode = String((await readSettings()).desktop_access_mode ?? '')
  return ACCESS_MODES.has(mode) ? mode : 'full'
}

async function desktopToken(): Promise<string> {
  const env = (process.env.VEXNAR_DESKTOP_TOKEN ?? '').trim()
  if (env) return env
  return String((await readSettings()).desktop_token ?? '').trim()
}

function tokenMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

const desktopAuth: MiddlewareHandler = async (c, next) => {
  const expected = await desktopToken()
  if (!expected) return c.json({ error: '桌面端令牌未配置' }, 401)
  if (!tokenMatches(c.req.header(DESKTOP_TOKEN_HEADER) ?? '', expected)) {
    return c.json({ error: '桌面端令牌无效' }, 401)
  }
  return next()
}

// ── project helpers ─────────────────────────────────────────────────────────

function projectDto(row: any) {
  return {
    id: String(row.id),
    root_path: String(row.root_path ?? ''),
    name: String(row.name ?? ''),
    created_at: String(row.created_at ?? '')
  }
}

function projectTaskDto(task: any) {
  return {
    id: String(task.id),
    name: String(task.name ?? ''),
    description: String(task.description ?? ''),
    goal: String(task.goal ?? ''),
    status: String(task.status ?? ''),
    paused: Boolean(task.paused),
    queued: Boolean(task.queued),
    pinned: task.pinned_at != null
  }
}

function conversationDto(row: any) {
  const dto: Record<string, any> = {
    id: Number(row.id),
    agent_key: String(row.agent_key ?? ''),
    title: String(row.title ?? ''),
    workspace: String(row.workspace ?? ''),
    pinned: Boolean(row.pinned ?? (row.pinned_at != null)),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? '')
  }
  if (row.llm_profile_id != null) dto.llm_profile_id = Number(row.llm_profile_id)
  if (row.project_id != null) dto.project_id = Number(row.project_id)
  if (row.pinned_at != null) dto.pinned_at = String(row.pinned_at)
  return dto
}

async function canonicalWorkspace(workspace: string): Promise<string> {
  const trimmed = workspace.trim()
  if (!trimmed) return ''
  const absolute = isAbsolute(trimmed) ? trimmed : resolve(trimmed)
  try {
    return await realpath(absolute)
  } catch {
    return absolute
  }
}

function parsePositiveId(raw: string): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

async function projectTaskRow(projectId: string, taskId: string) {
  const link = await operations.writer.readRecord('desktop_project_tasks', taskId)
  if (!link || String(link.project_id) !== String(projectId)) return null
  return store.tasks.get(taskId)
}

async function listProjectTaskLinks(projectId: string): Promise<any[]> {
  const links = await operations.writer.list('desktop_project_tasks')
  return links
    .filter((link) => String(link.project_id) === String(projectId))
    .sort((a, b) => Number(b.task_id) - Number(a.task_id))
}

// ── session / transcript helpers ────────────────────────────────────────────

function parseActivitySession(key: string) {
  if (key === '' || key === 'main') return { valid: true, main: true }
  if (key.startsWith('main:')) {
    const seg = Number(key.slice(5))
    if (!Number.isInteger(seg) || seg < 0) return { valid: false }
    return { valid: true, main: true, mainSeg: seg }
  }
  if (key === 'plan') return { valid: true, plan: true }
  if (key.startsWith('intent:')) {
    const id = Number(key.slice(7))
    if (!Number.isInteger(id)) return { valid: false }
    return { valid: true, nodeId: String(id) }
  }
  return { valid: false }
}

async function explorationActivity(explorationId: number): Promise<any[]> {
  const rows = await operations.writer.list('activity')
  return rows.filter((row) => Number(row.exploration_id) === Number(explorationId))
}

function currentMainSeg(activity: any[]): number {
  let max = 0
  for (const row of activity) max = Math.max(max, Number(row.main_seg ?? 0))
  return max
}

function mainSegments(activity: any[]): number[] {
  const segments = new Set<number>([0])
  for (const row of activity) {
    if (String(row.worker ?? '') === 'mainagent') segments.add(Number(row.main_seg ?? 0))
  }
  return [...segments].sort((a, b) => b - a)
}

function filterActivitySession(rows: any[], filter: ReturnType<typeof parseActivitySession>): any[] {
  if (filter.nodeId != null) {
    return rows.filter((row) => String(row.node_id ?? '') === String(filter.nodeId))
  }
  if (filter.plan) return rows.filter((row) => String(row.worker ?? '') === 'planner')
  if (filter.main) {
    const seg = filter.mainSeg ?? 0
    if (seg === 0) return rows.filter((row) => String(row.worker ?? '') === 'mainagent' && Number(row.main_seg ?? 0) === 0)
    return rows.filter((row) => String(row.worker ?? '') === 'mainagent' && Number(row.main_seg ?? 0) === seg)
  }
  return rows
}

function transcriptText(row: any): string {
  const kind = String(row.kind ?? '')
  if (kind === 'tool_use' || kind === 'tool_result') return ''
  if ((kind === 'text' || kind === 'result') && !row.is_error) return String(row.detail ?? row.summary ?? '')
  return String(row.summary ?? '')
}

function firstLine(text: string, max: number): string {
  let s = String(text ?? '').trim()
  const nl = s.search(/[\r\n]/)
  if (nl >= 0) s = s.slice(0, nl)
  const chars = [...s]
  if (chars.length > max) s = chars.slice(0, max).join('') + '…'
  return s
}

async function intentBranches(explorationId: number, before: number) {
  const rows = (await operations.writer.list('nodes'))
    .filter((node) => Number(node.exploration_id) === Number(explorationId) && node.kind === 'intent' && node.state !== 'deleted')
    .sort((a, b) => Number(b.id) - Number(a.id))
  const filtered = before > 0 ? rows.filter((node) => Number(node.id) < before) : rows
  const hasMore = filtered.length > HISTORY_SIZE
  const page = filtered.slice(0, HISTORY_SIZE)
  const branches = page.map((node) => {
    const payload = parseJson(node.payload) as any
    const id = String(node.id)
    return { key: `intent:${id}`, id, title: firstLine(String(payload?.summary ?? ''), 200), status: String(node.state ?? '') }
  })
  const next = hasMore && page.length ? String(page[page.length - 1].id) : null
  return { branches, next }
}

async function transcriptPage(explorationId: number, filter: ReturnType<typeof parseActivitySession>, before: number) {
  let rows = filterActivitySession(await explorationActivity(explorationId), filter)
  rows = rows
    .filter((row) => ['user', 'text', 'result', 'tool_use', 'tool_result'].includes(String(row.kind ?? '')))
    .sort((a, b) => Number(b.id) - Number(a.id))
  if (before > 0) rows = rows.filter((row) => Number(row.id) < before)
  const hasMore = rows.length > HISTORY_SIZE
  const page = rows.slice(0, HISTORY_SIZE)
  const asc = [...page].reverse()
  const items = asc.map((row) => ({
    id: String(row.id),
    kind: String(row.kind ?? ''),
    ...(row.tool ? { tool: String(row.tool) } : {}),
    text: transcriptText(row),
    at: String(row.created_at ?? ''),
    is_error: Boolean(row.is_error)
  }))
  const next = hasMore && asc.length ? String(asc[0].id) : null
  return { items, next }
}

// ── model gateway ───────────────────────────────────────────────────────────

async function listModels(c: any) {
  const llm = await readLLM()
  if (!llm.base_url || !llm.api_key) return c.json({ error: '模型服务尚未配置' }, 409)
  const base = llm.base_url.replace(/\/+$/, '')
  let upstream: Response
  try {
    upstream = await fetch(`${base}/models`, {
      method: 'GET',
      headers: { accept: 'application/json', authorization: `Bearer ${llm.api_key}` }
    })
  } catch (error: any) {
    return c.json({ error: `读取模型列表失败: ${String(error?.message ?? error)}` }, 502)
  }
  const headers = new Headers()
  const contentType = upstream.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)
  return new Response(upstream.body, { status: upstream.status, headers })
}

async function protocolProxy(c: any, upstreamPath: string, wantFormat: string) {
  if ((await accessMode()) === 'request' && c.req.header(APPROVAL_HEADER) !== '1') {
    return c.json({ error: '当前访问模式要求先批准模型联网请求' }, 403)
  }
  const llm = await readLLM()
  if (!llm.base_url || !llm.api_key) return c.json({ error: '模型服务尚未配置' }, 409)
  if (llm.provider !== wantFormat) {
    return c.json({ error: `当前激活配置的协议是 ${llm.provider}，请改用对应的网关端点` }, 409)
  }
  const base = llm.base_url.replace(/\/+$/, '')
  const target = `${base}${upstreamPath}`

  const body = await c.req.arrayBuffer()
  const headers = new Headers()
  const contentType = c.req.header('content-type')
  if (contentType) headers.set('content-type', contentType)
  const accept = c.req.header('accept')
  if (accept) headers.set('accept', accept)
  headers.set('authorization', `Bearer ${llm.api_key}`)
  // Never forward the desktop token or approval header upstream.

  let upstream: Response
  try {
    upstream = await fetch(target, { method: 'POST', headers, body })
  } catch (error: any) {
    return c.json({ error: `上游模型请求失败: ${String(error?.message ?? error)}` }, 502)
  }
  const outHeaders = new Headers()
  const outType = upstream.headers.get('content-type')
  if (outType) outHeaders.set('content-type', outType)
  const outEncoding = upstream.headers.get('content-encoding')
  if (outEncoding) outHeaders.set('content-encoding', outEncoding)
  // Stream the upstream body verbatim so SSE chunks reach the caller live.
  return new Response(upstream.body, { status: upstream.status, headers: outHeaders })
}

// ── registration ────────────────────────────────────────────────────────────

export function register(api: Hono) {
  const desktop = new Hono()
  desktop.use('*', desktopAuth)

  // preferences
  desktop.get('/preferences', async (c) => c.json({ access_mode: await accessMode() }))
  desktop.put('/preferences', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const mode = String(body.access_mode ?? '')
    if (!ACCESS_MODES.has(mode)) return c.json({ error: 'access_mode 必须是 request、balanced 或 full' }, 400)
    const settings = await readSettings()
    settings.desktop_access_mode = mode
    await writeSettings(settings)
    return c.json({ access_mode: mode })
  })

  // llm config (status / key / models / configure / clear)
  desktop.get('/llm', async (c) => c.json(llmStatus(await readLLM())))
  desktop.get('/llm/key', async (c) => {
    const llm = await readLLM()
    if (!llm.api_key) return c.json({ error: '尚未配置模型 API Key' }, 409)
    return c.json({ api_key: llm.api_key })
  })
  desktop.get('/llm/models', listModels)
  desktop.post('/llm/configure', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const current = await readLLM()

    let provider = String(body.provider ?? '').trim()
    if (!provider) {
      provider = current.provider === 'openai' || current.provider === 'openai-responses'
        ? current.provider
        : 'openai-responses'
    }
    if (provider !== 'openai' && provider !== 'openai-responses') {
      return c.json({ error: '桌面网关只支持 openai / openai-responses 协议' }, 400)
    }

    const rawBase = String(body.base_url ?? '').trim()
    const baseURL = rawBase ? normalizeBaseURL(rawBase) : current.base_url
    const model = String(body.model ?? '').trim() || current.model
    const apiKey = String(body.api_key ?? '').trim() || current.api_key

    let reasoningEffort = current.reasoning_effort
    if (body.reasoning_effort !== undefined) {
      const effort = String(body.reasoning_effort).trim()
      if (!REASONING_EFFORTS.has(effort)) return c.json({ error: 'reasoning_effort 必须是 low / medium / high / xhigh / max 或空' }, 400)
      reasoningEffort = effort
    }
    let thinkingType = current.thinking_type
    if (body.thinking_type !== undefined) {
      const thinking = String(body.thinking_type).trim()
      if (!THINKING_TYPES.has(thinking)) return c.json({ error: 'thinking_type 必须是 disabled / enabled 或空' }, 400)
      thinkingType = thinking
    }

    if (!baseURL || !model || !apiKey) return c.json({ error: 'base_url、model 和 api_key 不能为空' }, 400)
    try {
      const parsed = new URL(baseURL)
      if (!parsed.protocol || !parsed.host) throw apiErr(400, 'base_url 无效')
    } catch {
      return c.json({ error: 'base_url 无效' }, 400)
    }

    const next: DesktopLLM = { provider, model, base_url: baseURL, api_key: apiKey, reasoning_effort: reasoningEffort, thinking_type: thinkingType }
    await writeLLM(next)
    return c.json(llmStatus(next))
  })
  desktop.post('/llm/clear', async (c) => {
    const next: DesktopLLM = { provider: '', model: '', base_url: '', api_key: '', reasoning_effort: '', thinking_type: '' }
    await writeLLM(next)
    return c.json(llmStatus(next))
  })

  // OpenAI-compatible loopback gateway
  desktop.get('/openai/v1/models', listModels)
  desktop.post('/openai/v1/chat/completions', (c) => protocolProxy(c, '/chat/completions', 'openai'))
  desktop.post('/openai/v1/responses', (c) => protocolProxy(c, '/responses', 'openai-responses'))

  // projects
  desktop.get('/projects', async (c) => {
    const rows = await operations.writer.list('desktop_projects')
    const projects = rows.map(projectDto).sort((a, b) => Number(a.id) - Number(b.id))
    return c.json({ projects })
  })
  desktop.post('/projects', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const rootPath = String(body.root_path ?? '').trim()
    if (!rootPath || !isAbsolute(rootPath)) return c.json({ error: '需要项目目录的绝对路径' }, 400)
    let info: Awaited<ReturnType<typeof stat>> | null = null
    try { info = await stat(rootPath) } catch { info = null }
    if (!info || !info.isDirectory()) return c.json({ error: '项目目录不可用' }, 400)
    const root = await canonicalWorkspace(rootPath)
    if (!root) return c.json({ error: '项目目录不可用' }, 400)

    const rows = await operations.writer.list('desktop_projects')
    const existing = rows.find((row) => String(row.root_path) === root)
    if (existing) return c.json(projectDto(existing))

    const id = (await operations.writer.maxKey('desktop_projects')) + 1
    const record = { id: String(id), root_path: root, name: basename(root), created_at: rfc3339(new Date()) }
    await operations.writer.put({ table: 'desktop_projects', key: String(id), record })
    return c.json(projectDto(record))
  })

  desktop.get('/projects/:projectID/tasks', async (c) => {
    const projectId = parsePositiveId(c.req.param('projectID'))
    if (projectId == null) return c.json({ error: '无效的 projectID' }, 400)
    const project = await operations.writer.readRecord('desktop_projects', String(projectId))
    if (!project) return c.json({ error: 'desktop project not found' }, 404)

    let before = 0
    const beforeRaw = c.req.query('before') ?? ''
    if (beforeRaw !== '') {
      before = Number(beforeRaw)
      if (!Number.isInteger(before) || before <= 0) return c.json({ error: '无效的任务分页游标' }, 400)
    }

    let links = await listProjectTaskLinks(String(projectId))
    if (before > 0) links = links.filter((link) => Number(link.task_id) < before)
    const hasMore = links.length > TASK_PAGE_SIZE
    links = links.slice(0, TASK_PAGE_SIZE)

    const tasks: any[] = []
    for (const link of links) {
      const task = await store.tasks.get(String(link.task_id))
      if (task) tasks.push(projectTaskDto(task))
    }
    const next = hasMore && links.length ? String(links[links.length - 1].task_id) : null
    return c.json({ tasks, next_before: next })
  })

  desktop.get('/projects/:projectID/tasks/:taskID', async (c) => {
    const projectId = parsePositiveId(c.req.param('projectID'))
    const taskId = parsePositiveId(c.req.param('taskID'))
    if (projectId == null || taskId == null) return c.json({ error: '无效的 projectID 或 taskID' }, 400)
    const task = await projectTaskRow(String(projectId), String(taskId))
    if (!task) return c.json({ error: 'task not found' }, 404)
    return c.json(projectTaskDto(task))
  })

  desktop.get('/projects/:projectID/tasks/:taskID/sessions', async (c) => {
    const projectId = parsePositiveId(c.req.param('projectID'))
    const taskId = parsePositiveId(c.req.param('taskID'))
    if (projectId == null || taskId == null) return c.json({ error: '无效的 projectID 或 taskID' }, 400)
    const task = await projectTaskRow(String(projectId), String(taskId))
    if (!task) return c.json({ error: 'task not found' }, 404)

    let before = 0
    const beforeRaw = c.req.query('before') ?? ''
    if (beforeRaw !== '') {
      before = Number(beforeRaw)
      if (!Number.isInteger(before) || before < 1) return c.json({ error: '无效的历史分页游标' }, 400)
    }

    const activity = await explorationActivity(Number(task.exploration_id))
    const { branches, next } = await intentBranches(Number(task.exploration_id), before)
    return c.json({ main_segments: mainSegments(activity), branches, next_before: next })
  })

  desktop.get('/projects/:projectID/tasks/:taskID/history', async (c) => {
    const projectId = parsePositiveId(c.req.param('projectID'))
    const taskId = parsePositiveId(c.req.param('taskID'))
    if (projectId == null || taskId == null) return c.json({ error: '无效的 projectID 或 taskID' }, 400)
    const task = await projectTaskRow(String(projectId), String(taskId))
    if (!task) return c.json({ error: 'task not found' }, 404)

    let before = 0
    const beforeRaw = c.req.query('before') ?? ''
    if (beforeRaw !== '') {
      before = Number(beforeRaw)
      if (!Number.isInteger(before) || before < 1) return c.json({ error: '无效的历史分页游标' }, 400)
    }

    const session = c.req.query('session') ?? ''
    const filter = parseActivitySession(session)
    if (!filter.valid) return c.json({ error: '无效的会话' }, 400)

    const activity = await explorationActivity(Number(task.exploration_id))
    let sessionKey = session
    if (filter.main) {
      const current = currentMainSeg(activity)
      const seg = filter.mainSeg ?? current
      if (seg > current) return c.json({ error: 'session not found' }, 404)
      sessionKey = `main:${seg}`
      filter.mainSeg = seg
    } else if (filter.nodeId != null) {
      const node = (await operations.writer.list('nodes')).find((row) => String(row.id) === String(filter.nodeId))
      if (!node || node.kind !== 'intent' || node.state === 'deleted') return c.json({ error: 'session not found' }, 404)
    }

    const page = await transcriptPage(Number(task.exploration_id), filter, before)
    return c.json({ session_key: sessionKey, items: page.items, next_before: page.next })
  })

  desktop.put('/projects/:projectID/tasks/:taskID', async (c) => {
    const projectId = parsePositiveId(c.req.param('projectID'))
    const taskId = parsePositiveId(c.req.param('taskID'))
    if (projectId == null || taskId == null) return c.json({ error: '无效的 projectID 或 taskID' }, 400)

    const project = await operations.writer.readRecord('desktop_projects', String(projectId))
    if (!project) return c.json({ error: 'desktop project not found' }, 404)
    const task = await store.tasks.get(String(taskId))
    if (!task) return c.json({ error: 'task not found' }, 404)

    const existing = await operations.writer.readRecord('desktop_project_tasks', String(taskId))
    if (existing) {
      if (String(existing.project_id) !== String(projectId)) return c.json({ error: 'task already belongs to another project' }, 409)
      return c.json({ project_id: String(projectId), task_id: String(taskId) })
    }

    const record = { task_id: String(taskId), project_id: String(projectId), bound_at: rfc3339(new Date()) }
    await operations.writer.put({ table: 'desktop_project_tasks', key: String(taskId), record })
    store.invalidate?.(['tasks'])
    return c.json({ project_id: String(projectId), task_id: String(taskId) })
  })

  desktop.get('/task-projects/:taskID', async (c) => {
    const taskId = parsePositiveId(c.req.param('taskID'))
    if (taskId == null) return c.json({ error: '无效的 taskID' }, 400)
    const task = await store.tasks.get(String(taskId))
    if (!task) return c.json({ error: 'task not found' }, 404)
    const link = await operations.writer.readRecord('desktop_project_tasks', String(taskId))
    return c.json({ project_id: link ? String(link.project_id) : null })
  })

  desktop.post('/conversations/:conversationID/project', async (c) => {
    const conversationId = parsePositiveId(c.req.param('conversationID'))
    if (conversationId == null) return c.json({ error: '无效的会话编号' }, 400)
    const body = await c.req.json().catch(() => ({}))
    const projectId = Number(body.project_id)
    if (!Number.isInteger(projectId) || projectId <= 0) return c.json({ error: '需要有效的 project_id' }, 400)

    const project = await operations.writer.readRecord('desktop_projects', String(projectId))
    if (!project) return c.json({ error: '项目不存在' }, 404)
    const conversation = await operations.writer.readRecord('conversations', String(conversationId))
    if (!conversation) return c.json({ error: '会话不存在' }, 404)

    const currentProject = conversation.project_id
    if (currentProject != null && Number(currentProject) !== Number(projectId)) {
      return c.json({ error: '会话已归属其他项目' }, 409)
    }

    const next = { ...conversation, project_id: Number(projectId), updated_at: rfc3339(new Date()) }
    delete next.rev
    const [written] = await operations.writer.commit([{
      table: 'conversations',
      key: String(conversationId),
      record: next,
      expectedRev: Number(conversation.rev ?? 0)
    }])
    return c.json(conversationDto(written))
  })

  api.route('/api/desktop', desktop)
}
