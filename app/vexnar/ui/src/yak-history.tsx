// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'

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
type Packet = { text: string; base64?: string; bytes: number; truncated: boolean }
type Page = { rows: Flow[]; total: number; size: number }
type Exchange = { flow: Flow; request: Packet; response: Packet }
type Format = 'raw' | 'headers' | 'pretty' | 'hex'

function useHistory<T>(body: string | null, revision = 0) {
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>()
  const key = `${revision}:${body}`
  useEffect(() => {
    if (body === null) return
    const controller = new AbortController()
    async function read() {
      try {
        const response = await fetch('/vexnar-api/api/yak/history', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: controller.signal
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
  return { data: result?.key === key ? result.data : undefined, error: result?.key === key ? result.error : undefined, loading: body !== null && result?.key !== key }
}

function packetView(packet: Packet, format: Format) {
  if (format === 'hex') {
    const bytes = atob(packet.base64 ?? '').slice(0, 4096)
    return bytes.match(/[\s\S]{1,16}/g)?.map((line, index) => {
      const hex = Array.from(line, ch => ch.charCodeAt(0).toString(16).padStart(2, '0')).join(' ')
      return `${(index * 16).toString(16).padStart(6, '0')}  ${hex.padEnd(47)}  ${line.replace(/[^\x20-\x7e]/g, '.')}`
    }).join('\n') ?? ''
  }
  const separator = /\r?\n\r?\n/.exec(packet.text)
  const head = separator ? packet.text.slice(0, separator.index) : packet.text
  if (format === 'headers') return head
  if (format !== 'pretty' || !separator) return packet.text
  const body = packet.text.slice(separator.index + separator[0].length)
  try { return head + '\n\n' + JSON.stringify(JSON.parse(body), null, 2) } catch { return packet.text }
}

function PacketPane({ label, packet }: { label: string; packet: Packet }) {
  const [format, setFormat] = useState<Format>('raw')
  const [copied, setCopied] = useState('')
  const text = packetView(packet, format)
  return <section className="vx-yak-packet" aria-label={label}>
    <header>
      <strong>{label}</strong><span>{packet.bytes.toLocaleString()} B</span>
      <select aria-label={`${label}显示格式`} value={format} onChange={event => { setFormat(event.target.value as Format); setCopied('') }}>
        <option value="raw">原文</option><option value="headers">报文头</option>
        <option value="pretty">格式化 JSON</option><option value="hex">HEX（前 4 KiB）</option>
      </select>
      <button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied('已复制') } catch { setCopied('剪贴板不可用') }
      }}>复制</button>
    </header>
    {copied && <small role="status">{copied}</small>}
    {packet.truncated && <small>显示前 128 KiB</small>}
    <pre>{text || '无报文数据'}</pre>
  </section>
}

const emptyFilters = { url: '', method: '', status: '', capture_source: '', content_type: '', keyword: '', tag: '', websocket: false }
function siteName(raw: string) {
  try { return new URL(raw).host } catch { return '' }
}

function exportRows(rows: Flow[]) {
  const cell = (value: string | number) => {
    const text = String(value)
    const escaped = /^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text
    return '"' + escaped.replaceAll('"', '""') + '"'
  }
  const lines = [
    'ID,Method,Status,URL,ResponseBytes,ContentType,Source,IP,Title,Tags,Time',
    ...rows.map(row => [row.id, row.method, row.status, row.url, row.bytes, row.content_type, row.source, row.ip, row.title, row.tags, row.time].map(cell).join(','))
  ]
  const href = URL.createObjectURL(new Blob(['\uFEFF', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = href
  link.download = 'yak-history.csv'
  link.click()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

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
  const sites: Record<string, number> = Object.create(null)
  for (const row of list.data?.rows ?? []) {
    const site = siteName(row.url)
    if (site) sites[site] = (sites[site] ?? 0) + 1
  }
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.size)) : 1

  function apply(next: typeof emptyFilters) {
    setSearch(next)
    setFilters(next)
    setPage(1)
    setSelected('')
  }

  return <div className="vx-yak-history">
    <form className="vx-yak-filters" onSubmit={event => { event.preventDefault(); apply(filters) }}>
      {!sessionId && <select aria-label="Yak 项目" value={source} onChange={event => { setSource(event.target.value); apply(emptyFilters) }}>
        <option value="" disabled>选择 Yak 项目</option>
        {sources.data?.sources.map(name => <option key={name}>{name}</option>)}
      </select>}
      <input aria-label="URL" placeholder="URL" value={filters.url} onChange={event => setFilters({ ...filters, url: event.target.value })} />
      <select aria-label="方法" value={filters.method} onChange={event => setFilters({ ...filters, method: event.target.value })}>
        <option value="">全部方法</option>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE'].map(method => <option key={method}>{method}</option>)}
      </select>
      <input aria-label="状态码" placeholder="状态码" inputMode="numeric" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })} />
      <input aria-label="流量来源" placeholder="来源" value={filters.capture_source} onChange={event => setFilters({ ...filters, capture_source: event.target.value })} />
      <input aria-label="内容类型" placeholder="Content-Type" value={filters.content_type} onChange={event => setFilters({ ...filters, content_type: event.target.value })} />
      <input aria-label="关键词" placeholder="报文关键词" value={filters.keyword} onChange={event => setFilters({ ...filters, keyword: event.target.value })} />
      <input aria-label="标签" placeholder="标签" value={filters.tag} onChange={event => setFilters({ ...filters, tag: event.target.value })} />
      <label><input type="checkbox" checked={filters.websocket} onChange={event => setFilters({ ...filters, websocket: event.target.checked })} /> 仅 WebSocket</label>
      <button type="submit" disabled={!available}>筛选</button>
      <button type="button" onClick={() => apply(emptyFilters)}>清除</button>
      <button type="button" onClick={() => { setSelected(''); setRevision(value => value + 1) }}>刷新</button>
    </form>
    {sources.error && <p role="alert">{sources.error}</p>}
    {!sessionId && sources.data?.sources.length === 0 && <p>尚未配置 Yak 流量来源。</p>}
    {list.loading && <p role="status">读取流量…</p>}
    {list.error && <p role="alert">{list.error}</p>}
    {list.data && <div className="vx-yak-grid">
      <aside aria-label="本页站点">
        <strong>本页站点</strong>
        {Object.entries(sites).map(([site, count]) => <button key={site} type="button" title={site} onClick={() => apply({ ...search, url: site })}>{site} <small>{count}</small></button>)}
      </aside>
      <section className="vx-yak-list">
        <div className="vx-yak-table">
          <table>
            <thead><tr>{([
              ['ID', 'id'], ['方法'], ['状态', 'status_code'], ['URL'], ['响应大小', 'body_length'],
              ['类型'], ['来源'], ['IP'], ['标题'], ['标签'], ['时间', 'created_at']
            ] as const).map(([label, field]) => <th key={label} aria-sort={field && order.order_by === field ? (order.ascending ? 'ascending' : 'descending') : undefined}>
              {field ? <button type="button" onClick={() => {
                setOrder({ order_by: field, ascending: order.order_by === field && !order.ascending })
                setPage(1)
                setSelected('')
              }}>{label}{order.order_by === field ? (order.ascending ? ' ↑' : ' ↓') : ''}</button> : label}
            </th>)}</tr></thead>
            <tbody>{list.data.rows.map(row => <tr key={row.id} data-selected={row.id === selected}>
              <td>{row.id}</td><td>{row.method}</td><td>{row.status || '—'}</td>
              <td><button type="button" className="vx-yak-url" title={row.url} onClick={() => setSelected(row.id)}>{row.url}</button></td>
              <td>{row.bytes} B</td><td>{row.websocket ? 'WebSocket' : row.content_type}</td><td>{row.source}</td><td>{row.ip}</td><td>{row.title}</td><td>{row.tags}</td>
              <td>{row.time ? new Date(row.time * 1000).toLocaleString() : '—'}</td>
            </tr>)}</tbody>
          </table>
          {list.data.rows.length === 0 && <p>暂无匹配流量</p>}
        </div>
        <div className="vx-yak-pages">
          <span>共 {list.data.total} 条 · 第 {page} / {pages} 页</span>
          <button type="button" disabled={list.data.rows.length === 0} onClick={() => exportRows(list.data?.rows ?? [])}>导出本页 CSV</button>
          <button type="button" disabled={page <= 1} onClick={() => { setPage(page - 1); setSelected('') }}>上一页</button>
          <button type="button" disabled={page >= pages} onClick={() => { setPage(page + 1); setSelected('') }}>下一页</button>
        </div>
      </section>
    </div>}
    {detail.loading && <p role="status">读取报文…</p>}
    {detail.error && <p role="alert">{detail.error}</p>}
    {detail.data && <section className="vx-yak-detail" key={selected}>
      <header><strong>#{detail.data.flow.id} · {detail.data.flow.method} {detail.data.flow.status}</strong>
        <button type="button" onClick={() => setSelected('')}>关闭详情</button></header>
      <div className="vx-yak-split">
        <PacketPane label="请求" packet={detail.data.request} />
        <PacketPane label="响应" packet={detail.data.response} />
      </div>
    </section>}
  </div>
}

export function SessionTrafficAction({ sessionId }: { sessionId?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [opened, setOpened] = useState(false)
  useEffect(() => { if (opened && !dialog.current?.open) dialog.current?.showModal() }, [opened])
  if (!sessionId) return null
  return <>
    <button type="button" title="查看此会话项目的 Yak 流量" onClick={() => setOpened(true)}>流量</button>
    {opened && <dialog className="vx-yak-dialog" ref={dialog} onClose={() => setOpened(false)}>
      <header><strong>会话项目流量</strong><button type="button" onClick={() => dialog.current?.close()}>关闭</button></header>
      <YakHistory key={sessionId} sessionId={sessionId} />
    </dialog>}
  </>
}
