import { z } from 'zod'

export const themeSchema = z.enum(['dark', 'light', 'system'])
export type Theme = z.infer<typeof themeSchema>

export const avatarColorSchema = z.enum(['orange', 'blue', 'green', 'purple', 'rose', 'slate'])
export type AvatarColor = z.infer<typeof avatarColorSchema>

export const settingsSchema = z.object({
  theme: themeSchema.default('light'),
  displayName: z.string().trim().max(80).default(''),
  avatarColor: avatarColorSchema.default('orange'),
  workspaceRoot: z.string().default(''),
  shell: z.string().default(''),
  model: z.string().trim().min(1).max(120).default('gpt-5-codex'),
  newApiModels: z.array(z.string().trim().min(1).max(200)).max(500).default([]),
  baseUrl: z.string().default(''),
  apiKey: z.string().max(4096).optional(),
  clearApiKey: z.boolean().optional()
})
export type SettingsInput = z.infer<typeof settingsSchema>

export const publicSettingsSchema = settingsSchema
  .omit({ apiKey: true, clearApiKey: true })
  .extend({ hasApiKey: z.boolean() })
export type PublicSettings = z.infer<typeof publicSettingsSchema>

export const newApiUserSchema = z.object({
  id: z.number().int(),
  username: z.string().default(''),
  displayName: z.string().default(''),
  email: z.string().default(''),
  group: z.string().default(''),
  role: z.number().int().default(0)
})
export type NewApiUser = z.infer<typeof newApiUserSchema>

export const newApiTokenSchema = z.object({
  id: z.number().int(),
  name: z.string().default('App-managed'),
  maskedKey: z.string().default(''),
  unlimitedQuota: z.boolean().default(false),
  remainQuota: z.number().default(0),
  usedQuota: z.number().default(0)
})
export type NewApiToken = z.infer<typeof newApiTokenSchema>

export const newApiQuotaSchema = z.object({
  remaining: z.number(),
  used: z.number(),
  requestCount: z.number(),
  quotaPerUnit: z.number().positive().default(500000),
  usdExchangeRate: z.number().positive().default(1),
  displayInCurrency: z.boolean().default(true),
  unlimited: z.boolean().default(false)
})
export type NewApiQuota = z.infer<typeof newApiQuotaSchema>

export const newApiAuthProviderSchema = z.object({
  key: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  icon: z.string().max(200).default(''),
  kind: z.enum(['oauth', 'oidc', 'telegram', 'wechat']).default('oauth')
})
export type NewApiAuthProvider = z.infer<typeof newApiAuthProviderSchema>

export const newApiAuthMethodsSchema = z.object({
  passwordLogin: z.boolean().default(true),
  passwordRegister: z.boolean().default(false),
  register: z.boolean().default(false),
  emailVerification: z.boolean().default(false),
  passkeyLogin: z.boolean().default(false),
  providers: z.array(newApiAuthProviderSchema).default([])
})
export type NewApiAuthMethods = z.infer<typeof newApiAuthMethodsSchema>

export const defaultNewApiAuthMethods: NewApiAuthMethods = {
  passwordLogin: true,
  passwordRegister: false,
  register: false,
  emailVerification: false,
  passkeyLogin: false,
  providers: []
}

export const newApiExternalAuthSchema = z
  .object({
    kind: z.enum(['oauth', 'passkey', 'register']),
    provider: z.string().trim().min(1).max(120).optional()
  })
  .superRefine((value, context) => {
    if (value.kind === 'oauth' && !value.provider) {
      context.addIssue({
        code: 'custom',
        path: ['provider'],
        message: '请选择第三方登录方式'
      })
    }
  })
export type NewApiExternalAuthInput = z.infer<typeof newApiExternalAuthSchema>

export const newApiStateSchema = z.object({
  stage: z.enum(['checking', 'anonymous', 'authenticating', 'verification', 'ready', 'error']),
  authenticated: z.boolean(),
  user: newApiUserSchema.nullable().default(null),
  quota: newApiQuotaSchema.nullable().default(null),
  token: newApiTokenSchema.nullable().default(null),
  models: z.array(z.string()).default([]),
  verificationMethods: z.array(z.string()).default([]),
  authMethods: newApiAuthMethodsSchema.default(defaultNewApiAuthMethods),
  externalAuth: z
    .object({
      kind: z.enum(['oauth', 'passkey', 'register']),
      label: z.string().min(1).max(200),
      provider: z.string().nullable().default(null)
    })
    .nullable()
    .default(null),
  error: z.string().nullable().default(null),
  updatedAt: z.number().nullable().default(null)
})
export type NewApiState = z.infer<typeof newApiStateSchema>

export const newApiLoginSchema = z.object({
  username: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(4096)
})
export type NewApiLoginInput = z.infer<typeof newApiLoginSchema>

export const newApiVerifySchema = z.object({
  code: z.string().trim().min(1).max(64)
})
export type NewApiVerifyInput = z.infer<typeof newApiVerifySchema>

export const sessionCreateSchema = z.object({
  title: z.string().trim().min(1).max(120).default('New chat'),
  workspace: z.string().default('')
})
export type SessionCreateInput = z.infer<typeof sessionCreateSchema>

export const sessionRenameSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120)
})
export type SessionRenameInput = z.infer<typeof sessionRenameSchema>

