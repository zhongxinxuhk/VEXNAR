// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pattern adapted from Motif's Loading State (MIT). See ./NOTICE.md.

import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * A 3×3 mark whose diagonal wave says one thing: the agent is working. It is
 * small enough for a header and the stagger is pure CSS, so sixty frames of
 * waiting never re-render the transcript.
 */
export function AgentLoadingMark({ className }: { className?: string }): React.JSX.Element {
  return (
    <span aria-hidden="true" className={cn('grid size-3.5 shrink-0 grid-cols-3 grid-rows-3 gap-[1.5px]', className)}>
      {Array.from({ length: 9 }).map((_, index) => {
        const row = Math.floor(index / 3)
        const column = index % 3
        return (
          <span
            key={index}
            className="agent-loading-cell rounded-[1px] bg-current"
            style={{ animationDelay: `${(row + column) * 90}ms` }}
          />
        )
      })}
    </span>
  )
}

/** A compact waiting state shown while the backend reports an active turn. */
export function AgentLoading({
  label,
  className
}: {
  label?: string
  className?: string
}): React.JSX.Element {
  const t = useT()
  return (
    <div className={cn('flex items-center gap-2 text-[12px] text-muted', className)}>
      <AgentLoadingMark className="text-accent" />
      <span role="status" className="min-w-0 truncate">
        {label ?? t('chat.thinking')}
      </span>
    </div>
  )
}
