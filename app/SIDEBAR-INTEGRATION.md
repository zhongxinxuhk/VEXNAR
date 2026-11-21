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
dsh 侧边栏
├─ 任务        → main: vexnar-tasks    （仪表盘计数 + 列表 + 详情）
├─ 发现        → main: vexnar-findings
├─ 流量        → main: vexnar-traffic（host/method/关键字过滤 + exchange 详情）
├─ 资产        → main: vexnar-assets
├─ 工具执行    → main: vexnar-tool-run
└─ 日志        → main: vexnar-logs

dsh 设置页
├─ Agent 管理  → settings.section: vexnar-agents
├─ MCP         → settings.section: vexnar-mcp
├─ 工具        → settings.section: vexnar-tools
├─ 通知推送    → settings.section: vexnar-notify
├─ 拦截规则    → settings.section: vexnar-intercept（列表 + 新增/编辑/删除）
├─ 资产同步    → settings.section: vexnar-asset-sync（JSON 导入，按标识去重）
└─ 审批记录    → settings.section: vexnar-approvals
```

## 哪些入口复用 dsh，哪些新建

| 入口 | dsh 落点 | 数据源 | 状态 |
|---|---|---|---|
| 对话 | **dsh 原生会话**（不新建页面） | session 日志 | 复用 |
| 工作空间 | **dsh 原生 workspace/文件面板** | 本地文件 | 复用 |
| 系统配置 / LLM | dsh settings + `vexnar-account` 插件 | 网关/凭据 | 复用 |
| 仪表盘 | `vexnar-console` 首屏 | `/api/tasks`、`/api/exploration/findings/stats`、`/api/assets/counts`、`/api/tokens/daily` | 骨架 |
| 任务 | 面板内列表 | `/api/tasks` | 骨架 |
| 发现 | 面板内列表/详情 | `/api/exploration/findings` | 骨架 |
| 流量 | 面板内证据查看 | `/api/exploration/findings/:id/traffic` | 骨架 |
| 工具执行 | 面板内运行器 | `/api/engine/tools`（规划） | 骨架 |
| LLM 录制 | 面板内记录 | `/api/exploration/activity/history` | 骨架 |
| 资产 / 资产同步 | 面板内列表 | `/api/assets`、DSL | 骨架 |
| Agent | 面板内配置 | `/api/agents`、triggers | 骨架 |
| MCP / 工具 / Skill | 面板内配置 | `/api/mcp`、`/api/tools` | 骨架 |
| 通知推送 | 面板内渠道 | `/api/notify/channels` | 骨架 |
| 拦截规则 / 资产拦截 | 面板内规则 | 待迁 | 规划 |
| 审批记录 | 面板内列表 | 待迁 | 规划 |
| 日志 | 面板内日志 | `/api/exploration/activity/history` | 骨架 |

## 已实现的数据视图

- 仪表盘：任务数、发现数、资产数、今日 Token；
- 任务：最近 30 条任务（id/名称/状态/目标）；
- 发现：最近 30 条发现（id/漏洞类/严重度/状态/摘要）；
- 任务详情：点击任务行进入，展示目标、意图、覆盖度与最近节点；
- 发现详情：证据、流量绑定、请求/响应正文分段；
- 系统页：Agent 编辑、MCP 启停/删除、工具启停、通知渠道新增/删除；
- 工具执行：选择 nmap/httpx/ffuf/sqlmap，填 target 与可选 task_id，结果解析并落库；
- 任务详情：暂停/恢复/归档按钮；
- 流量页：抓包列表（经 core 回退代理 Go `/api/traffic`）；
- 拦截规则：规则列表与删除（同样代理 Go）；
- 审批记录：Go 无独立接口，占位说明。
- core 的共享 token 调用会在代理时自动换取服务 JWT，避免 Go 401。

连接方式：**无需手动配置**。`scripts/dsh-web.mjs` 启动时自动拉起 vexnar-core
sidecar（随机 token），account 宿主插件在 dsh webserver 上挂载 `/vexnar-api`
反向代理；面板默认请求同源 `/vexnar-api`。仅独立调试时才需要 localStorage 覆盖。

## 已实现的骨架

- `app/vexnar/ui/src/client.tsx`：注册 `main` 面板 `vexnar-console` 与
  `sidebar.panellist` 入口，内部导航按截图分组；面板右侧为占位说明。
- 图标、样式走 dsh 的 `--vx-*` 主题桥，不写死颜色。
- 构建：`pnpm --filter @vexnar/dsh-ui run build`（当前 155 KB）。

## 接入顺序

1. **只读三屏**：仪表盘（计数卡片）、任务列表、发现列表——直接调用 core 的只读 API；
2. **详情**：任务详情（意图/目标/活动）、发现详情（证据/流量）；
3. **系统页**：Agent/MCP/工具/通知的 CRUD（core 已实现）；
4. **工具执行**：把 `run_tool` 暴露成面板表单，结果落库后刷新图谱。

## 约束

- 不改 web 控制台；它继续是独立客户端。
- 不在 dsh 里复制会话/工作空间能力，避免两套状态。
- 面板数据一律走 vexnar-core；认证沿用登录后写入的 token（待接）。
- 所有领域写路径已经 journal 化，面板只做展示与调用。
