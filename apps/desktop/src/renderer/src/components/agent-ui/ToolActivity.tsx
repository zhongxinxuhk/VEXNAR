// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { useT } from '@/lib/i18n'
import type { ToolCall } from '@/store/app'
import { ToolCallRow } from './ToolCallRow'

const PAGE_SIZE = 25

const toolLabels: Record<string, string> = {
  read_file: '读取文件',
  list_files: '列出文件',
  git_status: 'Git 状态'
}

function toolTitle(tool: ToolCall): string {
  const args =
    tool.input && typeof tool.input === 'object' ? (tool.input as Record<string, unknown>) : {}
  const command =
    tool.name === 'git_status'
      ? 'git status --short --branch'
      : typeof args.command === 'string'
        ? args.command
        : ''
  return (
    command ||
    [toolLabels[tool.name] || tool.name, typeof args.path === 'string' ? args.path : '']
      .filter(Boolean)
      .join(' · ')
  )
}

export function ToolActivity({
  calls,
  running
}: {
  calls: ToolCall[]
  running: boolean
}): React.JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const lastPage = Math.max(0, Math.ceil(calls.length / PAGE_SIZE) - 1)
  const currentPage = Math.min(page, lastPage)
  const start = currentPage * PAGE_SIZE
  const end = Math.min(start + PAGE_SIZE, calls.length)
  const active = running ? calls.filter((call) => call.status === 'running').length : 0

  return (
    <details
      className="mt-2 rounded-xl border border-line-soft bg-panel/45 px-2 py-1"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer px-2 py-1.5 text-xs text-muted">
        {t('chat.toolActivity', { count: calls.length })}
        {active > 0 ? ` · ${t('chat.toolActiveCount', { count: active })}` : ''}
      </summary>
      {open ? (
        <>
          <div
            key={currentPage}
            tabIndex={0}
            aria-label={t('chat.toolActivity', { count: calls.length })}
            className="ml-2 max-h-80 overflow-y-auto overscroll-contain border-l border-line-soft pl-2"
          >
            {calls.slice(start, end).map((call) => (
              <ToolCallRow
                key={call.id}
                call={call}
                summary={toolTitle(call)}
                turnRunning={running}
              />
            ))}
          </div>
          {lastPage > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 text-[11px] text-muted">
              <span aria-live="polite">{t('chat.toolPage', { start: start + 1, end, total: calls.length })}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                  className="rounded-md px-2 py-1 hover:bg-panel-2 disabled:opacity-40"
                >
                  {t('chat.toolPrevious')}
                </button>
                <button
                  type="button"
                  disabled={currentPage === lastPage}
                  onClick={() => setPage(currentPage + 1)}
                  className="rounded-md px-2 py-1 hover:bg-panel-2 disabled:opacity-40"
                >
                  {t('chat.toolNext')}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </details>
  )
}
