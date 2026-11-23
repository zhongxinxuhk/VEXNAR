// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * VEXNAR 平台账号：登录、令牌、模型提供方。
 *
 * 这一层完全在 TS 侧完成，不再调用 Go 的 `/api/desktop/vexnar/*`。原先那套接口
 * 一旦运行中的 Go 是旧构建，就返回纯文本 `404 page not found`，`response.json()`
 * 直接把 V8 的解析错误抛到登录页上——用户看到的 "Unexpected non-whitespace
 * character after JSON at position 4" 就是这么来的。账号属于客户端自己的状态，
 * 不该由另一个进程的部署版本决定它能不能登录。
 *
 * 落盘一份 0600 的 `vexnar-account.json`（默认在 VEXNAR_HOME 下）。密钥另外由
 * platform.js 写进 dsh 凭据库，供 llm-pi-ai 按请求解析；本文件只负责状态的真相。
 */

import { randomBytes, randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { AccountWallet } from './wallet-types.js'

const SESSION_DAYS = 30
const CREDENTIAL_VERSION = 1
const DEFAULT_PLATFORM = 'https://platform.sec.hn.cn'
const DEFAULT_API = 'https://api.sec.hn.cn'
const DEEPSEEK_BASE = 'https://api.deepseek.com'
const REQUEST_TIMEOUT_MS = 20_000
const modelInputTypes = new Set(['text', 'image'])
const reasoningLevels = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
const managedName = /^VERNAX-[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i

/**
 * 账号层的数据形状。
 *
 * 三套形状刻意不同，别合并：
 *   - `Account` / `AccountProvider` 是落盘状态，**带**密钥，只在宿主内流转；
 *   - `AccountView` / `ProviderView` 是给浏览器的视图，密钥只留下一个布尔；
 *   - `ProviderModel` 是模型目录里的一个条目，`name` 只有和 `id` 不同时才写。
 */

/** 重试策略只有两档，见 `normalizeRetry`。 */
export type RetryPolicy = 'normal' | 'always'

/** 账号与模型页的目录条目，由宿主转换成 llm-pi-ai 的模型配置。 */
export interface ProviderModel {
  id: string
  name?: string
  /** 该模型接受的输入类型（`text` / `image`）；缺省时由适配器决定。 */
  inputTypes?: string[] | undefined
  /** 推理档位到上游取值的映射；`null` 表示该档不发任何值（Off）。 */
  reasoningEfforts?: Record<string, string | null> | undefined
  /** 上下文窗口（token）。 */
  contextWindow?: number | undefined
  /** 单次输出上限（token）。 */
  maxOutputTokens?: number | undefined
}

export interface AccountProvider {
  id: string
  name: string
  base: string
  /** 上游密钥（`sk-...`）。永远不出宿主。 */
  key: string
  models: ProviderModel[]
  /** 缺省等价于 'normal'；登录时写下的平台行没有这个字段。 */
  retry?: RetryPolicy
}

/** `vexnar-account.json` 的形状（0600）。 */
export interface Account {
  user_id: number
  username: string
  display_name: string
  avatar_url: string
  request_count: number | null
  access_token: string
  credential_version: number
  expires_at: number
  providers: AccountProvider[]
}

/** 设置页看到的一行提供方：地址不是秘密，密钥只暴露「是否已存」。 */
export interface ProviderView {
  id: string
  name: string
  base: string
  models: ProviderModel[]
  retry: RetryPolicy
  key_configured: boolean
  format: 'openai-responses' | 'openai-completions'
}

/** 浏览器视图。字段名与旧 Go 接口保持一致；这里**没有**任何密钥字段。 */
export interface AccountView {
  signed_in: boolean
  ready: boolean
  reauth_required: boolean
  username: string
  display_name: string
  avatar_url: string
  request_count: number | null
  access_token_ready: boolean
  providers: ProviderView[]
}

export interface LoginMethods {
  methods: string[]
  password: boolean
}

/** 两步验证挑战：密码登录返回它而不是账号视图。 */
export interface LoginChallenge {
  challenge: string
}

/** 密码登录要么直接完成，要么要求再来一步验证码。 */
export type PasswordResult = AccountView | LoginChallenge

/** 平台侧证明：会话 cookie 和/或 access token，加上平台用户 id。 */
export interface PlatformProof {
  user_id: number
  authorization: string
  cookie: string
}

export interface AddProviderInput {
  /** 'platform' | 'deepseek' | 'custom'；其他值按未知提供方拒绝（400）。 */
  kind?: string
  api_key?: string
  name?: string
  base_url?: string
  retry?: string
  models?: ProviderModel[]
}

export interface UpdateProviderInput {
  id?: string
  api_key?: string
  name?: string
  base_url?: string
  retry?: string
  models?: ProviderModel[]
}

export interface PlatformAccountOptions {
  /** 状态文件所在目录；缺省取 VEXNAR_HOME / DSH_HOME / ~/.vexnar。 */
  home?: string
}

/** 一次平台 HTTP 交换的结果；`data` 只在响应确实是 JSON 时存在。 */
interface ExchangeResult {
  status: number
  ok: boolean
  data: unknown
  raw: string
  cookie: string
}

interface ExchangeOptions {
  headers?: Record<string, string>
  body?: unknown
  timeout?: number
  unavailable?: string
}

interface PendingChallenge {
  id: string
  token: string
  cookie: string
  expires: number
}

/**
 * @vexnar/dsh-account 拿到的账号状态机。所有会改状态的方法串行执行，
 * 返回值都是给浏览器的视图（`AccountView`）。
 */
export interface PlatformAccount {
  file: string
  read: () => Promise<Account>
  status: () => Promise<AccountView>
  methods: () => Promise<LoginMethods>
  login: (proof: PlatformProof) => Promise<AccountView>
  loginWithToken: (token: string) => Promise<AccountView>
  renewWithToken: (token: string) => Promise<AccountView>
  wallet: () => Promise<AccountWallet>
  password: (username: string, secret: string) => Promise<PasswordResult>
  verify: (challenge: string, code: string) => Promise<AccountView>
  addProvider: (input?: AddProviderInput) => Promise<AccountView>
  updateProvider: (input?: UpdateProviderInput) => Promise<AccountView>
  removeProvider: (id: string) => Promise<AccountView>
  logout: () => Promise<AccountView>
}

/**
 * JSON 边界上的对象：只有真正的对象（不是 null、不是数组以外的原始值）才当记录读。
 * 平台返回的东西是不可信的，所以一律从这里窄化，不用 `any`。
 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

/** JSON 边界上的数组：不是数组时按空列表处理。 */
function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value as unknown[] : []
}

/** `Array.prototype.filter` 的窄化谓词，替掉原来的 `.filter(Boolean)`。 */
function defined<T>(value: T | undefined): value is T {
  return value !== undefined
}

/** `Number.isSafeInteger` 的窄化版本：只有真正的安全整数才返回 number。 */
function safeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) ? Number(value) : undefined
}

