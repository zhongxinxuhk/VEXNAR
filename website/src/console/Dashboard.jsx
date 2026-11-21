// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useState } from 'react';
import { Icon } from '../components/UI.jsx';
import { Panel, Stat, Segmented, Chips, Badge, Meter } from './primitives.jsx';
import { activity, activityKinds, dashboardStats, findings, tokenBreakdown, tokenRanges } from './data.js';

const modelFilters = ['全部', 'Claude Opus 4.8', 'DeepSeek V4'];
const toneOf = item => item.severity === '高危' ? 'red' : item.severity === '中危' ? 'amber' : 'slate';

function TokenChart({ range, model }) {
  const series = tokenRanges[range];
  const factor = model === '全部' ? 1 : model === 'Claude Opus 4.8' ? 0.68 : 0.32;
  const scaled = series.map(([label, input, cache, output]) => [label, input * factor, cache * factor, output * factor]);
  const max = Math.max(...scaled.map(item => item[1] + item[2] + item[3]));
  const height = 168;
  return <div className="cx-chart">
    <svg viewBox="0 0 720 232" role="img" aria-label={`Token 消耗柱状图 · ${range} · ${model}`}>
      {[0, 0.25, 0.5, 0.75, 1].map(step => {
        const y = 24 + height - step * height;
        return <g key={step}>
          <line x1="54" y1={y} x2="704" y2={y} stroke="currentColor" strokeOpacity="0.09" strokeDasharray={step === 0 ? '' : '3 5'} />
          <text x="44" y={y + 4} textAnchor="end" className="cx-chart-axis">{(max * step).toFixed(1)}M</text>
        </g>;
      })}
      {scaled.map(([label, input, cache, output], index) => {
        const width = 34;
        const gap = (704 - 54) / scaled.length;
        const x = 54 + gap * index + gap / 2 - width / 2;
        const hInput = (input / max) * height;
        const hCache = (cache / max) * height;
        const hOutput = (output / max) * height;
        let cursor = 24 + height;
        const parts = [
          { key: 'input', value: hInput, className: 'cx-bar-input' },
          { key: 'cache', value: hCache, className: 'cx-bar-cache' },
          { key: 'output', value: hOutput, className: 'cx-bar-output' }
        ];
        return <g key={label} className="cx-bar-group">
          <title>{`${label} · 输入 ${input.toFixed(2)}M / 缓存 ${cache.toFixed(2)}M / 输出 ${output.toFixed(2)}M`}</title>
          {parts.map(part => {
            cursor -= part.value;
            return <rect key={part.key} x={x} y={cursor} width={width} height={Math.max(0, part.value)} rx="3" className={part.className} />;
          })}
          <text x={x + width / 2} y={24 + height + 22} textAnchor="middle" className="cx-chart-axis">{label}</text>
        </g>;
      })}
    </svg>
    <div className="cx-chart-legend"><span><i className="cx-swatch cx-bar-input" />输入</span><span><i className="cx-swatch cx-bar-cache" />缓存读</span><span><i className="cx-swatch cx-bar-output" />输出</span></div>
  </div>;
}

