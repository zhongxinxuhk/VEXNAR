<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# 侧边栏功能融入 dsh 的设计

目标：把 web 控制台截图里的 21 个入口融入 dsh，而不是把 web 搬进 dsh。
原则：**dsh 已有的能力不重复造**，VEXNAR 只补它没有的领域视图。

## 顶层入口

dsh 侧边栏新增一个顶级入口 **VEXNAR**（`sidebar.panellist`，order 50），
点击打开主面板 `vexnar-console`（`main` slot）。面板内部再分「功能 / 系统」两组，
顺序与 web 截图一致。

```text
dsh 侧边栏
└─ VEXNAR  →  vexnar-console 面板
   ├─ 功能：仪表盘 任务 发现 流量 工具执行 LLM录制 资产 资产同步
   └─ 系统：LLM Agent MCP Skill 工具 通知推送 拦截规则 资产拦截
             审批记录 日志 系统配置
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
