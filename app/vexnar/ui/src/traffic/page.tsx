// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 流量页：一条链上的三种流量，一张表里各归各位。
 *
 * 这里要解决的不是"再做一个列表"，而是三件一直没对齐的事：
 *
 *   1. **口径**：总量/本地/归档来自 `/api/traffic` 的全量计数（不是当前页），
 *      错误率与体积只描述当前样本，所以卡片上写明"近 N 条"；
 *   2. **来源**：会话抓包（本机 kv）、采集面归档（Go 索引）、Web 测试引擎
 *      （另一个库）分三条泳道，行上带来源徽标，不再混成一个数字；
 *   3. **详情**：请求/响应原文只在检查器里展开，列表不再被报文撑开。
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  ApiErrorLine, Banner, Button, Card, Chip, CodeBlock, DataTable, Drawer, EmptyState, Field,
  KeyValue, Kpi, KpiGrid, MethodBadge, PageShell, Pager, Segmented, Select, Skeleton, Spacer,
  Split, StatusBadge, TextInput, Toolbar, useCopy, type Column
} from '../components/kit.tsx'
import { fmtBytes, fmtCount, fmtInt, fmtMs, fmtPercent, fmtRelative, fmtTime, statusClass } from '../data/format.ts'
import { trafficMetrics } from '../data/metrics.ts'
import { useQuery } from '../data/query.ts'
import { api } from '../data/client.ts'
import {
  fetchTrafficDetail, useCaptureSummary, useTrafficHosts, useTrafficList, useTrafficTotals,
  useWebSession, useWebSessions, type TrafficRow, type WebExchange
} from '../data/resources.ts'
import { YakHistory } from '../yak-history.tsx'

const PAGE_SIZE = 100
const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: '2xx', label: '2xx 成功' },
  { value: '3xx', label: '3xx 跳转' },
  { value: '4xx', label: '4xx 客户端错误' },
  { value: '5xx', label: '5xx 服务端错误' }
] as const
const METHOD_OPTIONS = [
  { value: '', label: '全部方法' },
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'DELETE', label: 'DELETE' }
] as const

type Lane = 'capture' | 'web' | 'yak'
type SortKey = 'ts' | 'status' | 'resp_len'

