import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, X } from 'lucide-react'
import { IconRail } from '@/components/IconRail'
import { Sidebar } from '@/components/Sidebar'
import { ChatView } from '@/components/ChatView'
import { RightPanel } from '@/components/RightPanel'
import { SettingsDialog } from '@/components/SettingsDialog'
import { ConsoleView } from '@/components/console/ConsoleView'
import { TooltipProvider } from '@/components/ui'
import { useT } from '@/lib/i18n'
import { useAppStore } from '@/store/app'

export default function App(): React.JSX.Element {
  const t = useT()
  const init = useAppStore((state) => state.init)
  const handleAgentEvent = useAppStore((state) => state.handleAgentEvent)
  const rightOpen = useAppStore((state) => state.rightOpen)
  const toggleRight = useAppStore((state) => state.toggleRight)
  const error = useAppStore((state) => state.error)
  const clearError = useAppStore((state) => state.clearError)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const newSession = useAppStore((state) => state.newSession)
  const view = useAppStore((state) => state.view)

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

  return (
    <TooltipProvider>
      <div className="flex h-full w-full overflow-hidden bg-bg text-ink">
        <IconRail />
        <Sidebar />

        <main className="relative flex min-w-0 flex-1 overflow-hidden">
          {view === 'chat' ? <ChatView /> : <ConsoleView view={view} />}

          <AnimatePresence initial={false}>
            {view === 'chat' && rightOpen ? (
              <motion.div
                key="right"
                initial={{ x: 24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 24, opacity: 0 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="absolute right-0 top-0 z-30 h-full w-[412px] overflow-hidden border-l border-line bg-bg shadow-[-18px_0_40px_-24px_rgba(0,0,0,0.24)]"
              >
                <RightPanel />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </main>

        <AnimatePresence>
          {error ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="fixed bottom-5 left-1/2 z-40 flex max-w-[620px] -translate-x-1/2 items-start gap-2.5 rounded-xl border border-danger/20 bg-bg px-3.5 py-2.5 codex-popover"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <div className="min-w-0 text-[12px] leading-5 text-ink-soft">{error}</div>
              <button
                type="button"
                onClick={clearError}
                className="rounded p-1 text-muted hover:bg-panel-2 hover:text-ink"
                aria-label={t('app.close')}
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