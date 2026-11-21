// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from 'hono'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { gatewayComplete, meta, operations, parseJson, store, storeRoot } from '../context.ts'

// ─────────────────────────────────────────────────────────────────────────────
// 会话 + 聊天模块（Go server/conversations.go · chat_mentions.go · chatupload.go ·
// conv_live.go · conversation_trace.go 的 TS 迁移）。
//
// 持久层：SQLite kv store（key=id）。conversations 表存会话，conversation_activities
// 表存消息/步骤；消息顺序用全局单调 id（seq），与 Go 的 BIGSERIAL 对齐。发送走模型
// 网关（gatewayComplete），mentions 从 meta 的 agents 列表解析 @提及。
// ─────────────────────────────────────────────────────────────────────────────

const CONV = 'conversations'
const CONV_ACT = 'conversation_activities'

const maxConversationDeleteBatch = 100
const maxConversationAgentKeyRunes = 120
const maxConversationTitleRunes = 200
const maxChatMentions = 10
const safeChatID = /^[A-Za-z0-9_-]+$/

// ── 进程内运行状态（单 dsh 进程，无需跨进程）──────────────────────────────────
const busy = new Map<string, boolean>()
const cancelMap = new Map<string, AbortController>()
const liveMap = new Map<string, ConvLiveText>()
const taskBusy = new Map<string, boolean>()
const taskCancel = new Map<string, AbortController>()

const convKey = (id: string | number) => `conv-${id}`
const taskKey = (id: string | number) => `task-${id}`

// 进程内单调 id 种子（单进程写，避免两次 maxKey 之间的竞态）
let convIdSeed: number | null = null
let actIdSeed: number | null = null
async function nextConvId() {
  if (convIdSeed == null) convIdSeed = await operations.writer.maxKey(CONV)
  return ++convIdSeed
}
async function nextActId() {
  if (actIdSeed == null) actIdSeed = await operations.writer.maxKey(CONV_ACT)
  return ++actIdSeed
}

// ── 工具 ─────────────────────────────────────────────────────────────────────
function nowIso() {
  return new Date().toISOString()
}

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

function err(c: any, e: any) {
  return c.json({ error: String(e?.message ?? e) }, e?.name === 'StoreConflict' ? 409 : e?.status ?? 400)
}

/** 单行、按 rune 截断的预览（与 Go firstLine 对齐）。 */
function firstLine(s: string, max: number) {
  let text = String(s ?? '').trim()
  const nl = text.search(/[\r\n]/)
  if (nl >= 0) text = text.slice(0, nl)
  const runes = [...text]
  if (runes.length > max) text = runes.slice(0, max).join('') + '…'
  return text
}

