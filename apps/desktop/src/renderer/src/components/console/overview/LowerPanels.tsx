// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Activity, ArrowUpRight, Network, ShieldCheck } from 'lucide-react'
import type { Stats, TrafficExchange } from '@/lib/console'
import {
  ASSET_TYPE_COLORS,
  assetTypeRows,
  formatRelative,
  statusCodeBar,
  statusCodeTone,
  trafficStatusBuckets,
  totalAssets,
  type DashboardSettings,
  type InterceptItem,
  type LLMProfileRow
} from '@/lib/dashboard'
import type { MessageKey } from '@/lib/i18n'
import { useI18n, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { EmptyState, Panel, PanelHeader } from './Primitives'

const ASSET_LABEL: Record<string, MessageKey> = {
  root_domain: 'overview.assetRoot',
  subdomain: 'overview.assetSubdomain',
  ip: 'overview.assetIp',
  service: 'overview.assetService',
  app: 'overview.assetApp',
  endpoint: 'overview.assetEndpoint'
}

export function AssetsPanel({ counts }: { counts: Record<string, number> | undefined }): React.JSX.Element {
  const t = useT()
  const rows = assetTypeRows(counts)
  const total = totalAssets(counts)
  const max = rows[0]?.count ?? 1

  return (
    <Panel className="flex min-w-0 flex-col">
      <PanelHeader icon={<Network className="h-3.5 w-3.5" />} title={t('overview.assetDistribution')} meta={t('overview.byType')} />
      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        {rows.length === 0 ? (
          <EmptyState label={t('overview.noAssets')} className="flex-1" />
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map(({ type, count }) => (
              <div key={type} className="flex items-center gap-2">
                <span className="w-[72px] shrink-0 truncate text-right text-[10px] text-muted">
                  {ASSET_LABEL[type] ? t(ASSET_LABEL[type]) : type}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-3">
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-500', ASSET_TYPE_COLORS[type] ?? 'bg-muted/50')}
                    style={{ width: `${Math.max(2, (count / max) * 100)}%` }}
                  />
                </div>
                <span className="w-5 shrink-0 text-right font-mono text-[10px] tabular-nums text-ink-soft">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-line-soft px-4 py-2 text-[9.5px] text-muted">
        {t('overview.assetTotal', { count: total })}
      </div>
    </Panel>
  )
}

export function TrafficPanel({
  exchanges,
  total
}: {
  exchanges: TrafficExchange[]
  total: number
}): React.JSX.Element {
  const t = useT()
  const locale = useI18n((state) => state.locale)
  const buckets = trafficStatusBuckets(exchanges)
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count))
  const recent = [...exchanges].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, 5)

  return (
    <Panel className="flex min-w-0 flex-col">
      <PanelHeader
        icon={<Activity className="h-3.5 w-3.5" />}
        title={t('overview.trafficCodes')}
        meta={t('overview.requestsCount', { count: total })}
      />
      {buckets.length === 0 ? (
        <EmptyState label={t('overview.noTraffic')} className="flex-1" />
      ) : (
        <>
          <div className="flex items-end gap-2 px-4 pb-2 pt-3" style={{ height: 78 }}>
            {buckets.map(({ code, count }) => (
              <div key={code} className="flex flex-1 flex-col items-center gap-1">
                <span className="font-mono text-[9px] tabular-nums text-muted">{count}</span>
                <div
                  className={cn('w-full min-h-1 rounded-sm opacity-80', statusCodeBar(code))}
                  style={{ height: Math.max(4, (count / max) * 36) }}
                />
                <span className={cn('font-mono text-[9px]', statusCodeTone(code))}>{code || 'ERR'}</span>
              </div>
            ))}
          </div>
          <div className="mt-1 border-t border-line-soft px-4 pb-3 pt-2.5">
            <div className="mb-1.5 text-[9.5px] uppercase tracking-[0.1em] text-muted">{t('overview.recentRequests')}</div>
            <div className="space-y-1.5">
              {recent.map((exchange) => {
                const path = exchange.url.replace(/^https?:\/\/[^/]+/, '')
                return (
                  <div key={exchange.id} className="flex items-center gap-2 text-[10px]">
                    <span
                      className={cn(
                        'min-w-[38px] shrink-0 rounded border px-1 py-0 text-center font-mono text-[9px] leading-4',
                        exchange.method === 'GET'
                          ? 'border-accent-2/25 bg-accent-2/10 text-accent-2'
                          : 'border-accent/25 bg-accent/10 text-accent'
                      )}
                    >
                      {exchange.method}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-muted" title={exchange.url}>
                      {exchange.host}
                      {path.length > 34 ? `${path.slice(0, 34)}…` : path}
                    </span>
                    <span className={cn('shrink-0 font-mono text-[9px]', statusCodeTone(exchange.status))}>
                      {exchange.status}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
      <div className="mt-auto border-t border-line-soft px-4 py-2 text-[9.5px] text-muted">
        {t('overview.trafficRecent', { count: recent.length, time: formatRelative(recent[0]?.ts, locale) })}
      </div>
    </Panel>
  )
}

function StatePill({ tone, children }: { tone: 'success' | 'danger' | 'accent' | 'warn' | 'neutral'; children: React.ReactNode }): React.JSX.Element {
  const styles: Record<string, string> = {
    success: 'border-accent-2/30 bg-accent-2/10 text-accent-2',
    danger: 'border-danger/30 bg-danger/10 text-danger',
    accent: 'border-accent/30 bg-accent/10 text-accent',
    warn: 'border-warn/30 bg-warn/10 text-warn',
    neutral: 'border-line bg-panel-2 text-muted'
  }
  return <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] leading-4', styles[tone])}>{children}</span>
}

function StatusRow({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel-2/40 px-3 py-1.5">
      <span className="shrink-0 text-[10px] text-muted">{label}</span>
      <span className="min-w-0 truncate text-right">{value}</span>
    </div>
  )
}

export function SystemPanel({
  stats,
  settings,
  activeProfile,
  pending,
  onReview
}: {
  stats: Stats | null
  settings: DashboardSettings | null
  activeProfile: LLMProfileRow | undefined
  pending: InterceptItem[]
  onReview?: () => void
}): React.JSX.Element {
  const t = useT()

  return (
    <Panel className="flex min-w-0 flex-col">
      <PanelHeader icon={<ShieldCheck className="h-3.5 w-3.5" />} title={t('overview.systemStatus')} />
      <div className="flex flex-col gap-2 px-4 pt-3">
        <StatusRow
          label={t('overview.llmStatus')}
          value={
            <StatePill tone={stats?.llm_configured ? 'success' : 'danger'}>
              {stats?.llm_configured ? t('overview.llmConfigured') : t('overview.llmUnconfigured')}
            </StatePill>
          }
        />
        <StatusRow
          label={t('overview.capture')}
          value={
            <StatePill tone={settings?.traffic_capture ? 'accent' : 'neutral'}>
              {settings?.traffic_capture ? t('overview.captureOn') : t('overview.captureOff')}
            </StatePill>
          }
        />
        {activeProfile ? (
          <StatusRow
            label={t('overview.activeModel')}
            value={
              <span className="font-mono text-[10px] text-ink-soft" title={activeProfile.model}>
                {activeProfile.model || '—'}
              </span>
            }
          />
        ) : null}
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-line-soft px-4 pb-3 pt-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className={cn('text-[9.5px] uppercase tracking-[0.1em]', pending.length > 0 ? 'text-warn' : 'text-muted')}>
            {t('overview.pendingApprovals', { count: pending.length })}
          </span>
          {pending.length > 0 && onReview ? (
            <button
              type="button"
              onClick={onReview}
              className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9.5px] text-warn transition-colors hover:bg-warn/10"
            >
              {t('approval.open')}
              <ArrowUpRight className="h-3 w-3" />
            </button>
          ) : pending.length > 0 ? (
            <ArrowUpRight className="h-3 w-3 text-warn" />
          ) : null}
        </div>
        {pending.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-line bg-panel-2/20 py-3 text-[10px] text-muted">
            <ShieldCheck className="h-4 w-4 text-accent-2/50" />
            {t('overview.noPending')}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {pending.slice(0, 3).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-warn/20 bg-warn/5 px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-[10px] font-medium text-ink-soft">{item.tool_name}</div>
                  <div className="truncate font-mono text-[9px] text-muted">{item.agent_name}</div>
                </div>
                <ArrowUpRight className="h-3 w-3 shrink-0 text-warn" />
              </div>
            ))}
            {pending.length > 3 ? (
              <div className="text-center text-[9.5px] text-muted">{t('overview.morePending', { count: pending.length - 3 })}</div>
            ) : null}
          </div>
        )}
      </div>
    </Panel>
  )
}
