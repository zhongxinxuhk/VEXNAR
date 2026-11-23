// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { External, Icon } from './UI.tsx';
import { REPO } from '../content.ts';
import Architecture3D from '../architecture/Arch3D.tsx';
import ArchitectureLab from '../Architecture.tsx';

const capabilities = [
  { layer: 'orchestration', icon: 'target', index: '01', title: '任务编排', text: 'Manager 管理生命周期，Engine 驱动规划循环，Worker 池并行领取意图。暂停、恢复与取消都有明确的取消原因。' },
  { layer: 'evidence', icon: 'graph', index: '02', title: '双图证据链', text: '探索图记录意图、事实与发现，资产图归并域名、服务与端点。锚点把任务过程和资产对象连起来。' },
  { layer: 'intelligence', icon: 'wrench', index: '03', title: '工具与 Skill 装配', text: '内置工具、Skills 与 MCP 按 Agent 配置装配；延迟发现缩小首轮上下文，调用过程全部可回看。' },
  { layer: 'intelligence', icon: 'shield', index: '04', title: '执行前审查', text: 'PreToolUse 规则与可配置审查模型决定 allow / deny / ask；写操作与敏感读取先经人工确认。' },
  { layer: 'gateway', icon: 'key', index: '05', title: '模型访问收敛', text: 'Provider、模型目录、凭据与故障转移都在 Go 服务端；客户端只通过回环网关使用模型。' },
  { layer: 'evidence', icon: 'shield', index: '06', title: '独立复验', text: '候选发现提交后触发独立会话复现，确认结论与候选分开记录，报告中标注证据来源。' }
];

const heroLayers = [
  ['01', '交互层', 'INTERACTION'],
  ['02', '接入层', 'GATEWAY'],
  ['03', '编排层', 'ORCHESTRATION'],
  ['04', '智能层', 'INTELLIGENCE'],
  ['05', '证据层', 'EVIDENCE'],
  ['06', '基座', 'SUBSTRATE']
];

