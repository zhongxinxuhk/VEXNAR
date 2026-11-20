import { safeStorage } from 'electron'
import os from 'node:os'
import { readSetting, writeSetting } from './db'
import { defaultWorkspace } from './paths'
import {
  publicSettingsSchema,
  settingsSchema,
  type PublicSettings,
  type SettingsInput
} from '@shared/contracts'

const SETTINGS_KEY = 'desktop'

type StoredSettings = {
  theme: 'dark' | 'light' | 'system'
  displayName: string
  avatarColor: 'orange' | 'blue' | 'green' | 'purple' | 'rose' | 'slate'
  workspaceRoot: string
  shell: string
  model: string
  newApiModels: string[]
  baseUrl: string
  apiKeyCipher?: string
}

function defaultDisplayName(): string {
  try {
    return os.userInfo().username || 'VEXNAR'
  } catch {
    return 'VEXNAR'
  }
}

const defaults: StoredSettings = {
  theme: 'light',
  displayName: defaultDisplayName(),
  avatarColor: 'orange',
  workspaceRoot: defaultWorkspace(),
  shell: '',
  model: 'gpt-5-codex',
  newApiModels: [],
  baseUrl: ''
}

let cache: StoredSettings = { ...defaults }

async function readStored(): Promise<StoredSettings> {
  const raw = await readSetting(SETTINGS_KEY)
  if (!raw) return { ...defaults }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSettings>
    const merged = { ...defaults, ...parsed }
    const validated = settingsSchema.omit({ apiKey: true, clearApiKey: true }).parse(merged)
    return {
      ...validated,
      apiKeyCipher: parsed.apiKeyCipher
    }
  } catch {
    return { ...defaults }
  }
}

async function writeStored(value: StoredSettings): Promise<void> {
  await writeSetting(SETTINGS_KEY, JSON.stringify(value))
}

function encryptSecret(value: string, label: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(`当前系统不支持安全存储，无法保存 ${label}`)
  }
  return `enc:${safeStorage.encryptString(value).toString('base64')}`
}

function decryptSecret(cipher: string | undefined): string {
  if (!cipher) return ''
  if (!cipher.startsWith('enc:')) return ''
  try {
    return safeStorage.decryptString(Buffer.from(cipher.slice(4), 'base64'))
  } catch {
    return ''
  }
}

function toPublic(stored: StoredSettings): PublicSettings {
  return publicSettingsSchema.parse({
    theme: stored.theme,
    displayName: stored.displayName,
    avatarColor: stored.avatarColor,
    workspaceRoot: stored.workspaceRoot,
    shell: stored.shell,
    model: stored.model,
    newApiModels: stored.newApiModels,
    baseUrl: stored.baseUrl,
    hasApiKey: Boolean(stored.apiKeyCipher)
  })
}

/** Load once after PostgreSQL is ready; synchronous reads then use the cache. */
export async function loadSettings(): Promise<void> {
  cache = await readStored()
}

export function getSettings(): PublicSettings {
  return toPublic(cache)
}

export async function setSettings(input: SettingsInput): Promise<PublicSettings> {
  const parsed = settingsSchema.parse(input)
  const stored = { ...cache }
  stored.theme = parsed.theme
  stored.displayName = parsed.displayName.trim() || defaults.displayName
  stored.avatarColor = parsed.avatarColor
  stored.workspaceRoot = parsed.workspaceRoot.trim()
  stored.shell = parsed.shell.trim()
  stored.model = parsed.model.trim()
  stored.newApiModels = parsed.newApiModels
  stored.baseUrl = parsed.baseUrl.trim()

  if (parsed.clearApiKey) {
    delete stored.apiKeyCipher
  } else if (parsed.apiKey && parsed.apiKey.trim()) {
    stored.apiKeyCipher = encryptSecret(parsed.apiKey.trim(), 'API Key')
  }

  await writeStored(stored)
  cache = stored
  return toPublic(stored)
}

export function getAgentConfig(): { model: string; baseUrl: string; apiKey: string } {
  return {
    model: cache.model,
    baseUrl: cache.baseUrl,
    apiKey: decryptSecret(cache.apiKeyCipher)
  }
}

export type ManagedConnection = {
  baseUrl: string
  apiKey: string
  model: string
  models: string[]
}

/**
 * Persist the NewAPI-derived runtime config. The raw key never leaves the main
 * process: only its encrypted ciphertext is written to PostgreSQL.
 */
export async function applyManagedConnection(input: ManagedConnection): Promise<PublicSettings> {
  const models = Array.from(new Set(input.models.map((item) => item.trim()).filter(Boolean)))
  const model = input.model.trim()
  const baseUrl = input.baseUrl.trim()
  const apiKey = input.apiKey.trim()
  if (!baseUrl || !model || !apiKey) {
    throw new Error('NewAPI 连接配置不完整')
  }

  const stored = { ...cache }
  const currentKey = decryptSecret(stored.apiKeyCipher)
  const sameModels =
    stored.newApiModels.length === models.length &&
    stored.newApiModels.every((item, index) => item === models[index])
  if (
    stored.baseUrl === baseUrl &&
    currentKey === apiKey &&
    stored.model === model &&
    sameModels
  ) {
    return toPublic(stored)
  }

  stored.baseUrl = baseUrl
  stored.apiKeyCipher = encryptSecret(apiKey, 'API Key')
  stored.model = model
  stored.newApiModels = models
  await writeStored(stored)
  cache = stored
  return toPublic(stored)
}

/** Remove only the relay connection; local chats, workspaces and profile stay intact. */
export async function clearManagedConnection(): Promise<PublicSettings> {
  const stored = { ...cache }
  delete stored.apiKeyCipher
  stored.baseUrl = ''
  stored.newApiModels = []
  await writeStored(stored)
  cache = stored
  return toPublic(stored)
}
