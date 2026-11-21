// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

export const sourceRevision = 'c33874497a672f08276fb8e842139df0f66bdffa';

/**
 * One box of a node-level architecture diagram. `x`/`y` are layout coordinates
 * consumed by the 3D view, `source`/`line` point at the public file that backs
 * the claim, and `tags` are the short capability labels shown on the card.
 */
export interface ArchNode {
  id: string;
  label: string;
  subtitle: string;
  x: number;
  y: number;
  detail: string;
  source: string;
  line: number;
  tags: string[];
}

/** A directed relation between two node ids of the same diagram. */
export type ArchEdge = [from: string, to: string];

/** One architecture view: its copy, its nodes, its edges and its tour order. */
export interface ArchDiagram {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
  sequence: string[];
}

const node = (id: string, label: string, subtitle: string, x: number, y: number, detail: string, source: string, line = 1, tags: string[] = []): ArchNode => ({ id, label, subtitle, x, y, detail, source, line, tags });
export const architectures: ArchDiagram[] = [
  {
    id: 'system', label: '系统架构', eyebrow: 'SYSTEM ARCHITECTURE', title: 'Go 服务端与任务编排',
    description: '客户端负责呈现与控制。任务生命周期、模型配置、Agent 编排和双图真值由 Go 服务与 PostgreSQL 承载。',
    nodes: [
      node('client', 'Web 工作台', '展示 · 控制 · 人在环路', 60, 45, 'Next.js 静态界面经 Go 内嵌提供，使用 HTTP API 与 SSE 观察任务，并通过对话与审批介入流程。', 'README.md', 335, ['HTTP', 'SSE']),
      node('api', 'Go API', '鉴权 · 路由 · 事件', 385, 45, 'net/http 路由组织任务和配置接口。模型访问由服务端管理，界面不承担第二套模型运行时。', 'server/server.go', 655, ['net/http', 'JWT']),
      node('models', '模型服务层', 'Profile · Provider · Failover', 710, 45, '按配置复用 Provider 和限流器；可选故障转移链共享进程级熔断状态，绑定配置默认保持独占。', 'server/llmpool.go', 10, ['Provider reuse', 'Circuit breaker']),
      node('planner', 'Planner', '规划 · 共享待办 · 意图', 60, 225, '规划者读取探索图与任务上下文，生成意图。跨轮共享的待办让多轮任务延续目标与推进方向。', 'README.md', 450, ['Plan', 'Intent']),
      node('engine', '任务编排', 'Manager · Engine', 385, 225, 'Manager 管理任务生命周期。每个任务运行规划循环与多个 Worker，处理领取、超时、暂停与排空。', 'server/engine.go', 1, ['Lifecycle', 'Worker goroutines']),
      node('worker', 'Worker', '执行 · 工具 · 写回', 710, 225, 'Worker 领取意图，通过工具完成探索，将事实、资产和发现写回。变化成为下一轮规划的输入。', 'agent/tools.go', 56, ['Execute', 'Write back']),
      node('assets', '资产图', '跨任务共享的资产真值', 60, 405, '域名、IP、服务、应用与端点在全局资产图归并。锚点将资产与任务中的探索节点关联。', 'README.md', 395, ['PostgreSQL', 'Asset graph']),
      node('exploration', '探索图', '任务内的意图与证据血缘', 385, 405, '目标、意图、事实和发现构成任务内的推进链。锚点把探索过程与资产对象连接起来。', 'db/exploration.go', 1, ['PostgreSQL', 'Provenance']),
      node('support', '支撑服务', 'MCP · 代理 · 审批 · 报告', 710, 405, '工具扩展、记录型流量代理、可配置拦截和报告交付为执行提供支撑。各能力按任务与配置接线。', 'README.md', 350, ['MCP', 'Traffic evidence'])
    ],
    edges: [['client', 'api'], ['api', 'models'], ['api', 'engine'], ['engine', 'planner'], ['engine', 'worker'], ['planner', 'exploration'], ['worker', 'support'], ['worker', 'exploration'], ['exploration', 'assets']],
    sequence: ['client', 'api', 'engine', 'planner', 'worker', 'exploration', 'assets']
  },
  {
    id: 'cache', label: '缓存设计', eyebrow: 'CACHE & CONTEXT', title: '缓存与上下文复用策略',
    description: '不同数据采用不同复用策略。配置变更、快照身份、内容版本与 TTL 分别决定何时复用、何时重建。',
    nodes: [
      node('request', '服务端请求', '按数据用途选择策略', 60, 220, '按数据语义进入相应的复用路径。这里展示代码中的几种机制，不代表每次请求都会经过所有缓存。', 'server/server.go', 562, ['按用途分流']),
      node('provider', 'Provider 复用', '配置 ID + 代际校验', 385, 20, '同一 Profile 共享 Provider 与限流器。缓存写入前复核代际；保存、激活、删除或绑定变更时失效，下轮重新解析。', 'server/server.go', 562, ['Memory', 'Generation invalidation']),
      node('mcp', 'MCP 工具目录', '发现后持久化', 385, 120, '连接 MCP 执行 tools/list，再把名称和描述保存到 PostgreSQL。界面可以离线展示目录；显式重新发现会刷新内容。', 'server/mcpdiscover.go', 51, ['PostgreSQL', 'Refresh on discovery']),
      node('snapshot', '旁路上下文', '快照身份 + 保留边界', 385, 220, '摘要命中需要 SnapshotKey、TailStart 与已有摘要同时匹配。近期消息保留结构化表示，快照改变后不会复用旧摘要。', 'sidequestion/context.go', 213, ['SnapshotKey', 'TailStart']),
      node('digest', '探索图摘要', '内容版本签名', 385, 320, '成员与锚点的 ID、content_version 参与 SHA-256 签名。签名一致复用已存摘要；成员或锚点变化会使签名改变。', 'agent/coldgraph.go', 280, ['Content version', 'SHA-256']),
      node('release', '版本查询缓存', '成功 30 分钟 / 错误 2 分钟', 385, 420, '查询由互斥锁合并。显式强制检查可绕过 TTL；用户取消的请求不写入错误缓存。此机制属于应用后端的更新查询。', 'server/update.go', 58, ['TTL', 'Mutex']),
      node('result', '按需复用', '命中复用 · 未命中再构建', 710, 220, '复用降低重复初始化、查询或摘要生成的需要。具体收益依赖工作负载，图中不提供未经测量的命中率或性能数字。', 'server/update.go', 85, ['Policy-specific reuse'])
    ],
    edges: [['request', 'provider'], ['request', 'mcp'], ['request', 'snapshot'], ['request', 'digest'], ['request', 'release'], ['provider', 'result'], ['mcp', 'result'], ['snapshot', 'result'], ['digest', 'result'], ['release', 'result']],
    sequence: ['request', 'provider', 'mcp', 'snapshot', 'digest', 'release', 'result']
  },
  {
    id: 'tools', label: '工具调用', eyebrow: 'TOOL EXECUTION PIPELINE', title: '工具调用与结果写回',
    description: '工具装配、运行前审查、执行与结果写回各有职责。点击节点，查看链路中的约束与实现。',
    nodes: [
      node('intent', '任务意图', 'Planner 规划 / Worker 领取', 60, 45, 'Worker 以任务图中的意图为上下文执行；工具能力由当前 Agent 的配置与可见性决定。', 'agent/tools.go', 56, ['Task context']),
      node('catalog', '工具装配', '内置工具 + Skills + MCP', 385, 45, 'AugmentTools 装配可见扩展，ToolResolve 应用数据库绑定、覆盖与默认参数，最后包装 panic 恢复。', 'agent/assembly.go', 26, ['Visibility', 'ToolResolve']),
      node('deferred', '延迟工具发现', '按需提供 Schema / 解锁', 710, 45, 'MCP Schema 可延迟暴露；Skill 加载与会话历史恢复维护解锁集合。可见的工具名称不等同于已经解锁的调用权限。', 'agent/deferred.go', 10, ['Deferred tools', 'UnlockSet']),
      node('guard', 'PreToolUse 审查', '可配置规则与审查模型', 710, 225, '进入拦截范围的工具会匹配配置规则；未命中时可调用启用的审查模型。审查行为取决于用户配置。', 'guard/guard.go', 55, ['PreToolUse', 'Configured rules']),
      node('approval', '允许 / 拒绝 / 询问', '审批分支', 385, 225, 'deny 阻止调用，allow 放行并记录；ask 创建审批并等待。拒绝、超时或任务取消时不继续执行。', 'guard/guard.go', 102, ['allow', 'deny', 'ask']),
      node('execute', '执行适配器', 'Bash · HTTP · MCP', 60, 225, '获准的调用进入工具处理器。MCP 按 stdio、Streamable HTTP 或 SSE 连接；执行错误以工具结果返回。', 'server/mcpdiscover.go', 24, ['stdio', 'HTTP / SSE']),
      node('evidence', '结果与证据', '流量 · 事实 · 资产', 60, 405, '工具结果回到会话；事实、资产与发现经 ToolSet 写入图中。记录型代理为网络探索保留流量证据。', 'agent/tools.go', 56, ['Tool result', 'Evidence']),
      node('verify', '独立验证', '发现提交后排队验证', 385, 405, 'report_finding 成功提交后触发独立验证会话。候选发现与确认结论分开处理，以实测复现支持确认。', 'agent/tools.go', 59, ['Finding workflow']),
      node('feedback', '规划反馈', '图变化唤醒下一轮', 710, 405, '写回的事实、提示和发现支撑下一轮规划；人与任务运行中的纠偏也可成为新的上下文。', 'agent/tools.go', 98, ['Event-driven loop'])
    ],
    edges: [['intent', 'catalog'], ['catalog', 'deferred'], ['deferred', 'guard'], ['guard', 'approval'], ['approval', 'execute'], ['execute', 'evidence'], ['evidence', 'verify'], ['verify', 'feedback']],
    sequence: ['intent', 'catalog', 'deferred', 'guard', 'approval', 'execute', 'evidence', 'verify', 'feedback']
  },
  {
    id: 'graphs', label: '双图关联', eyebrow: 'DUAL GRAPH INTELLIGENCE', title: '探索图与资产图的关联',
    description: '探索图回答任务怎样推进；资产图回答对象是什么。锚点建立关联，保留从意图到事实、从发现到资产的来源。',
    nodes: [
      node('goal', 'Goal', '目标', 60, 45, '用户目标进入任务探索图，作为后续意图与事实的上下文。', 'README.md', 395, ['Exploration graph']),
      node('intent', 'Intent', '待执行方向', 385, 45, '规划者生成探索意图，由 Worker 领取与执行。边关系记录意图从何处派生。', 'README.md', 395, ['spawns', 'derived_from']),
      node('fact', 'Fact / Finding', '事实与发现', 710, 45, '执行产出的事实与候选发现写入任务图，通过 yields / proves 等关系保留推进血缘。', 'README.md', 395, ['yields', 'proves']),
      node('anchor', 'Exploration Anchors', 'node_id ↔ asset_id', 385, 225, 'exploration_anchors 连接探索节点与资产对象，支持按资产反查测试方向、证据和结论。', 'README.md', 395, ['Provenance link']),
      node('domain', 'Domain / IP', '域名与地址', 60, 405, '资产图跨任务共享。域名、子域和 IP 在资产存储中统一归并。', 'README.md', 395, ['Asset graph']),
      node('service', 'Service / App', '服务与应用', 385, 405, '服务和应用接续域名或地址关系，沉淀可复用的目标上下文。', 'README.md', 395, ['Global assets']),
      node('endpoint', 'Endpoint', '接口与端点', 710, 405, '端点关联具体资产对象；与探索锚点结合，支撑覆盖度与已测方向展示。', 'README.md', 395, ['Coverage'])
    ],
    edges: [['goal', 'intent'], ['intent', 'fact'], ['intent', 'anchor'], ['fact', 'anchor'], ['anchor', 'service'], ['domain', 'service'], ['service', 'endpoint']],
    sequence: ['goal', 'intent', 'fact', 'anchor', 'service', 'endpoint']
  }
];
