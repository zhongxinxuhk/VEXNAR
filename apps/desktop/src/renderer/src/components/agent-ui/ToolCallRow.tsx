// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pattern adapted from Motif's Tool Call (MIT). See ./NOTICE.md.

import { BookOpen, Check, ChevronDown, Loader2, SquareTerminal, Wrench, X } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export type ToolCallStatus = 'running' | 'done' | 'error'

function statusTone(status: ToolCallStatus): string {
  if (status === 'running') return 'text-warn'
  if (status === 'error') return 'text-danger'
  return 'text-accent-2'
}

/**
 * One call, one row: what the tool is, the gist of what it was given, where it
 * stands, and the arguments and result behind a disclosure. The row carries no
 * container of its own so a transcript with a dozen calls still reads as a
 * transcript rather than a stack of cards.
 */
export function ToolCallRow({
  name,
  summary,
  status,
  input,
  output,
  className
}: {
  name: string
  summary: string
  status: ToolCallStatus
  input?: unknown
  output?: string
  className?: string
}): React.JSX.Element {
  const t = useT()
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : null
  const command = typeof record?.command === 'string' ? record.command : ''
  const inputText = command ? `$ ${command}` : input ? JSON.stringify(input, null, 2) : ''
  const outputText = output || (status === 'running' ? t('chat.toolWaiting') : t('chat.toolEmpty'))
  const Icon = command ? SquareTerminal : name === 'read_file' || name === 'list_files' ? BookOpen : Wrench
  const tone = statusTone(status)

  return (
    <details className={cn('group', className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-panel-2/60">
        <Icon className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span className="max-w-[120px] shrink-0 truncate text-[9.5px] font-medium uppercase tracking-[0.08em] text-muted">{name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink-soft" title={summary}>
          {summary}
        </span>
        <span className={cn('flex shrink-0 items-center gap-1 font-mono text-[9px]', tone)}>
          {status === 'running' ? (
            <Loader2 className="size-2.5 animate-spin" aria-hidden="true" />
          ) : status === 'error' ? (
            <X className="size-2.5" aria-hidden="true" />
          ) : (
            <Check className="size-2.5" aria-hidden="true" />
          )}
          {status === 'running' ? t('chat.toolRunning') : status === 'error' ? t('chat.toolError') : t('chat.toolDone')}
        </span>
        <ChevronDown className="size-3 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="my-1 ml-6 overflow-hidden rounded-lg border border-line-soft bg-panel">
        {inputText ? (
          <section className="border-b border-line-soft px-2.5 py-2">
            <div className="mb-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted/80">{t('chat.toolInput')}</div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10.5px] leading-5 text-ink-soft">
              {inputText}
            </pre>
          </section>
        ) : null}
        <section className="px-2.5 py-2">
          <div className="mb-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted/80">{t('chat.toolOutput')}</div>
          <pre
            className={cn(
              'max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[10.5px] leading-5',
              status === 'error' ? 'text-danger/90' : 'text-ink-soft'
            )}
          >
            {outputText}
          </pre>
        </section>
      </div>
    </details>
  )
}
