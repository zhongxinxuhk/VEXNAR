import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  Check,
  ChevronDown,
  CircleStop,
  Code2,
  FileSearch,
  GitPullRequest,
  Loader2,
  ShieldAlert,
  Sparkles,
  Wrench,
  X
} from 'lucide-react'
import { motion } from 'motion/react'
import type { Locale } from '@/lib/i18n'
import { useI18n, useT } from '@/lib/i18n'
import { useAppStore, type ChatMessage } from '@/store/app'
import { cn, formatTime } from '@/lib/utils'
import { Badge, Button, ScrollArea } from '@/components/ui'
import { Markdown } from '@/components/Markdown'

function ToolCard({ tool }: { tool: NonNullable<ChatMessage['toolCalls']>[number] }): React.JSX.Element {
  const t = useT()
  const running = tool.status === 'running'
  return (
    <details className="group mt-2 overflow-hidden rounded-lg border border-line bg-panel-2/60">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs text-ink-soft">
        <Wrench className="h-3.5 w-3.5 text-muted" />
        <span className="font-mono">{tool.name}</span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-muted">
          {running ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> {t('chat.running')}
            </>
          ) : tool.status === 'done' ? (
            <>
              <Check className="h-3 w-3 text-accent-2" /> {t('chat.done')}
            </>
          ) : (
            <>
              <X className="h-3 w-3 text-danger" /> {t('chat.failed')}
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
  const t = useT()
  const isUser = message.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className={cn('flex w-full gap-3', isUser ? 'justify-end' : 'justify-start')}
    >
      {!isUser ? (
        <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line bg-panel-2 font-mono text-[10px] font-semibold text-ink-soft">
          V
        </div>
      ) : null}
      <div className={cn('min-w-0', isUser ? 'max-w-[80%]' : 'max-w-[88%] flex-1')}>
        <div
          className={cn(
            'text-[13px] leading-6',
            isUser
              ? 'rounded-2xl rounded-tr-md border border-line bg-panel-3 px-3.5 py-2 text-ink'
              : 'text-ink-soft'
          )}
        >
          {message.content ? (
            <Markdown content={message.content} />
          ) : message.streaming ? null : (
            <div className="text-muted">…</div>
          )}
          {message.streaming ? (
            <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-ink" />
          ) : null}
          {message.failed ? (
            <div className="mt-2 rounded-md border border-danger/20 bg-danger/10 px-2.5 py-1.5 font-mono text-[11px] text-danger">
              {t('chat.runtimeError')}
            </div>
          ) : null}
          {message.toolCalls?.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
        </div>
        {!isUser ? (
          <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] text-muted/60">
            <span>{t('chat.agent').toLowerCase()}</span>
            <span>·</span>
            <span>{formatTime(message.createdAt)}</span>
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}

const SUGGESTIONS = [
  { icon: FileSearch, titleKey: 'chat.suggestion.inspect', promptKey: 'chat.prompt.inspect' },
  { icon: GitPullRequest, titleKey: 'chat.suggestion.review', promptKey: 'chat.prompt.review' },
  { icon: Code2, titleKey: 'chat.suggestion.architecture', promptKey: 'chat.prompt.architecture' },
  { icon: ShieldAlert, titleKey: 'chat.suggestion.findings', promptKey: 'chat.prompt.findings' }
] as const

function EmptyState(): React.JSX.Element {
  const t = useT()
  const send = useAppStore((state) => state.send)
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-10">
      <div className="mb-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted/70">
        <Sparkles className="h-3.5 w-3.5" />
        VEXNAR AGENT
      </div>
      <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">{t('chat.emptyTitle')}</h1>
      <p className="mt-3 max-w-lg text-[13px] leading-6 text-muted">{t('chat.emptyBody')}</p>
      <div className="mt-7 grid gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.titleKey}
              type="button"
              onClick={() => void send(t(item.promptKey))}
              className="group flex items-start gap-3 rounded-xl border border-line bg-panel/40 p-3.5 text-left transition-colors hover:border-line hover:bg-panel-2"
            >
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line bg-panel-2 text-muted transition-colors group-hover:text-ink">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-xs font-medium leading-5 text-ink-soft group-hover:text-ink">{t(item.titleKey)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Composer(): React.JSX.Element {
  const t = useT()
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
    <div className="shrink-0 bg-bg px-5 pb-5 pt-2">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-2xl border border-line bg-panel/80 shadow-2xl shadow-black/15 transition-colors focus-within:border-muted/50">
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
            placeholder={t('chat.placeholder')}
            className="block max-h-[180px] min-h-[58px] w-full resize-none bg-transparent px-4 pt-4 text-[13px] leading-6 text-ink outline-none placeholder:text-muted/70"
          />
          <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
            <span className="flex items-center gap-1.5 rounded-md border border-line bg-panel-2 px-2 py-1 font-mono text-[10px] text-muted">
              <span className={cn('h-1.5 w-1.5 rounded-full', settings.hasApiKey ? 'bg-accent-2' : 'bg-muted/50')} />
              {settings.model}
            </span>
            <span className="hidden font-mono text-[10px] text-muted/60 sm:inline">
              {settings.hasApiKey ? t('chat.providerKey') : t('chat.localRuntime')}
            </span>
            <span className="ml-auto hidden font-mono text-[10px] text-muted/40 sm:inline">{t('chat.newline')}</span>
            {busy ? (
              <Button variant="secondary" size="sm" className="h-8 rounded-lg" onClick={() => void cancel()}>
                <CircleStop className="h-3.5 w-3.5" />
                {t('chat.stop')}
              </Button>
            ) : (
              <Button size="icon" className="h-8 w-8 rounded-lg" onClick={submit} disabled={!text.trim()} aria-label={t('chat.send')}>
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2 text-center font-mono text-[9px] uppercase tracking-[0.12em] text-muted/30">
          VEXNAR · local agent runtime
        </div>
      </div>
    </div>
  )
}

export function ChatView(): React.JSX.Element {
  const sessions = useAppStore((state) => state.sessions)
  const activeSessionId = useAppStore((state) => state.activeSessionId)
  const messages = useAppStore((state) => state.messages)
  const bottomRef = useRef<HTMLDivElement>(null)
  const locale: Locale = useI18n((state) => state.locale)
  const t = useT()

  const session = useMemo(
    () => sessions.find((item) => item.id === activeSessionId),
    [sessions, activeSessionId]
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, locale])

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-bg/30">
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-5">
            <div className="mb-1 flex items-center gap-2 border-b border-line-soft pb-3 text-[11px] text-muted">
              <span className="font-medium text-ink-soft">{session?.title ?? t('app.newThread')}</span>
              <span className="font-mono text-[10px] text-muted/50">{t('chat.localRuntime')}</span>
            </div>
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
