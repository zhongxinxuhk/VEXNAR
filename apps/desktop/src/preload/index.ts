import { contextBridge, ipcRenderer } from 'electron'
import type { VexnarApi, Unsubscribe } from '@shared/api'
import type {
  AgentEvent,
  AgentSendInput,
  BackendLoginInput,
  BackendRequestInput,
  IdInput,
  IpcResult,
  MessageAppendInput,
  SessionCreateInput,
  SessionRenameInput,
  SettingsInput,
  TerminalCreateInput,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalResizeInput,
  TerminalWriteInput,
  WorkspaceListInput
} from '@shared/contracts'
import { IPC } from '@shared/contracts'

function invoke<T>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, payload) as Promise<IpcResult<T>>
}

function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  const handler = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: VexnarApi = {
  app: {
    info: () => invoke(IPC.appInfo)
  },
  settings: {
    get: () => invoke(IPC.settingsGet),
    set: (input: SettingsInput) => invoke(IPC.settingsSet, input)
  },
  sessions: {
    list: () => invoke(IPC.sessionsList),
    create: (input: SessionCreateInput) => invoke(IPC.sessionsCreate, input),
    rename: (input: SessionRenameInput) => invoke(IPC.sessionsRename, input),
    remove: (input: IdInput) => invoke(IPC.sessionsRemove, input)
  },
  messages: {
    list: (input: IdInput) => invoke(IPC.messagesList, input),
    append: (input: MessageAppendInput) => invoke(IPC.messagesAppend, input)
  },
  workspace: {
    list: (input?: WorkspaceListInput) => invoke(IPC.workspaceList, input),
    read: (input: { path: string }) => invoke(IPC.workspaceRead, input),
    choose: () => invoke(IPC.workspaceChoose)
  },
  git: {
    status: () => invoke(IPC.gitStatus),
    diff: (input: { path: string }) => invoke(IPC.gitDiff, input)
  },
  terminal: {
    create: (input: TerminalCreateInput) => invoke(IPC.terminalCreate, input),
    write: (input: TerminalWriteInput) => invoke(IPC.terminalWrite, input),
    resize: (input: TerminalResizeInput) => invoke(IPC.terminalResize, input),
    dispose: (input: IdInput) => invoke(IPC.terminalDispose, input),
    onData: (listener: (event: TerminalDataEvent) => void) => subscribe(IPC.terminalData, listener),
    onExit: (listener: (event: TerminalExitEvent) => void) => subscribe(IPC.terminalExit, listener)
  },
  agent: {
    send: (input: AgentSendInput) => invoke(IPC.agentSend, input),
    cancel: () => invoke(IPC.agentCancel),
    onEvent: (listener: (event: AgentEvent) => void) => subscribe(IPC.agentEvent, listener)
  },
  backend: {
    status: () => invoke(IPC.backendStatus),
    login: (input: BackendLoginInput) => invoke(IPC.backendLogin, input),
    logout: () => invoke(IPC.backendLogout),
    request: <T = unknown>(input: BackendRequestInput) => invoke<T>(IPC.backendRequest, input)
  }
}

contextBridge.exposeInMainWorld('vexnar', api)
