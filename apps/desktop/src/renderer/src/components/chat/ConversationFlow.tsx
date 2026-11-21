// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { ChevronRight, SquareTerminal, Wrench } from 'lucide-react'
import { PlanPreview } from './PlanPreview'
import { AgentLoading } from '@/components/agent-ui/LoadingMark'
import { ToolCallRow } from '@/components/agent-ui/ToolCallRow'
import { Markdown } from '@/components/Markdown'
import { executionGroup } from '@/lib/execution-groups'
import { useT } from '@/lib/i18n'
import { stripFailureText } from '@/lib/quota-error'
import type { ChatMessage, ToolCall } from '@/store/app'

const INLINE_TOOL_PAGE = 12

function InlineCallGroup({ calls, running, conversationId }: {
  calls: ToolCall[]
  running: boolean
  conversationId: string
}): React.JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [limit, setLimit] = useState(INLINE_TOOL_PAGE)
  const terminal = calls.every((call) => executionGroup(call.name).category === 'terminal')
  const Icon = terminal ? SquareTerminal : Wrench
  const count = calls.length
  if (calls.length === 1) {
    const [call] = calls
    return <ToolCallRow call={call} status={!running && call.status === 'running' ? 'unreported' : call.status} conversationId={conversationId} />
  }
  return (
    <details className="group/inline-trace" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="flex min-h-7 cursor-pointer list-none items-center gap-2 rounded-md px-1.5 text-xs text-ink-soft hover:bg-panel-2">
        <Icon className="size-3.5 text-muted" aria-hidden="true" />
        <span>{t(terminal ? 'chat.inlineCommands' : 'chat.inlineCalls', { count })}</span>
        <ChevronRight className="size-3 text-muted transition-transform group-open/inline-trace:rotate-90" aria-hidden="true" />
      </summary>
      {open ? (
        <div className="ml-2.5 border-l border-line pl-2.5">
          {calls.slice(0, limit).map((call) => (
            <ToolCallRow
              key={call.started.sequence}
              call={call}
              status={!running && call.status === 'running' ? 'unreported' : call.status}
              conversationId={conversationId}
            />
          ))}
          {limit < count ? (
            <button type="button" className="px-2 py-1.5 text-xs text-accent hover:underline"
              onClick={() => setLimit(limit + INLINE_TOOL_PAGE)}>
              {t('chat.inlineMoreCalls', { count: Math.min(INLINE_TOOL_PAGE, count - limit) })}
            </button>
          ) : null}
        </div>
      ) : null}
    </details>
  )
}

export function ConversationFlow({ message, quotaFailure }: {
  message: ChatMessage
  quotaFailure?: string
}): React.JSX.Element {
  const t = useT()
  const flow = message.flow ?? []
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {flow.map((block, index) => {
        const last = index === flow.length - 1
        if (block.kind === 'reasoning') {
          return (
            <div key={block.sequence} data-flow="reasoning" data-sequence={block.sequence}
              className="px-1.5 text-xs text-muted">
              {message.streaming && last ? (
                <div data-execution-phase="reasoning"><AgentLoading label={t('chat.phaseReasoning')} /></div>
              ) : t('chat.reasoningRecorded')}
            </div>
          )
        }
        if (block.kind === 'plan') {
          return (
            <div key={block.sequence} data-flow="plan" data-sequence={block.sequence}>
              <PlanPreview conversationId={message.sessionId} call={block.call} />
            </div>
          )
        }
        if (block.kind === 'calls') {
          return (
            <div key={block.sequence} data-flow="calls" data-sequence={block.sequence}>
              <InlineCallGroup calls={block.calls} running={Boolean(message.streaming)} conversationId={message.sessionId} />
            </div>
          )
        }
        const text = quotaFailure ? stripFailureText(block.text, quotaFailure) : block.text
        if (!text) return null
        const label = !last ? 'chat.progressMessage' : message.streaming
          ? 'chat.streamingReply' : message.execution?.cancelled ? 'chat.partialReply' : 'chat.finalAnswer'
        return (
          <section key={block.sequence} data-flow="text" data-sequence={block.sequence} aria-label={t(label)}>
            <Markdown content={text} replyViews className={message.streaming && last ? 'answer-streaming' : undefined} />
          </section>
        )
      })}
    </div>
  )
}
