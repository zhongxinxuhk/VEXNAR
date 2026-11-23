// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 载荷变异（tamper）：把一个"被判定拦截"的请求换一种等价编码再试。
 *
 * 定位：这是**检测能力测试**，不是绕过保证。相同的语义经不同编码后，WAF 规则命中率
 * 会变——这正是需要被测出来的东西（规则覆盖缺口）。所以每次变异都必须留痕：
 * 记录 mutation id、原始值与变异值摘要，事后能回答"到底是哪条规则没拦住"。
 *
 * 硬约束：
 *   - 只改**值**，不改参数名与路径结构；不改变请求语义（同一 SQLi/XSS 语义的等价编码）；
 *   - 变异表是**固定清单 + 确定性顺序**（同 seed 同结果），便于复现与对比；
 *   - 不做随机探测、不插入无意义噪声字节——那只会制造流量而不产生结论。
 */

import { createHash } from 'node:crypto'

export type TamperId =
  | 'none'
  | 'double_url'
  | 'unicode'
  | 'html_entity'
  | 'case_toggle'
  | 'sql_comment'
  | 'space_as_comment'
  | 'char_wrap'
  | 'null_suffix'
  | 'line_split'

interface Mutation {
  id: TamperId
  label: string
  /** 目标：query 值 / body 文本 / 都要 */
  scope: 'query' | 'body' | 'any'
  apply: (value: string, seed: number) => string
}

function rand(seed: number): number {
  // xorshift：确定性、无需依赖 Math.random，保证同 seed 同输出。
  let x = seed || 1
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  return Math.abs(x >>> 0)
}

function toggleCase(value: string, seed: number): string {
  let state = seed
  return value.replace(/[a-z]/gi, (char) => {
    state = rand(state + char.charCodeAt(0))
    return state % 2 === 0 ? char.toUpperCase() : char.toLowerCase()
  })
}

/** 变异清单：顺序即升级顺序（越靠后越"偏"，越容易暴露客户端异常）。 */
export const MUTATIONS: Mutation[] = [
  { id: 'none', label: '原样', scope: 'any', apply: (value) => value },
  { id: 'case_toggle', label: '大小写混淆', scope: 'any', apply: toggleCase },
  { id: 'sql_comment', label: 'SQL 注释切分', scope: 'any', apply: (value) => value.replace(/\s+/g, '/**/') },
  { id: 'space_as_comment', label: '空白替换为 +', scope: 'any', apply: (value) => value.replace(/\s+/g, '+') },
  // 传输层本来就会编码一次；这里再编一次，服务端单次解码后看到的是 %xx 形态，即双重编码。
  { id: 'double_url', label: '双重 URL 编码', scope: 'any', apply: (value) => encodeURIComponent(value) },
  { id: 'html_entity', label: 'HTML 实体', scope: 'any', apply: (value) => value.replace(/[<>=()'"]/g, (char) => `&#x${char.charCodeAt(0).toString(16)};`) },
  { id: 'unicode', label: 'Unicode 转义', scope: 'body', apply: (value) => value.replace(/[a-z]/gi, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`) },
  { id: 'char_wrap', label: 'char() 包裹', scope: 'any', apply: (value) => value.replace(/\b(\d{1,3})\b/g, 'char($1)') },
  { id: 'null_suffix', label: '空字节后缀', scope: 'any', apply: (value) => `${value}\u0000` },
  { id: 'line_split', label: '换行切分', scope: 'any', apply: (value) => value.replace(/(['"()])/g, '$1\n') }
]

const BY_ID = new Map(MUTATIONS.map((item) => [item.id, item]))

export function mutationById(id: TamperId): Mutation | null {
  return BY_ID.get(id) ?? null
}

export function tamperIds(): TamperId[] {
  return MUTATIONS.map((item) => item.id)
}

export interface TamperedRequest {
  path: string
  body?: string
  headers: Record<string, string>
  /** 实际生效的变异（可能因无可变内容而退回 none）。 */
  applied: TamperId
  /** 被改动字段的摘要，便于比对"改了什么"。 */
  changed: Array<{ where: string; before: string; after: string }>
}

/**
 * 对一次请求应用变异。
 *
 * 只动"看起来是载荷"的部分：query 的值、body 里的字符串值。路径与参数名保持原样——
 * 改了路径就不再是同一个测试用例，结论无法归因。
 */
export function tamperRequest(input: {
  path: string
  body?: string
  headers: Record<string, string>
  mutation: TamperId
  seed: number
}): TamperedRequest {
  const mutation = BY_ID.get(input.mutation)
  if (!mutation || mutation.id === 'none') {
    return { path: input.path, body: input.body, headers: input.headers, applied: 'none', changed: [] }
  }
  const changed: Array<{ where: string; before: string; after: string }> = []

  // query 值：保留参数名，只替换值。
  let path = input.path
  const queryAt = path.indexOf('?')
  if (queryAt >= 0) {
    const base = path.slice(0, queryAt)
    const pairs = [...new URLSearchParams(path.slice(queryAt + 1)).entries()]
    const encoded: string[] = []
    let touched = false
    for (const [key, value] of pairs) {
      if (!value) {
        encoded.push(`${encodeURIComponent(key)}=`)
        continue
      }
      const next = mutation.apply(value, input.seed + key.length)
      if (next !== value) {
        touched = true
        changed.push({ where: `query.${key}`, before: value.slice(0, 80), after: next.slice(0, 120) })
      }
      encoded.push(`${encodeURIComponent(key)}=${encodeURIComponent(next)}`)
    }
    if (touched) path = `${base}?${encoded.join('&')}`
  }

  // body：JSON 里的字符串值逐个变异；非 JSON 则整体变异。
  let body = input.body
  if (body && mutation.scope !== 'query') {
    const trimmed = body.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        const walk = (node: unknown, pathKey: string): unknown => {
          if (typeof node === 'string') {
            const next = mutation.apply(node, input.seed + pathKey.length)
            if (next !== node) changed.push({ where: `body.${pathKey}`, before: node.slice(0, 80), after: next.slice(0, 120) })
            return next
          }
          if (Array.isArray(node)) return node.map((item, index) => walk(item, `${pathKey}[${index}]`))
          if (node && typeof node === 'object') {
            const out: Record<string, unknown> = {}
            for (const [key, value] of Object.entries(node as Record<string, unknown>)) out[key] = walk(value, `${pathKey}.${key}`)
            return out
          }
          return node
        }
        body = JSON.stringify(walk(parsed, '$'))
      } catch {
        body = mutation.apply(body, input.seed)
      }
    } else {
      body = mutation.apply(body, input.seed)
      if (body !== input.body) changed.push({ where: 'body', before: String(input.body).slice(0, 80), after: body.slice(0, 120) })
    }
  }

  const applied: TamperId = changed.length ? mutation.id : 'none'
  return { path, body, headers: input.headers, applied, changed }
}

/** 变异的稳定指纹：用于"这一轮是不是换了个新花样"的去重与报告。 */
export function mutationFingerprint(request: { path: string; body?: string; mutation: TamperId }): string {
  return createHash('sha1').update(`${request.mutation}\n${request.path}\n${request.body ?? ''}`).digest('hex').slice(0, 12)
}

/** 变异阶梯：按清单顺序推进，越界后回到最后一个（由上层决定是否停止）。 */
export function nextMutation(current: TamperId, step: number): TamperId {
  const order: TamperId[] = MUTATIONS.map((item) => item.id).filter((id) => id !== 'none')
  const index = order.indexOf(current)
  if (index < 0) return order[Math.min(step, order.length - 1)]
  return order[Math.min(index + 1, order.length - 1)]
}
