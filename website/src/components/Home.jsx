// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useState } from 'react';
import Architecture from '../Architecture.jsx';
import { REPO } from '../content.js';
import { External, Icon } from './UI.jsx';
const previewNodes = [
  { id:'goal', title:'目标范围', detail:'示例目标 example.test', x:35, y:145, type:'Goal' },
  { id:'intent', title:'识别应用入口', detail:'由目标派生的探索意图', x:270, y:45, type:'Intent' },
  { id:'fact', title:'记录 HTTP 响应', detail:'工具结果形成事实记录', x:510, y:45, type:'Fact' },
  { id:'evidence', title:'关联流量证据', detail:'请求与响应保留来源', x:745, y:45, type:'Evidence' },
  { id:'scope', title:'梳理服务信息', detail:'并行探索的另一个方向', x:270, y:245, type:'Intent' },
  { id:'asset', title:'更新资产关系', detail:'跨任务共享的资产图', x:510, y:245, type:'Asset' },
  { id:'anchor', title:'建立探索锚点', detail:'探索节点关联具体资产', x:745, y:245, type:'Anchor' }
];
const previewEdges = [['goal','intent'],['intent','fact'],['fact','evidence'],['goal','scope'],['scope','asset'],['asset','anchor']];
export function ProductPreview() {
  const [view, setView] = useState('graph');
  const [selected, setSelected] = useState('fact');
  const node = previewNodes.find(n => n.id === selected);
  return <section className="product-preview reveal" aria-label="VEXNAR 工作台交互示意">
    <div className="preview-caption"><span>工作台概览</span><span>交互示意 · 演示数据</span></div>
    <div className="workspace-window"><div className="window-bar"><div className="window-controls" aria-hidden="true"><i /><i /><i /></div><span>VEXNAR / 安全研究工作区</span><span className="window-local">本地部署</span></div>
      <div className="workspace-body"><aside className="workspace-sidebar" aria-hidden="true"><div className="mini-brand"><img src="assets/logo.png" alt="" />VEXNAR</div><span><Icon name="grid" size={16} /> 总览</span><span className="chosen"><Icon name="layers" size={16} /> 任务</span><span><Icon name="graph" size={16} /> 资产</span><span><Icon name="shield" size={16} /> 发现</span><div className="sidebar-bottom">示例工作区<br /><small>example.test</small></div></aside>
        <div className="workspace-main"><div className="workspace-title"><div><span className="workspace-breadcrumb">任务 / 示例任务</span><h2>应用入口与资产梳理</h2></div><span className="sample-label">示例</span></div>
          <div className="preview-tabs" role="tablist" aria-label="工作台示意视图">{[['graph','探索视图','graph'],['tools','工具记录','terminal'],['assets','资产关系','layers']].map(([id,label,icon])=><button key={id} role="tab" aria-selected={view===id} onClick={()=>setView(id)}><Icon name={icon} size={16}/>{label}</button>)}</div>
          <div className="preview-content" key={view}>
            {view==='graph' && <><div className="preview-graph-scroll"><div className="preview-graph"><svg viewBox="0 0 950 360" aria-hidden="true">{previewEdges.map(([a,b])=>{const from=previewNodes.find(n=>n.id===a),to=previewNodes.find(n=>n.id===b);return <path key={a+b} className={a===selected||b===selected?'selected':''} d={`M${from.x+170},${from.y+32} C${from.x+205},${from.y+32} ${to.x-35},${to.y+32} ${to.x},${to.y+32}`}/>;})}</svg>{previewNodes.map(n=><button key={n.id} style={{left:`${n.x/9.5}%`,top:`${n.y/3.6}%`}} className={`preview-node ${selected===n.id?'selected':''}`} aria-pressed={selected===n.id} onClick={()=>setSelected(n.id)}><small>{n.type}</small><b>{n.title}</b></button>)}</div></div><div className="preview-inspector"><span>{node.type}</span><b>{node.title}</b><p>{node.detail}</p><small>点击图中的节点查看关联关系</small></div></>}
            {view==='tools' && <div className="preview-records"><div className="table-heading"><span>工具</span><span>用途</span><span>来源</span></div>{[['HTTP Request','获取应用响应与请求证据','内置工具'],['MCP tools/list','发现扩展工具目录','MCP'],['record_fact','写入任务事实记录','探索图'],['insert_assets','归并资产并建立锚点','资产图']].map(([name,purpose,source])=><div className="table-record" key={name}><code>{name}</code><span>{purpose}</span><span className="tag">{source}</span></div>)}<p className="demo-note">此处为工具调用方式示意，没有执行网络请求。</p></div>}
            {view==='assets' && <div className="preview-assets"><div><Icon name="graph" size={24}/><h3>example.test</h3><p>示例域名</p></div><span className="asset-connector"/><div><Icon name="layers" size={24}/><h3>HTTPS 应用</h3><p>服务与应用关系</p></div><span className="asset-connector"/><div><Icon name="code" size={24}/><h3>/api/example</h3><p>示例接口端点</p></div></div>}
          </div>
          <div className="workspace-bottom"><span><Icon name="graph" size={14}/> 探索图与资产图通过锚点关联</span><span>界面示意，非实时任务</span></div>
        </div>
      </div>
    </div>
  </section>;
}
export default function Home() {
  return <>
    <section className="hero"><div className="hero-copy"><div className="product-label"><span className="label-line"/> AI 自主渗透测试系统</div><h1>面向安全研究的<br /><span>AI 测试工作台。</span></h1></div><div className="hero-aside"><p>配置目标与模型，启动探索。<br/>在同一个工作区查看任务、工具调用、资产关系与验证证据。</p><div className="actions"><a className="button primary" href="downloads.html">获取 VEXNAR</a><External href={REPO} className="button secondary">查看源码</External></div><a className="understated-link" href="#architecture">了解系统架构</a></div></section>
    <div className="hero-facts"><span>Go 服务端</span><span>PostgreSQL 双图</span><span>MCP / Skills</span><span>AGPL-3.0-or-later</span></div>
    <ProductPreview/>
    <section className="section capabilities reveal" id="capabilities"><div className="section-heading"><div><span className="section-label">工作方式</span><h2>任务、工具和证据，<br/>在同一个上下文中。</h2></div><p>从目标规划到结果复核，<br/>保留研究过程中的信息与关联。</p></div><div className="feature-grid">{[
      ['layers','任务编排','Planner 规划探索方向，Worker 领取意图并执行。结果写回任务图，继续支撑下一轮规划。'],
      ['graph','双图关联','探索图记录意图、事实与发现，资产图归并域名、服务和端点。锚点连接两者。'],
      ['terminal','工具扩展','内置工具与 Skills、MCP 按 Agent 配置装配。工具调用过程与结果可以回看。'],
      ['shield','人工介入','通过对话、暂停和可配置审批介入执行。候选发现进入独立验证流程。']
    ].map(([icon,title,text])=><article className="feature" key={title}><Icon name={icon} size={24}/><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <Architecture/>
    <section className="context-section section reveal"><div><span className="section-label">上下文管理</span><h2>长任务需要连续的上下文。</h2><p>近期消息保留工具调用与结果配对，较早的信息整理为滚动摘要。快照身份与内容版本决定摘要是否可以复用。</p><a href="#architecture" className="understated-link">在缓存设计中查看实现</a></div><div className="context-layers">{[['近期消息','结构化消息与工具结果','保留调用配对'],['历史摘要','目标、事实与未完成事项','按需生成'],['快照身份','SnapshotKey / content_version','变化后重新计算']].map(([title,text,tag])=><div key={title}><span className="layer-glyph"><Icon name="layers"/></span><div><b>{title}</b><p>{text}</p></div><small>{tag}</small></div>)}</div></section>
    <section className="project-links section reveal"><div><span className="section-label">开源项目</span><h2>查看项目正在发生的变化。</h2><p>版本、分支、提交与贡献者信息来自公开 GitHub 仓库。</p></div><div className="project-link-grid">{[['releases','版本更新','查看公开发行说明','book'],['commits','提交记录','浏览最近的代码变更','commit'],['contributors','合作者','认识代码贡献者','users'],['credits','开源致谢','了解项目使用的开源软件','layers']].map(([id,title,desc,icon])=><a href={`${id}.html`} key={id}><Icon name={icon}/><h3>{title}</h3><p>{desc}</p></a>)}</div></section>
  </>;
}
