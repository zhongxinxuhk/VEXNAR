# 控制台：数据层与设计系统

> 作用域：`app/vexnar/ui`（dsh 客户端插件）。四个领域页——概览、任务、流量、代理池。
> 目标不是"再画一遍页面"，而是让**同一件事只有一个数、一个样子**。

## 1. 为什么改

改造前的问题不是缺功能，而是四个页面各长各的：

| 症状 | 证据 |
|---|---|
| 四套并行样式词汇 | `vx-ov-*`（概览）、`vx-cat-*`（流量/代理池）、`vx-task-*`（任务）、`vx-yak-*`（报文）。同一个"卡片"四种圆角与内边距 |
| token 引用了但从未定义 | `--vx-muted` 被引用 20+ 次、定义 0 次；深色下退化成透明文本 |
| 两条 HTTP 路径 | `api.ts` 不回超时、`tasks/api.ts` 不解析错误体，同一故障一处"一直转圈"、一处"HTTP 500" |
| 同一指标各算一遍 | 概览的流量总量读 `/api/traffic/capture`，流量页读 `/api/traffic`；代理池页不读租约与健康度 |
| 三个流量库没有一张页面能看全 | 会话抓包（kv）、采集面归档（Go 索引）、Web 测试引擎（`web_exchanges`） |

## 2. 结构

```
src/
  data/
    client.ts     唯一的 HTTP 出口：超时（默认 20s）、ApiError(status/code)、查询串、AbortSignal 合并
    query.ts      键控缓存：同 key 合并请求、stale-while-revalidate、invalidate(前缀)、useQuery/useAction
    resources.ts  接口 → 视图模型（snake_case 只在边界出现）；每个资源一个稳定 key；hooks 都在这里
    metrics.ts    派生指标：trafficMetrics / proxyMetrics / taskMetrics（比率给出分子分母）
    format.ts     纯格式化：字节、计数、百分比、时间、相对时间、状态码分段
    stream.ts     SSE：首帧 prime('proxy:state')，之后累积成有界事件环
    index.ts      统一出口
  components/
    kit.tsx       PageShell / Kpi / Card / Toolbar / Segmented / DataTable / Drawer / Empty / Skeleton / Banner / Field / Meter
  traffic/page.tsx   三源流量工作台
  egress/page.tsx    代理池控制台
  tasks/workspace.tsx 任务清单（详情十页签沿用既有实现）
  overview.tsx       概览（图表沿用，取数改走 resources）
```

约定：**页面里不允许出现 `fetch`，也不允许自己算比率**。前者保证超时与错误语义唯一，后者保证两个页面不会给出两个成功率。

## 3. 口径表（改数字前先看这里）

| 指标 | 查询键 | 公式 / 来源 | 出现在 |
|---|---|---|---|
| 流量总记录 | `traffic:totals` | `/api/traffic?size=1` 的 `count`（本地 ∪ 归档） | 概览「抓包流量」、流量页「总记录」 |
| 本地 / 归档 | 同上 | `count - archived` / `archived` | 流量页 KPI 副标 |
| 采样错误率 | `traffic:list:*` | 当前页 `4xx+5xx / 样本数`（卡片注明"近 N 条"） | 流量页 |
| Web 引擎请求 | `web:sessions` | 各会话 `requestCount` 之和 | 流量页状态条与分源计数 |
| 健康率 | `proxy:state` | 已启用节点中 `state==='up'` 的占比 | 代理池 KPI、概览健康度 |
| 加权成功率 | `proxy:state` | `(Σrequests-Σfailures)/Σrequests`，按请求加权而非按节点平均 | 代理池 KPI |
| 未入池节点 | `proxy:state` | 启用节点中不属于任何池 `members` 的数量 | 代理池 KPI（0 才说明池配全了） |
| 任务完成率 | `tasks:summary:30` | 服务端下发**百分数**（86.64），客户端只除以 100；`done / terminal` 只在缺字段时兜底 | 概览「任务总数」、任务页「完成率」 |
| 目标达成 | 同上 | `goal_rate` 同为百分数（75.0），同样除以 100 | 概览、任务页 |
| 漏洞分布 | `findings:stats` | 四个严重度直接取服务端计数（全量；任务汇总里的 findings 只统计近 30 天，两页都改用这个键） | 概览、任务页 |

## 4. 组件库

| 组件 | 用途 | 关键约束 |
|---|---|---|
| `PageShell` | 页面骨架 | 标题/说明/动作/状态条四段；所有页面同一套 padding |
| `Kpi` / `KpiGrid` | 指标卡 | `tone` 驱动渐变与状态色；`hint` 最多两行；可点击时渲染成 `button[aria-pressed]` |
| `Card` | 区块 | 头部可选；`scroll` 控制内容区滚动，不让整页抖动 |
| `Toolbar` | 过滤条 | 输入框按内容宽度排，一行能放三个筛选器 |
| `Segmented` | 视图切换 | `aria-pressed`，不是伪按钮 |
| `DataTable` | 表格 | `table-layout: fixed`（长主机名不撑横向滚动条）；表头 sticky；`sticky` 列固定在右侧 |
| `Drawer` | 详情检查器 | `createPortal` 到 body（设置弹窗的 transform 会改写 `position: fixed`）；Esc 关闭 |
| `EmptyState` / `Skeleton` / `Banner` | 三态 | 空、加载、错误各一个，不允许页面自造 |

样式全部在 `styles.ts` 的 `.vx-ui-*` 段；颜色只走 `--vx-*` 桥，深色与换皮不写第二份。

## 5. 报文查看器（请求 / 响应成对）

`src/packet-view.tsx` 是唯一的报文渲染入口，流量页与会话弹窗共用：

