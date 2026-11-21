// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * vexnar-egress — 把代理池的能力注入 dsh agent。
 *
 * Go 引擎曾给 agent 注入了出口环境与 fanout 工具；dsh 里没有“改内置 bash 环境”的
 * 接缝，所以这里用 dsh 自己的工具面补齐：
 *
 *   - egress_exec      在带 HTTP(S)_PROXY 的 shell 里跑命令（用 dsh 的 shell 执行器）
 *   - egress_status    当前池/节点/会话出口与引擎状态
 *   - fanout_fetch     对抗模式：K 路并发取首个通过 WAF 的响应
 *   - pivot_add        渗透中登记 SOCKS5/HTTP 跳板（可经现有节点链式拨号）
 *   - browser_proxy    为 Playwright MCP 等只能配静态代理的客户端开固定端口
 *
 * 控制面仍在 core 的 /api/proxy/*；本插件不复制节点/池状态。
 */

export const name = 'vexnar-egress'

export const inject = ['tools']

type Logger = { warn?: (message: string) => void }

type ToolExec = {
  signal?: AbortSignal
  agent?: { session?: { id?: string } }
  [key: string]: unknown
}

type CoreBridge = {
  request(path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }): Promise<any>
}

type ToolContext = {
  vexnarCore?: CoreBridge
  tools: { register(tool: Record<string, unknown>): () => void }
  shell?: {
    resolve(request: Record<string, unknown>): Record<string, unknown>
    execute(spec: Record<string, unknown>): Promise<{ result(): Promise<ShellResult> }>
  }
  shellEnv?: { collect(exec: ToolExec): Record<string, string> }
  get(name: string): unknown
  inject(names: string[], callback: (ctx: ToolContext) => void): void
}

type ShellResult = {
  exitCode: number | null
  timedOut: boolean
  aborted: boolean
  stdout: { text: string }
  stderr: { text: string }
}

type Config = {
  coreUrl: string
  token: string
  tokenEnv: string
  taskIdEnv: string
  defaultTaskId: number
  requestTimeoutMs: number
  maxOutputBytes: number
}

const DEFAULTS: Config = {
  coreUrl: 'http://127.0.0.1:8790',
  token: '',
  tokenEnv: 'VEXNAR_API_TOKEN',
  taskIdEnv: 'VEXNAR_TASK_ID',
  defaultTaskId: 0,
  requestTimeoutMs: 60_000,
  maxOutputBytes: 32 * 1024
}

let config: Config = { ...DEFAULTS }
let bridge: CoreBridge | undefined

function authHeaders(): Record<string, string> {
  const token = config.token || (config.tokenEnv ? (process.env[config.tokenEnv] ?? '') : '')
  return token ? { 'x-vexnar-token': token } : {}
}

async function core(path: string, init: RequestInit = {}): Promise<any> {
  if (bridge) {
    const payload = typeof init.body === 'string' && init.body !== '' ? JSON.parse(init.body) : undefined
    return bridge.request(path, {
      method: init.method,
      body: payload,
      headers: init.headers as Record<string, string> | undefined
    })
  }
  const response = await fetch(new URL(path, config.coreUrl), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...authHeaders(),
      ...(init.headers as Record<string, string> | undefined)
    },
    signal: init.signal ?? AbortSignal.timeout(config.requestTimeoutMs)
  })
  const text = await response.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!response.ok) {
    const message = data?.error ?? data?.raw ?? `HTTP ${response.status}`
    throw new Error(`core ${path}: ${message}`)
  }
  return data
}

function taskId(args: Record<string, unknown>, exec: ToolExec): number {
  const explicit = Number(args.task_id ?? 0)
  if (explicit > 0) return explicit
  const env = Number(config.taskIdEnv ? (process.env[config.taskIdEnv] ?? 0) : 0)
  if (env > 0) return env
  if (config.defaultTaskId > 0) return config.defaultTaskId
  const session = String(exec.agent?.session?.id ?? '')
  return session ? 0 : 0
}

function scopeOf(args: Record<string, unknown>, exec: ToolExec): string {
  const explicit = String(args.scope ?? '').trim()
  if (explicit) return explicit
  const session = String(exec.agent?.session?.id ?? '').trim()
  return session ? `dsh-${session}` : ''
}

async function sessionProxy(args: Record<string, unknown>, exec: ToolExec): Promise<{ proxy: string; session: string }> {
  const body = {
    task_id: taskId(args, exec),
    pool_id: Number(args.pool_id ?? 0) || undefined,
    scope: scopeOf(args, exec),
    mode: String(args.mode ?? 'sticky'),
    max_conns: Number(args.max_conns ?? 8) || 8
  }
  return core('/api/proxy/session', { method: 'POST', body: JSON.stringify(body) })
}

