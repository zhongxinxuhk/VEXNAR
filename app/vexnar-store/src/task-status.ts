// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 任务生命周期——全站唯一定义。
 *
 * 数据库里的 `tasks.status` 是**存储事实**，`paused` / `queued` 是**执行开关**，
 * 两者组合出来的才是**任务状态**。以前每个界面各自拼这张表：Go 服务按
 * `resolvedTaskStatus` 出 `paused`、TS 核心直接把原始列发出去（暂停任务显示成
 * 「待启动」）、概览与任务面板又各有一份词表（`draft`/`archived` 在数据里根本
 * 不存在，`timeout` 在客户端无人认识）。任何一处改动都会让同一个任务在三个界面
 * 里是三种状态，统计口径也随之分裂。
 *
 * 因此这里把定义收在一处：
 *
 *   | key     | 中文   | 终态 | 计入「进行中」 |
 *   |---------|--------|------|----------------|
 *   | created | 待启动 | 否   | 否             |
 *   | queued  | 排队中 | 否   | 是             |
 *   | running | 进行中 | 否   | 是             |
 *   | paused  | 已暂停 | 否   | 否             |
 *   | done    | 已完成 | 是   | 否             |
 *   | failed  | 失败   | 是   | 否             |
 *   | timeout | 已超时 | 是   | 否             |
 *
 * 「归档」不是状态：`archived_at` 是任务从活动清单里移出的标记，归档任务仍然
 * 带着自己的终态，所以 `tasks.list()` 直接排除它们，而不是造一个 `archived` 状态。
 *
 * 指标口径同样定义在这里，`summarizeTasks()` 是概览 KPI、任务健康度、任务面板
 * 筛选计数共用的唯一聚合：
 *   - 总数 total：活动清单里的任务数（未删除、未归档）
 *   - 进行中 active：queued + running
 *   - 完成率 completion_rate：done / total
 *   - 目标达成 goal_rate：goals_met / goals_total，只统计真的挂了目标的任务
 *   - 在途意图 in_flight：所有任务 state=running 的意图之和
 */

export const TASK_LIFECYCLE = [
  { key: 'created', label: '待启动', tone: 'muted', terminal: false, active: false, hint: '已创建，引擎还没运行过' },
  { key: 'queued', label: '排队中', tone: 'info', terminal: false, active: true, hint: '等待并发槽位' },
  { key: 'running', label: '进行中', tone: 'success', terminal: false, active: true, hint: '引擎在跑，未暂停' },
  { key: 'paused', label: '已暂停', tone: 'warn', terminal: false, active: false, hint: '人工暂停，进度保留' },
  { key: 'done', label: '已完成', tone: 'success', terminal: true, active: false, hint: '目标达成或引擎正常收尾' },
  { key: 'failed', label: '失败', tone: 'error', terminal: true, active: false, hint: '中止或执行错误' },
  { key: 'timeout', label: '已超时', tone: 'error', terminal: true, active: false, hint: '超出任务时限，引擎已收尾' }
] as const

export type TaskStatusKey = (typeof TASK_LIFECYCLE)[number]['key']
export type TaskStatusMeta = (typeof TASK_LIFECYCLE)[number]

/** 状态键的展示顺序：未终结的在前，终态在后。 */
export const TASK_STATUS_KEYS: TaskStatusKey[] = TASK_LIFECYCLE.map((item) => item.key)

const BY_KEY = new Map<string, TaskStatusMeta>(TASK_LIFECYCLE.map((item) => [item.key, item]))

export function isTaskStatus(value: unknown): value is TaskStatusKey {
  return typeof value === 'string' && BY_KEY.has(value)
}

export function taskStatusMeta(status: string): TaskStatusMeta {
  return BY_KEY.get(status) ?? BY_KEY.get('created')!
}

/** 终态：不会再自行变化，只能被人工重开或归档。 */
export function isTerminalTaskStatus(status: string): boolean {
  return BY_KEY.get(status)?.terminal === true
}

/**
 * 存储行 → 任务状态。规则与 Go 的 `resolvedTaskStatus` 对齐：终态优先，
 * 其次排队、暂停，最后才回落到原始列。
 */
export function resolveTaskStatus(row: { status?: string; paused?: boolean; queued?: boolean } | null | undefined): TaskStatusKey {
  const stored = String(row?.status ?? '').trim()
  if (isTerminalTaskStatus(stored)) return stored as TaskStatusKey
  if (row?.queued === true || stored === 'queued') return 'queued'
  if (row?.paused === true || stored === 'paused') return 'paused'
  if (stored === 'running') return 'running'
  return 'created'
}

/** `tasks.list()` 的一行（已解析状态）参与聚合所需的最小字段。 */
export interface TaskSummaryRow {
  id?: string
  exploration_id?: number
  status?: string
  paused?: boolean
  queued?: boolean
  created_unix?: number
}

export interface TaskSummaryMetrics {
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
  cache_write_tokens?: number
  goals_total?: number
  goals_met?: number
  in_flight?: number
  findings?: { critical?: number; high?: number; medium?: number; low?: number }
}

