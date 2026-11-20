// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { contextBridge, ipcRenderer } from 'electron'
import type { VexnarApi, Unsubscribe } from '@shared/api'
import type {
  AgentEvent,
  AgentSendInput,
  BackendRequestInput,
  IdInput,
  IpcResult,
  MessageAppendInput,
  NewApiExternalAuthInput,
  NewApiLoginInput,
  NewApiState,
  NewApiVerifyInput,
  SessionCreateInput,
  SessionPinInput,
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
    info: () => invoke(IPC.appInfo),
    copyText: (text: string) => invoke(IPC.appCopyText, text)
  },
  settings: {
    get: () => invoke(IPC.settingsGet),
    set: (input: SettingsInput) => invoke(IPC.settingsSet, input)
  },
  sessions: {
    list: () => invoke(IPC.sessionsList),
    create: (input: SessionCreateInput) => invoke(IPC.sessionsCreate, input),
    rename: (input: SessionRenameInput) => invoke(IPC.sessionsRename, input),
    pin: (input: SessionPinInput) => invoke(IPC.sessionsPin, input),
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
    request: <T = unknown>(input: BackendRequestInput) => invoke<T>(IPC.backendRequest, input)
  },
  newapi: {
    status: () => invoke(IPC.newapiStatus),
    bootstrap: () => invoke(IPC.newapiBootstrap),
    login: (input: NewApiLoginInput) => invoke(IPC.newapiLogin, input),
    verify: (input: NewApiVerifyInput) => invoke(IPC.newapiVerify, input),
    cancelLogin: () => invoke(IPC.newapiCancelLogin),
    externalAuth: (input: NewApiExternalAuthInput) =>
      invoke(IPC.newapiExternalAuth, input),
    cancelExternalAuth: () => invoke(IPC.newapiCancelExternalAuth),
    authMethods: () => invoke(IPC.newapiAuthMethods),
    refresh: () => invoke(IPC.newapiRefresh),
    logout: () => invoke(IPC.newapiLogout),
    copyKey: () => invoke(IPC.newapiCopyKey),
    openPlatform: () => invoke(IPC.newapiOpenPlatform),
    onChange: (listener: (state: NewApiState) => void) =>
      subscribe(IPC.newapiChanged, listener)
  }
}

contextBridge.exposeInMainWorld('vexnar', api)
