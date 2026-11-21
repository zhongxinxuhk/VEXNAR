// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * P1-1 parity: the TS read endpoints vs the running Go service.
 *
 * Some endpoints intentionally expose only the stable slice so far (task
 * metrics, agent counts). Those compare a field subset; the rest compare the
 * whole JSON document.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import jwt from 'jsonwebtoken'

/** 任意 JSON 值：diff / canonical 就是按结构逐层走整份文档。 */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/** 一个对账目标：exact 比整份文档，subset 只比文档里的若干字段。 */
type CompareCase =
  | { path: string; mode: 'exact' }
  | { path: string; mode: 'subset'; keys: readonly string[] }

/** 一次抓取的结果：状态码 + 解析后的文档（非 JSON 响应退回原文）。 */
type CompareResponse = { status: number; json: Json }

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const token = jwt.sign({}, readFileSync(join(repo, 'jwt.key')), { algorithm: 'HS256', subject: 'VEXNAR', expiresIn: '1h' })
const GO = process.env.P0_GO_API || 'http://127.0.0.1:8787'
const TS = process.env.P0_TS_API || 'http://127.0.0.1:8790'
const headers = { Authorization: `Bearer ${token}` }

async function get(base: string, path: string): Promise<CompareResponse> {
  const response = await fetch(base + path, { headers })
  const text = await response.text()
  return { status: response.status, json: ((): Json => { try { return JSON.parse(text) as Json } catch { return text } })() }
}

function diff(left: Json, right: Json, path = ''): string[] {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return [`${path}.length: ${left.length} vs ${right.length}`]
    for (let i = 0; i < left.length; i++) {
      const found: string[] = diff(left[i], right[i], `${path}[${i}]`)
      if (found.length) return found
    }
    return []
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    // 走到这里两边都是对象；一侧是数组、另一侧是对象时按原脚本的方式取键。
    const leftRecord = left as { [key: string]: Json }
    const rightRecord = right as { [key: string]: Json }
    const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])
    for (const key of keys) {
      if (JSON.stringify(leftRecord[key]) === JSON.stringify(rightRecord[key])) continue
      const found: string[] = diff(leftRecord[key], rightRecord[key], path ? `${path}.${key}` : key)
      return found.length ? found : [`${path}.${key}: ${JSON.stringify(leftRecord[key])} vs ${JSON.stringify(rightRecord[key])}`]
    }
    return []
  }
  return JSON.stringify(left) === JSON.stringify(right) ? [] : [`${path}: ${JSON.stringify(left)} vs ${JSON.stringify(right)}`]
}

const canonical = (value: Json): Json => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key): [string, Json] => [key, canonical(value[key])]))
  }
  return value
}

const pick = (value: Json, keys: readonly string[]): Json => {
  if (Array.isArray(value)) return value.map((item) => pick(item, keys))
  if (value && typeof value === 'object') {
    const out: { [key: string]: Json } = {}
    for (const key of keys) if (key in value) out[key] = value[key]
    return out
  }
  return value
}

const cases: CompareCase[] = [
  { path: '/api/health', mode: 'exact' },
  { path: '/api/agents', mode: 'subset', keys: ['agents'] },
  { path: '/api/llm/profiles', mode: 'subset', keys: ['profiles'] },
  { path: '/api/task-categories', mode: 'subset', keys: ['categories'] },
  { path: '/api/task-templates', mode: 'subset', keys: ['templates'] },
  { path: '/api/companies', mode: 'exact' },
  { path: '/api/tools', mode: 'exact' },
  { path: '/api/mcp', mode: 'subset', keys: ['servers'] },
  { path: '/api/notify/channels', mode: 'exact' },
  { path: '/api/settings', mode: 'exact' },
  { path: '/api/assets/counts', mode: 'exact' },
  { path: '/api/exploration/findings/stats', mode: 'exact' }
]

// Agents/profiles/categories/templates carry timestamps or derived counters;
// compare the identifying fields only until those are ported.
const SUBSET: Record<string, readonly string[]> = {
  '/api/agents': ['id', 'key', 'name', 'role', 'builtin', 'enabled', 'max_turns', 'run_seconds', 'web_search', 'interactive_shell', 'llm_profile_id', 'trigger_run_mode', 'trigger_merge_mode', 'trigger_max_parallel'],
  '/api/llm/profiles': ['id', 'name', 'format', 'base_url', 'model', 'api_key_hint', 'is_default', 'priority', 'streaming'],
  '/api/task-categories': ['id', 'name', 'task_count'],
  '/api/task-templates': ['id', 'name', 'description', 'goal', 'category_id'],
  '/api/mcp': ['id', 'name', 'transport', 'enabled', 'insecure']
}

let failed = false
for (const item of cases) {
  const [go, ts] = await Promise.all([get(GO, item.path), get(TS, item.path)])
  let left: Json = item.mode === 'subset' ? pick(go.json, SUBSET[item.path] ?? item.keys) : go.json
  let right: Json = item.mode === 'subset' ? pick(ts.json, SUBSET[item.path] ?? item.keys) : ts.json
  if (item.mode === 'subset') {
    // 两个服务是同一个端点：Go 的形状成立时，TS 文档就是同一个形状。
    const goRecord = go.json && typeof go.json === 'object' ? go.json as { [key: string]: Json } : undefined
    const tsRecord = ts.json && typeof ts.json === 'object' ? ts.json as { [key: string]: Json } : undefined
    const goBranch = goRecord?.[item.keys[0]]
    const tsBranch = tsRecord?.[item.keys[0]]
    // Compare only the same kind of container: arrays by id, objects by key.
    if (Array.isArray(go.json)) {
      left = go.json.map((row) => pick(row, SUBSET[item.path]))
      right = (ts.json as Json[]).map((row) => pick(row, SUBSET[item.path]))
    } else if (Array.isArray(goBranch)) {
      left = goBranch.map((row) => pick(row, SUBSET[item.path]))
      right = (tsBranch as Json[]).map((row) => pick(row, SUBSET[item.path]))
    }
  }
  const ok = JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
  if (!ok) failed = true
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${item.path}  go=${go.status} ts=${ts.status}`)
  if (!ok) {
    const d = diff(canonical(left), canonical(right))
    console.log('  first diffs:', JSON.stringify(d.slice(0, 3)))
  }
}
process.exit(failed ? 1 : 0)