export interface TaskSummary {
  /** 活动清单里的任务总数（未删除、未归档）。 */
  total: number
  /** 七个生命周期状态各自的计数，键固定，缺省为 0。 */
  by_status: Record<TaskStatusKey, number>
  /** queued + running：引擎当前会推进的任务。 */
  active: number
  /** 已暂停：有进度但引擎不推进。 */
  paused: number
  /** 终态：done + failed + timeout。 */
  terminal: number
  done: number
  failed: number
  timeout: number
  /** done / total，百分比（0–100）。 */
  completion_rate: number
  goals_total: number
  goals_met: number
  /** goals_met / goals_total，百分比；没有目标时为 0。 */
  goal_rate: number
  in_flight: number
  findings: { total: number; critical: number; high: number; medium: number; low: number }
  /** 键名与 Go 的 TokenTotalDTO 一致：input_tokens / output_tokens / cache_*_tokens。 */
  tokens: { input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; total: number }
  /** 窗口内新建任务数与上一窗口对比用的计数。 */
  window_days: number
  created_window: number
  created_prev: number
  /** 窗口内每天新建的任务数，长度 = window_days，最后一个是今天（UTC）。 */
  throughput: number[]
  /** 生命周期定义随数据一起发布，客户端据它做标签/颜色，不维护第二份词表。 */
  lifecycle: TaskStatusMeta[]
  generated_unix: number
}

const DAY_SECONDS = 86400

/**
 * 聚合任务清单。入参是**全量**清单（不是分页结果）——分页聚合出来的数字只描述
 * 当前页，这正是任务面板筛选计数一直对不上的原因。
 */
export function summarizeTasks(
  rows: readonly TaskSummaryRow[] | null | undefined,
  metrics: Map<number, TaskSummaryMetrics> | null | undefined,
  options: { days?: number; now?: number } = {}
): TaskSummary {
  const days = Math.max(Math.floor(Number(options.days ?? 30)) || 30, 1)
  const nowSec = Number(options.now ?? Date.now()) / 1000
  const cutoff = nowSec - days * DAY_SECONDS
  const prevCutoff = cutoff - days * DAY_SECONDS

  const by_status = Object.fromEntries(TASK_STATUS_KEYS.map((key) => [key, 0])) as Record<TaskStatusKey, number>
  const findings = { total: 0, critical: 0, high: 0, medium: 0, low: 0 }
  const tokens = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, total: 0 }
  const throughput = new Array<number>(days).fill(0)
  let goals_total = 0
  let goals_met = 0
  let in_flight = 0
  let created_window = 0
  let created_prev = 0

  for (const row of rows ?? []) {
    const status = resolveTaskStatus(row)
    by_status[status] += 1

    const metric = metrics?.get(Number(row.exploration_id ?? 0))
    if (metric !== undefined) {
      const critical = Number(metric.findings?.critical ?? 0)
      const high = Number(metric.findings?.high ?? 0)
      const medium = Number(metric.findings?.medium ?? 0)
      const low = Number(metric.findings?.low ?? 0)
      findings.critical += critical
      findings.high += high
      findings.medium += medium
      findings.low += low
      findings.total += critical + high + medium + low

      tokens.input_tokens += Number(metric.input_tokens ?? 0)
      tokens.output_tokens += Number(metric.output_tokens ?? 0)
      tokens.cache_read_tokens += Number(metric.cache_read_tokens ?? 0)
      tokens.cache_write_tokens += Number(metric.cache_write_tokens ?? 0)

      goals_total += Number(metric.goals_total ?? 0)
      goals_met += Number(metric.goals_met ?? 0)
      in_flight += Number(metric.in_flight ?? 0)
    }

    const createdUnix = Number(row.created_unix ?? 0)
    if (createdUnix >= cutoff) {
      created_window += 1
      const ago = Math.min(days - 1, Math.floor((nowSec - createdUnix) / DAY_SECONDS))
      const index = days - 1 - ago
      throughput[index] = (throughput[index] ?? 0) + 1
    } else if (createdUnix >= prevCutoff) {
      created_prev += 1
    }
  }
  tokens.total = tokens.input_tokens + tokens.output_tokens

  const total = (rows ?? []).length
  const active = by_status.queued + by_status.running
  const terminal = by_status.done + by_status.failed + by_status.timeout

  return {
    total,
    by_status,
    active,
    paused: by_status.paused,
    terminal,
    done: by_status.done,
    failed: by_status.failed,
    timeout: by_status.timeout,
    completion_rate: total > 0 ? (by_status.done / total) * 100 : 0,
    goals_total,
    goals_met,
    goal_rate: goals_total > 0 ? (goals_met / goals_total) * 100 : 0,
    in_flight,
    findings,
    tokens,
    window_days: days,
    created_window,
    created_prev,
    throughput,
    lifecycle: TASK_LIFECYCLE.map((item) => ({ ...item })),
    generated_unix: Math.floor(nowSec)
  }
}
