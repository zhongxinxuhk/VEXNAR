// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { create } from 'zustand'
import { draftKeyFor, useDrafts } from './drafts'
import { translate, useI18n } from '@/lib/i18n'
import type { ProjectTaskFocus } from '@/lib/project-task'
import {
  conversations,
  projects as projectApi,
  DEFAULT_AGENT_KEY,
  lastTurnUsage,
  mergeActivities,
  toChatMessages,
  toSession,
  uploadImages,
  type BackendActivity,
  type BackendProject
} from '@/lib/conversations'
import { defaultNewApiAuthMethods } from '@shared/contracts'
import type {
  AppInfo,
  AvatarColor,
  ImageAttachment,
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

export type ToolCallEvent = { sequence: number; timestamp: string }

export type ToolTraceEvent = ToolCallEvent & {
  tool: string
  worker: string
  outcome: 'invoked' | 'done' | 'error'
  relatedCallSequence?: number
  relation?: 'unmatched' | 'ambiguous'
}

export type ToolCall = {
  id: string
  name: string
  worker: string
  started: ToolCallEvent
  finished?: ToolCallEvent
  status: 'running' | 'done' | 'error'
}

export type ChatExecutionPhase = 'reasoning' | 'tools' | 'answer'

export type ChatFlowBlock =
  | { kind: 'text'; sequence: number; text: string }
  | { kind: 'reasoning'; sequence: number }
  | { kind: 'plan'; sequence: number; call: ToolCall }
  | { kind: 'call'; sequence: number; call: ToolCall }
  | { kind: 'result'; sequence: number; event: ToolTraceEvent }

export type ChatMessage = Omit<Message, 'toolCalls'> & {
  flow?: ChatFlowBlock[]
  toolCalls?: ToolCall[]
  toolEvents?: ToolTraceEvent[]
  execution?: { worker: string; model?: string; startedAt?: number; completedAt?: number; cancelled?: boolean; phase?: ChatExecutionPhase }
  streaming?: boolean
  failed?: boolean
  /** Upstream failure text for a failed turn (kept apart from any streamed text). */
  error?: string
  /** Terminal `result` row of a failed turn: a diagnostic, not an answer. */
  diagnostic?: string
  /** Uploaded (non-image-previewable) files attached to a human turn. */
  files?: { name: string; size: number }[]
}

type RightTab = 'tasks' | 'sessions' | 'workspace' | 'terminal' | 'diff'
/** Wallet dialog tabs; the quota notice deep-links to `topup` / `plans`. */
export type WalletTab = 'topup' | 'plans' | 'redeem'
type AgentStatus = 'idle' | 'ready' | 'streaming' | 'error'
export type SettingsSection = 'general' | 'appearance' | 'workspace' | 'model' | 'runtime'
export type AppView =
  | 'chat'
  | 'profile'
  | 'schedules'
  | 'overview'
  | 'approvals'
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
  /** Project list owned by Go; the sidebar groups threads by these rows. */
  projects: BackendProject[]
  activeSessionId: string | null
  draftWorkspace: string
  messages: ChatMessage[]
  agentSessionId: string | null
  agentStatus: AgentStatus
  busy: boolean
  rightTab: RightTab
  panelLauncher: boolean
  panelWidth: number
  rightOpen: boolean
  settingsOpen: boolean
  settingsSection: SettingsSection
  /** Wallet dialog is app-wide: the quota notice and the rail both open it. */
  walletOpen: boolean
  walletTab: WalletTab
  openWallet: (tab?: WalletTab) => void
  setWalletOpen: (open: boolean) => void
  setWalletTab: (tab: WalletTab) => void
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
  pendingApprovals: number
  hasOlderMessages: boolean
  loadingOlderMessages: boolean
  loadOlderMessages: () => Promise<void>
  newSession: (workspace?: string) => Promise<void>
  switchWorkspace: (workspace: string) => Promise<void>
  addProject: () => Promise<BackendProject | null>
  taskFocus: ProjectTaskFocus | null
  openProjectTask: (focus: ProjectTaskFocus) => void
  setProjectTaskSession: (sessionKey: string, sessionTitle?: string) => void
  closeProjectTask: () => void
  removeSession: (id: string) => Promise<boolean>
  pinSession: (id: string, pinned: boolean) => Promise<void>
  renameSession: (id: string, title: string) => Promise<void>
  contextUsage: Record<string, { model: string; promptTokens: number }>
  send: (text: string, attachments?: ImageAttachment[]) => Promise<boolean>
  cancel: () => Promise<void>
  saveSettings: (input: SettingsInput) => Promise<boolean>
  setNewApi: (state: NewApiState) => void
  refreshNewApi: () => Promise<void>
  logout: () => Promise<boolean>
  chooseWorkspace: () => Promise<void>
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

/**
 * Live transcript buffer for the open conversation. The Go backend is the only
 * transcript store; the app keeps the raw activity rows so a poll can rebuild
 * the rendered list without drifting from what the web /chat page shows.
 */
let activities: BackendActivity[] = []
let activityCursor = 0
let turnActive = false
/** seq of the row the running turn is still writing (0 = none). */
let liveSeq = 0
let pending: { text: string; images: ImageAttachment[] } | null = null
let pollTimer: ReturnType<typeof setTimeout> | null = null
let pollSeq = 0
let pollConversation = ''
let sessionSelection = 0

function stopPolling(): void {
  pollSeq += 1
  pollConversation = ''
  liveSeq = 0
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

/** Rebuild the visible transcript from the backend activity buffer. */
function renderActivities(sessionId: string): ChatMessage[] {
  const messages = toChatMessages(activities, sessionId)
  // Drop the optimistic bubble once the server's persisted human turn arrives.
  if (pending) {
    const sent = [...messages].reverse().find((message) => message.role === 'user')
    if (sent && sent.content.trim() === pending.text.trim()) pending = null
  }
  if (pending) {
    messages.push({
      id: `pending-user-${sessionId}`,
      sessionId,
      role: 'user',
      content: pending.text,
      createdAt: Date.now(),
      ...(pending.images.length ? { attachments: pending.images } : {})
    })
  }
  if (turnActive) {
    const last = messages[messages.length - 1]
    if (last && last.role === 'assistant') last.streaming = true
    else
      messages.push({
        id: `pending-assistant-${sessionId}`,
        sessionId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        streaming: true,
        toolCalls: []
      })
  }
  return messages
}

/** Push the activity buffer into the store for the conversation on screen. */
function publish(id: string, running: boolean, pendingApprovals = 0): void {
  const state = useAppStore.getState()
  if (state.activeSessionId !== id) return
  const usage = lastTurnUsage(activities)
  useAppStore.setState({
    messages: renderActivities(id),
    busy: running,
    pendingApprovals,
    agentStatus: running ? 'streaming' : 'idle',
    ...(usage
      ? {
          contextUsage: {
            ...state.contextUsage,
            [id]: { model: state.settings.model, promptTokens: usage.promptTokens }
          }
        }
      : {})
  })
}

/**
 * Poll /conversations/{id}/messages until the backend reports the turn is done.
 * This is the same transport the web /chat page uses — no second SSE loop and no
 * local assistant stream that could drift from the stored transcript.
 *
 * The poll runs fast while the model is actively writing because the backend
 * streams the answer through `live`: one transcript row whose text grows.
 * Merging it by seq gives token-by-token rendering even though the transport is
 * plain polling. While a tool runs (no live text) it backs off, so a long turn
 * doesn't turn into thousands of requests.
 */
const LIVE_POLL_MS = 150
const IDLE_POLL_MS = 400

function pollUntilDone(id: string, initialLive?: BackendActivity | null): void {
  stopPolling()
  if (initialLive?.kind === 'text') liveSeq = initialLive.seq
  pollConversation = id
  const seq = pollSeq
  turnActive = true
  const tick = async (): Promise<void> => {
    if (seq !== pollSeq || pollConversation !== id) return
    try {
      const page = await conversations.messages(id, activityCursor)
      if (seq !== pollSeq) return
      if (page.hasMore && page.cursor > activityCursor) {
        activities = mergeActivities(activities, page.items)
        activityCursor = page.cursor
        pollTimer = setTimeout(() => void tick(), 0)
        return
      }
      const incoming = page.live ? [...page.items, page.live] : page.items
      if (incoming.length) activities = mergeActivities(activities, incoming)
      activityCursor = Math.max(activityCursor, page.cursor)
      if (page.live?.kind === 'text') liveSeq = page.live.seq
      if (page.running) {
        turnActive = true
        publish(id, true, page.pending_approvals ?? 0)
        pollTimer = setTimeout(() => void tick(), page.live ? LIVE_POLL_MS : IDLE_POLL_MS)
        return
      }
      turnActive = false
      pending = null
      // The turn just ended: re-read the streamed row once, so the very last
      // fragment (written between the final poll and the seal) is not lost.
      await settleLiveRow(id, seq)
      if (seq !== pollSeq) return
      publish(id, false)
      pollTimer = null
      void refreshSessions()
    } catch {
      if (seq !== pollSeq) return
      // Transient (backend restarting, short DB hiccup): retry with the same
      // cursor instead of dropping the turn from the UI.
      pollTimer = setTimeout(() => void tick(), 1500)
    }
  }
  pollTimer = setTimeout(() => void tick(), 120)
}

/** Replace the streamed row with its sealed text once the turn is over. */
async function settleLiveRow(id: string, poll: number): Promise<void> {
  const seq = liveSeq
  liveSeq = 0
  if (!seq) return
  try {
    const detail = await conversations.detail(id, seq)
    if (poll !== pollSeq) return
    const row = activities.find((item) => item.seq === seq)
    if (!row || !detail || detail === row.detail) return
    activities = mergeActivities(activities, [{ ...row, detail }])
  } catch {
    // The next history load will pick the sealed row up; nothing to repair here.
  }
}

/** Refresh titles/pin order/updated timestamps from the shared conversation list. */
async function refreshSessions(): Promise<void> {
  try {
    // Ownership comes from the backend rows; the current workspace is never
    // stamped onto threads that belong elsewhere.
    const [rows, projects] = await Promise.all([
      conversations.list(),
      projectApi.list().catch(() => useAppStore.getState().projects)
    ])
    const saved = rows.map((item) => toSession(item))
    useAppStore.setState((state) => ({
      sessions: [...saved, ...state.sessions.filter((row) =>
        row.id === state.activeSessionId && row.pendingFirstSend && !saved.some((item) => item.id === row.id)
      )],
      projects
    }))
  } catch {
    // cosmetic refresh — a transient failure must not clear the sidebar
  }
}

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
  projects: [],
  taskFocus: null,
  activeSessionId: null,
  draftWorkspace: '',
  messages: [],
  pendingApprovals: 0,
  hasOlderMessages: false,
  loadingOlderMessages: false,
  agentSessionId: null,
  agentStatus: 'idle',
  busy: false,
  rightTab: 'workspace',
  panelLauncher: true,
  panelWidth: Math.min(720, Math.max(280, Number(localStorage.getItem('vexnar.panel-width')) || 360)),
  rightOpen: false,
  contextUsage: {},
  settingsOpen: false,
  settingsSection: 'general',
  walletOpen: false,
  walletTab: 'topup',
  openWallet: (tab = 'topup') => set({ walletOpen: true, walletTab: tab }),
  setWalletOpen: (open) => set({ walletOpen: open }),
  setWalletTab: (tab) => set({ walletTab: tab }),
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
      const [infoResult, settingsResult] = await Promise.all([
        api.app.info(),
        api.settings.get()
      ])
      if (!settingsResult.ok) {
        set({ error: settingsResult.error })
        return
      }
      const settings = settingsResult.data
      // Transcripts live in PostgreSQL behind the Go backend, shared verbatim
      // with the web /chat page. The app keeps no second session store.
      let sessions: Session[] = []
      let sessionsError: string | null = null
      let projects: BackendProject[] = []
      try {
        // Projects are registered by the backend when a directory is opened; the
        // app only reads the list and groups threads by project_id.
        const [rows, projectRows] = await Promise.all([
          conversations.list(),
          projectApi.list().catch(() => [])
        ])
        sessions = rows.map((item) => toSession(item))
        projects = projectRows
      } catch (error) {
        sessionsError = error instanceof Error ? error.message : String(error)
      }
      set({
        info: infoResult.ok ? infoResult.data : null,
        settings,
        sessions,
        projects,
        activeSessionId: sessions[0]?.id ?? null,
        initialized: true,
        error: sessionsError
      })
      applyTheme(settings.theme)
      if (sessions[0]) await get().selectSession(sessions[0].id)
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
    if (!get().sessions.some((item) => item.id === id)) return
    const selection = ++sessionSelection
    set({ taskFocus: null })
    stopPolling()
    pending = null
    activities = []
    activityCursor = 0
    turnActive = false
    set({
      activeSessionId: id,
      messages: [],
      pendingApprovals: 0,
      hasOlderMessages: false,
      loadingOlderMessages: false,
      busy: false,
      agentStatus: 'idle',
      agentSessionId: null,
      diff: null,
      diffError: null
    })
    try {
      // Same latest-page contract as the web page: one page on open, then the
      // incremental tail while a turn runs.
      const page = await conversations.history(id)
      if (sessionSelection !== selection || get().activeSessionId !== id) return
      activities = page.live ? mergeActivities(page.items, [page.live]) : page.items
      activityCursor = page.cursor
      turnActive = page.running
      const usage = lastTurnUsage(activities)
      set({
        messages: renderActivities(id),
        hasOlderMessages: page.hasMore,
        pendingApprovals: page.pending_approvals ?? 0,
        busy: page.running,
        agentStatus: page.running ? 'streaming' : 'idle',
        ...(usage
          ? {
              contextUsage: {
                ...get().contextUsage,
                [id]: { model: get().settings.model, promptTokens: usage.promptTokens }
              }
            }
          : {})
      })
      if (page.running) pollUntilDone(id, page.live)
    } catch (error) {
      if (sessionSelection !== selection || get().activeSessionId !== id) return
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  loadOlderMessages: async () => {
    const { activeSessionId: id, hasOlderMessages, loadingOlderMessages } = get()
    const before = activities[0]?.seq
    if (!id || !before || !hasOlderMessages || loadingOlderMessages) return
    const selection = sessionSelection
    set({ loadingOlderMessages: true, error: null })
    try {
      const page = await conversations.history(id, before)
      if (sessionSelection !== selection || get().activeSessionId !== id) return
      const earlier = page.items.filter((row) => row.seq < before)
      activities = mergeActivities(activities, earlier)
      set({ messages: renderActivities(id), hasOlderMessages: page.hasMore && earlier.length > 0 })
    } catch (error) {
      if (sessionSelection !== selection || get().activeSessionId !== id) return
      set({ error: error instanceof Error ? error.message : String(error) })
    } finally {
      if (sessionSelection === selection && get().activeSessionId === id) {
        set({ loadingOlderMessages: false })
      }
    }
  },

  switchWorkspace: async (workspace) => {
    const { activeSessionId, draftWorkspace, sessions } = get()
    const current = activeSessionId ? sessions.find((row) => row.id === activeSessionId)?.workspace : draftWorkspace
    if (current !== workspace) await get().newSession(workspace)
  },

  addProject: async () => {
    const choice = await api.workspace.choose()
    if (!choice.ok) {
      set({ error: choice.error })
      return null
    }
    if (!choice.data) return null
    try {
      const project = await projectApi.register(choice.data)
      set((state) => ({ projects: [...state.projects.filter((row) => row.id !== project.id), project] }))
      return project
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      return null
    }
  },

  openProjectTask: (taskFocus) => {
    if (taskFocus.workspace !== get().settings.workspaceRoot) return
    set({ taskFocus, rightTab: 'tasks', rightOpen: true })
  },

  setProjectTaskSession: (sessionKey, sessionTitle) =>
    set((state) => ({
      taskFocus: state.taskFocus
        ? {
            ...state.taskFocus,
            sessionKey,
            sessionTitle: sessionTitle ?? translate(useI18n.getState().locale, 'panel.mainAgent')
          }
        : null
    })),

  closeProjectTask: () => set({ taskFocus: null }),

  newSession: async (workspace = '') => {
    sessionSelection++
    stopPolling()
    pending = null
    activities = []
    activityCursor = 0
    turnActive = false
    set({
      view: 'chat',
      activeSessionId: null,
      draftWorkspace: workspace,
      messages: [],
      pendingApprovals: 0,
      hasOlderMessages: false,
      loadingOlderMessages: false,
      taskFocus: null,
      agentSessionId: null,
      busy: false,
      agentStatus: 'idle',
      error: null
    })
  },

  pinSession: async (id, pinned) => {
    try {
      await conversations.pin(id, pinned)
      await refreshSessions()
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  renameSession: async (id, title) => {
    const updated = toSession(await conversations.rename(id, title))
    set((state) => ({
      sessions: state.sessions.map((row) => row.id === id
        ? { ...updated, running: row.running, pendingFirstSend: row.pendingFirstSend }
        : row)
    }))
  },

  removeSession: async (id) => {
    try {
      await conversations.remove(id)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      return false
    }
    const sessions = get().sessions.filter((session) => session.id !== id)
    set({ sessions })
    if (id === get().activeSessionId) await get().newSession()
    return true
  },

  send: async (text, attachments = []) => {
    const trimmed = text.trim()
    const { activeSessionId, draftWorkspace, busy } = get()
    if ((!trimmed && attachments.length === 0) || busy) return false

    const selection = sessionSelection
    let sessionId = activeSessionId
    const draftKey = draftKeyFor(draftWorkspace)
    let firstSession: Session | undefined
    const submitted = useDrafts.getState().drafts[draftKey]
    set({ busy: true, agentStatus: 'streaming', error: null })
    try {
      if (!sessionId) {
        const created = await conversations.create(DEFAULT_AGENT_KEY, '', draftWorkspace)
        const session = { ...toSession(created), pendingFirstSend: true }
        firstSession = session
        sessionId = session.id
        if (submitted && selection === sessionSelection) useDrafts.getState().patch(sessionId, submitted)
        set((state) => ({
          sessions: [session, ...state.sessions.filter((row) => row.id !== session.id)],
          ...(selection === sessionSelection ? { activeSessionId: session.id } : {})
        }))
        if (session.projectId && !get().projects.some((row) => row.id === session.projectId)) void refreshSessions()
      }
      if (selection === sessionSelection) {
        pending = { text: trimmed, images: attachments }
        turnActive = true
        set({ messages: renderActivities(sessionId), agentSessionId: sessionId })
      }
      const files = await uploadImages(sessionId, attachments)
      await conversations.send(sessionId, trimmed, files)
      const accepted = get().sessions.find((row) => row.id === sessionId) ?? firstSession
      if (accepted?.pendingFirstSend) {
        const session = { ...accepted, running: true, pendingFirstSend: false }
        set((state) => ({ sessions: [session, ...state.sessions.filter((row) => row.id !== session.id)] }))
        void refreshSessions()
      }
      if (selection === sessionSelection) {
        if (!activeSessionId) useDrafts.getState().patch(sessionId, { text: '', images: [] })
        pollUntilDone(sessionId)
      }
      return true
    } catch (error) {
      if (selection === sessionSelection) {
        pending = null
        turnActive = false
        set({
          busy: false,
          agentStatus: 'error',
          error: error instanceof Error ? error.message : String(error),
          messages: sessionId ? renderActivities(sessionId) : []
        })
      }
      return false
    }
  },

  cancel: async () => {
    const sessionId = get().activeSessionId
    if (!sessionId) return
    try {
      // The poller keeps running: the backend cancels the turn and flips
      // `running` to false on the next tick, keeping the stop button honest.
      await conversations.stop(sessionId)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
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
    set({ newApi: { stage: 'anonymous', authenticated: false, user: null, quota: null, subscriptions: [], token: null, accessToken: null, accessTokenError: null, models: [], verificationMethods: [], authMethods: defaultNewApiAuthMethods, externalAuth: null, error: null, updatedAt: Date.now() }, usage: null })
    return true
  },

  saveSettings: async (input) => {
    const result = await api.settings.set(input)
    if (!result.ok) {
      set({ error: result.error })
      return false
    }
    set({ settings: result.data, error: null })
    applyTheme(result.data.theme)
    await Promise.all([get().refreshWorkspace(), get().refreshGit()])
    return true
  },

  chooseWorkspace: async () => {
    const result = await api.workspace.choose()
    if (!result.ok || !result.data) return
    const path = result.data
    const saved = await get().saveSettings({
      ...settingsInput(get().settings),
      workspaceRoot: path
    })
    if (!saved) return
    // The workspace is a local editing context now, not a conversation key: the
    // Go backend conversation stays the same, and every sidebar row re-tags to
    // the new project path.
    set({ view: 'chat' })
    void refreshSessions()
  },

  refreshWorkspace: async () => {
    if (!get().settings.workspaceRoot) {
      set({ workspaceFiles: [], workspaceLoading: false })
      return
    }
    set({ workspaceLoading: true })
    const result = await api.workspace.list()
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
    const result = await api.git.status()
    set({ git: result.ok ? result.data : null, gitError: result.ok ? null : result.error })
  },

  openDiff: async (filePath) => {
    set({ rightTab: 'diff', rightOpen: true, diffLoading: true, diffError: null, diff: null })
    const result = await api.git.diff({ path: filePath })
    set({
      diff: result.ok ? result.data : null,
      diffError: result.ok ? null : result.error,
      diffLoading: false
    })
  },

  setRightTab: (rightTab) => set({ rightTab, rightOpen: true, panelLauncher: false }),
  setPanelWidth: (width) => {
    const bounded = Math.round(Math.min(720, Math.max(280, width)))
    localStorage.setItem('vexnar.panel-width', String(bounded))
    set({ panelWidth: bounded })
  },
  toggleRight: () =>
    set((state) => ({ rightOpen: !state.rightOpen, panelLauncher: !state.rightOpen })),
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
