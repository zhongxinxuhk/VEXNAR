// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 任务工作区：清单 + 详情（十个页签）。
 *
 * 数据走 /vexnar-api/api，与控制台 :3000 同源；每个页签只读自己那组接口，
 * 切换页签不会把整页数据重拉一遍。
 */

import { useMemo, useState } from 'react'

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
import { Button, Card, Empty, ErrorLine, Field, Select, StatusChip, relTime } from './ui.js'

/** 服务端语义色 → 面板已有的 chip 色调类（`info` 落到 redirect，没有独立类）。 */
const CHIP_TONE: Record<string, string> = {
  muted: 'muted',
  info: 'redirect',
  success: 'success',
  warn: 'warn',
  error: 'error'
}

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
const STATUS_FILTER: Array<[string, string]> = [
  ['', '全部状态'],
  ['created', '待启动'],
  ['queued', '排队中'],
  ['running', '进行中'],
  ['paused', '已暂停'],
  ['done', '已完成'],
  ['failed', '失败'],
  ['timeout', '已超时']
]

function TaskRow({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const findings = task.findings ?? { critical: 0, high: 0, medium: 0, low: 0 }
  const total = findings.critical + findings.high + findings.medium + findings.low
  const goals = task.goals_total ? `${task.goals_met ?? 0}/${task.goals_total}` : '—'
  return (
    <button type="button" className="vx-task-rowitem" onClick={onOpen}>
      <span className="vx-task-rowitem-main">
        <span className="vx-task-rowitem-title">{task.name || task.description || `任务 #${task.id}`}</span>
        <span className="vx-task-rowitem-sub">
          <code>#{task.id}</code>
          {task.goal ? <span>{task.goal}</span> : null}
        </span>
      </span>
      <span className="vx-task-rowitem-meta">
        <StatusChip status={task.status} />
        <span className="vx-task-mini">
          <b>{goals}</b>
          <small>目标</small>
        </span>
        <span className="vx-task-mini">
          <b>{total}</b>
          <small>漏洞</small>
        </span>
        <span className="vx-task-mini">
          <b>{relTime(task.last_activity)}</b>
          <small>最近活动</small>
        </span>
      </span>
    </button>
  )
}

export function TasksWorkspace() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [open, setOpen] = useState('')
  const [showArchives, setShowArchives] = useState(false)
  const [draft, setDraft] = useState({ description: '', goal: '' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const key = `tasks:${query}:${status}:${page}:${size}`
  const list = useResource(key, () => tasksApi.list({ q: query, status, page, size }))
  // 筛选计数读全量聚合，不读当前页：一页 20 条算出来的分布从来不是全站分布。
  const summary = useResource('tasks:summary', () => tasksApi.summary())
  const rows = list.data?.tasks ?? []
  const total = list.data?.total ?? rows.length
  const pages = Math.max(1, Math.ceil(total / size))

  const lifecycle = summary.data?.lifecycle ?? []
  const statusline = useMemo(() => {
    const counts = summary.data?.by_status ?? {}
    return lifecycle
      .map((entry) => ({ ...entry, value: Number(counts[entry.key] ?? 0) }))
      .filter((entry) => entry.value > 0)
  }, [lifecycle, summary.data])

  const reloadTasks = () => { list.reload(); summary.reload() }
  if (showArchives) return <TaskArchives onBack={() => { setShowArchives(false); reloadTasks() }} />
  if (open) return <TaskDetailPage id={open} onBack={() => { setOpen(''); reloadTasks() }} />

  const create = () => {
    if (!draft.description.trim()) return
    setCreating(true)
    setError('')
    tasksApi
      .create({ description: draft.description.trim(), goal: draft.goal.trim() })
      .then((task) => {
        setDraft({ description: '', goal: '' })
        setPage(1)
        list.reload()
        if (task?.id) setOpen(String(task.id))
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setCreating(false))
  }

  return (
    <div className="vx-task-workspace">
      <div className="vx-task-toolbar">
        <Field placeholder="搜索任务（名称 / 描述 / 目标）" value={query} onChange={(value) => { setQuery(value); setPage(1) }} ariaLabel="搜索任务" />
        <Select value={status} onChange={(value) => { setStatus(value); setPage(1) }} ariaLabel="状态" options={STATUS_FILTER} />
        <Select value={String(size)} onChange={(value) => setSize(Number(value))} ariaLabel="每页" options={[['10', '10 / 页'], ['20', '20 / 页'], ['50', '50 / 页']]} />
        <Button onClick={reloadTasks}>刷新</Button>
        <Button onClick={() => setShowArchives(true)}>归档记录</Button>
        <span className="vx-task-spacer" />
        <span className="vx-task-hint">
          共 {total} 个任务 · 第 {page}/{pages} 页
        </span>
        <Button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
          上一页
        </Button>
        <Button disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>
          下一页
        </Button>
      </div>

      <Card title="新建任务" extra={<span className="vx-task-hint">描述与目标决定规划器的探索边界</span>}>
        <div className="vx-task-inline vx-task-inline--wide">
          <Field placeholder="任务描述，如「example.com 外网资产梳理」" value={draft.description} onChange={(value) => setDraft({ ...draft, description: value })} />
          <Field placeholder="目标（可选），如「拿到管理员账号的越权访问」" value={draft.goal} onChange={(value) => setDraft({ ...draft, goal: value })} />
          <Button tone="primary" disabled={!draft.description.trim() || creating} onClick={create}>
            {creating ? '创建中…' : '创建'}
          </Button>
        </div>
        <ErrorLine error={error} />
      </Card>

      <div className="vx-task-statusline">
        {summary.data !== undefined ? (
          <>
            <span className="vx-task-hint">共 {summary.data.total} 个任务</span>
            {statusline.map((entry) => (
              <span key={entry.key} className={`vx-chip vx-chip--${CHIP_TONE[entry.tone] ?? 'muted'}`}>
                {entry.label} · {entry.value}
              </span>
            ))}
          </>
        ) : (
          <span className="vx-task-hint">{summary.error ? `统计不可用：${summary.error}` : '读取统计…'}</span>
        )}
      </div>

      <Card className="vx-task-listcard">
        {list.loading ? (
          <Empty text="读取任务…" />
        ) : rows.length === 0 ? (
          <Empty text="没有匹配的任务" hint="换个筛选条件，或在上方新建一个。" />
        ) : (
          <div className="vx-task-rows">
            {rows.map((task) => (
              <TaskRow key={task.id} task={task} onOpen={() => setOpen(String(task.id))} />
            ))}
          </div>
        )}
        <ErrorLine error={list.error} />
      </Card>
    </div>
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
