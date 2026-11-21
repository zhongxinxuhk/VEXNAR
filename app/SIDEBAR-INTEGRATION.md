<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# 侧边栏功能融入 dsh 的设计

目标：把 web 控制台截图里的 21 个入口融入 dsh，而不是把 web 搬进 dsh。
原则：**dsh 已有的能力不重复造**，VEXNAR 只补它没有的领域视图。

## 原生融入方式（不是嵌套）

不再做一个带内部导航的 VEXNAR 控制台。领域入口直接成为 dsh 的
`sidebar.panellist` 顶级项，系统项进入 dsh 设置页的 `settings.section`。

```text
dsh 新会话首屏
└─ 概览        → conversation.hero.frame（KPI 条 + Token 趋势 + 缓存/漏洞转盘；
                 实际对话里不渲染，不占高度）

dsh 侧边栏
├─ 概览        → main: vexnar-overview （Web /dashboard 复刻，整页）
├─ 任务        → main: vexnar-tasks
│                 ├─ 任务      （KPI 计数 + 可筛选分页清单 + 任务详情）
│                 └─ 发现      （严重度/状态/任务/关键字筛选 + 分页 + 详情）
│                 任务详情内：目标 / 意图 / 节点 / 覆盖度 / 该任务的发现 /
│                 工具运行器 / 该任务的执行记录流（activity/history）
└─ 流量        → main: vexnar-traffic（Yak 内核 History）

dsh 设置页
├─ Agent 预设  → **dsh 原生设置节**（名册 = app/vexnar/cordis.patch.yml 的 preset 行）
├─ 通知推送    → settings.section: vexnar-notify
└─ 拦截规则    → settings.section: vexnar-intercept（列表 + 新增/编辑/删除）

dsh 设置页 · 内置插件
├─ 全部插件    → settings.plugins.tab: all（dsh 自带清单）
├─ 工具        → settings.plugins.tab: vexnar-plugin-tools（系统/自定义工具卡片 + 详情编辑）
└─ MCP server  → settings.plugins.tab: vexnar-plugin-mcp（卡片列表 + 详情增删改）
```

### 为什么合并

- **任务 / 发现 / 工具执行** 描述的是同一个任务的三面：任务列表告诉你做了什么，发现是
  它的产出，工具执行是它的过程。三者过去各有入口、各筛各的任务，现在共用面板顶部的
  任务范围，切页签不用重新选。
- **日志** 不再是入口：它列的就是 `activity/history` 里 planner / main 的每一步，和
  工具执行页签底部那张执行记录表是同一批数据。留着只是同一件事的第二个视图。
- **Agent 名册只有一份**：引擎的每个角色都是 `app/vexnar/cordis.patch.yml` 里一条
  `@deepseek-ai/dsh-agent-preset`（goals / planner / main / worker / auto / pentest /
  reporter / retester）。名称、描述、能力组合都在那份声明里，展示与编辑归 dsh 自己的
  设置 → Agent 预设；再挂一个 VEXNAR 的「Agent 管理」只是同一份名册的第二个视图，
  而且它的编辑写回引擎库，改的还不是 dsh 真正在跑的那份定义。引擎按需生成的
  `lock_agent_<id>` / `write_lock_agent_<id>` 是运行产物，不进名册。
- **MCP / 工具** 是同一件事的两半（工具从哪来），而「谁提供、能不能调」本来就是
  插件与权限的问题。所以它们不占独立设置节，而是「内置插件」分区的两个标签页，
  形制照 dsh 插件页：卡片列表 → 整页详情。注册面（描述、参数说明与默认值、绑定
  Agent、启停、自定义工具与 MCP server 的增删改）在这里完成；agent 侧能不能真正
  调用仍由 dsh 的插件挂载与权限预设决定。

## 哪些入口复用 dsh，哪些新建