/** `catch (error)` 里的 error 是 unknown，只关心 `code` 那一个字段。 */
function errorCode(error: unknown): string | undefined {
  const code = asRecord(error)?.code
  return typeof code === 'string' ? code : undefined
}

/** 平台统一响应封套 `{ success, message, data }` 里的 `data`。 */
function envelopeData(value: unknown): unknown {
  return asRecord(value)?.data
}

/** `envelopeData` 之后再当记录读；不是对象时按空对象处理（等价于原来读 undefined 属性）。 */
function envelopeRecord(value: unknown): Record<string, unknown> {
  return asRecord(envelopeData(value)) ?? {}
}

/** 封套里的 `success === true`。 */
function envelopeOK(value: unknown): boolean {
  return asRecord(value)?.success === true
}

/** DeepSeek 官方端点；自建/代理网关可以覆盖（测试也走这条口子）。 */
const deepseekBase = () => process.env.VEXNAR_DEEPSEEK_API || DEEPSEEK_BASE

/** 带 HTTP 状态码的账号错误；platform.js 直接把它映射成路由响应。 */
export class PlatformError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'PlatformError'
    this.status = status
  }
}

const fail = (status: number, message: string) => new PlatformError(status, message)

export function platformOrigin(): string {
  const raw = process.env.VEXNAR_NEWAPI_PLATFORM || DEFAULT_PLATFORM
  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid origin')
    return url.origin
  } catch {
    throw fail(500, 'VEXNAR_NEWAPI_PLATFORM 不是合法地址')
  }
}

/** 模型 API 的根：`https://host` 与 `https://host/v1` 都归一到 `https://host/v1`。 */
export function modelsBase(): string {
  const raw = process.env.VEXNAR_NEWAPI_API || DEFAULT_API
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw fail(500, 'VEXNAR_NEWAPI_API 不是合法地址')
  }
  const root = `${url.origin}${url.pathname.replace(/\/+$/, '')}`.replace(/\/v1$/, '')
  return `${root}/v1`
}

const randomID = () => randomBytes(16).toString('hex')

