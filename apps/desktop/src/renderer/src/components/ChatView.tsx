// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useMemo, useRef, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  AudioLines,
  Check,
  ChevronDown,
  Folder,
  Loader2,
  Mic,
  Monitor,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  Square,
  Wrench,
  X
} from 'lucide-react'
import { motion } from 'motion/react'
import { useT } from '@/lib/i18n'
import { useAppStore, type ChatMessage } from '@/store/app'
import { basename, cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui'
import { Markdown } from '@/components/Markdown'
import { CloudMark } from '@/components/brand'

const menuContent =
  'z-50 min-w-[188px] rounded-xl border border-line bg-bg p-1 codex-popover outline-none'
const menuItem =
  'flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-[7px] text-[12.5px] text-ink-soft outline-none data-[highlighted]:bg-panel-2 data-[highlighted]:text-ink'

const MODEL_OPTIONS = ['gpt-5-codex', 'gpt-5', 'gpt-4.1', 'o4-mini'] as const

function modelLabel(model: string): string {
  switch (model) {
    case 'gpt-5-codex':
      return 'GPT-5 Codex'
    case 'gpt-5':
      return 'GPT-5'
    case 'gpt-4.1':
      return 'GPT-4.1'
    case 'o4-mini':
      return 'o4-mini'
    default:
      return model
  }
}

function ToolCard({ tool }: { tool: NonNullable<ChatMessage['toolCalls']>[number] }): React.JSX.Element {
  const t = useT()
  const running = tool.status === 'running'
  return (
    <details className="group mt-2 overflow-hidden rounded-lg border border-line bg-panel/60">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-[12px] text-ink-soft">
        <Wrench className="h-3.5 w-3.5 text-muted" />
        <span className="font-mono text-[11.5px]">{tool.name}</span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10.5px] text-muted">
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
        <pre className="max-h-64 overflow-auto border-t border-line-soft bg-bg/60 p-3 font-mono text-[11px] leading-relaxed text-muted">
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
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
    >
      <div className={cn('min-w-0', isUser ? 'max-w-[78%]' : 'w-full max-w-[760px]')}>
        <div
          className={cn(
            'text-[13px] leading-[1.75]',
            isUser
              ? 'rounded-[16px] bg-panel px-4 py-2.5 text-ink'
              : 'text-ink'
          )}
        >
          {message.content ? (
            <Markdown content={message.content} />
          ) : message.streaming ? null : (
            <div className="text-muted">…</div>
          )}
          {message.streaming ? (
            <span className="stream-caret ml-0.5 inline-block h-[13px] w-[6px] translate-y-[2px] rounded-[1px] bg-ink/70" />
          ) : null}
          {message.failed ? (
            <div className="mt-2 rounded-lg border border-danger/20 bg-danger/5 px-2.5 py-1.5 font-mono text-[11px] text-danger">
              {t('chat.runtimeError')}
            </div>
          ) : null}
          {message.toolCalls?.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
        </div>
      </div>
    </motion.div>
  )
}

function EmptyState(): React.JSX.Element {
  const t = useT()
  const settings = useAppStore((state) => state.settings)
  const sessions = useAppStore((state) => state.sessions)
  const activeSessionId = useAppStore((state) => state.activeSessionId)
  const chooseWorkspace = useAppStore((state) => state.chooseWorkspace)
  const session = sessions.find((item) => item.id === activeSessionId)
  const project = basename(session?.workspace || settings.workspaceRoot || '')
  const title = project
    ? t('chat.buildTitle', { project })
    : t('chat.buildTitleNoProject')

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 pb-0 pt-14">
      <CloudMark className="h-[52px] w-[52px] text-[#c6c7cb]" />
      <h1 className="mt-6 max-w-[760px] text-center text-[26px] font-normal leading-snug tracking-[-0.015em] text-ink">
        {project ? (
          <>
            {title.split(project)[0]}
            <button
              type="button"
              onClick={() => void chooseWorkspace()}
              className="underline decoration-dotted decoration-[1.5px] underline-offset-[6px] decoration-ink/50 transition-colors hover:decoration-ink"
            >
              {project}
            </button>
            {title.split(project).slice(1).join(project)}
          </>
        ) : (
          title
        )}
      </h1>
    </div>
  )
}

