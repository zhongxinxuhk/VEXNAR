// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React from 'react';
import { External, Icon } from './UI.jsx';
import { REPO } from '../content.js';
import Architecture3D, { ContractTable } from '../architecture/Arch3D.jsx';
import ArchitectureLab from '../Architecture.jsx';
import { sourceRevision } from '../architecture.js';
import { decisions, layers } from '../architecture/layers.js';

export default function ArchitecturePage() {
  return <div className="v-shell">
    <section className="v-page-hero">
      <div className="v-breadcrumb"><a href="index.html">VEXNAR</a><Icon name="chevronRight" size={11} /><span>架构剖析</span></div>
      <span className="v-eyebrow" style={{ marginTop: 18 }}>ARCHITECTURE DISSECTION</span>
      <h1>把系统拆成六层，再拼回去。</h1>
      <p className="lead">从浏览器表面到 PostgreSQL，每一层都写清楚职责、输入输出、失败语义和对应源码。3D 视图可以旋转与逐层剖析，下面的四套节点级图则展开系统、缓存、工具调用与双图关联。</p>
      <div className="v-actions">
        <a className="v-btn v-btn-primary" href="#layer-orchestration"><Icon name="orbit" size={15} />从编排层开始</a>
        <a className="v-btn v-btn-secondary" href="console.html"><Icon name="chat" size={15} />交互控制台</a>
        <External href={`${REPO}/tree/${sourceRevision}`} className="v-btn v-btn-ghost"><Icon name="github" size={15} />源码快照</External>
      </div>
      <div className="v-meta">
        <span><Icon name="layers" size={13} />{layers.length} 层 · {layers.reduce((sum, layer) => sum + layer.nodes.length, 0)} 个节点</span>
        <span><Icon name="commit" size={13} />{sourceRevision.slice(0, 8)}</span>
        <span><Icon name="shield" size={13} />结构示意，非实时流量</span>
      </div>
    </section>

    <section className="v-section-tight">
      <Architecture3D />
    </section>

    <section className="v-section">
      <div className="v-head">
        <div><span className="v-eyebrow">LAYER NOTES</span><h2>每一层在负责什么。</h2></div>
        <p>点击上方 3D 图中的层可以查看同样的内容；这里的卡片也直接指向对应的层。</p>
      </div>
      <div className="v-layer-notes">
        {layers.map(layer => <article className="v-layer-note" id={`layer-${layer.id}`} key={layer.id}>
          <header><span>{layer.index}</span><h3>{layer.name}</h3><small>{layer.en}</small></header>
          <p>{layer.purpose}</p>
          <ul>{layer.nodes.map(node => <li key={node.id}>{node.label}</li>)}</ul>
        </article>)}
      </div>
    </section>

    <section className="v-section">
      <div className="v-head">
        <div><span className="v-eyebrow">CONTRACTS</span><h2>层与层之间交换什么。</h2></div>
        <p>契约写清楚载荷与失败语义，客户端才能正确处理错误，而不是把异常当成空数据。</p>
      </div>
      <ContractTable />
    </section>

    <section className="v-section">
      <div className="v-head">
        <div><span className="v-eyebrow">DESIGN DECISIONS</span><h2>六个决定，解释了大部分结构。</h2></div>
        <p>每一条都能在代码里找到对应实现；这些取舍决定了系统的边界与可复核性。</p>
      </div>
      <div className="v-decision-grid">
        {decisions.map(item => <div className="v-decision" data-tone={item.tone} key={item.title}><b>{item.title}</b><p>{item.text}</p></div>)}
      </div>
    </section>

    <section className="v-section" id="architecture-lab">
      <div className="v-head">
        <div><span className="v-eyebrow">NODE-LEVEL DIAGRAMS</span><h2>四套节点级视图。</h2></div>
        <p>系统、缓存、工具调用与双图关联。每个节点都链接到固定提交的源码行，可以逐条核对。</p>
      </div>
      <ArchitectureLab bare />
    </section>

    <section className="v-section-tight">
      <div className="v-cta" style={{ margin: 0 }}>
        <div>
          <h2>结构看完了，回到操作面。</h2>
          <p>控制台演示把同样的流程做成可以点击的界面：对话、工具调用、审批、探索图与系统配置。</p>
        </div>
        <div className="v-cta-actions"><a className="v-btn v-btn-primary" href="console.html"><Icon name="play" size={15} />打开控制台</a><a className="v-btn v-btn-secondary" href="downloads.html">下载服务端</a></div>
      </div>
      <p className="v-note">架构图依据公开提交 <code style={{ fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{sourceRevision}</code> 的源码绘制，不读取未发布提交，也不代表已完成部署验收。</p>
    </section>
  </div>;
}
