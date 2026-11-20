// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { Check, Copy, Paperclip, Pencil, RefreshCw } from 'lucide-react'
import { motion } from 'motion/react'
import { AgentLoading } from '@/components/agent-ui/LoadingMark'
import { ToolActivity, executionStatusLabels } from '@/components/agent-ui/ToolActivity'
import { Markdown } from '@/components/Markdown'
import { QuotaNotice } from '@/components/QuotaNotice'
import { useI18n, useT } from '@/lib/i18n'
import { parseQuotaShortfall, stripFailureText } from '@/lib/quota-error'
import { cn } from '@/lib/utils'
import { useAppStore, type ChatMessage } from '@/store/app'
import { useDrafts } from '@/store/drafts'

export function ConversationMessage({
  message,
  lastUser
}: {
  message: ChatMessage
  lastUser?: ChatMessage
}): React.JSX.Element {
  const t = useT()
  const locale = useI18n((state) => state.locale)
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const patchDraft = useDrafts((state) => state.patch)
  const activeSessionId = useAppStore((state) => state.activeSessionId)
  const send = useAppStore((state) => state.send)
  const busy = useAppStore((state) => state.busy)
  const canRegenerate =
    !isUser && !message.streaming && !busy && Boolean(lastUser?.content)
  const toolCalls = message.toolCalls ?? []
  const toolEvents = message.toolEvents ?? []
  const execution = message.execution
  const status = message.streaming ? 'running' : message.failed ? 'failed' : execution?.completedAt !== undefined ? 'completed' : 'unknown'
  const elapsed = execution?.startedAt !== undefined && execution.completedAt !== undefined
    ? execution.completedAt - execution.startedAt
    : NaN
  const startedAt = isUser ? message.createdAt : execution?.startedAt
  const time = typeof startedAt === 'number' && Number.isFinite(startedAt) ? new Date(startedAt) : null
  // 上游余额不足时，用可操作的提示卡替代原始 403 JSON；其他失败仍走红色错误条。
  // 后端会先把错误写成 text 行，因此正文里可能夹着 403 原文，这里只保留叙述部分。
  const failureText = message.error ?? message.content
  const quotaExhausted = message.failed ? parseQuotaShortfall(failureText) : null
  const visibleContent =
    quotaExhausted !== null
      ? stripFailureText(message.content, failureText)
      : message.content
  const copy = async (): Promise<void> => {
    // 复制可见正文：余额不足时正文已剥掉 403 原文，不要把报错 JSON 当回答复制走。
    const result = await window.vexnar.app.copyText(visibleContent || message.content)
    if (result.ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    }
  }
  return (
    <motion.article
      aria-label={t(isUser ? 'chat.userMessage' : 'chat.assistantMessage')}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
    >
      {/* group 落在气泡容器上：悬停气泡才浮出操作行，行本身不参与布局 */}
      <div
        className={cn(
          'group relative min-w-0',
          isUser ? 'max-w-[78%]' : 'w-full max-w-[760px]'
        )}
      >
        <header className={cn('mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-muted', isUser && 'justify-end px-1')}>
          {!isUser ? (
            <span className="font-medium text-ink-soft">{execution?.worker || t('chat.assistantMessage')}</span>
          ) : null}
          {time ? (
            <time dateTime={time.toISOString()} title={time.toLocaleString(locale)}>
              {time.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
            </time>
          ) : null}
        </header>
        {toolEvents.length > 0 ? (
          <div className="mb-2">
            <ToolActivity
              conversationId={message.sessionId}
              calls={toolCalls}
              events={toolEvents}
              running={Boolean(message.streaming)}
              executionStatus={status}
              elapsedMs={Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : undefined}
            />
          </div>
        ) : null}
        {message.streaming && !message.content && toolEvents.length === 0 ? (
          <div className="mt-1">
            <AgentLoading label={t(executionStatusLabels.running)} />
          </div>
        ) : null}
        <div
          className={cn(
            'text-[13px] leading-[1.75]',
            isUser ? 'rounded-[16px] bg-panel px-4 py-2.5 text-ink' : 'text-ink'
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
          {visibleContent ? (
            // 流式时由 CSS 把光标贴在最后一段文字末尾（.answer-streaming）——在
            // Markdown 之后塞 inline-block 会被块级段落挤到下一行，看着像断行。
            <section aria-label={isUser ? undefined : t(message.streaming ? 'chat.streamingReply' : 'chat.finalAnswer')}>
              <Markdown
                content={visibleContent}
                className={message.streaming ? 'answer-streaming' : undefined}
              />
            </section>
          ) : message.streaming ||
            message.attachments?.length ||
            toolEvents.length ||
            quotaExhausted ? null : (
            <div className="text-muted">…</div>
          )}
          {message.failed ? (
            quotaExhausted ? (
              <QuotaNotice
                error={failureText}
                onRetry={lastUser?.content ? () => void send(lastUser.content) : undefined}
                retrying={busy}
              />
            ) : (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger/5 px-2.5 py-1.5 font-mono text-[11px] text-danger">
                <span className="min-w-0 flex-1">{t('chat.runtimeError')}</span>
                {lastUser?.content ? (
                  <button
                    type="button"
                    onClick={() => void send(lastUser.content)}
                    disabled={busy}
                    className="shrink-0 rounded px-1.5 py-0.5 font-sans text-[11px] text-danger/90 hover:bg-danger/10 disabled:opacity-50"
                  >
                    重试
                  </button>
                ) : null}
              </div>
            )
          ) : null}

        </div>
        {/* 操作行浮在气泡下方：不占气泡高度/宽度，只有鼠标靠近气泡才出现。
            pt-0.5 而非 mt-0.5 —— 行盒子与气泡下沿贴合，指针从气泡滑到图标时
            不会经过 2px 的空档把 group-hover 断掉。 */}
        {message.content && !message.streaming ? (
          <div
            className={cn(
              'pointer-events-none absolute top-full z-10 flex items-start gap-0.5 pt-0.5',
              'opacity-0 transition-opacity duration-150',
              'group-hover:pointer-events-auto group-hover:opacity-100',
              'group-focus-within:pointer-events-auto group-focus-within:opacity-100',
              isUser ? 'right-0' : 'left-0'
            )}
          >
            <button
              type="button"
              aria-label="复制消息"
              title={copied ? '已复制' : '复制'}
              onClick={() => void copy()}
              className="grid h-5 w-5 place-items-center rounded-md text-muted transition-colors hover:bg-panel-2 hover:text-ink"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
            {canRegenerate ? (
              <button
                type="button"
                aria-label="重新生成"
                title="重新生成"
                onClick={() => void send(lastUser!.content)}
                className="grid h-5 w-5 place-items-center rounded-md text-muted transition-colors hover:bg-panel-2 hover:text-ink"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            ) : null}
            {isUser && activeSessionId ? (
              <button
                type="button"
                aria-label="在输入框编辑"
                title="在输入框编辑"
                onClick={() => patchDraft(activeSessionId, { text: message.content })}
                className="grid h-5 w-5 place-items-center rounded-md text-muted transition-colors hover:bg-panel-2 hover:text-ink"
              >
                <Pencil className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </motion.article>
  )
}
