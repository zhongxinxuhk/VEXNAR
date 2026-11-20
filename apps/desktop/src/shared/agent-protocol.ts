// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ImageAttachment, ReasoningEffort } from './contracts'

export type AgentInitMessage = {
  type: 'init'
  workspace: string
  model: string
  baseUrl: string
  apiKey: string
}

export type AgentUserMessage = {
  type: 'user_message'
  sessionId: string
  text: string
  attachments?: ImageAttachment[]
  reasoningEffort?: ReasoningEffort
  networkApproved?: boolean
  accessMode?: 'request' | 'balanced' | 'full'
}

export type AgentCancelMessage = { type: 'cancel' }

export type AgentRequest =
  AgentInitMessage | AgentUserMessage | AgentCancelMessage

export type AgentRuntimeEvent =
  | { type: 'ready' }
  | { type: 'assistant_delta'; text: string }
  | { type: 'assistant_done' }
  | { type: 'context_usage'; model: string; promptTokens: number }
  | { type: 'tool_start'; id: string; name: string; input?: unknown }
  | { type: 'tool_end'; id: string; name: string; ok: boolean; output?: string }
  | { type: 'error'; message: string }