export default function Dashboard({ onNavigate, onCreateTask, notify }) {
  const [range, setRange] = useState('7天');
  const [model, setModel] = useState('全部');
  const [kind, setKind] = useState('全部');
  const [selected, setSelected] = useState('');

  const events = activity.filter(item => kind === '全部' || item.kind === kind);

  return <div className="cx-view cx-dashboard">
    <div className="cx-view-head">
      <div><span className="cx-eyebrow">总览</span><h1>系统全局状态 · 实时刷新</h1><p>任务、发现、资产与 Token 用量的同一份视图。数据为演示快照。</p></div>
      <button type="button" className="cx-btn cx-btn-primary" onClick={onCreateTask}><Icon name="plus" size={14} />新建任务</button>
    </div>

    <div className="cx-stats">
      {dashboardStats.map(item => <button type="button" key={item.id} className="cx-stat-btn" onClick={() => onNavigate({ tasks: 'tasks', findings: 'findings', assets: 'assets', traffic: 'traffic', tokens: 'llm-records' }[item.id])}>
        <Stat label={item.label} value={item.value} sub={item.sub} tone={item.tone} icon={item.icon} />
      </button>)}
    </div>

    <Panel
      title="LLM Token 消耗"
      sub="4 个任务累计 · 按模型筛选只影响展示"
      actions={<div className="cx-panel-tools">
        <Chips items={modelFilters} value={model} onChange={setModel} label="模型筛选" />
        <Segmented items={Object.keys(tokenRanges).map(key => [key, key])} value={range} onChange={setRange} label="时间范围" />
      </div>}
    >
      <div className="cx-token-grid">
        <div className="cx-token-side">
          <p className="cx-token-label">合计（输入+输出）</p>
          <strong className="cx-token-total">{model === '全部' ? '2.9M' : model === 'Claude Opus 4.8' ? '2.0M' : '0.93M'}</strong>
          <p className="cx-token-note">4 个任务 · 演示数值</p>
          <div className="cx-breakdown">
            {tokenBreakdown.map(item => <div key={item.label} className="cx-breakdown-row">
              <span>{item.label}</span><b>{item.value}</b>
              <Meter value={item.share} tone={item.tone} label={`${item.label} ${item.share}%`} />
            </div>)}
          </div>
          <div className="cx-cache-hit"><span>缓存命中率</span><b>64%</b><Meter value={64} tone="green" label="缓存命中率 64%" /></div>
        </div>
        <TokenChart range={range} model={model} />
      </div>
    </Panel>

    <div className="cx-grid-2">
      <Panel title="活动流" sub="主 Agent · Planner · Workers 的同一事件流" actions={<span className="cx-panel-link">{activity.length} 事件</span>}>
        <Chips items={activityKinds} value={kind} onChange={setKind} label="事件类型" />
        <div className="cx-activity">
          {events.map(item => <button type="button" key={item.id} className={`cx-activity-row ${selected === String(item.id) ? 'is-active' : ''}`} onClick={() => setSelected(String(item.id))}>
            <span className={`cx-lane cx-lane-${item.worker === 'planner' ? 'amber' : item.worker === 'mainagent' ? 'ink' : 'w1'}`}>{item.worker === 'planner' ? 'P' : item.worker === 'mainagent' ? 'M' : '#'}</span>
            <span className="cx-activity-main">
              <span className="cx-activity-top"><code>{item.title}</code><em>{item.kind}</em><time>{item.time}</time></span>
              <span className="cx-activity-text">{item.text}</span>
            </span>
          </button>)}
          {!events.length && <p className="cx-empty-line">该类型下没有事件。</p>}
        </div>
      </Panel>

      <Panel title="确认发现" sub="点击任意发现进入筛选视图" actions={<button type="button" className="cx-link" onClick={() => onNavigate('findings')}>全部<Icon name="chevronRight" size={12} /></button>}>
        <div className="cx-finding-list">
          {findings.slice(0, 5).map(item => <button type="button" key={item.id} className="cx-finding-row" onClick={() => onNavigate('findings')}>
            <Badge tone={toneOf(item)}>{item.status === '已验证' ? '高危' : item.severity}</Badge>
            <span className="cx-finding-main"><b>{item.title}</b><small>{item.target} · {item.scope}</small></span>
            <time>{item.time}</time>
          </button>)}
        </div>
      </Panel>
    </div>

    <div className="cx-grid-3">
      <Panel title="资产分布" sub="跨任务共享的资产图" actions={<button type="button" className="cx-link" onClick={() => onNavigate('assets')}>查看<Icon name="chevronRight" size={12} /></button>}>
        <div className="cx-mini-bars">
          {[['域名', 6, 'blue'], ['服务', 7, 'cyan'], ['应用', 3, 'violet'], ['端点', 9, 'amber']].map(([label, value, tone]) => <div key={label}>
            <span>{label}</span><b>{value}</b><Meter value={(value / 9) * 100} tone={tone} label={`${label} ${value}`} />
          </div>)}
        </div>
      </Panel>
      <Panel title="待处理审批" sub="按拦截规则进入 ask 分支" actions={<button type="button" className="cx-link" onClick={() => onNavigate('approvals')}>审批记录<Icon name="chevronRight" size={12} /></button>}>
        <div className="cx-approval-mini">
          <div><Badge tone="amber">待审批</Badge><b>POST /api/export</b><small>将读取 200 条用户记录</small></div>
          <div><Badge tone="amber">待审批</Badge><b>nmap -sV -p- admin.acme.test</b><small>全端口扫描可能触发告警</small></div>
        </div>
      </Panel>
      <Panel title="运行中的 Worker" sub="并行领取意图">
        <div className="cx-worker-mini">
          {[['#3 后台功能枚举', 68, 'blue'], ['#4 搜索页注入', 100, 'green'], ['#5 订单越权', 42, 'violet']].map(([label, value, tone]) => <div key={label}>
            <span>{label}</span><Meter value={value} tone={tone} label={`${label} ${value}%`} /><b>{value}%</b>
          </div>)}
        </div>
        <button type="button" className="cx-link cx-link-block" onClick={() => notify('Worker 会话可在「对话」中切换查看')}>在对话中查看执行记录<Icon name="chevronRight" size={12} /></button>
      </Panel>
    </div>
  </div>;
}
