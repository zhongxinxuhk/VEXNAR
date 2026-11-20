// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useMemo, useRef, useState } from 'react'
import { Boxes, Lock, Pencil, Share2 } from 'lucide-react'
import type { NewApiQuota } from '@shared/contracts'
import { ProfileAvatar, ProfileDialog } from '@/components/ProfileMenu'
import { consoleRequest } from '@/lib/console'
import { readEffortCounts, topEffort } from '@/lib/insight'
import { cn } from '@/lib/utils'
import {
  formatDayCount,
  formatDuration,
  formatRelativeTime,
  formatTokenCount,
  summarizeUsage,
  tokenHeatmap
} from '@/lib/usage-stats'
import { useAppStore } from '@/store/app'

type SkillRow = { name: string; calls: number }
type HeatTip = {
  date: string
  tokens: number
  left: number
  top: number
}

/** 中转平台的额度单位换算，与额度菜单保持同一口径。 */
function quotaValue(quota: NewApiQuota | null, raw: number): string {
  if (!quota) return '—'
  if (!quota.displayInCurrency) return Math.round(raw).toLocaleString()
  const amount = (raw / quota.quotaPerUnit) * quota.usdExchangeRate
  return `$${amount.toFixed(2)}`
}

function StatCell({ value, label }: { value: string; label: string }): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-3">
      <div className="max-w-full truncate text-[15px] font-medium leading-5 text-ink">
        {value}
      </div>
      <div className="mt-0.5 max-w-full truncate text-[12.5px] leading-4 text-muted">
        {label}
      </div>
    </div>
  )
}

function HeadAction({
  icon,
  label,
  onClick
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-md px-1 text-[13px] text-ink',
        onClick ? 'hover:bg-panel-2' : 'cursor-default'
      )}
    >
      <span className="grid h-4 w-4 place-items-center">{icon}</span>
      {label}
    </button>
  )
}

function Metric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11.5px] text-muted">{label}</div>
      <div className="mt-1 truncate text-[15px] font-medium text-ink">{value}</div>
    </div>
  )
}

function InsightRow({
  label,
  value
}: {
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 py-[7px]">
      <span className="text-[12.5px] text-ink">{label}</span>
      <span className="shrink-0 text-[12.5px] text-muted">{value}</span>
    </div>
  )
}

const CELL = 10
const GAP = 3

