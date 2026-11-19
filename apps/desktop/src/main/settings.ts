import { safeStorage } from 'electron'
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
  workspaceRoot: string
  shell: string
  model: string
  baseUrl: string
  backendUrl: string
  apiKeyCipher?: string
  backendTokenCipher?: string
}

const defaults: StoredSettings = {
  theme: 'dark',
  workspaceRoot: defaultWorkspace(),
  shell: '',
  model: 'gpt-5-codex',
  baseUrl: '',
  backendUrl: 'http://127.0.0.1:8787'
}

let cache: StoredSettings = { ...defaults }

async function readStored(): Promise<StoredSettings> {
  const raw = await readSetting(SETTINGS_KEY)
  if (!raw) return { ...defaults }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSettings>
    const merged = { ...defaults, ...parsed }
    const validated = settingsSchema
      .omit({ apiKey: true, clearApiKey: true, backendToken: true, clearBackendToken: true })
      .parse(merged)
    return {
      ...validated,
      apiKeyCipher: parsed.apiKeyCipher,
      backendTokenCipher: parsed.backendTokenCipher
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
    workspaceRoot: stored.workspaceRoot,
    shell: stored.shell,
    model: stored.model,
    baseUrl: stored.baseUrl,
    backendUrl: stored.backendUrl,
    hasApiKey: Boolean(stored.apiKeyCipher),
    hasBackendToken: Boolean(stored.backendTokenCipher)
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
  stored.workspaceRoot = parsed.workspaceRoot.trim()
  stored.shell = parsed.shell.trim()
  stored.model = parsed.model.trim()
  stored.baseUrl = parsed.baseUrl.trim()
  stored.backendUrl = parsed.backendUrl.trim() || defaults.backendUrl

  if (parsed.clearApiKey) {
    delete stored.apiKeyCipher
  } else if (parsed.apiKey && parsed.apiKey.trim()) {
    stored.apiKeyCipher = encryptSecret(parsed.apiKey.trim(), 'API Key')
  }

  if (parsed.clearBackendToken) {
    delete stored.backendTokenCipher
  } else if (parsed.backendToken && parsed.backendToken.trim()) {
    stored.backendTokenCipher = encryptSecret(parsed.backendToken.trim(), '后端 Token')
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

export function getBackendConfig(): { baseUrl: string; token: string } {
  return {
    baseUrl: cache.backendUrl || defaults.backendUrl,
    token: decryptSecret(cache.backendTokenCipher)
  }
}

export async function setBackendSession(baseUrl: string, token: string): Promise<void> {
  const stored = { ...cache }
  stored.backendUrl = baseUrl.trim() || defaults.backendUrl
  if (token.trim()) stored.backendTokenCipher = encryptSecret(token.trim(), '后端 Token')
  await writeStored(stored)
  cache = stored
}

export async function clearBackendSession(): Promise<void> {
  const stored = { ...cache }
  delete stored.backendTokenCipher
  await writeStored(stored)
  cache = stored
}
