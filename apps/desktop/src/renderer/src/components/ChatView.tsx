import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  Check,
  ChevronDown,
  CircleStop,
  GitBranch,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  Wrench,
  X
} from 'lucide-react'
import { motion } from 'motion/react'
import { useAppStore, type ChatMessage } from '@/store/app'
import { cn, formatTime } from '@/lib/utils'
import { Badge, Button, ScrollArea, Tooltip } from '@/components/ui'
import { Markdown } from '@/components/Markdown'

function ToolCard({ tool }: { tool: NonNullable<ChatMessage['toolCalls']>[number] }): React.JSX.Element {
  const running = tool.status === 'running'
  return (
    <details className="group mt-2 overflow-hidden rounded-lg border border-line bg-panel-2/70">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs text-ink-soft">
        <Wrench className="h-3.5 w-3.5 text-accent" />
        <span className="font-mono">{tool.name}</span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-muted">
          {running ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> running
            </>
          ) : tool.status === 'done' ? (
            <>
              <Check className="h-3 w-3 text-accent-2" /> done
            </>
          ) : (
            <>
              <X className="h-3 w-3 text-danger" /> error
            </>
          )}
          <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      {tool.output ? (
        <pre className="max-h-64 overflow-auto border-t border-line-soft bg-bg/50 p-3 font-mono text-[11px] leading-relaxed text-muted">
          {tool.output}
        </pre>
      ) : null}
    </details>
  )
}

