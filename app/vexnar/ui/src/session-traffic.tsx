// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 会话流量：chat 头部的「抓包」开关与「流量」检查器。
 *
 * 之前这里是一个死胡同：弹窗只认 Yakit 的 History，Yak 没配置就只显示
 * 「此会话的本地项目没有配置对应的 Yak 流量来源」——而实际能抓流量的能力
 * （按 scope 归属的 MITM 采集）一直都在 `/api/sessions/:id/traffic*`。
 *
 * 现在按**归属**组织，而不是按工具组织：
 *   - 归属键是 `session-<id>`，只有本会话抓到的报文会出现在这里；
 *   - 采集状态、代理地址、CA、条数都来自同一个 endpoint 接口；
 *   - Yak 降级为「可选来源」的一行说明，没配置不算错误（红字会让人以为坏了）。
 */
import { useMemo, useState, type ReactNode } from 'react'

import {
  ApiErrorLine, Banner, Button, Card, Chip, DataTable, EmptyState, MethodBadge, Modal, Spacer,
  Split, StatusBadge, TextInput, Toolbar, useCopy, type Column
} from './components/kit.tsx'
import { PacketPair } from './packet-view.tsx'
import { useAction, useQuery } from './data/query.ts'
import { fmtBytes, fmtMs, fmtRelative, fmtTime, statusClass } from './data/format.ts'
import {
  fetchSessionExchange, setSessionCapture, useSessionEndpoint, useSessionTraffic, useYakSources,
  type SessionTrafficRow
} from './data/resources.ts'

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: '2xx', label: '2xx' },
  { value: '3xx', label: '3xx' },
  { value: '4xx', label: '4xx' },
  { value: '5xx', label: '5xx' }
] as const
const METHOD_OPTIONS = [
  { value: '', label: '全部方法' },
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'DELETE', label: 'DELETE' }
] as const

