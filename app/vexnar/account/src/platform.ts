// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * VEXNAR 账号插件：登录壳、模型提供方注册、启动门禁。
 *
 * 账号状态与平台交互都在 ./platform-account.js 里完成（TS 直连 HXSEC AI
 * Platform），这里只做三件事：
 *   1. 未登录时用登录页替换工作区，并用 connection.admit 把其他请求挡在 401；
 *   2. 登录后把平台模型与用户自带提供方写进 llm-pi-ai，密钥进 dsh 凭据库；
 *   3. 把 /vexnar-api/platform/* 暴露给登录页与设置页。
 *
 * 这里不再拼 Go 的地址、不再注入 X-VEXNAR-Desktop-Token：模型请求由 dsh 直接
 * 发往上游，密钥按请求从凭据库解析。
 */

import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { loginPage, workspaceSessionScript } from './login-page.js'
import { createBilling } from './billing.js'
import { checkForUpdate, currentVersion, resetUpdateCache } from './update.js'
import { createModelCompletion } from './model-channel.js'
import {
  catalog,
  createPlatformAccount,
  gateOpen,
  PlatformError,
  signedIn,
  platformOrigin,
  publicView
} from './platform-account.js'
import type {
  Account,
  AccountView,
  AddProviderInput,
  ProviderModel,
  UpdateProviderInput
} from './platform-account.js'

const clientPrefix = '/vexnar-api/platform'
const maxBody = 16 * 1024

/**
 * 这次读取是不是「文件读不到 / 读坏」，应当按读失败处理而不是按退出登录。
 *
 * `createPlatformAccount().read()` 在文件缺失、内容为空、JSON 解析失败时都会退回
 * 一个空账号；空账号与「用户主动退出」在形状上一样，所以只能看上一次的有效状态：
 * 上一次是登录态、这一次连 `user_id` 都没有，就当作读失败。
 *
 * @param last - 上一次成功应用的账号；从未读到过时为 undefined。
 * @param next - 本次读取的结果。
 * @returns 应当保留上一次的登录状态时为 true。
 */
export function keepsSessionOnUnreadable(last: Account | undefined, next: Account): boolean {
  return last !== undefined && gateOpen(last) && next.user_id === 0 && next.providers.length === 0
}

/**
 * dsh 的 webServer 路由：`exact` 原样匹配路径，`prefix` 还匹配 `path/...`。
 *
 * 包内没有 `@deepseek-ai/*` 依赖，那些声明在这里解析不到，所以只声明本插件
 * 真正用到的那一面（同 `vexnar-mcp/index.ts`）。handler 拥有整条响应生命周期，
 * 返回值无人读取——有的分支写成 `return res.end()`，所以按 `unknown` 收。
 */
interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<unknown>
}

/** 一个已创建 Peer 的最小面：退出时只用到 dispose。 */
interface PeerLike {
  dispose: () => Promise<void>
}

/** `admit` 的结果：放行的 Peer，或拒绝的状态码。 */
type PeerAdmission = { readonly peer: PeerLike } | { readonly rejection: 401 | 403 }

/**
 * `ctx.connection` 用到的那一面。
 *
 * `admit` 会被本插件替换成带门禁的版本（工作区未就绪时回 401），退出时再换回来，
 * 所以它是一个可赋值的实例属性，而不是只读方法。
 */
interface ConnectionSlice {
  admit: (request: IncomingMessage) => PeerAdmission
  requestRejection: (request: IncomingMessage) => 401 | 403 | undefined
  createPeer: (options: { readonly principal: { kind: 'owner' } }) => PeerLike
  fetch: {
    register: (route: {
      path: string
      methods: readonly string[]
      fetch: (request: Request) => Promise<Response>
    }) => () => Promise<void>
  }
}