function AccessChip(): React.JSX.Element {
  const t = useT()
  return (
    <span
      title={t('composer.accessHint')}
      className="flex h-7 items-center gap-1.5 rounded-md px-1 text-[12px] text-[#c2410c]"
    >
      <ShieldCheck className="h-[15px] w-[15px]" strokeWidth={1.9} />
      {t('composer.fullAccess')}
    </span>
  )
}

function Composer(): React.JSX.Element {
  const t = useT()
  const send = useAppStore((state) => state.send)
  const cancel = useAppStore((state) => state.cancel)
  const busy = useAppStore((state) => state.busy)
  const settings = useAppStore((state) => state.settings)
  const saveSettings = useAppStore((state) => state.saveSettings)
  const chooseWorkspace = useAppStore((state) => state.chooseWorkspace)
  const setRightTab = useAppStore((state) => state.setRightTab)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const sessions = useAppStore((state) => state.sessions)
  const activeSessionId = useAppStore((state) => state.activeSessionId)
  const session = sessions.find((item) => item.id === activeSessionId)
  const project = basename(session?.workspace || settings.workspaceRoot || '') || t('app.noWorkspace')

  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceHint, setVoiceHint] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`
  }, [text])

  useEffect(() => {
    if (!voiceHint) return
    const timer = window.setTimeout(() => setVoiceHint(''), 2400)
    return () => window.clearTimeout(timer)
  }, [voiceHint])

  const submit = (): void => {
    if (!text.trim() || busy) return
    const value = text
    setText('')
    void send(value)
  }

  const toggleVoice = (): void => {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    const Recognition =
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition
    if (!Recognition) {
      setVoiceHint(t('composer.voiceUnsupported'))
      return
    }
    const recognition = new Recognition()
    recognition.lang = document.documentElement.lang || 'zh-CN'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event: any) => {
      let final = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) final += event.results[index][0].transcript
      }
      if (final.trim()) {
        setText((previous) => (previous.trim() ? `${previous.trim()} ${final.trim()}` : final.trim()))
      }
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => {
      setListening(false)
      setVoiceHint(t('composer.voiceUnsupported'))
    }
    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }

  const pickModel = (model: string): void => {
    if (model === settings.model) return
    void saveSettings({
      theme: settings.theme,
      displayName: settings.displayName,
      avatarColor: settings.avatarColor,
      workspaceRoot: settings.workspaceRoot,
      shell: settings.shell,
      model,
      newApiModels: settings.newApiModels,
      baseUrl: settings.baseUrl
    })
  }

  return (
    <div className="shrink-0 px-6 pb-3 pt-2">
      <div className="mx-auto w-full max-w-[800px]">
        <div className="rounded-[19px] bg-[var(--codex-composer)] p-[7px] codex-composer-shadow">
          <div className="flex h-[30px] items-center gap-0.5 px-1 text-[12px] text-ink-soft">
            <span className="flex h-7 items-center gap-1.5 rounded-md px-1.5">
              <Monitor className="h-[14px] w-[14px] text-ink-soft" strokeWidth={1.8} />
              {t('app.computer')}
            </span>
            <button
              type="button"
              onClick={() => void chooseWorkspace()}
              className="flex h-7 max-w-[220px] items-center gap-1.5 rounded-md px-1.5 transition-colors hover:bg-black/[0.04]"
            >
              <Folder className="h-[14px] w-[14px] text-ink-soft" strokeWidth={1.8} />
              <span className="truncate">{project}</span>
            </button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  aria-label={t('composer.more')}
                  className="grid h-6 w-6 place-items-center rounded-md text-muted transition-colors hover:bg-black/[0.04] hover:text-ink"
                >
                  <MoreHorizontal className="h-[15px] w-[15px]" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content side="top" align="start" sideOffset={8} className={menuContent}>
                  <DropdownMenu.Item className={menuItem} onSelect={() => void chooseWorkspace()}>
                    <Folder className="h-3.5 w-3.5 text-muted" />
                    {t('rail.workspace')}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className={menuItem}
                    onSelect={() => {
                      setRightTab('workspace')
                    }}
                  >
                    <Monitor className="h-3.5 w-3.5 text-muted" />
                    {t('rail.docs')}
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />
                  <DropdownMenu.Item className={menuItem} onSelect={() => setSettingsOpen(true)}>
                    {t('app.settings')}
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>

          <div className="rounded-[13px] bg-[var(--codex-composer-inner)] ring-1 ring-black/[0.055]">
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
              placeholder={t('composer.placeholder')}
              className="block max-h-[200px] min-h-[84px] w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-[13px] leading-[1.6] text-ink outline-none placeholder:text-muted/85"
            />
            <div className="flex h-[38px] items-center gap-1.5 px-2 pb-2">
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    aria-label={t('composer.more')}
                    className="grid h-7 w-7 place-items-center rounded-md text-ink-soft transition-colors hover:bg-panel-2"
                  >
                    <Plus className="h-[17px] w-[17px]" strokeWidth={1.9} />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content side="top" align="start" sideOffset={8} className={menuContent}>
                    <DropdownMenu.Item className={menuItem} onSelect={() => void chooseWorkspace()}>
                      {t('rail.workspace')}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItem} onSelect={() => setRightTab('workspace')}>
                      {t('rail.docs')}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItem} onSelect={() => setRightTab('diff')}>
                      {t('rail.changes')}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              <AccessChip />

              <div className="ml-auto flex items-center gap-1">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] text-ink-soft transition-colors hover:bg-panel-2"
                    >
                      {modelLabel(settings.model)}
                      <ChevronDown className="h-3 w-3 text-muted" strokeWidth={2} />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content side="top" align="end" sideOffset={8} className={menuContent}>
                      {(settings.newApiModels.length > 0 ? settings.newApiModels : MODEL_OPTIONS).map((model) => (
                        <DropdownMenu.Item
                          key={model}
                          className={cn(menuItem, model === settings.model && 'bg-panel-2 text-ink')}
                          onSelect={() => pickModel(model)}
                        >
                          <span className="flex-1">{modelLabel(model)}</span>
                          {model === settings.model ? <Check className="h-3.5 w-3.5" /> : null}
                        </DropdownMenu.Item>
                      ))}
                      <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />
                      <DropdownMenu.Item className={menuItem} onSelect={() => setSettingsOpen(true)}>
                        {t('settings.modelSection')}
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>

                <Tooltip label={voiceHint || t('composer.voice')} side="top">
                  <button
                    type="button"
                    onClick={toggleVoice}
                    aria-label={t('composer.voice')}
                    className={cn(
                      'grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-panel-2',
                      listening ? 'bg-[#c2410c]/10 text-[#c2410c]' : 'text-ink-soft'
                    )}
                  >
                    <Mic className="h-[16px] w-[16px]" strokeWidth={1.8} />
                  </button>
                </Tooltip>

                <button
                  type="button"
                  onClick={() => (busy ? void cancel() : submit())}
                  disabled={!busy && !text.trim()}
                  aria-label={busy ? t('chat.stop') : t('chat.send')}
                  className={cn(
                    'ml-0.5 grid h-8 w-8 place-items-center rounded-full text-white transition-all',
                    busy ? 'bg-[#2b2d31]' : 'bg-[#2f6feb] hover:bg-[#2a63d4]',
                    !busy && !text.trim() && 'cursor-default opacity-90'
                  )}
                >
                  {busy ? (
                    <Square className="h-3 w-3 fill-current" />
                  ) : (
                    <AudioLines className="h-[17px] w-[17px]" strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>
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
  const bottomRef = useRef<HTMLDivElement>(null)

  const session = useMemo(
    () => sessions.find((item) => item.id === activeSessionId),
    [sessions, activeSessionId]
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  return (
    <section className="relative flex min-w-0 flex-1 flex-col bg-bg">
      <div className="drag-region absolute inset-x-0 top-0 z-10 h-[38px]" />

      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-8 pb-6 pt-[64px]">
            {session ? (
              <div className="mb-1 text-center text-[12px] font-medium text-muted/80">{session.title}</div>
            ) : null}
            {messages.map((message) => (
              <MessageRow key={message.id} message={message} />
            ))}
            <div ref={bottomRef} className="h-1" />
          </div>
        </div>
      )}

      <Composer />
    </section>
  )
}