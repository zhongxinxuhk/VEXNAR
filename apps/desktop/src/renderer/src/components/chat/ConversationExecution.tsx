// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { PlanPreview } from './PlanPreview'
import { AgentLoading } from '@/components/agent-ui/LoadingMark'
import { ToolActivity, executionStatusLabels } from '@/components/agent-ui/ToolActivity'
import { useT } from '@/lib/i18n'
import type { ChatExecutionPhase, ChatMessage } from '@/store/app'

const phaseLabels: Record<ChatExecutionPhase, 'chat.phaseReasoning' | 'chat.phaseTools' | 'chat.phaseAnswer'> = {
  reasoning: 'chat.phaseReasoning',
  tools: 'chat.phaseTools',
  answer: 'chat.phaseAnswer'
}

export function ConversationExecution({
  message,
  workView = false
}: {
  message: ChatMessage
  workView?: boolean
}): React.JSX.Element | null {
  const t = useT()
  const events = message.toolEvents ?? []
  const plans = workView ? message.flow?.filter((block) => block.kind === 'plan') : undefined
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

  const phase = message.execution?.phase
  const activeLabel = message.streaming ? t(phase ? phaseLabels[phase] : 'chat.phaseWaiting') : undefined

  if (events.length > 0) {
    return (
      <div className="mb-2">
        {plans?.length ? (
          <section aria-label={t('chat.planCheckpoints')} className="my-2 grid gap-1.5">
            <h3 className="text-xs font-medium text-ink-soft">{t('chat.planCheckpoints')}</h3>
            {plans.map((plan) => <PlanPreview key={plan.sequence} conversationId={message.sessionId} call={plan.call} />)}
          </section>
        ) : null}
        <ToolActivity
          conversationId={message.sessionId}
          calls={message.toolCalls ?? []}
          events={events}
          running={Boolean(message.streaming)}
          executionStatus={status}
          activeLabel={activeLabel}
          elapsedMs={Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : undefined}
        />
      </div>
    )
  }
  if (activeLabel && (workView || (phase !== 'answer' && !message.flow?.length))) {
    return (
      <div data-execution-phase={phase ?? 'waiting'} className="mb-3 rounded-lg border border-line-soft bg-panel/60 px-3 py-2">
        <AgentLoading label={activeLabel} />
      </div>
    )
  }
  return workView || status === 'cancelled' ? <p className="mt-1 text-xs text-muted">{t(executionStatusLabels[status])}</p> : null
}
