// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 纯格式化函数（无状态、无副作用）。
 *
 * 之前在四个文件里各有一份 `bytes()`/`relTime()`/`pct()`，同一个 1024 有时是
 * KB 有时是 KiB，同一段时间有时「1 分钟前」有时「60s」。统一在这里定义，
 * 页面上只允许出现「调用」，不允许再写第二份。
 */

/** 字节：二进制单位，保留 1 位小数，超过 1KB 才换挡。 */
export function fmtBytes(value: number): string {
  const size = Number(value) || 0
  if (size < 1024) return `${Math.round(size)} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/** 计数：≥1 万走 k，≥1 亿走 M，语义与概览一致。 */
export function fmtCount(value: number): string {
  const count = Number(value) || 0
  const abs = Math.abs(count)
  if (abs >= 100_000_000) return `${(count / 100_000_000).toFixed(1)}亿`
  if (abs >= 10_000) return `${(count / 10_000).toFixed(abs >= 100_000 ? 0 : 1)}万`
  return String(Math.round(count))
}

/** 千分位整数（表格里读得快）。 */
export function fmtInt(value: number): string {
  return (Number(value) || 0).toLocaleString('zh-CN')
}

/** 比例：入参是 0..1，输出 12.3%。 */
export function fmtPercent(value: number, digits = 1): string {
  const ratio = Number(value)
  if (!Number.isFinite(ratio)) return '—'
  return `${(ratio * 100).toFixed(digits)}%`
}

/** 毫秒：<1s 用 ms，否则用 s。 */
export function fmtMs(value: number): string {
  const ms = Number(value) || 0
  if (ms <= 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** 秒级时间戳（后端部分接口用秒）→ 毫秒。 */
export function toMillis(value: number | string | undefined): number {
  if (value === undefined || value === '') return 0
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000
  const parsed = Date.parse(value)
  if (Number.isFinite(parsed)) return parsed
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric * 1000 : 0
}

/** 绝对时间：今天只显示时分秒，其余带日期。 */
export function fmtTime(value: number | string | undefined): string {
  const ms = toMillis(value)
  if (!ms) return '—'
  const date = new Date(ms)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const time = date.toLocaleTimeString('zh-CN', { hour12: false })
  if (sameDay) return time
  // 密集表格里「2026/11/21 15:30:12」宽过时间列，整列都被截成省略号；
  // 非当天省掉年份与秒，悬停再给完整值（列上带 title）。
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 完整时间戳：表格列被截断时挂在 title 上，悬停可读原文。 */
export function fmtTimeFull(value: number | string | undefined): string {
  const ms = toMillis(value)
  if (!ms) return '—'
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}

/** 相对时间：给「最近活动」这类列用。 */
export function fmtRelative(value: number | string | undefined): string {
  const ms = toMillis(value)
  if (!ms) return '—'
  const diff = Date.now() - ms
  if (diff < 0) return '刚刚'
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))} 秒前`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return new Date(ms).toLocaleDateString('zh-CN')
}

/** 剩余时间（租约到期）。 */
export function fmtRemaining(value: string | number | undefined): string {
  const ms = toMillis(value)
  if (!ms) return '—'
  const diff = ms - Date.now()
  if (diff <= 0) return '已过期'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return `${Math.floor(diff / 1000)} 秒`
  if (minutes < 60) return `${minutes} 分`
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
}

/** 状态码分段：表格着色与 KPI 共用同一套判定。 */
export function statusClass(status: number): '2xx' | '3xx' | '4xx' | '5xx' | 'other' {
  if (status >= 200 && status < 300) return '2xx'
  if (status >= 300 && status < 400) return '3xx'
  if (status >= 400 && status < 500) return '4xx'
  if (status >= 500 && status < 600) return '5xx'
  return 'other'
}

/** 截断长串，保留首尾以便辨认（URL、UA、错误文案）。 */
export function clampText(value: string, max = 120): string {
  const text = value ?? ''
  if (text.length <= max) return text
  const head = Math.ceil((max - 1) / 2)
  const tail = Math.floor((max - 1) / 2)
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`
}
