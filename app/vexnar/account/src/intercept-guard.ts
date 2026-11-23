// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 把「设置 → 拦截规则」接到 dsh 的工具调用管线上。
 *
 * 规则只被存下来是不够的：dsh 的工具调用不会自己去问 core。这里注册一个
 * `tools/pre-execute` 监听器（dsh 的文档语义：`deny` 拦下、`ask` 走审批、
 * `allow` 放行），在每次工具调用前用规则快照做判定，并把结果写回
 * `/api/intercept/decisions`，于是「拦截审批 → 历史」里能看到每条规则的战果。
 *
 * 三条硬约束：
 *   - 判定是同步的：快照后台刷新，调用路径上不做 IO（除了 ask 的审批与留痕）；
 *   - 失败即放行：读不到规则时用上一份快照，首次读不到时按"没有规则"处理——
 *     拦截是加固项，不能让规则服务的一次抖动变成所有人的工具都用不了；
 *   - ask 走 VEXNAR 自己的审批队列：写一条 pending 记录，轮询它在「拦截审批」里
 *     的结果；没人处理就按规则的 timeout_action 收尾，创建失败则按拒绝处理。
 *     不走 dsh 的 approval 服务是有意的——它在 danger-full-access 策略下是
 *     `never`，会把所有 ask 直接拒掉，用户根本没有机会点"允许"。
 */

import {
  DEFAULT_INTERCEPT_TOOLS,
  compileRules,
  decide,
  emptySnapshot,
  ruleOf,
  type CompiledRule,
  type Decision,
  type RuleSnapshot
} from './intercept.js'

/** `tools/pre-execute` 传进来的那次调用（只取本模块用到的字段）。 */
export interface ToolExecutionLike {
  readonly name: string
  readonly arguments?: unknown
  readonly agent?: unknown
  readonly callId?: unknown
  readonly signal?: AbortSignal
}

/** `tools/pre-execute` 的返回值；这里只产生 allow / deny / ask 三种。 */
export type PreToolDecisionLike =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'ask'; reason?: string; displayReason?: { readonly en: string; readonly [locale: string]: string } }

/** 插件上下文里本模块用到的那一面。 */
export interface InterceptHostContext {
  on: (event: 'tools/pre-execute', listener: (exec: ToolExecutionLike, next: () => Promise<PreToolDecisionLike>) => Promise<PreToolDecisionLike>) => () => boolean
  effect: (body: () => (() => void) | void) => void
}

/** 进程内 core 请求面（与 `vexnarCore.request` 同形）。 */
export type CoreRequest = (path: string, init?: { method?: string; body?: unknown }) => Promise<unknown>

/** 未配置时限的 ask 也有一个兜底上限：工具调用不能永远挂着。 */
const ASK_MAX_MS = 30 * 60 * 1000
/** 轮询 pending 记录的间隔。 */
const ASK_POLL_MS = 500

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface PendingRow {
  id?: number
  status?: string
}

interface RulesResponse {
  rules?: unknown
}

interface ToolConfigResponse {
  enabled_tools?: unknown
}

export interface InterceptGuard {
  /** 立刻刷新一次快照；测试与设置页保存后可主动调用。 */
  refresh: () => Promise<void>
  /** 当前生效的快照（只读用途：诊断、测试断言）。 */
  snapshot: () => RuleSnapshot
}

const REFRESH_MS = 2000

/** 把一次判定写成一条已决定的拦截记录；失败不影响工具调用结果。 */
function journal(coreRequest: CoreRequest) {
  return (rule: CompiledRule | undefined, toolName: string, args: unknown, status: 'allowed' | 'denied' | 'timeout', message: string): void => {
    const body = {
      rule_id: rule?.id ?? null,
      tool_name: toolName,
      tool_input: args,
      status,
      message,
      decision_source: 'rule'
    }
    void coreRequest('/api/intercept/decisions', { method: 'POST', body }).catch(() => {})
  }
}

/**
 * 注册拦截监听器，返回快照控制面。
 *
 * 在账号插件的 `apply` 里调用一次；进程内只应有一个实例，重复注册会让同一次
 * 调用被判两遍（不会放行更宽，但会重复留痕）。
 */
