import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  AlertTriangle,
  Command,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
  X
} from 'lucide-react'
import { Sidebar } from '@/components/Sidebar'
import { ChatView } from '@/components/ChatView'
import { RightPanel } from '@/components/RightPanel'
import { SettingsDialog } from '@/components/SettingsDialog'
import { Button, Tooltip, TooltipProvider } from '@/components/ui'
import { useAppStore } from '@/store/app'

export default function App(): React.JSX.Element {
  const init = useAppStore((state) => state.init)
  const handleAgentEvent = useAppStore((state) => state.handleAgentEvent)
  const rightOpen = useAppStore((state) => state.rightOpen)
  const toggleRight = useAppStore((state) => state.toggleRight)
  const error = useAppStore((state) => state.error)
  const clearError = useAppStore((state) => state.clearError)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const newSession = useAppStore((state) => state.newSession)
  const settings = useAppStore((state) => state.settings)
  const sessions = useAppStore((state) => state.sessions)
  const activeSessionId = useAppStore((state) => state.activeSessionId)
  const info = useAppStore((state) => state.info)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => window.vexnar.agent.onEvent(handleAgentEvent), [handleAgentEvent])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const meta = event.metaKey || event.ctrlKey
      if (!meta) return
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        void newSession()
      }
      if (event.key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
      }
      if (event.key.toLowerCase() === 'b') {
        event.preventDefault()
        toggleRight()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [newSession, setSettingsOpen, toggleRight])

  const session = sessions.find((item) => item.id === activeSessionId)

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        <header className="drag-region flex h-12 shrink-0 items-center gap-3 border-b border-line-soft bg-bg/60 pl-[86px] pr-3">
          <div className="no-drag flex min-w-0 items-center gap-2 text-xs text-muted">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted/70">
              vexnar
            </span>
            <span className="text-muted/30">/</span>
            <span className="truncate text-ink-soft">{session?.title ?? 'New chat'}</span>
            {settings.workspaceRoot ? (
              <>
                <span className="text-muted/30">/</span>
                <span className="truncate font-mono text-[10px] text-muted">
                  {settings.workspaceRoot}
                </span>
              </>
            ) : null}
          </div>
          <div className="no-drag ml-auto flex items-center gap-1">
            <span className="mr-1 hidden items-center gap-1.5 font-mono text-[10px] text-muted/60 sm:flex">
              <Command className="h-3 w-3" />N new · <Command className="h-3 w-3" />B panel
            </span>
            <Tooltip label="Toggle right panel" side="bottom">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleRight}
                aria-label="Toggle right panel"
              >
                {rightOpen ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </Button>
            </Tooltip>
            <Tooltip label="Settings" side="bottom">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSettingsOpen(true)}
                aria-label="Settings"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </Tooltip>
            <span className="ml-1 hidden font-mono text-[10px] text-muted/40 lg:inline">
              {info?.version ?? '0.1.0'}
            </span>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <ChatView />
          <AnimatePresence initial={false}>
            {rightOpen ? (
              <motion.div
                key="right"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 440, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="h-full shrink-0 overflow-hidden"
              >
                <RightPanel />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {error ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="fixed bottom-5 left-1/2 z-40 flex max-w-[640px] -translate-x-1/2 items-start gap-2.5 rounded-xl border border-danger/25 bg-panel px-3.5 py-2.5 shadow-2xl"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <div className="min-w-0 text-xs leading-5 text-ink-soft">{error}</div>
              <button
                type="button"
                onClick={clearError}
                className="rounded p-1 text-muted hover:bg-panel-3 hover:text-ink"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <SettingsDialog />
      </div>
    </TooltipProvider>
  )
}