function MessageRow({ message }: { message: ChatMessage }): React.JSX.Element {
  const isUser = message.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn('flex w-full gap-3', isUser ? 'justify-end' : 'justify-start')}
    >
      {!isUser ? (
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 font-mono text-[11px] font-bold text-slate-950">
          V
        </div>
      ) : null}
      <div className={cn('min-w-0', isUser ? 'max-w-[82%]' : 'max-w-[88%] flex-1')}>
        <div
          className={cn(
            'text-[13.5px] leading-6',
            isUser
              ? 'rounded-2xl rounded-tr-md border border-line bg-panel-3 px-4 py-2.5 text-ink'
              : 'text-ink-soft'
          )}
        >
          {message.content ? (
            <Markdown content={message.content} />
          ) : message.streaming ? null : (
            <div className="text-muted">…</div>
          )}
          {message.streaming ? (
            <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-accent" />
          ) : null}
          {message.failed ? (
            <div className="mt-2 rounded-md border border-danger/20 bg-danger/10 px-2.5 py-1.5 font-mono text-[11px] text-danger">
              runtime error
            </div>
          ) : null}
          {message.toolCalls?.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
        </div>
        {!isUser ? (
          <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] text-muted/60">
            <span>agent</span>
            <span>·</span>
            <span>{formatTime(message.createdAt)}</span>
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}

const SUGGESTIONS = [
  { title: 'Inspect this workspace', prompt: 'Inspect the current workspace and summarize its structure.' },
  { title: 'Review git changes', prompt: 'Review the current git changes and call out risky edits.' },
  { title: 'Explain this codebase', prompt: 'Explain the architecture of this codebase for a new contributor.' }
]

function EmptyState(): React.JSX.Element {
  const send = useAppStore((state) => state.send)
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-10">
      <div className="mb-5 grid h-11 w-11 place-items-center rounded-2xl border border-accent/20 bg-accent/10">
        <Sparkles className="h-5 w-5 text-accent" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">What should we build?</h1>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted">
        VEXNAR Desktop is an independent agent workspace. Pick a folder, inspect files, run a
        terminal, and review diffs without touching the web console.
      </p>
      <div className="mt-7 grid gap-2 sm:grid-cols-3">
        {SUGGESTIONS.map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => void send(item.prompt)}
            className="rounded-xl border border-line bg-panel-2/70 p-3 text-left transition-colors hover:border-accent/30 hover:bg-panel-3"
          >
            <div className="text-xs font-medium text-ink">{item.title}</div>
            <div className="mt-1 font-mono text-[10px] leading-4 text-muted">run agent</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function Composer(): React.JSX.Element {
  const send = useAppStore((state) => state.send)
  const cancel = useAppStore((state) => state.cancel)
  const busy = useAppStore((state) => state.busy)
  const settings = useAppStore((state) => state.settings)
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`
  }, [text])

  const submit = (): void => {
    if (!text.trim() || busy) return
    const value = text
    setText('')
    void send(value)
  }

  return (
    <div className="border-t border-line-soft bg-bg/80 px-5 pb-4 pt-3 backdrop-blur">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-2xl border border-line bg-panel shadow-2xl shadow-black/10 focus-within:border-accent/40">
          <textarea
            ref={ref}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            rows={1}
            placeholder="Ask VEXNAR to inspect, change, or run something…"
            className="block max-h-[180px] min-h-[54px] w-full resize-none bg-transparent px-4 py-3.5 text-[13.5px] leading-6 text-ink outline-none placeholder:text-muted/70"
          />
          <div className="flex items-center gap-2 border-t border-line-soft px-3 py-2">
            <Badge variant="accent">{settings.model}</Badge>
            <Badge>{settings.hasApiKey ? 'provider key set' : 'local runtime'}</Badge>
            <span className="ml-auto font-mono text-[10px] text-muted/60">↵ send · ⇧↵ newline</span>
            {busy ? (
              <Button variant="secondary" size="sm" onClick={() => void cancel()}>
                <CircleStop className="h-3.5 w-3.5" />
                Stop
              </Button>
            ) : (
              <Button size="icon" onClick={submit} disabled={!text.trim()} aria-label="Send">
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ChatView(): React.JSX.Element {
  const sessions = useAppStore((state) => state.sessions)
  const activeSessionId = useAppStore((state) => state.activeSessionId)
  const messages = useAppStore((state) => state.messages)
  const settings = useAppStore((state) => state.settings)
  const git = useAppStore((state) => state.git)
  const agentStatus = useAppStore((state) => state.agentStatus)
  const rightOpen = useAppStore((state) => state.rightOpen)
  const toggleRight = useAppStore((state) => state.toggleRight)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const bottomRef = useRef<HTMLDivElement>(null)

  const session = useMemo(
    () => sessions.find((item) => item.id === activeSessionId),
    [sessions, activeSessionId]
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, agentStatus])

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-bg/40">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line-soft px-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ink">{session?.title ?? 'New chat'}</div>
        </div>
        <Badge className="ml-1">{settings.workspaceRoot ? 'workspace' : 'no workspace'}</Badge>
        {git ? (
          <Badge variant="default" className="max-w-[190px] shrink-0 truncate">
            <GitBranch className="h-3 w-3" />
            {git.branch}
            {git.ahead ? ` ↑${git.ahead}` : ''}
            {git.behind ? ` ↓${git.behind}` : ''}
          </Badge>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          <span
            className={cn(
              'mr-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider',
              agentStatus === 'error' ? 'text-danger' : 'text-muted'
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                agentStatus === 'streaming'
                  ? 'status-dot bg-accent'
                  : agentStatus === 'ready'
                    ? 'bg-accent-2'
                    : agentStatus === 'error'
                      ? 'bg-danger'
                      : 'bg-muted/40'
              )}
            />
            {agentStatus}
          </span>
          <Tooltip label={rightOpen ? 'Hide panel' : 'Show panel'} side="bottom">
            <Button variant="ghost" size="icon" onClick={toggleRight} aria-label="Toggle panel">
              {rightOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>
          </Tooltip>
          <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
            Settings
          </Button>
        </div>
      </div>

      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-5">
            {messages.map((message) => (
              <MessageRow key={message.id} message={message} />
            ))}
            <div ref={bottomRef} className="h-1" />
          </div>
        </ScrollArea>
      )}

      <Composer />
    </section>
  )
}
