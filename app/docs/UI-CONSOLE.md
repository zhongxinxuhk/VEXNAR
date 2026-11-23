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
| 任务完成率 | `tasks:summary:30` | `done / terminal`（服务端下发，客户端不重算） | 概览「任务总数」、任务页「完成率」 |
| 目标达成 | 同上 | `goals_met / goals_total` | 概览、任务页 |
| 漏洞分布 | `findings:stats` | 四个严重度直接取服务端计数 | 概览、任务页 |

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

## 5. 四页信息架构

- **流量**：KPI（总量/站点/错误率/体积）→ 分源切换（采集流量 / Web 引擎 / Yak 内核）→ 过滤 + 表格 → 右侧 Top 站点、状态分布、活跃抓包 → 存储维护。行点击开检查器：报文、cURL、来源。
- **代理池**：KPI（节点/健康率/加权成功率/延迟/租约/未入池）→ 池表（覆盖率、成员管理、设默认）→ 节点表（状态/延迟/成功率/出口，操作列粘右）→ 租约 → 订阅 → 右侧池覆盖率、SSE 事件、入口地址。
- **任务**：KPI（总数/进行中/已完成/完成率/目标达成/漏洞）→ 搜索与状态筛选 → 表格（状态、目标、漏洞、Token、最近活动）→ 详情十页签。
- **概览**：日期筛选 → 四张 KPI → Token 走势与缓存效率 → 漏洞/任务/热力图/活动流/流量健康度。

## 6. 一致性验收（改完跑一遍）

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

## 7. 加一个页面

1. `data/resources.ts` 加类型化 fetcher + hook（key 里编码全部参数）；
2. 需要新指标就加到 `metrics.ts`，不要在组件里算；
3. 页面用 `PageShell` + `KpiGrid` + `Card` + `DataTable` 组合，详情一律走 `Drawer`；
4. `client.tsx` 的 `PANELS` 加一条，同步补 `test/client.smoke.test.ts` 的期望列表。

## 8. 已知边界

- 流量表的"错误率/体积"只描述当前页样本（卡片已注明"近 N 条"）；全量错误率需要后端聚合，目前没有这个接口。
- Web 引擎的请求记录与抓包记录是**两个库**，只在页面上并列展示，不做跨库 join。
- SSE 断线时退化为 10s 轮询；事件环只保留最近 40 条，历史事件不落库。
- 概览的 Token 走势依赖 `/api/tokens/daily`，该接口不可用时图表降级为空，不影响其它 KPI。
