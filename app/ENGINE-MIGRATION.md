<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# 引擎迁移路线（渗透能力完整复刻）

目标：把 Go 服务里的渗透执行能力搬到 TypeScript，同时保持行为可对账、可回退。
本文只描述**执行引擎**（图谱、Agent 循环、工具、流量），读接口与存储见
[STORAGE-ARCHITECTURE.md](./STORAGE-ARCHITECTURE.md)。

## 现状（E2 首段已完成）

- 图 store 写入原语：`addNode / setNodeState / claimIntent / reclaimExpired /
  appendActivity / anchorAsset`，全部走 journal + `rev`；
- 状态机白名单（非法迁移 409）、意图租约（`lease_until`）与超时回收、
  活动流追加；
- 漏洞上报 `report_finding`（finding + node + edge 原子提交）；
- 目标、意图控制/重跑/消息、约束；
- 读侧 22 项领域对账全绿。

## Go 侧待迁清单（按依赖排序）

| 阶段 | 组件 | Go 位置 | 迁移要点 |
|---|---|---|---|
| E1 | 图谱与状态机 | `db/exploration.go`、`agent/*` | 节点/边/状态、抢占与超时、活动流 |
| E2 | Agent 循环 | `agent/planner.go`、`worker.go`、`mainagent.go` | 回合、工具调用、上下文压缩、终止条件 |
| E3 | 内置工具 | `agent/tools.go` 等 | `add_fact/add_intent/report_finding/list_assets/graph_overview/...` |
| E4 | 外部工具执行 | `tools/`、`server/customtool.go` | nmap/sqlmap/ffuf 等命令模板、超时、输出截断 |
| E5 | 流量与证据 | `traffic/`、`evidence/` | 抓包、blob、绑定、正文分段 |
| E6 | 编排 | `server/orchestration.go`、`scheduler.go` | 触发、并发、归档、通知 |

## 约束

1. **模型访问仍走 Go 网关**：TS 引擎不直接持有上游 key，只调用回环
   OpenAI-compatible 网关（AGENTS.md 的模型归属约定）。
2. **同一数据单写者**：引擎写入 core 的 store，不并行写 PG。
3. **可回退**：每个阶段保留 Go 对应实现，按任务切读/切写。

## E2 已完成的首段

- `createEngine.plan`：读目标与已有意图 → 模型输出 JSON → 建 intent 节点 + `spawns` 边；
- `createEngine.work`：租约抢占 → 有界工具循环（`add_fact` / `report_finding` / `finish`）→ done/blocked；
- 模型注入式设计，生产入口 `POST /api/engine/plan`、`/api/engine/work` 经
  `VEXNAR_GATEWAY_URL` + `VEXNAR_GATEWAY_TOKEN` 走 Go 回环网关；
- 假模型测试 3/3；未配置 token 时返回 503，不会静默本地推理。

## 下一步

- E2 续：上下文压缩、多 worker 并发、blocked 自动重试；
- E3：`list_assets` / `graph_overview` / `add_asset` 等内置工具；
- 之后 E4 外部工具执行。
