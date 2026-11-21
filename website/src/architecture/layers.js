// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

// Six layers of the running product, from the browser surface down to
// PostgreSQL. Every node points at a public source file so the 3D view can be
// read as an index into the implementation rather than a marketing graphic.
export const layers = [
  {
    id: 'interaction',
    index: '01',
    name: '交互层',
    en: 'INTERACTION',
    tone: 'cyan',
    tagline: '控制台 · 外部 Agent · 事件流',
    purpose: '人在这里配置目标、观察执行、介入审批；外部 Agent 通过 MCP 与模型网关接入同一份任务状态。',
    facts: [['表面', 'Web 控制台 / MCP / REST'], ['状态', '无独立模型运行时'], ['刷新', 'HTTP + SSE']],
    nodes: [
      { id: 'web', label: 'Web 工作台', sub: '静态导出 · React', icon: 'dashboard', source: 'web/src/app/(main)/layout.tsx', line: 24, tags: ['Next.js', '静态导出'], detail: '控制台是 Next.js 静态导出的客户端，由 Go 服务内嵌提供；布局偏好在浏览器侧读取，避免依赖服务端渲染。' },
      { id: 'external', label: '外部 Agent 客户端', sub: 'MCP · 模型网关', icon: 'bot', source: 'web/src/lib/api.ts', line: 152, tags: ['MCP', 'OpenAI 兼容'], detail: '外部 Agent 通过 MCP 工具面与 OpenAI 兼容网关接入，不自行维护模型目录，也不直接调用上游。' },
      { id: 'sse', label: '事件订阅', sub: 'SSE · 增量刷新', icon: 'radio', source: 'web/src/lib/api.ts', line: 189, tags: ['SSE', '增量'], detail: '任务活动通过事件流推送；断线重连后按任务重放，界面不轮询整张表，减少读数抖动。' },
      { id: 'scripts', label: '命令行与脚本', sub: 'REST + token', icon: 'terminal', source: 'server/server.go', line: 719, tags: ['REST', 'JWT'], detail: '安装脚本、运维与自动化使用同一套 HTTP 约定；鉴权、错误码与界面完全一致。' }
    ],
    contracts: [
      ['HTTP JSON', 'Authorization: Bearer <jwt>', '401 / 403 直接拒绝'],
      ['SSE', 'text/event-stream · 按任务订阅', '断线重连后按任务重放'],
      ['模型网关', '回环地址 + 每次启动的 token', 'token 未配置时网关关闭']
    ],
    risks: ['把模型密钥写进浏览器', '界面自行维护第二份模型目录', '用轮询代替事件流导致读数抖动']
  },
  {
    id: 'gateway',
    index: '02',
    name: '接入层',
    en: 'GATEWAY',
    tone: 'blue',
    tagline: '路由 · 鉴权 · 广播 · 网关',
    purpose: '把外部请求收敛成服务端方法调用，并在同一处完成鉴权、事件广播与模型访问边界。',
    facts: [['路由', 'net/http 方法路由'], ['鉴权', 'JWT · 7 天'], ['模型', '仅回环']],
    nodes: [
      { id: 'router', label: 'HTTP 路由', sub: 'net/http · 方法路由', icon: 'network', source: 'server/server.go', line: 719, tags: ['net/http', '路由表'], detail: '路由按资源分组注册：鉴权、任务、资产、发现、MCP、拦截与更新，处理函数共享同一套 JSON 错误约定。' },
      { id: 'auth', label: '会话与密钥', sub: 'JWT · 安装时生成', icon: 'key', source: 'server/auth.go', line: 59, tags: ['JWT', 'jwt.key'], detail: '签名密钥在安装时生成并保存在数据目录之外；会话 token 有效期 7 天，修改密码会重新签发。' },
      { id: 'ssehub', label: '事件广播', sub: '每任务订阅通道', icon: 'radio', source: 'server/broadcast.go', line: 28, tags: ['Broadcaster', '缓冲 256'], detail: '每个任务维护一组订阅通道，活动写入后广播；订阅方必须释放，避免任务结束后泄漏通道。' },
      { id: 'llmgw', label: '模型网关', sub: '回环 + 一次性 token', icon: 'plug', source: 'server/desktop_gateway.go', line: 44, tags: ['loopback', 'token'], detail: 'OpenAI 兼容网关只接受回环请求与启动时注入的 token；上游地址与密钥永远不离开 Go 进程。' }
    ],
    contracts: [
      ['交互层 → 接入层', 'JSON 请求体 + Bearer token', '鉴权失败不进入业务层'],
      ['接入层 → 编排层', '进程内方法调用', '业务冲突返回 409'],
      ['接入层 → 模型服务', 'Profile 解析后的 Provider', '上游错误按可重试性分类']
    ],
    risks: ['把网关暴露到非回环地址', 'token 复用导致越权', '广播无缓冲造成写阻塞']
  },
  {
    id: 'orchestration',
    index: '03',
    name: '编排层',
    en: 'ORCHESTRATION',
    tone: 'violet',
    tagline: '任务 · 引擎 · 规划 · Worker',
    purpose: '任务是生命周期的容器；引擎驱动规划循环，Planner 产出意图，Worker 池并行执行，任何一步都能暂停、恢复与取消。',
    facts: [['生命周期', 'Manager'], ['循环', 'Engine 规划轮'], ['并行', 'Worker 池']],
    nodes: [
      { id: 'manager', label: 'Task Manager', sub: '生命周期 · 并发上限', icon: 'target', source: 'server/manager.go', line: 348, tags: ['生命周期', '并发'], detail: 'Manager 持有任务运行时：创建、暂停、恢复、排空与删除；Worker 数与并发上限是服务级配置。' },
      { id: 'engine', label: 'Engine', sub: '规划循环 · 取消因', icon: 'cpu', source: 'server/engine.go', line: 316, tags: ['Resume', '取消因'], detail: '每个任务运行独立规划循环；暂停与取消通过 context 与取消因传播，避免 goroutine 悬挂。' },
      { id: 'planner', label: 'Planner', sub: '意图生成 · 共享待办', icon: 'brain', source: 'agent/planner.go', line: 59, tags: ['Plan', 'Intent'], detail: '规划者读取探索图与任务上下文，生成意图并维护跨轮共享待办，让长任务延续目标。' },
      { id: 'mainagent', label: '主 Agent', sub: '对话 · 委派', icon: 'bot', source: 'agent/mainagent.go', line: 65, tags: ['对话', '委派'], detail: '主 Agent 对用户消息做出响应，决定是直接调用工具还是把意图委派给 Worker。' },
      { id: 'worker', label: 'Worker 池', sub: '领取意图 · 写回', icon: 'users', source: 'server/engine.go', line: 234, tags: ['goroutine', '意图'], detail: 'Worker 领取意图执行，结果写回探索图；写回触发图变更事件，成为下一轮规划的输入。' },
      { id: 'recovery', label: '恢复与暂停', sub: '取消原因 · 超时', icon: 'refresh', source: 'server/engine.go', line: 188, tags: ['Pause', 'Timeout'], detail: '暂停会记录原因；恢复时重新读取图状态继续推进，超时与用户取消分别记录，便于追溯。' }
    ],
    contracts: [
      ['接入层 → 编排层', '任务命令 + 配置快照', '未知任务返回 404'],
      ['编排层 → 智能层', '意图 + 工具清单 + 上下文窗口', '工具错误作为结果返回'],
      ['编排层 → 证据层', '节点写入 + 锚点', '事务失败回滚并重试']
    ],
    risks: ['规划循环无界导致成本失控', '暂停后仍有工具在运行', 'Worker 写回覆盖他人事实']
  },
  {
    id: 'intelligence',
    index: '04',
    name: '智能层',
    en: 'INTELLIGENCE',
    tone: 'amber',
    tagline: 'Agent 运行时 · 工具 · 审查 · 模型',
    purpose: 'Agent 在这里获得工具与上下文；每次调用先过审查，再进入执行适配器，模型访问统一走 Provider 池。',
    facts: [['工具', '装配 + 延迟发现'], ['审查', 'PreToolUse'], ['模型', 'Provider 池']],
    nodes: [
      { id: 'runtime', label: 'Agent 运行时', sub: '上下文 · 工具循环', icon: 'bot', source: 'agent/tools.go', line: 171, tags: ['ToolSet', '上下文'], detail: '运行时把近期消息、摘要与工具定义装进请求；工具结果回到会话，事实与资产写入图中。' },
      { id: 'assembly', label: '工具装配', sub: '可见性 · 绑定 · 覆盖', icon: 'wrench', source: 'agent/assembly.go', line: 43, tags: ['AugmentTools', 'panic 恢复'], detail: '装配阶段合并内置工具、Skills 与 MCP 工具，应用数据库绑定与默认参数，并包装 panic 恢复。' },
      { id: 'deferred', label: '延迟工具发现', sub: 'Schema · 解锁集合', icon: 'layers', source: 'agent/deferred.go', line: 22, tags: ['DeferredInfo', 'UnlockSet'], detail: 'MCP Schema 可以延迟暴露以缩小首轮上下文；可见的工具名不等同于调用权限。' },
      { id: 'guard', label: 'Guard 审查', sub: 'PreToolUse · allow/deny/ask', icon: 'shield', source: 'guard/guard.go', line: 61, tags: ['PreToolUse', 'ask'], detail: '进入范围的调用匹配拦截规则；deny 阻止，allow 放行并记录，ask 创建审批等待人工确认。' },
      { id: 'mcp', label: 'MCP 客户端', sub: 'stdio · HTTP · SSE', icon: 'plug', source: 'server/mcpdiscover.go', line: 28, tags: ['tools/list', '持久化'], detail: '按传输方式建立连接并执行 tools/list，把目录写入 PostgreSQL，界面可离线展示。' },
      { id: 'pool', label: 'LLM Provider 池', sub: '复用 · 熔断 · 故障转移', icon: 'cpu', source: 'server/llmpool.go', line: 84, tags: ['Profile', 'Failover'], detail: '相同配置复用 Provider 与限流器；可选故障转移链共享熔断状态，绑定配置默认独占。' }
    ],
    contracts: [
      ['编排层 → 智能层', '意图 + 工具 + 上下文', '超时按工具错误返回'],
      ['智能层 → 证据层', 'ToolSet 写入（事实 / 资产 / 发现）', '写入失败不伪造成功'],
      ['智能层 → 模型服务', 'Provider.Chat(stream)', '429 / 5xx 按策略重试']
    ],
    risks: ['工具可见性失控', '审查被配置成完全放行', '上下文无限增长挤占预算']
  },
  {
    id: 'evidence',
    index: '05',
    name: '证据层',
    en: 'EVIDENCE',
    tone: 'green',
    tagline: '双图 · 流量 · 复验 · 报告',
    purpose: '探索图记录任务怎样推进，资产图记录对象是什么；流量与复验把结论钉在可回看的证据上。',
    facts: [['探索图', '意图 / 事实 / 发现'], ['资产图', '域名 / 服务 / 端点'], ['复验', '独立会话']],
    nodes: [
      { id: 'exploration', label: '探索图', sub: '意图 · 事实 · 发现', icon: 'graph', source: 'db/exploration.go', line: 205, tags: ['Node', 'Edge', 'Anchor'], detail: '节点带 kind、优先级、状态与来源；边记录派生、产出与证明关系；锚点连接资产对象。' },
      { id: 'assets', label: '资产图', sub: '域名 · 服务 · 端点', icon: 'network', source: 'db/assets.go', line: 259, tags: ['Upsert', '归并'], detail: '跨任务共享的资产真值：主域、子域、IP、服务与应用按归并规则收敛，保留首次发现来源。' },
      { id: 'traffic', label: '流量证据', sub: '记录型代理', icon: 'activity', source: 'traffic/traffic.go', line: 180, tags: ['Proxy', 'Evidence'], detail: '记录型代理保留请求与响应，凭据在落盘前脱敏；发现可绑定到具体流量记录。' },
      { id: 'verify', label: '发现与复验', sub: '候选 ≠ 结论', icon: 'shield', source: 'agent/finding_workflow.go', line: 29, tags: ['独立会话', '复验'], detail: 'report_finding 提交后触发独立复验会话；候选发现与确认结论分别记录，避免自证。' },
      { id: 'report', label: '报告', sub: 'Markdown 渲染', icon: 'scroll', source: 'report/report.go', line: 53, tags: ['Markdown', '导出'], detail: '报告由同一份图数据渲染，验证范围与证据引用可回溯到节点与流量。' },
      { id: 'digest', label: '上下文摘要', sub: '快照身份 · 内容版本', icon: 'layers', source: 'sidequestion/context.go', line: 213, tags: ['SnapshotKey', 'TailStart'], detail: '摘要命中要求快照身份与保留边界同时匹配；图摘要按成员与锚点的内容版本签名复用。' }
    ],
    contracts: [
      ['智能层 → 证据层', '事实 / 资产 / 发现写入', '冲突时保留两侧来源'],
      ['证据层 → 编排层', '图变更事件', '事件丢失后由下一轮读取兜底'],
      ['证据层 → 交互层', '查询结果 + 证据引用', '只读查询不改变状态']
    ],
    risks: ['候选发现被当成结论展示', '证据缺失导致结论不可复核', '跨任务资产被误当作授权范围']
  },
  {
    id: 'substrate',
    index: '06',
    name: '基座',
    en: 'SUBSTRATE',
    tone: 'slate',
    tagline: 'PostgreSQL · 文件 · 通知 · 更新',
    purpose: '所有需要跨进程存活的状态落在这里：图与任务、工作目录、通知渠道、更新与密钥。',
    facts: [['数据库', 'PostgreSQL'], ['文件', '任务工作目录'], ['更新', '自更新 + 回滚']],
    nodes: [
      { id: 'pg', label: 'PostgreSQL', sub: '任务 · 双图 · 账号', icon: 'database', source: 'db/db.go', line: 96, tags: ['DSN', '迁移锁'], detail: '连接串由环境或配置解析；模式迁移带咨询锁，避免多实例同时升级。' },
      { id: 'fs', label: '任务工作目录', sub: '笔记 · 证据 · 报告', icon: 'folder', source: 'agent/mainagent.go', line: 65, tags: ['workDir', '隔离'], detail: '每个任务有独立工作目录，工具输出与报告草稿落盘；不在数据库里塞二进制。' },
      { id: 'notify', label: '通知渠道', sub: 'Webhook · 摘要', icon: 'bell', source: 'server/notifier.go', line: 100, tags: ['Webhook', 'Digest'], detail: '通知器按渠道与频率发送；实时与摘要两条路径共享配额与重试策略。' },
      { id: 'update', label: '自更新', sub: '校验 · 暂存 · 回滚', icon: 'download', source: 'selfupdate/selfupdate.go', line: 60, tags: ['Stage', 'Rollback'], detail: '更新先下载到暂存目录并校验哈希，再替换二进制；失败时保留回滚标记与上一版本。' }
    ],
    contracts: [
      ['证据层 → 基座', 'SQL 事务 / 文件写入', '迁移失败拒绝启动'],
      ['基座 → 接入层', '会话与密钥读取', '密钥缺失时初始化流程'],
      ['基座 → 编排层', '任务与图状态', '连接断开时任务暂停']
    ],
    risks: ['数据库无备份', '工作目录权限过宽', '更新中断留下半新半旧二进制']
  }
];

