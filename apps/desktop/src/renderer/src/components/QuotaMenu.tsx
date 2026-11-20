// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Wallet } from 'lucide-react'
import type { NewApiPlan, NewApiQuota } from '@shared/contracts'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'

/**
 * 侧栏额度入口。
 *
 * 保留余额、已用金额与订阅分组，方便用户判断当前额度来源；
 * 外圈水位线按 100 元满额显示，余额越低颜色越偏红；
 * 余额与订阅额度各自显示百分比条，订阅额度按套餐总额区间归一化。
 * 不展示请求数，避免上游 quota 口径差异造成误导。
 */
const LEVEL_CAP = 100
const RING_RADIUS = 14
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function clampLevel(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}

function quotaAmount(quota: NewApiQuota | null, raw: number): number | null {
  if (!quota || quota.quotaPerUnit <= 0) return null
  const value = (raw / quota.quotaPerUnit) * quota.usdExchangeRate
  return Number.isFinite(value) ? value : null
}

function quotaMoney(quota: NewApiQuota | null, raw: number): string {
  const value = quotaAmount(quota, raw)
  if (value === null) return '—'
  if (value === 0) return '¥0.00'
  const decimals = Math.abs(value) < 1 ? 4 : 2
  return `¥${value.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`
}

function waterColor(level: number): string {
  const ratio = Math.min(1, Math.max(0, level))
  const stops: { at: number; color: [number, number, number] }[] = [
    { at: 0, color: [239, 68, 68] },
    { at: 0.4, color: [249, 115, 22] },
    { at: 0.7, color: [234, 179, 8] },
    { at: 1, color: [34, 197, 94] }
  ]
  for (let index = 1; index < stops.length; index += 1) {
    const right = stops[index]
    if (ratio > right.at) continue
    const left = stops[index - 1]
    const progress = (ratio - left.at) / (right.at - left.at)
    const color = left.color.map((channel, channelIndex) =>
      Math.round(channel + (right.color[channelIndex] - channel) * progress)
    )
    return `rgb(${color.join(', ')})`
  }
  return 'rgb(34, 197, 94)'
}

