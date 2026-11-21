// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Conversation client for the desktop app.
 *
 * The app speaks exactly the same REST surface as the web /chat page
 * (/api/conversations, /api/conversations/{id}/messages, …). One Go backend,
 * one PostgreSQL database, one transcript — no second model path in Electron
 * and no local streaming loop racing the server.
 */

import type { ChatMessage, ToolCall } from '@/store/app'
import type { ImageAttachment, Session } from '@shared/contracts'

export type BackendConversation = {
  id: number
  agent_key: string
  title: string
  /** Owning project assigned by the backend; null/absent means unassigned. */
  project_id?: number | null
  /** Working directory recorded when the thread was created. */
  workspace?: string
  llm_profile_id?: number | null
  pinned?: boolean
  pinned_at?: string | null
  running?: boolean
  created_at?: string
  updated_at?: string
}

export type BackendActivity = {
  seq: number
  worker: string
  ts: string
  kind: string
  tool?: string
  tool_use_id?: string
  is_error?: boolean
  outcome?: string
  summary: string
  /** Present when the selected response projection includes this row body. */
  detail?: string
  input_tokens?: number
  output_tokens?: number
}

export type MessagePage = {
  items: BackendActivity[]
  cursor: number
  running: boolean
  hasMore: boolean
  pending_approvals?: number
  /**
   * The row a running turn is still writing (the answer so far). It keeps the
   * same seq for the whole run and only its text grows, so a client merges it by
   * seq instead of appending — that is what makes the reply stream.
   */
  live?: BackendActivity | null
}

export type ChatAttachment = { name: string; path: string; size: number; abs?: string }

const request = async <T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown
): Promise<T> => {
  const result = await window.vexnar.backend.request<T>({ path, method, body })
  if (!result.ok) throw new Error(result.error)
  return result.data
}

const items = <T>(page: { items?: T[] } | undefined | null): T[] =>
  Array.isArray(page?.items) ? page.items : []

/**
 * Merge transcript rows by seq. A live answer row is delivered repeatedly with
 * the same seq while its text grows, so appending would duplicate it; replacing
 * keeps exactly one copy and always the newest text.
 */
export function mergeActivities(
  current: BackendActivity[],
  incoming: (BackendActivity | null | undefined)[]
): BackendActivity[] {
  const rows = incoming.filter((row): row is BackendActivity => Boolean(row))
  if (rows.length === 0) return current
  const bySeq = new Map<number, BackendActivity>()
  for (const row of current) bySeq.set(row.seq, row)
  for (const row of rows) bySeq.set(row.seq, row)
  return [...bySeq.values()].sort((left, right) => left.seq - right.seq)
}

/** Agent key a new desktop conversation starts on ("auto" is a builtin agent). */
export const DEFAULT_AGENT_KEY = 'auto'

/**
 * The app renders a whole answer, not a 200-rune preview: ask the messages
 * endpoint for answer detail and tool event metadata. Tool payloads load separately.
 */
const FULL = '&trace=1'

export type BackendProject = {
  id: string
  root_path: string
  name: string
  created_at?: string
}

/** Project ownership is a backend fact: the app only reads and registers. */
export const projects = {
  list: () =>
    request<{ projects?: BackendProject[] }>('/desktop/projects', 'GET').then((r) =>
      Array.isArray(r?.projects) ? r.projects : []
    ),
  register: (rootPath: string) =>
    request<BackendProject>('/desktop/projects', 'POST', { root_path: rootPath })
}

export type ConversationScope = {
  projectId?: string
  /** Threads whose project_id is still NULL. */
  unassigned?: boolean
}

