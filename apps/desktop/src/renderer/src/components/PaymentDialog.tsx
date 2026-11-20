// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import QRCode from 'qrcode'
import {
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  ScanLine,
  ShieldCheck,
  X
} from 'lucide-react'
import type { NewApiPaymentResult, NewApiPlan } from '@shared/contracts'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'
import { Button } from './ui'

export type PaymentIntent =
  | {
      kind: 'topup'
      amount: number
      payable: number
      method: string
      methodName: string
      account: string
    }
  | {
      kind: 'plan'
      plan: NewApiPlan
      method: string
      duration: string
      methods: { type: string; name: string }[]
      account: string
    }
  | {
      kind: 'redeem'
      code: string
      account: string
      creditedLabel: (units: number) => string
    }

type Phase = 'confirm' | 'processing' | 'qr' | 'success'

function money(value: number, currency = 'CNY'): string {
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '¥'
  return `${symbol}${value.toLocaleString('zh-CN', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  })}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function maskCode(code: string): string {
  if (code.length <= 8) return code
  return `${code.slice(0, 4)}••••${code.slice(-4)}`
}

/** 粉金/翠金光雾：参考 transfer-glow 的漂移光斑与上浮粒子。 */
function GlowCanvas({ tone }: { tone: 'pay' | 'success' }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    const canvas = ref.current
    const card = canvas?.parentElement
    if (!canvas || !card) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = card.clientWidth
    const height = card.clientHeight
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)
    if (reduce) {
      ctx.clearRect(0, 0, width, height)
      return
    }
    const start = performance.now()
    let raf = 0
    const colors =
      tone === 'success'
        ? [
            [58, 190, 120],
            [255, 202, 92],
            [132, 226, 168],
            [255, 174, 82]
          ]
        : [
            [246, 104, 235],
            [255, 162, 150],
            [255, 214, 119],
            [232, 123, 241]
          ]
    const motes = Array.from({ length: 46 }, (_, index) => ({
      x: (Math.sin(index * 12.9898) * 43758.5453) % 1,
      phase: (Math.sin(index * 78.233) * 12345.6789) % 1,
      speed: 0.2 + ((index * 17) % 13) / 42,
      size: 0.8 + ((index * 7) % 9) / 6
    }))
    const draw = (now: number): void => {
      const p = Math.min(1, (now - start) / 1700)
      ctx.clearRect(0, 0, width, height)
      const fade = 1 - Math.max(0, (p - 0.78) / 0.22)
      const t = now / 900
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const wash = (x: number, y: number, rx: number, ry: number, color: number[], alpha: number): void => {
        const gradient = ctx.createRadialGradient(x * width, y * height, 0, x * width, y * height, Math.max(rx * width, ry * height))
        gradient.addColorStop(0, `rgba(${color.join(',')},${alpha * fade})`)
        gradient.addColorStop(0.45, `rgba(${color.join(',')},${alpha * 0.6 * fade})`)
        gradient.addColorStop(1, `rgba(${color.join(',')},0)`)
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, width, height)
      }
      const base = 0.72 + 0.05 * Math.sin(t * 1.4)
      wash(0.18 + 0.06 * Math.sin(t), base, 0.58, 0.34, colors[0], 0.36)
      wash(0.7 + 0.05 * Math.cos(t * 0.8), base - 0.12, 0.46, 0.3, colors[1], 0.3)
      wash(0.5 + 0.06 * Math.sin(t * 0.65), base + 0.08, 0.52, 0.24, colors[2], 0.27)
      wash(0.9, base - 0.18, 0.3, 0.22, colors[3], 0.24)
      for (const mote of motes) {
        const life = (t * mote.speed + mote.phase) % 1
        const x = (mote.x + Math.sin(t + mote.phase * 6) * 0.02) * width
        const y = (base + 0.2 - life * 0.44) * height
        ctx.fillStyle = `rgba(255,255,255,${Math.sin(life * Math.PI) * 0.42 * fade})`
        ctx.beginPath()
        ctx.arc(x, y, mote.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
      if (p < 1) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [reduce, tone])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 z-0 h-full w-full',
        tone === 'success'
          ? 'opacity-80 [mask-image:radial-gradient(ellipse_at_center,transparent_34%,black_82%)]'
          : 'opacity-85'
      )}
    />
  )
}

export function PaymentDialog({
  intent,
  onClose,
  onCompleted
}: {
  intent: PaymentIntent
  onClose: () => void
  onCompleted: () => void
}): React.JSX.Element {
  const t = useT()
  const refreshNewApi = useAppStore((state) => state.refreshNewApi)
  const [phase, setPhase] = useState<Phase>('confirm')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [session, setSession] = useState<NewApiPaymentResult | null>(null)
  const [qr, setQr] = useState('')
  const [credited, setCredited] = useState<number | null>(null)
  const [method, setMethod] = useState('method' in intent ? intent.method : '')
  const [checking, setChecking] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [copied, setCopied] = useState('')
  const [statusText, setStatusText] = useState(t('wallet.confirm.creating'))
  const baselineRef = useRef<{ total: number; group: string } | null>(null)
  const completedRef = useRef(false)
  const cardRef = useRef<HTMLDivElement | null>(null)

  const methodName = useMemo(() => {
    if (intent.kind === 'plan') {
      return intent.methods.find((item) => item.type === method)?.name ?? method
    }
    if (intent.kind === 'topup') return intent.methodName
    return t('wallet.confirm.redeemValue')
  }, [intent, method, t])

  const amount = intent.kind === 'topup' ? intent.payable : intent.kind === 'plan' ? intent.plan.priceAmount : 0
  const currency = intent.kind === 'plan' ? intent.plan.currency : 'CNY'
  const successAmount =
    intent.kind === 'redeem'
      ? credited !== null
        ? intent.creditedLabel(credited)
        : '—'
      : session?.amount && session.amount > 0
        ? money(session.amount, session.currency || currency)
        : money(amount, currency)

  const title =
    intent.kind === 'topup'
      ? t('wallet.confirm.payTitle')
      : intent.kind === 'plan'
        ? t('wallet.confirm.planTitle')
        : t('wallet.confirm.redeemTitle')
  const subtitle =
    intent.kind === 'topup'
      ? t('wallet.confirm.paySubtitle')
      : intent.kind === 'plan'
        ? t('wallet.confirm.planSubtitle')
        : t('wallet.confirm.redeemSubtitle')

  const finish = useCallback((): void => {
    if (completedRef.current) return
    completedRef.current = true
    setPhase('success')
    onCompleted()
  }, [onCompleted])

  const checkPaid = useCallback(
    async (manual = false): Promise<boolean> => {
      const baseline = baselineRef.current
      if (!baseline) return false
      if (manual) setChecking(true)
      await refreshNewApi()
      const state = useAppStore.getState().newApi
      const quota = state?.quota
      const total = quota ? quota.remaining + quota.used : 0
      const group = state?.user?.group ?? ''
      const paid =
        (quota !== null && quota !== undefined && total > baseline.total + 0.01) ||
        Boolean(group && baseline.group && group !== baseline.group)
      if (manual) setChecking(false)
      if (paid) {
        finish()
        return true
      }
      if (manual) setNotice(t('wallet.qr.notYet'))
      return false
    },
    [finish, refreshNewApi, t]
  )

  // ePay 的 notify 由平台服务端处理；这里只观察账户余额/分组变化，避免在客户端持有商户密钥。
  useEffect(() => {
    if (phase !== 'qr') return
    const timer = window.setInterval(() => {
      void checkPaid()
    }, 3000)
    return () => window.clearInterval(timer)
  }, [checkPaid, phase])

  useEffect(() => {
    if (phase !== 'qr') return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'qr' || !session?.paymentUrl) return
    let alive = true
    void QRCode.toDataURL(session.paymentUrl, {
      margin: 1,
      width: 420,
      errorCorrectionLevel: 'M',
      color: { dark: '#17171a', light: '#ffffff' }
    })
      .then((url) => {
        if (alive) setQr(url)
      })
      .catch(() => {
        if (alive) setError(t('wallet.loadFailed'))
      })
    return () => {
      alive = false
    }
  }, [phase, session?.paymentUrl, t])

  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const previous = document.activeElement as HTMLElement | null
    const focusable = (): HTMLElement[] =>
      Array.from(
        card.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((node) => node.offsetParent !== null)
    focusable()[0]?.focus()
    const trap = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    card.addEventListener('keydown', trap)
    return () => {
      card.removeEventListener('keydown', trap)
      previous?.focus?.()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // 始终拦住 Escape，避免支付处理中把底层钱包弹窗一起关掉。
      event.stopPropagation()
      if (phase === 'processing') return
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose, phase])

  const confirm = async (): Promise<void> => {
    if (phase !== 'confirm') return
    setError(null)
    setNotice(null)
    setPhase('processing')
    setStatusText(t('wallet.confirm.creating'))
    const baselineState = useAppStore.getState().newApi
    const baselineQuota = baselineState?.quota
    baselineRef.current = {
      total: baselineQuota ? baselineQuota.remaining + baselineQuota.used : 0,
      group: baselineState?.user?.group ?? ''
    }
    const started = Date.now()
    const statusTimer = window.setTimeout(
      () => setStatusText(t('wallet.confirm.verifying')),
      620
    )
    try {
      const result =
        intent.kind === 'topup'
          ? await window.vexnar.newapi.topupPay({ amount: Math.trunc(intent.amount), method })
          : intent.kind === 'plan'
            ? await window.vexnar.newapi.subscribe({ planId: intent.plan.id, method })
            : await window.vexnar.newapi.redeem({ key: intent.code })
      await sleep(Math.max(0, 1150 - (Date.now() - started)))
      window.clearTimeout(statusTimer)
      if (!result.ok) {
        setPhase('confirm')
        setError(result.error)
        return
      }
      if (intent.kind === 'redeem') {
        setCredited((result.data as { credited: number }).credited)
        finish()
        return
      }
      const data = result.data as NewApiPaymentResult
      setSession(data)
      if (data.status === 'paid') {
        finish()
        return
      }
      if (!data.paymentUrl) {
        setPhase('confirm')
        setError(t('wallet.payOpened'))
        return
      }
      setPhase('qr')
    } catch (cause) {
      window.clearTimeout(statusTimer)
      setPhase('confirm')
      setError(cause instanceof Error ? cause.message : t('wallet.loadFailed'))
    }
  }

  const copy = async (value: string, key: string): Promise<void> => {
    if (!value) return
    const result = await window.vexnar.app.copyText(value)
    if (result.ok) {
      setCopied(key)
      window.setTimeout(() => setCopied(''), 1400)
    }
  }

  const expired = Boolean(session?.expiresAt && session.expiresAt <= now)
  const remainSeconds = session?.expiresAt
    ? Math.max(0, Math.ceil((session.expiresAt - now) / 1000))
    : 0
  const remainLabel = `${String(Math.floor(remainSeconds / 60)).padStart(2, '0')}:${String(
    remainSeconds % 60
  ).padStart(2, '0')}`

  const rows: { label: string; value: string; key?: string }[] = []
  if (intent.kind === 'topup') {
    rows.push({ label: t('wallet.confirm.recharge'), value: money(intent.amount) })
    rows.push({ label: t('wallet.confirm.method'), value: methodName })
    rows.push({ label: t('wallet.confirm.account'), value: intent.account })
  } else if (intent.kind === 'plan') {
    rows.push({ label: t('wallet.confirm.item'), value: intent.plan.title })
    rows.push({ label: t('wallet.confirm.planDuration'), value: intent.duration })
    rows.push({ label: t('wallet.confirm.method'), value: methodName })
    rows.push({ label: t('wallet.confirm.account'), value: intent.account })
  } else {
    rows.push({ label: t('wallet.confirm.redeemCode'), value: maskCode(intent.code) })
    rows.push({ label: t('wallet.confirm.account'), value: intent.account })
  }
  if (session?.orderId) {
    rows.push({ label: t('wallet.confirm.orderNo'), value: session.orderId, key: 'order' })
  }
  if (session?.merchantId) {
    rows.push({ label: t('wallet.confirm.merchantNo'), value: session.merchantId, key: 'merchant' })
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-ink/15 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && phase !== 'processing') onClose()
      }}
    >
      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.965, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-[min(430px,100%)] overflow-hidden rounded-[26px] border border-line bg-bg p-4 shadow-[0_24px_80px_-24px_rgb(0_0_0/0.35)]"
      >
        {(phase === 'processing' || phase === 'success') && (
          <GlowCanvas tone={phase === 'success' ? 'success' : 'pay'} />
        )}
        {phase === 'processing' ? <div className="absolute inset-0 z-20 bg-white/35" /> : null}

        <div
          className={cn(
            'relative z-10 transition-[filter] duration-300',
            phase === 'processing' && 'blur-[3px]'
          )}
        >
          <div className="flex items-start gap-2.5 pr-7">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
              {phase === 'success' ? (
                <CheckCircle2 className="h-[18px] w-[18px] text-accent-2" />
              ) : phase === 'qr' ? (
                <ScanLine className="h-[18px] w-[18px]" />
              ) : (
                <ShieldCheck className="h-[18px] w-[18px]" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold leading-5 text-ink">
                {phase === 'success'
                  ? intent.kind === 'plan'
                    ? t('wallet.success.planTitle')
                    : intent.kind === 'redeem'
                      ? t('wallet.success.redeemTitle')
                      : t('wallet.success.payTitle')
                  : phase === 'qr'
                    ? t('wallet.qr.title')
                    : title}
              </div>
              <div className="mt-0.5 text-[10.5px] leading-4 text-muted">
                {phase === 'success'
                  ? intent.kind === 'redeem'
                    ? t('wallet.success.redeemHint')
                    : t('wallet.success.hint')
                  : phase === 'qr'
                    ? expired
                      ? t('wallet.qr.expired')
                      : t('wallet.qr.hint', { method: methodName })
                    : subtitle}
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-2xl bg-panel px-3.5 py-3">
            <div className="text-[10px] text-muted">
              {phase === 'success'
                ? intent.kind === 'redeem'
                  ? t('wallet.success.credited')
                  : t('wallet.success.paidAmount')
                : intent.kind === 'redeem'
                  ? t('wallet.confirm.redeemMethod')
                  : t('wallet.confirm.amount')}
            </div>
            <div
              className={cn(
                'mt-0.5 text-[28px] font-semibold leading-8 tracking-tight tabular-nums',
                phase === 'success' ? 'text-accent-2' : 'text-ink'
              )}
            >
              {phase === 'success'
                ? successAmount
                : intent.kind === 'redeem'
                  ? t('wallet.confirm.redeemValue')
                  : money(amount, currency)}
            </div>
            <div className="mt-1 flex items-center gap-1 text-[9.5px] text-muted">
              <span className="h-1 w-1 rounded-full bg-accent-2" />
              {methodName}
              {intent.kind === 'plan' ? <span>· {intent.duration}</span> : null}
              {intent.kind === 'redeem' ? (
                <span>· {t('wallet.confirm.redeemInstant')}</span>
              ) : null}
            </div>
          </div>

          {phase === 'qr' ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="mt-3"
            >
              <div className="relative mx-auto grid h-[178px] w-[178px] place-items-center rounded-2xl border border-line bg-white p-2 shadow-sm">
                {qr ? (
                  <img src={qr} alt={t('wallet.qr.title')} className="h-full w-full rounded-lg object-contain" draggable={false} />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-muted" />
                )}
                {expired ? (
                  <div className="absolute inset-0 grid place-items-center rounded-2xl bg-white/85 text-[11px] font-medium text-muted">
                    {t('wallet.qr.expired')}
                  </div>
                ) : null}
              </div>
              <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-muted">
                <span className="tabular-nums">{t('wallet.qr.expires', { time: remainLabel })}</span>
                <span className="h-1 w-1 rounded-full bg-line" />
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('wallet.qr.waiting')}
                </span>
              </div>
              <div className="mt-2.5 space-y-1 border-t border-line-soft pt-2.5 text-[10px]">
                {session?.orderId ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">{t('wallet.confirm.orderNo')}</span>
                    <button
                      type="button"
                      onClick={() => void copy(session.orderId, 'order')}
                      className="inline-flex min-w-0 items-center gap-1 font-mono text-[10px] text-ink-soft hover:text-ink"
                    >
                      <span className="truncate">{session.orderId}</span>
                      {copied === 'order' ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                    </button>
                  </div>
                ) : null}
                {session?.merchantId ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">{t('wallet.confirm.merchantNo')}</span>
                    <button
                      type="button"
                      onClick={() => void copy(session.merchantId, 'merchant')}
                      className="inline-flex items-center gap-1 font-mono text-[10px] text-ink-soft hover:text-ink"
                    >
                      {session.merchantId}
                      {copied === 'merchant' ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                    </button>
                  </div>
                ) : null}
              </div>
              {notice ? <div className="mt-2 text-center text-[9.5px] text-muted">{notice}</div> : null}
              {error ? <div className="mt-2 text-center text-[9.5px] text-danger">{error}</div> : null}
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" className="h-8 flex-1 text-[11px]" onClick={onClose}>
                  {t('wallet.qr.cancel')}
                </Button>
                {expired ? (
                  <Button
                    className="h-8 flex-1 text-[11px]"
                    onClick={() => {
                      setSession(null)
                      setQr('')
                      setNotice(null)
                      setPhase('confirm')
                    }}
                  >
                    {t('wallet.qr.refresh')}
                  </Button>
                ) : (
                  <Button
                    className="h-8 flex-1 text-[11px]"
                    disabled={checking}
                    onClick={() => void checkPaid(true)}
                  >
                    {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    {checking ? t('wallet.qr.checking') : t('wallet.qr.check')}
                  </Button>
                )}
              </div>
            </motion.div>
          ) : (
            <>
              <div className="mt-3 space-y-1.5 border-t border-line-soft pt-2.5 text-[10px]">
                {rows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3">
                    <span className="shrink-0 text-muted">{row.label}</span>
                    <span className={cn('truncate text-right text-ink-soft', row.key && 'font-mono text-[9.5px]')}>
                      {row.value}
                    </span>
                  </div>
                ))}
                {!session && phase === 'confirm' && intent.kind !== 'redeem' ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">{t('wallet.confirm.orderNo')}</span>
                    <span className="text-muted/70">{t('wallet.confirm.orderPending')}</span>
                  </div>
                ) : null}
              </div>

              {phase === 'success' ? (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-accent-2/10 px-3 py-2 text-[10px] text-accent-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  {intent.kind === 'redeem'
                    ? t('wallet.redeemSuccess', { amount: successAmount })
                    : intent.kind === 'plan'
                      ? t('wallet.plan.subscribed')
                      : t('wallet.success.topupHint')}
                </div>
              ) : error ? (
                <div className="mt-2 rounded-lg bg-danger/10 px-2.5 py-2 text-[10px] leading-4 text-danger">
                  {error}
                </div>
              ) : null}

              {intent.kind === 'plan' && phase === 'confirm' ? (
                <div className="mt-3 border-t border-line-soft pt-2.5">
                  <div className="text-[9.5px] text-muted">{t('wallet.plan.payMethod')}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {intent.methods.map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => {
                          setMethod(item.type)
                          setError(null)
                        }}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[10px] transition-colors',
                          method === item.type
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-line text-muted hover:bg-panel-2 hover:text-ink'
                        )}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-3 flex gap-2">
                {phase === 'success' ? (
                  <Button className="h-9 w-full text-[12px]" onClick={onClose}>
                    {t('wallet.success.done')}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      className="h-9 flex-1 text-[12px]"
                      onClick={onClose}
                    >
                      {t('wallet.confirm.cancel')}
                    </Button>
                    <Button className="h-9 flex-[1.4] text-[12px]" onClick={() => void confirm()}>
                      {intent.kind === 'topup'
                        ? t('wallet.confirm.pay')
                        : intent.kind === 'plan'
                          ? t('wallet.confirm.subscribe')
                          : t('wallet.confirm.redeem')}
                    </Button>
                  </>
                )}
              </div>

            </>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={phase === 'processing'}
          aria-label={t('wallet.confirm.cancel')}
          className="absolute right-3 top-3 z-30 grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-panel-2 hover:text-ink disabled:opacity-30"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <AnimatePresence>
          {phase === 'processing' ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3"
            >
              <span className="relative grid h-9 w-9 place-items-center rounded-full bg-white/80 shadow-sm">
                <span className="absolute inset-0 animate-ping rounded-full bg-accent/15" />
                <Loader2 className="relative h-5 w-5 animate-spin text-accent" />
              </span>
              <span aria-live="polite" className="max-w-[250px] rounded-full bg-white/85 px-3 py-1 text-center text-[10.5px] leading-4 text-ink shadow-sm backdrop-blur-sm">
                {statusText}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
