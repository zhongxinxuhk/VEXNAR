// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import type {
  AgentEvent,
  AgentSendInput,
  AppInfo,
  BackendRequestInput,
  BackendStatus,
  DiffPayload,
  FileNode,
  GitDiffInput,
  GitStatus,
  IdInput,
  IpcResult,
  Message,
  MessageAppendInput,
  NewApiExternalAuthInput,
  NewApiLoginInput,
  NewApiState,
  NewApiVerifyInput,
  PublicSettings,
  Session,
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
} from './contracts'

export type Unsubscribe = () => void

export interface VexnarApi {
  app: {
    info: () => Promise<IpcResult<AppInfo>>
    copyText: (text: string) => Promise<IpcResult<{ copied: true }>>
  }
  settings: {
    get: () => Promise<IpcResult<PublicSettings>>
    set: (input: SettingsInput) => Promise<IpcResult<PublicSettings>>
  }
  sessions: {
    list: () => Promise<IpcResult<Session[]>>
    create: (input: SessionCreateInput) => Promise<IpcResult<Session>>
    rename: (input: SessionRenameInput) => Promise<IpcResult<Session>>
    pin: (input: SessionPinInput) => Promise<IpcResult<Session>>
    remove: (input: IdInput) => Promise<IpcResult<{ removed: true }>>
  }
  messages: {
    list: (input: IdInput) => Promise<IpcResult<Message[]>>
    append: (input: MessageAppendInput) => Promise<IpcResult<Message>>
  }
  workspace: {
    list: (input?: WorkspaceListInput) => Promise<IpcResult<FileNode[]>>
    read: (input: { path: string }) => Promise<IpcResult<{ path: string; content: string }>>
    choose: () => Promise<IpcResult<string | null>>
  }
  git: {
    status: () => Promise<IpcResult<GitStatus>>
    diff: (input: GitDiffInput) => Promise<IpcResult<DiffPayload>>
  }
  terminal: {
    create: (input: TerminalCreateInput) => Promise<IpcResult<{ id: string }>>
    write: (input: TerminalWriteInput) => Promise<IpcResult<{ written: true }>>
    resize: (input: TerminalResizeInput) => Promise<IpcResult<{ resized: true }>>
    dispose: (input: IdInput) => Promise<IpcResult<{ disposed: true }>>
    onData: (listener: (event: TerminalDataEvent) => void) => Unsubscribe
    onExit: (listener: (event: TerminalExitEvent) => void) => Unsubscribe
  }
  agent: {
    send: (input: AgentSendInput) => Promise<IpcResult<{ accepted: true }>>
    cancel: () => Promise<IpcResult<{ cancelled: true }>>
    onEvent: (listener: (event: AgentEvent) => void) => Unsubscribe
  }
  backend: {
    status: () => Promise<IpcResult<BackendStatus>>
    request: <T = unknown>(input: BackendRequestInput) => Promise<IpcResult<T>>
  }
  newapi: {
    status: () => Promise<IpcResult<NewApiState>>
    bootstrap: () => Promise<IpcResult<NewApiState>>
    login: (input: NewApiLoginInput) => Promise<IpcResult<NewApiState>>
    verify: (input: NewApiVerifyInput) => Promise<IpcResult<NewApiState>>
    cancelLogin: () => Promise<IpcResult<NewApiState>>
    externalAuth: (input: NewApiExternalAuthInput) => Promise<IpcResult<NewApiState>>
    cancelExternalAuth: () => Promise<IpcResult<NewApiState>>
    authMethods: () => Promise<IpcResult<NewApiState>>
    refresh: () => Promise<IpcResult<NewApiState>>
    logout: () => Promise<IpcResult<{ loggedOut: true }>>
    copyKey: () => Promise<IpcResult<{ copied: true }>>
    openPlatform: () => Promise<IpcResult<{ opened: true }>>
    onChange: (listener: (state: NewApiState) => void) => Unsubscribe
  }
}