export default function Home() {
  return <>
    <section className="v-hero">
      <div>
        <span className="v-badge"><i aria-hidden="true" />VEXNAR · AI 自主渗透测试系统</span>
        <h1>让一支 Agent 团队，<br /><em>完成可复核的渗透测试。</em></h1>
        <p className="lead">配置目标与模型，启动探索。任务、工具调用、资产关系与验证证据留在同一个工作区；每个结论都能回到源码、流量与复现步骤。</p>
        <div className="v-actions">
          <a className="v-btn v-btn-primary" href="console.html"><Icon name="play" size={15} />打开客户端</a>
          <a className="v-btn v-btn-secondary" href="architecture.html"><Icon name="cube" size={15} />3D 架构剖析</a>
          <External href={REPO} className="v-btn v-btn-ghost"><Icon name="github" size={15} />查看源码</External>
        </div>
        <div className="v-meta">
          <span><Icon name="code" size={13} />Go 服务端</span>
          <span><Icon name="database" size={13} />PostgreSQL 双图</span>
          <span><Icon name="plug" size={13} />MCP · Skills</span>
          <span><Icon name="shield" size={13} />AGPL-3.0-or-later</span>
        </div>
      </div>
      <div className="v-scene" aria-hidden="true">
        <div className="v-rings"><span /><span /><span /></div>
        <div className="v-core">
          {heroLayers.map(([index, name, en]) => <div className="v-core-layer" key={index}><b>{index}</b><span>{name}</span><em>{en}</em></div>)}
        </div>
        <div className="v-float v-float-1"><span>任务 T-2407</span><b>探索中 · 12 意图</b><span className="ok">3 Worker 并行</span></div>
        <div className="v-float v-float-2"><span>发现 F-101</span><b>后台默认口令</b><span className="warn">独立复验通过</span></div>
        <div className="v-float v-float-3"><span>审批 AP-88</span><b>导出接口</b><span>等待人工确认</span></div>
      </div>
    </section>

    <div className="v-facts">
      <div><b>6</b><span>可剖析的系统分层</span><small>交互 → 基座，每层可点开</small></div>
      <div><b>21</b><span>控制台页面</span><small>全部可在演示中切换</small></div>
      <div><b>2</b><span>关联图 + 证据</span><small>探索图 · 资产图 · 流量</small></div>
      <div><b>0</b><span>浏览器内模型密钥</span><small>网关只监听回环地址</small></div>
    </div>

    <section className="v-section v-console-section" id="client">
      <div className="v-head">
        <div>
          <span className="v-eyebrow">CLIENT · AGENT HOME</span>
          <h2>客户端 Agent 首页，打开就是完整界面。</h2>
        </div>
        <p>官网只放截图，不把客户端塞进网页里。点开就是全屏应用外壳：会话、工具调用、审批、探索图与系统配置，全部可以点击。</p>
      </div>
      <div className="v-client-grid">
        <figure className="v-client-frame">
          <img src="assets/client/console-chat.jpg" alt="VEXNAR 客户端 Agent 首页：主 Agent 编排会话、工具调用与审批卡片" width="1600" height="1000" loading="eager" />
          <figcaption>
            <span>客户端真实界面截图 · 演示数据 · 不连接服务端</span>
            <a href="console.html">打开客户端体验<Icon name="chevronRight" size={12} /></a>
          </figcaption>
        </figure>
        <div className="v-client-side">
          <div className="v-client-list">
            {[
              ['chat', '对话与工具', '主 Agent、Planner 与 5 个 Worker 的会话；工具调用可以展开输入与输出。'],
              ['shield', '审批与拦截', '允许或拒绝会同步到审批记录与侧边栏角标；拦截规则可以启停。'],
              ['graph', '探索图与资产', '13 节点的探索链路、资产树、流量证据，都可以点开查看。'],
              ['settings', '系统装配', 'LLM、Agent、MCP、Skill、工具策略、日志与系统配置。']
            ].map(([icon, title, text]) => <div className="v-client-row" key={title}>
              <i><Icon name={icon} size={15} /></i>
              <div><b>{title}</b><p>{text}</p></div>
            </div>)}
          </div>
          <div className="v-client-actions">
            <a className="v-btn v-btn-primary" href="console.html"><Icon name="play" size={14} />打开客户端</a>
            <a className="v-btn v-btn-secondary" href="architecture.html"><Icon name="cube" size={14} />看背后的架构</a>
          </div>
          <p className="v-client-note">客户端页面不加载官网导航与页脚；窗口标题栏提供「返回官网」。演示状态只停留在当前页面，刷新即回到初始快照。</p>
        </div>
      </div>
    </section>

    <section className="v-section" id="capabilities">
      <div className="v-head">
        <div><span className="v-eyebrow">WORKFLOW</span><h2>任务、工具与证据，在同一个上下文里。</h2></div>
        <p>每张卡片都能点开对应的架构层，查看职责、契约与源码位置。</p>
      </div>
      <div className="v-cap-grid">
        {capabilities.map(item => <a className="v-cap" href={`architecture.html#layer-${item.layer}`} key={item.title}>
          <div className="v-cap-top"><span className="v-cap-icon"><Icon name={item.icon} size={17} /></span><em>{item.index}</em></div>
          <h3>{item.title}</h3>
          <p>{item.text}</p>
          <span className="v-cap-foot">在架构图中查看<Icon name="chevronRight" size={12} /></span>
        </a>)}
      </div>
    </section>

    <section className="v-section v-arch-wrap" id="architecture-3d">
      <div className="v-head">
        <div><span className="v-eyebrow">TECHNICAL ARCHITECTURE</span><h2>技术架构图，可以转起来看。</h2></div>
        <p>六层结构叠在一起，拖拽旋转、展开层间距、逐层剖析。每个节点都指向公开源码的文件与行号。</p>
      </div>
      <Architecture3D compact />
      <div className="v-arch-after">
        <div className="v-concept"><b><Icon name="orbit" size={15} />可交互的 3D 剖面</b><p>旋转视角、展开层间距、播放事件链导览；点击层或节点，右侧立刻显示职责、层间契约与需要警惕的失败模式。</p></div>
        <div className="v-concept"><b><Icon name="code" size={15} />来源可核对</b><p>节点引用固定提交下的源码行；架构页还提供四套节点级图：系统、缓存、工具调用与双图关联。</p></div>
        <div className="v-concept"><b><Icon name="shield" size={15} />边界写在图里</b><p>模型只在 Go 进程内访问，审批由配置决定，候选发现与确认结论分开记录——这些不是说明文字，而是结构。</p></div>
      </div>
    </section>

    <ArchitectureLab />

    <section className="v-section">
      <div className="v-context">
        <div>
          <span className="v-eyebrow">CONTEXT MANAGEMENT</span>
          <h2>长任务需要连续的上下文。</h2>
          <p>近期消息保留工具调用与结果的配对，较早的信息整理为滚动摘要。快照身份与内容版本决定摘要是否可以复用，避免把过期结论带进下一轮。</p>
          <a className="v-btn v-btn-secondary" href="architecture.html#layer-evidence" style={{ marginTop: 18 }}><Icon name="layers" size={14} />在证据层查看实现</a>
        </div>
        <div className="v-context-cards">
          <div className="v-context-card"><i>01</i><div><b>近期消息</b><p>结构化消息与工具结果，保持调用与结果成对出现。</p></div><small>保留原文</small></div>
          <div className="v-context-card"><i>02</i><div><b>滚动摘要</b><p>目标、事实与未完成事项整理成摘要，按需生成。</p></div><small>按需计算</small></div>
          <div className="v-context-card"><i>03</i><div><b>快照身份</b><p>SnapshotKey 与内容版本变化后，旧摘要不再复用。</p></div><small>命中才复用</small></div>
        </div>
      </div>
    </section>

    <section className="v-section">
      <div className="v-head"><div><span className="v-eyebrow">PROJECT</span><h2>开源项目正在发生的变化。</h2></div><p>版本、分支、提交与贡献者来自公开 GitHub 仓库；官网只展示公开字段。</p></div>
      <div className="v-link-grid">
        <a href="console.html"><Icon name="chat" size={17} /><b>客户端</b><p>全屏 Agent 首页：对话、工具调用、审批、探索图与系统配置。</p></a>
        <a href="architecture.html"><Icon name="cube" size={17} /><b>架构剖析</b><p>3D 分层、层间契约、设计取舍与四套节点级架构图。</p></a>
        <a href="releases.html"><Icon name="book" size={17} /><b>版本更新</b><p>公开发行说明、平台安装包与预发布信息。</p></a>
        <a href="credits.html"><Icon name="users" size={17} /><b>开源致谢</b><p>使用到的开源项目、交互参考与许可证来源。</p></a>
      </div>
    </section>

    <div className="v-cta">
      <div>
        <h2>从一次只读梳理开始。</h2>
        <p>下载 VEXNAR Harness 客户端，配置模型 profile，创建一个只读任务。所有工具调用与证据都留在本地工作区。</p>
      </div>
      <div className="v-cta-actions">
        <a className="v-btn v-btn-primary" href="downloads.html"><Icon name="download" size={15} />获取 VEXNAR</a>
        <External href={REPO} className="v-btn v-btn-secondary"><Icon name="github" size={15} />GitHub</External>
      </div>
    </div>
  </>;
}