export const sessionPinSchema = z.object({
  id: z.string().min(1),
  pinned: z.boolean()
})
export type SessionPinInput = z.infer<typeof sessionPinSchema>

export const idSchema = z.object({ id: z.string().min(1) })
export type IdInput = z.infer<typeof idSchema>

export const messageAppendSchema = z.object({
  sessionId: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string().min(1).max(200_000)
})
export type MessageAppendInput = z.infer<typeof messageAppendSchema>

export const workspaceListSchema = z.object({
  path: z.string().optional()
})
export type WorkspaceListInput = z.infer<typeof workspaceListSchema>

export const fileReadSchema = z.object({
  path: z.string().min(1)
})
export type FileReadInput = z.infer<typeof fileReadSchema>

export const gitDiffSchema = z.object({
  path: z.string().min(1)
})
export type GitDiffInput = z.infer<typeof gitDiffSchema>

export const terminalCreateSchema = z.object({
  cwd: z.string().optional(),
  cols: z.number().int().min(2).max(500).default(100),
  rows: z.number().int().min(2).max(300).default(28)
})
export type TerminalCreateInput = z.infer<typeof terminalCreateSchema>

export const terminalWriteSchema = z.object({
  id: z.string().min(1),
  data: z.string().max(100_000)
})
export type TerminalWriteInput = z.infer<typeof terminalWriteSchema>

export const terminalResizeSchema = z.object({
  id: z.string().min(1),
  cols: z.number().int().min(2).max(500),
  rows: z.number().int().min(2).max(300)
})
export type TerminalResizeInput = z.infer<typeof terminalResizeSchema>

export const agentSendSchema = z.object({
  sessionId: z.string().min(1),
  text: z.string().trim().min(1).max(20_000)
})
export type AgentSendInput = z.infer<typeof agentSendSchema>

export const backendRequestSchema = z.object({
  path: z.string().min(1).max(4000).regex(/^\//, '路径必须以 / 开头'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  body: z.unknown().optional()
})
export type BackendRequestInput = z.infer<typeof backendRequestSchema>

export type BackendStatus = {
  connected: boolean
  version?: string
  service?: string
  error?: string
}

export const emptySchema = z.undefined().or(z.null()).optional()

export const copyTextSchema = z.string().min(1).max(20_000)

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

export type Session = {
  id: string
  title: string
  workspace: string
  pinned: boolean
  createdAt: number
  updatedAt: number
}

export type Message = {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  createdAt: number
}

export type AppInfo = {
  version: string
  platform: string
  arch: string
  userData: string
}

export type FileNode = {
  name: string
  path: string
  type: 'file' | 'dir'
  depth: number
}

export type GitFile = {
  path: string
  index: string
  working: string
}

export type GitStatus = {
  branch: string
  ahead: number
  behind: number
  files: GitFile[]
}

export type DiffPayload = {
  path: string
  original: string
  modified: string
  language: string
}

export type TerminalDataEvent = { id: string; data: string }
export type TerminalExitEvent = { id: string; exitCode: number; signal?: number }

export const agentEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('assistant_delta'), text: z.string() }),
  z.object({ type: z.literal('assistant_done') }),
  z.object({
    type: z.literal('tool_start'),
    id: z.string(),
    name: z.string(),
    input: z.unknown().optional()
  }),
  z.object({
    type: z.literal('tool_end'),
    id: z.string(),
    name: z.string(),
    ok: z.boolean(),
    output: z.string().optional()
  }),
  z.object({ type: z.literal('error'), message: z.string() })
])
export type AgentEvent = z.infer<typeof agentEventSchema>

export const IPC = {
  appInfo: 'app:info',
  appCopyText: 'app:copy-text',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  sessionsList: 'sessions:list',
  sessionsCreate: 'sessions:create',
  sessionsRename: 'sessions:rename',
  sessionsPin: 'sessions:pin',
  sessionsRemove: 'sessions:remove',
  messagesList: 'messages:list',
  messagesAppend: 'messages:append',
  workspaceList: 'workspace:list',
  workspaceRead: 'workspace:read',
  workspaceChoose: 'workspace:choose',
  gitStatus: 'git:status',
  gitDiff: 'git:diff',
  terminalCreate: 'terminal:create',
  terminalWrite: 'terminal:write',
  terminalResize: 'terminal:resize',
  terminalDispose: 'terminal:dispose',
  terminalData: 'terminal:data',
  terminalExit: 'terminal:exit',
  agentSend: 'agent:send',
  agentCancel: 'agent:cancel',
  agentEvent: 'agent:event',
  backendStatus: 'backend:status',
  backendRequest: 'backend:request',
  newapiStatus: 'newapi:status',
  newapiBootstrap: 'newapi:bootstrap',
  newapiLogin: 'newapi:login',
  newapiVerify: 'newapi:verify',
  newapiCancelLogin: 'newapi:cancel-login',
  newapiExternalAuth: 'newapi:external-auth',
  newapiCancelExternalAuth: 'newapi:cancel-external-auth',
  newapiAuthMethods: 'newapi:auth-methods',
  newapiRefresh: 'newapi:refresh',
  newapiLogout: 'newapi:logout',
  newapiCopyKey: 'newapi:copy-key',
  newapiOpenPlatform: 'newapi:open-platform',
  newapiChanged: 'newapi:changed'
} as const
