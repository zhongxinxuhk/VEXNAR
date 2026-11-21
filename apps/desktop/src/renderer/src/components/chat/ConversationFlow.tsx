// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { PlanPreview } from './PlanPreview'
import { AgentLoading } from '@/components/agent-ui/LoadingMark'
import { ToolCallRow, ToolResultRow } from '@/components/agent-ui/ToolCallRow'
import { Markdown } from '@/components/Markdown'
import { useT } from '@/lib/i18n'
import { stripFailureText } from '@/lib/quota-error'
import type { ChatMessage } from '@/store/app'

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
        if (block.kind === 'call') {
          const status = !message.streaming && block.call.status === 'running' ? 'unreported' : block.call.status
          return (
            <div key={block.sequence} data-flow="call" data-sequence={block.sequence}>
              <ToolCallRow call={block.call} status={status} conversationId={message.sessionId} />
            </div>
          )
        }
        if (block.kind === 'result') {
          return (
            <div key={block.sequence} data-flow="result" data-sequence={block.sequence}>
              <ToolResultRow event={block.event} conversationId={message.sessionId} />
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