export const lifecycle = [
  { id: 'lc1', event: 'task.created', layer: 'orchestration', node: 'manager', text: 'Manager 写入任务行，初始化探索图根节点与工作目录。' },
  { id: 'lc2', event: 'engine.round', layer: 'orchestration', node: 'engine', text: 'Engine 启动一轮规划循环，读取任务当前前沿。' },
  { id: 'lc3', event: 'planner.plan', layer: 'orchestration', node: 'planner', text: 'Planner 生成意图与优先级，写入探索图并保留派生边。' },
  { id: 'lc4', event: 'worker.claim', layer: 'orchestration', node: 'worker', text: 'Worker 领取意图，装配本次调用可用的工具与上下文。' },
  { id: 'lc5', event: 'guard.pre_tool_use', layer: 'intelligence', node: 'guard', text: '每次工具调用先过 PreToolUse：命中规则则 allow / deny / ask。' },
  { id: 'lc6', event: 'approval.asked', layer: 'intelligence', node: 'guard', text: 'ask 分支创建审批并等待；拒绝、超时或任务取消都不继续执行。' },
  { id: 'lc7', event: 'tool.result', layer: 'evidence', node: 'exploration', text: '工具结果回到会话，事实、资产与发现经 ToolSet 写入图中。' },
  { id: 'lc8', event: 'finding.verified', layer: 'evidence', node: 'verify', text: 'report_finding 触发独立复验会话，确认结论与候选分开记录。' }
];

