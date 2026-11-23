// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 拦截规则在 dsh 运行时的执行面。
 *
 * 规则本身住在 core 的 meta 存储里（设置 → 拦截规则写的就是那份），匹配语义与
 * Go 的 `intercept.Interceptor` 逐条对齐：按优先级从高到低取第一条命中的启用
 * 规则，`tool_name` 比工具名、`tool_input` 比参数的 JSON 文本，`string` 是包含、
 * `regex` 是 RE2 风格正则（这里用 JS 编译，内联 flag 先中和）。
 *
 * 与 Go 的差别只有一个，但很关键：**工具名**。Go 侧看到的是 Claude 风格的
 * `Bash` / `Write` / `Edit`，dsh 注册的是 `bash` / `write` / `edit`。同一份规则
 * 在两个运行时都要生效，所以这里做大小写无关的比较，并用别名表把两套命名接起来。
 */

export type MatchTarget = 'tool_name' | 'tool_input'
export type MatchType = 'string' | 'regex'
export type RuleAction = 'allow' | 'deny' | 'ask'

export interface InterceptRule {
  id: number
  name: string
  enabled: boolean
  priority: number
  match_target: MatchTarget
  match_type: MatchType
  pattern: string
  action: RuleAction
  message: string
  timeout_enabled: boolean
  timeout_seconds: number
  timeout_action: 'allow' | 'deny'
}

/** 没保存过拦截范围时生效的清单，与 Go 的 defaultEnabledTools 同一份。 */
export const DEFAULT_INTERCEPT_TOOLS: readonly string[] = [
  'Bash',
  'WebFetch',
  'web_search',
  'shell_open',
  'shell_send',
  'Write',
  'Edit',
  'MultiEdit'
]

/**
 * 同一件工具在两套命名里的写法（小写为准）。
 *
 * Go/Claude 的 `MultiEdit` 在 dsh 里对应 `edit` 与 `apply_patch` 两个工具；
 * 终端的 `shell_open` / `shell_send` 对应 `terminal_open` / `terminal_send`。
 */
const TOOL_ALIASES: Readonly<Record<string, readonly string[]>> = {
  bash: ['bash', 'shell'],
  write: ['write'],
  edit: ['edit', 'multiedit', 'apply_patch', 'str_replace_editor'],
  multiedit: ['multiedit', 'edit', 'apply_patch'],
  webfetch: ['webfetch', 'web_fetch'],
  web_fetch: ['web_fetch', 'webfetch'],
  web_search: ['web_search'],
  shell_open: ['shell_open', 'terminal_open'],
  shell_send: ['shell_send', 'terminal_send'],
  shell_read: ['shell_read', 'terminal_read'],
  shell_close: ['shell_close', 'terminal_close'],
  shell_list: ['shell_list', 'terminal_list'],
  terminal_open: ['terminal_open', 'shell_open'],
  terminal_send: ['terminal_send', 'shell_send'],
  terminal_read: ['terminal_read', 'shell_read'],
  terminal_close: ['terminal_close', 'shell_close'],
  terminal_list: ['terminal_list', 'shell_list']
}

/** 一个工具名在这套命名里的全部等价写法（含原名），小写。 */
export function toolAliases(name: string): string[] {
  const key = name.trim().toLowerCase()
  return [...new Set([key, ...(TOOL_ALIASES[key] ?? [])])]
}

/** 工具是否进入拦截范围：范围里写的是任意一种等价命名都算命中。 */
export function isToolInScope(tools: readonly string[], name: string): boolean {
  if (tools.length === 0) return false
  const aliases = new Set(toolAliases(name))
  return tools.some((candidate) => aliases.has(candidate.trim().toLowerCase()))
}

/** 编译后的规则：正则只编译一次，坏正则按 Go 的行为跳过而不是让整份规则失效。 */
export interface CompiledRule extends InterceptRule {
  regex?: RegExp
}

/**
 * 把 RE2 的内联 flag 翻成 JS 的正则 flag，再交给 JS 编译；编不过的规则跳过。
 *
 * 规则里的 `(?i)` 是增强包最常见的写法，语义是"整个表达式忽略大小写"。JS 的
 * RegExp 不认内联 flag，直接删掉会让规则从"忽略大小写"变成"区分大小写"——看起来
 * 能跑，实际漏拦。所以开头的全局 flag 组被提取成 new RegExp 的 flags；
 * 作用域写法 `(?i:...)` 只能退化成非捕获组（JS 没有局部 flag 之前无法等价）。
 */
