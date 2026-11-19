import { Command, GitBranch, PanelRightClose, PanelRightOpen, Settings2 } from 'lucide-react'
import type { MessageKey } from '@/lib/i18n'
import { useI18n, useT } from '@/lib/i18n'
import { useAppStore, type AppView } from '@/store/app'
import { cn } from '@/lib/utils'
import { Button, Tooltip } from '@/components/ui'

const viewKeys: Record<AppView, MessageKey> = {
  chat: 'nav.chat',
  overview: 'nav.overview',
  tasks: 'nav.tasks',
  findings: 'nav.findings',
  traffic: 'nav.traffic',
  assets: 'nav.assets',
  commands: 'nav.commands',
  system: 'nav.system'
}

export function TopBar(): React.JSX.Element {
  const t = useT()
  const locale = useI18n((state) => state.locale)
  const toggleLocale = useI18n((state) => state.toggleLocale)
  const view = useAppStore((state) => state.view)
  const sessions = useAppStore((state) => state.sessions)
  const activeSessionId = useAppStore((state) => state.activeSessionId)
  const git = useAppStore((state) => state.git)
  const backend = useAppStore((state) => state.backend)
  const info = useAppStore((state) => state.info)
  const rightOpen = useAppStore((state) => state.rightOpen)
  const toggleRight = useAppStore((state) => state.toggleRight)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const setView = useAppStore((state) => state.setView)
  const session = sessions.find((item) => item.id === activeSessionId)

  return (
    <header className={cn(
        'drag-region flex h-12 shrink-0 items-center gap-3 border-b border-line-soft bg-bg/80 pr-3 backdrop-blur',
        info?.platform === 'darwin' ? 'pl-[86px]' : 'pl-3'
      )}>
      <div className="no-drag flex min-w-0 items-center gap-2 text-xs text-muted">
        <button
          type="button"
          onClick={() => setView('chat')}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted/70 hover:text-ink"
        >
          vexnar
        </button>
        <span className="text-muted/30">/</span>
        <button type="button" onClick={() => setView(view === 'chat' ? 'overview' : 'chat')} className="truncate text-ink-soft hover:text-ink">
          {t(viewKeys[view])}
        </button>
        {view === 'chat' && session ? (
          <>
            <span className="text-muted/30">/</span>
            <span className="max-w-[360px] truncate font-mono text-[10px] text-muted">{session.title}</span>
          </>
        ) : null}
        {git ? (
          <span className="ml-1 hidden max-w-[180px] items-center gap-1 truncate rounded-md border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-muted md:flex">
            <GitBranch className="h-3 w-3" />
            {git.branch}
            {git.ahead ? ` ↑${git.ahead}` : ''}
            {git.behind ? ` ↓${git.behind}` : ''}
          </span>
        ) : null}
      </div>

      <div className="no-drag ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setView('system')}
          className={cn(
            'hidden items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-[10px] sm:flex',
            backend?.connected
              ? 'border-accent-2/20 bg-accent-2/5 text-accent-2'
              : 'border-line bg-panel-2 text-muted hover:text-ink'
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', backend?.connected ? 'bg-accent-2' : 'bg-muted/40')} />
          {backend?.connected ? backend.service ?? t('app.connected') : t('app.disconnected')}
        </button>
        <Tooltip label={t('settings.language')} side="bottom">
          <button
            type="button"
            onClick={toggleLocale}
            className="rounded-md px-2 py-1 font-mono text-[10px] text-muted transition-colors hover:bg-panel-2 hover:text-ink"
            aria-label={t('settings.language')}
          >
            {locale === 'zh' ? '中 / EN' : 'EN / 中'}
          </button>
        </Tooltip>
        <span className="hidden items-center gap-1 font-mono text-[10px] text-muted/50 lg:flex">
          <Command className="h-3 w-3" />B
        </span>
        <Tooltip label={rightOpen ? t('app.hidePanel') : t('app.showPanel')} side="bottom">
          <Button variant="ghost" size="icon" onClick={toggleRight} aria-label={t('app.togglePanel')}>
            {rightOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </Button>
        </Tooltip>
        <Tooltip label={t('app.settings')} side="bottom">
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} aria-label={t('app.settings')}>
            <Settings2 className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>
    </header>
  )
}
