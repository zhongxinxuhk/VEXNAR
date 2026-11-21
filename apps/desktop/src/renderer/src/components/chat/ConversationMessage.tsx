// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { Check, Copy, Paperclip, Pencil, RefreshCw } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { CloudMark } from '@/components/brand'
import { ConversationFlow } from './ConversationFlow'
import { ConversationExecution } from './ConversationExecution'
import { Markdown } from '@/components/Markdown'
import { QuotaNotice } from '@/components/QuotaNotice'
import { useI18n, useT } from '@/lib/i18n'
import { parseQuotaShortfall, quotaFailureBody } from '@/lib/quota-error'
import { cn } from '@/lib/utils'
import { useAppStore, type ChatMessage } from '@/store/app'
import { useDrafts } from '@/store/drafts'

export function ConversationMessage({
  message,
  retryUser
}: {
  message: ChatMessage
  retryUser?: ChatMessage
}): React.JSX.Element {
  const t = useT()
  const locale = useI18n((state) => state.locale)
  const isUser = message.role === 'user'
  const reducedMotion = useReducedMotion()
  const [copyStatus, setCopyStatus] = useState<'copied' | 'failed' | null>(null)
  const patchDraft = useDrafts((state) => state.patch)
  const activeSessionId = useAppStore((state) => state.activeSessionId)
  const send = useAppStore((state) => state.send)
  const busy = useAppStore((state) => state.busy)
  const canRegenerate = Boolean(retryUser?.content.trim()) && !retryUser?.files?.length &&
    !isUser && !message.streaming && !busy
  const retry = (): void => {
    if (canRegenerate && retryUser) void send(retryUser.content, retryUser.attachments)
  }
  const hasFlow = !isUser && Boolean(message.flow?.length)
  const hasFlowText = message.flow?.some((block) => block.kind === 'text')
  const hasTrace = (message.toolEvents?.length ?? 0) > 0
  const execution = message.execution
  const startedAt = isUser ? message.createdAt : execution?.startedAt
  const time = typeof startedAt === 'number' && Number.isFinite(startedAt) ? new Date(startedAt) : null
  // 上游余额不足时，用可操作的提示卡替代原始 403 JSON；其他失败仍走红色错误条。
  // 后端会先把错误写成 text 行，因此正文里可能夹着 403 原文，这里只保留叙述部分。
  // 失败回合的终态行只是诊断（「无文字总结，终态 model_error…」），也不是回答，
  // 余额不足时连它一起收进「错误详情」，卡片自己说明原因。
  const failureText = message.error?.trim() || message.content
  const quotaExhausted = message.failed ? parseQuotaShortfall(failureText) : null
  const visibleContent =
    quotaExhausted !== null
      ? quotaFailureBody(message.content, message.diagnostic, failureText)
      : message.content
  const copy = async (): Promise<void> => {
    try {
      const result = await window.vexnar.app.copyText(visibleContent)
      setCopyStatus(result.ok ? 'copied' : 'failed')
    } catch {
      setCopyStatus('failed')
    }
  }
  const edit = (): void => {
    if (!activeSessionId) return
    patchDraft(activeSessionId, { text: message.content })
    document.getElementById('conversation-composer-input')?.focus()
  }
  const canEdit = isUser && Boolean(activeSessionId && message.content)
  const hasActions = !message.streaming && (Boolean(visibleContent) || canEdit || canRegenerate)
  const actionClass = 'inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted transition-colors hover:bg-panel-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent'
  return (
    <motion.article
      data-chat-message={message.id}
      className={cn('scroll-mt-4 flex w-full items-start gap-2.5', isUser ? 'justify-end' : 'justify-start')}
      aria-label={t(isUser ? 'chat.userMessage' : 'chat.assistantMessage')}
      initial={reducedMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {!isUser ? (
        <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-[9px] border border-accent/15 bg-accent/8 text-accent">
          <CloudMark className="size-4" />
        </span>
      ) : null}
      <div
        className={cn(
          'min-w-0',
          isUser ? 'max-w-[74%]' : 'w-full'
        )}
      >
        <header className={cn('mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-muted', isUser && 'justify-end px-1')}>
          <span className="text-[12px] font-semibold text-ink">
            {isUser ? t('chat.you') : execution?.worker || t('chat.assistantMessage')}
          </span>
          {!isUser && execution?.model ? (
            <span className="max-w-56 truncate" title={execution.model}>{execution.model}</span>
          ) : null}
          {time ? (
            <time dateTime={time.toISOString()} title={time.toLocaleString(locale)}>
              {time.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
            </time>
          ) : null}
        </header>
        {isUser ? null : <ConversationExecution message={message} />}
        <div
          className={cn(
            'text-[14px] leading-[1.75]',
            isUser ? 'rounded-[16px] rounded-tr-md border border-line-soft bg-panel px-4 py-2.5 text-ink' : 'text-ink'
          )}
        >
          {message.attachments?.length ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {message.attachments.map((image) => (
                <img
                  key={image.id}
                  src={image.dataUrl}
                  alt={image.name}
                  className="max-h-64 max-w-full rounded-xl object-contain"
                />
              ))}
            </div>
          ) : null}
          {message.files?.length ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {message.files.map((file, index) => (
                <span
                  key={`${file.name}-${index}`}
                  className="inline-flex max-w-60 items-center gap-1.5 rounded-lg border border-line-soft bg-panel px-2 py-1 text-[11px] text-ink-soft"
                >
                  <Paperclip className="size-3 shrink-0 text-muted" />
                  <span className="truncate">{file.name}</span>
                </span>
              ))}
            </div>
          ) : null}
          {hasFlow ? <ConversationFlow message={message} quotaFailure={quotaExhausted ? failureText : undefined} /> : null}
          {visibleContent && !hasFlowText ? (
            // 流式时由 CSS 把光标贴在最后一段文字末尾（.answer-streaming）——在
            // Markdown 之后塞 inline-block 会被块级段落挤到下一行，看着像断行。
            <section aria-label={isUser ? undefined : t(message.streaming ? 'chat.streamingReply' : execution?.cancelled ? 'chat.partialReply' : 'chat.finalAnswer')}>
              <Markdown
                content={visibleContent}
                className={message.streaming && execution?.phase === 'answer' ? 'answer-streaming' : undefined}
              />
            </section>
          ) : message.streaming ||
            message.attachments?.length ||
            hasTrace || hasFlow ||
            execution?.cancelled ||
            quotaExhausted ? null : (
            <div className="text-muted">…</div>
          )}
          {message.failed ? (
            quotaExhausted ? (
              <QuotaNotice
                error={failureText}
                onRetry={canRegenerate ? retry : undefined}
                retrying={busy}
              />
            ) : (
              <div
                className="mt-2 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger/5 px-2.5 py-1.5 font-mono text-[11px] text-danger"
                title={failureText}
              >
                <span className="min-w-0 flex-1">{t('chat.runtimeError')}</span>
                {canRegenerate ? (
                  <button
                    type="button"
                    onClick={retry}
                    disabled={busy}
                    className="shrink-0 rounded px-1.5 py-0.5 font-sans text-[11px] text-danger/90 hover:bg-danger/10 disabled:opacity-50"
                  >
                    {t('chat.retryMessage')}
                  </button>
                ) : null}
              </div>
            )
          ) : null}

        </div>
        {hasActions ? (
          <div role="group" aria-label={t('chat.messageActions')} className={cn(
            'mt-1 flex flex-wrap items-center gap-0.5',
            isUser && 'justify-end'
          )}>
            {visibleContent ? (
              <button type="button" onClick={() => void copy()} className={actionClass}>
                {copyStatus === 'copied' ? <Check className="size-3" /> : <Copy className="size-3" />}
                {t(copyStatus === 'copied' ? 'chat.toolPayloadCopied' : 'chat.copyMessage')}
              </button>
            ) : null}
            {canEdit ? (
              <button type="button" onClick={edit} className={actionClass}>
                <Pencil className="size-3" />
                {t('chat.editMessage')}
              </button>
            ) : null}
            {canRegenerate && !message.failed ? (
              <button type="button" onClick={retry} className={actionClass}>
                <RefreshCw className="size-3" />
                {t('chat.regenerateMessage')}
              </button>
            ) : null}
            {copyStatus === 'failed' ? <span role="status" className="px-1 text-xs text-danger">{t('chat.toolPayloadCopyFailed')}</span> : null}
          </div>
        ) : null}
      </div>
    </motion.article>
  )
}
