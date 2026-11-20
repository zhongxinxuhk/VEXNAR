import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Activity,
  BookOpenText,
  Bug,
  Clock3,
  Ellipsis,
  FolderClosed,
  GitBranch,
  Globe2,
  House,
  LayoutDashboard,
  Network,
  Settings,
  Shield,
  SquareCheckBig,
  SquareTerminal,
  Target
} from 'lucide-react'
import { useT } from '@/lib/i18n'
import { useAppStore, type AppView } from '@/store/app'
import { cn } from '@/lib/utils'
import { ProfileMenu } from '@/components/ProfileMenu'
import { QuotaMenu } from '@/components/QuotaMenu'
import { Tooltip } from '@/components/ui'

const menuContent =
  'z-50 min-w-[196px] rounded-xl border border-line bg-bg p-1 codex-popover outline-none'
const menuItem =
  'flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-[7px] text-[12.5px] text-ink-soft outline-none data-[highlighted]:bg-panel-2 data-[highlighted]:text-ink'
const menuLabel = 'px-2.5 pb-1 pt-1.5 text-[10.5px] font-medium text-muted'

function RailButton({
  label,
  active,
  onClick,
  children
}: {
  label: string
  active?: boolean
  onClick?: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip label={label} side="right">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          'no-drag grid h-8 w-8 place-items-center rounded-[9px] text-muted transition-colors',
          active ? 'rail-active' : 'hover:bg-panel-3/70 hover:text-ink'
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}

export function IconRail(): React.JSX.Element {
  const t = useT()
  const view = useAppStore((state) => state.view)
  const setView = useAppStore((state) => state.setView)
  const sessions = useAppStore((state) => state.sessions)
  const activeSessionId = useAppStore((state) => state.activeSessionId)
  const selectSession = useAppStore((state) => state.selectSession)
  const newSession = useAppStore((state) => state.newSession)
  const chooseWorkspace = useAppStore((state) => state.chooseWorkspace)
  const setRightTab = useAppStore((state) => state.setRightTab)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const info = useAppStore((state) => state.info)

  const mac =
    (info?.platform ?? (navigator.userAgent.includes('Mac') ? 'darwin' : '')) === 'darwin'
  const recent = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8)
  const consoleItems: Array<{ id: AppView; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: t('nav.overview'), icon: LayoutDashboard },
    { id: 'tasks', label: t('nav.tasks'), icon: Target },
    { id: 'findings', label: t('nav.findings'), icon: Bug },
    { id: 'traffic', label: t('nav.traffic'), icon: Activity },
    { id: 'assets', label: t('nav.assets'), icon: Network },
    { id: 'commands', label: t('nav.commands'), icon: SquareTerminal }
  ]

  return (
    <aside className="relative z-20 flex w-[56px] shrink-0 flex-col items-center border-r border-line-soft bg-panel">
      <div
        className="drag-region w-full shrink-0"
        style={{ height: mac ? 51 : 8 }}
      />

      <nav className="flex flex-col items-center gap-1.5">
        <RailButton label={t('rail.home')} active={view === 'chat'} onClick={() => setView('chat')}>
          <House className="h-[19px] w-[19px]" strokeWidth={1.9} />
        </RailButton>

        <RailButton
          label={t('rail.tasks')}
          active={view === 'tasks'}
          onClick={() => setView('tasks')}
        >
          <SquareCheckBig className="h-[19px] w-[19px]" strokeWidth={1.8} />
        </RailButton>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label={t('rail.recent')}
              className="no-drag grid h-8 w-8 place-items-center rounded-[9px] text-muted transition-colors hover:bg-panel-3/70 hover:text-ink"
            >
              <Clock3 className="h-[19px] w-[19px]" strokeWidth={1.8} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content side="right" align="start" sideOffset={10} className={menuContent}>
              <div className={menuLabel}>{t('rail.recent')}</div>
              {recent.length === 0 ? (
                <div className="px-2.5 py-2 text-[12px] text-muted">{t('app.noChats')}</div>
              ) : (
                recent.map((session) => (
                  <DropdownMenu.Item
                    key={session.id}
                    className={cn(menuItem, session.id === activeSessionId && 'bg-panel-2 text-ink')}
                    onSelect={() => {
                      setView('chat')
                      void selectSession(session.id)
                    }}
                  >
                    <span className="truncate">{session.title}</span>
                  </DropdownMenu.Item>
                ))
              )}
              <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />
              <DropdownMenu.Item
                className={menuItem}
                onSelect={() => {
                  setView('chat')
                  void newSession()
                }}
              >
                {t('app.newChat')}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <RailButton
          label={t('rail.docs')}
          onClick={() => {
            setView('chat')
            setRightTab('workspace')
          }}
        >
          <BookOpenText className="h-[19px] w-[19px]" strokeWidth={1.8} />
        </RailButton>

        <RailButton
          label={t('rail.browse')}
          active={view === 'assets'}
          onClick={() => setView('assets')}
        >
          <Globe2 className="h-[19px] w-[19px]" strokeWidth={1.8} />
        </RailButton>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label={t('rail.more')}
              className="no-drag grid h-8 w-8 place-items-center rounded-[9px] text-muted transition-colors hover:bg-panel-3/70 hover:text-ink"
            >
              <Ellipsis className="h-[19px] w-[19px]" strokeWidth={1.8} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content side="right" align="start" sideOffset={10} className={menuContent}>
              <div className={menuLabel}>{t('app.more')}</div>
              {consoleItems.map((item) => {
                const Icon = item.icon
                return (
                  <DropdownMenu.Item
                    key={item.id}
                    className={cn(menuItem, view === item.id && 'bg-panel-2 text-ink')}
                    onSelect={() => setView(item.id)}
                  >
                    <Icon className="h-4 w-4 text-muted" strokeWidth={1.8} />
                    {item.label}
                  </DropdownMenu.Item>
                )
              })}
              <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />
              <DropdownMenu.Item className={menuItem} onSelect={() => setSettingsOpen(true)}>
                <Settings className="h-4 w-4 text-muted" strokeWidth={1.8} />
                {t('app.settings')}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </nav>

      <div className="mt-[136px]" />

      <nav className="flex flex-col items-center gap-1.5">
        <RailButton label={t('rail.workspace')} onClick={() => void chooseWorkspace()}>
          <FolderClosed className="h-[19px] w-[19px]" strokeWidth={1.8} />
        </RailButton>

        <RailButton label={t('rail.changes')} onClick={() => setRightTab('diff')}>
          <GitBranch className="h-[19px] w-[19px]" strokeWidth={1.8} />
        </RailButton>

        <RailButton
          label={t('rail.findings')}
          active={view === 'findings'}
          onClick={() => setView('findings')}
        >
          <Shield className="h-[19px] w-[19px]" strokeWidth={1.8} />
        </RailButton>
      </nav>

      <div className="mt-auto flex flex-col items-center gap-3 pb-3">
        <QuotaMenu />
        <ProfileMenu />
      </div>
    </aside>
  )
}