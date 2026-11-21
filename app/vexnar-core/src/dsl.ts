// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Asset DSL: the subset of the Go parser the web console uses. Syntax:
 *   field=value  fuzzy (case-insensitive substring)
 *   field==value exact
 *   field!=value exclude fuzzy
 *   port>8080    numeric comparison
 *   bare word    fuzzy across the main text columns
 * AND binds tighter than OR; parentheses group.
 */
type Expr = { field: string; op: string; value: string }
type Node = { kind: 'and' | 'or'; children: Node[] } | { kind: 'leaf'; expr: Expr }

const STRING_FIELDS = new Set(['domain', 'root_domain', 'ip', 'url', 'page_title', 'title', 'icp', 'service_name', 'app_name', 'bundle_id', 'category', 'app_icp', 'method', 'service_type', 'record_type'])
const ARRAY_FIELDS = new Set(['technology', 'technologies', 'tech'])
const NUMERIC_FIELDS = new Set(['port', 'status_code', 'status'])
const FULL_TEXT = ['domain', 'root_domain', 'ip', 'url', 'page_title', 'icp', 'service_name', 'app_name', 'app_description']

const isField = (field: string) => STRING_FIELDS.has(field) || ARRAY_FIELDS.has(field) || NUMERIC_FIELDS.has(field) || field === 'company_id' || field === 'task_id'

function readToken(text: string, pos: number): [string, number] {
  if (text[pos] === '"') {
    const end = text.indexOf('"', pos + 1)
    return [text.slice(pos + 1, end < 0 ? text.length : end), end < 0 ? text.length : end + 1]
  }
  let i = pos
  while (i < text.length && !/\s|\(|\)/.test(text[i])) i++
  return [text.slice(pos, i), i]
}

function tokenize(text: string) {
  const tokens: Array<{ kind: string; expr?: Expr }> = []
  let i = 0
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++
    if (i >= text.length) break
    if (text[i] === '(') { tokens.push({ kind: 'LP' }); i++; continue }
    if (text[i] === ')') { tokens.push({ kind: 'RP' }); i++; continue }
    let matched = false
    if (/[A-Za-z_]/.test(text[i])) {
      let j = i
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j++
      const field = text.slice(i, j).toLowerCase()
      if (isField(field) && j < text.length && '=!><'.includes(text[j])) {
        let op = text[j]
        j++
        if (j < text.length && text[j] === '=') { op += '='; j++ }
        const [value, end] = readToken(text, j)
        tokens.push({ kind: 'FIELD', expr: { field, op, value } })
        i = end
        matched = true
      }
    }
    if (matched) continue
    const [word, end] = readToken(text, i)
    if (!word) { i++; continue }
    const upper = word.toUpperCase()
    if (upper === 'AND') tokens.push({ kind: 'AND' })
    else if (upper === 'OR') tokens.push({ kind: 'OR' })
    else tokens.push({ kind: 'BARE', expr: { field: '', op: '', value: word } })
    i = end
  }
  tokens.push({ kind: 'EOF' })
  return tokens
}

function parse(tokens: ReturnType<typeof tokenize>): Node | null {
  let pos = 0
  const peek = () => tokens[pos]
  const consume = () => tokens[pos++]
  const parseOr = (): Node => {
    const children: Node[] = [parseAnd()]
    while (peek().kind === 'OR') { consume(); children.push(parseAnd()) }
    return children.length === 1 ? children[0] : { kind: 'or', children }
  }
  const parseAnd = (): Node => {
    const children: Node[] = [parseAtom()]
    while (peek().kind === 'AND') { consume(); children.push(parseAtom()) }
    return children.length === 1 ? children[0] : { kind: 'and', children }
  }
  const parseAtom = (): Node => {
    const token = peek()
    if (token.kind === 'FIELD' || token.kind === 'BARE') { consume(); return { kind: 'leaf', expr: token.expr! } }
    if (token.kind === 'LP') {
      consume()
      const node = parseOr()
      if (peek().kind !== 'RP') throw new Error("DSL 语法错误：缺少右括号 ')'")
      consume()
      return node
    }
    throw new Error('DSL 语法错误：表达式不完整')
  }
  const node = parseOr()
  if (peek().kind !== 'EOF') throw new Error('DSL 语法错误：意外的内容')
  return node
}

const lower = (value: unknown) => String(value ?? '').toLowerCase()

function evalLeaf(asset: any, expr: Expr): boolean {
  const field = expr.field
  if (!field) {
    const needle = lower(expr.value)
    const texts = FULL_TEXT.some((key) => lower(asset[key]).includes(needle))
    const arrays = [asset.technologies, asset.bound_domains].some((list) => Array.isArray(list) && list.some((item: unknown) => lower(item).includes(needle)))
    return texts || arrays
  }
  if (field === 'task_id') {
    const id = Number(expr.value)
    if (!Number.isFinite(id)) throw new Error(`task_id 需要整数值: ${expr.value}`)
    return Array.isArray(asset.task_ids) && asset.task_ids.map(Number).includes(id)
  }
  if (field === 'company_id') {
    const id = Number(expr.value)
    if (!Number.isFinite(id)) throw new Error(`company_id 需要整数值: ${expr.value}`)
    return Number(asset.company_id) === id
  }
  if (NUMERIC_FIELDS.has(field)) {
    const value = Number(expr.value)
    if (!Number.isFinite(value)) throw new Error(`字段 ${field} 需要整数值: ${expr.value}`)
    const actual = Number(asset[field === 'status' ? 'status_code' : field])
    switch (expr.op) {
      case '=': case '==': return actual === value
      case '!=': return actual !== value
      case '>': return actual > value
      case '>=': return actual >= value
      case '<': return actual < value
      case '<=': return actual <= value
      default: throw new Error(`字段 ${field} 不支持运算符 ${expr.op}`)
    }
  }
  if (ARRAY_FIELDS.has(field)) {
    const list = Array.isArray(asset.technologies) ? asset.technologies.map(lower) : []
    if (expr.op === '==') return list.includes(lower(expr.value))
    if (expr.op === '!=') return !list.includes(lower(expr.value))
    if (expr.op === '=') return list.some((item) => item.includes(lower(expr.value)))
    throw new Error(`数组字段 ${field} 不支持运算符 ${expr.op}`)
  }
  const actual = lower(asset[field === 'title' ? 'page_title' : field])
  if (expr.op === '=') return actual.includes(lower(expr.value))
  if (expr.op === '==') return actual === lower(expr.value)
  if (expr.op === '!=') return !actual.includes(lower(expr.value))
  throw new Error(`字符串字段 ${field} 不支持运算符 ${expr.op}`)
}

function evalNode(asset: any, node: Node): boolean {
  if (node.kind === 'leaf') return evalLeaf(asset, node.expr)
  return node.kind === 'and' ? node.children.every((child) => evalNode(asset, child)) : node.children.some((child) => evalNode(asset, child))
}

export function queryDSL(assets: any[], dsl: string): any[] {
  if (!dsl.trim()) return assets
  const node = parse(tokenize(dsl))
  if (!node) return assets
  return assets.filter((asset) => evalNode(asset, node))
}
