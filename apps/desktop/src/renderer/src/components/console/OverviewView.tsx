// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Activity, Bot, Bug, Network, RefreshCw, Target, Zap } from 'lucide-react'
import { consoleRequest, type Finding, type Stats, type Task, type TrafficExchange } from '@/lib/console'
import {
  activeProfileId,
  ASSET_TYPE_COLORS,
  assetTypeRows,
  compactNumber,
  dailyFromLedger,
  dailyFromLegacy,
  fetchFastSources,
  fetchSlowSources,
  foldLedgerTokens,
  foldLegacyTokens,
  formatClock,
  formatTokens,
  profileIdsByName,
  summarizeBuckets,
  totalAssets,
  type ActivityItem,
  type AgentRow,
  type ConversationTokenRow,
  type DashboardSettings,
  type InterceptItem,
  type LLMProfileRow,
  type McpRow,
  type SkillRow,
  type TokenRangeDays,
  type TokenSource,
  type TokenTab,
  type ToolRow,
  type UsageResponse
} from '@/lib/dashboard'
import { useI18n, useT } from '@/lib/i18n'
import { useAppStore } from '@/store/app'
import { ScrollArea } from '@/components/ui'
import { BackendGate, PageHeader, RefreshButton } from './common'
import { ActivityPanel, FindingsPanel } from './overview/Feeds'
import { AssetsPanel, SystemPanel, TrafficPanel } from './overview/LowerPanels'
import { EnginePill, LiveDot, RuntimeMetric, SegmentedBar, StatCard } from './overview/Primitives'
import { TaskTable } from './overview/TaskTable'
import { TokenPanel } from './overview/TokenPanel'

type OverviewState = {
  stats: Stats | null
  settings: DashboardSettings | null
  pending: InterceptItem[]
  activity: ActivityItem[]
  conversationTokens: ConversationTokenRow[]
  findings: { total: number; pending: number; critical: number; high: number; medium: number; low: number } | null
  recentFindings: Finding[]
  tasks: Task[]
  traffic: TrafficExchange[]
  trafficTotal: number
  trafficEnabled: boolean
  agents: AgentRow[]
  mcpServers: McpRow[]
  skills: SkillRow[]
  tools: ToolRow[]
  profiles: LLMProfileRow[]
  usage: UsageResponse
}

const INITIAL_STATE: OverviewState = {
  stats: null,
  settings: null,
  pending: [],
  activity: [],
  conversationTokens: [],
  findings: null,
  recentFindings: [],
  tasks: [],
  traffic: [],
  trafficTotal: 0,
  trafficEnabled: false,
  agents: [],
  mcpServers: [],
  skills: [],
  tools: [],
  profiles: [],
  usage: {}
}

type Phase = {
  fastLoading: boolean
  syncedAt: number | null
  error: string | null
}