// ── URL 工具 ───────────────────────────────────────────────────────────────
function pathOf(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

/** 从原始报文里切出正文（首个空行之后）。 */
function rawBody(raw: string): string {
  const index = raw.search(/\r?\n\r?\n/)
  return index === -1 ? '' : raw.slice(index).replace(/^\r?\n\r?\n/, '')
}

/** 把记录下来的请求还原成可复制的 cURL；Host/Content-Length 交给 curl 自己算。 */
function curlOf(request: string, row: TrafficRow): string {
  const lines = request.split(/\r?\n/)
  const first = lines[0] ?? ''
  const head = /^([A-Z]+)\s+(\S+)/.exec(first)
  const method = head?.[1] ?? row.method
  const target = head?.[2] ?? pathOf(row.url)
  const absolute = /^https?:\/\//.test(target) ? target : `${originOf(row.url)}${target}`
  const out = [`curl -i -sS -X ${method} '${absolute}'`]
  for (const line of lines.slice(1)) {
    const trimmed = line.trim()
    if (trimmed === '') break
    const colon = trimmed.indexOf(':')
    if (colon <= 0) continue
    const name = trimmed.slice(0, colon)
    if (/^(host|content-length|connection)$/i.test(name)) continue
    out.push(`  -H '${name}: ${trimmed.slice(colon + 1).trim()}'`)
  }
  const body = rawBody(request)
  if (body !== '') out.push(`  --data-raw '${body.replace(/'/g, `'\\''`)}'`)
  return out.join(' \\\n')
}

// ── 详情抽屉 ───────────────────────────────────────────────────────────────
function TrafficDetail({ row, onClose }: { row: TrafficRow; onClose: () => void }): ReactNode {
  const detail = useQuery(
    `traffic:detail:${row.id}`,
    (signal) => fetchTrafficDetail(row.id, signal),
    { ttlMs: 60_000 }
  )
  const { copy, copied } = useCopy()
  const [side, setSide] = useState<'request' | 'response'>('request')
  const text = side === 'request' ? detail.data?.req ?? '' : detail.data?.resp ?? ''

  return (
    <Drawer
      open
      onClose={onClose}
      width={860}
      title={<><MethodBadge method={row.method} /> <span className="vx-ui-mono-inline">{pathOf(row.url)}</span></>}
      subtitle={row.host}
      meta={<>
        <StatusBadge status={row.status} />
        <Chip tone={row.source === 'archive' ? 'violet' : 'blue'}>{row.source === 'archive' ? '归档索引' : '会话采集'}</Chip>
        <span className="vx-ui-muted">{fmtBytes(row.bytes)}</span>
        <span className="vx-ui-muted">{fmtTime(row.ts)}</span>
      </>}
      footer={<>
        <Button size="sm" onClick={() => copy(text, side === 'request' ? '请求报文' : '响应报文')}>
          {copied === (side === 'request' ? '请求报文' : '响应报文') ? '已复制' : '复制报文'}
        </Button>
        <Button
          size="sm"
          disabled={detail.data === undefined}
          onClick={() => copy(curlOf(detail.data?.req ?? '', row), 'cURL')}
        >
          {copied === 'cURL' ? '已复制' : '复制为 cURL'}
        </Button>
        <Spacer />
        <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
      </>}
    >
      <KeyValue rows={[
        { label: '记录 ID', value: <code>{row.id}</code> },
        { label: '完整 URL', value: <code className="vx-ui-break">{row.url}</code> },
        { label: '响应类型', value: row.contentType === '' ? '—' : row.contentType },
        { label: '状态分段', value: statusClass(row.status) }
      ]} />
      <div className="vx-ui-detail-tabs">
        <Segmented
          value={side}
          label="报文侧"
          options={[{ value: 'request', label: '请求' }, { value: 'response', label: '响应' }]}
          onChange={(next) => setSide(next)}
        />
      </div>
      {detail.loading ? <Skeleton rows={6} /> : null}
      {detail.error === undefined ? null : <Banner tone="red">{detail.error.message}</Banner>}
      {detail.data === undefined ? null : <CodeBlock text={text} maxHeight={430} empty={side === 'request' ? '该记录没有请求正文' : '该记录没有响应正文'} />}
    </Drawer>
  )
}

// ── Web 引擎泳道 ───────────────────────────────────────────────────────────
function WebLane({ active }: { active: boolean }): ReactNode {
  const sessions = useWebSessions(active)
  const [selected, setSelected] = useState<string | null>(null)
  const detail = useWebSession(selected)

  const columns: ReadonlyArray<Column<WebExchange>> = [
    { key: 'time', header: '时间', width: '92px', mono: true, render: (row) => fmtTime(row.timestamp) },
    { key: 'method', header: '方法', width: '74px', render: (row) => <MethodBadge method={row.method} /> },
    { key: 'status', header: '状态', width: '68px', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'path', header: '路径', mono: true, render: (row) => <span className="vx-ui-ellipsis">{row.path}</span>, title: (row) => row.path },
    { key: 'class', header: '分类', width: '110px', render: (row) => <Chip tone={row.classification === 'normal' ? 'green' : row.classification === 'waf_blocked' ? 'red' : 'amber'}>{row.classification}</Chip> },
    { key: 'attempt', header: '尝试', width: '56px', align: 'right', mono: true, render: (row) => row.attempt },
    { key: 'mutation', header: '变异', width: '110px', mono: true, render: (row) => row.mutation },
    { key: 'egress', header: '出口', width: '110px', mono: true, render: (row) => row.egressId },
    { key: 'ms', header: '耗时', width: '70px', align: 'right', mono: true, render: (row) => fmtMs(row.durationMs) }
  ]

  if (sessions.loading && sessions.data === undefined) return <Skeleton rows={5} />
  if (sessions.error !== undefined) return <Banner tone="red">会话读取失败：{sessions.error.message}</Banner>
  const rows = sessions.data ?? []
  if (rows.length === 0) {
    return (
      <EmptyState
        title="还没有 Web 测试会话"
        hint="Harness 通过 web_session_create 建立会话后，请求会出现在这里（独立于抓包库）"
      />
    )
  }

  return (
    <div className="vx-ui-stack">
      <div className="vx-ui-session-grid">
        {rows.map((session) => {
          const used = session.requestBudget === 0 ? 0 : session.requestCount / session.requestBudget
          return (
            <button
              key={session.sessionId}
              type="button"
              className={`vx-ui-session${selected === session.sessionId ? ' is-active' : ''}`}
              onClick={() => setSelected(selected === session.sessionId ? null : session.sessionId)}
            >
              <div className="vx-ui-session-top">
                <strong>{session.label === '' ? session.origin : session.label}</strong>
                <Chip tone={session.status === 'blocked' ? 'red' : session.status === 'closed' ? 'neutral' : 'green'} dot>
                  {session.status}
                </Chip>
                {session.adversarial ? <Chip tone="amber">对抗</Chip> : null}
              </div>
              <div className="vx-ui-session-origin">{session.origin}</div>
              <div className="vx-ui-session-meter">
                <i style={{ width: `${Math.min(100, used * 100)}%` }} />
              </div>
              <div className="vx-ui-session-foot">
                <span>请求 {fmtInt(session.requestCount)} / 预算 {fmtInt(session.requestBudget)}</span>
                <span>{fmtRelative(session.lastRequestAt || session.createdAt)}</span>
              </div>
            </button>
          )
        })}
      </div>

      {selected === null ? null : (
        <Card
          title="会话请求"
          hint={detail.data === undefined ? selected : `${detail.data.session.origin} · 剩余预算 ${fmtInt(detail.data.budgetLeft)}`}
          actions={<Button size="sm" onClick={() => setSelected(null)}>收起</Button>}
        >
          {detail.loading ? <Skeleton rows={4} /> : null}
          {detail.error === undefined ? null : <Banner tone="red">{detail.error.message}</Banner>}
          {detail.data === undefined ? null : (
            <>
              <DataTable
                columns={columns}
                rows={detail.data.history}
                rowKey={(row) => row.requestId}
                dense
                maxHeight={360}
                empty={<EmptyState title="该会话还没有请求" hint="Harness 调 web_request_execute 后会出现在这里" />}
              />
              {detail.data.policyEvents.length === 0 ? null : (
                <div className="vx-ui-events">
                  {detail.data.policyEvents.slice(0, 8).map((event, index) => (
                    <div key={`${event.at ?? ''}-${index}`} className="vx-ui-event">
                      <code>{event.kind ?? 'event'}</code>
                      <span>{event.detail ?? ''}</span>
                      <em>{event.at ?? ''}</em>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  )
}

// ── 存储维护 ───────────────────────────────────────────────────────────────
function Cleanup(): ReactNode {
  const [date, setDate] = useState('')
  const [host, setHost] = useState('')
  const [preview, setPreview] = useState<{ path: string; count: number; token: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  async function review(): Promise<void> {
    if (date === '') return
    const before = Math.floor(new Date(`${date}T00:00:00`).getTime() / 1000)
    const path = `/api/traffic/local-cleanup?${new URLSearchParams({ before: String(before), host: host.trim() }).toString()}`
    setBusy(true)
    setError('')
    setNote('')
    try {
      const result = await api.get<{ count: number; token: string }>(path)
      setPreview({ path, count: result.count, token: result.token })
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function apply(): Promise<void> {
    if (preview === null || !window.confirm(`清理 ${preview.count} 条本地流量记录？此操作无法撤销。`)) return
    setBusy(true)
    setError('')
    try {
      const result = await api.del<{ deleted: number }>(preview.path, { token: preview.token })
      setNote(`已清理 ${result.deleted} 条本地流量（归档索引与已绑定证据不受影响）`)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setPreview(null)
      setBusy(false)
    }
  }

  return (
    <Card title="存储维护" hint="仅清理本机 kv 中的采集记录；归档索引与已绑定的证据保留">
      <Toolbar>
        <Field label="截止日期" inline>
          <input
            className="vx-ui-input"
            type="date"
            value={date}
            aria-label="截止日期"
            onChange={(event) => { setDate(event.target.value); setPreview(null) }}
          />
        </Field>
        <Field label="主机" inline>
          <TextInput value={host} onChange={(next) => { setHost(next); setPreview(null) }} placeholder="留空为全部主机" width={190} />
        </Field>
        <Button size="sm" disabled={date === '' || busy} busy={busy} onClick={() => void review()}>预览清理</Button>
        {preview === null ? null : (
          <Button size="sm" variant="danger" disabled={preview.count === 0 || busy} onClick={() => void apply()}>
            清理 {preview.count} 条
          </Button>
        )}
        <Spacer />
        {note === '' ? null : <span className="vx-ui-ok">{note}</span>}
      </Toolbar>
      {error === '' ? null : <Banner tone="red">{error}</Banner>}
    </Card>
  )
}

// ── 主页 ───────────────────────────────────────────────────────────────────
export function TrafficPanel(): ReactNode {
  const [lane, setLane] = useState<Lane>('capture')
  const [host, setHost] = useState('')
  const [method, setMethod] = useState('')
  const [status, setStatus] = useState('')
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'ts', dir: 'desc' })
  const [live, setLive] = useState(true)
  const [selected, setSelected] = useState<TrafficRow | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(keyword.trim()); setPage(0) }, 300)
    return () => window.clearTimeout(timer)
  }, [keyword])

  const totals = useTrafficTotals(live && lane === 'capture')
  const list = useTrafficList(
    { host, method, status, q: query, sort: sort.key, order: sort.dir, page, size: PAGE_SIZE },
    live && lane === 'capture'
  )
  const hosts = useTrafficHosts()
  const capture = useCaptureSummary(live && lane === 'capture')
  const webSessions = useWebSessions(lane === 'web')

  const metrics = useMemo(() => trafficMetrics({
    totals: totals.data,
    rows: list.data?.rows,
    hosts: hosts.data,
    webSessions: webSessions.data,
    capture: capture.data
  }), [totals.data, list.data, hosts.data, webSessions.data, capture.data])

  const rows = list.data?.rows ?? []
  const total = list.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const error = list.error?.message ?? totals.error?.message ?? ''

  const toggleSort = (key: string): void => {
    if (key !== 'ts' && key !== 'status' && key !== 'resp_len') return
    setSort((current) => current.key === key
      ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'ts' ? 'desc' : 'asc' })
    setPage(0)
  }

  const columns: ReadonlyArray<Column<TrafficRow>> = [
    { key: 'ts', header: '时间', width: '92px', mono: true, sortable: true, render: (row) => fmtTime(row.ts) },
    { key: 'method', header: '方法', width: '82px', render: (row) => <MethodBadge method={row.method} /> },
    { key: 'status', header: '状态', width: '62px', sortable: true, render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'host', header: '主机', width: '150px', mono: true,
      render: (row) => <span className="vx-ui-ellipsis">{row.host}</span>, title: (row) => row.host
    },
    { key: 'path', header: '路径', mono: true, render: (row) => <span className="vx-ui-ellipsis">{pathOf(row.url)}</span>, title: (row) => row.url },
    { key: 'bytes', header: '大小', width: '78px', align: 'right', mono: true, sortable: true, render: (row) => fmtBytes(row.bytes) },
    {
      key: 'source', header: '来源', width: '80px',
      render: (row) => <Chip tone={row.source === 'archive' ? 'violet' : 'blue'}>{row.source === 'archive' ? '归档' : '采集'}</Chip>
    }
  ]

  return (
    <PageShell
      title="流量"
      desc="会话抓包、采集面归档与 Web 测试引擎的请求记录；同一份口径，三种来源分开计数。"
      actions={<>
        <Button size="sm" variant={live ? 'primary' : 'default'} onClick={() => setLive(!live)} title="开启后每 5 秒刷新">
          {live ? '实时' : '已暂停'}
        </Button>
        <Button size="sm" busy={list.refreshing} onClick={() => { totals.refresh(); list.refresh(); hosts.refresh(); capture.refresh() }}>
          刷新
        </Button>
      </>}
      status={<>
        <span className={`vx-ui-live${metrics.captureActive ? ' is-on' : ''}`}>
          <i />{metrics.captureActive ? `采集中 · ${metrics.captureSessions} 个会话` : '当前无抓包会话'}
        </span>
        <span className="vx-ui-muted">最近写入 {fmtRelative(metrics.lastTs)}</span>
        <span className="vx-ui-muted">Web 引擎 {fmtInt(metrics.web)} 请求 · {(webSessions.data ?? []).length} 会话</span>
        <Spacer />
      </>}
    >
      {error === '' ? null : (
        <ApiErrorLine
          error={error}
          detail={list.error?.detail ?? totals.error?.detail}
          onRetry={() => { list.refresh(); totals.refresh() }}
        />
      )}
      <KpiGrid>
        <Kpi label="总记录" value={fmtCount(metrics.total)} unit="条" hint={`采集 ${fmtInt(metrics.local)} · 归档 ${fmtInt(metrics.archived)}`} tone="blue" />
        <Kpi label="请求站点" value={fmtInt(metrics.hosts)} unit="个" hint="按 host 去重" tone="violet" />
        <Kpi label="样本错误率" value={fmtPercent(metrics.errorRate)} hint={`近 ${fmtInt(metrics.sampleSize)} 条 · ${fmtInt(metrics.errors)} 条 4xx/5xx`} tone={metrics.errorRate > 0.2 ? 'red' : 'green'} />
        <Kpi label="样本体积" value={fmtBytes(metrics.bytes)} hint={`近 ${fmtInt(metrics.sampleSize)} 条响应合计`} tone="amber" />
      </KpiGrid>

      <div className="vx-ui-lane">
        <Segmented
          value={lane}
          label="流量来源"
          options={[
            { value: 'capture', label: '采集流量', count: metrics.total },
            { value: 'web', label: 'Web 引擎', count: metrics.web },
            { value: 'yak', label: 'Yak 内核' }
          ]}
          onChange={(next) => setLane(next)}
        />
      </div>

      {lane === 'capture' && (
        <Split
          main={
            <Card
              title="请求记录"
              hint={total === 0 ? '暂无数据' : `${fmtInt(total)} 条匹配，按${sort.key === 'ts' ? '时间' : sort.key === 'status' ? '状态' : '大小'}${sort.dir === 'asc' ? '升序' : '降序'}`}
              actions={<span className="vx-ui-muted">第 {page + 1} / {pageCount} 页</span>}
            >
              <Toolbar>
                <TextInput value={host} onChange={(next) => { setHost(next); setPage(0) }} placeholder="主机 / IP" width={170} />
                <Select value={method} options={METHOD_OPTIONS} label="方法" onChange={(next) => { setMethod(next); setPage(0) }} />
                <Select value={status} options={STATUS_OPTIONS} label="状态" onChange={(next) => { setStatus(next); setPage(0) }} />
                <TextInput value={keyword} onChange={setKeyword} placeholder="URL / 报文关键词" width={220} />
                <Spacer />
                {(host || method || status || query)
                  ? <Button size="sm" variant="ghost" onClick={() => { setHost(''); setMethod(''); setStatus(''); setKeyword(''); setQuery(''); setPage(0) }}>清空筛选</Button>
                  : null}
              </Toolbar>
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(row) => row.id}
                loading={list.loading}
                sort={sort}
                onSort={toggleSort}
                selectedKey={selected?.id}
                onRowClick={(row) => setSelected(row)}
                maxHeight={520}
                empty={
                  <EmptyState
                    title="没有匹配的流量"
                    hint={metrics.total === 0
                      ? '在会话里点「抓包」后产生的请求会落在这里；采集面归档需配置 Go 服务'
                      : '当前筛选条件没有命中，试试清空筛选'}
                  />
                }
              />
              <Pager page={page} pageCount={pageCount} total={total} unit="条" onPage={(next) => setPage(next)} />
            </Card>
          }
          rail={<>
            <Card title="Top 站点" hint={`${fmtInt(metrics.hosts)} 个`} scroll>
              {metrics.topHosts.length === 0
                ? <EmptyState title="暂无站点" hint="抓到流量后自动聚合" />
                : (
                  <div className="vx-ui-hbars">
                    {metrics.topHosts.map((row) => {
                      const max = metrics.topHosts[0]?.count ?? 1
                      return (
                        <button key={row.host} type="button" className="vx-ui-hbar" onClick={() => { setHost(row.host); setPage(0) }}>
                          <span className="vx-ui-hbar-label" title={row.host}>{row.host}</span>
                          <i><b style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }} /></i>
                          <em>{fmtInt(row.count)}</em>
                        </button>
                      )
                    })}
                  </div>
                )}
            </Card>

            <Card title="状态分布" hint={`样本 ${fmtInt(metrics.sampleSize)}`}>
              {metrics.byStatus.length === 0 ? <EmptyState title="暂无样本" /> : (
                <div className="vx-ui-hbars">
                  {metrics.byStatus.map((row) => {
                    const max = Math.max(...metrics.byStatus.map((item) => item.count), 1)
                    const tone = row.key === '5xx' ? 'red' : row.key === '4xx' ? 'amber' : row.key === '3xx' ? 'violet' : 'green'
                    return (
                      <div key={row.key} className="vx-ui-hbar vx-ui-hbar--static">
                        <span className="vx-ui-hbar-label">{row.label}</span>
                        <i><b className={`vx-ui-tone-${tone}`} style={{ width: `${Math.max(3, (row.count / max) * 100)}%` }} /></i>
                        <em>{fmtInt(row.count)}</em>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            <Card title="活跃抓包" hint={`${metrics.captureSessions} 个会话`} scroll>
              {(capture.data?.sessions ?? []).length === 0
                ? <EmptyState title="无会话在抓包" hint="在 chat 头部点「抓包」开启" />
                : (
                  <div className="vx-ui-list">
                    {(capture.data?.sessions ?? []).map((session) => (
                      <div key={session.scope} className="vx-ui-list-row">
                        <div className="vx-ui-list-main">
                          <code>{session.scope}</code>
                          <span>{session.source === '' ? '会话' : session.source} · {fmtInt(session.items)} 条</span>
                        </div>
                        <em>{fmtRelative(session.lastTs || session.startedAt)}</em>
                      </div>
                    ))}
                  </div>
                )}
            </Card>
          </>}
        />
      )}

      {lane === 'web' && <WebLane active />}
      {lane === 'yak' && <Card title="Yak 内核 History" hint="外部内核的流量来源；未配置时该页签为空"><YakHistory /></Card>}

      {lane === 'capture' ? <Cleanup /> : null}

      {selected === null ? null : <TrafficDetail row={selected} onClose={() => setSelected(null)} />}
    </PageShell>
  )
}