function emptyAccount(): Account {
  return {
    user_id: 0,
    username: '',
    display_name: '',
    avatar_url: '',
    request_count: null,
    access_token: '',
    credential_version: CREDENTIAL_VERSION,
    expires_at: 0,
    providers: []
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function avatarURL(value: unknown): string {
  const raw = text(value)
  if (!raw) return ''
  try {
    const url = new URL(raw, platformOrigin())
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''
  } catch {
    return ''
  }
}

function normalizeModel(model: unknown): ProviderModel | undefined {
  const source = asRecord(model)
  const id = text(source?.id)
  if (!id) return undefined
  const name = text(source?.name)
  const normalized: ProviderModel = name && name !== id ? { id, name } : { id }
  const inputTypes = source?.inputTypes
  if (Array.isArray(inputTypes)) {
    const kept = inputTypes.map(text).filter((item) => modelInputTypes.has(item))
    if (kept.length > 0) normalized.inputTypes = [...new Set(kept)]
  }
  const efforts = asRecord(source?.reasoningEfforts)
  if (efforts !== undefined) {
    const kept: Record<string, string | null> = {}
    for (const [level, value] of Object.entries(efforts)) {
      const key = text(level)
      if (!reasoningLevels.has(key)) continue
      if (key === 'off' && value === null) kept[key] = null
      else {
        const wire = text(value)
        if (wire !== '') kept[key] = wire
      }
    }
    if (Object.keys(kept).some((level) => level !== 'off')) normalized.reasoningEfforts = kept
  }
  const contextWindow = source?.contextWindow
  if (typeof contextWindow === 'number' && Number.isSafeInteger(contextWindow) && contextWindow > 0) {
    normalized.contextWindow = contextWindow
  }
  const maxOutputTokens = source?.maxOutputTokens
  if (typeof maxOutputTokens === 'number' && Number.isSafeInteger(maxOutputTokens) && maxOutputTokens > 0) {
    normalized.maxOutputTokens = maxOutputTokens
  }
  return normalized
}

/**
 * 重试策略只有两档：normal（仅临时错误，dsh 的默认值）与 always（所有错误）。
 * 存 'normal' 时不往 llm-pi-ai 写 retryPolicy，让适配器的默认策略继续生效。
 */
function normalizeRetry(value: unknown): RetryPolicy {
  return value === 'always' ? 'always' : 'normal'
}

function normalizeProvider(provider: unknown): AccountProvider | undefined {
  const source = asRecord(provider)
  const id = text(source?.id)
  const key = text(source?.key)
  if (!id || !key) return undefined
  const models = listOf(source?.models).map(normalizeModel).filter(defined)
  if (models.length === 0) return undefined
  return {
    id, name: text(source?.name) || id, base: text(source?.base), key, models,
    retry: normalizeRetry(source?.retry)
  }
}

/** 模型目录去重：同一个模型 ID 只留第一次出现的那条。 */
function uniqueModels(models: readonly (ProviderModel | undefined)[]): ProviderModel[] {
  const seen = new Set<string>()
  const kept: ProviderModel[] = []
  for (const model of models) {
    if (!model || seen.has(model.id)) continue
    seen.add(model.id)
    kept.push(model)
  }
  return kept
}

function normalizeAccount(raw: unknown): Account {
  const account = emptyAccount()
  const stored = asRecord(raw)
  if (stored === undefined) return account
  const userID = safeInteger(stored.user_id)
  account.user_id = userID !== undefined && userID > 0 ? userID : 0
  account.username = text(stored.username)
  account.display_name = text(stored.display_name)
  account.avatar_url = avatarURL(stored.avatar_url)
  account.request_count = safeInteger(stored.request_count) ?? null
  account.access_token = text(stored.access_token)
  account.credential_version = safeInteger(stored.credential_version) ?? 0
  account.expires_at = Number.isFinite(stored.expires_at) ? Number(stored.expires_at) : 0
  account.providers = listOf(stored.providers).map(normalizeProvider).filter(defined)
  return account
}

export function signedIn(account: Account): boolean {
  return account.user_id > 0 && Date.now() < account.expires_at
}

/** 老版本写入的账号缺少凭据版本，需要重新验证一次平台身份。 */
export function needsReauth(account: Account): boolean {
  return signedIn(account) && account.credential_version < CREDENTIAL_VERSION
}

/** 有身份且凭据可用：登录页据此决定是否放行工作区。 */
export function gateOpen(account: Account): boolean {
  return signedIn(account) && !needsReauth(account)
}

/** 至少有一个可用提供方（平台或用户自带）——只用于提示"能不能跑模型"。 */
export function ready(account: Account): boolean {
  if (!gateOpen(account)) return false
  return account.providers.some((provider) => provider.key !== '' && provider.models.length > 0)
}

/**
 * 给浏览器的视图：没有密钥，字段名与旧 Go 接口保持一致。
 *
 * 设置页的提供方编辑器要显示 API 地址、重试策略与「密钥是否已存」——地址不是
 * 秘密，密钥只暴露一个布尔；`key` 永远不出宿主。
 */
export function publicView(account: Account): AccountView {
  const active = signedIn(account)
  return {
    signed_in: active,
    ready: ready(account),
    reauth_required: needsReauth(account),
    username: active ? account.username : '',
    display_name: active ? account.display_name : '',
    avatar_url: active ? account.avatar_url : '',
    request_count: active ? account.request_count : null,
    access_token_ready: active && account.access_token !== '',
    providers: active
      ? account.providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        base: provider.base,
        models: provider.models,
        retry: normalizeRetry(provider.retry),
        key_configured: provider.key !== '',
        format: provider.id === 'vexnar' ? 'openai-responses' : 'openai-completions'
      }))
      : []
  }
}

/** 只在宿主内使用：带上 base 与 key，供 llm-pi-ai 注册真实上游。 */
export function catalog(account: Account): AccountProvider[] {
  if (!gateOpen(account)) return []
  return account.providers
    .filter((provider) => provider.key !== '' && provider.models.length > 0)
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      base: provider.base,
      key: provider.key,
      models: provider.models,
      retry: normalizeRetry(provider.retry)
    }))
}

function cookieHeader(response: Response): string {
  const listing = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : []
  const pairs: string[] = []
  for (const entry of listing) {
    const pair = String(entry).split(';')[0]?.trim()
    if (pair && pair.includes('=') && !pairs.includes(pair)) pairs.push(pair)
  }
  return pairs.join('; ')
}

/**
 * 一次平台 HTTP 交换。
 *
 * 返回值里 `data` 只在响应确实是 JSON 时存在：调用方据此给出人话错误，而不是把
 * `Unexpected token` / `Unexpected non-whitespace character` 之类的解析异常抛给页面。
 */
