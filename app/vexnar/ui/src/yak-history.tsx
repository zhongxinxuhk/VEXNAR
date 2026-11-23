// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'

import { useVirtualizer } from '@tanstack/react-virtual'
import { YakSourcesEditor } from './yak-sources.js'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'

import { methodClass, statusClass } from './http-packet.js'
import { PacketPane, type Packet } from './packet-view.js'

type Flow = {
  id: string
  url: string
  method: string
  status: number
  bytes: number
  content_type: string
  source: string
  ip: string
  title: string
  tags: string
  time: number
  websocket: boolean
}
type Page = { rows: Flow[]; total: number; size: number }
type Exchange = { flow: Flow; request: Packet; response: Packet }

function useHistory<T>(body: string | null, revision = 0) {
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>()
  const key = `${revision}:${body}`
  useEffect(() => {
    if (body === null) return
    const controller = new AbortController()
    async function read() {
      try {
        const response = await fetch('/vexnar-api/api/yak/history', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          signal: controller.signal
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`)
        if (!controller.signal.aborted) setResult({ key, data })
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, error: (error as Error).message })
      }
    }
    void read()
    return () => controller.abort()
  }, [body, key])
  return {
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error : undefined,
    loading: body !== null && result?.key !== key
  }
}

const emptyFilters = {
  url: '',
  method: '',
  status: '',
  capture_source: '',
  content_type: '',
  keyword: '',
  tag: '',
  websocket: false
}

function siteName(raw: string) {
  try {
    return new URL(raw).host
  } catch {
    return ''
  }
}

function exportRows(rows: Flow[]) {
  const cell = (value: string | number) => {
    const text = String(value)
    const escaped = /^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text
    return '"' + escaped.replaceAll('"', '""') + '"'
  }
  const lines = [
    'ID,Method,Status,URL,ResponseBytes,ContentType,Source,IP,Title,Tags,Time',
    ...rows.map((row) =>
      [row.id, row.method, row.status, row.url, row.bytes, row.content_type, row.source, row.ip, row.title, row.tags, row.time]
        .map(cell)
        .join(',')
    )
  ]
  const href = URL.createObjectURL(new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = href
  link.download = 'yak-history.csv'
  link.click()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

const COLUMNS = '92px 62px 72px minmax(220px, 1.4fr) 152px 156px 76px 108px minmax(120px, 0.9fr)'
const ROW_HEIGHT = 30
/** 列表列定义：label + 可排序字段（与服务端 order_by 同名）。 */
const COLUMN_DEFS: Array<{ label: string; field?: 'id' | 'status_code' | 'body_length' | 'created_at'; align?: 'end' }> = [
  { label: '时间', field: 'created_at' },
  { label: '方法' },
  { label: '状态', field: 'status_code' },
  { label: 'URL' },
  { label: '响应大小', field: 'body_length', align: 'end' },
  { label: '类型' },
  { label: '来源' },
  { label: 'IP' },
  { label: '标题' }
]

export function YakHistory({ sessionId }: { sessionId?: string }) {
  const [sourceOverride, setSource] = useState('')
  const [revision, setRevision] = useState(0)
  const [filters, setFilters] = useState(emptyFilters)
  const [search, setSearch] = useState(emptyFilters)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState('')
  const [order, setOrder] = useState({ order_by: 'id', ascending: false })
  const sources = useHistory<{ sources: string[] }>(sessionId ? null : '{"action":"sources"}', revision)
  const source = sources.data?.sources.includes(sourceOverride) ? sourceOverride : sources.data?.sources[0] ?? ''
  const scope = sessionId ? { session_id: sessionId } : { source }
  const available = Boolean(sessionId || source)
  const list = useHistory<Page>(available ? JSON.stringify({ action: 'list', ...scope, ...search, ...order, page }) : null, revision)
  const detail = useHistory<Exchange>(available && selected ? JSON.stringify({ action: 'detail', ...scope, id: selected }) : null, revision)

  const rows = list.data?.rows ?? []
  const sites: Record<string, number> = Object.create(null)
  for (const row of rows) {
    const site = siteName(row.url)
    if (site) sites[site] = (sites[site] ?? 0) + 1
  }
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.size)) : 1
  const maxBytes = rows.reduce((max, row) => Math.max(max, row.bytes), 0) || 1

  // 一页 50 条也要顺手支持更大的 page size：行固定高，虚拟滚动让长列表保持流畅。
  const listRef = useRef<HTMLDivElement>(null)
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  function apply(next: typeof emptyFilters) {
    setSearch(next)
    setFilters(next)
    setPage(1)
    setSelected('')
  }

  function sortBy(field: (typeof COLUMN_DEFS)[number]['field']) {
    if (!field) return
    setOrder({ order_by: field, ascending: order.order_by === field && !order.ascending })
    setPage(1)
    setSelected('')
  }

  return (
    <div className="vx-yak-history">
      {!sessionId && <YakSourcesEditor onSaved={() => setRevision((value) => value + 1)} />}
      <form
        className="vx-yak-filters"
        onSubmit={(event) => {
          event.preventDefault()
          apply(filters)
        }}
      >
        {!sessionId && (
          <select
            className="vx-yak-source"
            aria-label="Yak 项目"
            value={source}
            onChange={(event) => {
              setSource(event.target.value)
              apply(emptyFilters)
            }}
          >
            <option value="" disabled>
              选择 Yak 项目
            </option>
            {sources.data?.sources.map((name) => <option key={name}>{name}</option>)}
          </select>
        )}
        <input
          className="vx-yak-filter-url"
          aria-label="URL"
          placeholder="URL / Host"
          value={filters.url}
          onChange={(event) => setFilters({ ...filters, url: event.target.value })}
        />
        <select aria-label="方法" value={filters.method} onChange={(event) => setFilters({ ...filters, method: event.target.value })}>
          <option value="">全部方法</option>
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE'].map((method) => (
            <option key={method}>{method}</option>
          ))}
        </select>
        <input aria-label="状态码" placeholder="状态码" inputMode="numeric" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} />
        <input aria-label="流量来源" placeholder="来源" value={filters.capture_source} onChange={(event) => setFilters({ ...filters, capture_source: event.target.value })} />
        <input aria-label="内容类型" placeholder="Content-Type" value={filters.content_type} onChange={(event) => setFilters({ ...filters, content_type: event.target.value })} />
        <input aria-label="关键词" placeholder="报文关键词" value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} />
        <input aria-label="标签" placeholder="标签" value={filters.tag} onChange={(event) => setFilters({ ...filters, tag: event.target.value })} />
        <label className="vx-yak-check">
          <input type="checkbox" checked={filters.websocket} onChange={(event) => setFilters({ ...filters, websocket: event.target.checked })} /> 仅 WebSocket
        </label>
        <div className="vx-yak-actions">
          <button type="submit" className="vx-yak-primary" disabled={!available}>
            筛选
          </button>
          <button type="button" onClick={() => apply(emptyFilters)}>
            清除
          </button>
          <button
            type="button"
            onClick={() => {
              setSelected('')
              setRevision((value) => value + 1)
            }}
          >
            刷新
          </button>
        </div>
      </form>

      {sources.error && <p role="alert" className="vx-yak-alert">{sources.error}</p>}
      {!sessionId && sources.data?.sources.length === 0 && <p className="vx-yak-hint">尚未配置 Yak 流量来源：点上方「配置来源」填写工作区与内核 socket，或切到「本地采集」查看 VEXNAR 自己抓到的流量。</p>}
      {list.loading && <p role="status" className="vx-yak-hint">读取流量…</p>}
      {list.error && <p role="alert" className="vx-yak-alert">{list.error}</p>}

      {list.data && (
        <div className="vx-yak-grid">
          <aside aria-label="本页站点">
            <div className="vx-yak-aside-head">
              <strong>本页站点</strong>
              <small>{Object.keys(sites).length}</small>
            </div>
            <div className="vx-yak-aside-list">
              {Object.entries(sites).map(([site, count]) => (
                <button key={site} type="button" title={site} onClick={() => apply({ ...search, url: site })}>
                  <span>{site}</span>
                  <small>{count}</small>
                </button>
              ))}
              {Object.keys(sites).length === 0 && <small className="vx-yak-hint">本页无站点</small>}
            </div>
          </aside>

          <section className="vx-yak-list">
            <div className="vx-yak-table" ref={listRef}>
              <div className="vx-yak-head" style={{ gridTemplateColumns: COLUMNS }}>
                {COLUMN_DEFS.map((column) => (
                  <button
                    key={column.label}
                    type="button"
                    className={column.align === 'end' ? 'vx-yak-th--end' : undefined}
                    aria-sort={
                      column.field && order.order_by === column.field ? (order.ascending ? 'ascending' : 'descending') : undefined
                    }
                    onClick={() => sortBy(column.field)}
                    disabled={!column.field}
                  >
                    {column.label}
                    {column.field && order.order_by === column.field ? (order.ascending ? ' ↑' : ' ↓') : ''}
                  </button>
                ))}
              </div>
              <div className="vx-yak-body" style={{ height: virtual.getTotalSize() }}>
                {virtual.getVirtualItems().map((item) => {
                  const row = rows[item.index]
                  if (!row) return null
                  return (
                    <div
                      key={row.id}
                      className="vx-yak-row"
                      data-selected={row.id === selected}
                      style={{ gridTemplateColumns: COLUMNS, height: ROW_HEIGHT, transform: `translateY(${item.start}px)` }}
                      onClick={() => setSelected(row.id)}
                    >
                      <span className="vx-yak-dim vx-yak-time" title={row.time ? new Date(row.time * 1000).toLocaleString() : ''}>
                        {row.time ? new Date(row.time * 1000).toLocaleTimeString() : '—'}
                      </span>
                      <span>
                        <span className={`vx-method vx-method--${methodClass(row.method)}`}>{row.method}</span>
                      </span>
                      <span>
                        <span className={`vx-status vx-status--${statusClass(row.status)}`}>{row.status || '—'}</span>
                      </span>
                      <button type="button" className="vx-yak-url" title={row.url} onClick={() => setSelected(row.id)}>
                        {row.url}
                      </button>
                      <span className="vx-yak-size-cell">
                        {/* 对数刻度：一页里 577 B 和 45 KB 并存时，线性刻度只剩一条线。 */}
                        <span className="vx-yak-sizebar" data-tone={statusClass(row.status)} title={`${row.bytes} B`}>
                          <i
                            style={{
                              width: `${Math.max(4, Math.round((Math.log10(Math.max(row.bytes, 1)) / Math.log10(Math.max(maxBytes, 10))) * 100))}%`
                            }}
                          />
                        </span>
                        <span className="vx-yak-num">{row.bytes} B</span>
                      </span>
                      <span className="vx-yak-type">{row.websocket ? 'WebSocket' : row.content_type}</span>
                      <span className="vx-yak-dim">{row.source}</span>
                      <span className="vx-yak-dim">{row.ip}</span>
                      <span className="vx-yak-dim" title={row.tags || row.title}>
                        {row.title || row.tags || '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
              {rows.length === 0 && <p className="vx-yak-hint">暂无匹配流量</p>}
            </div>
            <div className="vx-yak-pages">
              <span>
                共 {list.data.total} 条 · 第 {page} / {pages} 页 · 本页 {rows.length} 条
              </span>
              <button type="button" disabled={rows.length === 0} onClick={() => exportRows(rows)}>
                导出本页 CSV
              </button>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => {
                  setPage(page - 1)
                  setSelected('')
                }}
              >
                上一页
              </button>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => {
                  setPage(page + 1)
                  setSelected('')
                }}
              >
                下一页
              </button>
            </div>
          </section>
        </div>
      )}

      {detail.loading && <p role="status" className="vx-yak-hint">读取报文…</p>}
      {detail.error && <p role="alert" className="vx-yak-alert">{detail.error}</p>}
      {detail.data && (
        <section className="vx-yak-detail" key={selected}>
          <header>
            <span className={`vx-method vx-method--${methodClass(detail.data.flow.method)}`}>{detail.data.flow.method}</span>
            <span className={`vx-status vx-status--${statusClass(detail.data.flow.status)}`}>{detail.data.flow.status || '—'}</span>
            <strong>#{detail.data.flow.id}</strong>
            <code className="vx-yak-detail-url">{detail.data.flow.url}</code>
            <button type="button" className="vx-yak-close" onClick={() => setSelected('')}>
              关闭详情
            </button>
          </header>
          <PanelGroup direction="horizontal" className="vx-yak-split" autoSaveId="vexnar-yak-detail-split">
            <Panel defaultSize={50} minSize={20}>
              <PacketPane label="请求" packet={detail.data.request} side="request" />
            </Panel>
            <PanelResizeHandle className="vx-yak-resize" />
            <Panel defaultSize={50} minSize={20}>
              <PacketPane label="响应" packet={detail.data.response} side="response" />
            </Panel>
          </PanelGroup>
        </section>
      )}
    </div>
  )
}
