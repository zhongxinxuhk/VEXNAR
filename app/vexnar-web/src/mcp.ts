// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * MCP 工具面：Harness 与测试引擎之间**唯一**的入口。
 *
 * 四个核心工具 + 一个会话控制（关闭/暂停/恢复/加预算）。所有参数都过 zod；
 * 所有返回都不含 Cookie/Token——凭据只在 Vault 里，模型只拿到 sessionId。
 *
 * 协议与仓库既有 Go 实现对齐：POST /mcp，JSON-RPC 2.0，2025-06-18，Bearer + loopback。
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import {
  PolicyError, requestExecuteSchema, responseAnalyzeSchema, sessionControlSchema,
  sessionCreateSchema, sessionInspectSchema
} from './policy.ts'
import { z } from 'zod'
import type { WebTestingEngine } from './engine.ts'
import type { PolicyConfig } from './types.ts'

export const MCP_PROTOCOL_VERSION = '2025-06-18'

interface ToolResult {
  text: string
  structured?: unknown
  isError?: boolean
}

interface ToolDefinition {
  name: string
  title?: string
  description: string
  inputSchema: Record<string, unknown>
  call: (args: Record<string, unknown>, context: { agentSession: string }) => Promise<ToolResult>
}

function jsonSchema(shape: Record<string, unknown>): Record<string, unknown> {
  return { type: 'object', properties: shape, additionalProperties: true }
}

