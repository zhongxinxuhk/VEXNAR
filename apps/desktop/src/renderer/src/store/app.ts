// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { create } from 'zustand'
import { translate, useI18n } from '@/lib/i18n'
import type { ProjectTaskFocus } from '@/lib/project-task'
import { defaultNewApiAuthMethods } from '@shared/contracts'
import type {
  AgentEvent,
  AppInfo,
  AvatarColor,
  ImageAttachment,
  ReasoningEffort,
  BackendStatus,
  DiffPayload,
  FileNode,
  GitStatus,
  Message,
  NewApiState,
  NewApiUsage,
  PublicSettings,
  Session,
  SettingsInput
} from '@shared/contracts'

type ToolCall = {
  id: string
  name: string
  status: 'running' | 'done' | 'error'
  input?: unknown
  output?: string
}

export type ChatMessage = Message & {
  toolCalls?: ToolCall[]
  streaming?: boolean
  failed?: boolean
}

type RightTab = 'tasks' | 'sessions' | 'workspace' | 'terminal' | 'diff'
type AgentStatus = 'idle' | 'ready' | 'streaming' | 'error'
export type SettingsSection = 'general' | 'appearance' | 'workspace' | 'model' | 'runtime'
export type AppView =
  | 'chat'
  | 'profile'
  | 'schedules'
  | 'overview'
  | 'tasks'
  | 'plugins'
  | 'findings'
  | 'traffic'
  | 'assets'
  | 'commands'
  | 'system'

type AppState = {
  info: AppInfo | null
  view: AppView
  history: AppView[]
  historyAt: number
  backend: BackendStatus | null
  backendLoading: boolean
  settings: PublicSettings
  newApi: NewApiState | null
  sessions: Session[]
  activeSessionId: string | null
  taskFocus: ProjectTaskFocus | null
  messages: ChatMessage[]
  agentSessionId: string | null
  agentStatus: AgentStatus
  busy: boolean
  rightTab: RightTab
  panelWidth: number
  rightOpen: boolean
  settingsOpen: boolean
  settingsSection: SettingsSection
  workspaceFiles: FileNode[]
  workspaceLoading: boolean
  git: GitStatus | null
  gitError: string | null
  diff: DiffPayload | null
  diffLoading: boolean
  diffError: string | null
  error: string | null
  initializing: boolean
  initialized: boolean

  init: () => Promise<void>
  setView: (view: AppView) => void
  goBack: () => void
  goForward: () => void
  usage: NewApiUsage | null
  usageLoading: boolean
  refreshUsage: () => Promise<void>
  refreshBackend: () => Promise<void>
  askAgent: (text: string) => Promise<void>
  selectSession: (id: string) => Promise<void>
  openProjectTask: (task: ProjectTaskFocus) => void
  setProjectTaskSession: (key: string, title?: string) => void
  closeProjectTask: () => void
  newSession: (workspace?: string) => Promise<void>
  removeSession: (id: string) => Promise<void>
  pinSession: (id: string, pinned: boolean) => Promise<void>
  contextUsage: Record<string, { model: string; promptTokens: number }>
  send: (text: string, attachments?: ImageAttachment[], reasoningEffort?: ReasoningEffort) => Promise<boolean>
  cancel: () => Promise<void>
  handleAgentEvent: (event: AgentEvent) => void
  saveSettings: (input: SettingsInput) => Promise<boolean>
  setNewApi: (state: NewApiState) => void
  refreshNewApi: () => Promise<void>
  logout: () => Promise<boolean>
  chooseWorkspace: () => Promise<void>
  switchWorkspace: (workspace: string) => Promise<void>
  refreshWorkspace: () => Promise<void>
  refreshGit: () => Promise<void>
  openDiff: (path: string) => Promise<void>
  setRightTab: (tab: RightTab) => void
  setPanelWidth: (width: number) => void
  toggleRight: () => void
  setSettingsOpen: (open: boolean) => void
  openSettings: (section?: SettingsSection) => void
  updateProfile: (profile: { displayName: string; avatarColor: AvatarColor }) => Promise<boolean>
  clearError: () => void
}

