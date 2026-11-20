// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 推理强度（reasoning effort）的唯一来源。
 *
 * 取值与 Go 端 `validReasoningEffort`、以及 NewAPI 中转的 wire 值保持一致：
 * `low / medium / high / xhigh / max`，空值表示「默认」——不发送该字段，
 * 由模型自己决定思考强度。
 *
 * 色阶由低到高：天蓝 → 蓝 → 靛紫 → 紫 → 品紫，用于档位文字、滑块填充与轨道刻度。
 */
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export const EFFORT_LEVELS: EffortLevel[] = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
]

export const EFFORT_TIERS: Record<
  EffortLevel,
  { label: string; color: string; hint: string }
> = {
  low: { label: '轻度', color: '#60a5fa', hint: '最快响应，几乎不思考' },
  medium: { label: '中', color: '#4f7cff', hint: '日常任务的默认强度' },
  high: { label: '高', color: '#7c5cf5', hint: '多步推理与工具调用' },
  xhigh: { label: '极高', color: '#9333ea', hint: '复杂工程任务，思考更久' },
  max: { label: 'Max', color: '#a855f7', hint: '极限思考，耗时最长' }
}

/** 第六个位置：不发送 reasoning_effort，由模型决定。 */
export const EFFORT_DEFAULT = { label: '默认', color: '#94a3b8' }

export const effortLabels: Record<EffortLevel, string> = {
  low: EFFORT_TIERS.low.label,
  medium: EFFORT_TIERS.medium.label,
  high: EFFORT_TIERS.high.label,
  xhigh: EFFORT_TIERS.xhigh.label,
  max: EFFORT_TIERS.max.label
}

export function isEffortLevel(value: unknown): value is EffortLevel {
  return (
    typeof value === 'string' && (EFFORT_LEVELS as string[]).includes(value)
  )
}
