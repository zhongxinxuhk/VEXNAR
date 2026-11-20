// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  app,
  clipboard,
  ipcMain,
  nativeImage,
  type BrowserWindow
} from 'electron'
import { z } from 'zod'
import {
  agentSendSchema,
  backendRequestSchema,
  copyTextSchema,
  fileReadSchema,
  gitDiffSchema,
  idSchema,
  IPC,
  messageAppendSchema,
  newApiExternalAuthSchema,
  newApiLoginSchema,
  newApiVerifySchema,
  sessionCreateSchema,
  sessionPinSchema,
  sessionRenameSchema,
  settingsSchema,
  terminalCreateSchema,
  terminalResizeSchema,
  terminalWriteSchema,
  workspaceListSchema,
  type ImageAttachment,
  type IpcResult
} from '@shared/contracts'
import type { UpdateManager } from './updates'
import { AgentManager } from './agent'
import type { BackendManager } from './backend'
import {
  appendMessage,
  createSession,
  listMessages,
  listSessions,
  removeSession,
  renameSession,
  setSessionPinned
} from './db'
import { createChatWorktree, gitBranches, gitDiff, gitStatus } from './git'
import { NewApiManager } from './newapi'
import { getSettings, setSettings } from './settings'
import { TerminalManager } from './terminal'
import { chooseWorkspace, listWorkspace, readWorkspaceFile } from './workspace'

type Services = {
  updates: UpdateManager
  agent: AgentManager
  backend: BackendManager
  terminal: TerminalManager
  newapi: NewApiManager
  getWindow: () => BrowserWindow | null
}

function validateImages(images: ImageAttachment[] = []): void {
  for (const image of images) {
    const decoded = nativeImage.createFromDataURL(image.dataUrl)
    const size = decoded.getSize()
    if (decoded.isEmpty() || size.width > 16384 || size.height > 16384)
      throw new Error('图片无效或尺寸超过 16384 像素')
  }
}

function failure(error: unknown): IpcResult<never> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error)
  }
}

function handle<Input, Output>(
  channel: string,
  schema: z.ZodType<Input>,
  fn: (input: Input) => Output | Promise<Output>
): void {
  ipcMain.handle(channel, async (_event, raw): Promise<IpcResult<Output>> => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? '参数无效' }
    }
    try {
      return { ok: true, data: await fn(parsed.data) }
    } catch (error) {
      return failure(error)
    }
  })
}

