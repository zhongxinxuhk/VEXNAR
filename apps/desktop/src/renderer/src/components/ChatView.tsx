// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ArrowDown,
  ArrowUp,
  AudioLines,
  ChevronDown,
  ChevronRight,
  CircleGauge,
  Folder,
  Loader2,
  Mic,
  PanelRight,
  Paperclip,
  Plus,
  Square,
  X
} from 'lucide-react'
import { consoleRequest } from '@/lib/console'
import { recordEffort } from '@/lib/insight'
import { useT } from '@/lib/i18n'
import { AccessMenu, ContextBar } from './ChatControls'
import {
  EFFORT_LEVELS,
  ModelPicker,
  type EffortLevel
} from './ModelPicker'
import { useDrafts, emptyDraft } from '@/store/drafts'
import { useLayout } from '@/store/layout'
import { attachmentsSchema, type ImageAttachment } from '@shared/contracts'
import { useChatSendMode } from '@/lib/chat-send-mode'
import { useAppStore } from '@/store/app'
import { basename, cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui'
import { ConversationMessage } from '@/components/chat/ConversationMessage'
import { CloudMark } from '@/components/brand'

const menuContent =
  'z-50 min-w-[188px] rounded-xl border border-line bg-bg p-1 codex-popover outline-none'
const menuItem =
  'flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-[7px] text-[12.5px] text-ink-soft outline-none data-[highlighted]:bg-panel-2 data-[highlighted]:text-ink'

// 目录来自后端，这里只做展示层排版：gpt-6.1-sol → GPT-6.1 Sol。
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
    default: {
      const [head, ...rest] = model.split('-')
      if (head?.toLowerCase() !== 'gpt' || rest.length === 0) return model
      const tail = rest
        .map((part) =>
          part.length <= 1 ? part : part.charAt(0).toUpperCase() + part.slice(1)
        )
        .join(' ')
      return `GPT-${tail}`
    }
  }
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

