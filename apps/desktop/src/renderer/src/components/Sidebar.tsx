import { useState } from 'react'
import {
  ChevronDown,
  FolderOpen,
  MessageSquarePlus,
  MoreHorizontal,
  Settings2,
  Trash2
} from 'lucide-react'
import { useAppStore } from '@/store/app'
import { basename, cn, formatTime } from '@/lib/utils'
import { Button, ScrollArea, Separator, Tooltip } from '@/components/ui'

export function Sidebar(): React.JSX.Element {
  const sessions = useAppStore((state) => state.sessions)
  const activeSessionId = useAppStore((state) => state.activeSessionId)
  const selectSession = useAppStore((state) => state.selectSession)
  const newSession = useAppStore((state) => state.newSession)
  const removeSession = useAppStore((state) => state.removeSession)
  const chooseWorkspace = useAppStore((state) => state.chooseWorkspace)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const settings = useAppStore((state) => state.settings)
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-line-soft bg-panel/60">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 font-mono text-[15px] font-bold text-slate-950 shadow-lg shadow-accent/10">
            V
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-ink">VEXNAR</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              desktop agent
            </div>
          </div>
        </div>
        <Tooltip label="Settings">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>

      <div className="px-3 pb-3">
        <Button className="w-full justify-start gap-2" onClick={() => void newSession()}>
          <MessageSquarePlus className="h-4 w-4" />
          New chat
          <span className="ml-auto font-mono text-[10px] text-slate-950/60">⌘N</span>
        </Button>
      </div>

      <div className="flex items-center justify-between px-4 pb-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
          Threads
        </span>
        <MoreHorizontal className="h-3.5 w-3.5 text-muted/50" />
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2">
        <div className="flex flex-col gap-0.5 pb-3">
          {sessions.map((session) => {
            const active = session.id === activeSessionId
            return (
              <div
                key={session.id}
                onMouseEnter={() => setHovered(session.id)}
                onMouseLeave={() => setHovered(null)}
                className={cn(
                  'flex w-full items-center gap-1 rounded-lg pr-1 transition-colors',
                  active ? 'bg-panel-3 text-ink' : 'text-ink-soft hover:bg-panel-2'
                )}
              >
                <button
                  type="button"
                  onClick={() => void selectSession(session.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      active ? 'bg-accent' : 'bg-muted/25'
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{session.title}</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-muted">
                      {formatTime(session.updatedAt)}
                    </span>
                  </span>
                </button>
                {hovered === session.id && sessions.length > 1 ? (
                  <button
                    type="button"
                    className="rounded p-1 text-muted hover:bg-danger/15 hover:text-danger"
                    onClick={() => void removeSession(session.id)}
                    aria-label={`Delete ${session.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      </ScrollArea>

      <Separator />
      <button
        type="button"
        onClick={() => void chooseWorkspace()}
        className="group m-2 flex items-start gap-2.5 rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-left transition-colors hover:border-accent/30 hover:bg-panel-3"
      >
        <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Workspace
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-soft">
            {settings.workspaceRoot ? basename(settings.workspaceRoot) : 'Choose a folder'}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[10px] text-muted/70">
            {settings.workspaceRoot || 'no folder selected'}
          </span>
        </span>
        <ChevronDown className="mt-1 h-3.5 w-3.5 shrink-0 text-muted transition-transform group-hover:translate-y-0.5" />
      </button>
    </aside>
  )
}
