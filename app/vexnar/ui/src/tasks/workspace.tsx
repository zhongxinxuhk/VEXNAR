// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 任务工作区：清单 + 详情（十个页签）。
 *
 * 清单的取数与统计走 `data/resources.ts`（`useTasks` / `useTaskSummary`），
 * 与概览共用同一个缓存键与同一个 `taskMetrics()` 口径——之前在任务页算一遍、
 * 在概览再算一遍，两个页面的「完成率」曾经差 0.3 个百分点，就是这里来的。
 *
 * 详情页签仍直接调用 `tasksApi`：它们是任务内部的从属数据，切换页签不该把
 * 整页重拉，也不需要进入全局缓存。
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  ApiErrorLine, Button as KitButton, Card as KitCard, Chip, DataTable, Drawer, Kpi, KpiGrid,
  PageShell, Pager, Spacer, TextInput, Toolbar, type Column
} from '../components/kit.tsx'
import { fmtCount, fmtInt, fmtPercent } from '../data/format.ts'
import { taskMetrics } from '../data/metrics.ts'
import { useTaskSummary, useTasks } from '../data/resources.ts'
import { tasksApi, type Task } from './api.js'
import { useResource } from './hooks.js'
import {
  AssetsSection,
  BroadcastSection,
  CoverageSection,
  FindingsSection,
  GraphSection,
  InterceptSection,
  OverviewSection,
  ReportSection,
  RetestsSection,
  SessionsSection
} from './sections.js'
import { Button, Card, Empty, ErrorLine, StatusChip, relTime } from './ui.js'

const TABS = [
  ['sessions', '会话'],
  ['overview', '总览'],
  ['graph', '探索链路'],
  ['broadcast', '播报板'],
  ['findings', '发现'],
  ['retests', '复测'],
  ['assets', '测试资产'],
  ['coverage', '资产覆盖图'],
  ['intercept', '拦截审批'],
  ['report', '报告']
] as const

type TabID = (typeof TABS)[number][0]

/**
 * 状态筛选：与服务端生命周期同源。`archived` 不是状态（归档任务已不在清单里），
 * 所以这里不再提供这个选项——此前选它必然得到空列表。
 */
const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'created', label: '待启动' },
  { value: 'queued', label: '排队中' },
  { value: 'running', label: '进行中' },
  { value: 'paused', label: '已暂停' },
  { value: 'done', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'timeout', label: '已超时' }
] as const
const SIZE_OPTIONS = [
  { value: '10', label: '10 / 页' },
  { value: '20', label: '20 / 页' },
  { value: '50', label: '50 / 页' }
] as const