export async function exchange(method: string, endpoint: string, options: ExchangeOptions = {}): Promise<ExchangeResult> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(options.headers || {}) }
  let body: string | undefined
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  let response: Response
  try {
    const init: RequestInit = {
      method,
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeout ?? REQUEST_TIMEOUT_MS)
    }
    // `exactOptionalPropertyTypes` 下 `body: undefined` 不是合法 RequestInit；
    // 只在真有正文时才挂上去，请求本身完全一样。
    if (body !== undefined) init.body = body
    response = await fetch(endpoint, init)
  } catch {
    throw fail(502, options.unavailable ?? `无法连接 HXSEC AI Platform（${new URL(endpoint).host}）`)
  }
  const raw = await response.text().catch(() => '')
  let data: unknown
  if (raw.trim() !== '') {
    try {
      data = JSON.parse(raw) as unknown
    } catch {
      data = undefined
    }
  }
  return { status: response.status, ok: response.ok, data, raw, cookie: cookieHeader(response) }
}

function proofHeaders(proof: PlatformProof): Record<string, string> {
  const headers: Record<string, string> = {}
  if (proof.cookie) headers.Cookie = proof.cookie
  if (proof.authorization) headers.Authorization = proof.authorization
  if (proof.user_id > 0) headers['New-Api-User'] = String(proof.user_id)
  return headers
}

function inputToken(raw: string): string {
  const token = text(raw).replace(/^Bearer\s+/i, '')
  if (!/^[\x21-\x7e]{16,2048}$/.test(token) || token.startsWith('sk-')) {
    throw fail(400, '请输入希灵 AI 个人资料中的访问令牌')
  }
  return token
}

async function verifiedIdentity(proof: PlatformProof) {
  const self = await exchange('GET', `${platformOrigin()}/api/user/self`, { headers: proofHeaders(proof) })
  const identity = envelopeRecord(self.data)
  const id = safeInteger(identity.id)
  if (!self.ok || !envelopeOK(self.data) || !id || id <= 0 ||
    (proof.user_id > 0 && id !== proof.user_id) || !text(identity.username)) {
    throw fail(401, '希灵 AI 登录尚未完成或已失效')
  }
  return { id, identity }
}

function applyIdentity(account: Account, id: number, identity: Record<string, unknown>): void {
  account.user_id = id
  account.username = text(identity.username)
  account.display_name = text(identity.display_name)
  account.avatar_url = avatarURL(identity.avatar_url ?? identity.avatar)
  account.request_count = safeInteger(identity.request_count) ?? null
  account.expires_at = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
}

function proofOf(data: unknown, cookie: string): PlatformProof {
  const proof: PlatformProof = { user_id: 0, authorization: '', cookie }
  const payload = envelopeRecord(data)
  const user = asRecord(payload.user)
  const id = Number(user?.id ?? payload.id)
  proof.user_id = Number.isSafeInteger(id) && id > 0 ? id : 0
  const token = text(payload.access_token)
  if (token) proof.authorization = `Bearer ${token}`
  return proof
}