export function compileRule(rule: InterceptRule): CompiledRule | undefined {
  if (!rule.enabled) return undefined
  if (rule.match_type !== 'regex') return { ...rule }
  let pattern = rule.pattern
  let flags = 'u'
  const global = /^\(\?([ims]+)\)/.exec(pattern)
  if (global) {
    for (const flag of global[1] ?? '') if (!flags.includes(flag)) flags += flag
    pattern = pattern.slice(global[0].length)
  }
  const neutral = pattern.replace(/\(\?[imsUx-]+\)/g, '').replace(/\(\?[imsUx-]+:/g, '(?:')
  try {
    return { ...rule, regex: new RegExp(neutral, flags) }
  } catch {
    return undefined
  }
}

/** 一份规则 → 可匹配的列表（优先级高的在前，同优先级按 id 稳定）。 */
export function compileRules(rules: readonly InterceptRule[]): CompiledRule[] {
  return rules
    .map(compileRule)
    .filter((rule): rule is CompiledRule => rule !== undefined)
    .sort((a, b) => b.priority - a.priority || a.id - b.id)
}

export type Decision =
  | { kind: 'allow'; rule: CompiledRule }
  | { kind: 'deny'; rule: CompiledRule; message: string }
  | { kind: 'ask'; rule: CompiledRule; message: string }
  /** 没进范围或没有规则命中：交回给 dsh 自己的审批策略。 */
  | { kind: 'pass' }

/** 规则没写 message 时的默认文案，与 Go 的 defaultMessage 一致。 */
export function defaultMessage(action: RuleAction, name: string): string {
  if (action === 'deny') return `拦截规则 [${name}] 禁止执行此工具`
  if (action === 'ask') return `拦截规则 [${name}] 要求用户审批`
  return ''
}

function matches(rule: CompiledRule, toolName: string, input: string): boolean {
  const subject = rule.match_target === 'tool_name' ? toolName : input
  if (rule.match_target !== 'tool_name' && rule.match_target !== 'tool_input') return false
  if (rule.match_type === 'regex') return rule.regex !== undefined && rule.regex.test(subject)
  return subject.includes(rule.pattern)
}

/** 一次工具调用的规则判定。`tools` 是拦截范围。 */
export function decide(
  rules: readonly CompiledRule[],
  tools: readonly string[],
  toolName: string,
  args: unknown
): Decision {
  if (!isToolInScope(tools, toolName)) return { kind: 'pass' }
  const input = typeof args === 'string' ? args : JSON.stringify(args ?? {})
  for (const rule of rules) {
    if (!matches(rule, toolName, input)) continue
    if (rule.action === 'allow') return { kind: 'allow', rule }
    const message = rule.message.trim() !== '' ? rule.message : defaultMessage(rule.action, rule.name)
    return rule.action === 'deny' ? { kind: 'deny', rule, message } : { kind: 'ask', rule, message }
  }
  return { kind: 'pass' }
}

/** 设置页写的那种形状（可能缺字段）→ 严格规则。 */
export function ruleOf(row: Record<string, unknown>): InterceptRule {
  const num = (value: unknown): number => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return {
    id: num(row.id),
    name: String(row.name ?? ''),
    enabled: row.enabled !== false,
    priority: num(row.priority),
    match_target: row.match_target === 'tool_name' ? 'tool_name' : 'tool_input',
    match_type: row.match_type === 'regex' ? 'regex' : 'string',
    pattern: String(row.pattern ?? ''),
    action: row.action === 'allow' ? 'allow' : row.action === 'ask' ? 'ask' : 'deny',
    message: String(row.message ?? ''),
    timeout_enabled: row.timeout_enabled === true,
    timeout_seconds: num(row.timeout_seconds),
    timeout_action: row.timeout_action === 'allow' ? 'allow' : 'deny'
  }
}

/**
 * 规则快照：guard 是同步执行的，不可能在每次工具调用里等一次网络/存储。
 * 后台每 2 秒刷新一次；刷新失败保留上一份快照（旧规则继续生效），
 * 首次失败时快照为空——没有规则可匹配时放行，与"规则服务读不到"的语义一致。
 */
export interface RuleSnapshot {
  rules: CompiledRule[]
  tools: string[]
  loadedAt: number
}

export function emptySnapshot(): RuleSnapshot {
  return { rules: [], tools: [...DEFAULT_INTERCEPT_TOOLS], loadedAt: 0 }
}
