// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react'
import {
  decideIntercept,
  fetchInterceptHistory,
  fetchPendingIntercepts,
  formatClock,
  formatRelative,
  interceptTarget,
  type InterceptItem
} from '@/lib/dashboard'
import { useI18n, useT } from '@/lib/i18n'
import { useAppStore } from '@/store/app'
import { Button, ScrollArea } from '@/components/ui'
import { ApprovalCard } from '@/components/agent-ui/ApprovalCard'
import { BackendGate, LoadingRow, PageHeader, RefreshButton } from './common'
import { LiveDot } from './overview/Primitives'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function StatusPill({ status }: { status?: string }): React.JSX.Element {
  const t = useT()
  const labels: Record<string, string> = {
    pending: t('approval.statusPending'),
    allowed: t('approval.statusAllowed'),
    denied: t('approval.statusDenied'),
    timeout: t('approval.statusTimeout')
  }
  const tones: Record<string, string> = {
    pending: 'border-warn/25 bg-warn/10 text-warn',
    allowed: 'border-accent-2/25 bg-accent-2/10 text-accent-2',
    denied: 'border-danger/25 bg-danger/10 text-danger',
    timeout: 'border-line bg-panel-2 text-muted'
  }
  const key = status ?? 'pending'
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] leading-4 ${tones[key] ?? tones.pending}`}>
      {labels[key] ?? key}
    </span>
  )
}

function originOf(item: InterceptItem, t: ReturnType<typeof useT>): string {
  if (item.conv_title) return item.conv_title
  if (item.task_id) return t('approval.originTask', { id: item.task_id })
  if (item.conversation_id) return t('approval.originConversation', { id: item.conversation_id })
  return t('approval.originNone')
}

export function ApprovalsView(): React.JSX.Element {
  const t = useT()
  const locale = useI18n((state) => state.locale)
  const backend = useAppStore((state) => state.backend)
  const connected = Boolean(backend?.connected)

  const [pending, setPending] = useState<InterceptItem[]>([])
  const [history, setHistory] = useState<InterceptItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [decisionError, setDecisionError] = useState<{ id: number; message: string } | null>(null)
  const [syncedAt, setSyncedAt] = useState<number | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!connected) return
    let alive = true
    let busy = false
    const load = async (): Promise<void> => {
      if (busy) return
      busy = true
      try {
        const [nextPending, nextHistory] = await Promise.all([fetchPendingIntercepts(), fetchInterceptHistory()])
        if (!alive) return
        setPending(nextPending)
        setHistory(nextHistory)
        setError(null)
        setSyncedAt(Date.now())
      } catch (cause) {
        if (alive) setError(errorMessage(cause))
      } finally {
        busy = false
        if (alive) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [connected, nonce])

  const decide = async (item: InterceptItem, decision: 'allowed' | 'denied'): Promise<void> => {
    if (busyId !== null) return
    setBusyId(item.id)
    setDecisionError(null)
    try {
      await decideIntercept(item.id, decision)
      setPending((previous) => previous.filter((entry) => entry.id !== item.id))
      setSyncedAt(Date.now())
      try {
        setHistory(await fetchInterceptHistory())
      } catch {
        // The pending row is already settled; history will catch up on the next poll.
      }
    } catch (cause) {
      setDecisionError({ id: item.id, message: errorMessage(cause) })
    } finally {
      setBusyId(null)
    }
  }

  if (!backend?.connected) return <BackendGate />

  const decided = history
    .filter((item) => item.status && item.status !== 'pending')
    .sort((a, b) => Date.parse(b.decided_at ?? b.created_at ?? '') - Date.parse(a.decided_at ?? a.created_at ?? ''))
    .slice(0, 20)

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title={t('approval.title')}
        subtitle={t('approval.subtitle')}
        actions={
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 font-mono text-[10px] text-muted sm:flex">
              <LiveDot />
              {syncedAt ? t('overview.updatedAt', { time: formatClock(syncedAt, locale) }) : t('approval.autoRefresh')}
            </span>
            <RefreshButton
              onClick={() => {
                setLoading(true)
                setNonce((value) => value + 1)
              }}
              loading={loading}
            />
          </div>
        }
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-[1240px] p-4 xl:p-6">
          {error ? (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/5 px-4 py-2.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
              <span className="min-w-0 flex-1 break-words font-mono text-[10.5px] leading-5 text-danger">{error}</span>
              <button
                type="button"
                onClick={() => setNonce((value) => value + 1)}
                className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] text-danger hover:bg-danger/10"
              >
                {t('app.retry')}
              </button>
            </div>
          ) : null}

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md border border-warn/20 bg-warn/10 text-warn">
                  <ShieldAlert className="h-3.5 w-3.5" />
                </span>
                <h2 className="text-[12px] font-semibold text-ink">{t('approval.pendingSection')}</h2>
                <span className="rounded-md border border-warn/20 bg-warn/10 px-1.5 py-0.5 font-mono text-[9.5px] text-warn">
                  {t('approval.pendingCount', { count: pending.length })}
                </span>
              </div>
            </div>

            {loading && pending.length === 0 && decided.length === 0 ? (
              <LoadingRow label={t('app.loading')} />
            ) : pending.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-panel-2/20 px-6 py-10 text-center">
                <ShieldCheck className="h-6 w-6 text-accent-2/50" />
                <div className="mt-2 text-[11.5px] font-medium text-ink-soft">{t('approval.empty')}</div>
                <div className="mt-1 max-w-md text-[10.5px] leading-5 text-muted">{t('approval.emptyHint')}</div>
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {pending.map((item) => (
                  <ApprovalCard
                    key={item.id}
                    agent={item.agent_name}
                    tool={item.tool_name}
                    target={interceptTarget(item.tool_input)}
                    reason={item.reason}
                    input={item.tool_input}
                    busy={busyId === item.id}
                    disabled={busyId !== null && busyId !== item.id}
                    error={decisionError?.id === item.id ? decisionError.message : null}
                    onApprove={() => void decide(item, 'allowed')}
                    onReject={() => void decide(item, 'denied')}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="mt-7">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md border border-line bg-panel-2/70 text-muted">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </span>
                <h2 className="text-[12px] font-semibold text-ink">{t('approval.historySection')}</h2>
                <span className="font-mono text-[9.5px] text-muted">{t('approval.historyCount', { count: decided.length })}</span>
              </div>
            </div>

            {decided.length === 0 ? (
              <div className="rounded-xl border border-line bg-panel/40 px-4 py-8 text-center text-[11px] text-muted">
                {t('approval.historyEmpty')}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-line bg-panel/40">
                <div className="overflow-x-auto">
                  <div className="grid min-w-[720px] grid-cols-[88px_minmax(0,1.5fr)_110px_150px_94px] gap-3 border-b border-line-soft bg-panel-2/50 px-4 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted/80">
                    <span>{t('approval.colStatus')}</span>
                    <span>{t('approval.colTool')}</span>
                    <span>{t('approval.colAgent')}</span>
                    <span>{t('approval.colOrigin')}</span>
                    <span>{t('approval.colTime')}</span>
                  </div>
                  <div className="divide-y divide-line-soft">
                    {decided.map((item) => (
                      <div
                        key={item.id}
                        className="grid min-w-[720px] grid-cols-[88px_minmax(0,1.5fr)_110px_150px_94px] items-center gap-3 px-4 py-2.5 hover:bg-panel-2/30"
                      >
                        <span>
                          <StatusPill status={item.status} />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-mono text-[10.5px] text-ink-soft">{item.tool_name}</div>
                          <div className="mt-0.5 truncate text-[9.5px] text-muted" title={item.reason}>
                            {item.reason || '—'}
                          </div>
                        </div>
                        <span className="truncate font-mono text-[10px] text-muted">{item.agent_name || '—'}</span>
                        <span className="truncate text-[10px] text-muted" title={originOf(item, t)}>
                          {originOf(item, t)}
                        </span>
                        <span className="font-mono text-[9.5px] tabular-nums text-muted">
                          {formatRelative(item.decided_at ?? item.created_at, locale)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
