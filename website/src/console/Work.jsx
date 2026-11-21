// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/UI.jsx';
import { Badge, Chips, DataTable, EmptyState, KV, Meter, Panel, Tabs } from './primitives.jsx';
import { approvals, assetTree, commandRuns, findings, graph, graphLegend, llmRecords, reportDraft, syncSources, traffic, workspaceFiles } from './data.js';

const sevTone = level => (level === '高危' ? 'red' : level === '中危' ? 'amber' : 'slate');
const statusTone = status => (/已验证|已修复|已完成|已同步/.test(status) ? 'green' : /验证中|探索中|已提交/.test(status) ? 'blue' : /待复验|暂停/.test(status) ? 'amber' : 'slate');

function ViewHead({ eyebrow, title, sub, actions }) {
  return <div className="cx-view-head">
    <div>{eyebrow && <span className="cx-eyebrow">{eyebrow}</span>}<h1>{title}</h1>{sub && <p>{sub}</p>}</div>
    {actions && <div className="cx-view-actions">{actions}</div>}
  </div>;
}

/* ------------------------------- 任务 ------------------------------- */
export function Tasks({ notify, onCreateTask, rows, setRows }) {
  const [active, setActive] = useState(rows[0]?.id || 'T-2407');
  const [tab, setTab] = useState('overview');
  const task = rows.find(row => row.id === active) || rows[0];
  const toggle = () => {
    setRows(list => list.map(row => row.id === task.id ? { ...row, status: row.status === '暂停' ? '探索中' : '暂停' } : row));
    notify(`任务 ${task.id} 已${task.status === '暂停' ? '恢复' : '暂停'}（演示）`);
  };
  const wide = tab === 'chain';
  return <div className="cx-view">
    <ViewHead eyebrow="任务" title="任务编排与执行状态" sub="每个任务运行独立的规划循环与 Worker 池，结果写回探索图与资产图。" actions={<button type="button" className="cx-btn cx-btn-primary" onClick={onCreateTask}><Icon name="plus" size={14} />新建任务</button>} />
    <div className={`cx-split cx-split-wide ${wide ? 'cx-split-single' : ''}`}>
      {!wide && <Panel title="任务列表" sub={`${rows.length} 个任务 · 点击查看详情`} bodyClass="cx-tight">
        <DataTable
          dense
          rowKey="id"
          selected={task.id}
          onSelect={setActive}
          columns={[
            { key: 'id', title: '编号', width: '68px', mono: true },
            { key: 'name', title: '任务' },
            { key: 'status', title: '状态', width: '76px', render: row => <Badge tone={statusTone(row.status)}>{row.status}</Badge> },
            { key: 'findings', title: '发现', width: '52px', align: 'right' }
          ]}
          rows={rows}
        />
      </Panel>}
      <Panel title={task.name} sub={`${task.id} · ${task.category} · ${task.profile}`} actions={<button type="button" className="cx-btn cx-btn-ghost" onClick={toggle}><Icon name={task.status === '暂停' ? 'play' : 'pause'} size={14} />{task.status === '暂停' ? '恢复' : '暂停'}</button>}>
        <Tabs label="任务详情" value={tab} onChange={setTab} items={[['overview', '总览'], ['chain', '探索链路'], ['findings', '发现'], ['assets', '测试资产'], ['approvals', '拦截审批'], ['report', '报告']]} />
        <div className="cx-tab-body">
          {tab === 'overview' && <>
            <div className="cx-kv-grid">
              <KV k="目标" v={task.name} />
              <KV k="任务目标描述" v={task.id === 'T-2407' ? '拿到后台权限并确认越权读取面' : '按范围完成本轮验证'} />
              <KV k="模板" v={task.category} />
              <KV k="模型" v={task.profile} />
              <KV k="运行时长" v={task.elapsed} mono />
              <KV k="创建时间" v={task.created} mono />
            </div>
            <div className="cx-stat-row">
              {[['意图', task.intents], ['事实', task.facts], ['发现', task.findings], ['资产', task.assets]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}
            </div>
            <p className="cx-note">任务状态为演示值。真实任务由 Manager 管理生命周期，Engine 运行规划循环，Worker 领取意图执行。</p>
          </>}
          {tab === 'chain' && <GraphBoard notify={notify} />}
          {tab === 'findings' && <div className="cx-stack">{findings.slice(0, 4).map(item => <div key={item.id} className="cx-rowline"><Badge tone={sevTone(item.severity)}>{item.severity}</Badge><b>{item.title}</b><span>{item.target}</span></div>)}</div>}
          {tab === 'assets' && <div className="cx-stack">{assetTree[0].children.map(item => <div key={item.id} className="cx-rowline"><Badge tone="blue">{item.kind}</Badge><b>{item.name}</b><span>{item.detail.slice(0, 34)}…</span></div>)}</div>}
          {tab === 'approvals' && <div className="cx-stack">{approvals.slice(0, 4).map(item => <div key={item.id} className="cx-rowline"><Badge tone={item.state === 'pending' ? 'amber' : item.state === 'approved' ? 'green' : 'red'}>{item.state === 'pending' ? '待审批' : item.state === 'approved' ? '已允许' : '已拒绝'}</Badge><b>{item.id}</b><span>{item.target}</span></div>)}</div>}
          {tab === 'report' && <pre className="cx-report">{reportDraft}</pre>}
        </div>
      </Panel>
    </div>
  </div>;
}

/* ---------------------------- 探索图 ---------------------------- */
const typeTone = { 起点: 'slate', 目标: 'green', 意图: 'blue', 事实: 'amber', 漏洞: 'red', 提示: 'violet' };
const edgeTone = { 派生: 'green', 意图链: 'blue', 产出: 'amber', 证明: 'red', 提示: 'violet' };
const NODE_W = 160, NODE_H = 54;

function edgePath(from, to) {
  const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2;
  const x2 = to.x, y2 = to.y + NODE_H / 2;
  const bend = Math.max(36, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function GraphBoard({ notify }) {
  const [selected, setSelected] = useState('g1');
  const [zoom, setZoom] = useState(1);
  const node = graph.nodes.find(entry => entry.id === selected);
  const neighbours = new Set(graph.edges.filter(([a, b]) => a === selected || b === selected).flatMap(([a, b]) => [a, b]));
  return <div className="cx-graph">
    <div className="cx-graph-toolbar">
      <div className="cx-graph-legend">{graphLegend.map(item => <span key={item.type}><i className={`cx-graph-dot cx-graph-${item.tone}`} />{item.type}</span>)}
        <span><i className="cx-graph-line" />关系边</span>
      </div>
      <div className="cx-graph-zoom">
        <button type="button" className="cx-icon-btn" aria-label="缩小" onClick={() => setZoom(value => Math.max(0.7, Number((value - 0.1).toFixed(1))))}><Icon name="minus" size={13} /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" className="cx-icon-btn" aria-label="放大" onClick={() => setZoom(value => Math.min(1.3, Number((value + 0.1).toFixed(1))))}><Icon name="plus" size={13} /></button>
        <button type="button" className="cx-btn cx-btn-ghost" onClick={() => setZoom(1)}><Icon name="expand" size={12} />适配</button>
      </div>
    </div>
    <div className="cx-graph-view">
      <div className="cx-graph-board" style={{ transform: `scale(${zoom})` }}>
        <svg viewBox="0 0 1000 560" className="cx-graph-edges" aria-hidden="true">
          {graph.edges.map(([a, b, relation]) => {
            const from = graph.nodes.find(entry => entry.id === a), to = graph.nodes.find(entry => entry.id === b);
            const lit = a === selected || b === selected;
            return <path key={`${a}-${b}`} d={edgePath(from, to)} className={`cx-edge cx-edge-${edgeTone[relation]} ${lit ? 'is-lit' : ''}`} />;
          })}
        </svg>
        {graph.nodes.map(entry => <button
          type="button"
          key={entry.id}
          className={`cx-graph-node cx-graph-${typeTone[entry.type]} ${entry.id === selected ? 'is-active' : ''} ${neighbours.has(entry.id) && entry.id !== selected ? 'is-near' : ''}`}
          style={{ left: `${(entry.x / 1000) * 100}%`, top: `${(entry.y / 560) * 100}%` }}
          onClick={() => setSelected(entry.id)}
          title={`${entry.type} · ${entry.label}`}
        >
          <span>{entry.type}<em>{entry.sub}</em></span>
          <b>{entry.label}</b>
        </button>)}
      </div>
    </div>
    {node && <div className="cx-graph-detail">
      <Badge tone={typeTone[node.type]}>{node.type}</Badge>
      <b>{node.label}</b>
      <p>{node.detail}</p>
      <span className="cx-graph-rel">关联边 {graph.edges.filter(([a, b]) => a === node.id || b === node.id).map(([a, b, rel]) => `${a}→${b} ${rel}`).join(' · ') || '—'}</span>
      <button type="button" className="cx-link" onClick={() => notify(`${node.sub} 的完整记录在「发现」与「工具执行」中`)}>查看来源记录<Icon name="chevronRight" size={12} /></button>
    </div>}
  </div>;
}

/* ------------------------------- 发现 ------------------------------- */
export function Findings({ notify }) {
  const [rows, setRows] = useState(findings);
  const [severity, setSeverity] = useState('全部');
  const [status, setStatus] = useState('全部');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(findings[0].id);
  const filtered = rows.filter(row => (severity === '全部' || row.severity === severity) && (status === '全部' || row.status === status) && `${row.title} ${row.target} ${row.detail}`.toLowerCase().includes(query.toLowerCase()));
  const item = rows.find(row => row.id === active) || filtered[0];
  const retest = () => {
    setRows(list => list.map(row => row.id === item.id ? { ...row, status: '验证中' } : row));
    notify(`${item.id} 已转入复验队列（演示）`);
    setTimeout(() => {
      setRows(list => list.map(row => row.id === item.id ? { ...row, status: '已验证' } : row));
      notify(`${item.id} 复验完成：结论保持不变`);
    }, 2200);
  };
  return <div className="cx-view">
    <ViewHead eyebrow="发现" title="候选与已验证结论分开记录" sub="提交发现触发独立复验会话；复验结论不会覆盖原始候选。" />
    <div className="cx-filterbar">
      <Chips items={['全部', '高危', '中危', '低危']} value={severity} onChange={setSeverity} label="严重级别" />
      <Chips items={['全部', '已验证', '验证中', '待复验', '已提交', '已修复']} value={status} onChange={setStatus} label="状态" />
      <label className="cx-search"><Icon name="search" size={14} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题、目标或描述" aria-label="搜索发现" /></label>
    </div>
    <div className="cx-split">
      <Panel title="发现列表" sub={`${filtered.length} / ${rows.length} 条`} bodyClass="cx-tight">
        <DataTable
          dense
          rows={filtered}
          selected={item?.id}
          onSelect={setActive}
          empty="没有符合筛选条件的发现。"
          columns={[
            { key: 'severity', title: '级别', width: '64px', render: row => <Badge tone={sevTone(row.severity)}>{row.severity}</Badge> },
            { key: 'title', title: '标题' },
            { key: 'target', title: '目标', width: '150px' },
            { key: 'status', title: '状态', width: '78px', render: row => <Badge tone={statusTone(row.status)}>{row.status}</Badge> }
          ]}
        />
      </Panel>
      {item ? <Panel title={item.title} sub={`${item.id} · ${item.cwe} · ${item.agent}`} actions={<button type="button" className="cx-btn cx-btn-primary" onClick={retest} disabled={item.status === '验证中'}><Icon name="refresh" size={13} />{item.status === '验证中' ? '复验中…' : '转入复验'}</button>}>
        <div className="cx-kv-grid">
          <KV k="严重级别" v={item.severity} />
          <KV k="状态" v={item.status} />
          <KV k="目标" v={item.target} />
          <KV k="所属任务" v={item.scope} />
          <KV k="证据" v={item.evidence} />
          <KV k="提交时间" v={item.time} />
        </div>
        <p className="cx-detail-text">{item.detail}</p>
        <div className="cx-callout"><Icon name="shield" size={14} /><span>验证范围：仅只读接口与最小化载荷，不导出真实数据。</span></div>
      </Panel> : <EmptyState text="选择左侧任意发现查看详情。" />}
    </div>
  </div>;
}

/* ------------------------------- 流量 ------------------------------- */
export function Traffic() {
  const [method, setMethod] = useState('全部');
  const [active, setActive] = useState(traffic[0].id);
  const [tab, setTab] = useState('request');
  const rows = traffic.filter(row => method === '全部' || row.method === method);
  const item = traffic.find(row => row.id === active) || rows[0];
  return <div className="cx-view">
    <ViewHead eyebrow="流量" title="记录型代理保留的请求与响应" sub="每次工具调用都落一份可回看的请求/响应证据，供复核与报告引用。" />
    <div className="cx-filterbar">
      <Chips items={['全部', 'GET', 'POST', 'OPTIONS']} value={method} onChange={setMethod} label="请求方法" />
      <span className="cx-filter-note">共 {rows.length} 条 · 最近 7 小时</span>
    </div>
    <div className="cx-split cx-split-wide">
      <Panel title="请求列表" sub="点击查看请求与响应" bodyClass="cx-tight">
        <DataTable dense rows={rows} selected={item?.id} onSelect={setActive} columns={[
          { key: 'method', title: '方法', width: '62px', mono: true },
          { key: 'path', title: '路径', render: row => <span>{row.host}<b>{row.path}</b></span> },
          { key: 'status', title: '状态', width: '52px', align: 'right', render: row => <Badge tone={row.status < 300 ? 'green' : row.status < 400 ? 'amber' : 'red'}>{row.status}</Badge> },
          { key: 'ms', title: '耗时', width: '58px', align: 'right', mono: true }
        ]} />
      </Panel>
      {item && <Panel title={`${item.method} ${item.path}`} sub={`${item.host} · ${item.ms}ms · ${item.size} · ${item.agent}`} actions={item.finding ? <Badge tone="red">{item.finding}</Badge> : <Badge tone="slate">未关联发现</Badge>}>
        <Tabs items={[['request', '请求'], ['response', '响应'], ['evidence', '证据']]} value={tab} onChange={setTab} label="流量视图" />
        <pre className="cx-code cx-code-block">{tab === 'request' ? item.request : tab === 'response' ? item.response : `# 证据元数据\nrequest_id: ${item.id}\ntask: T-2407\nagent: ${item.agent}\nrecorded_at: 2026-07-25 20:14:41 +08:00\nhash: sha256:${item.id}9f2c…\nlinked_finding: ${item.finding || '—'}`}</pre>
        <p className="cx-note">演示数据。真实环境中该内容来自记录型代理，凭据与会话令牌在落盘前脱敏。</p>
      </Panel>}
    </div>
  </div>;
}

/* ---------------------------- 工具执行 ---------------------------- */
export function Commands() {
  const [active, setActive] = useState(commandRuns[0].id);
  const item = commandRuns.find(row => row.id === active) || commandRuns[0];
  return <div className="cx-view">
    <ViewHead eyebrow="工具执行" title="每次工具调用都有输入、输出与耗时" sub="工具结果回到会话；事实、资产和发现经 ToolSet 写入图中。" />
    <div className="cx-split">
      <Panel title="调用记录" sub={`${commandRuns.length} 次调用 · 包含一次 MCP 超时`} bodyClass="cx-tight">
        <DataTable dense rows={commandRuns} selected={item.id} onSelect={setActive} columns={[
          { key: 'tool', title: '工具', width: '112px', mono: true },
          { key: 'summary', title: '调用' },
          { key: 'status', title: '结果', width: '56px', render: row => <Badge tone={row.status === 'ok' ? 'green' : 'red'}>{row.status === 'ok' ? '成功' : '错误'}</Badge> }
        ]} />
      </Panel>
      <Panel title={item.tool} sub={`${item.agent} · ${item.duration} · ${item.time}`} actions={<button type="button" className="cx-btn cx-btn-ghost" onClick={() => navigator?.clipboard?.writeText?.(item.summary)}><Icon name="copy" size={13} />复制调用</button>}>
        <span className="cx-io-label">调用参数</span>
        <pre className="cx-code">{item.summary}</pre>
        <span className="cx-io-label">结果</span>
        <pre className={`cx-code ${item.status === 'error' ? 'cx-code-error' : 'cx-code-out'}`}>{item.output}</pre>
        <p className="cx-note">错误以工具结果返回，不会中断任务循环。MCP 超时会记录重试与耗时。</p>
      </Panel>
    </div>
  </div>;
}

/* --------------------------- LLM 录制 --------------------------- */
export function LlmRecords() {
  const [active, setActive] = useState(llmRecords[0].id);
  const item = llmRecords.find(row => row.id === active) || llmRecords[0];
  const totalCache = llmRecords.reduce((sum, row) => sum + Number.parseFloat(row.cached), 0);
  return <div className="cx-view">
    <ViewHead eyebrow="LLM 录制" title="模型调用账本" sub="按 Agent 记录输入、缓存命中、输出与延迟；凭据只存在于 Go 服务端。" />
    <div className="cx-stats cx-stats-4">
      {[['调用次数', '4', '本次任务'], ['缓存读取', `${totalCache.toFixed(1)}k`, '占输入 71%'], ['平均延迟', '4.3s', '含 1 次重试'], ['错误', '0', '近 24 小时']].map(([label, value, sub]) => <div key={label} className="cx-stat"><div className="cx-stat-top"><span>{label}</span><Icon name="radio" size={15} /></div><strong>{value}</strong><small>{sub}</small></div>)}
    </div>
    <Panel title="调用明细" sub="点击行查看请求画像" bodyClass="cx-tight">
      <DataTable dense rows={llmRecords} selected={item.id} onSelect={setActive} columns={[
        { key: 'agent', title: 'Agent', width: '92px' },
        { key: 'model', title: '模型', width: '150px', mono: true },
        { key: 'input', title: '输入', width: '76px', align: 'right', mono: true },
        { key: 'cached', title: '缓存', width: '76px', align: 'right', mono: true },
        { key: 'output', title: '输出', width: '72px', align: 'right', mono: true },
        { key: 'latency', title: '延迟', width: '62px', align: 'right', mono: true },
        { key: 'time', title: '时间', width: '66px', align: 'right' }
      ]} />
    </Panel>
    <div className="cx-grid-2">
      <Panel title={item.agent} sub={`${item.profile} · ${item.model}`}>
        <div className="cx-kv-grid">
          <KV k="输入 tokens" v={item.input} mono />
          <KV k="缓存读取" v={item.cached} mono />
          <KV k="输出 tokens" v={item.output} mono />
          <KV k="延迟" v={item.latency} mono />
          <KV k="重试" v={String(item.retries)} />
          <KV k="时间" v={item.time} />
        </div>
      </Panel>
      <Panel title="Provider 策略" sub="服务端复用与故障转移">
        <ul className="cx-bullets">
          <li>Provider 按配置 ID 与代际复用；配置保存或激活后失效重解析。</li>
          <li>故障转移链共享进程级熔断状态，绑定配置默认保持独占。</li>
          <li>上游地址与密钥只在 Go 进程内使用，界面只显示 profile 名称。</li>
        </ul>
      </Panel>
    </div>
  </div>;
}

/* ------------------------------ 资产 ------------------------------ */
function TreeNode({ node, depth, expanded, toggleExpanded, selected, onSelect }) {
  const hasChildren = Boolean(node.children?.length);
  const open = expanded[node.id] ?? depth < 2;
  return <div className="cx-tree-node">
    <div className={`cx-tree-row ${selected === node.id ? 'is-active' : ''}`} style={{ paddingLeft: `${8 + depth * 16}px` }}>
      <button type="button" className="cx-tree-toggle" aria-label={hasChildren ? (open ? '收起' : '展开') : '无子节点'} onClick={() => hasChildren && toggleExpanded(node.id)} disabled={!hasChildren}>
        <Icon name={hasChildren ? 'chevronRight' : 'dot'} size={12} className={open ? 'is-open' : ''} />
      </button>
      <button type="button" className="cx-tree-label" onClick={() => onSelect(node.id)}>
        <Icon name={node.kind === '域名' ? 'network' : node.kind === '端点' ? 'code' : node.kind === '服务' ? 'cpu' : 'cloud'} size={14} />
        <span>{node.name}</span>
        <em>{node.kind}</em>
      </button>
    </div>
    {hasChildren && open && node.children.map(child => <TreeNode key={child.id} node={child} depth={depth + 1} expanded={expanded} toggleExpanded={toggleExpanded} selected={selected} onSelect={onSelect} />)}
  </div>;
}

export function Assets({ notify }) {
  const [expanded, setExpanded] = useState({});
  const [selected, setSelected] = useState('admin.acme.test');
  const flat = useMemo(() => {
    const list = [];
    const walk = node => { list.push(node); node.children?.forEach(walk); };
    assetTree.forEach(walk);
    return list;
  }, []);
  const node = flat.find(entry => entry.id === selected) || flat[0];
  const related = findings.filter(item => item.target.includes(node.name) || node.name.includes(item.target));
  return <div className="cx-view">
    <ViewHead eyebrow="资产" title="跨任务共享的资产图" sub="域名、服务、应用与端点在全局资产图归并；探索锚点把任务过程连接到资产对象。" actions={<button type="button" className="cx-btn" onClick={() => notify('资产同步入口在左侧「资产同步」')}><Icon name="refresh" size={13} />同步资产</button>} />
    <div className="cx-split">
      <Panel title="资产树" sub={`${flat.length} 个节点 · 点击展开`} bodyClass="cx-tight">
        <div className="cx-tree">
          {assetTree.map(root => <TreeNode key={root.id} node={root} depth={0} expanded={expanded} toggleExpanded={id => setExpanded(map => ({ ...map, [id]: !(map[id] ?? true) }))} selected={selected} onSelect={setSelected} />)}
        </div>
      </Panel>
      <Panel title={node.name} sub={`${node.kind} · 首次发现于 T-2407`} actions={<Badge tone="blue">资产锚点</Badge>}>
        <p className="cx-detail-text">{node.detail}</p>
        <div className="cx-kv-grid">
          <KV k="资产类型" v={node.kind} />
          <KV k="所属主域" v="acme.test" />
          <KV k="关联发现" v={String(related.length)} />
          <KV k="关联任务" v="T-2407 · T-2406" />
        </div>
        <p className="cx-subhead">关联发现</p>
        {related.length ? <div className="cx-stack">{related.map(item => <div key={item.id} className="cx-rowline"><Badge tone={sevTone(item.severity)}>{item.severity}</Badge><b>{item.title}</b><span>{item.status}</span></div>)}</div> : <p className="cx-note">该节点暂无关联发现。</p>}
        <p className="cx-subhead">探索锚点</p>
        <div className="cx-anchor-list">
          {['fact #f01 后台技术栈', 'fact #f04 菜单不区分角色', 'vuln F-101 默认口令'].map(item => <span key={item}><Icon name="pin" size={12} />{item}</span>)}
        </div>
      </Panel>
    </div>
  </div>;
}

/* ---------------------------- 资产同步 ---------------------------- */
export function Sync({ notify }) {
  const [rows, setRows] = useState(syncSources);
  const [progress, setProgress] = useState({});
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const run = row => {
    if (progress[row.id]) return;
    setProgress(map => ({ ...map, [row.id]: 12 }));
    [30, 62, 88].forEach((value, index) => timers.current.push(setTimeout(() => setProgress(map => ({ ...map, [row.id]: value })), 260 * (index + 1))));
    timers.current.push(setTimeout(() => {
      setRows(list => list.map(item => item.id === row.id ? { ...item, state: '已同步', rows: item.rows || 64, time: '刚刚' } : item));
      setProgress(map => { const next = { ...map }; delete next[row.id]; return next; });
      notify(`${row.name} 同步完成（演示）`);
    }, 1300));
  };
  return <div className="cx-view">
    <ViewHead eyebrow="资产同步" title="把外部清单并入资产图" sub="同步只做归并与去重，不主动探测；行数与时间均为演示数据。" actions={<button type="button" className="cx-btn cx-btn-primary" onClick={() => rows.forEach(run)}><Icon name="refresh" size={13} />全部同步</button>} />
    <div className="cx-cards-3">
      {rows.map(row => <Panel key={row.id} title={row.name} sub={`${row.kind} · ${row.state}`} actions={<Badge tone={statusTone(row.state)}>{row.state}</Badge>}>
        <div className="cx-sync-body">
          <div><span>记录数</span><b>{row.rows || '—'}</b></div>
          <div><span>上次同步</span><b>{row.time}</b></div>
        </div>
        {progress[row.id] !== undefined ? <div className="cx-sync-progress"><Meter value={progress[row.id]} tone="blue" label="同步进度" /><small>{progress[row.id]}%</small></div>
          : <button type="button" className="cx-btn" onClick={() => run(row)}><Icon name="folderSync" size={13} />开始同步</button>}
      </Panel>)}
    </div>
    <Panel title="归并规则" sub="资产图以主域为锚点">
      <ul className="cx-bullets">
        <li>同名主域下的子域、服务与端点合并到同一棵树，保留首次发现来源。</li>
        <li>端点去重使用「方法 + 路径模板」；同一端点的多次请求保留为流量证据。</li>
        <li>跨任务资产共享，但测试范围仍由任务的资产拦截规则约束。</li>
      </ul>
    </Panel>
  </div>;
}

/* ---------------------------- 工作空间 ---------------------------- */
export function Workspace() {
  const [active, setActive] = useState(workspaceFiles[0].id);
  const file = workspaceFiles.find(item => item.id === active);
  const body = {
    ws1: '# acme 资产梳理\n\n- admin.acme.test：Vue3 + Element Plus 后台\n- api.acme.test：Go API，JWT 认证\n- www.acme.test：官网，search 页存在注入\n\n## 待确认\n- 导出接口的角色校验\n- 菜单接口是否只做前端隐藏',
    ws2: 'GET /api/orders/1042 HTTP/1.1\nHost: api.acme.test\nAuthorization: Bearer ***\n\nHTTP/1.1 200 OK\n{"id":1042,"owner":"another-user"}',
    ws3: reportDraft
  }[active];
  return <div className="cx-view">
    <ViewHead eyebrow="工作空间" title="任务工作目录" sub="Agent 的笔记、证据与报告草稿保存在任务工作目录；界面只预览，不执行。" />
    <div className="cx-split">
      <Panel title="文件" sub={`${workspaceFiles.length} 个 · 演示内容`} bodyClass="cx-tight">
        <div className="cx-filelist">
          {workspaceFiles.map(item => <button type="button" key={item.id} className={`cx-file ${active === item.id ? 'is-active' : ''}`} onClick={() => setActive(item.id)}>
            <Icon name="folder" size={15} /><span>{item.name}</span><em>{item.size}</em><time>{item.time}</time>
          </button>)}
        </div>
      </Panel>
      <Panel title={file.name} sub={`${file.kind} · ${file.size} · ${file.time}`} actions={<Badge tone="slate">只读预览</Badge>}>
        <pre className="cx-code cx-code-block">{body}</pre>
      </Panel>
    </div>
  </div>;
}
