// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import * as ContextMenu from '@radix-ui/react-context-menu'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronRight, Copy, Folder, FolderOpen, MoreHorizontal, SquarePen } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { SidebarProject } from '@/lib/session-navigation'

const content = 'z-50 min-w-[168px] rounded-xl border border-line bg-bg p-1 codex-popover outline-none'
const item = 'flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink-soft outline-none data-[highlighted]:bg-panel-2 data-[highlighted]:text-ink'

export function WorkspaceProjectRow({ project, expanded, active, toggle, create }: {
  project: SidebarProject
  expanded: boolean
  active: boolean
  toggle: () => void
  create: () => void
}): React.JSX.Element {
  const t = useT()
  const FolderIcon = expanded ? FolderOpen : Folder
  const copyPath = (): void => { void window.vexnar.app.copyText(project.rootPath) }
  const newLabel = t('app.newProjectChat', { project: project.name })

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className="group/workspace flex h-8 items-center gap-0.5 rounded-lg hover:bg-panel-2">
          <button
            type="button"
            aria-expanded={expanded}
            title={project.rootPath}
            onClick={toggle}
            className={cn('flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 text-left text-ink-soft', active && 'font-medium text-ink')}
          >
            <ChevronRight className={cn('size-3 shrink-0 text-muted transition-transform', expanded && 'rotate-90')} aria-hidden="true" />
            <FolderIcon className={cn('size-3.5 shrink-0 text-muted', active && 'text-accent')} aria-hidden="true" />
            <span className="min-w-0 truncate text-[13px]">{project.name}</span>
          </button>
          <div className="flex shrink-0 items-center pr-0.5">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  aria-label={t('app.workspaceActions', { project: project.name })}
                  className="grid size-6 place-items-center rounded text-muted opacity-0 hover:bg-panel-3 group-focus-within/workspace:opacity-100 group-hover/workspace:opacity-100 data-[state=open]:opacity-100"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={5} className={content}>
                  <DropdownMenu.Item className={item} onSelect={create}><SquarePen className="size-3.5" />{newLabel}</DropdownMenu.Item>
                  <DropdownMenu.Item className={item} onSelect={copyPath}><Copy className="size-3.5" />{t('app.copyWorkspacePath')}</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <button type="button" aria-label={newLabel}
              className="grid size-6 place-items-center rounded text-muted hover:bg-panel-3" onClick={create}>
              <SquarePen className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={content}>
          <ContextMenu.Item className={item} onSelect={create}><SquarePen className="size-3.5" />{newLabel}</ContextMenu.Item>
          <ContextMenu.Item className={item} onSelect={copyPath}><Copy className="size-3.5" />{t('app.copyWorkspacePath')}</ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