function humanBytes(n: number) {
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(1)} MB`
  if (n >= 1 << 10) return `${(n / (1 << 10)).toFixed(1)} KB`
  return `${n} B`
}

function composeAgentMessage(msg: string, atts: Array<{ name: string; path: string; size: number }>, baseDir: string) {
  if (!atts.length) return msg
  let out = `${msg}\n\n【用户上传的附件】(绝对路径，需要时用 Read/Bash 查看)：`
  for (const a of atts) out += `\n- ${join(baseDir, a.path)}（${humanBytes(Number(a.size ?? 0))}）`
  return out
}

// ── DTO ──────────────────────────────────────────────────────────────────────
function convDto(row: any, running: boolean) {
  return {
    id: Number(row.id),
    agent_key: row.agent_key,
    title: row.title,
    ...(row.llm_profile_id != null ? { llm_profile_id: Number(row.llm_profile_id) } : {}),
    ...(row.project_id != null ? { project_id: Number(row.project_id) } : {}),
    workspace: String(row.workspace ?? ''),
    pinned: row.pinned_at != null,
    ...(row.pinned_at != null ? { pinned_at: row.pinned_at } : {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
    running
  }
}

function activityDto(row: any, opts: { detail?: boolean } = {}) {
  const dto: Record<string, unknown> = {
    seq: Number(row.id),
    worker: String(row.worker ?? ''),
    ts: String(row.created_at ?? ''),
    kind: String(row.kind ?? ''),
    is_error: Boolean(row.is_error),
    summary: String(row.summary ?? '')
  }
  if (row.tool) dto.tool = row.tool
  if (row.tool_use_id) dto.tool_use_id = row.tool_use_id
  if (row.outcome) dto.outcome = row.outcome
  if (opts.detail && row.detail) dto.detail = row.detail
  for (const key of ['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens']) {
    if (row[key] != null) dto[key] = Number(row[key])
  }
  return dto
}

function sortConversations(rows: any[]) {
  return [...rows].sort((a, b) => {
    const pa = a.pinned_at != null ? 1 : 0
    const pb = b.pinned_at != null ? 1 : 0
    if (pa !== pb) return pb - pa
    if (pa === 1) {
      const c = String(b.pinned_at).localeCompare(String(a.pinned_at))
      if (c) return c
    }
    const u = String(b.updated_at).localeCompare(String(a.updated_at))
    if (u) return u
    return Number(b.id) - Number(a.id)
  })
}

// ── 活动持久化 ───────────────────────────────────────────────────────────────
async function appendActivity(convId: string | number, a: any) {
  const id = await nextActId()
  const record = {
    id: String(id),
    conversation_id: String(convId),
    worker: String(a.worker ?? ''),
    kind: String(a.kind ?? ''),
    tool: String(a.tool ?? ''),
    tool_use_id: String(a.tool_use_id ?? ''),
    is_error: Boolean(a.is_error),
    summary: String(a.summary ?? ''),
    detail: String(a.detail ?? ''),
    input_tokens: a.input_tokens ?? null,
    output_tokens: a.output_tokens ?? null,
    cache_read_tokens: a.cache_read_tokens ?? null,
    cache_write_tokens: a.cache_write_tokens ?? null,
    outcome: String(a.outcome ?? ''),
    created_at: String(a.created_at ?? nowIso())
  }
  const [written] = await operations.writer.commit([{ table: CONV_ACT, key: String(id), record }])
  return written
}

async function updateActivityText(convId: string | number, id: number, summary: string, detail: string) {
  const current = await operations.writer.readRecord(CONV_ACT, String(id))
  if (!current) return
  const next = { ...current, summary, detail }
  delete next.rev
  await operations.writer.commit([{ table: CONV_ACT, key: String(id), record: next, expectedRev: Number(current.rev ?? 0) }])
}

async function listActivities(convId: string | number) {
  const rows = await operations.writer.list(CONV_ACT)
  return rows.filter((a) => String(a.conversation_id) === String(convId)).sort((a, b) => Number(a.id) - Number(b.id))
}

// ── 会话写辅助 ───────────────────────────────────────────────────────────────
async function getConv(id: string) {
  return operations.writer.readRecord(CONV, id)
}

async function renameConv(id: string, title: string) {
  const current = await getConv(id)
  if (!current) return
  const next = { ...current, title, updated_at: nowIso() }
  delete next.rev
  await operations.writer.commit([{ table: CONV, key: id, record: next, expectedRev: Number(current.rev ?? 0) }])
}

async function touchConv(id: string) {
  const current = await getConv(id)
  if (!current) return
  const next = { ...current, updated_at: nowIso() }
  delete next.rev
  await operations.writer.commit([{ table: CONV, key: id, record: next, expectedRev: Number(current.rev ?? 0) }])
}

async function removeConvCascade(id: string) {
  await operations.writer.remove(CONV, id)
  for (const a of await operations.writer.list(CONV_ACT)) {
    if (String(a.conversation_id) === String(id)) await operations.writer.remove(CONV_ACT, String(a.id))
  }
}

function cancelConv(id: string) {
  const ac = cancelMap.get(convKey(id))
  if (ac) ac.abort()
}

// ── live 文本行（对齐 Go conv_live.go：回答在单行内原地增长）────────────────
class ConvLiveText {
  private id = 0
  private kind = ''
  private text = ''
  private created = ''

  constructor(private readonly convId: string | number, private readonly worker: string) {}

  async push(kind: string, text: string) {
    if (this.id && this.kind !== kind) this.seal()
    this.kind = kind
    this.text = text
    if (!this.id) {
      this.created = nowIso()
      const row = await appendActivity(this.convId, { worker: this.worker, kind, summary: firstLine(text, 200), detail: text, created_at: this.created })
      this.id = Number(row.id)
    } else {
      await updateActivityText(this.convId, this.id, firstLine(text, 200), text)
    }
  }

  snapshot() {
    if (!this.id) return null
    return { id: this.id, worker: this.worker, kind: this.kind, summary: firstLine(this.text, 200), detail: this.text, created_at: this.created }
  }

  finish() {
    this.seal()
  }

  private seal() {
    this.id = 0
    this.kind = ''
    this.text = ''
  }
}

// ── mentions：从 meta 的 agents 列表解析 @提及 ────────────────────────────────
async function parseAgentMentions(message: string) {
  const agents = await meta.table<any[]>('agents')
  const keys = new Set(agents.map((a) => String(a.key)).filter(Boolean))
  const mentioned: string[] = []
  const seen = new Set<string>()
  const re = /@([A-Za-z0-9_.-]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(message))) {
    if (!keys.has(m[1])) continue
    if (seen.has(m[1])) continue
    seen.add(m[1])
    mentioned.push(m[1])
    if (mentioned.length > maxChatMentions) throw httpError(400, '每条消息最多引用 10 条记录')
  }
  return mentioned
}

// ── trace 脱敏（对齐 conversation_trace.go，精简版）─────────────────────────
const TRACE_MASK = '[REDACTED]'
function redactTraceText(value: string) {
  return String(value ?? '')
    .replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/g, TRACE_MASK)
    .replace(/\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, TRACE_MASK)
    .replace(/(\b(?:Bearer|Basic)[ \t]+)[A-Za-z0-9._~+/=-]+/g, `$1${TRACE_MASK}`)
    .replace(/(\b[\w.-]*(?:api[_-]?key|token|password|passwd|client[_-]?secret|private[_-]?key|authorization|cookie)\b["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n,;}]+)/gi, `$1${TRACE_MASK}`)
}

// ── 模型轮 ───────────────────────────────────────────────────────────────────
function userText(a: any) {
  if (!a.detail) return String(a.summary ?? '')
  const parsed = parseJson(a.detail)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'text' in parsed) return String((parsed as any).text ?? '')
  return String(a.detail)
}

async function buildHistory(convId: string | number) {
  const rows = await listActivities(convId)
  const messages: Array<{ role: string; content: string }> = []
  for (const a of rows) {
    if (a.kind === 'user') messages.push({ role: 'user', content: userText(a) })
    else if (a.kind === 'text') messages.push({ role: 'assistant', content: String(a.detail || a.summary || '') })
  }
  return messages
}

async function runConversationTurn(conv: any, message: string, attachments: any[], key: string, ac: AbortController) {
  const live = new ConvLiveText(conv.id, conv.agent_key)
  liveMap.set(key, live)
  try {
    const agents = await meta.table<any[]>('agents')
    if (!agents.some((a) => a.key === conv.agent_key)) throw httpError(404, 'agent 不存在')
    const baseDir = join(storeRoot(), 'sessions', key)
    const full = composeAgentMessage(message, attachments, baseDir)
    const history = await buildHistory(conv.id)
    history.push({ role: 'user', content: full })
    const answer = await gatewayComplete(history)
    if (ac.signal.aborted) {
      await appendActivity(conv.id, { worker: conv.agent_key, kind: 'result', outcome: 'cancelled', summary: '已停止' })
    } else {
      await live.push('text', answer)
      live.finish()
      await appendActivity(conv.id, { worker: conv.agent_key, kind: 'result', outcome: 'completed', summary: '' })
    }
  } catch (e: any) {
    if (ac.signal.aborted) {
      await appendActivity(conv.id, { worker: conv.agent_key, kind: 'result', outcome: 'cancelled', summary: '已停止' })
    } else {
      await appendActivity(conv.id, { worker: conv.agent_key, kind: 'text', is_error: true, summary: `（出错：${String(e?.message ?? e)}）`, detail: String(e?.message ?? e) })
      await appendActivity(conv.id, { worker: conv.agent_key, kind: 'result', outcome: 'failed', summary: '' })
    }
  }
  await touchConv(String(conv.id))
}

async function runTaskChat(taskId: string, message: string, attachments: any[], ac: AbortController) {
  try {
    const baseDir = join(storeRoot(), 'tasks', taskId)
    const full = composeAgentMessage(message, attachments, baseDir)
    const answer = await gatewayComplete([{ role: 'user', content: full }])
    if (ac.signal.aborted) {
      await operations.appendActivity(taskId, { kind: 'result', worker: 'mainagent', summary: '已停止' })
      return
    }
    await operations.appendActivity(taskId, { kind: 'text', worker: 'mainagent', summary: answer })
    await operations.appendActivity(taskId, { kind: 'result', worker: 'mainagent', summary: '' })
  } catch (e: any) {
    if (!ac.signal.aborted) await operations.appendActivity(taskId, { kind: 'text', worker: 'mainagent', summary: `（主 Agent 出错：${String(e?.message ?? e)}）`, is_error: true })
    await operations.appendActivity(taskId, { kind: 'result', worker: 'mainagent', summary: '' })
  }
}

// ── 路由 ─────────────────────────────────────────────────────────────────────
export function register(api: Hono) {
  api.get('/api/conversations', async (c) => {
    try {
      const nonempty = c.req.query('nonempty') === '1'
      const unassigned = c.req.query('unassigned') === '1'
      const projectId = c.req.query('project_id')
      let rows = await operations.writer.list(CONV)
      if (unassigned) rows = rows.filter((r) => r.project_id == null)
      else if (projectId) rows = rows.filter((r) => Number(r.project_id) === Number(projectId))
      if (nonempty) {
        const acts = await operations.writer.list(CONV_ACT)
        const nonemptyIds = new Set(acts.map((a) => String(a.conversation_id)))
        rows = rows.filter((r) => nonemptyIds.has(String(r.id)))
      }
      rows = sortConversations(rows)
      const items = rows.map((r) => convDto(r, busy.has(convKey(String(r.id)))))
      return c.json({ conversations: items })
    } catch (e) {
      return err(c, e)
    }
  })

  api.post('/api/conversations', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const agentKey = String(body.agent_key ?? '').trim()
      if (!agentKey) throw httpError(400, 'agent_key 不能为空')
      if ([...agentKey].length > maxConversationAgentKeyRunes) throw httpError(400, `agent_key 最多 ${maxConversationAgentKeyRunes} 个字符`)
      const agents = await meta.table<any[]>('agents')
      if (!agents.some((a) => a.key === agentKey)) throw httpError(404, 'agent 不存在')
      let title = String(body.title ?? '').trim()
      if (!title) title = '新对话'
      if ([...title].length > maxConversationTitleRunes) throw httpError(400, `标题最多 ${maxConversationTitleRunes} 个字符`)
      const id = await nextConvId()
      const now = nowIso()
      const record = {
        id: String(id),
        agent_key: agentKey,
        title,
        llm_profile_id: body.llm_profile_id ?? null,
        project_id: body.project_id ?? null,
        workspace: String(body.workspace ?? ''),
        pinned_at: null,
        created_at: now,
        updated_at: now
      }
      const [written] = await operations.writer.commit([{ table: CONV, key: String(id), record }])
      store.invalidate?.()
      return c.json(convDto(written, false))
    } catch (e) {
      return err(c, e)
    }
  })

  api.get('/api/conversations/digest', async (c) => {
    try {
      const convs = await operations.writer.list(CONV)
      const byId = new Map(convs.map((r) => [String(r.id), r]))
      const items = (await operations.writer.list(CONV_ACT))
        .filter((a) => a.kind === 'result')
        .map((a) => {
          const conv = byId.get(String(a.conversation_id))
          return {
            key: `turn:${a.id}`,
            conversation_id: Number(a.conversation_id),
            title: String(conv?.title ?? ''),
            kind: a.outcome === 'cancelled' ? 'stopped' : a.is_error ? 'failed' : 'completed',
            at: String(a.created_at ?? '')
          }
        })
        .sort((a, b) => String(b.at).localeCompare(String(a.at)) || Number(b.conversation_id) - Number(a.conversation_id))
        .slice(0, 60)
      return c.json({ items })
    } catch (e) {
      return err(c, e)
    }
  })

  api.post('/api/conversations/delete/batch', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const raw = Array.isArray(body.ids) ? body.ids : []
      const ids: number[] = []
      const seen = new Set<number>()
      for (const id of raw.map(Number)) {
        if (!Number.isFinite(id) || id <= 0) throw httpError(400, '对话 id 无效')
        if (seen.has(id)) continue
        seen.add(id)
        ids.push(id)
      }
      if (!ids.length || ids.length > maxConversationDeleteBatch) throw httpError(400, `ids 数量必须为 1-${maxConversationDeleteBatch}`)
      const items = []
      for (const id of ids) {
        const current = await getConv(String(id))
        if (!current) {
          items.push({ id, ok: false, error: 'conversation not found' })
          continue
        }
        cancelConv(String(id))
        await removeConvCascade(String(id))
        items.push({ id, ok: true })
      }
      store.invalidate?.()
      return c.json({ items })
    } catch (e) {
      return err(c, e)
    }
  })

  api.patch('/api/conversations/:id', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const current = await getConv(c.req.param('id'))
      if (!current) throw httpError(404, 'conversation not found')
      if (body.title === undefined && body.pinned === undefined) throw httpError(400, '至少需要提供 title 或 pinned')
      const next = { ...current, updated_at: nowIso() }
      if (body.title !== undefined) {
        const title = String(body.title).trim()
        if (!title) throw httpError(400, '标题不能为空')
        if ([...title].length > maxConversationTitleRunes) throw httpError(400, `标题最多 ${maxConversationTitleRunes} 个字符`)
        next.title = title
      }
      if (body.pinned !== undefined) {
        next.pinned_at = body.pinned ? (current.pinned_at ?? nowIso()) : null
      }
      delete next.rev
      const [written] = await operations.writer.commit([{ table: CONV, key: String(current.id), record: next, expectedRev: Number(current.rev ?? 0) }])
      return c.json(convDto(written, false))
    } catch (e) {
      return err(c, e)
    }
  })

  api.patch('/api/conversations/:id/profile', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const current = await getConv(c.req.param('id'))
      if (!current) throw httpError(404, 'conversation not found')
      const next = { ...current, llm_profile_id: body.llm_profile_id ?? null, updated_at: nowIso() }
      delete next.rev
      await operations.writer.commit([{ table: CONV, key: String(current.id), record: next, expectedRev: Number(current.rev ?? 0) }])
      return c.json({ ok: true })
    } catch (e) {
      return err(c, e)
    }
  })

  api.delete('/api/conversations/:id', async (c) => {
    try {
      const id = c.req.param('id')
      const current = await getConv(id)
      if (!current) throw httpError(404, 'conversation not found')
      cancelConv(id)
      await removeConvCascade(id)
      store.invalidate?.()
      return c.json({ deleted: Number(id) })
    } catch (e) {
      return err(c, e)
    }
  })

  api.get('/api/conversations/:id/messages', async (c) => {
    try {
      const conv = await getConv(c.req.param('id'))
      if (!conv) throw httpError(404, 'conversation not found')
      const limit = Number(c.req.query('limit') ?? 200) || 200
      const withDetail = c.req.query('detail') === '1'
      const trace = c.req.query('trace') === '1'
      const hideReasoning = trace || c.req.query('hide_reasoning') === '1'
      const key = convKey(conv.id)
      const running = busy.has(key)
      const liveRow = liveMap.get(key)?.snapshot() ?? null

      const project = (row: any): any => {
        const dto = activityDto(row, { detail: withDetail || trace })
        if (hideReasoning && dto.kind === 'thinking') {
          return { seq: dto.seq, worker: dto.worker, ts: dto.ts, kind: dto.kind }
        }
        if (trace && (dto.kind === 'tool_use' || dto.kind === 'tool_result' || dto.outcome === 'cancelled')) {
          dto.summary = ''
          delete dto.detail
        }
        return dto
      }
      const liveDto = liveRow ? project(liveRow) : null

      const all = await listActivities(conv.id)
      const since = c.req.query('since')
      if (since) {
        const sid = Number(since) || 0
        const pageSize = Math.min(Math.max(limit, 1000), 5000)
        let items = all.filter((a) => Number(a.id) > sid)
        const hasMore = items.length > pageSize
        if (hasMore) items = items.slice(0, pageSize)
        const cursor = items.length ? Number(items[items.length - 1].id) : sid
        return c.json({ items: items.map(project), cursor, running, live: liveDto, hasMore })
      }

      const before = Number(c.req.query('before') ?? 0) || 0
      const rows = before > 0 ? all.filter((a) => Number(a.id) < before) : all
      const window = rows.slice(-(limit + 1))
      const hasMore = window.length > limit
      const items = hasMore ? window.slice(1) : window
      const cursor = items.length ? Number(items[items.length - 1].id) : before
      return c.json({ items: items.map(project), cursor, running, live: liveDto, hasMore })
    } catch (e) {
      return err(c, e)
    }
  })

  api.get('/api/conversations/:id/messages/:seq', async (c) => {
    try {
      const conv = await getConv(c.req.param('id'))
      if (!conv) throw httpError(404, 'conversation not found')
      const seq = Number(c.req.param('seq'))
      if (!Number.isFinite(seq) || seq <= 0) throw httpError(400, 'bad seq')
      const act = (await listActivities(conv.id)).find((a) => Number(a.id) === seq)
      if (c.req.query('trace') === '1') {
        if (!act || !['tool_use', 'tool_result'].includes(String(act.kind))) throw httpError(404, 'tool activity not found')
        return c.json({ detail: redactTraceText(String(act.detail || act.summary || '')) })
      }
      return c.json({ detail: String(act?.detail ?? '') })
    } catch (e) {
      return err(c, e)
    }
  })

  api.post('/api/conversations/:id/messages', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const conv = await getConv(c.req.param('id'))
      if (!conv) throw httpError(404, 'conversation not found')
      const msg = String(body.message ?? '').trim()
      const attachments = Array.isArray(body.attachments) ? body.attachments : []
      if (!msg && !attachments.length) throw httpError(400, '消息不能为空')
      await parseAgentMentions(msg)

      const key = convKey(conv.id)
      if (busy.has(key)) throw httpError(409, '该会话正在处理上一条消息，请稍候')

      const ua: any = { worker: conv.agent_key, kind: 'user', summary: firstLine(msg, 200) }
      if (attachments.length) ua.detail = JSON.stringify({ text: msg, attachments })
      else if (msg) ua.detail = msg
      await appendActivity(conv.id, ua)

      if (!conv.title || conv.title === '新对话') {
        const title = firstLine(msg, 40) || '附件消息'
        await renameConv(String(conv.id), title)
      }
      await touchConv(String(conv.id))

      const ac = new AbortController()
      busy.set(key, true)
      cancelMap.set(key, ac)
      runConversationTurn(conv, msg, attachments, key, ac).finally(() => {
        busy.delete(key)
        cancelMap.delete(key)
        liveMap.delete(key)
      })
      return c.json({ status: 'accepted' }, 202)
    } catch (e) {
      return err(c, e)
    }
  })

  api.post('/api/conversations/:id/stop', async (c) => {
    try {
      const conv = await getConv(c.req.param('id'))
      if (!conv) throw httpError(404, 'conversation not found')
      const ac = cancelMap.get(convKey(conv.id))
      if (!ac) return c.json({ status: 'idle' })
      ac.abort()
      return c.json({ status: 'stopping' })
    } catch (e) {
      return err(c, e)
    }
  })

  // ── 任务主 Agent 聊天（Go server.go chat/taskChatStatus/stopChat）─────────
  api.post('/api/chat', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    try {
      const taskId = String(c.req.query('task') ?? '')
      const task = await store.tasks.get(taskId)
      if (!task) throw httpError(404, 'no active task')
      const msg = String(body.message ?? '').trim()
      const attachments = Array.isArray(body.attachments) ? body.attachments : []
      await parseAgentMentions(msg)

      const key = taskKey(taskId)
      if (taskBusy.has(key)) throw httpError(409, '主 Agent 正在处理上一条消息，请稍候')
      const ac = new AbortController()
      taskBusy.set(key, true)
      taskCancel.set(key, ac)
      await operations.appendActivity(taskId, { kind: 'user', worker: 'mainagent', summary: msg || '(附件)' })
      runTaskChat(taskId, msg, attachments, ac).finally(() => {
        taskBusy.delete(key)
        taskCancel.delete(key)
      })
      return c.json({ status: 'accepted', mode: 'llm' }, 202)
    } catch (e) {
      return err(c, e)
    }
  })

  api.get('/api/tasks/:id/chat/status', async (c) => {
    const task = await store.tasks.get(c.req.param('id'))
    if (!task) return c.json({ error: 'task not found' }, 404)
    return c.json({ running: taskBusy.has(taskKey(task.id)) })
  })

  api.post('/api/tasks/:id/chat/stop', async (c) => {
    const task = await store.tasks.get(c.req.param('id'))
    if (!task) return c.json({ error: 'task not found' }, 404)
    const ac = taskCancel.get(taskKey(task.id))
    if (!ac) return c.json({ status: 'idle' })
    ac.abort()
    return c.json({ status: 'stopping' })
  })

  api.get('/api/chat/mentions', async (c) => {
    try {
      const q = String(c.req.query('q') ?? '').trim().toLowerCase()
      const agents = await meta.table<any[]>('agents')
      let items = agents.map((a) => ({
        kind: 'agent',
        id: String(a.key),
        key: String(a.key),
        label: String(a.name ?? a.key),
        description: String(a.description ?? '')
      }))
      if (q) items = items.filter((i) => i.key.toLowerCase().includes(q) || i.label.toLowerCase().includes(q))
      return c.json({ items })
    } catch (e) {
      return err(c, e)
    }
  })

  api.post('/api/chat/upload', async (c) => {
    try {
      const scope = c.req.query('scope') ?? ''
      const id = c.req.query('id') ?? ''
      let sub: string
      if (scope === 'task') sub = 'tasks'
      else if (scope === 'session') sub = 'sessions'
      else if (scope === 'staging') sub = 'drafts'
      else throw httpError(400, 'scope 必须是 task / session / staging')
      if (!safeChatID.test(id)) throw httpError(400, '非法 id')
      const dir = join(storeRoot(), sub, id, 'uploads')
      await mkdir(dir, { recursive: true })
      const body = await c.req.parseBody()
      let files: any = body['file']
      if (!files) throw httpError(400, '缺少上传文件(表单字段 file)')
      if (!Array.isArray(files)) files = [files]
      const out: Array<{ name: string; path: string; size: number; abs: string }> = []
      for (const f of files) {
        const name = basename(String(f.name ?? ''))
        if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) continue
        const dest = await uniqueUploadPath(dir, name)
        const buf = Buffer.from(await f.arrayBuffer())
        await writeFile(dest, buf)
        out.push({ name: basename(dest), path: `uploads/${basename(dest)}`, size: Number(f.size ?? 0), abs: dest })
      }
      return c.json({ attachments: out })
    } catch (e) {
      return err(c, e)
    }
  })
}

async function uniqueUploadPath(dir: string, name: string) {
  const dest = join(dir, name)
  if (!(await exists(dest))) return dest
  const ext = extname(name)
  const stem = name.slice(0, name.length - ext.length)
  for (let i = 1; ; i++) {
    const cand = join(dir, `${stem}-${i}${ext}`)
    if (!(await exists(cand))) return cand
  }
}

async function exists(path: string) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