export function buildTools(engine: WebTestingEngine): ToolDefinition[] {
  return [
    {
      name: 'web_session_create',
      title: '创建测试会话',
      description: [
        '为一次授权测试创建隔离的 HTTP 会话（独立 CookieJar / 身份 / 预算）。',
        'origin 必须是单个站点（scheme://host[:port]）；不在白名单内会被拒绝。',
        '凭据优先用 auth_profile_id（服务端 VEXNAR_WEB_PROFILES 定义），其次是 auth 对象；两者都只进 Vault，不会回显。',
        'adversarial=true 会开启"被拦截后升级载荷/出口/身份"的对抗模式——必须由操作员先开平台开关并配 origin 白名单。'
      ].join(' '),
      inputSchema: jsonSchema({
        origin: { type: 'string', description: '授权目标，如 https://target.example' },
        label: { type: 'string', description: '人类可读名字' },
        request_budget: { type: 'integer', description: '本会话请求预算，默认取策略上限' },
        auth_profile_id: { type: 'string', description: '服务端定义的身份配置 id（推荐）' },
        auth: { type: 'object', description: '显式身份头（Bearer/Cookie 等），写入 Vault 后不回显' },
        adversarial: { type: 'boolean', description: '开启对抗升级（需平台授权 + origin 白名单）' },
        session: { type: 'string', description: '发起调用的 Harness 会话 id' }
      }),
      async call(args, context) {
        const input = sessionCreateSchema.parse(args)
        const { session, policy } = await engine.createSession({
          origin: input.origin,
          label: input.label,
          requestBudget: input.request_budget,
          authProfileId: input.auth_profile_id,
          auth: input.auth as Record<string, string> | undefined,
          adversarial: input.adversarial
        }, context.agentSession)
        return {
          text: [
            `会话 ${session.sessionId} 已创建：${session.origin}`,
            `预算 ${session.requestBudget} · 串行间隔 ≥${policy.minIntervalMs}ms · 窗口 ${policy.maxRequestsPerWindow}/${policy.windowSeconds}s`,
            `写操作 ${policy.allowWrite ? '允许（每次仍需 approved_write）' : '禁止'} · 攻击性载荷 ${policy.aggressivePayloads ? '允许' : '禁止'} · 重定向 ${policy.followRedirects}`,
            session.adversarial
              ? `对抗模式：开（上限 ${policy.adversarial.maxAttempts} 次尝试 / ${policy.adversarial.maxRotations} 次升级，出口策略 ${policy.egressMode}）`
              : '对抗模式：关（遇拦截即停；需要时由操作员授权后重建会话）'
          ].join('\n'),
          structured: { session, policy: publicPolicy(policy) }
        }
      }
    },
    {
      name: 'web_request_execute',
      title: '执行一次受控请求',
      description: [
        '在会话内执行一次 HTTP 请求。跨 origin、超预算、超窗口、未批准的写方法一律拒绝。',
        '只读请求会按 method+URL 指纹去重（5 分钟内），复用结果会标记 deduplicated=true 并可回溯到原请求。',
        '返回脱敏记录 + 响应片段 + 结构信号；遇到 429/挑战页会立刻把会话置 blocked。'
      ].join(' '),
      inputSchema: jsonSchema({
        session_id: { type: 'string' },
        method: { type: 'string', enum: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'] },
        path: { type: 'string', description: '相对路径或同源绝对 URL' },
        headers: { type: 'object' },
        body: { type: 'string' },
        approved_write: { type: 'boolean', description: '写方法必须显式 true' },
        aggressive: { type: 'boolean', description: '标记为攻击性测试（需策略授权）' },
        evade: { type: 'boolean', description: '本次启用对抗升级（需会话已开对抗模式）' },
        test_case_id: { type: 'string' },
        parent_request_id: { type: 'string' },
        note: { type: 'string' },
        session: { type: 'string' }
      }),
      async call(args, context) {
        const input = requestExecuteSchema.parse(args)
        const outcome = await engine.execute(input.session_id, {
          method: input.method,
          path: input.path,
          headers: input.headers,
          body: input.body,
          approvedWrite: input.approved_write,
          aggressive: input.aggressive,
          evade: input.evade,
          testCaseId: input.test_case_id,
          parentRequestId: input.parent_request_id,
          note: input.note
        }, context.agentSession)
        const { record, signals } = outcome
        return {
          text: [
            `${record.requestId} ${record.method} ${record.path} → ${record.status} (${record.classification}) ${record.durationMs}ms${record.deduplicated ? ' [deduplicated]' : ''}`,
            `往返 ${record.responseBytes}B${record.truncated ? '（已截断）' : ''} · 预算剩余 ${outcome.budgetLeft}${outcome.paused ? ' · 会话已自动暂停' : ''}`,
            outcome.attempts > 1
              ? `对抗升级 ${outcome.attempts - 1} 次：${outcome.evasion?.actions.join(' → ') ?? ''}${outcome.evasion?.stoppedReason ? `（停止：${outcome.evasion.stoppedReason}）` : ''}`
              : '',
            record.attempt > 1 ? `本记录为第 ${record.attempt} 次尝试（mutation=${record.mutation} egress=${record.egressId} identity=${record.identityId}）` : '',
            signals.title ? `标题：${signals.title}` : '',
            `结构：forms=${signals.forms} links=${signals.links} scripts=${signals.scripts} json=[${signals.jsonKeys.slice(0, 8).join(', ')}]`,
            signals.wafMarkers.length ? `拦截特征：${signals.wafMarkers.join(', ')}` : '',
            `片段：${outcome.excerpt.slice(0, 400)}`
          ].filter(Boolean).join('\n'),
          structured: outcome
        }
      }
    },
    {
      name: 'web_response_analyze',
      title: '分析响应',
      description: [
        '对已采集的响应做本地分析：structure 提取表单/链接/JSON 形状；diff 与基线对比状态码、长度、头部、正文变化与回显。',
        '分析只读本地密文证据，不会再发请求。'
      ].join(' '),
      inputSchema: jsonSchema({
        session_id: { type: 'string' },
        request_id: { type: 'string' },
        baseline_request_id: { type: 'string', description: 'diff 模式的基线请求' },
        mode: { type: 'string', enum: ['structure', 'diff', 'auto'] },
        session: { type: 'string' }
      }),
      async call(args, context) {
        const input = responseAnalyzeSchema.parse(args)
        const result = engine.analyze(input.session_id, input.request_id, {
          baselineRequestId: input.baseline_request_id,
          mode: input.mode
        }, context.agentSession)
        if (result.mode === 'diff' && result.diff) {
          const diff = result.diff
          return {
            text: [
              `差异 ${diff.baseline} → ${diff.candidate}`,
              `状态 ${diff.status.from} → ${diff.status.to} · 长度变化 ${diff.lengthDelta > 0 ? '+' : ''}${diff.lengthDelta}B · 正文${diff.bodyChanged ? '有' : '无'}变化`,
              `分类 ${diff.classification.from} → ${diff.classification.to}${diff.reflected ? ' · 标记已回显' : ''}`,
              diff.headerChanges.length ? `头部变化：${diff.headerChanges.map((item) => item.name).join(', ')}` : ''
            ].filter(Boolean).join('\n'),
            structured: result
          }
        }
        const structure = result.structure
        return {
          text: [
            `结构 ${result.requestId}：${structure?.title || '(无标题)'}`,
            `表单 ${structure?.forms.length ?? 0}：${(structure?.forms ?? []).slice(0, 5).map((form) => `${form.method} ${form.action}(${form.inputs.map((item) => item.name).filter(Boolean).join(',')})`).join(' | ')}`,
            `链接 ${structure?.links.length ?? 0} · 脚本 ${structure?.scripts.length ?? 0} · JSON 键 ${(structure?.jsonKeys ?? []).slice(0, 10).join(', ')}`,
            `片段：${result.excerpt.slice(0, 300)}`
          ].join('\n'),
          structured: result
        }
      }
    },
    {
      name: 'web_session_inspect',
      title: '查看会话',
      description: '查会话状态、预算余额、请求历史、分类统计与策略事件（限流/越界/重定向拦截）。可按 request_id 精查一条。',
      inputSchema: jsonSchema({
        session_id: { type: 'string' },
        include: { type: 'string', enum: ['history', 'stats', 'both'] },
        limit: { type: 'integer' },
        request_id: { type: 'string' },
        session: { type: 'string' }
      }),
      async call(args, context) {
        const input = sessionInspectSchema.parse(args)
        const snapshot = engine.inspect(input.session_id, { limit: input.limit, requestId: input.request_id }, context.agentSession)
        const stats = snapshot.stats
        const history = input.include === 'stats' ? [] : snapshot.history.slice(0, 10)
        return {
          text: [
            `会话 ${snapshot.session.sessionId} [${snapshot.session.status}] ${snapshot.session.origin}`,
            `请求 ${snapshot.session.requestCount}/${Math.min(snapshot.session.requestBudget, Number.MAX_SAFE_INTEGER)} · 剩余 ${snapshot.budgetLeft} · 平均 ${stats.avgDurationMs}ms`,
            `分类：${Object.entries(stats.byClassification).map(([key, value]) => `${key}=${value}`).join(' ') || '无'}`,
            history.length ? `最近：\n${history.map((row) => `${row.requestId} ${row.method} ${row.path} → ${row.status} ${row.classification}`).join('\n')}` : '',
            snapshot.policyEvents.length ? `策略事件：${snapshot.policyEvents.slice(0, 5).map((event) => `${event.kind}`).join(', ')}` : ''
          ].filter(Boolean).join('\n'),
          structured: snapshot
        }
      }
    },
    {
      name: 'web_evasion_report',
      title: '对抗效果报告',
      description: '汇总"拦截→升级→结果"：每种载荷变异/出口/身份的尝试与通过次数、升级成功的请求、最终仍被拦的请求。只描述观测结果，不承诺绕过。',
      inputSchema: jsonSchema({
        session_id: { type: 'string' },
        test_case_id: { type: 'string' },
        limit: { type: 'integer' },
        session: { type: 'string' }
      }),
      async call(args, context) {
        const input = z.object({
          session_id: z.string().min(1),
          test_case_id: z.string().max(120).optional(),
          limit: z.number().int().min(1).max(500).optional(),
          session: z.string().max(160).optional()
        }).parse(args)
        const report = engine.evasionReport(input.session_id, { testCaseId: input.test_case_id, limit: input.limit }, context.agentSession)
        const mutationLines = report.mutations.slice(0, 8).map((row) => `${row.key}:${row.passed}/${row.attempts}`)
        const egressLines = report.egresses.slice(0, 6).map((row) => `${row.key}:${row.passed}/${row.attempts}`)
        return {
          text: [
            `对抗模式 ${report.adversarial ? '开' : '关'} · 出口策略 ${report.egress_mode} · 上限 ${report.limits.maxAttempts}/${report.limits.maxRotations}`,
            `逻辑请求 ${report.totals.logical_requests} · 尝试 ${report.totals.attempts} · 升级过 ${report.totals.escalated} · 升级后通过 ${report.totals.passed_after_escalation} · 最终仍被拦 ${report.totals.blocked_final}`,
            `载荷通过率：${mutationLines.join(' ') || '无'}`,
            `出口通过率：${egressLines.join(' ') || '无'}`,
            report.escalations.length
              ? `升级样本：\n${report.escalations.slice(0, 5).map((item) => `${item.path} ${item.first}→${item.last} (${item.mutations.join(',') || 'payload 未变'})`).join('\n')}`
              : '尚无升级样本'
          ].join('\n'),
          structured: report
        }
      }
    },
    {
      name: 'web_session_control',
      title: '会话控制',
      description: '暂停 / 恢复 / 关闭会话，或增加预算。关闭会销毁 Vault 里的凭据并释放连接池。',
      inputSchema: jsonSchema({
        session_id: { type: 'string' },
        action: { type: 'string', enum: ['pause', 'resume', 'close', 'reset_budget'] },
        budget: { type: 'integer' },
        session: { type: 'string' }
      }),
      async call(args, context) {
        const input = sessionControlSchema.parse(args)
        const session = engine.control(input.session_id, input.action, { budget: input.budget }, context.agentSession)
        return {
          text: `会话 ${input.session_id} 已执行 ${input.action}，当前状态 ${session?.status ?? 'unknown'}`,
          structured: { session }
        }
      }
    }
  ]
}

function publicPolicy(policy: PolicyConfig): Record<string, unknown> {
  return {
    allowed_origins: policy.allowedOrigins,
    allow_private_network: policy.allowPrivateNetwork,
    max_requests_per_session: policy.maxRequestsPerSession,
    max_requests_per_window: policy.maxRequestsPerWindow,
    window_seconds: policy.windowSeconds,
    min_interval_ms: policy.minIntervalMs,
    max_response_bytes: policy.maxResponseBytes,
    request_timeout_ms: policy.requestTimeoutMs,
    allow_write: policy.allowWrite,
    follow_redirects: policy.followRedirects,
    aggressive_payloads: policy.aggressivePayloads
  }
}

export interface McpServerOptions {
  engine: WebTestingEngine
  token: string
  port?: number
  host?: string
}

export interface RunningMcpServer {
  url: string
  tools: string[]
  close: () => Promise<void>
}

export async function startMcpServer(options: McpServerOptions): Promise<RunningMcpServer> {
  const tools = buildTools(options.engine)
  const byName = new Map(tools.map((tool) => [tool.name, tool]))
  if (!options.token) throw new Error('web MCP 需要令牌：设置 VEXNAR_WEB_MCP_TOKEN 或 VEXNAR_DESKTOP_TOKEN')
  const port = options.port ?? Number(process.env.VEXNAR_WEB_MCP_PORT ?? 8792)
  const host = options.host ?? '127.0.0.1'

  const server: Server = createServer((req, res) => { void handle(req, res) })

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const remote = req.socket.remoteAddress ?? ''
    if (!/^(127\.|::1|::ffff:127\.)/.test(remote)) return writeJson(res, 403, rpcError(null, -32001, 'loopback only'))
    if (!authorized(req, options.token)) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="vexnar-web"')
      return writeJson(res, 401, rpcError(null, -32001, 'unauthorized'))
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      res.statusCode = 405
      res.end()
      return
    }
    let payload: any
    try {
      payload = JSON.parse(await readBody(req))
    } catch {
      return writeJson(res, 400, rpcError(null, -32700, 'parse error'))
    }
    const requests = Array.isArray(payload) ? payload : [payload]
    const responses: unknown[] = []
    for (const request of requests) {
      if (!request || typeof request.method !== 'string') {
        responses.push(rpcError(request?.id ?? null, -32600, 'invalid request'))
        continue
      }
      if (request.id === undefined || request.id === null) continue
      responses.push(await dispatch(request, req))
    }
    if (!responses.length) {
      res.statusCode = 202
      res.end()
      return
    }
    writeJson(res, 200, Array.isArray(payload) ? responses : responses[0])
  }

  async function dispatch(request: any, req: IncomingMessage): Promise<unknown> {
    const id = request.id ?? null
    const headerSession = String(req.headers['x-vexnar-session'] ?? '').trim()
    if (request.method === 'initialize') {
      return {
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'vexnar-web', version: '1.0.0' }
        }
      }
    }
    if (request.method === 'ping') return { jsonrpc: '2.0', id, result: {} }
    if (request.method === 'tools/list') {
      return {
        jsonrpc: '2.0', id,
        result: {
          tools: tools.map((tool) => ({
            name: tool.name,
            ...(tool.title ? { title: tool.title } : {}),
            description: tool.description,
            inputSchema: tool.inputSchema
          }))
        }
      }
    }
    if (request.method !== 'tools/call') return rpcError(id, -32601, `method not found: ${request.method}`)

    const name = String(request.params?.name ?? '')
    const tool = byName.get(name)
    if (!tool) return rpcError(id, -32602, `unknown tool: ${name}`)
    const args = (request.params?.arguments ?? {}) as Record<string, unknown>
    const agentSession = String(args.session ?? headerSession ?? 'mcp')
    try {
      const result = await tool.call({ ...args, session: agentSession }, { agentSession })
      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: result.text }],
          ...(result.structured !== undefined ? { structuredContent: result.structured } : {}),
          isError: Boolean(result.isError)
        }
      }
    } catch (error) {
      const shaped = error instanceof PolicyError
        ? { message: `${error.code}: ${error.message}`, status: error.status }
        : { message: (error as Error).message, status: 500 }
      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: `工具执行失败（${shaped.message}）` }],
          isError: true
        }
      }
    }
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve())
  })
  const address = server.address()
  const actualPort = typeof address === 'object' && address ? address.port : port
  return {
    url: `http://${host}:${actualPort}/mcp`,
    tools: tools.map((tool) => tool.name),
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

function authorized(req: IncomingMessage, token: string): boolean {
  const header = String(req.headers.authorization ?? '')
  const fromHeader = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const fromCustom = String(req.headers['x-vexnar-mcp-token'] ?? '').trim()
  const got = fromHeader || fromCustom
  if (!got || got.length !== token.length) return false
  let diff = 0
  for (let index = 0; index < got.length; index++) diff |= got.charCodeAt(index) ^ token.charCodeAt(index)
  return diff === 0
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8')
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error('请求体过大'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

function rpcError(id: unknown, code: number, message: string): unknown {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}
