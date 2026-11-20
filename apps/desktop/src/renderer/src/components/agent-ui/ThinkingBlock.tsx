// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pattern adapted from Motif's Thinking Block (MIT). See ./NOTICE.md.

import { useEffect, useRef, useState } from 'react'
import { Brain, ChevronDown } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Markdown } from '@/components/Markdown'
import { AgentLoadingMark } from './LoadingMark'

/**
 * A capped window onto a reasoning stream. Collapsed it shows the beginning of
 * the thought behind a fade; open it scrolls, and while the turn is live it
 * follows the newest line — unless the reader has scrolled up, in which case it
 * stays exactly where they put it.
 */
export function ThinkingBlock({
  text,
  streaming = false,
  className
}: {
  text: string
  streaming?: boolean
  className?: string
}): React.JSX.Element | null {
  const t = useT()
  const [open, setOpen] = useState(streaming)
  const bodyRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    setOpen(streaming)
  }, [streaming])

  useEffect(() => {
    if (!streaming || !open) return
    const body = bodyRef.current
    if (body && stick.current) body.scrollTop = body.scrollHeight
  }, [text, streaming, open])

  if (!text.trim()) return null
  const characters = text.trim().length

  return (
    <div
      data-streaming={streaming}
      className={cn('mt-2 overflow-hidden rounded-xl border border-line-soft bg-panel/40', className)}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-panel-2/40"
      >
        {streaming ? (
          <AgentLoadingMark className="text-accent" />
        ) : (
          <Brain className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        )}
        <span className="text-[11.5px] font-medium text-ink-soft">
          {streaming ? t('chat.thinkingLive') : t('chat.thinkingProcess')}
        </span>
        <span className="font-mono text-[9px] text-muted/80">
          {t('chat.thinkingChars', { count: characters })}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn('ml-auto size-3.5 shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div
          ref={bodyRef}
          onScroll={(event) => {
            const element = event.currentTarget
            stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24
          }}
          className="max-h-[300px] overflow-y-auto border-t border-line-soft px-3 py-2 text-[12px] leading-6 text-ink-soft"
        >
          <Markdown content={text} />
        </div>
      ) : null}
    </div>
  )
}
