// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  BadgePercent,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Gift,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wallet
} from 'lucide-react'
import alipayIcon from '@/assets/payment/alipay.svg'
import wechatIcon from '@/assets/payment/wechat.svg'
import type { NewApiPlan, NewApiQuota, NewApiWallet } from '@shared/contracts'
import { useI18n, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'
import { PaymentDialog, type PaymentIntent } from './PaymentDialog'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from './ui'

type Tab = 'topup' | 'plans' | 'redeem'

function PaymentMethodIcon({ type }: { type: string }): React.JSX.Element {
  if (type === 'alipay') {
    return (
      <img
        src={alipayIcon}
        alt=""
        draggable={false}
        className="h-[17px] w-[17px] max-h-full max-w-full object-contain"
      />
    )
  }
  if (type === 'wxpay' || type === 'wechat') {
    return (
      <img
        src={wechatIcon}
        alt=""
        draggable={false}
        className="h-[17px] w-[17px] max-h-full max-w-full object-contain"
      />
    )
  }
  return <CreditCard className="h-4 w-4" />
}

const DEFAULT_PRESETS = [10, 20, 50, 100, 200, 500]

function currencySymbol(currency: string): string {
  if (currency === 'USD') return '$'
  if (currency === 'EUR') return '€'
  if (currency === 'CNY' || currency === 'RMB') return '¥'
  return `${currency} `
}

function money(value: number, currency = 'CNY'): string {
  return `${currencySymbol(currency)}${value.toLocaleString('zh-CN', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  })}`
}

function quotaMoney(quota: NewApiQuota | null, units: number): string {
  if (!quota || quota.quotaPerUnit <= 0) return '—'
  return money((units / quota.quotaPerUnit) * quota.usdExchangeRate)
}

function discountRate(wallet: NewApiWallet | null, amount: number): number {
  const rate = wallet?.topup.discount[String(amount)]
  return typeof rate === 'number' && rate > 0 && rate <= 1 ? rate : 1
}

export function WalletDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const t = useT()
  const locale = useI18n((state) => state.locale)
  const newApi = useAppStore((state) => state.newApi)
  const refreshNewApi = useAppStore((state) => state.refreshNewApi)
  const quota = newApi?.quota ?? null
  const [tab, setTab] = useState<Tab>('topup')
  const [wallet, setWallet] = useState<NewApiWallet | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [amount, setAmount] = useState(0)
  const [customAmount, setCustomAmount] = useState('')
  const [method, setMethod] = useState('')
  const [quote, setQuote] = useState<number | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [planMethod, setPlanMethod] = useState('balance')
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null)
  const [redeemCode, setRedeemCode] = useState('')
  const [redeemError, setRedeemError] = useState<string | null>(null)
  const [checkout, setCheckout] = useState<PaymentIntent | null>(null)
  const [planIndex, setPlanIndex] = useState(0)
  const planTrackRef = useRef<HTMLDivElement | null>(null)
  const reduceMotion = useReducedMotion()

  const pane = (children: React.ReactNode, center = false): React.JSX.Element => (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn('min-h-full', center && 'flex flex-col justify-center')}
    >
      {children}
    </motion.div>
  )

  const load = useCallback(async (): Promise<void> => {
    if (!newApi?.authenticated) {
      setWallet(null)
      setLoading(false)
      setLoadError(t('wallet.notLoggedIn'))
      return
    }
    setLoading(true)
    setLoadError(null)
    const result = await window.vexnar.newapi.wallet()
    setLoading(false)
    if (!result.ok) {
      setLoadError(result.error)
      return
    }
    setWallet(result.data)
    const presets = result.data.topup.amountOptions
    const initial = presets.length > 0 ? presets[0] : Math.max(10, result.data.topup.minTopup)
    setAmount(initial)
    setCustomAmount(String(initial))
    setMethod((current) => {
      const exists = result.data.topup.methods.some((item) => item.type === current)
      return exists ? current : result.data.topup.methods[0]?.type ?? ''
    })
    setPlanMethod((current) => {
      const balanceAllowed = result.data.plans.some((plan) => plan.allowBalancePay)
      if (current === 'balance' && balanceAllowed) return 'balance'
      if (current !== 'balance' && result.data.topup.methods.some((m) => m.type === current)) {
        return current
      }
      return balanceAllowed ? 'balance' : result.data.topup.methods[0]?.type ?? ''
    })
    setSelectedPlan((current) =>
      result.data.plans.some((plan) => plan.id === current)
        ? current
        : result.data.plans[0]?.id ?? null
    )
  }, [newApi?.authenticated, t])

  useEffect(() => {
    if (!open) return
    setActionError(null)
    setRedeemError(null)
    setCheckout(null)
    void load()
  }, [open, load])

  const minTopup = wallet?.topup.minTopup ?? 1
  const presets = useMemo(() => {
    const source = wallet?.topup.amountOptions ?? []
    const values = source.length > 0 ? source : DEFAULT_PRESETS
    return Array.from(new Set(values.filter((value) => value >= Math.min(minTopup, 1))))
  }, [wallet, minTopup])

  const amountValid = Number.isFinite(amount) && amount >= minTopup
  const selectedMethod = wallet?.topup.methods.find((item) => item.type === method)
  const canPay =
    Boolean(wallet?.topup.onlineEnabled) &&
    Boolean(selectedMethod) &&
    amountValid &&
    (selectedMethod ? amount >= selectedMethod.minTopup : false)

  useEffect(() => {
    if (tab !== 'topup' || !open || !wallet?.topup.onlineEnabled || !amountValid) {
      setQuote(null)
      setQuoting(false)
      return
    }
    let cancelled = false
    setQuote(null)
    setQuoting(true)
    const timer = window.setTimeout(() => {
      void window.vexnar.newapi
        .topupQuote({ amount: Math.trunc(amount) })
        .then((result) => {
          if (cancelled) return
          setQuoting(false)
          setQuote(result.ok ? result.data.payable : null)
        })
    }, 320)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      setQuoting(false)
    }
  }, [amount, amountValid, open, tab, wallet])

  const chooseAmount = (value: number): void => {
    setAmount(value)
    setCustomAmount(String(value))
    setQuote(null)
    setActionError(null)
  }

  const changeCustomAmount = (value: string): void => {
    setCustomAmount(value)
    const parsed = Number.parseInt(value, 10)
    setAmount(Number.isFinite(parsed) ? parsed : 0)
    setQuote(null)
    setActionError(null)
  }

  const plans = wallet?.plans ?? []
  const accountLabel =
    newApi?.user?.displayName || newApi?.user?.username || t('quota.notLoggedIn')

  const planMethodsFor = (plan: NewApiPlan): { type: string; name: string }[] => [
    ...(plan.allowBalancePay
      ? [{ type: 'balance', name: t('wallet.plan.balance') }]
      : []),
    ...(wallet?.topup.methods ?? []).map((item) => ({ type: item.type, name: item.name }))
  ]

  const durationLabel = (plan: NewApiPlan): string =>
    t(`wallet.unit.${plan.durationUnit}` as Parameters<typeof t>[0], {
      n: plan.durationValue
    })

  const openTopupCheckout = (): void => {
    if (!canPay || !selectedMethod) return
    setActionError(null)
    setCheckout({
      kind: 'topup',
      amount: Math.trunc(amount),
      payable: quote ?? amount * discountRate(wallet, amount),
      method: selectedMethod.type,
      methodName: selectedMethod.name,
      account: accountLabel
    })
  }

  const openPlanCheckout = (plan: NewApiPlan): void => {
    const methods = planMethodsFor(plan)
    if (methods.length === 0) {
      setActionError(t('wallet.noMethods'))
      return
    }
    const chosen = methods.some((item) => item.type === planMethod)
      ? planMethod
      : methods[0].type
    setSelectedPlan(plan.id)
    setPlanMethod(chosen)
    setActionError(null)
    setCheckout({
      kind: 'plan',
      plan,
      method: chosen,
      duration: durationLabel(plan),
      methods,
      account: accountLabel
    })
  }

  const openRedeemCheckout = (): void => {
    const code = redeemCode.trim()
    if (!code) {
      setRedeemError(t('wallet.redeemEmpty'))
      return
    }
    setRedeemError(null)
    setCheckout({
      kind: 'redeem',
      code,
      account: accountLabel,
      creditedLabel: (units) => quotaMoney(quota, units)
    })
  }

  const syncPlanIndex = (): void => {
    const track = planTrackRef.current
    if (!track) return
    const cards = Array.from(track.children) as HTMLElement[]
    if (cards.length === 0) return
    const nearest = cards.reduce(
      (best, card, index) =>
        Math.abs(card.offsetLeft - track.offsetLeft - track.scrollLeft) <
        Math.abs(cards[best].offsetLeft - track.offsetLeft - track.scrollLeft)
          ? index
          : best,
      0
    )
    setPlanIndex(nearest)
  }

  const scrollPlans = (direction: number): void => {
    const track = planTrackRef.current
    if (!track) return
    const cards = Array.from(track.children) as HTMLElement[]
    if (cards.length === 0) return
    const lastStart = Math.max(0, cards.length - 3)
    const next = Math.max(0, Math.min(lastStart, planIndex + direction))
    track.scrollTo({ left: cards[next].offsetLeft - track.offsetLeft, behavior: 'smooth' })
    setPlanIndex(next)
  }

  const resetLabel = (period: string): string => {
    const key = `wallet.reset.${period}`
    const label = t(key as Parameters<typeof t>[0])
    return label === key ? period : label
  }

  const discountLabel = (rate: number): string =>
    locale === 'zh'
      ? t('wallet.discount', { rate: Number((rate * 10).toFixed(1)) })
      : `${Math.round((1 - rate) * 100)}% off`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby="wallet-description"
        className="flex h-[min(560px,92vh)] w-[min(940px,calc(100vw-40px))] flex-col gap-0 overflow-hidden rounded-[24px] border-line bg-bg p-0 codex-popover"
      >
        <div className="flex items-start gap-2.5 border-b border-line-soft px-5 pb-3 pt-4 pr-12">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
            <Wallet className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-[17px] leading-5">{t('wallet.title')}</DialogTitle>
            <DialogDescription id="wallet-description" className="mt-0.5 text-[10.5px]">
              {t('wallet.subtitle')}
              {newApi?.user ? ` · ${newApi.user.displayName || newApi.user.username}` : ''}
            </DialogDescription>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <div className="text-right">
              <div className="text-[9.5px] text-muted">{t('wallet.balance')}</div>
              <div className="text-[17px] font-semibold leading-5 text-ink">
                {quota ? quotaMoney(quota, quota.remaining) : '—'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              aria-label={t('wallet.refresh')}
              className="grid h-6 w-6 place-items-center rounded-md text-muted transition-colors hover:bg-panel-2 hover:text-ink disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </button>
          </div>
        </div>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as Tab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="px-5 pt-3">
            <TabsList className="grid w-full grid-cols-3 gap-1 rounded-lg bg-panel-2 p-1">
              <TabsTrigger value="topup" className="gap-1.5 py-1.5 text-[11.5px]">
                <Wallet className="h-3.5 w-3.5" />
                {t('wallet.tab.topup')}
              </TabsTrigger>
              <TabsTrigger value="plans" className="gap-1.5 py-1.5 text-[11.5px]">
                <Sparkles className="h-3.5 w-3.5" />
                {t('wallet.tab.plans')}
              </TabsTrigger>
              <TabsTrigger value="redeem" className="gap-1.5 py-1.5 text-[11.5px]">
                <Gift className="h-3.5 w-3.5" />
                {t('wallet.tab.redeem')}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className={cn('min-h-0 flex-1 px-5 py-4', tab === 'plans' ? 'overflow-hidden' : 'overflow-y-auto [scrollbar-gutter:stable]')}>
            {loading ? (
              <div className="grid place-items-center gap-2 py-16 text-[12px] text-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
                {t('wallet.loading')}
              </div>
            ) : loadError ? (
              <div className="mx-auto max-w-[420px] space-y-3 py-12 text-center">
                <div className="text-[13px] font-medium text-ink">{t('wallet.loadFailed')}</div>
                <div className="text-[11.5px] leading-5 text-muted">{loadError}</div>
                <div className="flex justify-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void load()}>
                    {t('wallet.retry')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void window.vexnar.newapi.openPlatform()}
                  >
                    {t('wallet.openPlatform')}
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : !wallet ? null : (
              <>
                <TabsContent value="topup" className="mt-0">
                  {pane(
                  <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_252px]">
                    <div className="space-y-5">
                      <section>
                        <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted">
                          {t('wallet.amount')}
                        </div>
                        <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                          {presets.map((preset) => {
                            const rate = discountRate(wallet, preset)
                            const active = amount === preset
                            return (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => chooseAmount(preset)}
                                className={cn(
                                  'relative rounded-lg border px-3 py-2.5 text-left transition-colors',
                                  active
                                    ? 'border-accent bg-accent/8 ring-1 ring-accent/30'
                                    : 'border-line bg-panel/60 hover:border-line-soft hover:bg-panel-2'
                                )}
                              >
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-[16.5px] font-semibold text-ink">
                                    ¥{preset.toLocaleString()}
                                  </span>
                                  {rate < 1 ? (
                                    <span className="rounded-md bg-accent-2/12 px-1.5 py-0.5 text-[9.5px] font-medium text-accent-2">
                                      {discountLabel(rate)}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-0.5 text-[9.5px] text-muted">
                                  {rate < 1
                                    ? `支付 ¥${(preset * rate).toFixed(2)}`
                                    : `到账 ¥${preset.toLocaleString()}`}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </section>

                      <section>
                        <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted">
                          {t('wallet.customAmount')}
                        </div>
                        <div className="mt-1.5 flex h-9 items-center gap-2 rounded-lg border border-line bg-panel-2 px-2.5 focus-within:ring-2 focus-within:ring-accent/40">
                          <span className="text-[14px] text-muted">¥</span>
                          <input
                            value={customAmount}
                            onChange={(event) => changeCustomAmount(event.target.value)}
                            inputMode="numeric"
                            placeholder={String(minTopup)}
                            aria-label={t('wallet.customAmount')}
                            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/60"
                          />
                          <span className="shrink-0 text-[9.5px] text-muted">
                            {t('wallet.minHint', { min: minTopup })}
                          </span>
                        </div>
                      </section>

                      <section>
                        <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted">
                          {t('wallet.paymentMethod')}
                        </div>
                        {wallet.topup.methods.length > 0 ? (
                          <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                            {wallet.topup.methods.map((item) => {
                              const disabled = item.minTopup > amount
                              const active = method === item.type
                              return (
                                <button
                                  key={item.type}
                                  type="button"
                                  disabled={disabled}
                                  title={
                                    disabled
                                      ? t('wallet.minHint', { min: item.minTopup })
                                      : item.name
                                  }
                                  onClick={() => {
                                    setMethod(item.type)
                                    setActionError(null)
                                  }}
                                  className={cn(
                                    'flex min-h-[46px] items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45',
                                    active
                                      ? 'border-accent bg-accent/8 ring-1 ring-accent/30'
                                      : 'border-line bg-panel/60 hover:bg-panel-2'
                                  )}
                                >
                                  <span className="grid h-6 w-6 shrink-0 place-items-center overflow-visible rounded-md bg-white text-muted ring-1 ring-black/5">
                                    <PaymentMethodIcon type={item.type} />
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-[11.5px] text-ink">
                                      {item.name}
                                    </span>
                                    {item.minTopup > 1 ? (
                                      <span className="block text-[9px] text-muted">
                                        {t('wallet.minHint', { min: item.minTopup })}
                                      </span>
                                    ) : null}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="mt-1.5 rounded-lg border border-line-soft bg-panel/60 px-3 py-2.5 text-[10.5px] leading-5 text-muted">
                            {t('wallet.noMethods')}
                          </div>
                        )}
                      </section>

                      {!wallet.topup.onlineEnabled ? (
                        <div className="rounded-lg border border-line-soft bg-panel/60 px-3 py-2 text-[10.5px] leading-5 text-muted">
                          {t('wallet.noTopup')}
                        </div>
                      ) : null}
                    </div>

                    <aside className="rounded-xl border border-line bg-panel/60 p-3.5">
                      <div className="text-[10px] text-muted">{t('wallet.payable')}</div>
                      <div className="mt-1 flex items-baseline gap-1">
                        <span className="text-[24px] font-semibold tracking-tight text-ink">
                          {quoting
                            ? '…'
                            : quote !== null
                              ? money(quote)
                              : amount > 0
                                ? money(amount * discountRate(wallet, amount))
                                : '—'}
                        </span>
                        {quoting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
                        ) : null}
                      </div>
                      {quote !== null && quote < amount * discountRate(wallet, amount) - 0.001 ? (
                        <div className="mt-0.5 text-[10px] text-accent-2">
                          {t('wallet.saved', {
                            amount: (amount * discountRate(wallet, amount) - quote).toFixed(2)
                          })}
                        </div>
                      ) : null}

                      <div className="mt-2.5 space-y-1 border-t border-line-soft pt-2.5 text-[10.5px]">
                        <div className="flex justify-between gap-2 text-muted">
                          <span>{t('wallet.rechargeAmount')}</span>
                          <span className="text-ink-soft">¥{amount > 0 ? amount : '—'}</span>
                        </div>
                        <div className="flex justify-between gap-2 text-muted">
                          <span>{t('wallet.paymentMethod')}</span>
                          <span className="max-w-[120px] truncate text-ink-soft">
                            {selectedMethod?.name || '—'}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2 text-muted">
                          <span>{t('wallet.used')}</span>
                          <span className="text-ink-soft">
                            {quota ? quotaMoney(quota, quota.used) : '—'}
                          </span>
                        </div>
                      </div>

                      <Button
                        className="mt-3.5 w-full"
                        disabled={!canPay}
                        onClick={openTopupCheckout}
                      >
                        <BadgePercent className="h-4 w-4" />
                        {t('wallet.payNow')}
                      </Button>
                      <p className="mt-1.5 text-[9px] leading-4 text-muted/80">
                        {t('wallet.payHint')}
                      </p>
                      {actionError ? (
                        <div className="mt-2 text-[10px] leading-4 text-danger">{actionError}</div>
                      ) : null}
                    </aside>
                  </div>
                  )}
                </TabsContent>

                <TabsContent value="plans" className="mt-0 flex h-full flex-col justify-center">
                  {pane(
                  <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-ink">{t('wallet.plansTitle')}</span>
                        <span className="rounded-full border border-line-soft px-2 py-0.5 text-[9px] text-muted">
                          {plans.length} {locale === 'zh' ? '个方案' : 'plans'}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted">{t('wallet.plansHint')}</div>
                    </div>
                    {plans.length > 3 ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={t('wallet.carousel.prev')}
                          disabled={planIndex === 0}
                          onClick={() => scrollPlans(-1)}
                          className="grid h-7 w-7 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-panel-2 hover:text-ink disabled:opacity-30"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-7 text-center text-[9.5px] tabular-nums text-muted">
                          {planIndex + 1}/{plans.length}
                        </span>
                        <button
                          type="button"
                          aria-label={t('wallet.carousel.next')}
                          disabled={planIndex >= Math.max(0, plans.length - 3)}
                          onClick={() => scrollPlans(1)}
                          className="grid h-7 w-7 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-panel-2 hover:text-ink disabled:opacity-30"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {plans.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-line px-4 py-10 text-center text-[12px] text-muted">
                      {wallet.plansError
                        ? t('wallet.plansUnavailable', { error: wallet.plansError })
                        : t('wallet.noPlans')}
                    </div>
                  ) : (
                    <>
                      <div
                        ref={planTrackRef}
                        onScroll={syncPlanIndex}
                        onWheel={(event) => {
                          if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
                            event.currentTarget.scrollLeft += event.deltaY
                          }
                        }}
                        className="mt-2.5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      >
                        {plans.map((plan) => {
                          const active = selectedPlan === plan.id
                          return (
                            <div
                              key={plan.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                setSelectedPlan(plan.id)
                                setActionError(null)
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  setSelectedPlan(plan.id)
                                }
                              }}
                              className={cn(
                                'flex h-[228px] w-[calc((100%-20px)/3)] shrink-0 snap-start cursor-pointer flex-col rounded-xl border p-3 text-left transition-all',
                                active
                                  ? 'border-accent bg-accent/6 shadow-[0_8px_24px_-18px_rgb(47_111_235/0.55)] ring-1 ring-accent/25'
                                  : 'border-line bg-panel/50 hover:bg-panel-2/70'
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate text-[12px] font-semibold text-ink">
                                    {plan.title}
                                  </div>
                                  <div className="mt-0.5 line-clamp-1 text-[9.5px] leading-4 text-muted">
                                    {plan.subtitle || t('wallet.plansHint')}
                                  </div>
                                </div>
                                {active ? (
                                  <span className="grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
                                    <Check className="h-2.5 w-2.5" />
                                  </span>
                                ) : null}
                              </div>

                              <div className="mt-2.5 flex items-baseline gap-1">
                                <span className="text-[21px] font-semibold leading-6 tracking-tight text-ink">
                                  {money(plan.priceAmount, plan.currency)}
                                </span>
                                <span className="text-[9.5px] text-muted">
                                  / {durationLabel(plan)}
                                </span>
                              </div>

                              <div className="mt-2 space-y-1 border-t border-line-soft pt-2 text-[9.5px] text-muted">
                                <div className="flex items-center justify-between gap-2">
                                  <span>{t('wallet.plan.quota')}</span>
                                  <span className="truncate text-ink-soft">
                                    {plan.totalAmount > 0
                                      ? quotaMoney(quota, plan.totalAmount)
                                      : t('quota.unlimited')}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span>{t('wallet.plan.reset')}</span>
                                  <span className="truncate text-ink-soft">
                                    {resetLabel(plan.quotaResetPeriod)}
                                  </span>
                                </div>
                                {plan.upgradeGroup ? (
                                  <div className="flex items-center justify-between gap-2">
                                    <span>{t('quota.group')}</span>
                                    <span className="truncate text-ink-soft">{plan.upgradeGroup}</span>
                                  </div>
                                ) : null}
                              </div>

                              <Button
                                className="mt-auto h-7 w-full text-[10.5px]"
                                variant={active ? 'default' : 'secondary'}
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  openPlanCheckout(plan)
                                }}
                              >
                                <Sparkles className="h-3 w-3" />
                                {t('wallet.plan.buy')}
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 text-[9px] text-muted/80">
                          <ShieldCheck className="h-3 w-3" />
                          {t('wallet.plan.methodHint')}
                        </span>
                        {plans.length > 3 ? (
                          <div className="flex items-center gap-1">
                            {Array.from({ length: Math.max(1, plans.length - 2) }, (_, index) => (
                              <button
                                key={index}
                                type="button"
                                aria-label={`${index + 1}`}
                                onClick={() => scrollPlans(index - planIndex)}
                                className={cn(
                                  'h-1.5 rounded-full transition-all',
                                  index === Math.min(planIndex, Math.max(0, plans.length - 3))
                                    ? 'w-4 bg-ink/60'
                                    : 'w-1.5 bg-line hover:bg-muted/50'
                                )}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </>
                  )}

                  {actionError ? (
                    <div className="mt-2 text-[10px] text-danger">{actionError}</div>
                  ) : null}
                  </>,
                  true
                  )}
                </TabsContent>

                <TabsContent value="redeem" className="mt-0">
                  {pane(
                  <div className="mx-auto flex min-h-[330px] max-w-[420px] flex-col justify-center py-2">
                    <div className="flex flex-col items-center text-center">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-2/10 text-accent-2">
                        <Gift className="h-5 w-5" />
                      </div>
                      <div className="mt-2.5 text-[14px] font-semibold text-ink">
                        {t('wallet.redeemTitle')}
                      </div>
                      <div className="mt-1 text-[10.5px] leading-5 text-muted">
                        {t('wallet.redeemHint')}
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <Input
                        value={redeemCode}
                        onChange={(event) => {
                          setRedeemCode(event.target.value)
                          setRedeemError(null)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') openRedeemCheckout()
                        }}
                        disabled={!wallet.topup.redemptionEnabled}
                        placeholder={t('wallet.redeemPlaceholder')}
                        className="h-9 font-mono text-[11.5px]"
                        aria-label={t('wallet.redeemTitle')}
                      />
                      <Button
                        size="lg"
                        className="shrink-0"
                        disabled={!wallet.topup.redemptionEnabled || !redeemCode.trim()}
                        onClick={openRedeemCheckout}
                      >
                        <Gift className="h-4 w-4" />
                        {t('wallet.redeemNow')}
                      </Button>
                    </div>

                    {!wallet.topup.redemptionEnabled ? (
                      <div className="mt-3 text-[10.5px] text-muted">
                        {t('wallet.redeemDisabled')}
                      </div>
                    ) : null}
                    {redeemError ? (
                      <div className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[10.5px] leading-5 text-danger">
                        {redeemError}
                      </div>
                    ) : null}
                    <div className="mt-4 border-t border-line-soft pt-2.5 text-center text-[9px] leading-4 text-muted/70">
                      {t('wallet.offlineHint')}
                    </div>
                  </div>
                  )}
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>

        {checkout ? (
          <PaymentDialog
            intent={checkout}
            onClose={() => setCheckout(null)}
            onCompleted={() => {
              if (checkout.kind === 'redeem') setRedeemCode('')
              void load()
              void refreshNewApi()
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}