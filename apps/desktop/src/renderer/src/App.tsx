// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle } from 'lucide-react'
import { UpdateSubscription } from '@/components/UpdateNotice'
import { WindowChrome, SidebarResizeHandle } from '@/components/WindowChrome'
import { IconRail } from '@/components/IconRail'
import { Sidebar } from '@/components/Sidebar'
import { ChatView } from '@/components/ChatView'
import { ProfilePage } from '@/components/ProfilePage'
import { SchedulesView } from '@/components/SchedulesView'
import { RightPanel } from '@/components/RightPanel'
import { SettingsDialog } from '@/components/SettingsDialog'
import { ConsoleView } from '@/components/console/ConsoleView'
import { LoginScreen } from '@/components/LoginScreen'
import { TooltipProvider } from '@/components/ui'
import { useT } from '@/lib/i18n'
import { useAppStore } from '@/store/app'
import { useLayout } from '@/store/layout'
import { defaultNewApiAuthMethods } from '@shared/contracts'

function WorkspaceApp(): React.JSX.Element {
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
  const sidebarOpen = useLayout((state) => state.sidebarOpen)
  const toggleSidebar = useLayout((state) => state.toggleSidebar)
  const sidebarWidth = useLayout((state) => state.sidebarWidth)
  const bare = view === 'profile' || view === 'schedules'

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => window.vexnar.agent.onEvent(handleAgentEvent), [handleAgentEvent])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey && event.code === 'Space') {
        const target = event.target
        if (
          target instanceof HTMLElement &&
          target.closest('input, textarea, [contenteditable="true"]')
        ) {
          return
        }
        event.preventDefault()
        toggleRight()
        return
      }
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
      // ⌘\ / Ctrl+\ 切换左侧会话侧栏（开关按钮的键盘兜底）
      if (event.key === '\\') {
        event.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [newSession, setSettingsOpen, toggleRight, toggleSidebar])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-bg text-ink">
      <WindowChrome compact={bare} />
      <div className="flex min-h-0 flex-1">
      <IconRail />
      {bare ? null : (
        <div
          className="sidebar-shell shrink-0"
          data-open={sidebarOpen}
          style={{ width: sidebarOpen ? sidebarWidth : 0 }}
        >
          <Sidebar />
        </div>
      )}
      {bare || !sidebarOpen ? null : <SidebarResizeHandle />}

      <main className={`relative flex min-w-0 flex-1 overflow-hidden ${view === 'chat' ? '-mt-11' : ''}`}>
        {view === 'chat' ? (
          <ChatView />
        ) : view === 'profile' ? (
          <ProfilePage />
        ) : view === 'schedules' ? (
          <SchedulesView />
        ) : (
          <ConsoleView view={view} />
        )}

        <AnimatePresence initial={false}>
          {view === 'chat' && rightOpen ? (
            <motion.div
              key="right"
              initial={{ x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 24, opacity: 0 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="absolute inset-y-0 right-0 top-11 z-30 w-[412px] overflow-hidden border-l border-line bg-bg shadow-[-18px_0_40px_-24px_rgba(0,0,0,0.24)]"
            >
              <RightPanel />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>
      </div>

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
              <span className="text-[14px] leading-none">×</span>
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <SettingsDialog />
    </div>
  )
}

export default function App(): React.JSX.Element {
  const newApi = useAppStore((state) => state.newApi)
  const setNewApi = useAppStore((state) => state.setNewApi)

  useEffect(() => {
    let disposed = false
    void window.vexnar.newapi.bootstrap().then((result) => {
      if (disposed) return
      if (result.ok) setNewApi(result.data)
      else {
        setNewApi({
          stage: 'error',
          authenticated: false,
          user: null,
          quota: null,
          token: null,
          accessToken: null,
          accessTokenError: null,
          models: [],
          verificationMethods: [],
          authMethods: defaultNewApiAuthMethods,
          externalAuth: null,
          error: result.error,
          updatedAt: Date.now()
        })
      }
    })
    const unsubscribe = window.vexnar.newapi.onChange((state) => setNewApi(state))
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [setNewApi])

  const authenticated = newApi?.authenticated === true

  return (
    <TooltipProvider>
      <UpdateSubscription />
      <div className="relative h-full w-full overflow-hidden bg-bg text-ink">
        {authenticated ? <WorkspaceApp /> : <LoginScreen state={newApi} onChange={setNewApi} />}
      </div>
    </TooltipProvider>
  )
}