| 能力 | 实现 |
|---|---|
| 不割裂 | 请求与响应**并排**（宽屏各占一半），可切「上下」；任一侧缺失给出占位（"这条记录没有保存响应报文"），不留白 |
| 词法着色 | `http-packet.ts` 分词：起始行（方法/URL/协议）、头部名、头部值、**会话凭据**、正文（JSON 的 key/string/number、HTML 标签、form、二进制）各一色 |
| 会话高亮 | `Cookie` / `Set-Cookie` / `Authorization` / `Proxy-Authorization` / `X-Api-Key` / `X-CSRF-Token` 等整行走 `--vx-syn-session`（紫），排查越权与会话固定时一眼可见 |
| 头部 vs 正文 | 正文单独包一层 `.vx-pkt-body`：左侧竖线 + 2.5% 底色，颜色之外再给块级边界 |
| 补全 | 行号独立一列（换行时正文从第二列续）；缺报文/二进制/截断各有明确标注；美化 ↔ 原文 ↔ HEX 三态；每侧独立搜索与命中计数 |

`vx-yak-*` 的样式沿用，行号列由 `.vx-pkt-ln` 实现；`yak-history.tsx` 不再自带一份渲染。

## 6. 会话流量（chat 头部）

`会话流量` 弹窗按**归属**组织，而不是按工具组织：

| 项 | 来源 | 说明 |
|---|---|---|
| 归属 scope | `/api/sessions/:id/traffic/endpoint` | 形如 `session-<id>`；宿主给的 id 已带 `session-` 前缀，`sessionKey()` 统一剥一层，避免 `session-session-` |
| 报文列表 | `/api/sessions/:id/traffic?limit=300` | 只包含本 scope 抓到的记录，与站点级「流量」页分开计数 |
| 报文详情 | `/api/sessions/:id/traffic/exchange?id=` | 服务端校验 exchange 属于该 scope，越权返回 403 |
| 采集开关 | `POST /api/sessions/:id/traffic/capture` | `start`/`stop` 只影响本会话；弹窗里同时给出代理地址与 CA |
| Yak | `GET /api/yak/sources` | **可选**来源。未配置时只是一行说明，不渲染成红色错误 |

chat 头部只保留一个入口（`流量`）：宿主的 header slot 只实际渲染第一个占位，第二个登记从不上屏，
所以采集控制收进弹窗（空态里有「开始抓包」，页脚有「停止抓包」），避免出现"测试里有、界面上没有"的幽灵按钮。

## 7. 四页信息架构

- **流量**：KPI（总量/站点/错误率/体积）→ 分源切换（采集流量 / Web 引擎 / Yak 内核）→ 过滤 + 表格 → 右侧 Top 站点、状态分布、活跃抓包 → 存储维护。行点击开检查器：报文、cURL、来源。
- **代理池**：KPI（节点/健康率/加权成功率/延迟/租约/未入池）→ 池表（覆盖率、成员管理、设默认）→ 节点表（状态/延迟/成功率/出口，操作列粘右）→ 租约 → 订阅 → 右侧池覆盖率、SSE 事件、入口地址。
- **任务**：KPI（总数/进行中/已完成/完成率/目标达成/漏洞）→ 搜索与状态筛选 → 表格（状态、目标、漏洞、Token、最近活动）→ 详情十页签。
- **概览**：日期筛选 → 四张 KPI → Token 走势与缓存效率 → 漏洞/任务/热力图/活动流/流量健康度。

## 8. 一致性验收（改完跑一遍）

```sh
pnpm --filter @vexnar/dsh-ui run typecheck
pnpm --filter @vexnar/dsh-ui run build
pnpm --filter @vexnar/dsh-ui run test     # 冒烟断言：四个面板都注册、共享键存在、token 已定义
pnpm run typecheck                        # 全仓
```

人工核对三条：

1. 概览「抓包流量」= 流量页「总记录」（同一个 `traffic:totals`）；
2. 概览「任务完成率」= 任务页「完成率」（同一个 `tasks:summary`，客户端不重算）；
3. 代理池 KPI 的「可用 + 抖动 + 不可用 + 冷却 + 未测」= 节点总数。

## 9. 加一个页面

1. `data/resources.ts` 加类型化 fetcher + hook（key 里编码全部参数）；
2. 需要新指标就加到 `metrics.ts`，不要在组件里算；
3. 页面用 `PageShell` + `KpiGrid` + `Card` + `DataTable` 组合，详情一律走 `Drawer`；
4. `client.tsx` 的 `PANELS` 加一条，同步补 `test/client.smoke.test.ts` 的期望列表。

## 10. 两个被截图暴露的 bug（已修）

| 现象 | 根因 | 修法 |
|---|---|---|
| 任务页「完成率 8663.8% / 目标达成 7500.0%」 | `/api/tasks/summary` 下发的是百分数，`fmtPercent` 收的是 0..1 比例 | 在 `taskMetrics()` 里除以 100，页面不再做单位换算 |
| 流量表「时间」整列显示 `2026/11/21…` | `fmtTime` 非当天返回完整日期 + 时分秒，宽过 96px 的列 | 非当天改为 `MM-DD HH:MM`，完整值挂 `title` 悬停可见 |

## 11. 已知边界

- 流量表的"错误率/体积"只描述当前页样本（卡片已注明"近 N 条"）；全量错误率需要后端聚合，目前没有这个接口。
- Web 引擎的请求记录与抓包记录是**两个库**，只在页面上并列展示，不做跨库 join。
- SSE 断线时退化为 10s 轮询；事件环只保留最近 40 条，历史事件不落库。
- 概览的 Token 走势依赖 `/api/tokens/daily`，该接口不可用时图表降级为空，不影响其它 KPI。