export function TasksWorkspace({ viewSwitch }: { viewSwitch?: ReactNode }): ReactNode {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [open, setOpen] = useState('')
  const [showArchives, setShowArchives] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [draft, setDraft] = useState({ description: '', goal: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1) }, 300)
    return () => window.clearTimeout(timer)
  }, [search])

  const list = useTasks({ q: query, status, page, size })
  const summary = useTaskSummary(30)
  const metrics = useMemo(() => taskMetrics(summary.data), [summary.data])

  const rows = list.data?.tasks ?? []
  const total = list.data?.total ?? rows.length
  const pages = Math.max(1, Math.ceil(total / size))
  const reload = (): void => { list.refresh(); summary.refresh() }

  if (showArchives) return <TaskArchives onBack={() => { setShowArchives(false); reload() }} />
  if (open !== '') return <TaskDetailPage id={open} onBack={() => { setOpen(''); reload() }} />

  const create = (): void => {
    if (draft.description.trim() === '') return
    setCreating(true)
    setError('')
    tasksApi
      .create({ description: draft.description.trim(), goal: draft.goal.trim() })
      .then((task) => {
        setDraft({ description: '', goal: '' })
        setPage(1)
        reload()
        if (task?.id) setOpen(String(task.id))
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setCreating(false))
  }

  const columns: ReadonlyArray<Column<Task>> = [
    {
      key: 'task', header: '任务', render: (task) => (
        <div className="vx-ui-cell-stack">
          <strong>{task.name || task.description || `任务 #${task.id}`}</strong>
          <span className="vx-ui-muted">
            <code>#{task.id}</code>{task.goal ? ` · ${task.goal}` : ''}
          </span>
        </div>
      )
    },
    { key: 'status', header: '状态', width: '86px', render: (task) => <StatusChip status={task.status} /> },
    {
      key: 'goals', header: '目标', width: '68px', align: 'right', mono: true,
      render: (task) => task.goals_total ? `${task.goals_met ?? 0}/${task.goals_total}` : '—'
    },
    {
      key: 'findings', header: '漏洞', width: '86px', align: 'right', render: (task) => {
        const bucket = task.findings ?? { critical: 0, high: 0, medium: 0, low: 0 }
        const sum = bucket.critical + bucket.high + bucket.medium + bucket.low
        if (sum === 0) return <span className="vx-ui-muted">—</span>
        return (
          <span className="vx-ui-row-actions">
            {bucket.critical > 0 ? <Chip tone="red">{bucket.critical} 严重</Chip> : null}
            <Chip tone={bucket.high > 0 ? 'amber' : 'neutral'}>{sum}</Chip>
          </span>
        )
      }
    },
    {
      key: 'tokens', header: 'Token', width: '72px', align: 'right', mono: true,
      render: (task) => fmtCount(task.tokens?.total ?? 0)
    },
    {
      key: 'activity', header: '最近活动', width: '92px', align: 'right',
      render: (task) => <span className="vx-ui-muted">{relTime(task.last_activity)}</span>
    },
    {
      key: 'open', header: '', width: '64px', align: 'right', render: (task) => (
        <KitButton size="sm" onClick={() => setOpen(String(task.id))}>打开</KitButton>
      )
    }
  ]

  const pageCount = pages

  return (
    <PageShell
      title="任务"
      desc="任务的探索边界、目标达成与产出；清单口径与概览一致，数字不会两处不一致。"
      actions={<>
        {viewSwitch ?? null}
        <KitButton size="sm" busy={list.refreshing} onClick={reload}>刷新</KitButton>
        <KitButton size="sm" onClick={() => setShowArchives(true)}>归档记录</KitButton>
        <KitButton size="sm" variant="primary" onClick={() => { setDraft({ description: '', goal: '' }); setError(''); setCreateOpen(true) }}>新建任务</KitButton>
      </>}
      status={<>
        <span className="vx-ui-live is-on"><i />活动 {fmtInt(metrics.active)}</span>
        <span className="vx-ui-muted">暂停 {fmtInt(metrics.paused)}</span>
        <span className="vx-ui-muted">在飞 {fmtInt(metrics.inFlight)}</span>
        <Spacer />
        {summary.error === undefined ? null : <span className="vx-ui-bad">统计不可用：{summary.error.message}</span>}
      </>}
    >
      {list.error === undefined ? null : (
        <ApiErrorLine error={list.error.message} detail={list.error.detail} onRetry={reload} />
      )}
      <KpiGrid>
        <Kpi label="任务总数" value={fmtInt(metrics.total)} unit="个" hint={`本页 ${fmtInt(rows.length)} 条 · 第 ${page}/${pageCount} 页`} tone="blue" />
        <Kpi label="进行中" value={fmtInt(metrics.active)} unit="个" hint={`暂停 ${metrics.paused} · 在飞 ${metrics.inFlight}`} tone={metrics.active > 0 ? 'green' : 'neutral'} />
        <Kpi label="已完成" value={fmtInt(metrics.done)} unit="个" hint={`失败 ${metrics.failed} · 超时 ${metrics.timeout}`} tone="violet" />
        <Kpi label="完成率" value={fmtPercent(metrics.completionRate)} hint={`终态 ${fmtInt(metrics.terminal)} 个里完成的比例`} tone={metrics.completionRate >= 0.6 ? 'green' : 'amber'} />
        <Kpi label="目标达成" value={fmtPercent(metrics.goalRate)} hint={`${fmtInt(metrics.goalsMet)} / ${fmtInt(metrics.goalsTotal)} 个目标`} tone="amber" />
        <Kpi label="漏洞" value={fmtInt(metrics.findings.total)} unit="个" hint={`严重 ${metrics.findings.critical} · 高危 ${metrics.findings.high}`} tone={metrics.findings.critical > 0 ? 'red' : 'neutral'} />
      </KpiGrid>

      <KitCard title="任务清单" hint={query === '' ? '全部任务' : `搜索「${query}」`}>
        <Toolbar>
          <TextInput value={search} onChange={setSearch} placeholder="搜索任务（名称 / 描述 / 目标）" width={260} />
          <select
            className="vx-ui-select"
            style={{ width: 120 }}
            value={status}
            aria-label="状态"
            onChange={(event) => { setStatus(event.target.value); setPage(1) }}
          >
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select
            className="vx-ui-select"
            style={{ width: 92 }}
            value={String(size)}
            aria-label="每页"
            onChange={(event) => { setSize(Number(event.target.value)); setPage(1) }}
          >
            {SIZE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <Spacer />
          <span className="vx-ui-muted">共 {fmtInt(total)} 个</span>
        </Toolbar>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(task) => String(task.id)}
          onRowClick={(task) => setOpen(String(task.id))}
          loading={list.loading}
          maxHeight={520}
          empty={<Empty text="没有匹配的任务" hint="换个筛选条件，或点右上角新建一个。" />}
        />
        <Pager page={page - 1} pageCount={pageCount} total={total} unit="个任务" onPage={(next) => setPage(next + 1)} />
        {list.error === undefined ? null : <ErrorLine error={list.error.message} />}
      </KitCard>

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        width={560}
        title="新建任务"
        subtitle="描述与目标决定规划器的探索边界；创建后自动进入任务详情"
        footer={<>
          <KitButton size="sm" variant="primary" busy={creating} disabled={draft.description.trim() === ''} onClick={create}>创建</KitButton>
          <Spacer />
          <KitButton size="sm" variant="ghost" onClick={() => setCreateOpen(false)}>取消</KitButton>
        </>}
      >
        <label className="vx-ui-field">
          <span className="vx-ui-field-label">任务描述</span>
          <textarea
            className="vx-ui-textarea"
            rows={3}
            value={draft.description}
            placeholder="如：example.com 外网资产梳理"
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </label>
        <label className="vx-ui-field">
          <span className="vx-ui-field-label">测试目标（可选）</span>
          <textarea
            className="vx-ui-textarea"
            rows={2}
            value={draft.goal}
            placeholder="如：拿到管理员账号的越权访问"
            onChange={(event) => setDraft({ ...draft, goal: event.target.value })}
          />
        </label>
        <ErrorLine error={error} />
      </Drawer>
    </PageShell>
  )
}