export function registerInterceptGuard(
  ctx: InterceptHostContext,
  coreRequest: CoreRequest,
  options: { pollMs?: number } = {}
): InterceptGuard {
  const pollMs = Math.max(1, options.pollMs ?? ASK_POLL_MS)
  let snapshot: RuleSnapshot = emptySnapshot()
  let inflight: Promise<void> | undefined
  const log = journal(coreRequest)

  /**
   * 刷新快照。并发调用共享同一次读取：设置页保存后主动 refresh 时，必须等到
   * 那份新规则真的落地，而不是因为"已经有一次在飞"就立刻返回旧快照。
   */
  const refresh = (): Promise<void> => {
    if (inflight !== undefined) return inflight
    inflight = (async () => {
      try {
        const [rulesBody, configBody] = await Promise.all([
          coreRequest('/api/intercept/rules'),
          coreRequest('/api/intercept/tool-config')
        ])
        const rows = (rulesBody as RulesResponse | null)?.rules
        const tools = (configBody as ToolConfigResponse | null)?.enabled_tools
        const rules = Array.isArray(rows)
          ? compileRules(rows.map((row) => ruleOf(row as Record<string, unknown>)))
          : []
        snapshot = {
          rules,
          tools: Array.isArray(tools) ? tools.map(String) : [...DEFAULT_INTERCEPT_TOOLS],
          loadedAt: Date.now()
        }
      } catch {
        // core 还没起来或这次读失败：保留上一份快照（首次为空 = 没有规则可匹配）。
      }
    })().finally(() => { inflight = undefined })
    return inflight
  }

  const deny = (reason: string): PreToolDecisionLike => ({ kind: 'deny', reason })

  const evaluate = async (exec: ToolExecutionLike): Promise<Decision> =>
    decide(snapshot.rules, snapshot.tools, exec.name, exec.arguments)

  const handler = async (exec: ToolExecutionLike, next: () => Promise<PreToolDecisionLike>): Promise<PreToolDecisionLike> => {
    const decision = await evaluate(exec)
    if (decision.kind === 'pass') return next()

    if (decision.kind === 'allow') {
      log(decision.rule, exec.name, exec.arguments, 'allowed', `拦截规则 [${decision.rule.name}] 放行`)
      return next()
    }

    if (decision.kind === 'deny') {
      log(decision.rule, exec.name, exec.arguments, 'denied', decision.message)
      return deny(decision.message)
    }

    // ask：写一条 pending 记录，等「拦截审批」给出结果；超时按规则收尾。
    const rule = decision.rule
    const timeoutMs = rule.timeout_enabled && rule.timeout_seconds > 0 ? rule.timeout_seconds * 1000 : ASK_MAX_MS
    const started = Date.now()
    let pendingID = 0
    try {
      const created = await coreRequest('/api/intercept/pending', {
        method: 'POST',
        body: {
          rule_id: rule.id,
          tool_name: exec.name,
          tool_input: exec.arguments,
          message: decision.message,
          decision_source: 'rule'
        }
      }) as PendingRow | null
      pendingID = Number(created?.id)
      if (!Number.isInteger(pendingID) || pendingID <= 0) throw new Error('审批记录创建失败')
    } catch {
      // 连 pending 都写不进去时不能放行：那等于 ask 规则被静默绕过。
      const reason = `${decision.message}（审批记录创建失败，已按拒绝处理）`
      log(rule, exec.name, exec.arguments, 'denied', reason)
      return deny(reason)
    }

    const settle = async (value: 'allowed' | 'denied'): Promise<void> => {
      await coreRequest(`/api/intercept/pending/${pendingID}/decide`, { method: 'POST', body: { decision: value } }).catch(() => {})
    }

    while (true) {
      if (exec.signal?.aborted === true) {
        await settle('denied')
        return deny(decision.message)
      }
      const row = await coreRequest(`/api/intercept/pending/${pendingID}`).catch(() => undefined) as PendingRow | undefined
      const status = String(row?.status ?? 'pending')
      if (status === 'allowed') return next()
      if (status === 'denied' || status === 'timeout') return deny(decision.message)
      const remaining = timeoutMs - (Date.now() - started)
      if (remaining <= 0) {
        const allowed = rule.timeout_action === 'allow'
        await settle(allowed ? 'allowed' : 'denied')
        return allowed ? next() : deny(`${decision.message}（审批超时）`)
      }
      await sleep(Math.min(pollMs, remaining))
    }
  }

  ctx.effect(() => {
    const off = ctx.on('tools/pre-execute', handler)
    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    timer.unref?.()
    return () => {
      off()
      clearInterval(timer)
    }
  })

  return { refresh, snapshot: () => snapshot }
}
