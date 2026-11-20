// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 资料页「洞察」用的本地计数。只写 localStorage，不上报、不入库。
 * 目前记录每次发送时使用的推理强度，用来算最常用强度及其占比。
 */
const EFFORT_KEY = 'vexnar.insight.effort'

export const EFFORT_LABELS: Record<string, string> = {
  default: '默认',
  low: '轻度',
  medium: '中',
  high: '高',
  xhigh: '极高',
  max: 'Max'
}

export type EffortCounts = Record<string, number>

export function readEffortCounts(): EffortCounts {
  try {
    const raw = window.localStorage.getItem(EFFORT_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const counts: EffortCounts = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const count = Number(value)
      if (Number.isFinite(count) && count > 0) counts[key] = count
    }
    return counts
  } catch {
    return {}
  }
}

/** 每次发送成功后累加一次，effort 为空按「由模型决定」计。 */
export function recordEffort(effort: string | undefined): void {
  try {
    const counts = readEffortCounts()
    const key = effort && EFFORT_LABELS[effort] ? effort : 'default'
    counts[key] = (counts[key] ?? 0) + 1
    window.localStorage.setItem(EFFORT_KEY, JSON.stringify(counts))
  } catch {
    // 统计失败不影响发送
  }
}

export type TopEffort = { key: string; label: string; share: number }

export function topEffort(counts: EffortCounts): TopEffort | null {
  const entries = Object.entries(counts).filter(([, count]) => count > 0)
  if (entries.length === 0) return null
  const total = entries.reduce((sum, [, count]) => sum + count, 0)
  const [key, count] = entries.sort((left, right) => right[1] - left[1])[0]
  return {
    key,
    label: EFFORT_LABELS[key] ?? key,
    share: Math.round((count / total) * 100)
  }
}
