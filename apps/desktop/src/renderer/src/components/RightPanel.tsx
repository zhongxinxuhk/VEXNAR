// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useMemo, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { DiffEditor } from '@monaco-editor/react'
import {
  ChevronRight,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Loader2,
  Ellipsis,
  PanelRightClose,
  Plus,
  RefreshCw,
  Search,
  SquareTerminal
} from 'lucide-react'
import { useT } from '@/lib/i18n'
import { useAppStore } from '@/store/app'
import { cn } from '@/lib/utils'
import { Badge, Button, ScrollArea, Tooltip } from '@/components/ui'
import '@/lib/monaco'

function WorkspaceView(): React.JSX.Element {
  const t = useT()
  const files = useAppStore((state) => state.workspaceFiles)
  const loading = useAppStore((state) => state.workspaceLoading)
  const git = useAppStore((state) => state.git)
  const gitError = useAppStore((state) => state.gitError)
  const settings = useAppStore((state) => state.settings)
  const chooseWorkspace = useAppStore((state) => state.chooseWorkspace)
  const refreshWorkspace = useAppStore((state) => state.refreshWorkspace)
  const refreshGit = useAppStore((state) => state.refreshGit)
  const openDiff = useAppStore((state) => state.openDiff)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const visible = useMemo(() => {
    const prefixes = [...collapsed].map((dir) => `${dir}/`)
    return files.filter((file) => !prefixes.some((prefix) => file.path.startsWith(prefix)))
  }, [files, collapsed])

  const toggle = (path: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            {settings.workspaceRoot ? t('app.workspace') : t('app.noWorkspace')}
          </div>
          <div className="truncate text-xs text-ink-soft">
            {settings.workspaceRoot || t('app.chooseFolder')}
          </div>
        </div>
        <Tooltip label={t('panel.refreshFiles')} side="bottom">
          <Button variant="ghost" size="icon" onClick={() => void refreshWorkspace()} aria-label={t('panel.refreshFiles')}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </Tooltip>
        <Button variant="secondary" size="sm" onClick={() => void chooseWorkspace()}>
          {t('panel.choose')}
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {git ? (
            <div className="mb-2 rounded-xl border border-line bg-panel-2/60">
              <div className="flex items-center gap-2 px-3 py-2">
                <GitBranch className="h-3.5 w-3.5 text-accent" />
                <span className="font-mono text-[11px] text-ink-soft">{git.branch}</span>
                <span className="ml-auto font-mono text-[10px] text-muted">
                  {git.files.length} {t('panel.changed')}
                </span>
                <Button variant="ghost" size="icon" onClick={() => void refreshGit()} aria-label={t('panel.refreshGit')}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
              {git.files.length > 0 ? (
                <div className="border-t border-line-soft py-1">
                  {git.files.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => void openDiff(file.path)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-panel-3"
                    >
                      <span
                        className={cn(
                          'w-3 font-mono text-[10px]',
                          file.working === 'D' || file.index === 'D'
                            ? 'text-danger'
                            : file.working === '?' || file.working === 'A'
                              ? 'text-accent-2'
                              : 'text-warn'
                        )}
                      >
                        {file.working === '?' ? 'U' : file.working || file.index}
                      </span>
                      <span className="truncate font-mono text-[11px] text-ink-soft">{file.path}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : gitError ? (
            <div className="mb-2 rounded-lg border border-line bg-panel-2/60 px-3 py-2 font-mono text-[10px] text-muted">
              {gitError}
            </div>
          ) : null}

          {visible.length === 0 ? (
            <div className="px-3 py-10 text-center text-xs text-muted">
              {settings.workspaceRoot ? t('panel.noFiles') : t('panel.selectFolder')}
            </div>
          ) : (
            visible.map((file) => {
              const isDir = file.type === 'dir'
              const isCollapsed = collapsed.has(file.path)
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => (isDir ? toggle(file.path) : void openDiff(file.path))}
                  className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left hover:bg-panel-2"
                  style={{ paddingLeft: 8 + file.depth * 12 }}
                >
                  {isDir ? (
                    <>
                      <ChevronRight
                        className={cn(
                          'h-3 w-3 shrink-0 text-muted transition-transform',
                          !isCollapsed && 'rotate-90'
                        )}
                      />
                      {isCollapsed ? (
                        <Folder className="h-3.5 w-3.5 shrink-0 text-accent/70" />
                      ) : (
                        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-accent/70" />
                      )}
                    </>
                  ) : (
                    <>
                      <span className="w-3 shrink-0" />
                      {/\.(ts|tsx|js|jsx|go|rs|py|java|kt|json|css|html|md|yml|yaml|toml)$/.test(file.name) ? (
                        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted" />
                      )}
                    </>
                  )}
                  <span className="truncate font-mono text-[11px] text-ink-soft">{file.name}</span>
                </button>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function TerminalView(): React.JSX.Element {
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const settings = useAppStore((state) => state.settings)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let disposed = false
    let terminalId: string | null = null
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: "'SFMono-Regular', ui-monospace, Menlo, monospace",
      fontSize: 12,
      lineHeight: 1.45,
      allowTransparency: true,
      theme: {
        background: '#0b0b0c',
        foreground: '#e7e7ea',
        cursor: '#e8e8ea',
        selectionBackground: '#343438',
        black: '#1b1b1e',
        red: '#ff6961',
        green: '#9fe870',
        yellow: '#f5c26b',
        blue: '#a5b4fc',
        magenta: '#d8b4fe',
        cyan: '#a5f3fc',
        white: '#e7e7ea'
      }
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(container)
    const fitLater = window.setTimeout(() => fit.fit(), 30)

    const offData = window.vexnar.terminal.onData((event) => {
      if (event.id !== terminalId) return
      terminal.write(event.data)
    })
    const offExit = window.vexnar.terminal.onExit((event) => {
      if (event.id !== terminalId) return
      terminal.write(`\r\n\x1b[2m[process exited ${event.exitCode}]\x1b[0m\r\n`)
    })

    const input = terminal.onData((data) => {
      if (terminalId) void window.vexnar.terminal.write({ id: terminalId, data })
    })

    const resize = (): void => {
      fit.fit()
      if (terminalId) {
        void window.vexnar.terminal.resize({
          id: terminalId,
          cols: terminal.cols,
          rows: terminal.rows
        })
      }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    void (async () => {
      const result = await window.vexnar.terminal.create({ cols: terminal.cols, rows: terminal.rows })
      if (disposed) {
        if (result.ok) void window.vexnar.terminal.dispose({ id: result.data.id })
        return
      }
      if (!result.ok) {
        terminal.write(`\x1b[31m${result.error}\x1b[0m\r\n`)
        return
      }
      terminalId = result.data.id
      terminal.focus()
      resize()
    })()

    return () => {
      disposed = true
      window.clearTimeout(fitLater)
      offData()
      offExit()
      input.dispose()
      observer.disconnect()
      if (terminalId) void window.vexnar.terminal.dispose({ id: terminalId })
      terminal.dispose()
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2">
        <SquareTerminal className="h-3.5 w-3.5 text-muted" />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">pty</span>
        <Badge className="ml-auto">{settings.shell || t('panel.defaultShell')}</Badge>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 bg-[#0b0b0c]" />
    </div>
  )
}

function DiffView(): React.JSX.Element {
  const t = useT()
  const diff = useAppStore((state) => state.diff)
  const loading = useAppStore((state) => state.diffLoading)
  const error = useAppStore((state) => state.diffError)
  const settings = useAppStore((state) => state.settings)

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> {t('panel.loadingDiff')}
      </div>
    )
  }
  if (error) {
    return <div className="p-4 font-mono text-[11px] leading-5 text-danger">{error}</div>
  }
  if (!diff) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Search className="h-5 w-5 text-muted/50" />
        <div className="text-xs text-muted">{t('panel.selectDiff')}</div>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2">
        <FileCode2 className="h-3.5 w-3.5 text-accent" />
        <span className="truncate font-mono text-[11px] text-ink-soft">{diff.path}</span>
        <Badge className="ml-auto">{diff.language}</Badge>
      </div>
      <div className="min-h-0 flex-1 p-2">
        <DiffEditor
          original={diff.original}
          modified={diff.modified}
          language={diff.language}
          theme={settings.theme === 'light' ? 'vs' : 'vs-dark'}
          height="100%"
          options={{
            readOnly: true,
            renderSideBySide: false,
            wordWrap: 'on',
            diffWordWrap: 'on',
            minimap: { enabled: false },
            fontSize: 12,
            fontFamily: "'SFMono-Regular', ui-monospace, Menlo, monospace",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
            renderOverviewRuler: false,
            overviewRulerBorder: false
          }}
        />
      </div>
    </div>
  )
}

export function RightPanel(): React.JSX.Element {
  const t = useT()
  const rightTab = useAppStore((state) => state.rightTab)
  const setRightTab = useAppStore((state) => state.setRightTab)
  const toggleRight = useAppStore((state) => state.toggleRight)
  const panelLauncher = useAppStore((state) => state.panelLauncher)
  const newSession = useAppStore((state) => state.newSession)
  const [launcherQuery, setLauncherQuery] = useState('')
  const cards = [
    { id: 'diff' as const, label: t('panel.changes'), icon: FileCode2, tab: 'diff' as const },
    { id: 'terminal' as const, label: t('panel.terminal'), icon: SquareTerminal, tab: 'terminal' as const },
    { id: 'new-chat' as const, label: '新建对话', icon: Plus, tab: null },
    { id: 'workspace' as const, label: t('panel.files'), icon: Folder, tab: 'workspace' as const }
  ]
  const visibleCards = cards.filter((card) =>
    card.label.toLowerCase().includes(launcherQuery.trim().toLowerCase())
  )
  const tabs = [
    { id: 'workspace' as const, label: t('panel.files'), icon: Folder },
    { id: 'terminal' as const, label: t('panel.terminal'), icon: SquareTerminal },
    { id: 'diff' as const, label: t('panel.changes'), icon: FileCode2 }
  ]

  if (panelLauncher) {
    return (
      <aside className="flex h-full w-full shrink-0 flex-col border-l border-line-soft bg-bg">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6 pt-5">
          <input
            value={launcherQuery}
            onChange={(event) => setLauncherQuery(event.target.value)}
            placeholder={t('panel.searchPlaceholder')}
            className="h-11 w-full rounded-full bg-panel-2 px-4 text-[13px] text-ink outline-none placeholder:text-muted/85 focus:bg-panel-3/70"
          />
          <div className="mt-1 flex items-center justify-between px-0.5">
            <span className="text-[12px] font-medium text-ink">Open</span>
            <button
              type="button"
              aria-label="更多"
              className="grid h-6 w-6 place-items-center rounded-md text-muted transition-colors hover:bg-panel-2 hover:text-ink"
            >
              <Ellipsis className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {visibleCards.map((card) => {
              const Icon = card.icon
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => {
                    if (card.tab) setRightTab(card.tab)
                    else {
                      void newSession()
                      toggleRight()
                    }
                  }}
                  className="flex h-[112px] flex-col justify-between rounded-2xl bg-panel-2 px-4 py-4 text-left transition-colors hover:bg-panel-3/80"
                >
                  <Icon className="h-4 w-4 text-muted" strokeWidth={1.8} />
                  <span className="text-[13px] font-medium text-ink">{card.label}</span>
                </button>
              )
            })}
            {visibleCards.length === 0 ? (
              <div className="col-span-2 py-6 text-center text-[12px] text-muted">
                {t('app.noResults')}
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-l border-line-soft bg-panel/50">
      <div className="flex items-center gap-1 border-b border-line-soft px-3 py-2">
        <div className="inline-flex items-center gap-1 rounded-lg bg-panel-2 p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = rightTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRightTab(tab.id)}
                className={cn(
                  'inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  active ? 'bg-panel-3 text-ink' : 'text-muted hover:text-ink'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
        <div className="ml-auto">
          <Tooltip label={t('app.hidePanel')} side="bottom">
            <Button variant="ghost" size="icon" onClick={toggleRight} aria-label={t('app.hidePanel')}>
              <PanelRightClose className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {rightTab === 'workspace' ? <WorkspaceView /> : null}
        {rightTab === 'terminal' ? <TerminalView /> : null}
        {rightTab === 'diff' ? <DiffView /> : null}
      </div>
    </aside>
  )
}