function text(value: unknown): Array<{ type: 'text'; text: string }> {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
}

function output(schema: Record<string, unknown> = { type: 'object', additionalProperties: true }): Record<string, unknown> {
  return { schema, render: (_args: unknown, value: unknown) => text(value) }
}

function clip(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}\n…[truncated ${value.length - limit} bytes]` : value
}

function registerTools(ctx: ToolContext): void {
  ctx.tools.register({
    name: 'egress_status',
    description:
      'Inspect the VEXNAR egress proxy pool: engine availability, pools, nodes (including pivot/chain), bindings and live sessions. Use before choosing an egress path for a task.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        task_id: { type: 'integer', description: 'Task id whose binding/pool should be highlighted.' }
      }
    },
    output: output(),
    async execute(args: Record<string, unknown>): Promise<unknown> {
      const state = await core('/api/proxy/state')
      const settings = await core('/api/proxy/settings')
      const id = Number(args.task_id ?? 0) || undefined
      return {
        engine: state.engine,
        gateway: state.gateway,
        socks: state.socks,
        default_pool: settings.default_pool,
        listener_auth: settings.egress_listener_auth,
        pools: (state.pools ?? []).map((pool: any) => ({
          id: pool.id,
          name: pool.name,
          mode: pool.mode_default,
          nodes: pool.node_count,
          healthy: pool.healthy_count
        })),
        nodes: (state.nodes ?? []).map((node: any) => ({
          id: node.id,
          name: node.name,
          protocol: node.protocol,
          server: `${node.server}:${node.port}`,
          state: node.state,
          source: node.source,
          via_node_id: node.via_node_id || undefined
        })),
        binding: id ? (state.bindings ?? []).find((b: any) => Number(b.task_id) === id) : undefined,
        sessions: (state.sessions ?? []).filter((session: any) => !id || Number(session.task_id) === id)
      }
    }
  })

  ctx.tools.register({
    name: 'fanout_fetch',
    description:
      'Fetch a URL through K proxy nodes concurrently and return the first response that is not blocked by a WAF/interstitial. Use for idempotent (GET/HEAD/OPTIONS) requests when a single node may be filtered.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['url'],
      properties: {
        url: { type: 'string', description: 'Absolute http(s) URL.' },
        method: { type: 'string', description: 'HTTP method; non-idempotent methods are limited to one node.' },
        headers: { type: 'object', additionalProperties: { type: 'string' }, description: 'Request headers.' },
        body: { type: 'string', description: 'Request body for non-GET methods.' },
        k: { type: 'integer', description: 'Concurrent node count (1-8, default pool fanout_k).' },
        task_id: { type: 'integer', description: 'Task whose bound pool is used.' }
      }
    },
    output: output(),
    async execute(args: Record<string, unknown>): Promise<unknown> {
      return core('/api/proxy/fanout', {
        method: 'POST',
        body: JSON.stringify({
          task_id: Number(args.task_id ?? 0) || taskId(args, {} as ToolExec),
          url: String(args.url),
          method: String(args.method ?? 'GET'),
          headers: args.headers ?? {},
          body: args.body ?? '',
          k: Number(args.k ?? 0) || undefined
        })
      })
    }
  })

  ctx.tools.register({
    name: 'pivot_add',
    description:
      'Register a SOCKS5/HTTP pivot (SSH -D, C2 socks, frp, etc.) as an egress node and optionally add it to a pool. Set via_node_id to chain the pivot behind an existing node, so the pivot endpoint itself is reached through that hop.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['server', 'port'],
      properties: {
        name: { type: 'string', description: 'Display name; defaults to pivot-server:port.' },
        protocol: { type: 'string', enum: ['socks5', 'http'], description: 'Pivot protocol (default socks5).' },
        server: { type: 'string', description: 'Pivot host or IP.' },
        port: { type: 'integer', description: 'Pivot port.' },
        username: { type: 'string', description: 'Optional proxy username.' },
        password: { type: 'string', description: 'Optional proxy password.' },
        via_node_id: { type: 'integer', description: 'Existing node id to reach the pivot through (chain).' },
        pool_id: { type: 'integer', description: 'Pool to add the node to; defaults to the default pool.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags; defaults to ["pivot"].' }
      }
    },
    output: output(),
    async execute(args: Record<string, unknown>): Promise<unknown> {
      return core('/api/proxy/pivots', { method: 'POST', body: JSON.stringify(args) })
    }
  })

  ctx.tools.register({
    name: 'browser_proxy',
    description:
      'Open a no-auth loopback HTTP proxy bound to this session and return its URL. Use it for Playwright MCP or other clients that can only take a static --proxy-server value.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        task_id: { type: 'integer', description: 'Task whose binding/pool is used.' },
        pool_id: { type: 'integer', description: 'Pool override.' }
      }
    },
    output: output(),
    async execute(args: Record<string, unknown>, exec: ToolExec): Promise<unknown> {
      const result = await core('/api/proxy/fixed', {
        method: 'POST',
        body: JSON.stringify({
          task_id: taskId(args, exec),
          pool_id: Number(args.pool_id ?? 0) || undefined,
          scope: scopeOf(args, exec)
        })
      })
      return { ...result, hint: 'Pass this URL as --proxy-server to Playwright MCP; it has no credentials.' }
    }
  })

  // shell 执行器可能尚未挂载（例如纯规划 agent），exec 工具按需注册。
  ctx.inject(['shell'], (shellCtx) => {
    shellCtx.tools.register({
      name: 'egress_exec',
      description:
        'Run a shell command with HTTP_PROXY/HTTPS_PROXY/ALL_PROXY pointing at this session\'s egress proxy. Use it for curl, nuclei, ffuf, sqlmap and other tools that honor proxy environment variables.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['command'],
        properties: {
          command: { type: 'string', description: 'Shell command; runs via bash -c.' },
          workdir: { type: 'string', description: 'Working directory override.' },
          timeout_ms: { type: 'integer', description: 'Timeout in milliseconds.' },
          task_id: { type: 'integer', description: 'Task whose binding/pool is used.' },
          pool_id: { type: 'integer', description: 'Pool override.' }
        }
      },
      output: output(),
      async execute(args: Record<string, unknown>, exec: ToolExec): Promise<unknown> {
        if (!shellCtx.shell) throw new Error('egress_exec: shell executor is not mounted')
        const session = await sessionProxy(args, exec)
        const proxy = session.proxy
        const env: Record<string, string> = {
          HTTP_PROXY: proxy,
          HTTPS_PROXY: proxy,
          ALL_PROXY: proxy,
          NO_PROXY: '127.0.0.1,localhost,::1',
          VEXNAR_EGRESS_PROXY: proxy,
          VEXNAR_EGRESS_SESSION: session.session
        }
        const request: Record<string, unknown> = {
          command: String(args.command),
          workdir: args.workdir == null ? undefined : String(args.workdir),
          timeoutMs: Number(args.timeout_ms ?? 0) || undefined,
          env,
          signal: exec.signal
        }
        if (shellCtx.shellEnv) request.dshEnv = shellCtx.shellEnv.collect(exec)
        const spec = shellCtx.shell.resolve(request)
        const execution = await shellCtx.shell.execute(spec)
        const result = await execution.result()
        return {
          exit_code: result.exitCode,
          timed_out: result.timedOut,
          aborted: result.aborted,
          proxy: proxy.replace(/\/\/[^@]+@/, '//***@'),
          stdout: clip(String(result.stdout?.text ?? ''), config.maxOutputBytes),
          stderr: clip(String(result.stderr?.text ?? ''), config.maxOutputBytes)
        }
      }
    })
  })

  ctx.tools.register({
    name: 'egress_proxy',
    description:
      'Return the credentialed proxy URL and SOCKS address for this session, for tools that accept --proxy but are not run through egress_exec.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        task_id: { type: 'integer', description: 'Task whose binding/pool is used.' },
        pool_id: { type: 'integer', description: 'Pool override.' }
      }
    },
    output: output(),
    async execute(args: Record<string, unknown>, exec: ToolExec): Promise<unknown> {
      const state = await core('/api/proxy/state')
      const session = await sessionProxy(args, exec)
      return { proxy: session.proxy, socks: state.socks ?? '', session: session.session }
    }
  })
}

export function apply(ctx: ToolContext, userConfig: Partial<Config> = {}, logger?: Logger): void {
  config = { ...DEFAULTS, ...userConfig }
  const coreUrl = new URL(config.coreUrl)
  if (coreUrl.hostname !== '127.0.0.1' && coreUrl.hostname !== 'localhost' && coreUrl.hostname !== '::1') {
    logger?.warn?.(`vexnar-egress: coreUrl ${config.coreUrl} is not loopback; proxy credentials will cross the network`)
  }
  ctx.inject(['vexnarCore'], (bridgeCtx) => {
    bridge = bridgeCtx.vexnarCore
  })
  registerTools(ctx)
}
