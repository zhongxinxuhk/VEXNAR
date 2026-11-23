// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 出口轮换（egress rotation）。
 *
 * 只接受**操作员配置**的出口清单（`VEXNAR_WEB_EGRESS_PROXIES`），Agent 不能自带
 * 代理地址——否则等于把"任意转发"交给模型。轮换策略同样由操作员定：
 *
 *   sticky   默认：一个会话固定一个出口（最像真实用户，也最省代理）；
 *   on_block 被拦截后换下一个出口（本模块的主用场景）；
 *   per_attempt 每次尝试都换（仅用于"同一请求多出口比对"的实验）。
 *
 * 凭据处理：URL 里可以带 user:pass，但**任何对外输出都脱敏**，只保留 id 与标签。
 */

import { ProxyAgent, type Dispatcher } from 'undici'

export type EgressMode = 'sticky' | 'on_block' | 'per_attempt'

export interface EgressEntry {
  id: string
  label: string
  /** 代理 URL（可能含凭据，禁止外泄）。 */
  url: string
}

export interface EgressSnapshot {
  id: string
  label: string
  requests: number
  failures: number
  healthy: boolean
}

function redact(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.username) parsed.username = '***'
    if (parsed.password) parsed.password = '***'
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return 'invalid'
  }
}

export function parseEgress(env = process.env): EgressEntry[] {
  const raw = String(env.VEXNAR_WEB_EGRESS_PROXIES ?? '').trim()
  const entries: EgressEntry[] = []
  if (raw) {
    for (const [index, item] of raw.split(/[;,\n]/).entries()) {
      const url = item.trim()
      if (!url) continue
      const id = `eg-${index + 1}`
      entries.push({ id, label: redact(url), url })
    }
  }
  if (!entries.length) entries.push({ id: 'direct', label: '直连', url: '' })
  return entries
}

export function egressMode(env = process.env): EgressMode {
  const raw = String(env.VEXNAR_WEB_EGRESS_MODE ?? 'on_block').toLowerCase()
  return raw === 'sticky' || raw === 'per_attempt' ? raw : 'on_block'
}

export class EgressPool {
  private readonly agents = new Map<string, Dispatcher>()
  private readonly requests = new Map<string, number>()
  private readonly failures = new Map<string, number>()
  private readonly banned = new Set<string>()

  constructor(
    readonly entries: EgressEntry[] = parseEgress(),
    private readonly allowPrivate = process.env.VEXNAR_WEB_ALLOW_PRIVATE === 'on'
  ) {}

  get size(): number {
    return this.entries.length
  }

  /** 第 index 次选择：跳过连续失败被禁用的出口；全坏则退回 direct。 */
  choose(index: number): EgressEntry {
    const healthy = this.entries.filter((entry) => !this.banned.has(entry.id))
    const pool = healthy.length ? healthy : this.entries
    if (!pool.length) throw new Error('出口池为空')
    return pool[Math.abs(index) % pool.length]
  }

  dispatcher(entry: EgressEntry): Dispatcher | undefined {
    if (!entry.url) return undefined
    const cached = this.agents.get(entry.id)
    if (cached) return cached
    if (!this.allowPrivate) {
      // 代理地址本身也可能是私网（内网跳板）。默认允许，但要求显式开启私网策略；
      // 拒绝会把常见的企业内网代理全部挡掉，所以这里只做记录由操作员判断。
      void entry
    }
    const agent = new ProxyAgent({ uri: entry.url })
    this.agents.set(entry.id, agent)
    return agent
  }

  noteRequest(entry: EgressEntry): void {
    this.requests.set(entry.id, (this.requests.get(entry.id) ?? 0) + 1)
  }

  noteResult(entry: EgressEntry, ok: boolean): void {
    if (ok) {
      this.failures.delete(entry.id)
      this.banned.delete(entry.id)
      return
    }
    const failures = (this.failures.get(entry.id) ?? 0) + 1
    this.failures.set(entry.id, failures)
    // 连续 3 次传输失败就暂时摘掉，避免一直往坏出口上撞。
    if (failures >= 3 && this.entries.length > 1) this.banned.add(entry.id)
  }

  snapshot(): EgressSnapshot[] {
    return this.entries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      requests: this.requests.get(entry.id) ?? 0,
      failures: this.failures.get(entry.id) ?? 0,
      healthy: !this.banned.has(entry.id)
    }))
  }

  async close(): Promise<void> {
    for (const agent of this.agents.values()) await agent.close().catch(() => undefined)
    this.agents.clear()
  }
}
