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
}

export type AgentCancelMessage = { type: 'cancel' }

export type AgentRequest = AgentInitMessage | AgentUserMessage | AgentCancelMessage

export type AgentRuntimeEvent =
  | { type: 'ready' }
  | { type: 'assistant_delta'; text: string }
  | { type: 'assistant_done' }
  | { type: 'tool_start'; id: string; name: string; input?: unknown }
  | { type: 'tool_end'; id: string; name: string; ok: boolean; output?: string }
  | { type: 'error'; message: string }
