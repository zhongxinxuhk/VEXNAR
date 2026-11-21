<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# vexnar — dsh app 层

本目录是 VEXNAR 在 dsh 上的**唯一自有代码**：一个 bundle patch + 客户端插件。
上游 `app/dsh/` 不改；这样升级 dsh 只是换 tag 和 patch。

## 1. 两个接口

```text
dsh (app)  ──OpenAI-compatible──▶  Go  /api/desktop/openai/v1   （模型）
           ──MCP Streamable HTTP─▶  Go  /mcp                    （任务/漏洞/流量/资产）
```

- 模型：`X-VEXNAR-Desktop-Token`（`VEXNAR_DESKTOP_TOKEN`），上游 URL 与 key 不出 Go。
- 工具：`Authorization: Bearer <data/mcp.token>`（或 `VEXNAR_MCP_TOKEN`）。
- 两个端点都只接受 loopback。

## 2. 已实现的 MCP 工具面（Go 侧，2026-11-21 合入）

| 类别 | 工具 |
|---|---|
| 发现 | `list_tasks`、`list_llm_profiles` |
| 任务读 | `get_task_graph`、`list_task_findings`、`get_task_node_detail`、`get_task_worker_trace`、`list_task_worker_traces`、`search_task_worker_traces` |
| 任务写 | `add_task_hint`、`pause_task`、`spawn_task`、`create_task`（别名） |
| 漏洞证据 | `report_finding`、`get_finding_traffic`、`bind_finding_traffic`、`update_finding_report` |
| 资产/流量 | `list_assets`、`traffic_search`、`traffic_get`、`traffic_blob` |

代理池能力由 `@vexnar/dsh-egress`（`app/vexnar-egress/`）以 dsh 工具提供：
`egress_exec`、`egress_status`、`fanout_fetch`、`egress_proxy`、`pivot_add`、`browser_proxy`。
它经同进程 `vexnarCore` 服务调用 core，不需要 token/端口；设计见
[`../docs/EGRESS-AGENT-TS.md`](../docs/EGRESS-AGENT-TS.md)。

工具名在 dsh 里带命名空间：`mcp__vexnar__report_finding`。

范围限制：设置 `VEXNAR_MCP_TASK_IDS=t1,t2` 后，带 `task_id` 的调用只允许这几个任务。

## 3. 下一步（按顺序）

1. **起 profile**：`cd ../dsh && pnpm install && DSH_HOME=... pnpm dsh web`，在
   Models 里确认 `VEXNAR` 路由出现，发一条消息验证推理走 Go。
2. **接 MCP**：在 Settings → MCP 里确认 `vexnar` server 为 connected，会话里调
   `mcp__vexnar__list_tasks` 能返回真实任务。
3. **客户端插件**：按 dsh `dsh-client-ui-tool` 的槽位约定注册两个 toolview：

   ```ts
   ctx.slots.inject('tool.call.toolview', () =>
     ctx.slots.register({ name: 'tool.call.toolview', key: 'mcp__vexnar__report_finding' }, FindingCard))
   ```

   再在 `sidebar.panellist` 注册任务/漏洞看板。
4. **打包**：Electron 壳、签名、自动更新属于 app 仓库的发行工作，不放进 Go 仓库。

## 4. 边界

- 不在客户端维护第二套模型目录：模型列表来自 Go 的 `/models`。
- 不复制 Go 的会话/任务真相：dsh session 是本地 UI 状态。
- 不在 dsh 里重写审批/证据语义：审批卡只展示 Go 的 `intercept_pending` 结果。
