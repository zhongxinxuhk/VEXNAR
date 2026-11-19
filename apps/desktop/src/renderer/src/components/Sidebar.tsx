import { useMemo, useState } from 'react'
import {
  Activity,
  Bug,
  ChevronRight,
  FolderOpen,
  LayoutDashboard,
  MessageSquarePlus,
  Network,
  Plus,
  Search,
  Settings2,
  SquareTerminal,
  Target,
  Trash2
} from 'lucide-react'
import type { MessageKey } from '@/lib/i18n'
import { useT } from '@/lib/i18n'
import { useAppStore, type AppView } from '@/store/app'
import { basename, cn, formatTime } from '@/lib/utils'
import { Button, ScrollArea, Tooltip } from '@/components/ui'

const nav: Array<{ id: AppView; icon: typeof LayoutDashboard; key: MessageKey }> = [
  { id: 'overview', icon: LayoutDashboard, key: 'nav.overview' },
  { id: 'tasks', icon: Target, key: 'nav.tasks' },
  { id: 'findings', icon: Bug, key: 'nav.findings' },
  { id: 'traffic', icon: Activity, key: 'nav.traffic' },
  { id: 'assets', icon: Network, key: 'nav.assets' },
  { id: 'commands', icon: SquareTerminal, key: 'nav.commands' },
  { id: 'system', icon: Settings2, key: 'nav.system' }
]

export function Sidebar(): React.JSX.Element {
  const t = useT()
  const sessions = useAppStore((state) => state.sessions)
  const activeSessionId = useAppStore((state) => state.activeSessionId)
  const view = useAppStore((state) => state.view)
  const backend = useAppStore((state) => state.backend)
  const selectSession = useAppStore((state) => state.selectSession)
  const newSession = useAppStore((state) => state.newSession)
  const removeSession = useAppStore((state) => state.removeSession)
  const chooseWorkspace = useAppStore((state) => state.chooseWorkspace)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const setView = useAppStore((state) => state.setView)
  const settings = useAppStore((state) => state.settings)
  const [hovered, setHovered] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const filteredSessions = useMemo(() => {
    const value = query.trim().toLowerCase()
    return sessions.filter((session) => !value || session.title.toLowerCase().includes(value))
  }, [sessions, query])

  return (
    <aside className="flex w-[252px] shrink-0 flex-col border-r border-line-soft bg-panel/35">
      <div className="space-y-2 px-3 pb-3 pt-3">
        <Button className="w-full justify-between bg-panel-3 text-ink hover:bg-panel-3/80" variant="secondary" onClick={() => void newSession()}>
          <span className="flex items-center gap-2"><Plus className="h-4 w-4" />{t('app.newThread')}</span>
          <span className="font-mono text-[10px] text-muted">⌘N</span>
        </Button>
        <div className="flex h-8 items-center gap-2 rounded-lg border border-line bg-panel-2/60 px-2.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('app.searchThreads')}
            className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted/70"
          />
        </div>
      </div>

      <nav className="space-y-0.5 px-2 pb-2">
        <div className="px-2 pb-1 pt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted/60">{t('app.workspaceNav')}</div>
        <button
          type="button"
          onClick={() => setView('chat')}
          className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors', view === 'chat' ? 'bg-panel-3 text-ink' : 'text-ink-soft hover:bg-panel-2')}
        >
          <MessageSquarePlus className="h-3.5 w-3.5 text-muted" />
          {t('nav.chat')}
        </button>
        {nav.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors', view === item.id ? 'bg-panel-3 text-ink' : 'text-ink-soft hover:bg-panel-2')}
            >
              <Icon className="h-3.5 w-3.5 text-muted" />
              {t(item.key)}
              {item.id === 'overview' && backend?.connected ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent-2" /> : null}
            </button>
          )
        })}
      </nav>

      <div className="mx-3 h-px bg-line-soft" />

      <div className="flex items-center justify-between px-4 pb-1.5 pt-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted/60">{t('app.threads')}</span>
        <span className="font-mono text-[10px] text-muted/40">{filteredSessions.length}</span>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2">
        <div className="flex flex-col gap-0.5 pb-3">
          {filteredSessions.length === 0 ? <div className="px-2 py-6 text-center text-[11px] text-muted">{t('app.noThreads')}</div> : filteredSessions.map((session) => {
            const active = view === 'chat' && session.id === activeSessionId
            return (
              <div
                key={session.id}
                onMouseEnter={() => setHovered(session.id)}
                onMouseLeave={() => setHovered(null)}
                className={cn('flex w-full items-center gap-1 rounded-lg pr-1 transition-colors', active ? 'bg-panel-3 text-ink' : 'text-ink-soft hover:bg-panel-2')}
              >
                <button type="button" onClick={() => void selectSession(session.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left">
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', active ? 'bg-accent' : 'bg-muted/25')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium">{session.title}</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-muted/70">{formatTime(session.updatedAt)}</span>
                  </span>
                </button>
                {hovered === session.id && sessions.length > 1 ? (
                  <button type="button" className="rounded p-1 text-muted hover:bg-danger/15 hover:text-danger" onClick={() => void removeSession(session.id)} aria-label={t('app.deleteThread')}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      </ScrollArea>

      <div className="border-t border-line-soft p-2">
        <button type="button" onClick={() => void chooseWorkspace()} className="group flex w-full items-start gap-2.5 rounded-xl border border-line bg-panel-2/60 px-3 py-2.5 text-left transition-colors hover:border-accent/25 hover:bg-panel-3">
          <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-muted/70">{t('app.workspace')}</span>
            <span className="mt-0.5 block truncate text-xs text-ink-soft">{settings.workspaceRoot ? basename(settings.workspaceRoot) : t('app.chooseFolder')}</span>
          </span>
          <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
        </button>
        <div className="mt-2 flex items-center gap-1">
          <button type="button" onClick={() => setView('system')} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[10px] text-muted hover:text-ink">
            <span className={cn('h-1.5 w-1.5 rounded-full', backend?.connected ? 'bg-accent-2' : 'bg-muted/40')} />
            <span className="truncate">{backend?.connected ? backend.baseUrl : t('app.disconnected')}</span>
          </button>
          <Tooltip label={t('app.settings')} side="top">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSettingsOpen(true)} aria-label={t('app.settings')}>
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>
    </aside>
  )
}