const emptySettings: PublicSettings = {
  theme: 'light',
  displayName: '',
  avatarColor: 'orange',
  workspaceRoot: '',
  shell: '',
  model: 'gpt-5-codex',
  newApiModels: [],
  baseUrl: '',
  hasApiKey: false
}

const api = window.vexnar
const newChatTitle = (): string => translate(useI18n.getState().locale, 'app.newThread')
const isDefaultTitle = (title: string): boolean => title === 'New chat' || title === translate('zh', 'app.newThread') || title === translate('en', 'app.newThread')

function applyTheme(theme: PublicSettings['theme']): void {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

function settingsInput(settings: PublicSettings): SettingsInput {
  return {
    theme: settings.theme,
    displayName: settings.displayName,
    avatarColor: settings.avatarColor,
    workspaceRoot: settings.workspaceRoot,
    shell: settings.shell,
    model: settings.model,
    newApiModels: settings.newApiModels,
    baseUrl: settings.baseUrl
  }
}

function lastStreaming(messages: ChatMessage[]): ChatMessage | undefined {
  return [...messages].reverse().find((message) => message.role === 'assistant' && message.streaming)
}

const lastSessionKey = (workspace: string): string => `vexnar.last-session:${workspace}`

function preferredSession(sessions: Session[], workspace: string): Session | undefined {
  const lastId = localStorage.getItem(lastSessionKey(workspace))
  return sessions.find((session) => session.workspace === workspace && session.id === lastId)
    ?? sessions.find((session) => session.workspace === workspace)
}

let navigating = false
let preparingSend = false
let resourceRequest = 0
let diffRequest = 0

async function navigate(action: () => Promise<boolean>): Promise<boolean> {
  if (navigating || useAppStore.getState().initializing) return false
  if (useAppStore.getState().busy || preparingSend) {
    useAppStore.setState({ error: translate(useI18n.getState().locale, 'app.navigationBusy') })
    return false
  }
  navigating = true
  try {
    return await action()
  } finally {
    navigating = false
  }
}

function changeWorkspace(settings: PublicSettings): void {
  resourceRequest++
  diffRequest++
  useAppStore.setState({
    settings, activeSessionId: null, taskFocus: null, messages: [], agentSessionId: null, error: null,
    workspaceFiles: [], workspaceLoading: false, git: null, gitError: null,
    diff: null, diffError: null, diffLoading: false,
    rightTab: 'sessions', rightOpen: true
  })
}

async function focusSession(session: Session | undefined, showPanel = false): Promise<void> {
  useAppStore.setState({
    activeSessionId: session?.id ?? null,
    taskFocus: null,
    messages: [],
    agentSessionId: null,
    agentStatus: 'idle',
    ...(showPanel ? { rightTab: 'sessions', rightOpen: true } : {})
  })
  if (!session) return
  localStorage.setItem(lastSessionKey(session.workspace), session.id)
  const result = await api.messages.list({ id: session.id })
  if (result.ok) useAppStore.setState({ messages: result.data })
  else useAppStore.setState({ error: result.error })
}

async function createWorkspaceSession(): Promise<void> {
  const workspace = useAppStore.getState().settings.workspaceRoot
  const result = await api.sessions.create({ title: newChatTitle(), workspace })
  if (!result.ok) {
    useAppStore.setState({ error: result.error })
    return
  }
  localStorage.setItem(lastSessionKey(workspace), result.data.id)
  useAppStore.setState((state) => ({
    sessions: [result.data, ...state.sessions],
    activeSessionId: result.data.id,
    taskFocus: null,
    messages: [],
    agentSessionId: null,
    agentStatus: 'idle'
  }))
}

async function openWorkspace(workspace: string, session?: Session): Promise<boolean> {
  const settings = useAppStore.getState().settings
  const changed = settings.workspaceRoot !== workspace
  if (changed) {
    const result = await api.settings.set({ ...settingsInput(settings), workspaceRoot: workspace })
    if (!result.ok) {
      useAppStore.setState({ error: result.error })
      return false
    }
    changeWorkspace(result.data)
  }
  useAppStore.getState().setView('chat')
  await focusSession(session ?? preferredSession(useAppStore.getState().sessions, workspace), true)
  if (changed) await Promise.all([useAppStore.getState().refreshWorkspace(), useAppStore.getState().refreshGit()])
  return true
}

export const useAppStore = create<AppState>((set, get) => ({
  info: null,
  view: 'chat',
  history: ['chat'],
  historyAt: 0,
  backend: null,
  backendLoading: false,
  settings: emptySettings,
  newApi: null,
  usage: null,
  usageLoading: false,
  sessions: [],
  activeSessionId: null,
  taskFocus: null,
  messages: [],
  agentSessionId: null,
  agentStatus: 'idle',
  busy: false,
  rightTab: 'sessions',
  panelWidth: Math.min(720, Math.max(280, Number(localStorage.getItem('vexnar.panel-width')) || 360)),
  rightOpen: false,
  contextUsage: {},
  settingsOpen: false,
  settingsSection: 'general',
  workspaceFiles: [],
  workspaceLoading: false,
  git: null,
  gitError: null,
  diff: null,
  diffLoading: false,
  diffError: null,
  error: null,
  initializing: false,
  initialized: false,

  init: async () => {
    if (get().initializing || get().initialized) return
    set({ initializing: true })
    try {
      const [infoResult, settingsResult, sessionsResult] = await Promise.all([
      api.app.info(),
      api.settings.get(),
      api.sessions.list()
    ])
      if (!settingsResult.ok) {
        set({ error: settingsResult.error })
        return
      }
      const settings = settingsResult.data
      let sessions = sessionsResult.ok ? sessionsResult.data : []
      if (sessionsResult.ok && !preferredSession(sessions, settings.workspaceRoot)) {
        const created = await api.sessions.create({
          title: newChatTitle(),
          workspace: settings.workspaceRoot
        })
        if (created.ok) sessions = [created.data, ...sessions]
      }
      set({
        info: infoResult.ok ? infoResult.data : null,
        settings,
        sessions,
        initialized: true,
        error: sessionsResult.ok ? null : sessionsResult.error
      })
      applyTheme(settings.theme)
      await focusSession(preferredSession(sessions, settings.workspaceRoot), !!settings.workspaceRoot)
      await Promise.all([get().refreshWorkspace(), get().refreshGit()])
      void get().refreshBackend()
    } finally {
      set({ initializing: false })
    }
  },

  setView: (view) =>
    set((state) => {
      if (view === state.view) return {}
      const history = [...state.history.slice(0, state.historyAt + 1), view]
      return { view, history, historyAt: history.length - 1 }
    }),
  goBack: () =>
    set((state) =>
      state.historyAt > 0
        ? { view: state.history[state.historyAt - 1], historyAt: state.historyAt - 1 }
        : {}
    ),
  goForward: () =>
    set((state) =>
      state.historyAt < state.history.length - 1
        ? { view: state.history[state.historyAt + 1], historyAt: state.historyAt + 1 }
        : {}
    ),

  refreshUsage: async () => {
    if (get().usageLoading) return
    set({ usageLoading: true })
    const result = await api.newapi.usage()
    set({ usage: result.ok ? result.data : null, usageLoading: false })
  },

  refreshBackend: async () => {
    set({ backendLoading: true })
    const result = await api.backend.status()
    set({
      backend: result.ok ? result.data : null,
      backendLoading: false,
      error: result.ok ? get().error : result.error
    })
  },

  askAgent: async (text) => {
    set({ view: 'chat' })
    if (!get().activeSessionId) await get().newSession()
    await get().send(text)
  },

  selectSession: async (id) => {
    const session = get().sessions.find((item) => item.id === id)
    if (!session) return
    if (id === get().activeSessionId) {
      get().closeProjectTask()
      return
    }
    await navigate(() => openWorkspace(session.workspace, session))
  },

  openProjectTask: (taskFocus) => {
    if (taskFocus.workspace !== get().settings.workspaceRoot || navigating) return
    set({ taskFocus, rightTab: 'tasks', rightOpen: true })
  },

  setProjectTaskSession: (sessionKey, sessionTitle) => set((state) => ({
    taskFocus: state.taskFocus ? { ...state.taskFocus, sessionKey, sessionTitle } : null
  })),

  closeProjectTask: () => set({ taskFocus: null }),

  switchWorkspace: async (workspace) => {
    await navigate(() => openWorkspace(workspace))
  },

  newSession: async (workspace) => {
    await navigate(async () => {
      if (workspace !== undefined && workspace !== get().settings.workspaceRoot && !(await openWorkspace(workspace))) return false
      await createWorkspaceSession()
      return true
    })
  },

  pinSession: async (id, pinned) => {
    const result = await api.sessions.pin({ id, pinned })
    if (!result.ok) {
      set({ error: result.error })
      return
    }
    set((state) => ({
      sessions: state.sessions.map((session) => (session.id === id ? result.data : session))
    }))
  },

  removeSession: async (id) => {
    await navigate(async () => {
      const result = await api.sessions.remove({ id })
      if (!result.ok) {
        set({ error: result.error })
        return false
      }
      set((state) => ({ sessions: state.sessions.filter((session) => session.id !== id) }))
      if (id === get().activeSessionId) {
        const workspace = get().settings.workspaceRoot
        const next = preferredSession(get().sessions, workspace)
        if (next) await focusSession(next)
        else {
          await focusSession(undefined)
          await createWorkspaceSession()
        }
      }
      return true
    })
  },

  send: async (text, attachments = [], reasoningEffort) => {
    const trimmed = text.trim()
    const sessionId = get().activeSessionId
    if ((!trimmed && attachments.length === 0) || !sessionId || get().busy ||
        navigating || preparingSend || get().initializing) return false
    preparingSend = true

    const userResult = await api.messages.append({
      sessionId,
      role: 'user',
      content: trimmed,
      attachments
    }).finally(() => { preparingSend = false })
    if (!userResult.ok) {
      set({ error: userResult.error })
      return false
    }
    const assistant: ChatMessage = {
      id: `stream-${Date.now()}`,
      sessionId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      streaming: true,
      toolCalls: []
    }
    set((state) => ({
      messages: [...state.messages, userResult.data, assistant],
      busy: true,
      agentStatus: 'streaming',
      agentSessionId: sessionId,
      error: null
    }))
    const current = get().sessions.find((item) => item.id === sessionId)
    if (current && isDefaultTitle(current.title)) {
      const title = (trimmed || attachments[0]?.name || '图片').replace(/\s+/g, ' ').slice(0, 60)
      void api.sessions.rename({ id: sessionId, title }).then((renamed) => {
        if (!renamed.ok) return
        set((state) => ({
          sessions: state.sessions.map((item) => (item.id === sessionId ? renamed.data : item))
        }))
      })
    }
    const result = await api.agent.send({ sessionId, text: trimmed, attachments, reasoningEffort })
    if (!result.ok) {
      set((state) => ({
        busy: false,
        agentStatus: 'error',
        error: result.error,
        messages: state.messages.map((message) =>
          message.id === assistant.id
            ? { ...message, streaming: false, failed: true, content: `${translate(useI18n.getState().locale, 'chat.runtimeError')}：${result.error}` }
            : message
        )
      }))
    }
    return result.ok
  },

  cancel: async () => {
    await api.agent.cancel()
    const messages = get().messages
    const streaming = lastStreaming(messages)
    set({
      busy: false,
      agentStatus: 'idle',
      messages: messages.map((message) =>
        message.id === streaming?.id ? { ...message, streaming: false } : message
      )
    })
    if (streaming && (streaming.content.trim() || streaming.toolCalls?.length)) {
      await api.messages.append({
        sessionId: streaming.sessionId,
        role: 'assistant',
        content: streaming.content,
        toolCalls: streaming.toolCalls?.map((tool) => tool.status === 'running' ? { ...tool, status: 'error' } : tool)
      })
    }
  },

  handleAgentEvent: (event) => {
    const sessionId = get().agentSessionId
    if (!sessionId) return
    if (event.type === 'ready') {
      if (get().agentStatus === 'idle') set({ agentStatus: 'ready' })
      return
    }
    if (event.type === 'assistant_delta') {
      set((state) => {
        const messages = [...state.messages]
        let index = messages.findIndex((message) => message.role === 'assistant' && message.streaming)
        if (index < 0) {
          messages.push({
            id: `stream-${Date.now()}`,
            sessionId,
            role: 'assistant',
            content: '',
            createdAt: Date.now(),
            streaming: true,
            toolCalls: []
          })
          index = messages.length - 1
        }
        messages[index] = {
          ...messages[index],
          content: messages[index].content + event.text
        }
        return { messages, agentStatus: 'streaming' }
      })
      return
    }
    if (event.type === 'tool_start') {
      set((state) => {
        const messages = [...state.messages]
        const index = messages.findIndex((message) => message.role === 'assistant' && message.streaming)
        if (index >= 0) {
          const toolCalls = [...(messages[index].toolCalls ?? [])]
          toolCalls.push({
            id: event.id,
            name: event.name,
            status: 'running',
            input: event.input
          })
          messages[index] = { ...messages[index], toolCalls }
        }
        return { messages }
      })
      return
    }
    if (event.type === 'tool_end') {
      set((state) => ({
        messages: state.messages.map((message) => {
          if (message.role !== 'assistant') return message
          return {
            ...message,
            toolCalls: (message.toolCalls ?? []).map((tool) =>
              tool.id === event.id
                ? { ...tool, status: event.ok ? 'done' : 'error', output: event.output }
                : tool
            )
          }
        })
      }))
      return
    }
    if (event.type === 'error') {
      set((state) => ({
        error: event.message,
        agentStatus: 'error',
        busy: false,
        messages: state.messages.map((message) =>
          message.role === 'assistant' && message.streaming
            ? {
                ...message,
                streaming: false,
                content: message.content + `\n\n${translate(useI18n.getState().locale, 'chat.runtimeError')}：${event.message}`,
                failed: true
              }
            : message
        )
      }))
      return
    }
    if (event.type === 'context_usage') {
      const id = get().agentSessionId
      if (id) set((state) => ({ contextUsage: { ...state.contextUsage, [id]: event } }))
      return
    }
    if (event.type === 'assistant_done') {
      const streaming = lastStreaming(get().messages)
      set((state) => ({
        busy: false,
        agentStatus: 'idle',
        messages: state.messages.map((message) =>
          message.id === streaming?.id ? { ...message, streaming: false } : message
        )
      }))
      if (streaming && (streaming.content.trim() || streaming.toolCalls?.length)) {
        void api.messages
          .append({
            sessionId: streaming.sessionId,
            role: 'assistant',
            content: streaming.content,
            toolCalls: streaming.toolCalls?.map((tool) => tool.status === 'running' ? { ...tool, status: 'error' } : tool)
          })
          .then((result) => {
            if (!result.ok) return
            set((state) => ({
              messages: state.messages.map((message) =>
                message.id === streaming.id ? { ...message, id: result.data.id } : message
              )
            }))
          })
      }
    }
  },

  setNewApi: (newApi) => set({ newApi }),

  refreshNewApi: async () => {
    const result = await api.newapi.refresh()
    if (result.ok) set({ newApi: result.data })
    else set({ error: result.error })
    const settings = await api.settings.get()
    if (settings.ok) set({ settings: settings.data })
  },

  logout: async () => {
    const result = await api.newapi.logout()
    if (!result.ok) {
      set({ error: result.error })
      return false
    }
    set({ newApi: { stage: 'anonymous', authenticated: false, user: null, quota: null, token: null, accessToken: null, accessTokenError: null, models: [], verificationMethods: [], authMethods: defaultNewApiAuthMethods, externalAuth: null, error: null, updatedAt: Date.now() }, usage: null })
    return true
  },

  saveSettings: (input) => navigate(async () => {
    const previousWorkspace = get().settings.workspaceRoot
    const result = await api.settings.set(input)
    if (!result.ok) {
      set({ error: result.error })
      return false
    }
    const workspace = result.data.workspaceRoot
    applyTheme(result.data.theme)
    if (workspace !== previousWorkspace) {
      changeWorkspace(result.data)
      await focusSession(preferredSession(get().sessions, workspace))
      if (!get().activeSessionId) await createWorkspaceSession()
    } else set({ settings: result.data, error: null })
    await Promise.all([get().refreshWorkspace(), get().refreshGit()])
    return true
  }),

  chooseWorkspace: async () => {
    const result = await api.workspace.choose()
    if (!result.ok) {
      set({ error: result.error })
      return
    }
    if (!result.data) return
    const workspace = result.data
    await navigate(async () => {
      if (!(await openWorkspace(workspace))) return false
      if (!get().activeSessionId) await createWorkspaceSession()
      return true
    })
  },

  refreshWorkspace: async () => {
    if (!get().settings.workspaceRoot) {
      set({ workspaceFiles: [], workspaceLoading: false })
      return
    }
    const request = resourceRequest
    set({ workspaceLoading: true })
    const result = await api.workspace.list()
    if (request !== resourceRequest) return
    set({
      workspaceFiles: result.ok ? result.data : [],
      workspaceLoading: false,
      error: result.ok ? get().error : result.error
    })
  },

  refreshGit: async () => {
    if (!get().settings.workspaceRoot) {
      set({ git: null, gitError: null })
      return
    }
    const request = resourceRequest
    const result = await api.git.status()
    if (request !== resourceRequest) return
    set({ git: result.ok ? result.data : null, gitError: result.ok ? null : result.error })
  },

  openDiff: async (filePath) => {
    const request = ++diffRequest
    set({ rightTab: 'diff', rightOpen: true, diffLoading: true, diffError: null, diff: null })
    const result = await api.git.diff({ path: filePath })
    if (request !== diffRequest) return
    set({
      diff: result.ok ? result.data : null,
      diffError: result.ok ? null : result.error,
      diffLoading: false
    })
  },

  setRightTab: (rightTab) => set({ rightTab, rightOpen: true }),
  setPanelWidth: (width) => {
    const bounded = Math.round(Math.min(720, Math.max(280, width)))
    localStorage.setItem('vexnar.panel-width', String(bounded))
    set({ panelWidth: bounded })
  },
  toggleRight: () =>
    set((state) => ({ rightOpen: !state.rightOpen })),
  setSettingsOpen: (settingsOpen) =>
    set(settingsOpen ? { settingsOpen: true, settingsSection: 'general' } : { settingsOpen: false }),
  openSettings: (settingsSection = 'general') => set({ settingsOpen: true, settingsSection }),
  updateProfile: async (profile) =>
    get().saveSettings({
      ...settingsInput(get().settings),
      ...profile
    }),
  clearError: () => set({ error: null })
}))