function sameOriginURL(raw: unknown, label: string): string {
  let url: URL
  try {
    url = new URL(text(raw))
  } catch {
    throw fail(400, `请输入有效的${label}`)
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.hostname === '' || url.username ||
      url.password || url.search !== '' || url.hash !== '') {
    throw fail(400, `请输入有效的${label}`)
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

function customBase(raw: unknown): string {
  const url = new URL(sameOriginURL(raw, 'OpenAI 兼容 API 地址'))
  const path = url.pathname.replace(/\/+$/, '').replace(/\/(?:chat\/completions|models)$/, '')
  return url.origin + path
}

function listedModel(item: unknown): ProviderModel | undefined {
  const source = asRecord(item)
  if (!source) return undefined
  const levels = listOf(asRecord(source.effort)?.supported_levels).map(text)
    .filter((level) => level !== 'off' && reasoningLevels.has(level))
  return normalizeModel({
    ...source,
    inputTypes: source.inputTypes ?? source.input_modalities,
    reasoningEfforts: source.reasoningEfforts ?? (levels.length === 0 ? undefined : Object.fromEntries(
      levels.map((level) => [level, level])
    )),
    contextWindow: source.contextWindow ?? source.context_window,
    maxOutputTokens: source.maxOutputTokens ?? source.max_output_tokens
  })
}

function providerRequest(method: string, base: string, path: string, key: string, body?: unknown) {
  return exchange(method, `${base.replace(/\/+$/, '')}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    body,
    unavailable: '无法连接模型提供商，请检查 API 地址、网络和 TLS 配置'
  })
}

function checkProviderReply(result: ExchangeResult, operation: string): void {
  if (result.ok) return
  if (result.status === 401 || result.status === 403) {
    throw fail(422, `模型提供商拒绝访问（HTTP ${result.status}），请检查 API 密钥和权限`)
  }
  throw fail(422, `${operation}失败（HTTP ${result.status}），请检查 API 地址和上游服务`)
}

async function readModels(base: string, key: string): Promise<ProviderModel[]> {
  const result = await providerRequest('GET', base, '/models', key)
  if ([404, 405, 501].includes(result.status)) return []
  checkProviderReply(result, '读取上游模型列表')
  const list = Array.isArray(result.data) ? result.data : listOf(envelopeData(result.data))
  return uniqueModels(list.map(listedModel).filter(defined))
}

async function verifyCustomModel(base: string, key: string, model: string): Promise<void> {
  const result = await providerRequest('POST', base, '/chat/completions', key, {
    model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false
  })
  checkProviderReply(result, '验证自定义模型')
  const choice = asRecord(listOf(asRecord(result.data)?.choices)[0])
  if (!asRecord(choice?.message)) {
    throw fail(422, '自定义模型未返回 OpenAI 兼容的对话响应，请检查 API 地址和模型 ID')
  }
}

/**
 * 平台账号状态机。
 *
 * 单一实例持有待验证的两步验证挑战与串行队列：登录、添加提供方、退出都排队执行，
 * 避免两个请求同时改写同一个状态文件。
 */
export function createPlatformAccount(options: PlatformAccountOptions = {}): PlatformAccount {
  const home = options.home ||
    process.env.VEXNAR_HOME ||
    process.env.DSH_HOME ||
    join(homedir(), '.vexnar')
  const file = join(home, 'vexnar-account.json')
  let pending: PendingChallenge | undefined
  let queue: Promise<unknown> = Promise.resolve()

  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = queue.then(operation)
    queue = next.catch(() => {})
    return next
  }

  async function read(): Promise<Account> {
    let raw: string
    try {
      raw = await readFile(file, 'utf8')
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return emptyAccount()
      throw fail(500, '读取 VEXNAR 账号失败')
    }
    if (raw.trim() === '') return emptyAccount()
    try {
      return normalizeAccount(JSON.parse(raw))
    } catch {
      // 状态文件坏掉时按未登录处理：让用户能重新登录，而不是永久卡在错误上。
      return emptyAccount()
    }
  }

  async function save(account: Account): Promise<void> {
    await mkdir(dirname(file), { recursive: true })
    const temporary = `${file}.${process.pid}.${randomID()}.tmp`
    try {
      await writeFile(temporary, `${JSON.stringify(account, null, 2)}\n`, { mode: 0o600 })
      await chmod(temporary, 0o600)
      await rename(temporary, file)
    } catch {
      throw fail(500, '保存 VEXNAR 账号失败')
    }
  }

  async function status(): Promise<AccountView> {
    return publicView(await read())
  }

  async function methods(): Promise<LoginMethods> {
    const result = await exchange('GET', `${platformOrigin()}/api/status`, { timeout: 10_000 })
      .catch(() => undefined)
    const data = envelopeData(result?.data)
    if (!envelopeOK(result?.data) || !data) throw fail(502, '无法读取 HXSEC AI Platform 登录方式')
    const advertised = asRecord(data) ?? {}
    const advertisedFlags: [unknown, string][] = [
      [advertised.password_login_enabled, '密码'],
      [advertised.passkey_login, 'Passkey'],
      [advertised.github_oauth, 'GitHub'],
      [advertised.linuxdo_oauth, 'LinuxDO'],
      [advertised.oidc_enabled, text(advertised.oidc_display_name) || 'OIDC'],
      [advertised.wechat_login, '微信'],
      [advertised.telegram_oauth, 'Telegram'],
      [advertised.discord_oauth, 'Discord']
    ]
    const names: string[] = advertisedFlags
      .filter(([enabled]) => enabled === true)
      .map(([, name]) => name)
    for (const provider of listOf(advertised.custom_oauth_providers)) {
      const entry = asRecord(provider)
      const name = text(entry?.name) || text(entry?.slug)
      if (name) names.push(name)
    }
    return {
      methods: [...new Set(names)],
      password: advertised.password_login_enabled === true &&
        advertised.password_login_encryption_enabled !== true &&
        advertised.turnstile_check !== true
    }
  }

  async function modelCredential(proof: PlatformProof, expires: number): Promise<AccountProvider | undefined> {
    const origin = platformOrigin()
    const headers = proofHeaders(proof)
    const search = async (keyword: string) => {
      const result = await exchange('GET', `${origin}/api/token/search?keyword=${encodeURIComponent(keyword)}`, { headers })
      if (!result.ok || !envelopeOK(result.data)) throw fail(403, '访问令牌需要模型 API 密钥的读取权限')
      return listOf(envelopeRecord(result.data).items).map(asRecord).filter(defined)
    }
    const available = (entry: Record<string, unknown>): boolean => {
      const expiration = safeInteger(entry.expired_time)
      return (safeInteger(entry.id) ?? 0) > 0 && (entry.status === undefined || entry.status === 1) &&
        (expiration === undefined || expiration < 0 || expiration * 1000 > Date.now())
    }
    const candidates = await search('VERNAX-')
    let entry = candidates.find((item) => available(item) && managedName.test(text(item.name)))
    if (!entry) {
      const name = `VERNAX-${randomUUID()}`
      const created = await exchange('POST', `${origin}/api/token/`, {
        headers,
        body: { name, unlimited_quota: true, remain_quota: 0, expired_time: Math.floor(expires / 1000) }
      })
      if (!created.ok || !envelopeOK(created.data)) throw fail(403, '无法创建 VERNAX 模型 API 密钥，请检查访问令牌的管理权限')
      entry = (await search(name)).find((item) => available(item) && text(item.name) === name)
    }
    if (!entry) throw fail(502, '平台未返回刚创建的模型 API 密钥，请重试')
    const token = await exchange('POST', `${origin}/api/token/${entry.id}/key`, { headers })
    let key = text(envelopeRecord(token.data).key)
    if (!token.ok || !envelopeOK(token.data) || !key) throw fail(403, '无法读取 VERNAX 模型 API 密钥，请检查访问令牌权限')
    if (!key.startsWith('sk-')) key = `sk-${key}`
    const base = modelsBase()
    const models = await readModels(base, key)
    return models.length === 0 ? undefined : { id: 'vexnar', name: '希灵 AI', base, key, models }
  }

  /** 已经拿到平台证明（密码登录、两步验证、浏览器抓取）之后的一次性收尾。 */
  async function complete(proof: PlatformProof, suppliedToken = ''): Promise<AccountView> {
    if (!proof || (!proof.cookie && !text(proof.authorization))) {
      throw fail(400, '无效的平台登录会话')
    }
    const previous = await read()
    if (gateOpen(previous)) throw fail(409, '请先退出当前 VEXNAR 账号')

    const origin = platformOrigin()
    const { id, identity } = await verifiedIdentity(proof)
    proof = { ...proof, user_id: id }

    const account = emptyAccount()
    applyIdentity(account, id, identity)
    account.access_token = suppliedToken || text(identity.access_token)
    if (account.access_token === '' && previous.user_id === account.user_id) {
      account.access_token = previous.access_token
    }
    if (account.access_token === '') {
      const access = await exchange('GET', `${origin}/api/user/token`, { headers: proofHeaders(proof) })
      const payload = envelopeData(access.data)
      const payloadRecord = asRecord(payload)
      account.access_token = text(payload) ||
        text(payloadRecord?.access_token) ||
        text(payloadRecord?.token)
    }

    const provider = await modelCredential(proof, account.expires_at)
    if (provider) account.providers.push(provider)

    // 同一账号重新登录时保留用户自己接的第三方提供方。
    if (previous.user_id === account.user_id) {
      for (const provider of previous.providers) {
        if (provider.id !== 'vexnar') account.providers.push(provider)
      }
    }

    await save(account)
    pending = undefined
    return publicView(account)
  }

  async function loginWithToken(raw: string): Promise<AccountView> {
    const token = inputToken(raw)
    return complete({ user_id: 0, cookie: '', authorization: `Bearer ${token}` }, token)
  }

  async function renewWithToken(raw: string): Promise<AccountView> {
    const token = inputToken(raw)
    const account = await read()
    if (!gateOpen(account)) throw fail(401, '请先登录希灵 AI')
    const proof = { user_id: 0, cookie: '', authorization: `Bearer ${token}` }
    const { id, identity } = await verifiedIdentity(proof)
    if (id !== account.user_id) throw fail(409, '请使用当前希灵 AI 账户的访问令牌')
    applyIdentity(account, id, identity)
    account.access_token = token
    await save(account)
    return publicView(account)
  }

  async function wallet(): Promise<AccountWallet> {
    const account = await read()
    if (!gateOpen(account)) throw fail(401, '请先登录希灵 AI')
    const origin = platformOrigin()
    const headers = proofHeaders({ user_id: account.user_id, cookie: '', authorization: `Bearer ${account.access_token}` })
    const platformRead = async (path: string): Promise<unknown> => {
      const result = await exchange('GET', origin + path, { headers, timeout: 7_000 }).catch(() => undefined)
      return result?.ok && envelopeOK(result.data) ? envelopeData(result.data) : undefined
    }
    const deepseek = account.providers.find((provider) => provider.id === 'deepseek' &&
      URL.canParse(provider.base) && new URL(provider.base).origin === DEEPSEEK_BASE)
    const deepseekRead = async (): Promise<AccountWallet['deepseek']> => {
      if (!deepseek) return { status: 'unconfigured', balances: [] }
      const reply = await exchange('GET', DEEPSEEK_BASE + '/user/balance', {
        headers: { Authorization: `Bearer ${deepseek.key}` },
        timeout: 7_000
      }).catch(() => undefined)
      const balances = listOf(asRecord(reply?.data)?.balance_infos).flatMap((value) => {
        const row = asRecord(value)
        const currency = text(row?.currency)
        const total = text(row?.total_balance)
        return /^[A-Z]{3}$/.test(currency) && /^-?\d+(?:\.\d+)?$/.test(total) ? [{ currency, total }] : []
      })
      return { status: reply?.ok && balances.length > 0 ? 'ready' : 'unavailable', balances }
    }
    const [identity, settings, topup, plans, subscriptions, official] = await Promise.all([
      platformRead('/api/user/self'),
      platformRead('/api/status'),
      platformRead('/api/user/topup/info'),
      platformRead('/api/subscription/plans'),
      platformRead('/api/subscription/self'),
      deepseekRead()
    ])
    const profile = asRecord(identity)
    const config = asRecord(settings)
    const quota = safeInteger(profile?.quota) ?? null
    const perUnit = Number(config?.quota_per_unit)
    const currency = text(config?.quota_display_type)
    const rate = currency === 'CNY' ? Number(config?.usd_exchange_rate)
      : currency === 'CUSTOM' ? Number(config?.custom_currency_exchange_rate) : 1
    const amount = quota !== null && perUnit > 0 && Number.isFinite(perUnit) && rate > 0 && Number.isFinite(rate) &&
      ['USD', 'CNY', 'CUSTOM'].includes(currency) ? quota / perUnit * rate : null
    return {
      platform: {
        quota,
        amount,
        currency: currency === 'CUSTOM' ? text(config?.custom_currency_symbol) : currency,
        methods: listOf(asRecord(topup)?.pay_methods).map((value) => text(asRecord(value)?.name)).filter(Boolean),
        plans: listOf(plans).flatMap((value) => {
          const row = asRecord(asRecord(value)?.plan)
          const id = safeInteger(row?.id)
          const title = text(row?.title)
          const price = Number(row?.price_amount)
          const unit = text(row?.duration_unit)
          const duration = safeInteger(row?.duration_value)
          const unitLabel = { year: '年', month: '个月', day: '天', hour: '小时' }[unit as 'year' | 'month' | 'day' | 'hour']
          return id && title && row?.enabled === true && Number.isFinite(price) && price >= 0
            ? [{ id, title, price, currency: text(row.currency), duration: duration && unitLabel ? `${duration} ${unitLabel}` : '' }]
            : []
        }),
        subscriptions: listOf(asRecord(subscriptions)?.subscriptions).flatMap((value) => {
          const row = asRecord(asRecord(value)?.subscription)
          const id = safeInteger(row?.plan_id)
          const ends = safeInteger(row?.end_time)
          const total = safeInteger(row?.amount_total)
          const used = safeInteger(row?.amount_used)
          if (!id || ends === undefined) return []
          return [{ id, ends, remaining: total && used !== undefined ? Math.max(0, total - used) : null }]
        }),
        url: origin + '/wallet',
        error: quota === null ? '无法读取希灵 AI 余额，请检查访问令牌权限' : ''
      },
      deepseek: official
    }
  }

  async function password(username: string, secret: string): Promise<PasswordResult> {
    const login = text(username)
    if (login === '' || typeof secret !== 'string' || secret === '') {
      throw fail(400, '请输入平台账号和密码')
    }
    const configuration = await exchange('GET', `${platformOrigin()}/api/status`)
    const data = asRecord(envelopeData(configuration.data)) ?? {}
    if (!envelopeOK(configuration.data)) throw fail(502, '无法读取平台登录配置')
    if (data.password_login_enabled !== true || data.password_login_encryption_enabled === true ||
        data.turnstile_check === true) {
      throw fail(409, '请在平台验证窗口完成登录')
    }
    if (ready(await read())) throw fail(409, '请先退出当前 VEXNAR 账号')

    const reply = await exchange('POST', `${platformOrigin()}/api/user/login`, {
      body: { username: login, password: secret }
    })
    if (reply.status === 429) throw fail(429, '平台登录过于频繁，请稍后重试')
    if (reply.status >= 500 || reply.status === 0) throw fail(502, '平台登录暂不可用')
    if (!envelopeOK(reply.data)) throw fail(401, '平台登录失败，请检查账号、密码和验证要求')

    const payload = envelopeRecord(reply.data)
    const proof = proofOf(reply.data, reply.cookie)
    if (text(payload.flow_token) !== '' || payload.require_2fa === true) {
      pending = {
        id: randomID(),
        token: text(payload.flow_token),
        cookie: proof.cookie,
        expires: Date.now() + 5 * 60 * 1000
      }
      return { challenge: pending.id }
    }
    if (proof.user_id <= 0 || (proof.authorization === '' && proof.cookie === '')) {
      throw fail(409, '请在平台验证窗口完成登录')
    }
    return complete(proof)
  }

  async function verify(challenge: string, code: string): Promise<AccountView> {
    const answer = text(code)
    if (text(challenge) === '' || answer === '') throw fail(400, '请输入平台验证码')
    if (!pending || pending.id !== challenge || Date.now() > pending.expires) {
      throw fail(409, '验证已失效，请重新登录')
    }
    const origin = platformOrigin()
    const endpoint = pending.token === '' ? '/api/user/login/2fa' : '/api/user/login/verify'
    const body = pending.token === ''
      ? { code: answer }
      : { flow_token: pending.token, method: '2fa', code: answer }
    const reply = await exchange('POST', `${origin}${endpoint}`, {
      body,
      headers: pending.cookie === '' ? {} : { Cookie: pending.cookie }
    })
    if (reply.status >= 500 || reply.status === 0) throw fail(502, '无法连接平台验证服务')
    const proof = proofOf(reply.data, reply.cookie || pending.cookie)
    if (!envelopeOK(reply.data) || proof.user_id <= 0 || (proof.authorization === '' && proof.cookie === '')) {
      throw fail(401, '验证码未通过，请重试或在平台窗口验证')
    }
    return complete(proof)
  }

  async function addProvider(input: AddProviderInput = {}): Promise<AccountView> {
    const key = text(input.api_key)
    if (key === '') throw fail(400, '请输入 API Key')
    const current = await read()
    if (!gateOpen(current)) throw fail(401, '请先登录 VEXNAR 账号')

    const provider: AccountProvider = { id: '', name: '', base: '', key, models: [], retry: normalizeRetry(input.retry) }
    switch (input.kind) {
      case 'platform':
        provider.id = 'vexnar'
        provider.name = 'HXSEC AI Platform'
        provider.base = modelsBase()
        break
      case 'deepseek':
        provider.id = 'deepseek'
        provider.name = 'DeepSeek'
        provider.base = deepseekBase()
        break
      case 'custom': {
        provider.id = `custom-${randomID()}`
        provider.name = text(input.name)
        if (provider.name === '') throw fail(400, '请输入名称和有效的 OpenAI 兼容 API 根地址')
        provider.base = customBase(input.base_url)
        break
      }
      default:
        throw fail(400, '未知的模型提供方')
    }

    if (input.kind === 'custom' && Array.isArray(input.models) && input.models.length > 0) {
      provider.models = uniqueModels(input.models.map(normalizeModel).filter(defined))
      const first = provider.models[0]
      if (!first) throw fail(400, '请输入有效的模型 ID')
      await verifyCustomModel(provider.base, key, first.id)
    } else {
      provider.models = await readModels(provider.base, key)
      if (provider.models.length === 0) throw fail(422, input.kind === 'custom'
        ? '上游未提供模型列表，请检查 API 地址或手动填写模型 ID'
        : '上游未提供模型列表，请检查 API 地址')
    }

    const account = await read()
    if (!gateOpen(account) || account.user_id !== current.user_id) {
      throw fail(401, 'VEXNAR 登录状态已变化，请重试')
    }
    // 同一个 id 重新添加（例如更新 DeepSeek 的 key）时，用户先前选的重试策略不该被冲掉。
    const previous = account.providers.find((item) => item.id === provider.id)
    if (previous !== undefined && text(input.retry) === '') provider.retry = normalizeRetry(previous.retry)
    account.providers = account.providers.filter((item) => item.id !== provider.id)
    account.providers.push(provider)
    await save(account)
    return publicView(account)
  }

  /**
   * 编辑一个已存在的提供方：密钥可留空（留空即保持已存的 key），地址、显示名称、
   * 模型目录与重试策略都可改。
   *
   * 模型目录以编辑器提交的那份为准——用户在界面上删掉/改名的模型不该被下一次
   * 「读取上游模型列表」悄悄加回来。只有密钥或地址变了才向上游验证一次：
   * 那是唯一能证明这组凭据仍然可用的手段，验证失败就整笔拒绝，不留半套状态。
   */
  async function updateProvider(input: UpdateProviderInput = {}): Promise<AccountView> {
    const id = text(input.id)
    if (!/^[a-z0-9-]+$/.test(id)) throw fail(400, '无效的模型提供方')
    const account = await read()
    if (!gateOpen(account)) throw fail(401, '请先登录 VEXNAR 账号')
    const current = account.providers.find((provider) => provider.id === id)
    if (current === undefined) throw fail(404, '模型提供方不存在')

    const key = text(input.api_key)
    const base = text(input.base_url) === '' ? current.base
      : id.startsWith('custom-') ? customBase(input.base_url) : sameOriginURL(input.base_url, 'API 地址')
    const name = text(input.name) || current.name
    const retry = normalizeRetry(input.retry)
    if (id === 'vexnar') {
      if (key !== '') throw fail(400, '平台访问密钥由平台签发，不能在这里修改')
      if (base !== current.base) throw fail(400, '平台 API 地址由平台配置，不能在这里修改')
    }

    let models: ProviderModel[] = Array.isArray(input.models)
      ? uniqueModels(input.models.map(normalizeModel).filter(defined))
      : []
    if (key !== '' || base !== current.base) {
      const nextKey = key || current.key
      const discovered = await readModels(base, nextKey)
      if (discovered.length === 0) {
        const first = (models.length > 0 ? models : current.models)[0]
        if (!id.startsWith('custom-') || !first) throw fail(422, '上游未提供模型列表，请检查 API 地址')
        await verifyCustomModel(base, nextKey, first.id)
      } else if (models.length === 0) {
        models = discovered
      }
    }
    if (models.length === 0) models = current.models
    if (models.length === 0) throw fail(422, '模型目录不能为空')

    account.providers = account.providers.map((provider) => provider.id !== id ? provider : {
      id, name, base, key: key === '' ? current.key : key, models, retry
    })
    await save(account)
    return publicView(account)
  }

  async function removeProvider(id: string): Promise<AccountView> {
    const target = text(id)
    if (!/^[a-z0-9-]+$/.test(target)) throw fail(400, '无效的模型提供方')
    if (target === 'vexnar') throw fail(400, '平台模型不可移除')
    const account = await read()
    if (!gateOpen(account)) throw fail(401, '请先登录 VEXNAR 账号')
    const kept = account.providers.filter((provider) => provider.id !== target)
    if (kept.length === account.providers.length) throw fail(404, '模型提供方不存在')
    account.providers = kept
    await save(account)
    return publicView(account)
  }

  async function logout(): Promise<AccountView> {
    pending = undefined
    try {
      await unlink(file)
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw fail(500, '退出 VEXNAR 账号失败')
    }
    return publicView(emptyAccount())
  }

  return {
    file,
    read,
    status: () => serial(status),
    methods: () => serial(methods),
    login: (proof: PlatformProof) => serial(() => complete(proof)),
    loginWithToken: (token: string) => serial(() => loginWithToken(token)),
    renewWithToken: (token: string) => serial(() => renewWithToken(token)),
    wallet,
    password: (username: string, secret: string) => serial(() => password(username, secret)),
    verify: (challenge: string, code: string) => serial(() => verify(challenge, code)),
    addProvider: (input?: AddProviderInput) => serial(() => addProvider(input)),
    updateProvider: (input?: UpdateProviderInput) => serial(() => updateProvider(input)),
    removeProvider: (id: string) => serial(() => removeProvider(id)),
    logout: () => serial(logout)
  }
}