export function registerIpc(services: Services): void {
  const noInput = z.undefined().or(z.null()).optional()

  handle(IPC.updateStatus, noInput, () => services.updates.status())
  handle(IPC.updateCheck, noInput, () => services.updates.check())
  handle(IPC.updateDownload, noInput, () => services.updates.download())
  handle(IPC.updateInstall, noInput, () => services.updates.install())

  handle(IPC.appInfo, noInput, () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    userData: app.getPath('userData')
  }))
  handle(IPC.appCopyText, copyTextSchema, (text) => {
    clipboard.writeText(text)
    return { copied: true as const }
  })

  handle(IPC.settingsGet, noInput, () => getSettings())
  handle(IPC.settingsSet, settingsSchema, async (input) => {
    if (input.model !== getSettings().model)
      await services.backend.syncModel(input.model)
    const settings = await setSettings(input)
    await services.agent.reconfigure()
    return settings
  })

  handle(IPC.sessionsList, noInput, () => listSessions())
  handle(IPC.sessionsCreate, sessionCreateSchema, (input) =>
    createSession({
      title: input.title,
      workspace: input.workspace || getSettings().workspaceRoot
    })
  )
  handle(IPC.sessionsRename, sessionRenameSchema, (input) =>
    renameSession(input.id, input.title)
  )
  handle(IPC.sessionsPin, sessionPinSchema, (input) =>
    setSessionPinned(input.id, input.pinned)
  )
  handle(IPC.sessionsRemove, idSchema, async (input) => {
    await removeSession(input.id)
    return { removed: true as const }
  })

  handle(IPC.messagesList, idSchema, (input) => listMessages(input.id))
  handle(IPC.messagesAppend, messageAppendSchema, (input) => {
    validateImages(input.attachments)
    return appendMessage(input)
  })

  handle(IPC.workspaceList, workspaceListSchema.optional(), (input) =>
    listWorkspace(input ?? {})
  )
  handle(IPC.workspaceRead, fileReadSchema, (input) =>
    readWorkspaceFile(input.path)
  )
  handle(IPC.workspaceChoose, noInput, () => chooseWorkspace())

  handle(IPC.gitBranches, noInput, gitBranches)
  handle(IPC.gitWorktree, z.object({ sessionId: z.string().min(1), branch: z.string().min(1).max(255) }), async ({ sessionId, branch }) => {
    if (services.agent.isBusy() || services.updates.status().phase === 'installing') throw new Error('当前无法创建工作树')
    const session = (await listSessions()).find((entry) => entry.id === sessionId)
    if (!session) throw new Error('会话不存在')
    return createChatWorktree(session.workspace, branch)
  })
  handle(IPC.gitStatus, noInput, () => gitStatus())
  handle(IPC.gitDiff, gitDiffSchema, (input) => gitDiff(input.path))

  handle(IPC.terminalCreate, terminalCreateSchema, (input) =>
    services.terminal.create(input)
  )
  handle(IPC.terminalWrite, terminalWriteSchema, (input) => {
    services.terminal.write(input.id, input.data)
    return { written: true as const }
  })
  handle(IPC.terminalResize, terminalResizeSchema, (input) => {
    services.terminal.resize(input.id, input.cols, input.rows)
    return { resized: true as const }
  })
  handle(IPC.terminalDispose, idSchema, (input) => {
    services.terminal.dispose(input.id)
    return { disposed: true as const }
  })

  handle(IPC.agentSend, agentSendSchema, (input) => {
    validateImages(input.attachments)
    if (services.updates.status().phase === 'installing')
      throw new Error('应用正在安装更新，请等待重启。')
    return services.agent.send(input)
  })
  handle(IPC.agentCancel, noInput, () => services.agent.cancel())

  handle(IPC.backendStatus, noInput, () => services.backend.status())
  handle(IPC.backendRequest, backendRequestSchema, (input) => {
    if (
      input.method !== 'GET' &&
      services.updates.status().phase === 'installing'
    ) {
      throw new Error('应用正在安装更新，请等待重启。')
    }
    return services.backend.request(input)
  })

  handle(IPC.newapiStatus, noInput, () => services.newapi.getState())
  handle(IPC.newapiBootstrap, noInput, () => services.newapi.bootstrap())
  handle(IPC.newapiLogin, newApiLoginSchema, (input) =>
    services.newapi.login(input)
  )
  handle(IPC.newapiVerify, newApiVerifySchema, (input) =>
    services.newapi.verify(input)
  )
  handle(IPC.newapiCancelLogin, noInput, () => services.newapi.cancelLogin())
  handle(IPC.newapiExternalAuth, newApiExternalAuthSchema, (input) =>
    services.newapi.startExternalAuth(input)
  )
  handle(IPC.newapiCancelExternalAuth, noInput, () =>
    services.newapi.cancelExternalAuth()
  )
  handle(IPC.newapiAuthMethods, noInput, () =>
    services.newapi.refreshAuthMethods()
  )
  handle(IPC.newapiRefresh, noInput, () => services.newapi.refresh())
  handle(IPC.newapiLogout, noInput, () => services.newapi.logout())
  handle(IPC.newapiCopyKey, noInput, () => services.newapi.copyKey())
  handle(IPC.newapiOpenPlatform, noInput, () => services.newapi.openPlatform())
  handle(IPC.newapiUsage, noInput, () => services.newapi.usage())
}
