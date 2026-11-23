// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 代理池控制台。
 *
 * 这一页之前只有「池/节点/订阅」三个平铺列表，缺的是**运行态**：谁在租用出口、
 * 池的覆盖率够不够、节点失败几次会被摘除、默认池是不是空池。所以这里按运维
 * 视角重排：
 *
 *   KPI      健康率、加权成功率、平均延迟、租约、未入池节点 —— 全部来自
 *            `proxyMetrics()`，与概览同源；
 *   池       卡片带覆盖率进度条与成员数，可直接进「成员管理」增删；
 *   节点     表格 + 行内测速/启停/删除，状态用同一套五档词表；
 *   租约     会话 → 节点 → 到期时间，回答「现在谁在用哪条出口」；
 *   事件     走 SSE，节点健康变化与订阅刷新实时落在这条流里。
 */
import { useMemo, useState, type ReactNode } from 'react'

import {
  ApiErrorLine, Banner, Button, Card, Chip, DataTable, Drawer, EmptyState, Field, KeyValue,
  Kpi, KpiGrid, Meter, PageShell, Select, Spacer, Split, TextArea, TextInput, Toolbar, type Column
} from '../components/kit.tsx'
import { api } from '../data/client.ts'
import { fmtInt, fmtMs, fmtPercent, fmtRelative, fmtRemaining } from '../data/format.ts'
import { proxyMetrics } from '../data/metrics.ts'
import { invalidate } from '../data/query.ts'
import {
  useProxyEventStream, useProxySettings, useProxyState, useProxySubscriptions,
  type NodeHealth, type ProxyNode, type ProxyPool, type ProxySubscription
} from '../data/index.ts'

const HEALTH_LABEL: Record<NodeHealth, string> = {
  up: '可用', degraded: '抖动', down: '不可用', cooldown: '冷却', unknown: '未测'
}
const HEALTH_TONE: Record<NodeHealth, 'green' | 'amber' | 'red' | 'violet' | 'neutral'> = {
  up: 'green', degraded: 'amber', down: 'red', cooldown: 'violet', unknown: 'neutral'
}
const MODE_OPTIONS = [
  { value: 'sticky', label: 'sticky（会话粘性）' },
  { value: 'rotate', label: 'rotate（每次轮换）' },
  { value: 'fanout', label: 'fanout（并发取最快）' }
] as const

type Panel = 'import' | 'pivot' | 'subscribe' | null

