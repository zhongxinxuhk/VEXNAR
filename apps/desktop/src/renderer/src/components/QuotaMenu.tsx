import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import type { NewApiQuota } from '@shared/contracts'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app'

function quotaValue(quota: NewApiQuota | null, raw: number): string {
  if (!quota) return '—'
  if (!quota.displayInCurrency) {
    return Math.round(raw).toLocaleString()
  }
  const amount = (raw / quota.quotaPerUnit) * quota.usdExchangeRate
  return `$${amount.toFixed(2)}`
}

function quotaPercent(quota: NewApiQuota | null): number {
  if (!quota) return 0
  const total = quota.remaining + quota.used
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, (quota.used / total) * 100))
}

function gaugeColor(percent: number): string {
  if (percent >= 85) return '#e11d48'
  if (percent >= 60) return '#d97706'
  return '#2f9e44'
}

function Gauge({ percent }: { percent: number }): React.JSX.Element {
  const radius = 8.5
  const circumference = 2 * Math.PI * radius
  const color = gaugeColor(percent)
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="2"
      />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (percent / 100)}
        transform="rotate(-90 12 12)"
        className="transition-[stroke-dashoffset] duration-500"
      />
      <circle cx="12" cy="12" r="1.4" fill={color} />
    </svg>
  )
}

function KeyValue({
  label,
  value,
  mono
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] text-muted">{label}</div>
      <div className={cn('mt-0.5 truncate text-[12px] text-ink', mono && 'font-mono text-[11px]')}>
        {value}
      </div>
    </div>
  )
}

export function QuotaMenu(): React.JSX.Element {
  const t = useT()
  const newApi = useAppStore((state) => state.newApi)
  const refreshNewApi = useAppStore((state) => state.refreshNewApi)
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const percent = useMemo(() => quotaPercent(newApi?.quota ?? null), [newApi?.quota])
  const user = newApi?.user
  const quota = newApi?.quota ?? null
  const token = newApi?.token

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

  useEffect(() => {
    if (!open) {
      setCopied(false)
      setCopyError(null)
    }
  }, [open])

  const refresh = async (): Promise<void> => {
    if (refreshing) return
    setRefreshing(true)
    await refreshNewApi()
    setRefreshing(false)
  }

  const copyKey = async (): Promise<void> => {
    const result = await window.vexnar.newapi.copyKey()
    if (result.ok) {
      setCopied(true)
      setCopyError(null)
      window.setTimeout(() => setCopied(false), 1800)
    } else {
      setCopyError(result.error || t('quota.copyFailed'))
    }
  }

  const accountName = user?.displayName || user?.username || t('quota.notLoggedIn')
  const keyValue = token?.maskedKey || t('quota.keyPending')

  return (
    <>
      <button
        type="button"
        aria-label={t('quota.title')}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'no-drag grid h-8 w-8 place-items-center rounded-full text-muted outline-none transition-colors hover:bg-panel-3/70 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/50',
          open && 'bg-panel-3/70 text-ink'
        )}
      >
        <Gauge percent={percent} />
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t('quota.title')}
          className="fixed bottom-[76px] left-[64px] z-50 w-[304px] rounded-2xl border border-line bg-bg p-3.5 codex-popover"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-ink">{t('quota.title')}</div>
              <div className="mt-0.5 truncate text-[10.5px] text-muted">HXSEC AI Platform</div>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-label={t('quota.refresh')}
              className="ml-auto grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-panel-2 hover:text-ink disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            </button>
          </div>

          <div className="mt-3 rounded-xl border border-line-soft bg-panel/70 px-3 py-3">
            <div className="flex items-center gap-2">
              <span className="truncate text-[12px] font-medium text-ink">{accountName}</span>
              {user?.group ? (
                <span className="rounded-full border border-line-soft bg-bg px-1.5 py-0.5 text-[9.5px] text-muted">
                  {user.group}
                </span>
              ) : null}
            </div>

            <div className="mt-2.5 flex items-end justify-between gap-2">
              <div>
                <div className="text-[21px] font-semibold leading-7 tracking-tight text-ink">
                  {quota ? quotaValue(quota, quota.remaining) : '—'}
                </div>
                <div className="text-[10.5px] text-muted">{t('quota.remaining')}</div>
              </div>
              <div className="pb-1 text-right text-[10.5px] text-muted">
                <div>
                  {t('quota.used')} {quota ? quotaValue(quota, quota.used) : '—'}
                </div>
                <div className="mt-0.5">
                  {t('quota.requests')} {quota?.requestCount.toLocaleString() ?? '—'}
                </div>
              </div>
            </div>

            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-panel-3">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.max(percent, percent > 0 ? 2 : 0)}%`, background: gaugeColor(percent) }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[9.5px] text-muted/80">
              <span>{t('quota.usedPercent', { percent: percent.toFixed(0) })}</span>
              <span>{t('quota.autoRefresh')}</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
            <KeyValue
              label={t('quota.tokenQuota')}
              value={
                token?.unlimitedQuota
                  ? t('quota.unlimited')
                  : token
                    ? quotaValue(quota, token.remainQuota)
                    : '—'
              }
            />
            <KeyValue label={t('quota.group')} value={user?.group || '—'} />
            <div className="col-span-2">
              <div className="text-[10.5px] text-muted">{t('quota.apiKey')}</div>
              <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-line-soft bg-panel px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink-soft">
                  {keyValue}
                </span>
                <button
                  type="button"
                  onClick={() => void copyKey()}
                  disabled={!token?.maskedKey}
                  aria-label={t('quota.copyKey')}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted hover:bg-panel-3 hover:text-ink disabled:opacity-40"
                >
                  {copied ? <Check className="h-3 w-3 text-accent-2" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
          </div>

          {copyError ? <div className="mt-2 text-[10.5px] text-danger">{copyError}</div> : null}
          <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-2 text-[9.5px] text-muted/75">
            <span>{t('quota.managedKey')}</span>
            <span>{newApi?.updatedAt ? new Date(newApi.updatedAt).toLocaleTimeString() : '—'}</span>
          </div>
        </div>
      ) : null}
    </>
  )
}