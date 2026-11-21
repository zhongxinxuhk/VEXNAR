<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# P0-1 · Kysely 读路径对账

验证 TS 数据层能读出与 Go 完全一致的记录，**不改 schema、不改 Go**。

## 运行

前提：Go 后端在 `127.0.0.1:8787`、PostgreSQL 在 `config.json` 指向的库。

```sh
cd app && pnpm install                            # workspace 统一安装，只需一次
pnpm --filter @vexnar/p0-db-spike run reconcile
```

JWT 由仓库根的 `jwt.key` 现场签名（HS256，`sub=VEXNAR`），不需要管理员密码。

## 覆盖的四个域

| 域 | TS 读取 | 对账接口 | 字段 |
|---|---|---|---|
| tasks | `tasks` | `GET /api/tasks` | exploration_id / name / description / goal / 创建完成时间 / paused / queued / 终态 status |
| findings | `findings` | `GET /api/exploration/findings` | id / finding_id / vulnclass / name / severity / status / summary / evidence |
| assets | `assets`（root_domain） | `GET /api/assets?type=root_domain` | type / domain / root_domain / company_id |
| exploration_nodes | `exploration_nodes` | `GET /api/exploration/nodes?order=asc` | kind / state |

## 最近一次结果

```text
DB counts: {"tasks":232,"findings":1842,"assets":179,"nodes":3422}

[PASS] tasks: compared=232 mismatches=0
[PASS] findings: compared=500 mismatches=0
[PASS] assets: compared=73 mismatches=0
[PASS] exploration_nodes: compared=100 mismatches=0
```

## 发现的两个语义细节（写进迁移清单）

1. **任务 `status` 不是列值**：Go 的列表状态由 manager/engine 计算，DB 里多为 `created`。
   只有终态（done/failed/timeout）做了强对账；运行态必须随引擎一起迁。
2. **finding 的 `id`**：全局发现页用的是 `findings.id`；任务内发现页用探索节点 id。
   两条路径的 DTO 不同，TS 侧要按接口分开建模，不能统一成一种 id。

## 不在本 spike 范围

- 写入路径与事务（P1）；
- 任务指标（tokens/goals/in_flight，来自 activity/usage 聚合，P3）；
- 资产 JSONB 全字段与图查询（P1）；
- 性能压测（P1 末）。
