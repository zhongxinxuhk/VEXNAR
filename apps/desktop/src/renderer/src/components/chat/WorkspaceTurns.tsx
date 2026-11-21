// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMemo } from 'react'
import { Tooltip } from '@/components/ui'
import { useT } from '@/lib/i18n'
import type { ChatMessage } from '@/store/app'

const TURN_MARK_LIMIT = 12

export function WorkspaceTurns({ messages, jump }: {
  messages: ChatMessage[]
  jump: (messageId: string) => void
}): React.JSX.Element | null {
  const t = useT()
  const turns = useMemo(() => messages.filter((row) => row.role === 'user'), [messages])
  if (turns.length < 2) return null
  const window = turns.slice(-TURN_MARK_LIMIT)

  return (
    <nav className="vex-workspace-turns" aria-label={t('app.turnNavigator')}>
      {window.map((row, index) => {
        const label = t('app.turnNumber', { turn: turns.length - window.length + index + 1 })
        const snippet = row.content.trim().slice(0, 120)
        return (
          <Tooltip key={row.id} label={snippet || label} side="left">
            <button
              type="button"
              aria-label={label}
              data-workspace-turn={row.id}
              onClick={() => jump(row.id)}
              className="group grid min-h-5 w-5 place-items-center rounded-md hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span className="h-0.5 w-2.5 rounded-full bg-line transition-colors group-hover:bg-ink-soft" aria-hidden="true" />
            </button>
          </Tooltip>
        )
      })}
    </nav>
  )
}