export const conversations = {
  list: (scope?: ConversationScope) => {
    const query = scope?.unassigned
      ? '?unassigned=1'
      : scope?.projectId
        ? `?project_id=${encodeURIComponent(scope.projectId)}`
        : ''
    return request<{ conversations?: BackendConversation[] }>(`/conversations${query}`, 'GET').then(
      (r) => (Array.isArray(r?.conversations) ? r.conversations : [])
    )
  },
  create: (agentKey: string, title: string, workspace?: string) =>
    request<BackendConversation>('/conversations', 'POST', {
      agent_key: agentKey,
      title,
      llm_profile_id: null,
      ...(workspace ? { workspace } : {})
    }),
  bindProject: (id: string, projectId: string) =>
    request<BackendConversation>(`/desktop/conversations/${id}/project`, 'POST', {
      project_id: Number(projectId)
    }),
  rename: (id: string, title: string) =>
    request<BackendConversation>(`/conversations/${id}`, 'PATCH', { title }),
  pin: (id: string, pinned: boolean) =>
    request<BackendConversation>(`/conversations/${id}`, 'PATCH', { pinned }),
  remove: (id: string) =>
    request<{ deleted: number }>(`/conversations/${id}`, 'DELETE'),
  /** Incremental tail after `since` (exclusive), newest cursor included. */
  messages: (id: string, since = 0) =>
    request<MessagePage>(`/conversations/${id}/messages?since=${since}${FULL}`, 'GET').then(
      (r) => ({ ...r, items: items<BackendActivity>(r) })
    ),
  /** Latest history page (before>0 loads one older page). */
  history: (id: string, before = 0, limit = 200) =>
    request<MessagePage>(
      `/conversations/${id}/messages?limit=${limit}${before > 0 ? `&before=${before}` : ''}${FULL}`,
      'GET'
    ).then((r) => ({ ...r, items: items<BackendActivity>(r) })),
  detail: (id: string, seq: number) =>
    request<{ detail?: string }>(`/conversations/${id}/messages/${seq}`, 'GET').then(
      (r) => r.detail ?? ''
    ),
  relatedTraceCall: (id: string, seq: number) =>
    request<{
      call: { seq: number; tool: string; worker: string; ts: string } | null
      relation: 'linked' | 'ambiguous' | 'unmatched'
    }>(`/conversations/${id}/messages/${seq}?trace=1&related_call=1`, 'GET'),
  traceDetail: (id: string, seq: number) =>
    request<{ detail: string }>(`/conversations/${id}/messages/${seq}?trace=1`, 'GET').then(
      (r) => r.detail
    ),
  send: (id: string, message: string, attachments: ChatAttachment[] = []) =>
    request<{ status: string }>(`/conversations/${id}/messages`, 'POST', {
      message,
      ...(attachments.length ? { attachments } : {})
    }),
  stop: (id: string) =>
    request<{ status: string }>(`/conversations/${id}/stop`, 'POST', {})
}

const tsOf = (value?: string): number => {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : Date.now()
}

/**
 * Backend conversation → the Session shape the sidebar renders.
 *
 * workspace comes from the row that created the thread. It is never filled in
 * from whatever directory the app currently has open — an unassigned thread has
 * projectId null and is shown in the "待归属" group instead.
 */
export function toSession(conversation: BackendConversation): Session {
  return {
    id: String(conversation.id),
    title: conversation.title || '新对话',
    workspace: conversation.workspace ?? '',
    projectId: conversation.project_id != null ? String(conversation.project_id) : null,
    pinned: Boolean(conversation.pinned ?? conversation.pinned_at),
    createdAt: tsOf(conversation.created_at),
    updatedAt: tsOf(conversation.updated_at)
  }
}

type StoredAttachment = { name?: string; path?: string; size?: number }

/**
 * A human step stores {text, attachments} as JSON in Detail when it carried
 * files; older/plain turns store the raw text. Keep both readable.
 */
export function parseUserActivity(activity: BackendActivity): {
  text: string
  files: { name: string; size: number }[]
} {
  const raw = activity.detail || activity.summary || ''
  try {
    const parsed = JSON.parse(raw) as { text?: unknown; attachments?: StoredAttachment[] }
    if (parsed && typeof parsed.text === 'string') {
      const files = Array.isArray(parsed.attachments)
        ? parsed.attachments
            .filter((file) => typeof file?.name === 'string' && file.name)
            .map((file) => ({ name: String(file.name), size: Number(file.size) || 0 }))
        : []
      return { text: parsed.text, files }
    }
  } catch {
    // plain text turn — fall through
  }
  return { text: raw, files: [] }
}

/**
 * Fold the backend activity stream into the message list ChatView renders.
 * Consecutive answer fragments and tool steps belong to one assistant bubble.
 * Thinking rows establish the bubble's identity while the model is working.
 */