function TaskArchives({ onBack }: { onBack: () => void }) {
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const archives = useResource(`archives:${page}`, () => tasksApi.archives(page))
  const rows = archives.data?.items ?? []
  const total = archives.data?.total ?? 0

  async function change(id: number, action: 'restore' | 'delete') {
    if (action === 'delete' && !window.confirm('移除这条归档？此操作无法从客户端撤销。')) return
    setBusy(true)
    setError('')
    try {
      await (action === 'restore' ? tasksApi.restoreArchive(id) : tasksApi.deleteArchive(id))
      if (rows.length === 1 && page > 1) setPage(page - 1)
      else archives.reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="vx-task-workspace">
      <div className="vx-task-toolbar">
        <Button onClick={onBack}>← 返回任务</Button>
        <Button onClick={archives.reload} disabled={busy}>刷新</Button>
        <span className="vx-task-hint">共 {total} 条归档</span>
        <Button onClick={() => setPage(page - 1)} disabled={busy || page <= 1}>上一页</Button>
        <Button onClick={() => setPage(page + 1)} disabled={busy || page * 20 >= total}>下一页</Button>
      </div>
      <Card title="归档记录">
        <ErrorLine error={error || archives.error} />
        {archives.loading ? <Empty text="读取归档…" /> : !archives.error && rows.length === 0 ? <Empty text="没有归档记录" /> : null}
        {rows.map((row) => (
          <div key={row.id} className="vx-task-inline vx-task-inline--wide">
            <strong>{row.task_name || `任务 #${row.task_id}`}</strong>
            <span className="vx-task-hint">{[row.archived_at, row.state].filter(Boolean).join(' · ')}</span>
            <Button disabled={busy || !['done', 'ready', 'restore_failed'].includes(row.state)} onClick={() => void change(row.id, 'restore')}>恢复</Button>
            <Button tone="danger" disabled={busy || !['done', 'ready', 'delete_failed'].includes(row.state)} onClick={() => void change(row.id, 'delete')}>移除归档</Button>
          </div>
        ))}
      </Card>
    </div>
  )
}

function TaskDetailPage({ id, onBack }: { id: string; onBack: () => void }) {
  const [tab, setTab] = useState<TabID>('overview')
  const task = useResource(`task:${id}`, () => tasksApi.get(id))
  const [busy, setBusy] = useState('')

  const control = (action: 'pause' | 'resume') => {
    setBusy(action)
    tasksApi
      .control(id, action)
      .then(task.reload)
      .catch((error: Error) => window.alert(error.message))
      .finally(() => setBusy(''))
  }

  const value = task.data
  return (
    <div className="vx-task-workspace">
      <div className="vx-task-detail-head">
        <Button tone="ghost" onClick={onBack}>
          ← 返回
        </Button>
        <div className="vx-task-detail-title">
          <strong>{value?.name || value?.description || `任务 #${id}`}</strong>
          <span className="vx-task-hint">
            <code>#{id}</code>
            {value?.goal ? ` · ${value.goal}` : ''}
          </span>
        </div>
        <span className="vx-task-spacer" />
        {value ? <StatusChip status={value.status} /> : null}
        <Button
          disabled={!value || busy !== '' || !['running', 'paused', 'queued'].includes(value.status)}
          onClick={() => control(value?.paused ? 'resume' : 'pause')}
        >
          {value?.paused ? '继续' : '暂停'}
        </Button>
        <Button
          disabled={!value || busy !== ''}
          onClick={() => {
            setBusy('archive')
            tasksApi.archive(id).then(onBack)
              .catch((error: Error) => window.alert(error.message))
              .finally(() => setBusy(''))
          }}
        >
          归档
        </Button>
      </div>

      <ErrorLine error={task.error} />

      <div className="vx-task-tabbar" role="tablist">
        {TABS.map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>
            {label}
          </button>
        ))}
      </div>

      {task.loading ? (
        <Empty text="读取任务…" />
      ) : value ? (
        <div className="vx-task-tabbody">
          {tab === 'sessions' && <SessionsSection task={value} />}
          {tab === 'overview' && <OverviewSection task={value} />}
          {tab === 'graph' && <GraphSection task={value} />}
          {tab === 'broadcast' && <BroadcastSection task={value} />}
          {tab === 'findings' && <FindingsSection task={value} />}
          {tab === 'retests' && <RetestsSection task={value} />}
          {tab === 'assets' && <AssetsSection task={value} />}
          {tab === 'coverage' && <CoverageSection task={value} />}
          {tab === 'intercept' && <InterceptSection task={value} />}
          {tab === 'report' && <ReportSection task={value} />}
        </div>
      ) : null}
    </div>
  )
}