/** 本插件用到的 dsh 上下文切片（宿主侧不依赖 dsh 的包，故此处结构化声明）。 */
export interface PlatformContext {
  credentials: {
    set: (ref: string, value: string) => Promise<void>
    unset: (ref: string) => Promise<void>
  }
  settings: {
    replace: (ns: string, section: object) => Promise<void>
  }
  effect: (body: () => (() => void) | void) => void
  connection: ConnectionSlice
  agentDefaultModel: {
    currentSelection: () => { provider: string; model: string }
    saveSelection: (selection: { provider: string; model: string }) => Promise<void>
  }
  typertGateway: {
    invoke: (request: {
      namespace: string
      method: string
      args: Record<string, unknown>
      signal: AbortSignal
      peer: PeerLike
    }) => Promise<unknown>
  }
  webServer: {
    register: (route: WebRoute) => () => void
    tapIndex: (transform: (html: string) => string) => () => void
  }
}

/** 写进 llm-pi-ai 的一行提供方；`retryPolicy` 只在「所有错误都重试」时出现。 */
interface LlmProviderSetting {
  displayName: string
  api: 'openai-responses' | 'openai-completions'
  baseURL: string
  apiKeyEnv: string
  models: Array<Omit<ProviderModel, 'inputTypes' | 'maxOutputTokens'> & {
    input?: string[]
    maxTokens?: number
  }>
  retryPolicy?: { mode: 'always' }
}

/** 一条 `/vexnar-api/platform/*` 路由的方法表，键是 HTTP 方法。 */
type RouteHandlers = Record<string, ((req: IncomingMessage) => unknown) | undefined>

/** 解析出来的 JSON 正文：只当字段袋读，字段本身由账号层校验。 */
type JsonBody = Record<string, unknown>

/**
 * JSON/HTTP 边界上的对象读法。
 *
 * 平台返回的东西不可信；不是对象时读成空记录，等价于原来 `value?.field` 得到
 * undefined 的行为。`platform-account.ts` 内部有同样的 `asRecord`，那里没导出。
 */
export function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

/** 把 typertGateway.invoke 的失败翻成浏览器看得懂的字段。 */
function failureOf(error: unknown): { code: unknown; message: unknown; details: unknown } {
  const record = recordOf(error)
  return { code: record.code || 'settings/rejected', message: record.message, details: record.details || {} }
}

/** 一条 Client RPC 请求的最小形状；对不上就当无效请求（400）。 */
interface ClientRpcRequest {
  rpcId: string
  args: Record<string, unknown>
}

/**
 * 把请求正文窄化成一条 Client RPC 请求。
 *
 * 原代码直接读 `message.payload.args`，值不合法时靠后续的读属性得到 undefined；
 * 这里把同样的判断写成一个窄化函数，条件与顺序都没变。
 */
function clientRpcRequest(body: unknown, method: string): ClientRpcRequest | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const message = body as Record<string, unknown>
  if (message.type !== 'client-request' || typeof message.rpcId !== 'string' ||
      message.method !== method) return undefined
  const payload = recordOf(message.payload)
  const args = payload.args
  if (!args) return undefined
  return { rpcId: message.rpcId, args: args as Record<string, unknown> }
}

/** 凭据名必须是 POSIX shell 标识符，提供方 id 里的 `-` 换成 `_`。 */
function credentialName(providerID: string): string {
  return `VEXNAR_${providerID.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}_API_KEY`
}

