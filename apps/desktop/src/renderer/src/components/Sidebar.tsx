// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { ConversationNotifications } from './chat/ConversationNotifications'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ArrowUpDown,
  Bell,
  ChevronDown,
  ChevronRight,
  Folder,
  Plus,
  Search,
  SquarePen,
  X
} from 'lucide-react'
import { useT } from '@/lib/i18n'
import { useLayout } from '@/store/layout'
import { useAppStore } from '@/store/app'
import { cn } from '@/lib/utils'
import { SessionRow } from './SessionRow'
import { movePinned, sessionNavigation } from '@/lib/session-navigation'

const menuContent =
  'z-50 min-w-[168px] rounded-xl border border-line bg-bg p-1 codex-popover outline-none'
const menuItem =
  'flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-[7px] text-[12.5px] text-ink-soft outline-none data-[highlighted]:bg-panel-2 data-[highlighted]:text-ink'

const pinOrderKey = 'vexnar-sidebar-pin-order-v1'
function readPinOrder(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(pinOrderKey) ?? '[]')
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

export function Sidebar(): React.JSX.Element {
  const t = useT()
  const sidebarWidth = useLayout((state) => state.sidebarWidth)
  const sidebarOpen = useLayout((state) => state.sidebarOpen)
  const sessions = useAppStore((state) => state.sessions)
  const activeSessionId = useAppStore((state) => state.activeSessionId)
  const draftWorkspace = useAppStore((state) => state.draftWorkspace)
  const view = useAppStore((state) => state.view)
  const newSession = useAppStore((state) => state.newSession)
  const chooseWorkspace = useAppStore((state) => state.chooseWorkspace)
  const addProject = useAppStore((state) => state.addProject)
  const setView = useAppStore((state) => state.setView)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)

  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const projectRows = useAppStore((state) => state.projects)
  const [projectsCollapsed, setProjectsCollapsed] = useState(false)
  const [pinOrder, setPinOrder] = useState(readPinOrder)
  const [sortMode, setSortMode] = useState<'recent' | 'name'>('recent')
  const searchRef = useRef<HTMLInputElement>(null)
  const lastAutoExpand = useRef<string | null>(null)

  useEffect(() => {
    if (searching) searchRef.current?.focus()
  }, [searching])

  useEffect(() => {
    const current = sessions.find((session) => session.id === activeSessionId)
    const key = current?.projectId ?? (!activeSessionId ? projectRows.find((row) => row.root_path === draftWorkspace)?.id : undefined)
    if (!key) return
    if (lastAutoExpand.current === key) return
    lastAutoExpand.current = key
    setExpanded((previous) => new Set(previous).add(key))
  }, [activeSessionId, sessions, draftWorkspace, projectRows])

  const { pinned, projects: visibleProjects, recent: looseSessions } = useMemo(
    () => sessionNavigation(sessions, projectRows, pinOrder, sortMode),
    [sessions, projectRows, pinOrder, sortMode]
  )
  const movePin = (id: string, delta: -1 | 1): void => {
    const next = movePinned(pinned.map((row) => row.id), id, delta)
    setPinOrder(next)
    try { localStorage.setItem(pinOrderKey, JSON.stringify(next)) } catch { /* keep window state */ }
  }

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return []
    return sessions.filter(
      (session) =>
        session.title.toLowerCase().includes(value) ||
        session.workspace.toLowerCase().includes(value) ||
        projectRows.some((project) => project.id === session.projectId && project.name.toLowerCase().includes(value))
    )
  }, [sessions, projectRows, query])

  const toggleProject = (path: string): void => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const createProject = async (): Promise<void> => {
    const project = await addProject()
    if (project) {
      setProjectsCollapsed(false)
      setExpanded((previous) => new Set(previous).add(project.id))
    }
  }

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
                <ConversationNotifications />
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

      <button
        type="button"
        onClick={() => {
          setView('chat')
          void newSession()
        }}
        className="mx-2 mt-4 flex h-8 shrink-0 items-center gap-2.5 rounded-lg px-3 text-left text-[13px] font-medium text-ink-soft transition-colors hover:bg-[var(--codex-hover)] hover:text-ink"
      >
        <SquarePen className="h-[16px] w-[16px] text-muted" strokeWidth={1.8} />
        {t('app.newChat')}
      </button>

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
                  sidebar
                  showWorkspace
                />
              ))
            )}
          </div>
        ) : (
          <>
            {pinned.length > 0 ? (
              <div className="pt-3">
                <div className="px-2 pb-1.5 text-[11px] font-medium text-muted">{t('app.pinned')}</div>
                {pinned.map((session, index) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    active={view === 'chat' && session.id === activeSessionId}
                    pinned
                    sidebar
                    moveUp={index > 0 ? () => movePin(session.id, -1) : undefined}
                    moveDown={index < pinned.length - 1 ? () => movePin(session.id, 1) : undefined}
                  />
                ))}
              </div>
            ) : null}

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
                  onClick={() => void createProject()}
                  className="grid h-6 w-6 place-items-center rounded-md text-muted transition-colors hover:bg-panel-3 hover:text-ink"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>
            </div>

            {projectsCollapsed ? null : visibleProjects.length === 0 ? (
              <div className="px-2 py-6 text-center text-[12px] leading-5 text-muted">
                {t('app.noChats')}
              </div>
            ) : (
              visibleProjects.map((project) => {
                const open = expanded.has(project.id)
                const visible = project.sessions
                return (
                  <div key={project.id} className="mb-0.5" data-project-id={project.id}>
                    <div className="group/project flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-expanded={open}
                      title={project.rootPath}
                      onClick={() => toggleProject(project.id)}
                      className={cn(
                        'group flex h-[31px] w-full items-center gap-2 rounded-[7px] px-2 text-left transition-colors',
                        open && sessions.some((row) => row.projectId === project.id && row.id === activeSessionId)
                          ? 'bg-panel-3/80 text-ink'
                          : 'text-ink-soft hover:bg-[var(--codex-hover)] hover:text-ink'
                      )}
                    >
                      <Folder className="h-[15px] w-[15px] shrink-0 text-muted" strokeWidth={1.7} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{project.name}</span>
                      <ChevronRight
                        className={cn(
                          'h-3 w-3 shrink-0 text-muted/60 opacity-0 transition-all group-hover:opacity-100',
                          open && 'rotate-90'
                        )}
                      />
                    </button>
                    <button type="button" aria-label={t('app.newProjectChat', { project: project.name })}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-panel-3"
                      onClick={() => {
                        setExpanded((previous) => new Set(previous).add(project.id))
                        void newSession(project.rootPath)
                      }}>
                      <SquarePen className="size-3.5" aria-hidden="true" />
                    </button>
                    </div>
                    {open ? (
                      <div className="mt-0.5">
                        {visible.length === 0 ? <p className="px-6 py-1 text-xs text-muted">{t('app.noChats')}</p> : null}
                        {visible.map((session) => (
                          <SessionRow
                            key={session.id}
                            sidebar
                            session={session}
                            active={view === 'chat' && session.id === activeSessionId}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })
            )}

            {/* 最近：无工作区的单次聊天，独立于「项目」分组（ChatGPT 的顶层会话） */}
            {looseSessions.length > 0 ? (
              <div className="mt-1">
                <div className="flex items-center gap-1 px-2 pb-1 pt-4">
                  <span className="text-[11px] font-medium text-muted">{t('app.recentChats')}</span>
                </div>
                {looseSessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    sidebar
                    session={session}
                    active={view === 'chat' && session.id === activeSessionId}
                  />
                ))}
              </div>
            ) : null}

            {sessions.length === 0 ? (
              <div className="px-2 py-6 text-center text-[12px] text-muted">{t('app.noChats')}</div>
            ) : null}
          </>
        )}
      </div>
    </aside>
  )
}