export function ProfilePage(): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const newApi = useAppStore((state) => state.newApi)
  const sessions = useAppStore((state) => state.sessions)
  const usage = useAppStore((state) => state.usage)
  const refreshUsage = useAppStore((state) => state.refreshUsage)
  const backend = useAppStore((state) => state.backend)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [skills, setSkills] = useState<SkillRow[]>([])
  const [mode, setMode] = useState<'day' | 'week' | 'total'>('day')
  const cardRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<HeatTip | null>(null)

  useEffect(() => {
    void refreshUsage()
  }, [refreshUsage])

  useEffect(() => {
    if (!backend?.connected) return
    let active = true
    consoleRequest<{ skills: SkillRow[] }>('/skills')
      .then((data) => {
        if (active) setSkills(data.skills ?? [])
      })
      .catch(() => {
        if (active) setSkills([])
      })
    return () => {
      active = false
    }
  }, [backend?.connected])

  const summary = useMemo(
    () =>
      summarizeUsage({
        records: usage?.records ?? [],
        supported: usage?.supported ?? false,
        truncated: usage?.truncated ?? false,
        sessions
      }),
    [usage, sessions]
  )

  const heat = useMemo(
    () => tokenHeatmap(usage?.records ?? [], { mode }),
    [usage, mode]
  )

  /** 格子悬浮气泡：固定显示在格子正上方，水平贴边时收敛避免溢出。 */
  const setTipAt = (
    event: React.MouseEvent<HTMLDivElement>,
    cell: { at: number; tokens: number }
  ): void => {
    const card = cardRef.current
    if (!card) return
    const cellRect = event.currentTarget.getBoundingClientRect()
    const cardRect = card.getBoundingClientRect()
    const date = new Date(cell.at)
    const half = 62
    const left = cellRect.left - cardRect.left + cellRect.width / 2
    setTip({
      date: `${date.getMonth() + 1}月${date.getDate()}日`,
      tokens: cell.tokens,
      left: Math.min(Math.max(left, half), Math.max(half, cardRect.width - half)),
      top: cellRect.top - cardRect.top
    })
  }
  const effort = useMemo(() => topEffort(readEffortCounts()), [])
  const skillsUsed = skills.filter((skill) => skill.calls > 0)
  const skillCalls = skills.reduce((sum, skill) => sum + (skill.calls || 0), 0)

  const displayName = settings.displayName.trim() || '本地用户'
  const accountName = newApi?.user?.displayName || newApi?.user?.username || displayName
  const handle = newApi?.user?.username ? `@${newApi.user.username}` : '@local'

  const share = async (): Promise<void> => {
    const text = `我正在使用 VEXNAR Desktop ${useAppStore.getState().info?.version ?? ''} —— 一个本地优先的 Agent 工作台。`
    const result = await window.vexnar.app.copyText(text)
    if (!result.ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section
      className="relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-bg"
      aria-label="个人资料"
    >
      <div className="drag-region absolute inset-x-0 top-0 z-10 h-12 bg-bg">
        <div className="no-drag flex h-full w-full items-center justify-end gap-2 px-8">
          <HeadAction
            icon={<Pencil className="h-4 w-4" strokeWidth={1.6} />}
            label="编辑"
            onClick={() => setEditing(true)}
          />
          <HeadAction icon={<Lock className="h-4 w-4" strokeWidth={1.6} />} label="私有" />
          <HeadAction
            icon={<Share2 className="h-4 w-4" strokeWidth={1.6} />}
            label={copied ? '已复制' : '分享'}
            onClick={() => void share()}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-6 pb-24">
          <div className="mx-auto w-full max-w-[736px]">
            <div className="flex flex-col items-center pt-[47px]">
              <ProfileAvatar name={accountName} color={settings.avatarColor} size="xl" />
              <h1 className="mt-[17px] text-center text-[24px] font-semibold leading-8 tracking-tight text-ink">
                {accountName}
              </h1>
              <p className="mt-[6px] text-center text-[14px] leading-5 text-muted">{handle}</p>
            </div>

            <div className="mt-[47px] flex h-[62px] divide-x divide-line-soft overflow-hidden rounded-[14px] border border-line-soft bg-bg">
              <StatCell value={formatTokenCount(summary.totalTokens)} label="累计 Token 数" />
              <StatCell value={formatTokenCount(summary.peakDayTokens)} label="Token 使用峰值" />
              <StatCell value={formatDuration(summary.longestTaskMs)} label="最长任务用时" />
              <StatCell value={formatDayCount(summary.longestStreakDays)} label="最长连续天数" />
              <StatCell value={formatDayCount(summary.currentStreakDays)} label="当前连续天数" />
            </div>

            <section className="mt-[47px]">
              <h2 className="text-[15px] font-semibold leading-5 text-ink">用量与额度</h2>
              <div className="mt-[21px] rounded-[16px] bg-panel px-6 py-6">
                <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                  <Metric
                    label="请求次数"
                    value={summary.requests === null ? '—' : summary.requests.toLocaleString()}
                  />
                  <Metric
                    label="已用额度"
                    value={quotaValue(newApi?.quota ?? null, newApi?.quota?.used ?? 0)}
                  />
                  <Metric
                    label="剩余额度"
                    value={
                      newApi?.quota?.unlimited
                        ? '不限'
                        : quotaValue(newApi?.quota ?? null, newApi?.quota?.remaining ?? 0)
                    }
                  />
                  <Metric
                    label="最近活跃"
                    value={summary.lastActiveAt ? formatRelativeTime(summary.lastActiveAt) : '—'}
                  />
                </div>
                <p className="mt-5 border-t border-line-soft pt-4 text-[11.5px] leading-5 text-muted">
                  {summary.source === 'relay'
                    ? `Token 与请求次数来自 HXSEC 中转平台消费日志${
                        summary.truncated ? '（仅取最近 500 条）' : ''
                      }；任务时长与连续天数由本机会话数据计算。`
                    : '中转平台未开放消费日志，Token 指标暂不可用；任务时长与连续天数由本机会话数据计算。'}
                </p>
                <div className="mt-2 flex items-start gap-2 text-[11.5px] leading-5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full',
                      newApi?.accessToken ? 'bg-accent-2' : 'bg-warn'
                    )}
                  />
                  <span className="text-muted">
                    {newApi?.accessToken
                      ? `访问令牌 ${newApi.accessToken.name} 已就绪（${newApi.accessToken.scopes.length} 项权限），随 API Key 一起在退出登录时撤销。`
                      : `访问令牌未创建：${newApi?.accessTokenError || '等待登录后自动创建'}`}
                  </span>
                </div>
              </div>
            </section>

            <section className="mt-[47px]">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[15px] font-semibold leading-5 text-ink">Token 活动</h2>
                <div className="flex items-center gap-3">
                  {(
                    [
                      ['day', '每天'],
                      ['week', '每周'],
                      ['total', '累计总量']
                    ] as Array<['day' | 'week' | 'total', string]>
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMode(value)}
                      className={cn(
                        'text-[12.5px] transition-colors',
                        mode === value ? 'text-ink' : 'text-muted hover:text-ink-soft'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div ref={cardRef} className="relative mt-[21px] rounded-[16px] bg-panel px-6 py-6">
                <div className="flex gap-[3px] overflow-hidden" onMouseLeave={() => setTip(null)}>
                  {heat.columns.map((column, index) => (
                    <div key={index} className="flex flex-col gap-[3px]">
                      {column.map((cell) => (
                        <div
                          key={cell.at}
                          onMouseEnter={(event) => setTipAt(event, cell)}
                          className={cn(
                            'rounded-[2px] transition-transform hover:scale-125',
                            cell.level === 0 && 'heat-0',
                            cell.level === 1 && 'heat-1',
                            cell.level === 2 && 'heat-2',
                            cell.level === 3 && 'heat-3',
                            cell.level === 4 && 'heat-4'
                          )}
                          style={{ width: CELL, height: CELL }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                {tip ? (
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-[10px] bg-[#22222a] px-3 py-2 text-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.45)]"
                    style={{ left: tip.left, top: tip.top - 6 }}
                  >
                    <div className="whitespace-nowrap text-[12.5px] font-medium leading-4">
                      {tip.date}
                    </div>
                    <div className="mt-1 flex items-center gap-1 whitespace-nowrap text-[12.5px] leading-4">
                      {tip.tokens > 0 ? (
                        <>
                          <span className="text-white">{formatTokenCount(tip.tokens)}</span>
                          <span className="text-white/55">↑ Token</span>
                        </>
                      ) : (
                        <span className="text-white/55">无活动</span>
                      )}
                    </div>
                  </div>
                ) : null}
                <div className="relative mt-2 h-4">
                  {heat.months.map((month) => (
                    <span
                      key={`${month.label}-${month.index}`}
                      className="absolute top-0 text-[10.5px] text-muted"
                      style={{ left: month.index * (CELL + GAP) }}
                    >
                      {month.label}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-[47px]">
              <h2 className="text-[15px] font-semibold leading-5 text-ink">热门插件</h2>
              <div className="mt-[21px] flex items-center gap-3 rounded-[16px] bg-panel px-6 py-5">
                {[0, 1, 2, 3].map((slot) => (
                  <div
                    key={slot}
                    title="插件位占位"
                    className="grid h-12 w-12 place-items-center rounded-[14px] border border-line-soft bg-bg text-muted/70"
                  >
                    <Boxes className="h-5 w-5" strokeWidth={1.6} />
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-[47px]">
              <h2 className="text-[15px] font-semibold leading-5 text-ink">洞察</h2>
              <div className="mt-[21px] rounded-[16px] bg-panel px-6 py-3">
                <InsightRow label="快速模式" value="未使用" />
                <InsightRow
                  label="最常用的推理强度"
                  value={effort ? `${effort.label} · ${effort.share}%` : '—'}
                />
                <InsightRow label="已探索技能数" value={skillsUsed.length.toLocaleString()} />
                <InsightRow label="使用的技能总数" value={skillCalls.toLocaleString()} />
              </div>
            </section>
          </div>
        </div>
      </div>

      <ProfileDialog open={editing} onOpenChange={setEditing} />
    </section>
  )
}
