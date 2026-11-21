// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useEffect, useState } from 'react';
import { architectures, sourceRevision } from './architecture.js';
import { REPO } from './content.js';

function edgePath(a, b, viewId) {
  const ax = a.x + 95, ay = a.y + 40, bx = b.x + 95, by = b.y + 40;
  if (viewId === 'cache') return `M ${ax + 95} ${ay} C ${ax + 165} ${ay}, ${bx - 165} ${by}, ${bx - 95} ${by}`;
  if (Math.abs(ay - by) < 80) {
    const direction = bx > ax ? 1 : -1;
    return `M ${ax + 95 * direction} ${ay} C ${ax + 160 * direction} ${ay}, ${bx - 160 * direction} ${by}, ${bx - 95 * direction} ${by}`;
  }
  const direction = by > ay ? 1 : -1;
  const middle = (ay + by) / 2;
  return `M ${ax} ${ay + 40 * direction} C ${ax} ${middle}, ${bx} ${middle}, ${bx} ${by - 40 * direction}`;
}

export default function Architecture({ bare = false }) {
  const [viewId, setViewId] = useState('system');
  const [selectedId, setSelectedId] = useState('api');
  const [playing, setPlaying] = useState(false);
  const view = architectures.find(v => v.id === viewId);
  const selected = view.nodes.find(n => n.id === selectedId) || view.nodes[0];
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setSelectedId(previous => view.sequence[(view.sequence.indexOf(previous) + 1) % view.sequence.length]), 2200);
    return () => clearInterval(timer);
  }, [playing, view]);
  const chooseView = id => {
    const next = architectures.find(v => v.id === id);
    setViewId(id); setSelectedId(next.nodes[0].id); setPlaying(false);
  };
  function tabKeys(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % architectures.length;
    else if (event.key === 'ArrowLeft') next = (index + architectures.length - 1) % architectures.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = architectures.length - 1;
    else return;
    event.preventDefault(); chooseView(architectures[next].id);
    document.getElementById(`tab-${architectures[next].id}`).focus();
  }
  return <section id="architecture" className={`architecture-section section reveal ${bare ? 'is-bare' : ''}`}>
    {!bare && <div className="section-heading"><div><div className="eyebrow">技术架构</div><h2>系统如何运行。</h2></div><p>系统、缓存、工具与双图的实现关系。<br />选择节点查看说明及源码。</p></div>}
    <div className="architecture-tabs" role="tablist" aria-label="技术架构图">
      {architectures.map((item, index) => <button key={item.id} role="tab" id={`tab-${item.id}`} aria-selected={viewId === item.id} aria-controls="architecture-panel" tabIndex={viewId === item.id ? 0 : -1} onClick={() => chooseView(item.id)} onKeyDown={event => tabKeys(event, index)}><span>{item.label}</span></button>)}
    </div>
    <div id="architecture-panel" className="architecture-panel" role="tabpanel" aria-labelledby={`tab-${viewId}`}>
      <div className="diagram-heading"><div><h3>{view.title}</h3><p>{view.description}</p></div><button className={`tour-button ${playing ? 'playing' : ''}`} onClick={() => setPlaying(!playing)} aria-pressed={playing}>{playing ? '暂停浏览' : '逐步浏览'}</button></div>
      <div className="diagram-layout">
        <div className="diagram-scroll" tabIndex="0" role="region" aria-label={`${view.label}节点图，可横向滚动`}>
          <div className="diagram-board" key={view.id}>
            <div className="diagram-grid" aria-hidden="true" />
            <svg viewBox="0 0 1000 530" className="diagram-lines" aria-hidden="true">
              <defs><marker id={`head-${view.id}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#9aa9bd" /></marker><marker id={`lit-${view.id}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#315cc9" /></marker></defs>
              {view.edges.map(([from, to]) => {
                const a = view.nodes.find(n => n.id === from), b = view.nodes.find(n => n.id === to);
                const lit = from === selected.id || to === selected.id;
                return <path key={`${from}-${to}`} d={edgePath(a, b, view.id)} className={lit ? 'edge edge-lit' : 'edge'} markerEnd={`url(#${lit ? 'lit' : 'head'}-${view.id})`} />;
              })}
            </svg>
            {view.nodes.map(item => <button key={item.id} className={`diagram-node ${selected.id === item.id ? 'selected' : ''}`} style={{ left: `${item.x / 10}%`, top: `${item.y / 5.3}%` }} aria-pressed={selected.id === item.id} aria-label={`查看 ${item.label} 设计`} onClick={() => { setSelectedId(item.id); setPlaying(false); }}><span>{item.label}</span><small>{item.subtitle}</small><i aria-hidden="true" /></button>)}
          </div>
        </div>
        <aside className="diagram-detail" aria-live={playing ? 'off' : 'polite'} aria-atomic="true">
          <div className="eyebrow">节点说明</div><h4>{selected.label}</h4><p>{selected.detail}</p><div className="detail-tags">{selected.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
          <a className="source-link" href={`${REPO}/blob/${sourceRevision}/${selected.source}#L${selected.line}`} target="_blank" rel="noopener noreferrer"><span>查看实现源码</span><code>{selected.source}:{selected.line}</code></a>
        </aside>
      </div>
      <div className="diagram-caption"><span>结构与策略示意 · 导览为设计演示，非实时任务流量</span><span>依据公开源码 {sourceRevision.slice(0, 8)} · 小屏可横向滑动</span></div>
    </div>
    <div className="architecture-footnotes"><span>可选故障转移</span><span>按配置启用审批</span><span>上下文摘要按身份复用</span><span>证据关联与独立验证</span></div>
  </section>;
}