export function QuotaMenu(): React.JSX.Element {
  const t = useT()
  const newApi = useAppStore((state) => state.newApi)
  const openWallet = useAppStore((state) => state.openWallet)
  const [open, setOpen] = useState(false)
  const [plans, setPlans] = useState<NewApiPlan[]>([])
  const [selectedGroup, setSelectedGroup] = useState(
    newApi?.token?.group || newApi?.user?.group || ''
  )
  const panelRef = useRef<HTMLDivElement | null>(null)
  const description = t('quota.source')
  const quota = newApi?.quota ?? null
  const subscriptions = newApi?.subscriptions ?? []
  const balance = quotaMoney(quota, quota?.remaining ?? 0)
  const balanceAmount = quotaAmount(quota, quota?.remaining ?? 0) ?? 0
  const level = clampLevel(balanceAmount / LEVEL_CAP)
  const ringColor = waterColor(level)
  const used = quotaMoney(quota, quota?.used ?? 0)
  const group = newApi?.token?.group || newApi?.user?.group || ''

  useEffect(() => {
    if (!open || plans.length > 0 || !newApi?.authenticated) return
    let cancelled = false
    void window.vexnar.newapi.wallet().then((result) => {
      if (!cancelled && result.ok) setPlans(result.data.plans)
    })
    return () => {
      cancelled = true
    }
  }, [open, plans.length, newApi?.authenticated])

  const groupOptions = useMemo(() => {
    const values = [
      group,
      ...subscriptions.map((subscription) => subscription.upgradeGroup),
      ...plans.map((plan) => plan.upgradeGroup)
    ]
    return Array.from(
      new Set(values.map((value) => value.trim()).filter((value) => value && value !== 'auto'))
    )
  }, [group, plans, subscriptions])

  useEffect(() => {
    setSelectedGroup((current) =>
      current && groupOptions.includes(current) ? current : group || groupOptions[0] || ''
    )
  }, [group, groupOptions])

  const subscriptionAmount = useMemo(() => {
    if (!selectedGroup) return 0
    return subscriptions
      .filter((subscription) => {
        if (subscription.status && subscription.status !== 'active') return false
        return (subscription.upgradeGroup || group) === selectedGroup
      })
      .reduce(
        (sum, subscription) =>
          sum + Math.max(0, subscription.amountTotal - subscription.amountUsed),
        0
      )
  }, [group, selectedGroup, subscriptions])

  const planAmounts = useMemo(
    () =>
      plans
        .map((plan) => quotaAmount(quota, plan.totalAmount))
        .filter((amount): amount is number => amount !== null && amount > 0),
    [plans, quota]
  )
  const subscriptionValue = quotaAmount(quota, subscriptionAmount) ?? 0
  const minPlanAmount = planAmounts.length > 0 ? Math.min(...planAmounts) : 0
  const maxPlanAmount = planAmounts.length > 0 ? Math.max(...planAmounts) : 0
  const subscriptionLevel =
    maxPlanAmount > minPlanAmount
      ? clampLevel((subscriptionValue - minPlanAmount) / (maxPlanAmount - minPlanAmount))
      : 0
  const subscriptionQuota = quota ? quotaMoney(quota, subscriptionAmount) : '¥0.00'

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        aria-label={description}
        aria-expanded={open}
        title={description}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'no-drag relative grid h-8 w-8 place-items-center rounded-full text-muted outline-none transition-colors hover:bg-panel-3/70 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/50',
          open && 'bg-panel-3/70 text-ink'
        )}
      >
        <svg
          viewBox="0 0 32 32"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
        >
          <circle
            cx="16"
            cy="16"
            r={RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.14"
            strokeWidth="2"
          />
          <circle
            cx="16"
            cy="16"
            r={RING_RADIUS}
            fill="none"
            stroke={ringColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - level)}
            style={{
              opacity: level > 0 ? 1 : 0,
              transition: 'stroke-dashoffset 500ms ease, stroke 300ms ease, opacity 200ms ease'
            }}
          />
        </svg>
        <Wallet className="relative h-[18px] w-[18px]" strokeWidth={1.8} />
      </button>

      {open
        ? createPortal(
            // 挂到 body：图标栏的 z-20 会形成层叠上下文，使 z-30 的侧栏拖拽手柄
            // 压在浮层上，出现一条贯穿浮层的竖线。Portal 后 z-50 才能覆盖全窗口。
            <div
              ref={panelRef}
              role="dialog"
              aria-label={description}
              className="fixed bottom-[72px] left-[58px] z-50 w-[272px] max-w-[calc(100vw-24px)] rounded-xl border border-line bg-bg px-3 py-2.5 text-[11.5px] leading-4 text-ink-soft codex-popover"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-[10.5px] text-muted">{description}</span>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    openWallet('topup')
                  }}
                  className="shrink-0 rounded-md border border-line px-2 py-0.5 text-[10.5px] text-ink-soft transition-colors hover:bg-panel-2 hover:text-ink"
                >
                  {t('quota.recharge')}
                </button>
              </div>

              <div className="mt-2.5 rounded-lg border border-line-soft bg-panel/60 px-3 py-2.5">
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[9.5px] text-muted">{t('quota.balance')}</div>
                    <div className="mt-0.5 truncate text-[19px] font-semibold leading-6 tracking-tight tabular-nums text-ink">
                      {balance}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[9.5px] text-muted">{t('quota.used')}</div>
                    <div className="mt-0.5 text-[12px] font-medium tabular-nums text-ink-soft">
                      {used}
                    </div>
                  </div>
                </div>

                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line-soft">
                    <div
                      className="h-full rounded-full transition-[width,background-color] duration-500"
                      style={{ width: `${level * 100}%`, backgroundColor: ringColor }}
                    />
                  </div>
                  <span className="w-7 shrink-0 text-right text-[9px] tabular-nums text-muted">
                    {Math.round(level * 100)}%
                  </span>
                </div>

                <div className="mt-2.5 border-t border-line-soft pt-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[9.5px] text-muted">{t('quota.subscription')}</span>
                    {groupOptions.length > 1 ? (
                      <label className="relative shrink-0">
                        <select
                          aria-label={t('quota.subscription')}
                          value={selectedGroup}
                          onChange={(event) => setSelectedGroup(event.target.value)}
                          className="h-6 max-w-[150px] appearance-none rounded-full border border-line-soft bg-bg py-0 pl-2 pr-5 text-[10px] text-ink outline-none transition-colors hover:border-line focus:border-accent"
                        >
                          {groupOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
                      </label>
                    ) : (
                      <span className="max-w-[150px] truncate rounded-full border border-line-soft bg-bg px-2 py-0.5 text-[10px] text-ink">
                        {selectedGroup || '—'}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex items-end justify-between gap-3">
                    <span className="text-[9.5px] text-muted">{t('quota.subscriptionQuota')}</span>
                    <span className="text-[12px] font-medium tabular-nums text-ink-soft">
                      {subscriptionQuota}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line-soft">
                      <div
                        className="h-full rounded-full transition-[width,background-color] duration-500"
                        style={{
                          width: `${subscriptionLevel * 100}%`,
                          backgroundColor: waterColor(subscriptionLevel)
                        }}
                      />
                    </div>
                    <span className="w-7 shrink-0 text-right text-[9px] tabular-nums text-muted">
                      {Math.round(subscriptionLevel * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

    </>
  )
}
