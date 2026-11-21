// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React from 'react';
import { External, Icon } from './UI.jsx';
import { REPO } from '../content.js';
import AgentConsole from '../console/Console.jsx';
import { consoleNav } from '../console/nav.js';

const checklist = [
  ['侧边栏导航', '功能与系统两组共 21 个页面，点击即切换；可收起为图标栏。'],
  ['会话列表', '主 Agent、Planner 与 5 个 Worker 的会话，各自有独立的执行记录。'],
  ['工具调用卡片', '展开 bash、http_request、record_fact 等调用的输入与输出。'],
  ['审批分支', '允许、始终允许或拒绝，会同步到「审批记录」与侧边栏角标。'],
  ['待办与模型', '勾选 Planner 的跨轮待办；切换 Agent 与模型 profile。'],
  ['深色外观', '控制台右上角切换深色模式，演示与站点的浅色主题相互独立。'],
  ['快速导航', '按 ⌘J 打开控制台搜索面板，过滤页面与会话。'],
  ['仪表盘与图表', '切换时间范围与模型筛选，柱状图与缓存命中率随之更新。'],
  ['发现与复验', '按级别、状态筛选；点击「转入复验」观察状态流转。'],
  ['探索图与资产', '展开资产树、查看节点详情与关联发现；流量证据可切换请求/响应。'],
  ['拦截规则', '启用/停用规则，新增一条规则并观察摘要计数变化。'],
  ['系统配置', '常规、安全、更新三组参数，保存会给出演示提示。']
];

export default function ConsolePage() {
  return <div className="v-shell">
    <section className="v-page-hero">
      <div className="v-breadcrumb"><a href="index.html">VEXNAR</a><Icon name="chevronRight" size={11} /><span>交互体验</span></div>
      <span className="v-eyebrow" style={{ marginTop: 18 }}>AGENT CONSOLE · INTERACTIVE DEMO</span>
      <h1>Agent 首页，完整地跑在浏览器里。</h1>
      <p className="lead">这是一个由 React 复刻的控制台演示：布局、会话列表、工具调用、审批与系统配置都可以操作。所有数据在页面内生成，不连接服务端、不调用模型、不发出网络请求。</p>
      <div className="v-actions">
        <a className="v-btn v-btn-primary" href="#demo"><Icon name="play" size={15} />开始体验</a>
        <a className="v-btn v-btn-secondary" href="architecture.html"><Icon name="cube" size={15} />看架构剖析</a>
        <External href={REPO} className="v-btn v-btn-ghost"><Icon name="github" size={15} />源码</External>
      </div>
      <div className="v-meta">
        <span><Icon name="chat" size={13} />对话与工具记录</span>
        <span><Icon name="shield" size={13} />审批与拦截</span>
        <span><Icon name="moon" size={13} />浅色 / 深色</span>
        <span><Icon name="check" size={13} />完全离线</span>
      </div>
    </section>

    <section className="v-section-tight" id="demo">
      <AgentConsole initialView="chat" />
      <div className="v-console-links">
        <a href="#what"><Icon name="list" size={13} />可点击的功能清单</a>
        <a href="architecture.html#layer-intelligence"><Icon name="shield" size={13} />审查链路在架构中的位置</a>
      </div>
    </section>

    <section className="v-section" id="what">
      <div className="v-head">
        <div><span className="v-eyebrow">WHAT YOU CAN CLICK</span><h2>每个组件都能按下去看看。</h2></div>
        <p>不需要登录，也不会写任何状态到服务端。演示脚本在页面内维护会话、审批与勾选状态。</p>
      </div>
      <div className="v-panel">
        <div className="v-checklist">
          {checklist.map(([title, text]) => <div key={title}><Icon name="check" size={14} /><span><b>{title}</b> · {text}</span></div>)}
        </div>
        <p className="v-note">提示：控制台内部滚动被限制在窗口内；在移动端，侧边栏会变成抽屉，会话列表折叠到上方。</p>
      </div>
    </section>

    <section className="v-section-tight">
      <div className="v-head">
        <div><span className="v-eyebrow">PAGE MAP</span><h2>演示里可以到达的页面。</h2></div>
        <p>与产品侧边栏一一对应；左侧「功能」承载任务数据，右侧「系统」承载装配与安全配置。</p>
      </div>
      <div className="v-two">
        {consoleNav.map(group => <div className="v-panel" key={group.label}>
          <b style={{ fontSize: 13, color: 'var(--v-ink)' }}>{group.label}</b>
          <div className="v-cap-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', marginTop: 14 }}>
            {group.items.map(item => <div key={item.id} className="v-context-card" style={{ gridTemplateColumns: '32px minmax(0,1fr)', padding: '10px 12px' }}>
              <i style={{ width: 30, height: 30, borderRadius: 9 }}><Icon name={item.icon} size={14} /></i>
              <div><b style={{ fontSize: 12 }}>{item.label}</b></div>
            </div>)}
          </div>
        </div>)}
      </div>
    </section>

    <section className="v-section">
      <div className="v-cta" style={{ margin: 0 }}>
        <div><h2>看完演示，去看结构。</h2><p>3D 分层图把控制台背后的 Go 服务、Agent 运行时、双图与 PostgreSQL 放在同一张剖面里。</p></div>
        <div className="v-cta-actions"><a className="v-btn v-btn-primary" href="architecture.html"><Icon name="cube" size={15} />架构剖析</a></div>
      </div>
    </section>
  </div>;
}