function pathOf(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

/** 行详情：按 scope 校验归属，只允许读本会话的报文。 */
function ExchangeDetail({ sessionId, row }: { sessionId: string; row: SessionTrafficRow }): ReactNode {
  const detail = useQuery(
    `session:exchange:${sessionId}:${row.id}`,
    (signal) => fetchSessionExchange(sessionId, row.id, signal),
    { ttlMs: 60_000 }
  )

  const packets = useMemo(() => {
    const encoder = new TextEncoder()
    const request = detail.data?.req ?? ''
    const response = detail.data?.resp ?? ''
    const responseBytes = encoder.encode(response).length
    return {
      request: { text: request, bytes: encoder.encode(request).length, truncated: false },
      response: { text: response, bytes: responseBytes, truncated: row.respBytes > responseBytes + 256 }
    }
  }, [detail.data, row.respBytes])

  return (
    <Card
      title={<span className="vx-ui-inline-title"><MethodBadge method={row.method} /> {pathOf(row.url)}</span>}
      hint={`${row.host} · ${fmtBytes(row.respBytes)} · ${fmtTime(row.ts)}`}
    >
      {detail.error === undefined ? null : <ApiErrorLine error={detail.error.message} detail={detail.error.detail} onRetry={detail.refresh} />}
      {detail.loading && detail.data === undefined ? <EmptyState title="读取报文…" /> : null}
      {detail.data === undefined ? null : <PacketPair request={packets.request} response={packets.response} />}
    </Card>
  )
}

/** 会话流量检查器：采集状态 + 本会话报文 + 报文详情。 */
export function SessionTrafficAction({ sessionId }: { sessionId?: string }): ReactNode {
  const [open, setOpen] = useState(false)
  const [host, setHost] = useState('')
  const [method, setMethod] = useState('')
  const [status, setStatus] = useState('')
  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState<SessionTrafficRow | null>(null)

  const endpoint = useSessionEndpoint(open ? sessionId ?? null : null)
  const traffic = useSessionTraffic(open ? sessionId ?? null : null, open)
  const yakSources = useYakSources()
  const action = useAction()
  const { copy, copied } = useCopy()

  const rows = useMemo(() => {
    const all = traffic.data?.rows ?? []
    const needle = keyword.trim().toLowerCase()
    return all.filter((row) => {
      if (host.trim() !== '' && !row.host.toLowerCase().includes(host.trim().toLowerCase())) return false
      if (method !== '' && row.method !== method) return false
      if (status !== '' && statusClass(row.status) !== status) return false
      if (needle !== '' && ![row.url, row.host, row.method, row.contentType, String(row.status)].some((field) => field.toLowerCase().includes(needle))) return false
      return true
    })
  }, [traffic.data, host, method, status, keyword])

  if (sessionId === undefined) return null
  const active = endpoint.data?.enabled === true
  const scope = endpoint.data?.scope ?? traffic.data?.scope ?? `session-${sessionId}`
  const yakReady = (yakSources.data ?? []).length > 0

  const columns: ReadonlyArray<Column<SessionTrafficRow>> = [
    { key: 'ts', header: '时间', width: '86px', mono: true, render: (row) => fmtTime(row.ts) },
    { key: 'method', header: '方法', width: '74px', render: (row) => <MethodBadge method={row.method} /> },
    { key: 'status', header: '状态', width: '58px', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'host', header: '主机', width: '142px', mono: true,
      render: (row) => <span className="vx-ui-ellipsis">{row.host}</span>, title: (row) => row.host
    },
    { key: 'path', header: '路径', mono: true, render: (row) => <span className="vx-ui-ellipsis">{pathOf(row.url)}</span>, title: (row) => row.url },
    { key: 'bytes', header: '响应', width: '70px', align: 'right', mono: true, render: (row) => fmtBytes(row.respBytes) },
    { key: 'ms', header: '耗时', width: '62px', align: 'right', mono: true, render: (row) => fmtMs(row.durationMs) }
  ]

  return (
    <>
      <button type="button" title="查看本会话抓到的流量" onClick={() => setOpen(true)}>流量</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        width={1080}
        title="会话流量"
        subtitle={scope}
        meta={<>
          <Chip tone={active ? 'green' : 'neutral'} dot>{active ? '抓包中' : '未抓包'}</Chip>
          <span className="vx-ui-muted">{traffic.data?.rows.length ?? 0} 条</span>
          <span className="vx-ui-muted">最近 {fmtRelative(endpoint.data?.lastTs ?? 0)}</span>
        </>}
        footer={<>
          <Button
            size="sm"
            variant={active ? 'default' : 'primary'}
            busy={action.busy}
            onClick={() => void action.run(
              async () => setSessionCapture(sessionId, active ? 'stop' : 'start'),
              { success: active ? '已停止抓包' : '已开始抓包' }
            )}
          >
            {active ? '停止抓包' : '开始抓包'}
          </Button>
          <Button size="sm" disabled={endpoint.data?.proxy === undefined || endpoint.data.proxy === ''} onClick={() => copy(endpoint.data?.proxy ?? '', '代理地址')}>
            {copied === '代理地址' ? '已复制代理' : '复制代理地址'}
          </Button>
          <Spacer />
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>关闭</Button>
        </>}
      >
        {endpoint.error === undefined ? null : <ApiErrorLine error={endpoint.error.message} detail={endpoint.error.detail} onRetry={endpoint.refresh} />}
        {action.error === '' ? null : <Banner tone="red">{action.error}</Banner>}

        <Split
          main={<>
            <Card
              title="本会话报文"
              hint={rows.length === 0 ? '暂无' : `${rows.length} 条${traffic.data?.hasMore === true ? '（窗口已截断，仅最近 300 条）' : ''}`}
              actions={<Button size="sm" onClick={() => { traffic.refresh(); endpoint.refresh() }}>刷新</Button>}
            >
              <Toolbar>
                <TextInput value={host} onChange={setHost} placeholder="主机 / IP" width={150} />
                <select className="vx-ui-select" value={method} aria-label="方法" onChange={(event) => setMethod(event.target.value)}>
                  {METHOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <select className="vx-ui-select" value={status} aria-label="状态" onChange={(event) => setStatus(event.target.value)}>
                  {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <TextInput value={keyword} onChange={setKeyword} placeholder="URL / 报文关键词" width={210} />
                <Spacer />
                {(host || method || status || keyword)
                  ? <Button size="sm" variant="ghost" onClick={() => { setHost(''); setMethod(''); setStatus(''); setKeyword('') }}>清空</Button>
                  : null}
              </Toolbar>
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(row) => row.id}
                loading={traffic.loading}
                selectedKey={selected?.id}
                onRowClick={(row) => setSelected(selected?.id === row.id ? null : row)}
                maxHeight={288}
                dense
                empty={active
                  ? <EmptyState title="抓包已开启，还没有报文" hint="把客户端或 Agent 的出口指向右侧代理地址，流量会按会话归属到这里" />
                  : (
                    <EmptyState
                      title="本会话还没有抓包"
                      hint="点左下角「开始抓包」只影响这个会话；也可以让 Agent 用 web 引擎直接发请求"
                      action={<Button size="sm" variant="primary" busy={action.busy} onClick={() => void action.run(async () => setSessionCapture(sessionId, 'start'), { success: '已开始抓包' })}>开始抓包</Button>}
                    />
                  )}
              />
            </Card>

            {selected === null ? null : <ExchangeDetail sessionId={sessionId} row={selected} />}
          </>}
          rail={<>
            <Card title="采集端点" hint={active ? '按会话归属' : '未开启'}>
              <dl className="vx-ui-kv">
                <div><dt>归属 scope</dt><dd><code>{scope}</code></dd></div>
                <div><dt>HTTP 代理</dt><dd><code>{endpoint.data?.proxy === undefined || endpoint.data.proxy === '' ? '未就绪' : endpoint.data.proxy}</code></dd></div>
                <div><dt>抓包状态</dt><dd>{active ? `进行中 · ${endpoint.data?.items ?? 0} 条` : '已停止'}</dd></div>
                <div><dt>采集来源</dt><dd>{endpoint.data?.source === undefined || endpoint.data.source === '' ? 'MITM（本机）' : endpoint.data.source}</dd></div>
                <div><dt>最近写入</dt><dd>{fmtRelative(endpoint.data?.lastTs ?? 0)}</dd></div>
              </dl>
              {endpoint.data?.caPemUrl === undefined || endpoint.data.caPemUrl === '' ? null : (
                <a className="vx-ui-link" href={endpoint.data.caPemUrl} target="_blank" rel="noreferrer">下载 CA 证书</a>
              )}
              {active && endpoint.data?.hook !== undefined && endpoint.data.hook !== '' ? (
                <Button size="sm" onClick={() => copy(endpoint.data?.hook ?? '', '注入脚本')}>
                  {copied === '注入脚本' ? '已复制脚本' : '复制 Yakit 注入脚本'}
                </Button>
              ) : null}
            </Card>

            <Card title="来源说明" hint={yakReady ? `${(yakSources.data ?? []).length} 个 Yak 项目` : 'Yak 可选'}>
              <p className="vx-ui-note">
                这个弹窗只显示 <strong>本会话 scope</strong> 抓到的流量，与站点级「流量」页分开计数。
                {yakReady
                  ? '检测到 Yak 项目：可在「流量 → Yak 内核」里按项目浏览历史。'
                  : '没有配置 Yak 内核也不影响采集——抓包由内置 MITM 完成，Yak 只是可选的第二来源。'}
              </p>
            </Card>
          </>}
        />
      </Modal>
    </>
  )
}

