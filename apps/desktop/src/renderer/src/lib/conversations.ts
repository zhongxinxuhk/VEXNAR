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

import type { ChatMessage } from '@/store/app'
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
  summary: string
  /** Present only when the request asks for detail=1 (the app always does). */
  detail?: string
  input_tokens?: number
  output_tokens?: number
}

export type MessagePage = {
  items: BackendActivity[]
  cursor: number
  running: boolean
  hasMore: boolean
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

/** Agent key a new desktop conversation starts on ("auto" is a builtin agent). */
export const DEFAULT_AGENT_KEY = 'auto'

/**
 * The app renders a whole answer, not a 200-rune preview: ask the messages
 * endpoint for full detail. The web page keeps lazy-loading details per step.
 */
const FULL = '&detail=1'

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

function toolInput(activity: BackendActivity): unknown {
  const raw = activity.detail?.trim()
  if (!raw) return activity.summary
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * Fold the backend activity stream into the message list ChatView renders.
 * Consecutive text/thinking steps belong to one assistant bubble; tool steps
 * attach to it as collapsible activity. Because the app requests detail=1 the
 * full assistant text is available, not the 200-rune summary.
 */
export function toChatMessages(activities: BackendActivity[], sessionId: string): ChatMessage[] {
  const out: ChatMessage[] = []
  let open: ChatMessage | null = null

  const assistant = (seq: number): ChatMessage => {
    if (open) return open
    open = {
      id: `a-${sessionId}-${seq}`,
      sessionId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      toolCalls: []
    }
    out.push(open)
    return open
  }

  for (const item of activities) {
    switch (item.kind) {
      case 'user': {
        open = null
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
        const message = assistant(item.seq)
        message.content += item.detail || item.summary
        break
      }
      case 'thinking': {
        const message = assistant(item.seq)
        const text = (item.detail || item.summary || '').trim()
        if (text) {
          message.toolCalls = message.toolCalls ?? []
          message.toolCalls.push({
            id: `think-${item.seq}`,
            name: '思考',
            status: 'done',
            output: text
          })
        }
        break
      }
      case 'tool_use': {
        const message = assistant(item.seq)
        message.toolCalls = message.toolCalls ?? []
        message.toolCalls.push({
          id: item.tool_use_id || `t-${item.seq}`,
          name: item.tool || 'tool',
          status: 'running',
          input: toolInput(item)
        })
        break
      }
      case 'tool_result': {
        const message = assistant(item.seq)
        const call = message.toolCalls?.find((entry) => entry.id === item.tool_use_id)
        if (call) {
          call.status = item.is_error ? 'error' : 'done'
          call.output = item.detail || item.summary
        }
        break
      }
      case 'result': {
        if (item.is_error) {
          const message = assistant(item.seq)
          if (!message.content.trim()) message.content = item.detail || item.summary
          message.failed = true
        }
        open = null
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