export const contracts = [
  ['交互层', '接入层', 'JSON + Bearer token / SSE', '401 · 403 · 409', '鉴权与业务错误共用错误体'],
  ['接入层', '编排层', '任务命令、配置快照', '404 · 409', '未知任务与并发冲突分开返回'],
  ['编排层', '智能层', '意图、工具清单、上下文窗口', '工具错误作为结果', '单次工具失败不终止任务'],
  ['智能层', '证据层', '事实、资产、发现、流量引用', '事务回滚 + 重试', '写入失败不得伪造成功'],
  ['证据层', '编排层', '图变更事件', '下一轮读取兜底', '事件不是唯一真值来源']
];

export const decisions = [
  { title: '模型访问只在 Go 服务端', text: 'Provider、目录、凭据与故障转移都留在服务端；客户端只看到 profile 名称，不持有上游地址。', tone: 'blue' },
  { title: '双图分开建模', text: '探索图回答「任务怎样推进」，资产图回答「对象是什么」。锚点连接两者，避免一张图同时承担流程与对象。', tone: 'green' },
  { title: '候选发现与结论分离', text: '提交发现只产生候选，独立复验会话复现后才记为确认；报告中两者标注不同状态。', tone: 'amber' },
  { title: '审批由配置决定', text: 'allow / deny / ask 是规则与拦截评估的结果，不是固定在代码里的策略；任务可带自己的拦截规则。', tone: 'violet' },
  { title: '上下文按身份复用', text: '摘要复用要求快照身份与保留边界匹配，图摘要按内容版本签名；不做跨任务共享的全局缓存。', tone: 'cyan' },
  { title: '可见不等于可用', text: '延迟发现缩小首轮上下文；工具名可见，但调用仍需通过解锁集合与审查。', tone: 'slate' }
];

export const layerById = Object.fromEntries(layers.map(layer => [layer.id, layer]));
export const nodeById = Object.fromEntries(layers.flatMap(layer => layer.nodes.map(node => [node.id, { ...node, layer: layer.id }])));