function Composer(): React.JSX.Element {
  const t = useT()
  const send = useAppStore((state) => state.send)
  const cancel = useAppStore((state) => state.cancel)
  const busy = useAppStore((state) => state.busy)
  const settings = useAppStore((state) => state.settings)
  const saveSettings = useAppStore((state) => state.saveSettings)
  const setRightTab = useAppStore((state) => state.setRightTab)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const activeSessionId = useAppStore((state) => state.activeSessionId)

  const draft = useDrafts(
    (state) => state.drafts[activeSessionId || 'new'] ?? emptyDraft
  )
  const patchDraft = useDrafts((state) => state.patch)
  const text = draft.text
  const images = draft.images
  const setText = (value: string | ((old: string) => string)): void => {
    const current =
      useDrafts.getState().drafts[activeSessionId || 'new'] ?? emptyDraft
    patchDraft(activeSessionId || 'new', {
      text: typeof value === 'function' ? value(current.text) : value
    })
  }
  const [attachmentError, setAttachmentError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const sendingRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [showContext, setShowContext] = useState(true)
  const addImages = async (files: File[]): Promise<void> => {
    const sessionKey = activeSessionId || 'new'
    setAttachmentError('')
    try {
      if (files.length > 6) throw new Error('一次最多添加 6 张图片')
      const added: ImageAttachment[] = await Promise.all(
        files.map(async (file) => {
          if (
            !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
              file.type
            )
          )
            throw new Error('仅支持 PNG、JPEG、WebP 和 GIF 图片')
          if (file.size > 4 * 1024 * 1024)
            throw new Error('每张图片不能超过 4 MB')
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(new Error('图片读取失败'))
            reader.readAsDataURL(file)
          })
          return {
            id: crypto.randomUUID(),
            name: file.name || '粘贴图片.png',
            dataUrl
          }
        })
      )
      const current = useDrafts.getState().drafts[sessionKey] ?? emptyDraft
      const combined = [...current.images, ...added]
      const validated = attachmentsSchema.safeParse(combined)
      if (!validated.success)
        throw new Error('最多 6 张图片，总大小不能超过 12 MB')
      patchDraft(sessionKey, { images: combined })
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : String(error))
    }
  }
  const [listening, setListening] = useState(false)
  const [voiceHint, setVoiceHint] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const usage = useAppStore(
    (state) => state.contextUsage[activeSessionId || '']
  )
  const [effort, setEffort] = useState<EffortLevel | undefined>()
  const [effortSaving, setEffortSaving] = useState(false)
  const [effortError, setEffortError] = useState('')
  // Persisting is async; a send must wait for the write so the backend runs the
  // turn with the strength the operator just picked.
  const effortPersist = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => {
    void consoleRequest<{ reasoning_effort?: string }>('/desktop/llm')
      .then((status) => {
        const stored = status?.reasoning_effort
        if (stored && (EFFORT_LEVELS as string[]).includes(stored))
          setEffort(stored as EffortLevel)
      })
      .catch(() => undefined)
  }, [])
  const applyEffort = (index: number): void => {
    const next = EFFORT_LEVELS[Math.min(EFFORT_LEVELS.length - 1, Math.max(0, index))]
    setEffort(next)
    setEffortError('')
    setEffortSaving(true)
    effortPersist.current = consoleRequest<{ reasoning_effort?: string }>(
      '/desktop/llm/configure',
      'POST',
      { reasoning_effort: next }
    )
      .then((status) => {
        const stored = status?.reasoning_effort
        if (stored && (EFFORT_LEVELS as string[]).includes(stored))
          setEffort(stored as EffortLevel)
      })
      .catch((error) => {
        setEffortError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => setEffortSaving(false))
  }
  const clearEffort = (): void => {
    setEffort(undefined)
    setEffortError('')
    effortPersist.current = consoleRequest('/desktop/llm/configure', 'POST', {
      reasoning_effort: ''
    })
      .then(() => undefined)
      .catch((error) => setEffortError(error instanceof Error ? error.message : String(error)))
  }
  const [capacity, setCapacity] = useState<{ model: string; tokens: number }>()
  const readCapacity = (): void => {
    const model = settings.model
    if (capacity?.model === model) return
    void consoleRequest<{
      data?: { id?: string; context_length?: number; context_window?: number }[]
    }>('/desktop/llm/models')
      .then((response) => {
        const entry = response.data?.find((item) => item.id === model)
        const tokens = entry?.context_length ?? entry?.context_window
        if (
          typeof tokens === 'number' &&
          Number.isSafeInteger(tokens) &&
          tokens > 0
        )
          setCapacity({ model, tokens })
      })
      .catch(() => undefined)
  }
  const promptTokens =
    usage?.model === settings.model ? usage.promptTokens : undefined
  const capacityTokens =
    capacity?.model === settings.model ? capacity.tokens : undefined
  const percent =
    promptTokens !== undefined && capacityTokens
      ? Math.round((promptTokens / capacityTokens) * 100)
      : undefined
  const recognitionRef = useRef<any>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const fit = (): void => {
      element.style.height = '0px'
      element.style.height = `${Math.min(element.scrollHeight, 176)}px`
    }
    fit()
    let previousWidth = element.clientWidth
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === previousWidth) return
      previousWidth = element.clientWidth
      fit()
    })
    if (element.parentElement)
      observer.observe(element.parentElement, { box: 'border-box' })
    return () => observer.disconnect()
  }, [text])

  useEffect(() => {
    if (!voiceHint) return
    const timer = window.setTimeout(() => setVoiceHint(''), 2400)
    return () => window.clearTimeout(timer)
  }, [voiceHint])

  const submit = async (): Promise<void> => {
    if ((!text.trim() && images.length === 0) || busy || sendingRef.current)
      return
    sendingRef.current = true
    setSubmitting(true)
    const id = activeSessionId || 'new'
    const submitted = useDrafts.getState().drafts[id]
    try {
      await effortPersist.current
      // The Go backend reads the profile's effort; the app does not stream a
      // second model call, so no per-message effort is passed.
      const sent = await send(text, images)
      if (sent) recordEffort(effort)
      if (sent && useDrafts.getState().drafts[id] === submitted)
        patchDraft(id, { text: '', images: [] })
    } finally {
      sendingRef.current = false
      setSubmitting(false)
    }
  }

  const toggleVoice = (): void => {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    const Recognition =
      (
        window as unknown as {
          SpeechRecognition?: any
          webkitSpeechRecognition?: any
        }
      ).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: any })
        .webkitSpeechRecognition
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
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        if (event.results[index].isFinal)
          final += event.results[index][0].transcript
      }
      if (final.trim()) {
        setText((previous) =>
          previous.trim() ? `${previous.trim()} ${final.trim()}` : final.trim()
        )
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
    <div className="shrink-0 px-6 pb-4 pt-2">
      <div className="mx-auto w-full max-w-[800px]">
        {showContext && (
          <ContextBar
            disabled={busy || submitting}
            hide={() => setShowContext(false)}
          />
        )}
        <div
          data-testid="chat-composer"
          className="relative overflow-hidden rounded-[20px] border border-line-soft bg-bg codex-composer-shadow"
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files'))
              event.preventDefault()
          }}
          onDrop={(event) => {
            event.preventDefault()
            void addImages(Array.from(event.dataTransfer.files))
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            aria-label="添加图片"
            onChange={(event) => {
              void addImages(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
          {images.length > 0 && (
            <div
              className="composer-inset-x flex flex-wrap gap-2 pt-3"
              aria-label="待发送图片"
            >
              {images.map((image) => (
                <div
                  key={image.id}
                  className="group relative h-20 w-24 overflow-hidden rounded-xl border border-line bg-panel"
                >
                  <img
                    src={image.dataUrl}
                    alt={image.name}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`移除图片 ${image.name}`}
                    onClick={() =>
                      patchDraft(activeSessionId || 'new', {
                        images: images.filter((item) => item.id !== image.id)
                      })
                    }
                    className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-bg/90 text-ink shadow"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={ref}
            value={text}
            aria-label="聊天消息"
            onChange={(event) => setText(event.target.value)}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.items)
                .filter(
                  (item) =>
                    item.kind === 'file' && item.type.startsWith('image/')
                )
                .map((item) => item.getAsFile())
                .filter((file): file is File => Boolean(file))
              if (files.length) {
                event.preventDefault()
                void addImages(files)
              }
            }}
            onKeyDown={(event) => {
              const modifier = event.ctrlKey || event.metaKey
              const shouldSend =
                useChatSendMode.getState().mode === 'ctrl-enter'
                  ? modifier
                  : !modifier
              if (
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing &&
                !event.shiftKey &&
                shouldSend
              ) {
                event.preventDefault()
                void submit()
              }
            }}
            rows={1}
            placeholder={t('composer.placeholder')}
            className="composer-inset-x block max-h-[176px] min-h-[60px] w-full resize-none bg-transparent pb-1 pt-3.5 text-[13px] leading-[1.6] text-ink outline-none placeholder:text-muted/85"
          />
          {attachmentError && (
            <p role="alert" className="composer-inset-x pb-2 text-xs text-danger">
              {attachmentError}
            </p>
          )}
          <div className="composer-inset-x flex min-h-9 items-center gap-1 pb-2">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  aria-label="添加附件与上下文"
                  className="grid h-7 w-7 place-items-center rounded-full text-ink-soft hover:bg-panel-2"
                >
                  <Plus className="h-[18px] w-[18px]" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  side="top"
                  align="start"
                  sideOffset={8}
                  className={menuContent}
                >
                  <DropdownMenu.Item
                    className={menuItem}
                    onSelect={() => fileRef.current?.click()}
                  >
                    添加图片…
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className={menuItem}
                    onSelect={() => setShowContext((value) => !value)}
                  >
                    {showContext ? '隐藏' : '显示'}上下文栏
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className={menuItem}
                    onSelect={() => setRightTab('workspace')}
                  >
                    {t('rail.docs')}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className={menuItem}
                    onSelect={() => setRightTab('diff')}
                  >
                    {t('rail.changes')}
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <AccessMenu disabled={busy || submitting} />
            <div className="ml-auto flex min-w-0 items-center gap-1">
              <Tooltip
                side="top"
                label={
                  <div className="space-y-1 p-1">
                    <div className="font-medium">模型上下文</div>
                    <div>
                      {promptTokens === undefined
                        ? '等待模型返回用量'
                        : `上次请求输入 ${promptTokens.toLocaleString()} tokens`}
                    </div>
                    <div>
                      {capacityTokens
                        ? `模型容量 ${capacityTokens.toLocaleString()} tokens`
                        : '模型服务未提供容量'}
                    </div>
                    {percent !== undefined && (
                      <div>
                        {percent}% 已用 · 剩余 {Math.max(0, 100 - percent)}%
                      </div>
                    )}
                  </div>
                }
              >
                <button
                  type="button"
                  aria-label="模型上下文用量"
                  onFocus={readCapacity}
                  onPointerEnter={readCapacity}
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-panel-2"
                >
                  {percent === undefined ? (
                    <CircleGauge className="size-4" />
                  ) : (
                    <span
                      className="size-3.5 rounded-full p-[2px]"
                      style={{
                        background: `conic-gradient(var(--color-accent) ${Math.min(100, percent)}%, var(--color-line) 0)`
                      }}
                    >
                      <span className="block size-full rounded-full bg-bg" />
                    </span>
                  )}
                </button>
              </Tooltip>
              <ModelPicker
                model={settings.model}
                models={settings.newApiModels}
                effort={effort}
                saving={effortSaving}
                error={effortError}
                disabled={busy || submitting}
                formatModel={modelLabel}
                onModel={pickModel}
                onEffortPreview={(level) => {
                  setEffort(level)
                  setEffortError('')
                }}
                onEffortCommit={(level) => {
                  applyEffort(EFFORT_LEVELS.indexOf(level))
                }}
                onClearEffort={clearEffort}
                onOpenSettings={() => setSettingsOpen(true)}
              />
              <Tooltip label={voiceHint || t('composer.voice')} side="top">
                <button
                  type="button"
                  onClick={toggleVoice}
                  aria-label={t('composer.voice')}
                  className={cn(
                    'grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-panel-2',
                    listening ? 'text-[#c2410c]' : 'text-ink-soft'
                  )}
                >
                  <Mic className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </Tooltip>
              <button
                type="button"
                onClick={() => (busy ? void cancel() : void submit())}
                disabled={
                  submitting || (!busy && !text.trim() && images.length === 0)
                }
                aria-label={busy ? t('chat.stop') : t('chat.send')}
                className={cn(
                  'ml-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white transition-all disabled:opacity-50',
                  busy ? 'bg-[#2b2d31]' : 'bg-[#2f6feb] hover:bg-[#2a63d4]'
                )}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : busy ? (
                  <Square className="h-3 w-3 fill-current" />
                ) : text.trim() || images.length ? (
                  <ArrowUp className="h-4 w-4" />
                ) : (
                  <AudioLines className="h-[17px] w-[17px]" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ChatView(): React.JSX.Element {
  const t = useT()
  const sessions = useAppStore((state) => state.sessions)
  const activeSessionId = useAppStore((state) => state.activeSessionId)
  const messages = useAppStore((state) => state.messages)
  const lastUser = useMemo(() => [...messages].reverse().find((item) => item.role === 'user'), [messages])
  const hasOlderMessages = useAppStore((state) => state.hasOlderMessages)
  const loadingOlderMessages = useAppStore((state) => state.loadingOlderMessages)
  const loadOlderMessages = useAppStore((state) => state.loadOlderMessages)
  const scroll = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const [away, setAway] = useState(false)
  const toggleRight = useAppStore((state) => state.toggleRight)
  const rightOpen = useAppStore((state) => state.rightOpen)
  const sidebarOpen = useLayout((state) => state.sidebarOpen)
  const projectName = useMemo(() => {
    const path = sessions.find((item) => item.id === activeSessionId)?.workspace || ''
    return path.split('/').filter(Boolean).pop() || ''
  }, [sessions, activeSessionId])
  const session = useMemo(
    () => sessions.find((item) => item.id === activeSessionId),
    [sessions, activeSessionId]
  )
  // 顶部项目图标只用于提示当前项目名，不承担点击行为
  const projectLabel = useMemo(() => {
    const root = session?.workspace || useAppStore.getState().settings.workspaceRoot || ''
    return basename(root) || '未选择工作区'
  }, [session?.workspace])

  useLayoutEffect(() => {
    following.current = true
    setAway(false)
  }, [activeSessionId])

  const jumpToLatest = (): void => {
    const view = scroll.current
    if (view) view.scrollTop = view.scrollHeight
  }

  useLayoutEffect(() => {
    if (following.current) jumpToLatest()
  }, [messages, activeSessionId])

  return (
    <section
      className={cn(
        'relative flex min-w-0 flex-1 flex-col overflow-hidden bg-bg',
        // 侧栏展开时内容区是带圆角的“卡片”，收起时与图标栏齐平（同 ChatGPT）
        sidebarOpen && 'rounded-l-[18px] border-l border-line'
      )}
    >
      <header
        className={cn(
          // 整条顶栏可拖动窗口；交互控件各自 no-drag。
          // 侧栏收起时顶栏从开关右侧 (x=130) 起——物理上不与窗口控件重叠，
          // 不再依赖透明安全区：透明元素在原生拖动区计算里不可靠，会把点击吃成拖动。
          // 顶层 no-drag + 只在标题/中段空白放 drag-region：
          // 拖动区与按钮彻底分离，避免按钮被原生拖动区吞掉点击
          'chat-glass no-drag absolute top-0 z-20 flex h-11 items-center gap-2 px-4',
          'transition-[left] duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
          sidebarOpen ? 'inset-x-0' : 'left-[130px] right-0'
        )}
        aria-label="会话工具栏"
      >
        <Tooltip label={projectLabel} side="bottom">
          <span
            aria-label={projectLabel}
            className="no-drag grid size-7 shrink-0 place-items-center rounded-lg bg-accent/8 text-accent"
          >
            <Folder className="size-4" />
          </span>
        </Tooltip>
        <div className="drag-region flex min-w-0 items-center gap-1.5">
          {projectName ? (
            <>
              <span className="max-w-[160px] truncate text-[12px] text-muted">{projectName}</span>
              <ChevronRight className="h-3 w-3 shrink-0 text-muted/60" strokeWidth={2} />
            </>
          ) : null}
          <div
            className="truncate text-[13px] font-semibold"
            title={session?.title}
          >
            {session?.title || '新聊天'}
          </div>
          {session?.workspace && (
            <div className="truncate text-[10px] leading-3 text-muted">
              {basename(session.workspace)}
            </div>
          )}
        </div>
        <div className="drag-region h-full min-w-6 flex-1" aria-hidden="true" />
        {rightOpen ? null : (
          <button
            type="button"
            onClick={toggleRight}
            aria-label="切换右侧面板"
            aria-pressed={false}
            className="no-drag grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-panel-2"
          >
            <PanelRight className="size-4" />
          </button>
        )}
      </header>
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          ref={scroll}
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={(event) => {
            const view = event.currentTarget
            following.current =
              view.scrollHeight - view.scrollTop - view.clientHeight < 52
            setAway(!following.current)
          }}
        >
          <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-8 pb-6 pt-16">
            {hasOlderMessages ? (
              <button
                type="button"
                disabled={loadingOlderMessages}
                onClick={() => {
                  following.current = false
                  void loadOlderMessages()
                }}
                className="self-center rounded-lg border border-line px-3 py-1.5 text-xs text-ink-soft hover:bg-panel-2 disabled:opacity-50"
              >
                {t(loadingOlderMessages ? 'chat.loadingHistory' : 'chat.loadHistory')}
              </button>
            ) : null}
            {messages.map((message) => (
              <ConversationMessage key={message.id} message={message} lastUser={lastUser} />
            ))}
          </div>
        </div>
      )}
      <div className="relative shrink-0">
        {away && (
          <button
            type="button"
            aria-label="回到最新消息"
            onClick={jumpToLatest}
            className="absolute -top-9 left-1/2 z-10 grid size-8 -translate-x-1/2 place-items-center rounded-full border border-line bg-bg shadow-sm hover:bg-panel-2"
          >
            <ArrowDown className="size-4" />
          </button>
        )}
        <Composer />
      </div>
    </section>
  )
}