| 入口 | dsh 落点 | 数据源 | 状态 |
|---|---|---|---|
| 对话 | **dsh 原生会话**（不新建页面） | session 日志 | 复用 |
| 工作空间 | **dsh 原生 workspace/文件面板** | 本地文件 | 复用 |
| 系统配置 / LLM | dsh settings + `vexnar-account` 插件 | 网关/凭据 | 复用 |
| 仪表盘 | `vexnar-overview` 整页 + 新会话首屏卡片 | `/api/tasks`、`/api/exploration/findings/stats`、`/api/assets/counts`、`/api/tokens/daily` | 骨架 |
| 任务 / 发现 | 任务面板（清单 + 发现页签，共用任务范围） | `/api/tasks`、`/api/exploration/findings?task_id=&severity=&status=&q=&page=&limit=` | 已接 |
| 工具执行 / 执行记录 | 任务详情内（按任务落库） | `POST /api/engine/tools/run`、`/api/exploration/activity/history` | 已接 |
| 流量 | Yak 内核 History 与会话项目流量 | `POST /api/yak/history` | 已接 |
| LLM 录制 | 面板内记录 | `/api/exploration/activity/history` | 骨架 |
| Agent | **dsh 原生「Agent 预设」设置节**（`cordis.patch.yml` 的 preset 行） | preset 声明（名称/描述/插件组合） | 已接 |
| MCP / 工具 / Skill | 「内置插件」分区标签页：卡片列表 + 详情编辑 | `/api/tools`、`/api/tools/custom`、`/api/tools/{key}/reset`、`/api/mcp`、`/api/mcp/{id}/refresh` | 已接 |
| 通知推送 | 面板内渠道 | `/api/notify/channels` | 骨架 |
| 拦截规则 / 资产拦截 | 面板内规则 | 待迁 | 规划 |

## 已实现的数据视图

- 概览：按 Web `/dashboard` 复刻——5 张 KPI、每日 Token 堆叠柱（7/30/90 天）、
  缓存命中率环、漏洞分布环、活动流、发现列表、任务表、资产分布、状态码与系统状态；
  图形全部手绘 SVG（无 recharts 依赖），色板走 `--vx-chart-*` 令牌，浅色/深色随皮肤；
  新会话首屏的卡片在窗口高度 < 780px 时只保留标题栏与 KPI 条，把高度让给输入框；
- 仪表盘：任务数、发现数、资产数、今日 Token；
- 任务：最近 30 条任务（id/名称/状态/目标）；
- 发现：最近 30 条发现（id/漏洞类/严重度/状态/摘要）；
- 任务详情：点击任务行进入，展示目标、意图、覆盖度与最近节点；
- 发现详情：证据、流量绑定、请求/响应正文分段；
- 系统页：MCP 启停/删除、工具启停、通知渠道新增/删除；Agent 名册不在这里，它归 dsh 的「Agent 预设」；
- 任务面板：清单的状态筛选 / 关键字搜索 / 分页全部下推后端（`/api/tasks?status=&q=&page=&size=`，
  与 Go 同一套语义，`total` 是筛选后的全集）；发现页签支持严重度 / 处置状态 / 任务范围 / 关键字，
  分页走 `page`+`limit`，任务范围用可搜索输入（datalist + 直接键入 id，不限前 200）；任务详情里给出
  该任务的发现、工具运行器（目录来自 `/api/engine/tools`，支持额外 JSON 参数，结果按任务落库）与
  该任务的执行记录（`activity/history` 反向游标，可「加载更早」，planner / main 逐步含工具与结果）；
- 任务详情：暂停/恢复/归档按钮；
- 流量：在 dsh 内读取 Yak 内核 History。会话流量按钮和 Agent 工具使用会话绑定的本地项目。详见 [Yak 内核流量 History](docs/YAK-HISTORY.md)。
- 拦截规则：规则列表与删除（同样代理 Go）；
- core 的共享 token 调用会在代理时自动换取服务 JWT，避免 Go 401。

连接方式：**没有独立端口、没有 sidecar**。`vexnar-core` 通过 esbuild 打成
`account/lib/core-embedded.js`，account 宿主插件在 dsh webserver 上把
`/vexnar-api` 直接交给这份 Hono app（进程内 Fetch 调用）；面板默认请求同源
`/vexnar-api`。只有独立调试时才需要 localStorage 覆盖。

## 已实现的骨架

- `app/vexnar/ui/src/client.tsx`：注册 `main` 面板 `vexnar-console` 与
  `sidebar.panellist` 入口，内部导航按截图分组；面板右侧为占位说明。
- 图标、样式走 dsh 的 `--vx-*` 主题桥，不写死颜色。
- 构建：`pnpm --filter @vexnar/dsh-ui run build`（当前 155 KB）。

## 接入顺序

1. **只读三屏**：仪表盘（计数卡片）、任务列表、发现列表——直接调用 core 的只读 API；
2. **详情**：任务详情（意图/目标/活动）、发现详情（证据/流量）；
3. **系统页**：MCP/工具/通知的 CRUD（core 已实现）；Agent 名册走 dsh preset 声明，不再做 VEXNAR 侧 CRUD；
4. **工具执行**：把 `run_tool` 暴露成面板表单，结果落库后刷新图谱。

## 约束

- 不改 web 控制台；它继续是独立客户端。
- 不在 dsh 里复制会话/工作空间能力，避免两套状态。
- 面板数据一律走 vexnar-core；认证沿用登录后写入的 token（待接）。
- 所有领域写路径已经 journal 化，面板只做展示与调用。