const INITIAL_PHASE: Phase = { fastLoading: true, syncedAt: null, error: null }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function OverviewView(): React.JSX.Element {
  const t = useT()
  const locale = useI18n((state) => state.locale)
  const backend = useAppStore((state) => state.backend)
  const setView = useAppStore((state) => state.setView)
  const connected = Boolean(backend?.connected)

  const [data, setData] = useState<OverviewState>(INITIAL_STATE)
  const [phase, setPhase] = useState<Phase>(INITIAL_PHASE)
  const [refreshing, setRefreshing] = useState(false)
  const [nonce, setNonce] = useState(0)
  const [tokenSource, setTokenSource] = useState<TokenSource>('old')
  const [tokenTab, setTokenTab] = useState<TokenTab>('all')
  const [tokenDays, setTokenDays] = useState<TokenRangeDays>(30)
  const taskSignature = useRef('')

  // Task history is the largest payload; poll it on its own so a slow task list
  // can never hold back the other panels (same split the web dashboard uses).
  useEffect(() => {
    if (!connected) return
    let alive = true
    let busy = false
    taskSignature.current = ''
    const load = async (): Promise<void> => {
      if (busy) return
      busy = true
      try {
        const response = await consoleRequest<{ tasks?: Task[] }>('/tasks')
        if (!alive) return
        const tasks = response?.tasks ?? []
        const signature = JSON.stringify(tasks)
        if (signature !== taskSignature.current) {
          taskSignature.current = signature
          setData((previous) => ({ ...previous, tasks }))
        }
      } catch {
        // Transient errors are retried by the next tick; keep the stale list.
      } finally {
        busy = false
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [connected, nonce])

  // Fast lane (5s): stats, findings, activity, approvals, token ledger.
  useEffect(() => {
    if (!connected) return
    let alive = true
    let busy = false
    const load = async (): Promise<void> => {
      if (busy) return
      busy = true
      try {
        const sources = await fetchFastSources()
        if (!alive) return
        setData((previous) => ({ ...previous, ...sources }))
        setPhase((previous) => ({ ...previous, fastLoading: false, error: null, syncedAt: Date.now() }))
        setRefreshing(false)
      } catch (error) {
        if (!alive) return
        setPhase((previous) => ({ ...previous, fastLoading: false, error: errorMessage(error) }))
        setRefreshing(false)
      } finally {
        busy = false
      }
    }
    setPhase((previous) => ({ ...previous, fastLoading: true }))
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [connected, nonce])

  // Slow lane (15s): traffic, agents, MCP, skills, tools, profiles, usage.
  useEffect(() => {
    if (!connected) return
    let alive = true
    let busy = false
    const load = async (): Promise<void> => {
      if (busy) return
      busy = true
      try {
        const sources = await fetchSlowSources()
        if (!alive) return
        setData((previous) => ({ ...previous, ...sources }))
      } catch {
        // Keep the previous inventory snapshot.
      } finally {
        busy = false
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 15000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [connected, nonce])

  // ── derived ───────────────────────────────────────────────────────────────

  const { tasks } = data
  const tasksByStatus = useMemo(() => {
    const map: Record<string, number> = {}
    for (const task of tasks) map[task.status] = (map[task.status] ?? 0) + 1
    return map
  }, [tasks])

  const runningTasks = tasksByStatus.running ?? 0
  const queuedTasks = tasksByStatus.queued ?? 0
  const pausedTasks = tasksByStatus.paused ?? 0
  const doneTasks = tasksByStatus.done ?? 0

  const findingTotals = data.findings
  const criticalFindings = findingTotals?.critical ?? 0
  const highFindings = findingTotals?.high ?? 0
  const mediumFindings = findingTotals?.medium ?? 0
  const lowFindings = findingTotals?.low ?? 0
  const pendingFindings = findingTotals?.pending ?? 0

  const assetCounts = data.stats?.asset_counts
  const assets = data.stats?.assets ?? totalAssets(assetCounts)
  const assetRows = useMemo(() => assetTypeRows(assetCounts), [assetCounts])
  const captureOn = data.settings?.traffic_capture ?? data.trafficEnabled
  const trafficTotal = data.stats?.traffic ?? data.trafficTotal

  const activeProfile = data.profiles.find((profile) => profile.is_default)
  const defaultProfileId = useMemo(() => activeProfileId(data.profiles), [data.profiles])
  const idsByName = useMemo(() => profileIdsByName(data.profiles), [data.profiles])
  const legacyBuckets = useMemo(
    () => foldLegacyTokens(tasks, data.conversationTokens, defaultProfileId),
    [tasks, data.conversationTokens, defaultProfileId]
  )
  const ledgerBuckets = useMemo(
    () => foldLedgerTokens(data.usage, idsByName, defaultProfileId),
    [data.usage, idsByName, defaultProfileId]
  )
  const buckets = tokenSource === 'new' ? ledgerBuckets : legacyBuckets
  const tokenTotals = useMemo(() => summarizeBuckets(buckets, tokenTab), [buckets, tokenTab])
  const dailyTokens = useMemo(
    () =>
      tokenSource === 'new'
        ? dailyFromLedger(data.usage, tokenDays, tokenTab, idsByName, defaultProfileId)
        : dailyFromLegacy(tasks, data.conversationTokens, tokenDays, tokenTab, defaultProfileId),
    [tokenSource, data.usage, tokenDays, tokenTab, idsByName, defaultProfileId, tasks, data.conversationTokens]
  )
  // The heatmap always looks at a full year; the chart range switch must not
  // shorten it, or the calendar would stop being a calendar.
  const heatmapTokens = useMemo(
    () =>
      tokenSource === 'new'
        ? dailyFromLedger(data.usage, 365, tokenTab, idsByName, defaultProfileId)
        : dailyFromLegacy(tasks, data.conversationTokens, 365, tokenTab, defaultProfileId),
    [tokenSource, data.usage, tokenTab, idsByName, defaultProfileId, tasks, data.conversationTokens]
  )

  const enabledAgents = data.agents.filter((agent) => agent.enabled).length
  const enabledTools = data.tools.filter((tool) => tool.enabled).length
  const enabledMcp = data.mcpServers.filter((server) => server.enabled).length
  const engineMode = data.stats?.engine_mode ?? 'idle'
  const initialLoading = phase.fastLoading && data.stats === null

  const refresh = (): void => {
    setRefreshing(true)
    setNonce((value) => value + 1)
  }

  if (!backend?.connected) return <BackendGate />

  const tokenIn = Math.max(0, tokenTotals.input - tokenTotals.cacheRead)

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title={t('overview.title')}
        subtitle={t('overview.subtitle')}
        actions={
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 font-mono text-[10px] text-muted sm:flex">
              {phase.error ? <span className="size-1.5 rounded-full bg-danger" /> : <LiveDot />}
              {phase.error
                ? phase.syncedAt
                  ? t('overview.syncStale', { time: formatClock(phase.syncedAt, locale) })
                  : t('overview.syncFailed')
                : phase.syncedAt
                  ? t('overview.updatedAt', { time: formatClock(phase.syncedAt, locale) })
                  : t('overview.syncing')}
            </span>
            <RefreshButton onClick={refresh} loading={refreshing || initialLoading} />
          </div>
        }
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3.5 p-4 xl:p-6">
          {phase.error ? (
            <div className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/5 px-4 py-2.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
              <span className="min-w-0 flex-1 break-words font-mono text-[10.5px] leading-5 text-danger">{phase.error}</span>
              <button
                type="button"
                onClick={refresh}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-danger transition-colors hover:bg-danger/10"
              >
                <RefreshCw className="h-3 w-3" />
                {t('app.retry')}
              </button>
            </div>
          ) : null}

          {/* Agent runtime strip: the shared backend state at a glance. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-line bg-gradient-to-r from-panel-2/80 via-panel/50 to-transparent px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-md border border-accent/20 bg-accent/10 text-accent">
                <Bot className="h-3.5 w-3.5" />
              </span>
              <span className="text-[9.5px] font-semibold tracking-[0.12em] text-muted">
                {t('overview.runtime')}
              </span>
            </div>
            <span className="hidden h-4 w-px bg-line sm:block" />
            <RuntimeMetric label={t('overview.engine')} value={<EnginePill mode={engineMode} compact />} />
            <RuntimeMetric
              label={t('overview.model')}
              value={<span className="font-mono text-[10px]">{activeProfile?.model || '—'}</span>}
            />
            <RuntimeMetric
              label={t('overview.agents')}
              value={
                <span className="tabular-nums">
                  {enabledAgents}
                  <span className="text-muted"> / {data.agents.length}</span>
                </span>
              }
            />
            <RuntimeMetric
              label={t('overview.tools')}
              value={
                <span className="tabular-nums">
                  {enabledTools}
                  <span className="text-muted"> / {data.tools.length}</span>
                </span>
              }
            />
            <RuntimeMetric
              label={t('overview.mcp')}
              value={
                <span className="tabular-nums">
                  {enabledMcp}
                  <span className="text-muted"> / {data.mcpServers.length}</span>
                </span>
              }
            />
            <RuntimeMetric label={t('overview.skills')} value={<span className="tabular-nums">{data.skills.length}</span>} />
            <span className="ml-auto hidden font-mono text-[9px] text-muted/70 xl:block">{t('overview.runtimeHint')}</span>
          </div>

          {/* Row 1 — five stat cards. */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label={t('overview.activeTasks')}
              icon={<Target className="h-3.5 w-3.5" />}
              tone="accent"
              value={initialLoading ? '—' : runningTasks}
              suffix={`/ ${tasks.length}`}
              live={runningTasks > 0}
            >
              <SegmentedBar
                segments={[
                  { value: runningTasks, className: 'bg-accent' },
                  { value: queuedTasks, className: 'bg-amber-400' },
                  { value: pausedTasks, className: 'bg-warn' },
                  { value: doneTasks, className: 'bg-accent-2' }
                ]}
              />
              <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px]">
                {runningTasks > 0 ? <span className="text-accent">{t('overview.breakRunning', { count: runningTasks })}</span> : null}
                {queuedTasks > 0 ? <span className="text-amber-500">{t('overview.breakQueued', { count: queuedTasks })}</span> : null}
                {pausedTasks > 0 ? <span className="text-warn">{t('overview.breakPaused', { count: pausedTasks })}</span> : null}
                {doneTasks > 0 ? <span className="text-accent-2">{t('overview.breakDone', { count: doneTasks })}</span> : null}
                {tasks.length === 0 ? <span className="text-muted">{t('overview.noTasks')}</span> : null}
              </div>
            </StatCard>

            <StatCard
              label={t('overview.findings')}
              icon={<Bug className="h-3.5 w-3.5" />}
              tone="danger"
              value={initialLoading ? '—' : findingTotals?.total ?? 0}
            >
              <SegmentedBar
                segments={[
                  { value: criticalFindings, className: 'bg-danger' },
                  { value: highFindings, className: 'bg-warn' },
                  { value: mediumFindings, className: 'bg-accent' },
                  { value: lowFindings, className: 'bg-muted/40' }
                ]}
              />
              <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px]">
                <span className="text-danger">{t('severity.critical')} {criticalFindings}</span>
                <span className="text-warn">{t('severity.high')} {highFindings}</span>
                <span className="text-accent">{t('severity.medium')} {mediumFindings}</span>
                <span className="text-muted">{t('severity.low')} {lowFindings}</span>
                {pendingFindings > 0 ? <span className="text-amber-500">{t('overview.pendingShort', { count: pendingFindings })}</span> : null}
              </div>
            </StatCard>

            <StatCard
              label={t('overview.assets')}
              icon={<Network className="h-3.5 w-3.5" />}
              tone="violet"
              value={initialLoading ? '—' : assets}
            >
              <SegmentedBar
                segments={assetRows.map((row) => ({
                  value: row.count,
                  className: ASSET_TYPE_COLORS[row.type] ?? 'bg-muted/40'
                }))}
              />
              <div className="truncate text-[10px] text-muted">{t('overview.assetsShared')}</div>
            </StatCard>

            <StatCard
              label={t('overview.traffic')}
              icon={<Activity className="h-3.5 w-3.5" />}
              tone="cyan"
              value={initialLoading ? '—' : trafficTotal.toLocaleString()}
              live={captureOn}
            >
              <div className="flex items-center gap-1.5 text-[10px] text-muted">
                {captureOn ? (
                  <>
                    <LiveDot />
                    <span>{t('overview.trafficRecording')}</span>
                  </>
                ) : (
                  <span>{t('overview.captureOff')}</span>
                )}
              </div>
            </StatCard>

            <StatCard
              label={t('overview.tokenUsage')}
              icon={<Zap className="h-3.5 w-3.5" />}
              tone="warn"
              value={initialLoading ? '—' : formatTokens(tokenTotals.input + tokenTotals.output)}
            >
              <SegmentedBar
                segments={[
                  { value: tokenIn, className: 'bg-blue-500' },
                  { value: tokenTotals.cacheRead, className: 'bg-emerald-500' },
                  { value: tokenTotals.output, className: 'bg-violet-500' }
                ]}
              />
              <div className="truncate text-[10px] text-muted">
                {t('overview.tokenIO', {
                  input: compactNumber(tokenTotals.input),
                  cache: compactNumber(tokenTotals.cacheRead),
                  output: compactNumber(tokenTotals.output)
                })}
              </div>
            </StatCard>
          </div>

          {/* Row 2 — LLM token usage. */}
          <TokenPanel
            profiles={data.profiles}
            buckets={buckets}
            totals={tokenTotals}
            daily={dailyTokens}
            heatmapDays={heatmapTokens}
            source={tokenSource}
            tab={tokenTab}
            days={tokenDays}
            loading={initialLoading}
            onSourceChange={setTokenSource}
            onTabChange={setTokenTab}
            onDaysChange={setTokenDays}
          />

          {/* Row 3 — activity stream and findings. */}
          <div className="grid gap-3 lg:grid-cols-2">
            <ActivityPanel items={data.activity} onOpenTasks={() => setView('tasks')} />
            <FindingsPanel findings={data.recentFindings} onOpenAll={() => setView('findings')} />
          </div>

          {/* Row 4 — recent tasks. */}
          <TaskTable tasks={tasks} onOpenTasks={() => setView('tasks')} />

          {/* Row 5 — inventory, traffic and system health. */}
          <div className="grid gap-3 lg:grid-cols-3">
            <AssetsPanel counts={assetCounts} />
            <TrafficPanel exchanges={data.traffic} total={trafficTotal} />
            <SystemPanel
              stats={data.stats}
              settings={data.settings}
              activeProfile={activeProfile}
              pending={data.pending}
              onReview={() => setView('approvals')}
            />
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