export function toChatMessages(activities: BackendActivity[], sessionId: string): ChatMessage[] {
  const out: ChatMessage[] = []
  const callsById = new Map<string, ToolCall[]>()
  let open: ChatMessage | null = null
  let turnStartedAt: number | undefined

  const observedTime = (value: string): number | undefined => {
    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? timestamp : undefined
  }

  const assistant = (item: BackendActivity): ChatMessage => {
    if (open) return open
    open = {
      id: `a-${sessionId}-${item.seq}`,
      sessionId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      flow: [],
      toolCalls: [],
      toolEvents: [],
      execution: { worker: item.worker, startedAt: turnStartedAt }
    }
    out.push(open)
    return open
  }

  for (const item of activities) {
    switch (item.kind) {
      case 'user': {
        open = null
        callsById.clear()
        turnStartedAt = observedTime(item.ts)
        const parsed = parseUserActivity(item)
        out.push({
          id: `u-${item.seq}`,
          sessionId,
          role: 'user',
          content: parsed.text,
          createdAt: tsOf(item.ts),
          ...(parsed.files.length ? { files: parsed.files } : {})
        })
        break
      }
      case 'text': {
        const message = assistant(item)
        const text = item.detail || item.summary
        message.content += text
        const last = message.flow?.at(-1)
        if (last?.kind === 'text') last.text += text
        else if (text) message.flow?.push({ kind: 'text', sequence: item.seq, text })
        if (message.execution) message.execution.phase = 'answer'
        break
      }
      case 'model': {
        const model = item.summary.trim()
        if (model) {
          const execution = assistant(item).execution
          if (execution) execution.model = model
        }
        break
      }
      case 'thinking': {
        const message = assistant(item)
        if (message.execution) message.execution.phase = 'reasoning'
        if (message.flow?.at(-1)?.kind !== 'reasoning') {
          message.flow?.push({ kind: 'reasoning', sequence: item.seq })
        }
        break
      }
      case 'tool_use': {
        const message = assistant(item)
        if (message.execution) message.execution.phase = 'tools'
        const call: ToolCall = {
          id: item.tool_use_id || `t-${item.seq}`,
          name: item.tool || 'tool',
          worker: item.worker,
          started: { sequence: item.seq, timestamp: item.ts },
          status: 'running'
        }
        message.toolCalls?.push(call)
        const last = message.flow?.at(-1)
        if (last?.kind === 'calls') last.calls.push(call)
        else message.flow?.push({ kind: 'calls', sequence: item.seq, calls: [call] })
        message.toolEvents?.push({
          ...call.started, tool: call.name, worker: item.worker, outcome: 'invoked'
        })
        if (item.tool_use_id) {
          const candidates = callsById.get(item.tool_use_id) ?? []
          candidates.push(call)
          callsById.set(item.tool_use_id, candidates)
        }
        break
      }
      case 'tool_result': {
        const pending = (callsById.get(item.tool_use_id ?? '') ?? []).filter((call) => !call.finished)
        const sameWorker = pending.filter((call) => call.worker === item.worker)
        // Prefer the recorded worker. Older records with a missing worker can
        // only be paired when the remaining call is unambiguous.
        const candidates = item.worker
          ? sameWorker.length > 0 ? sameWorker : pending.filter((call) => !call.worker)
          : pending
        const call = candidates.length === 1 ? candidates[0] : undefined
        const event = { sequence: item.seq, timestamp: item.ts }
        const outcome = item.is_error ? 'error' : 'done'
        const message = assistant(item)
        if (message.execution) message.execution.phase = 'tools'
        message.toolEvents?.push({
          ...event,
          tool: item.tool || call?.name || 'tool',
          worker: item.worker,
          outcome,
          relatedCallSequence: call?.started.sequence,
          relation: call ? undefined : candidates.length > 1 ? 'ambiguous' : 'unmatched'
        })
        if (call) {
          call.status = outcome
          call.finished = event
        }
        break
      }
      case 'result': {
        // 成功回合的最终答复只在两种地方之一：被 sink 逐段写进 text 行的实时答案，
        // 或（没有流式时）该 result 行本身。只取 detail：summary 是 400 字的截断预览，
        // 用它当正文会在已流式的情况下多出半句话。
        const answer = item.is_error ? (item.detail || item.summary || '').trim() : (item.detail || '').trim()
        if (item.outcome === 'cancelled') {
          const message = assistant(item)
          if (message.execution) message.execution.cancelled = true
        } else if (item.is_error) {
          const message = assistant(item)
          if (!message.content.trim()) message.content = answer
          message.failed = true
          // Keep the upstream rejection even when narration already streamed:
          // the view classifies "out of balance" from this text, not from the
          // partial answer that happens to precede it.
          message.error = answer || message.content
        } else if (answer) {
          const message = assistant(item)
          const text = message.content.trim()
          // 中间叙述已经作为 text 步骤进了同一条消息 → 接在后面；已包含则不重复。
          if (!text.endsWith(answer)) message.content = text ? `${text}\n\n${answer}` : answer
          const last = message.flow?.at(-1)
          if (last?.kind === 'text') {
            if (!last.text.trim().endsWith(answer)) last.text = `${last.text.trim()}\n\n${answer}`
          } else {
            message.flow?.push({ kind: 'text', sequence: item.seq, text: answer })
          }
        }
        const completed = out[out.length - 1]
        if (open && completed?.execution) completed.execution.completedAt = observedTime(item.ts)
        open = null
        turnStartedAt = undefined
        callsById.clear()
        break
      }
      default:
        break
    }
  }
  return out
}

/** Token usage carried by the terminal `result` step of a turn. */
export function lastTurnUsage(
  activities: BackendActivity[]
): { promptTokens: number } | null {
  for (let i = activities.length - 1; i >= 0; i -= 1) {
    const item = activities[i]
    if (item.kind !== 'result') continue
    const promptTokens = Number(item.input_tokens)
    return Number.isFinite(promptTokens) && promptTokens >= 0 ? { promptTokens } : null
  }
  return null
}

/** Image attachments the composer produced → backend upload payloads. */
export async function uploadImages(
  conversationId: string,
  images: ImageAttachment[]
): Promise<ChatAttachment[]> {
  if (images.length === 0) return []
  const files = images.map((image) => ({
    name: image.name,
    type: image.dataUrl.slice(5, image.dataUrl.indexOf(';')) || 'image/png',
    base64: image.dataUrl.slice(image.dataUrl.indexOf(',') + 1)
  }))
  const result = await window.vexnar.backend.upload({
    path: `/chat/upload?scope=session&id=conv-${conversationId}`,
    files
  })
  if (!result.ok) throw new Error(result.error)
  return result.data.attachments ?? []
}