export function EgressPanel(): ReactNode {
  const state = useProxyState(true)
  const subscriptions = useProxySubscriptions()
  const settings = useProxySettings()
  const stream = useProxyEventStream(true)

  const [panel, setPanel] = useState<Panel>(null)
  const [memberPool, setMemberPool] = useState<ProxyPool | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // 表单状态
  const [poolName, setPoolName] = useState('')
  const [poolMode, setPoolMode] = useState<'sticky' | 'rotate' | 'fanout'>('sticky')
  const [importText, setImportText] = useState('')
  const [importPool, setImportPool] = useState('0')
  const [pivotHost, setPivotHost] = useState('')
  const [pivotPort, setPivotPort] = useState('1080')
  const [pivotProtocol, setPivotProtocol] = useState<'socks5' | 'http'>('socks5')
  const [pivotName, setPivotName] = useState('')
  const [subName, setSubName] = useState('')
  const [subURL, setSubURL] = useState('')
  const [subPool, setSubPool] = useState('0')

  const pools = state.data?.pools ?? []
  const nodes = state.data?.nodes ?? []
  const leases = state.data?.leases ?? []
  const subs = subscriptions.data ?? []
  const metrics = useMemo(
    () => proxyMetrics(state.data, { subscriptionsDown: subs.filter((row) => row.lastError !== '').length }),
    [state.data, subs]
  )

  async function act(key: string, task: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      await task()
      invalidate('proxy:')
      setNotice(success)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy('')
    }
  }

  const poolNameOf = (id: number): string => pools.find((pool) => pool.id === id)?.name ?? (id === 0 ? '未指定' : `#${id}`)

  const poolColumns: ReadonlyArray<Column<ProxyPool>> = [
    {
      key: 'name', header: '代理池', render: (pool) => (
        <div className="vx-ui-cell-stack">
          <strong>{pool.name}</strong>
          <span className="vx-ui-muted">{pool.mode} · fallback {pool.fallback}</span>
        </div>
      )
    },
    {
      key: 'coverage', header: '覆盖率', width: '160px', render: (pool) => {
        const ratio = pool.nodeCount === 0 ? 0 : pool.healthyCount / pool.nodeCount
        return (
          <div className="vx-ui-cell-stack">
            <Meter value={ratio} tone={ratio >= 0.8 ? 'green' : ratio >= 0.4 ? 'amber' : 'red'} label={`${pool.healthyCount}/${pool.nodeCount}`} />
            <span className="vx-ui-muted">{pool.healthyCount} / {pool.nodeCount} 可用</span>
          </div>
        )
      }
    },
    {
      key: 'members', header: '成员', width: '72px', align: 'right', mono: true,
      render: (pool) => fmtInt(pool.nodeCount)
    },
    {
      key: 'actions', header: '操作', width: '250px', align: 'right', render: (pool) => (
        <div className="vx-ui-row-actions">
          <Button size="sm" busy={busy === `check-${pool.id}`} onClick={() => void act(`check-${pool.id}`, () => api.post(`/api/proxy/pools/${pool.id}/check`, {}), `已测速：${pool.name}`)}>测速</Button>
          <Button size="sm" onClick={() => setMemberPool(pool)}>成员</Button>
          <Button
            size="sm"
            variant={pool.id === state.data?.defaultPool ? 'primary' : 'default'}
            disabled={busy !== '' || pool.id === state.data?.defaultPool}
            onClick={() => void act(`default-${pool.id}`, () => api.put('/api/proxy/settings', { default_pool: pool.id }), `默认池已切到 ${pool.name}`)}
          >
            {pool.id === state.data?.defaultPool ? '默认' : '设默认'}
          </Button>
          <Button size="sm" variant="danger" busy={busy === `del-${pool.id}`} onClick={() => void act(`del-${pool.id}`, () => api.del(`/api/proxy/pools/${pool.id}`), `已删除 ${pool.name}`)}>删除</Button>
        </div>
      )
    }
  ]

  const nodeColumns: ReadonlyArray<Column<ProxyNode>> = [
    {
      key: 'name', header: '节点', width: '180px', render: (node) => (
        <div className="vx-ui-cell-stack">
          <strong>{node.name}</strong>
          <span className="vx-ui-muted">
            {node.viaNodeId ? `经 #${node.viaNodeId} 链式` : node.source || '手动导入'}
            {node.egressIp === '' ? '' : ` · ${node.egressIp}`}
          </span>
        </div>
      )
    },
    {
      key: 'state', header: '状态', width: '86px',
      render: (node) => (
        <Chip tone={node.enabled ? HEALTH_TONE[node.state] : 'neutral'} dot>
          {node.enabled ? HEALTH_LABEL[node.state] : '已停用'}
        </Chip>
      )
    },
    {
      key: 'endpoint', header: '地址', mono: true, width: '210px',
      render: (node) => <span className="vx-ui-ellipsis">{node.protocol}://{node.server}:{node.port}</span>,
      title: (node) => `${node.protocol}://${node.server}:${node.port}`
    },
    { key: 'latency', header: '延迟', width: '76px', align: 'right', mono: true, render: (node) => fmtMs(node.latencyMs) },
    {
      key: 'success', header: '成功率', width: '128px', render: (node) => (
        <div className="vx-ui-cell-stack">
          <Meter value={node.successRate} tone={node.successRate >= 0.9 ? 'green' : node.successRate >= 0.6 ? 'amber' : 'red'} />
          <span className="vx-ui-muted">{fmtPercent(node.successRate)} · {fmtInt(node.requests)} 次</span>
        </div>
      )
    },
    {
      key: 'actions', header: '操作', width: '186px', align: 'right', sticky: true, render: (node) => (
        <div className="vx-ui-row-actions">
          <Button size="sm" busy={busy === `node-check-${node.id}`} onClick={() => void act(`node-check-${node.id}`, () => api.post(`/api/proxy/nodes/${node.id}/check`, {}), `${node.name} 已测速`)}>测速</Button>
          <Button size="sm" onClick={() => void act(`node-toggle-${node.id}`, () => api.patch(`/api/proxy/nodes/${node.id}`, { enabled: !node.enabled }), `${node.name} ${node.enabled ? '已停用' : '已启用'}`)}>
            {node.enabled ? '停用' : '启用'}
          </Button>
          <Button size="sm" variant="danger" busy={busy === `node-del-${node.id}`} onClick={() => void act(`node-del-${node.id}`, () => api.del(`/api/proxy/nodes/${node.id}`), `${node.name} 已删除`)}>删除</Button>
        </div>
      )
    }
  ]

  const subColumns: ReadonlyArray<Column<ProxySubscription>> = [
    {
      key: 'name', header: '订阅', render: (row) => (
        <div className="vx-ui-cell-stack">
          <strong>{row.name}</strong>
          <span className="vx-ui-muted vx-ui-ellipsis">{row.url}</span>
        </div>
      ),
      title: (row) => row.url
    },
    { key: 'pool', header: '导入池', width: '110px', render: (row) => poolNameOf(row.poolId) },
    { key: 'interval', header: '周期', width: '84px', align: 'right', mono: true, render: (row) => `${row.intervalSeconds}s` },
    {
      key: 'delta', header: '上次变化', width: '124px', render: (row) => (
        <span className="vx-ui-muted">+{row.lastAdded} / -{row.lastRemoved}</span>
      )
    },
    {
      key: 'state', header: '状态', width: '120px',
      render: (row) => row.lastError === ''
        ? <Chip tone={row.enabled ? 'green' : 'neutral'} dot>{row.enabled ? '正常' : '停用'}</Chip>
        : <Chip tone="red" dot title={row.lastError}>拉取失败</Chip>
    },
    {
      key: 'actions', header: '操作', width: '150px', align: 'right', render: (row) => (
        <div className="vx-ui-row-actions">
          <Button size="sm" busy={busy === `sub-refresh-${row.id}`} onClick={() => void act(`sub-refresh-${row.id}`, () => api.post(`/api/proxy/subscriptions/${row.id}/refresh`, {}), `${row.name} 已刷新`)}>刷新</Button>
          <Button size="sm" variant="danger" busy={busy === `sub-del-${row.id}`} onClick={() => void act(`sub-del-${row.id}`, () => api.del(`/api/proxy/subscriptions/${row.id}`), `${row.name} 已删除`)}>删除</Button>
        </div>
      )
    }
  ]

  return (
    <PageShell
      title="代理池"
      desc="出口节点、池策略与租约。任务绑定后，Agent 的 Bash/浏览器/复测按池出网。"
      actions={<>
        <Button size="sm" busy={state.refreshing} onClick={() => { state.refresh(); subscriptions.refresh(); settings.refresh() }}>刷新</Button>
        <Button size="sm" variant="primary" onClick={() => setPanel('import')}>导入节点</Button>
      </>}
      status={<>
        <span className={`vx-ui-live${state.data?.enabled === true ? ' is-on' : ''}`}><i />{state.data?.enabled === true ? '网关已启用' : '网关未启用'}</span>
        <Chip tone={state.data?.gateway ? 'blue' : 'neutral'}>HTTP {state.data?.gateway || '—'}</Chip>
        <Chip tone={state.data?.socks ? 'blue' : 'neutral'}>SOCKS {state.data?.socks || '—'}</Chip>
        <Chip tone={state.data?.engineAvailable === true ? 'green' : 'amber'} dot>
          {state.data?.engineAvailable === true ? '引擎就绪' : `引擎不可用${state.data?.engineError ? `：${state.data.engineError}` : ''}`}
        </Chip>
        <Chip tone={stream.connected ? 'green' : 'neutral'} dot>{stream.connected ? '事件流已连接' : '事件流未连接'}</Chip>
        <Spacer />
        {metrics.defaultPoolName === '' ? <span className="vx-ui-bad">未设置默认池</span> : <span className="vx-ui-muted">默认池 {metrics.defaultPoolName}</span>}
      </>}
    >
      {error === '' ? null : <Banner tone="red" onDismiss={() => setError('')}>{error}</Banner>}
      {notice === '' ? null : <Banner tone="green" onDismiss={() => setNotice('')}>{notice}</Banner>}
      {state.error === undefined ? null : (
        <ApiErrorLine
          error={`代理池状态读取失败：${state.error.message}`}
          detail={state.error.detail}
          onRetry={() => state.refresh()}
        />
      )}

      <KpiGrid>
        <Kpi label="节点" value={fmtInt(metrics.nodes)} unit="个" hint={`启用 ${fmtInt(metrics.enabled)}`} tone="blue" />
        <Kpi label="健康率" value={fmtPercent(metrics.healthRate)} hint={`可用 ${metrics.up} · 抖动 ${metrics.degraded} · 不可用 ${metrics.down} · 冷却 ${metrics.cooldown}`} tone={metrics.healthRate >= 0.8 ? 'green' : metrics.healthRate >= 0.4 ? 'amber' : 'red'} />
        <Kpi label="加权成功率" value={metrics.requests === 0 ? '—' : fmtPercent(metrics.successRate)} hint={`${fmtInt(metrics.requests)} 次请求 · ${fmtInt(metrics.failures)} 次失败`} tone={metrics.successRate >= 0.95 || metrics.requests === 0 ? 'green' : 'amber'} />
        <Kpi label="平均延迟" value={metrics.avgLatencyMs === 0 ? '—' : String(metrics.avgLatencyMs)} unit="ms" hint="仅统计已测速节点" tone="violet" />
        <Kpi label="租约" value={fmtInt(metrics.leases)} unit="个" hint="正在被会话占用的出口" tone={metrics.leases > 0 ? 'green' : 'neutral'} />
        <Kpi label="未入池" value={fmtInt(metrics.unpooled)} unit="节点" hint={metrics.unpooled > 0 ? '这些节点不会被任何池调度' : '全部节点已入池'} tone={metrics.unpooled > 0 ? 'amber' : 'green'} />
      </KpiGrid>

      <Split
        main={<>
          <Card
            title="代理池"
            hint={`${metrics.pools} 个 · 默认 ${metrics.defaultPoolName || '未设置'}`}
            actions={<Button size="sm" variant="ghost" onClick={() => setPanel('subscribe')}>新增订阅</Button>}
          >
            <Toolbar>
              <TextInput value={poolName} onChange={setPoolName} placeholder="新池名称，如：国内出口" width={220} />
              <Select value={poolMode} options={MODE_OPTIONS} label="默认模式" onChange={(next) => setPoolMode(next)} />
              <Button
                size="sm"
                variant="primary"
                disabled={poolName.trim() === '' || busy !== ''}
                busy={busy === 'create-pool'}
                onClick={() => void act('create-pool', async () => {
                  await api.post('/api/proxy/pools', { name: poolName.trim(), mode_default: poolMode })
                  setPoolName('')
                }, '池已创建')}
              >
                创建池
              </Button>
            </Toolbar>
            <DataTable
              columns={poolColumns}
              rows={pools}
              rowKey={(pool) => String(pool.id)}
              loading={state.loading}
              dense
              empty={<EmptyState title="还没有代理池" hint="先建一个池，再把节点挂进去；否则节点不会被调度" />}
            />
          </Card>

          <Card
            title="节点"
            hint={`${fmtInt(metrics.nodes)} 个 · 可用 ${metrics.up} · 抖动 ${metrics.degraded} · 不可用 ${metrics.down}`}
            actions={<Button size="sm" onClick={() => setPanel('pivot')}>登记跳板</Button>}
          >
            <DataTable
              columns={nodeColumns}
              rows={nodes}
              rowKey={(node) => String(node.id)}
              loading={state.loading}
              dense
              maxHeight={420}
              empty={<EmptyState title="没有节点" hint="粘贴 URI / Clash YAML 导入，或登记一个渗透跳板" action={<Button size="sm" onClick={() => setPanel('import')}>导入节点</Button>} />}
            />
          </Card>

          <Card title="租约" hint="会话 → 出口节点；到期后由池重新分配">
            <DataTable
              columns={[
                { key: 'session', header: '会话', width: '230px', mono: true, render: (row) => <span className="vx-ui-ellipsis">{row.session}</span>, title: (row) => row.session },
                {
                  key: 'owner', header: '归属', width: '150px',
                  render: (row) => row.taskId === 0 ? <span className="vx-ui-muted">交互式</span> : <span>任务 #{row.taskId}{row.role === '' ? '' : ` · ${row.role}`}</span>
                },
                { key: 'pool', header: '池', width: '120px', render: (row) => row.poolName === '' ? poolNameOf(row.poolId) : row.poolName },
                { key: 'node', header: '节点', width: '150px', render: (row) => row.nodeName === '' ? <span className="vx-ui-muted">未分配</span> : row.nodeName },
                { key: 'mode', header: '模式', width: '86px', mono: true, render: (row) => row.mode },
                { key: 'requests', header: '请求', width: '92px', align: 'right', mono: true, render: (row) => `${fmtInt(row.requests)}${row.failures > 0 ? ` / ✗${row.failures}` : ''}` },
                { key: 'expires', header: '到期', width: '100px', align: 'right', render: (row) => fmtRemaining(row.expiresAt) }
              ]}
              rows={leases}
              rowKey={(row) => row.session}
              dense
              empty={<EmptyState title="没有活跃租约" hint="任务或浏览器出口绑定后才会产生" />}
            />
          </Card>

          <Card title="订阅" hint={`${subs.length} 个来源 · 失败 ${metrics.subscriptionsDown}`}>
            <DataTable
              columns={subColumns}
              rows={subs}
              rowKey={(row) => String(row.id)}
              loading={subscriptions.loading}
              dense
              empty={<EmptyState title="没有订阅" hint="订阅会按期拉取节点并合并进指定池" action={<Button size="sm" onClick={() => setPanel('subscribe')}>新增订阅</Button>} />}
            />
          </Card>
        </>}
        rail={<>
          <Card title="池覆盖率" hint="可用节点 / 池内节点">
            {pools.length === 0 ? <EmptyState title="暂无池" /> : (
              <div className="vx-ui-hbars">
                {pools.map((pool) => {
                  const ratio = pool.nodeCount === 0 ? 0 : pool.healthyCount / pool.nodeCount
                  return (
                    <div key={pool.id} className="vx-ui-hbar vx-ui-hbar--static">
                      <span className="vx-ui-hbar-label" title={pool.name}>{pool.name}</span>
                      <i><b className={`vx-ui-tone-${ratio >= 0.8 ? 'green' : ratio >= 0.4 ? 'amber' : 'red'}`} style={{ width: `${Math.max(3, ratio * 100)}%` }} /></i>
                      <em>{pool.healthyCount}/{pool.nodeCount}</em>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <Card title="实时事件" hint={stream.connected ? 'SSE 已连接' : '未连接（5s 轮询兜底）'} scroll>
            {stream.events.length === 0 ? <EmptyState title="暂无事件" hint="节点健康变化、订阅刷新会出现在这里" /> : (
              <div className="vx-ui-events">
                {stream.events.map((event, index) => (
                  <div key={`${event.at}-${index}`} className="vx-ui-event">
                    <code>{event.type}</code>
                    <span>{event.message === '' ? (event.state === '' ? `#${event.nodeId}` : `节点 #${event.nodeId} → ${event.state}`) : event.message}</span>
                    <em>{fmtRelative(event.at)}</em>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="入口" hint="所有出口都经本机回环网关">
            <KeyValue rows={[
              { label: 'HTTP 网关', value: <code>{state.data?.gateway || '—'}</code> },
              { label: 'SOCKS5', value: <code>{state.data?.socks || '—'}</code> },
              { label: '默认池', value: metrics.defaultPoolName || '未设置' },
              { label: '监听认证', value: settings.data?.listenerAuth === true ? '已开启' : '未开启' },
              { label: 'fanout 预算', value: settings.data === undefined ? '—' : `${fmtInt(settings.data.fanoutBudgetPerHour)} / 小时` }
            ]} />
          </Card>
        </>}
      />

      <Drawer
        open={panel === 'import'}
        onClose={() => setPanel(null)}
        title="导入节点"
        subtitle="单行 URI（socks5:// / http:// / ss:// / vmess:// …）或 Clash proxies YAML"
        footer={<>
          <Button
            size="sm"
            variant="primary"
            disabled={importText.trim() === '' || busy !== ''}
            busy={busy === 'import'}
            onClick={() => void act('import', async () => {
              const poolId = Number(importPool) || undefined
              await api.post('/api/proxy/nodes/import', poolId === undefined ? { text: importText } : { text: importText, pool_id: poolId })
              setImportText('')
              setPanel(null)
            }, '节点已导入')}
          >
            导入
          </Button>
          <Spacer />
          <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>取消</Button>
        </>}
      >
        <Field label="目标池" hint="不选则只入库、不参与调度">
          <Select
            value={importPool}
            label="目标池"
            options={[{ value: '0', label: '不加入池' }, ...pools.map((pool) => ({ value: String(pool.id), label: pool.name }))]}
            onChange={(next) => setImportPool(next)}
          />
        </Field>
        <Field label="节点内容">
          <TextArea value={importText} rows={10} mono onChange={setImportText} placeholder={'socks5://user:pass@1.2.3.4:1080#node-a\nhttp://5.6.7.8:8080#node-b'} />
        </Field>
      </Drawer>

      <Drawer
        open={panel === 'pivot'}
        onClose={() => setPanel(null)}
        width={560}
        title="登记渗透跳板"
        subtitle="拿到 SSH -D / CobaltStrike SOCKS 后立刻入池，可经现有节点链式拨号"
        footer={<>
          <Button
            size="sm"
            variant="primary"
            disabled={pivotHost.trim() === '' || busy !== ''}
            busy={busy === 'pivot'}
            onClick={() => void act('pivot', async () => {
              await api.post('/api/proxy/pivots', {
                protocol: pivotProtocol,
                server: pivotHost.trim(),
                port: Number(pivotPort) || 1080,
                name: pivotName.trim() || undefined
              })
              setPivotHost('')
              setPivotName('')
              setPanel(null)
            }, '跳板已入池')}
          >
            登记
          </Button>
          <Spacer />
          <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>取消</Button>
        </>}
      >
        <div className="vx-ui-form-grid">
          <Field label="协议">
            <Select
              value={pivotProtocol}
              label="协议"
              options={[{ value: 'socks5', label: 'SOCKS5' }, { value: 'http', label: 'HTTP' }]}
              onChange={(next) => setPivotProtocol(next)}
            />
          </Field>
          <Field label="主机"><TextInput value={pivotHost} onChange={setPivotHost} placeholder="10.10.10.20" mono /></Field>
          <Field label="端口"><TextInput value={pivotPort} onChange={setPivotPort} placeholder="1080" mono /></Field>
          <Field label="名称（可选）"><TextInput value={pivotName} onChange={setPivotName} placeholder="kali-ssh-d" /></Field>
        </div>
      </Drawer>

      <Drawer
        open={panel === 'subscribe'}
        onClose={() => setPanel(null)}
        width={560}
        title="新增订阅"
        subtitle="按期拉取节点清单并合并进指定池"
        footer={<>
          <Button
            size="sm"
            variant="primary"
            disabled={subName.trim() === '' || subURL.trim() === '' || busy !== ''}
            busy={busy === 'subscribe'}
            onClick={() => void act('subscribe', async () => {
              await api.post('/api/proxy/subscriptions', {
                name: subName.trim(),
                url: subURL.trim(),
                pool_id: Number(subPool) || 0
              })
              setSubName('')
              setSubURL('')
              setPanel(null)
            }, '订阅已创建')}
          >
            创建
          </Button>
          <Spacer />
          <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>取消</Button>
        </>}
      >
        <Field label="名称"><TextInput value={subName} onChange={setSubName} placeholder="机场 A" /></Field>
        <Field label="订阅 URL"><TextInput value={subURL} onChange={setSubURL} placeholder="https://…" mono /></Field>
        <Field label="导入到池">
          <Select
            value={subPool}
            label="导入到池"
            options={[{ value: '0', label: '不自动加入' }, ...pools.map((pool) => ({ value: String(pool.id), label: pool.name }))]}
            onChange={(next) => setSubPool(next)}
          />
        </Field>
      </Drawer>

      <Drawer
        open={memberPool !== null}
        onClose={() => setMemberPool(null)}
        width={640}
        title={`成员管理 · ${memberPool?.name ?? ''}`}
        subtitle="勾选即加入池；取消勾选即移出。池外节点不会被该池调度。"
        footer={<Button size="sm" variant="ghost" onClick={() => setMemberPool(null)}>完成</Button>}
      >
        {memberPool === null ? null : (
          <div className="vx-ui-member-list">
            {nodes.length === 0 ? <EmptyState title="没有节点" hint="先导入节点" /> : nodes.map((node) => {
              const member = memberPool.members.includes(node.id)
              return (
                <label key={node.id} className={`vx-ui-member${member ? ' is-on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={member}
                    disabled={busy !== ''}
                    onChange={() => void act(`member-${node.id}`, async () => {
                      if (member) await api.del(`/api/proxy/pools/${memberPool.id}/nodes/${node.id}`)
                      else await api.post(`/api/proxy/pools/${memberPool.id}/nodes`, { node_ids: [node.id] })
                      // 重新拉一次池，成员勾选状态以服务端为准。
                      const next = await api.get<Array<Record<string, unknown>>>('/api/proxy/pools')
                      const fresh = next.find((row) => Number(row['id']) === memberPool.id)
                      if (fresh !== undefined) {
                        const members = Array.isArray(fresh['members']) ? (fresh['members'] as unknown[]).map(Number) : []
                        setMemberPool({ ...memberPool, members })
                      }
                    }, member ? '已移出池' : '已加入池')}
                  />
                  <span className="vx-ui-member-main">
                    <strong>{node.name}</strong>
                    <em>{node.protocol}://{node.server}:{node.port}</em>
                  </span>
                  <Chip tone={node.enabled ? HEALTH_TONE[node.state] : 'neutral'} dot>{node.enabled ? HEALTH_LABEL[node.state] : '停用'}</Chip>
                </label>
              )
            })}
          </div>
        )}
      </Drawer>
    </PageShell>
  )
}
