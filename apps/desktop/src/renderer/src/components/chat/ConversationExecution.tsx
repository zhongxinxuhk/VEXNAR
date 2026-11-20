// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { AgentLoading } from '@/components/agent-ui/LoadingMark'
import { ToolActivity, executionStatusLabels } from '@/components/agent-ui/ToolActivity'
import { useT } from '@/lib/i18n'
import type { ChatMessage } from '@/store/app'

export function ConversationExecution({
  message,
  workView = false
}: {
  message: ChatMessage
  workView?: boolean
}): React.JSX.Element | null {
  const t = useT()
  const events = message.toolEvents ?? []
  const startedAt = message.execution?.startedAt
  const completedAt = message.execution?.completedAt
  const status = message.streaming
    ? 'running'
    : message.execution?.cancelled
      ? 'cancelled'
      : message.failed
        ? 'failed'
        : completedAt !== undefined ? 'completed' : 'unknown'
  const elapsed = startedAt !== undefined && completedAt !== undefined ? completedAt - startedAt : NaN

  if (events.length > 0) {
    return (
      <div className="mb-2">
        <ToolActivity
          conversationId={message.sessionId}
          calls={message.toolCalls ?? []}
          events={events}
          running={Boolean(message.streaming)}
          executionStatus={status}
          elapsedMs={Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : undefined}
        />
      </div>
    )
  }
  if (message.streaming && (workView || !message.content)) {
    return <div className="mt-1"><AgentLoading label={t(executionStatusLabels.running)} /></div>
  }
  return workView || status === 'cancelled' ? <p className="mt-1 text-xs text-muted">{t(executionStatusLabels[status])}</p> : null
}