async function readJson(req: IncomingMessage): Promise<JsonBody> {
  const chunks: Buffer[] = []
  let length = 0
  // node 把正文按 Buffer 块交出来；Readable 的迭代器类型是 any，这里收窄。
  for await (const chunk of req as AsyncIterable<Buffer>) {
    length += chunk.length
    if (length > maxBody) throw new PlatformError(413, '请求正文过大')
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (raw.trim() === '') return {}
  try {
    return JSON.parse(raw) as JsonBody
  } catch {
    throw new PlatformError(400, '无效的 JSON 请求')
  }
}

/** 正文里的字符串字段；不是字符串时读成空串，与账号层的 `text()` 语义一致。 */
function bodyText(body: JsonBody, name: string): string {
  const value = body[name]
  return typeof value === 'string' ? value : ''
}

/**
 * 提供方输入：字段名与 `AddProviderInput` / `UpdateProviderInput` 一致。
 *
 * 账号层对每个字段都会再校验一次（`text()`、`normalizeRetry()` 与 kind 的
 * switch），所以这里只按字段名搬运 JSON 原文，不做业务判断。
 */
function providerInput(body: JsonBody): AddProviderInput & UpdateProviderInput {
  const input: AddProviderInput & UpdateProviderInput = {
    kind: bodyText(body, 'kind'),
    id: bodyText(body, 'id'),
    api_key: bodyText(body, 'api_key'),
    name: bodyText(body, 'name'),
    base_url: bodyText(body, 'base_url'),
    retry: bodyText(body, 'retry')
  }
  const models = body.models
  // 模型目录由账号层逐条窄化（`normalizeModel`），这里原样转交。
  if (Array.isArray(models)) input.models = models as ProviderModel[]
  return input
}

export function installPlatform(ctx: PlatformContext): () => boolean {
  /**
   * 登录页脚本读一次就记住。
   *
   * 登录页 HTML 由本模块的 `loginPage()` 生成（进程启动时的模块快照），而
   * `entry.js` 过去每次请求都从磁盘读——`pnpm run setup` 替换 lib 后，正在跑的
   * 进程会拿"新脚本配旧模板"，脚本找不到 `#reveal` 之类的元素直接抛错，表现就是
   * "登录页报错 / 点登录没反应"。脚本与模板必须来自同一份快照：这里在插件装载时
   * 读一次，之后不再碰磁盘。换版本就重启，语义与模板一致。
   */
  const loginClient = readFile(new URL('./login-client.js', import.meta.url), 'utf8')
  loginClient.catch(() => {})
  const account = createPlatformAccount()
  const billing = createBilling(account.read)
  /**
   * 门禁状态。
   *
   * `undefined` = 还没读完第一份账号：这份进程刚起来，没有可依据的登录态，
   * 一律放行（桌面端在这一瞬间就会建默认工作区，拒了它整页就退回“先选目录”）。
   * `true` = 登录态有效，`false` = 确定的未登录/已过期——后两种是确定的，
   * 必须真的关门：只换首页 HTML 而不拦接口，会让已经加载的页面在退出登录后
   * 继续“看着是登录的”，左下角还隔几秒跳一次“连接成功”。
   */
  let ready: boolean | undefined = undefined
  let lastCatalog = ''
  let syncedProviders = new Set<string>()
  let lastState: Account | undefined
  let channelInstalled = false
  let channelLoading = false
  /** 默认工作区是否已经尝试过初始化：门禁重新打开时复位。 */
  let workspaceBootstrapped = false
  const life = new AbortController()
  const activeSockets = new Set<Socket>()
  /** 已经为「门禁关闭」写过诊断的路径：同一轮关闭不刷屏。 */
  const closedNotice = new Set<string>()
  const setReady = (value: boolean): void => {
    if (value) closedNotice.clear()
    else workspaceBootstrapped = false
    ready = value
    if (!ready) {
      for (const socket of activeSockets) socket.destroy()
      activeSockets.clear()
    }
  }

  /**
   * 一次「账号文件读不到 / 读坏」的读取会退回空账号。它不该被当成退出登录：
   * 空账号会把提供方与密钥一起清掉，门禁也会在页面已经加载完之后突然关上，
   * 用户看到的就是「workspace create failed: … HTTP 401」这类与真实原因无关的报错。
   *
   * 真正的过期是同一份账号（`user_id`、`expires_at` 都在）时间过了；那种情况照常关门。
   */
  const unreadableState = (state: Account): boolean => keepsSessionOnUnreadable(lastState, state)

  /**
   * 把账号里的提供方写进 llm-pi-ai：baseURL 指向真实上游，apiKeyEnv 指向本插件
   * 刚写进凭据库的键。dsh 每次请求自己解析密钥，不经过任何中转进程。
   */
  /**
   * 引擎的模型调用走这里：把进程内的完成函数装进 core。不开端口、不发令牌——
   * 引擎与账号插件本来就在同一个 dsh 进程里，中间那条 loopback HTTP 只多了一
   * 个监听口和一份要传的令牌。每次调用现读目录，换号或加提供方都不用重启。
   */
  const ensureModelChannel = (): void => {
    if (channelInstalled || channelLoading) return
    channelLoading = true
    void import('./core-embedded.js').then(core => {
      if (life.signal.aborted || lastState === undefined || catalog(lastState).length === 0) return
      core.setModelCompletion(createModelCompletion(() => lastState ? catalog(lastState) : [],
        () => process.env.VEXNAR_MODEL))
      channelInstalled = true
    }).catch(() => {
      console.warn('[vexnar] 内置模型通道初始化失败')
    }).finally(() => {
      channelLoading = false
    })
  }

  /** 退出登录或停用插件时摘掉通道：引擎随后只会说「模型通道未就绪」。 */
  const clearModelChannel = async (): Promise<void> => {
    if (!channelInstalled) return
    channelInstalled = false
    const core = await import('./core-embedded.js')
    core.setModelCompletion(undefined)
  }

  /**
   * 首次进入时先在进程内把默认工作区建好。
   *
   * 上游客户端在首页发现「既没有工作区也没有会话」时会自己调
   * `workspace/initializeDefault`。那条调用走 HTTP，落在一个刚启动、门禁还没
   * 判定完的进程上就会被拒，界面于是退回「请先选择工作区」：用户必须先手动挑
   * 一个目录，而挑目录同样要调 `workspace/create`，于是同一个 401 再弹一次
   * 「无法打开文件夹」。
   *
   * 这里在自己的进程里调同一个远程方法（不经过 HTTP）：页面无论什么时候来问，
   * 默认工作区都已经在列表里，上游的 `restoreSelection` 会直接连它，不再走
   * 创建分支，也就不需要用户先选目录。
   */
  const ensureDefaultWorkspace = (): void => {
    if (workspaceBootstrapped) return
    workspaceBootstrapped = true
    const peer = ctx.connection.createPeer({ principal: { kind: 'owner' } })
    void ctx.typertGateway.invoke({
      namespace: 'workspace', method: 'initializeDefault', args: {},
      signal: AbortSignal.timeout(20_000), peer
    }).catch(() => {
      // 精简 profile 里没有 workspace 控制器，或系统取不到「文档」目录。两者都不该
      // 变成启动失败；下一次门禁打开时再试一次。
      workspaceBootstrapped = false
    }).finally(() => { void peer.dispose() })
  }

  /**
   * 退出登录时把密钥真正删掉，而不是只把账号文件挪走。
   *
   * 三个地方各有一份：账号文件（access_token + providers[].key）、dsh 凭据库
   * （每个提供方一个 `VEXNAR_<ID>_API_KEY` 引用）、llm-pi-ai 的提供方目录。
   * 只删文件会让下一次请求仍然能从凭据库解析出 APIKEY，所以三份一起清：
   *   - 先按退出前的账号目录列出全部凭据引用并 unset；
   *   - 再把 llm-pi-ai 的 providers 置空并记住指纹，避免后台同步把它写回来；
   *   - 最后清掉内存里的模型通道与默认模型选择。
   */
  const purgeAccountSecrets = async (state: Account): Promise<void> => {
    const refs = new Set<string>(syncedProviders.size > 0 ? [...syncedProviders] : [])
    for (const provider of catalog(state)) refs.add(provider.id)
    // `catalog` 在未登录时可能为空，提供方 id 仍以账号文件为准再兜一层。
    for (const provider of state.providers) refs.add(provider.id)
    for (const id of refs) await ctx.credentials.unset(credentialName(id)).catch(() => {})
    syncedProviders = new Set()
    lastCatalog = ''
    lastState = undefined
    process.env.VEXNAR_MODEL = ''
    await ctx.settings.replace('llm-pi-ai', { providers: {} })
    await clearModelChannel().catch(() => {})
    setReady(false)
  }

  /**
   * 目录同步与退出登录互斥。
   *
   * 后台每 15 秒同步一次目录，登录、改提供方时也会同步；这些同步都带
   * `await ctx.credentials.set(...)`。退出登录如果在中间插进来，一次还在飞行中的
   * 旧同步就能把刚删掉的 APIKEY 写回凭据库——"点了退出，密钥又回来了"。
   * 所以：每次同步带一个 epoch，退出时先 +1 再等队列跑空；epoch 过期的同步
   * 不再写任何东西。所有同步串行执行，最后写入的一定是最新那份。
   */
  let secretEpoch = 0
  let catalogTail: Promise<unknown> = Promise.resolve()

  const applyCatalog = async (state: Account, epoch: number) => {
    if (epoch !== secretEpoch) return publicView(state)
    if (unreadableState(state)) {
      // 上一次读取有效、这一次读成空账户：按「读失败」处理，保留已经登录的状态。
      console.warn('[vexnar] 账号文件读不到或已损坏，保留上一次的有效登录状态')
      return publicView(lastState!)
    }
    lastState = state
    const providers: Record<string, LlmProviderSetting> = {}
    const present = new Set<string>()
    for (const provider of catalog(state)) {
      const ref = credentialName(provider.id)
      await ctx.credentials.set(ref, provider.key)
      present.add(provider.id)
      providers[provider.id] = {
        displayName: provider.name,
        api: provider.id === 'vexnar' ? 'openai-responses' : 'openai-completions',
        baseURL: provider.base,
        apiKeyEnv: ref,
        models: provider.models.map(({ inputTypes, maxOutputTokens, ...model }) => ({
          ...model,
          ...(inputTypes === undefined ? {} : { input: inputTypes }),
          ...(maxOutputTokens === undefined ? {} : { maxTokens: maxOutputTokens })
        })),
        // 只有「所有错误都重试」需要显式写入；normal 就是适配器自己的默认策略，
        // 写进去只会把默认值冻结在这一版代码上。
        ...provider.retry === 'always' ? { retryPolicy: { mode: 'always' as const } } : {}
      }
    }
    for (const id of syncedProviders) {
      if (!present.has(id)) await ctx.credentials.unset(credentialName(id)).catch(() => {})
    }
    syncedProviders = present

    const fingerprint = JSON.stringify(providers)
    if (epoch !== secretEpoch) return publicView(state)
    if (fingerprint !== lastCatalog) {
      await ctx.settings.replace('llm-pi-ai', { providers })
      lastCatalog = fingerprint
    }

    const first = Object.keys(providers)[0]
    const firstModel = first === undefined ? undefined : providers[first]?.models[0]
    if (firstModel !== undefined) process.env.VEXNAR_MODEL = firstModel.id
    const current = ctx.agentDefaultModel.currentSelection()
    const selected = providers[current.provider]?.models.find((model) => model.id === current.model)
    if (!selected) {
      const [firstID] = Object.keys(providers)
      const fallback = firstID === undefined ? undefined : providers[firstID]?.models[0]
      if (firstID !== undefined && fallback !== undefined) {
        await ctx.agentDefaultModel.saveSelection({ provider: firstID, model: fallback.id })
      }
    }
    // 门禁只在两种情形关闭：账号真的过期/需要重新验证，或显式退出登录。
    // 关的时候留一行日志，免得之后只能从界面的 401 反推。
    const open = gateOpen(state)
    if (!open && ready) {
      console.warn(`[vexnar] 账号门禁关闭：${signedIn(state) ? '凭据版本过旧，需要重新验证' : '登录已过期，请重新登录'}`)
    }
    setReady(open)
    if (open) ensureDefaultWorkspace()
    // 加载内置 core 会等待存储初始化，账户校验只依赖本地身份和 dsh 设置。
    if (firstModel !== undefined) ensureModelChannel()
    return publicView(state)
  }

  /** 串行化入口：同一时刻只有一次目录写入，顺序由调用顺序决定。 */
  const syncCatalog = (state: Account): Promise<AccountView> => {
    const epoch = secretEpoch
    const run = catalogTail.then(() => applyCatalog(state, epoch))
    catalogTail = run.catch(() => {})
    return run
  }

  /** 一条完整的退出流程：作废旧同步 → 删密钥 → 删账号文件 → 关门。 */
  const signOut = async (): Promise<void> => {
    secretEpoch += 1
    // 等已经开始的同步跑完：它们要么写完，要么看到新 epoch 直接返回；
    // 之后才开始删，删除后不会再有旧同步把它写回来。
    await catalogTail.catch(() => {})
    const before = await account.read()
    await purgeAccountSecrets(before)
    await account.logout()
    setReady(false)
  }

  /** 一次刷新：读状态 → 同步目录 → 返回给浏览器的视图。 */
  const refresh = async () => syncCatalog(await account.read())

  // The pinned carrier routes Workspace RPC and stream upgrades through the
  // same Host admission. Keep the carrier's origin/cookie checks for every route.
  const startupPaths = new Set(['entry.js', 'ready', 'methods', 'account', 'login/token']
    .map(path => clientPrefix + '/' + path))
  ctx.effect(() => {
    // cordis 把追踪代理背后的真实服务实例挂在 `Symbol.for('cordis.original')` 上。
    const ORIGINAL: unique symbol = Symbol.for('cordis.original')
    const connection: ConnectionSlice =
      (ctx.connection as { readonly [ORIGINAL]?: ConnectionSlice })[ORIGINAL] ?? ctx.connection
    const admit = connection.admit
    const ownAdmission = Object.getOwnPropertyDescriptor(connection, 'admit')
    const guarded = function (this: ConnectionSlice, request: IncomingMessage): PeerAdmission {
      const result = admit.call(this, request)
      if ('rejection' in result) return result
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      // 只有“确定关着”才拒。`undefined` 是启动后尚未读完账号的瞬间，放行。
      if (ready === false && !startupPaths.has(path)) {
        if (!closedNotice.has(path)) {
          closedNotice.add(path)
          console.warn(`[vexnar] 门禁拒绝 ${request.method ?? '?'} ${path}（未登录或登录已过期）`)
        }
        return { rejection: 401 }
      }
      const socket = request.socket
      if (request.headers.upgrade?.toLowerCase() === 'websocket' && socket && !activeSockets.has(socket)) {
        activeSockets.add(socket)
        socket.once('close', () => activeSockets.delete(socket))
      }
      return result
    }
    connection.admit = guarded
    return () => {
      setReady(false)
      if (connection.admit === guarded) {
        if (ownAdmission) Object.defineProperty(connection, 'admit', ownAdmission)
        // `delete` 需要一个可选属性，这里只把同一个对象换成可写视图看一次。
        else delete (connection as Partial<ConnectionSlice>).admit
      }
    }
  })

  // 未登录时整个工作区换成登录页：没有半登录状态，也没有"能动但全是空数据"的控制台。
  ctx.effect(() => ctx.webServer.tapIndex(html => ready === true
    ? html.replace('</head>', workspaceSessionScript + '</head>')
    : loginPage(platformOrigin())))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: clientPrefix + '/entry.js',
    handler: async (req, res) => {
      const rejection = ctx.connection.requestRejection(req)
      if (rejection || req.method !== 'GET') {
        res.writeHead(rejection || 405)
        return res.end()
      }
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(await loginClient)
    }
  }))

  // Keep ordinary settings available, but route provider writes and discovery
  // through VEXNAR's own model section. Exact owner-only HTTP routes precede Typert RPC.
  for (const method of ['update', 'replace', 'mutate', 'discoverModels']) {
    const rpcNamespace = method === 'discoverModels' ? 'llm' : 'settings'
    ctx.connection.fetch.register({
      path: `/api/${rpcNamespace}/${method}`, methods: ['POST'],
      fetch: async (request) => {
        const body: unknown = await request.json().catch(() => null)
        const message = clientRpcRequest(body, `${rpcNamespace}/${method}`)
        if (message === undefined) return new Response('invalid request', { status: 400 })
        const respond = (result: unknown) => Response.json({ type: 'server-response', rpcId: message.rpcId, result })
        if (rpcNamespace === 'llm' || message.args.ns === 'llm-pi-ai') {
          return respond({ ok: false, error: {
            code: 'settings/rejected', message: '请在 VEXNAR 的 设置 → 模型 中管理提供方', details: {}
          } })
        }
        const peer = ctx.connection.createPeer({ principal: { kind: 'owner' } })
        try {
          const value = await ctx.typertGateway.invoke({
            namespace: rpcNamespace, method, args: message.args, signal: request.signal, peer
          })
          return respond({ ok: true, value })
        } catch (error) {
          return respond({ ok: false, error: failureOf(error) })
        } finally {
          await peer.dispose()
        }
      }
    })
  }

  function route(suffix: string, handlers: RouteHandlers): void {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: clientPrefix + suffix,
      handler: async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(body))
        }
        const rejection = ctx.connection.requestRejection(req)
        if (rejection) return send(rejection, { error: '请从本机 VEXNAR 客户端访问' })
        // req.method 在 node 里总会有值；没有时按「方法不受支持」处理，与原来按
        // undefined 取不到处理器等价。
        const handler = req.method === undefined ? undefined : handlers[req.method]
        if (!handler) return send(405, { error: '请求方法不受支持' })
        // 只有带正文的请求才要求 JSON；DELETE /account 这类无正文调用不该被 415 拦住。
        const hasBody = Number(req.headers['content-length'] ?? 0) > 0 ||
          req.headers['transfer-encoding'] !== undefined
        if (hasBody && req.headers['content-type']?.split(';')[0] !== 'application/json') {
          return send(415, { error: '需要 application/json 请求' })
        }
        try {
          send(200, await handler(req))
        } catch (error) {
          // 账号层只会抛 PlatformError；其他异常也翻成人话，绝不把解析器原文丢给页面。
          const status = error instanceof PlatformError ? error.status : 502
          send(status, { error: error instanceof PlatformError ? error.message : 'VEXNAR 请求失败，请重试' })
        }
      }
    }))
  }

  route('/ready', { GET: () => ({ ready: ready === true }) })
  route('/methods', { GET: () => account.methods() })
  // 设置页「关于与更新」：版本号在宿主机侧读（打包时写进应用的构建版本），
  // 在线更新在宿主机侧查 GitHub——渲染进程里直接跨域请求 api.github.com 既多一份
  // CORS 依赖，也会把 token 选起的代理环境暴露给页面。
  route('/update/info', {
    GET: () => ({ version: currentVersion(), platform: `${process.platform}-${process.arch}` })
  })
  route('/update/check', {
    GET: async (req) => {
      if (new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('refresh') === '1') resetUpdateCache()
      return await checkForUpdate()
    }
  })
  route('/account', {
    // 打开设置时读取已保存的账户视图，凭据和模型配置由后台同步及写操作维护。
    GET: () => ready === true ? account.status() : refresh(),
    PATCH: async (req) => {
      const input = await readJson(req)
      return account.renewWithToken(bodyText(input, 'access_token'))
    },
    DELETE: async () => {
      await signOut()
      return syncCatalog(await account.read())
    }
  })
  route('/login/token', {
    POST: async (req) => {
      const input = await readJson(req)
      await account.loginWithToken(bodyText(input, 'access_token'))
      const view = await refresh()
      if (view.signed_in) console.log('vexnar: account-handoff')
      return view
    }
  })
  // 账号密码登录：直接打网关的 /api/user/login，用户在客户端里就能登，不必先去
  // 网页生成访问令牌。开启两步验证的账号会先拿到一个 challenge，登录页再要一次验证码。
  route('/login/password', {
    POST: async (req) => {
      const input = await readJson(req)
      const result = await account.password(bodyText(input, 'username'), bodyText(input, 'password'))
      // 挑战不是账号视图：原样回给登录页，由它切到验证码输入。
      if ('challenge' in result) return result
      const view = await refresh()
      if (view.signed_in) console.log('vexnar: account-handoff')
      return view
    }
  })
  route('/login/verify', {
    POST: async (req) => {
      const input = await readJson(req)
      await account.verify(bodyText(input, 'challenge'), bodyText(input, 'code'))
      const view = await refresh()
      if (view.signed_in) console.log('vexnar: account-handoff')
      return view
    }
  })
  // 退出登录的浏览器入口：清完密钥后 303 回登录页。
  // 用跳转而不是让页面自己 location.replace('/')，是因为浏览器可能还留着工作区的
  // index 缓存；带 ?signed-out=1 的目标 URL 一定是一次新请求，且登录页会说明原因。
  // GET 与 POST 都收：链接、表单、脚本都能用同一条路径，不存在"删一半"的中间态。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: clientPrefix + '/signout',
    handler: async (req, res) => {
      const rejection = ctx.connection.requestRejection(req)
      if (rejection) {
        res.writeHead(rejection, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        return res.end(JSON.stringify({ error: '请从本机 VEXNAR 客户端访问' }))
      }
      if (req.method !== 'GET' && req.method !== 'POST') {
        res.writeHead(405, { Allow: 'GET, POST', 'Cache-Control': 'no-store' })
        return res.end()
      }
      try {
        await signOut()
      } catch (error) {
        const status = error instanceof PlatformError ? error.status : 502
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        return res.end(JSON.stringify({ error: error instanceof PlatformError ? error.message : '退出登录失败，请重试' }))
      }
      res.writeHead(303, { Location: '/?signed-out=1', 'Cache-Control': 'no-store', Pragma: 'no-cache' })
      res.end()
    }
  }))
  route('/wallet', { GET: () => account.wallet() })
  route('/billing/options', { GET: () => billing.options() })
  route('/billing/quote', { POST: async (req) => billing.quote(await readJson(req)) })
  route('/billing/order', { POST: async (req) => billing.order(await readJson(req)) })
  route('/billing/status', { POST: async (req) => billing.status(bodyText(await readJson(req), 'request_id')) })
  route('/providers', {
    POST: async (req) => {
      const input = await readJson(req)
      await account.addProvider(providerInput(input))
      return syncCatalog(await account.read())
    },
    PATCH: async (req) => {
      const input = await readJson(req)
      await account.updateProvider(providerInput(input))
      return syncCatalog(await account.read())
    },
    DELETE: async (req) => {
      const input = await readJson(req)
      await account.removeProvider(bodyText(input, 'id'))
      return syncCatalog(await account.read())
    }
  })

  const refreshInBackground = () => void refresh().catch(() => {})
  ctx.effect(() => {
    const timer = setInterval(refreshInBackground, 15_000)
    timer.unref()
    refreshInBackground()
    return () => {
      clearInterval(timer)
      life.abort()
      void clearModelChannel().catch(() => {})
    }
  })
  return () => ready === true
}
