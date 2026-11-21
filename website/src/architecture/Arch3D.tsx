// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../components/UI.tsx';
import { REPO } from '../content.ts';
import { sourceRevision } from '../architecture.ts';
import { contracts, layerById, layers, lifecycle } from './layers.ts';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/** Inline style carrying the CSS custom properties the 3D transform reads. */
type StyleVars = CSSProperties & { [custom: `--${string}`]: string | number };

/** Per-layer stacking offset handed to the transform through `--i`. */
const layerStyle = (index: number): StyleVars => ({ '--i': index });

/** Props of the source link shown under a selected node. */
interface SourceRefProps {
  file: string;
  line: number;
  label?: string;
}

function SourceRef({ file, line, label = '查看实现' }: SourceRefProps) {
  return <a className="a3-source" href={`${REPO}/blob/${sourceRevision}/${file}#L${line}`} target="_blank" rel="noopener noreferrer">
    <span>{label}</span><code>{file}:{line}</code><Icon name="external" size={11} />
  </a>;
}

/** Props of the interactive 3D layer view. */
interface Architecture3DProps {
  compact?: boolean;
  className?: string;
}

export default function Architecture3D({ compact = false, className = '' }: Architecture3DProps) {
  const [rx, setRx] = useState(compact ? 16 : 19);
  const [ry, setRy] = useState(-13);
  const [exploded, setExploded] = useState(false);
  const [auto, setAuto] = useState(false);
  const [flow, setFlow] = useState(true);
  const [layerId, setLayerId] = useState('orchestration');
  const [nodeId, setNodeId] = useState('engine');
  const [tour, setTour] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const drag = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const direction = useRef(1);
  const playingRef = useRef(false);

  const layer = layerById[layerId];
  const node = nodeId ? layer.nodes.find(item => item.id === nodeId) : null;

  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => {
      setRy(current => {
        const next = current + direction.current * 0.7;
        if (next > 16) direction.current = -1;
        if (next < -24) direction.current = 1;
        return next;
      });
    }, 45);
    return () => clearInterval(timer);
  }, [auto]);

  useEffect(() => {
    const applyHash = () => {
      const target = decodeURIComponent(location.hash.replace('#', '')).replace('layer-', '');
      if (!layerById[target]) return;
      setLayerId(target);
      setNodeId('');
      setPlaying(false);
      setTour(-1);
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      if (!playingRef.current) return;
      setTour(current => {
        const next = (current + 1) % lifecycle.length;
        setLayerId(lifecycle[next].layer);
        setNodeId(lifecycle[next].node);
        return next;
      });
    }, 2400);
    return () => clearInterval(timer);
  }, [playing]);

  function stopTour() {
    playingRef.current = false;
    setPlaying(false);
  }

  function startTour() {
    if (playing) { stopTour(); return; }
    playingRef.current = true;
    setTour(0);
    setLayerId(lifecycle[0].layer);
    setNodeId(lifecycle[0].node);
    setPlaying(true);
  }

  function reset() {
    setRx(compact ? 16 : 19); setRy(-13); setExploded(false); setAuto(false); playingRef.current = false; setPlaying(false); setTour(-1);
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest('button, a, input, select')) return;
    drag.current = { x: event.clientX, y: event.clientY, rx, ry };
    stage.current?.setPointerCapture?.(event.pointerId);
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    setRx(clamp(drag.current.rx - dy * 0.12, 0, 40));
    setRy(clamp(drag.current.ry + dx * 0.16, -32, 32));
  }
  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    drag.current = null;
    stage.current?.releasePointerCapture?.(event.pointerId);
  }
  function keydown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 6 : 3;
    if (event.key === 'ArrowLeft') { event.preventDefault(); setRy(value => clamp(value - step, -32, 32)); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); setRy(value => clamp(value + step, -32, 32)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setRx(value => clamp(value - step, 0, 40)); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setRx(value => clamp(value + step, 0, 40)); }
    else if (event.key === 'Home') { event.preventDefault(); reset(); }
  }

  const activeStep = tour >= 0 ? lifecycle[tour] : null;
  const stageStyle: StyleVars = { '--rx': `${rx}deg`, '--ry': `${ry}deg` };

  return <div className={`a3 ${compact ? 'is-compact' : ''} ${className}`} data-tone={layer.tone}>
    <div className="a3-head">
      <div>
        <span className="a3-eyebrow">TECHNICAL ARCHITECTURE · 3D</span>
        <h3>系统分层剖析</h3>
        <p>拖拽旋转视图，点击层或节点查看职责、契约与源码位置。图示为结构示意，不是运行时流量。</p>
      </div>
      <div className="a3-controls" role="toolbar" aria-label="架构视图控制">
        <button type="button" className={auto ? 'is-on' : ''} aria-pressed={auto} onClick={() => setAuto(value => !value)}><Icon name="orbit" size={14} />自动旋转</button>
        <button type="button" className={exploded ? 'is-on' : ''} aria-pressed={exploded} onClick={() => setExploded(value => !value)}><Icon name="expand" size={14} />展开层间距</button>
        <button type="button" className={flow ? 'is-on' : ''} aria-pressed={flow} onClick={() => setFlow(value => !value)}><Icon name="zap" size={14} />数据流</button>
        <button type="button" className={playing ? 'is-on' : ''} aria-pressed={playing} onClick={startTour}><Icon name={playing ? 'pause' : 'play'} size={14} />{playing ? '暂停剖析' : '剖析导览'}</button>
        <button type="button" onClick={reset}><Icon name="refresh" size={14} />复位</button>
      </div>
    </div>

    <div className="a3-body">
      <aside className="a3-rail" aria-label="分层索引">
        {layers.map(item => <button key={item.id} type="button" className={`a3-rail-item ${item.id === layer.id ? 'is-active' : ''}`} aria-pressed={item.id === layer.id} onClick={() => { setLayerId(item.id); setNodeId(''); stopTour(); setTour(-1); }}>
          <span className={`a3-rail-num a3-text-${item.tone}`}>{item.index}</span>
          <span className="a3-rail-name">{item.name}<small>{item.en}</small></span>
          <em>{item.nodes.length}</em>
        </button>)}
      </aside>

      <div
        className={`a3-stage ${auto ? 'is-auto' : ''} ${exploded ? 'is-exploded' : ''} ${flow ? 'is-flowing' : ''}`}
        ref={stage}
        tabIndex={0}
        role="application"
        aria-label="3D 分层架构图，方向键旋转，Home 复位"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onKeyDown={keydown}
        style={stageStyle}
      >
        <div className="a3-floor" aria-hidden="true" />
        <div className="a3-ambient" aria-hidden="true"><span /><span /><span /></div>
        <div className="a3-world">
          <div className="a3-stack">
            {layers.map((item, index) => <React.Fragment key={item.id}>
              {index > 0 && <div className={`a3-beam a3-beam-${item.tone}`} aria-hidden="true"><i /><i /><i /></div>}
              <div className={`a3-layer a3-layer-${item.tone} ${item.id === layer.id ? 'is-selected' : ''}`} style={layerStyle(index)}>
                <div className="a3-plate">
                  <header>
                    <span className="a3-plate-index">{item.index}</span>
                    <div><b>{item.name}</b><small>{item.en} · {item.tagline}</small></div>
                    <span className="a3-plate-tone" />
                  </header>
                  <div className="a3-plate-nodes">
                    {item.nodes.map(entry => <button key={entry.id} type="button" className={`a3-node ${entry.id === nodeId ? 'is-active' : ''}`} aria-pressed={entry.id === nodeId} title={entry.sub} onClick={() => { setLayerId(item.id); setNodeId(entry.id); stopTour(); setTour(-1); }}>
                      <Icon name={entry.icon} size={12} />
                      <span>{entry.label}</span>
                    </button>)}
                  </div>
                </div>
              </div>
            </React.Fragment>)}
          </div>
        </div>
      </div>

      <aside className="a3-detail" aria-live="polite">
        <div className={`a3-detail-head a3-head-${layer.tone}`}>
          <span>{layer.index}</span>
          <div><h4>{layer.name}</h4><small>{layer.en}</small></div>
        </div>
        <p className="a3-purpose">{layer.purpose}</p>
        <div className="a3-facts">{layer.facts.map(([key, value]) => <div key={key}><span>{key}</span><b>{value}</b></div>)}</div>

        <h5>节点</h5>
        <div className="a3-node-list">
          {layer.nodes.map(entry => <button key={entry.id} type="button" className={entry.id === nodeId ? 'is-active' : ''} onClick={() => { setNodeId(entry.id); stopTour(); setTour(-1); }}>
            <Icon name={entry.icon} size={13} /><span>{entry.label}</span><small>{entry.sub}</small>
          </button>)}
        </div>

        {node && <div className="a3-node-detail">
          <div className="a3-node-title"><Icon name={node.icon} size={15} /><b>{node.label}</b><span>{node.sub}</span></div>
          <p>{node.detail}</p>
          <div className="a3-tags">{node.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
          <SourceRef file={node.source} line={node.line} />
        </div>}

        <h5>层间契约</h5>
        <ul className="a3-contracts">{layer.contracts.map(([from, payload, failure]) => <li key={from}><b>{from}</b><span>{payload}</span><em>{failure}</em></li>)}</ul>

        <h5>需要警惕</h5>
        <ul className="a3-risks">{layer.risks.map(risk => <li key={risk}>{risk}</li>)}</ul>
      </aside>
    </div>

    <div className="a3-flow">
      <div className="a3-flow-head">
        <span className="a3-eyebrow">EVENT LIFECYCLE</span>
        <p>{activeStep ? <><b>{activeStep.event}</b> · {activeStep.text}</> : '一次任务从创建到复验的事件链，点击任意一步定位到对应层。'}</p>
        {activeStep && <span className={`a3-flow-tag a3-text-${layerById[activeStep.layer].tone}`}>{layerById[activeStep.layer].name}</span>}
      </div>
      <ol className="a3-steps">
        {lifecycle.map((step, index) => <li key={step.id}>
          <button type="button" className={`${index === tour ? 'is-active' : ''}`} aria-pressed={index === tour} onClick={() => { setTour(index); stopTour(); setLayerId(step.layer); setNodeId(step.node); }}>
            <span>{String(index + 1).padStart(2, '0')}</span><code>{step.event}</code>
          </button>
        </li>)}
      </ol>
    </div>

    {!compact && <div className="a3-foot">
      <span>依据公开源码 {sourceRevision.slice(0, 8)} · 每个节点可跳转到对应文件行</span>
      <SourceRef file="docs/多Agent运行时架构设计方案.md" line={1} label="架构设计文档" />
    </div>}
  </div>;
}

export function ContractTable() {
  return <div className="vtable-wrap">
    <table className="vtable">
      <thead><tr><th>从</th><th>到</th><th>载荷</th><th>失败语义</th><th>说明</th></tr></thead>
      <tbody>{contracts.map(row => <tr key={`${row[0]}-${row[1]}`}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}
