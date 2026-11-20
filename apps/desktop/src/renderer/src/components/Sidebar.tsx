// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useMemo, useRef, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ArrowUpDown,
  Bell,
  ChevronDown,
  Folder,
  Plus,
  Search,
  X
} from 'lucide-react'
import { useT } from '@/lib/i18n'
import { useLayout } from '@/store/layout'
import { useAppStore } from '@/store/app'
import { basename, cn } from '@/lib/utils'
import { SessionRow } from './SessionRow'

const menuContent =
  'z-50 min-w-[168px] rounded-xl border border-line bg-bg p-1 codex-popover outline-none'
const menuItem =
  'flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-[7px] text-[12.5px] text-ink-soft outline-none data-[highlighted]:bg-panel-2 data-[highlighted]:text-ink'
const menuLabel = 'px-2.5 pb-1 pt-1.5 text-[10.5px] font-medium text-muted'

function projectName(path: string, fallback: string): string {
  if (!path) return fallback
  return basename(path) || path
}

type Project = {
  path: string
  name: string
  latest: number
}

export function Sidebar(): React.JSX.Element {
  const t = useT()
  const sidebarWidth = useLayout((state) => state.sidebarWidth)
  const sidebarOpen = useLayout((state) => state.sidebarOpen)
  const sessions = useAppStore((state) => state.sessions)
  const activeSessionId = useAppStore((state) => state.activeSessionId)
  const view = useAppStore((state) => state.view)
  const settings = useAppStore((state) => state.settings)
  const backend = useAppStore((state) => state.backend)
  const chooseWorkspace = useAppStore((state) => state.chooseWorkspace)
  const switchWorkspace = useAppStore((state) => state.switchWorkspace)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)

  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [projectsCollapsed, setProjectsCollapsed] = useState(false)
  const [sortMode, setSortMode] = useState<'recent' | 'name'>('recent')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searching) searchRef.current?.focus()
  }, [searching])

  const projects = useMemo(() => {
    const paths = new Map<string, Project>()
    for (const session of sessions) {
      const path = session.workspace
      if (!path) continue
      const latest = Math.max(session.updatedAt, paths.get(path)?.latest ?? 0)
      paths.set(path, { path, name: projectName(path, path), latest })
    }
    const root = settings.workspaceRoot
    if (root && !paths.has(root)) paths.set(root, { path: root, name: projectName(root, root), latest: 0 })
    return [...paths.values()].sort((a, b) => {
      if (a.path === root) return -1
      if (b.path === root) return 1
      return sortMode === 'name' ? a.name.localeCompare(b.name) : b.latest - a.latest
    })
  }, [sessions, settings.workspaceRoot, sortMode])

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return []
    return sessions.filter(
      (session) =>
        session.title.toLowerCase().includes(value) ||
        session.workspace.toLowerCase().includes(value)
    )
  }, [sessions, query])

  if (!sidebarOpen) return <></>

  return (
    <aside data-testid="chat-sidebar" style={{ width: sidebarWidth }} className="relative z-10 flex shrink-0 flex-col border-r border-line bg-panel">
      <div
        className={cn(
          'drag-region flex shrink-0 items-center gap-1.5 pl-4 pr-2',
          'h-[44px]'
        )}
      >
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="no-drag flex items-center gap-0.5 rounded-md py-0.5 text-[14px] font-semibold tracking-[-0.01em] text-ink outline-none hover:text-black"
            >
              {t('app.name')}
              <ChevronDown className="mt-[1px] h-3.5 w-3.5 text-muted" strokeWidth={2} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content side="bottom" align="start" sideOffset={6} className={menuContent}>
              <DropdownMenu.Item className={menuItem} onSelect={() => setSettingsOpen(true)}>
                {t('app.settings')}
              </DropdownMenu.Item>
              <DropdownMenu.Item className={menuItem} onSelect={() => void chooseWorkspace()}>
                {t('rail.workspace')}
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />
              <DropdownMenu.Item className={menuItem} disabled>
                {t('app.about')}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <div className="no-drag ml-auto flex items-center gap-0.5">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label={t('app.notifications')}
                className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-panel-3 hover:text-ink data-[state=open]:bg-panel-3 data-[state=open]:text-ink"
              >
                <Bell className="h-[16px] w-[16px]" strokeWidth={1.8} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content side="bottom" align="end" sideOffset={6} className={menuContent}>
                <div className={menuLabel}>{t('app.notifications')}</div>
                <div className="px-2.5 py-3 text-center text-[12px] text-muted">
                  {t('app.noNotifications')}
                </div>
                <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />
                <div className="flex items-center gap-2 px-2.5 py-2 text-[11.5px] text-muted">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      backend?.connected ? 'bg-accent-2' : 'bg-muted/40'
                    )}
                  />
                  {backend?.connected ? t('app.localServiceReady') : t('app.localServiceStarting')}
                </div>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <button
            type="button"
            aria-label={t('app.search')}
            onClick={() => {
              setSearching((value) => !value)
              setQuery('')
            }}
            className={cn(
              'grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-panel-3 hover:text-ink',
              searching ? 'bg-panel-3 text-ink' : 'text-muted'
            )}
          >
            {searching ? <X className="h-[16px] w-[16px]" /> : <Search className="h-[16px] w-[16px]" strokeWidth={1.8} />}
          </button>
        </div>
      </div>

      {searching ? (
        <div className="px-3 pb-1.5">
          <div className="flex h-8 items-center gap-2 rounded-lg border border-line bg-bg px-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setSearching(false)
                  setQuery('')
                }
              }}
              placeholder={t('app.searchChats')}
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-muted/80"
            />
          </div>
        </div>
      ) : null}

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {query.trim() ? (
          <div className="pt-3">
            <div className="px-2 pb-1.5 text-[11px] font-medium text-muted">{t('app.threads')}</div>
            {filtered.length === 0 ? (
              <div className="px-2 py-6 text-center text-[12px] text-muted">{t('app.noThreads')}</div>
            ) : (
              filtered.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  active={view === 'chat' && session.id === activeSessionId}
                  pinned={session.pinned}
                  showWorkspace
                />
              ))
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1 px-2 pb-1 pt-4">
              <button
                type="button"
                onClick={() => setProjectsCollapsed((value) => !value)}
                className="flex items-center gap-1 text-[11px] font-medium text-muted transition-colors hover:text-ink-soft"
              >
                {t('app.projects')}
                <ChevronDown
                  className={cn(
                    'h-3 w-3 strokeWidth-2 transition-transform',
                    projectsCollapsed && '-rotate-90'
                  )}
                  strokeWidth={2}
                />
              </button>
              <div className="ml-auto flex items-center gap-0.5">
                <button
                  type="button"
                  aria-label={t('app.sortProjects')}
                  title={t('app.sortProjects')}
                  onClick={() => setSortMode((value) => (value === 'recent' ? 'name' : 'recent'))}
                  className="grid h-6 w-6 place-items-center rounded-md text-muted transition-colors hover:bg-panel-3 hover:text-ink"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  aria-label={t('app.newProject')}
                  title={t('app.newProject')}
                  onClick={() => void chooseWorkspace()}
                  className="grid h-6 w-6 place-items-center rounded-md text-muted transition-colors hover:bg-panel-3 hover:text-ink"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>
            </div>

            {!projectsCollapsed && projects.map((project) => (
              <button
                key={project.path}
                type="button"
                title={project.path}
                aria-current={project.path === settings.workspaceRoot}
                onClick={() => void switchWorkspace(project.path)}
                className={cn(
                  'mb-0.5 flex h-[31px] w-full items-center gap-2 rounded-[7px] px-2 text-left text-[13px] transition-colors',
                  project.path === settings.workspaceRoot
                    ? 'bg-panel-3/80 text-ink'
                    : 'text-ink-soft hover:bg-[var(--codex-hover)] hover:text-ink'
                )}
              >
                <Folder className="h-[15px] w-[15px] shrink-0 text-muted" strokeWidth={1.7} />
                <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
              </button>
            ))}
            {sessions.some((session) => !session.workspace) ? (
              <button
                type="button"
                aria-current={!settings.workspaceRoot}
                onClick={() => void switchWorkspace('')}
                className="mt-3 flex h-8 w-full items-center rounded-lg px-2 text-left text-xs text-muted hover:bg-panel-3 aria-[current=true]:bg-panel-3/80 aria-[current=true]:text-ink"
              >
                {t('app.unassigned')}
              </button>
            ) : null}
          </>
        )}
      </div>
    </aside>
  )
}
