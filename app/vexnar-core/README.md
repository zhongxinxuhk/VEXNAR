<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# @vexnar/core（P1-1）

TypeScript 只读 API 的第一片：直接读现有 PostgreSQL，与 Go 服务的 JSON 契约对齐。
不写库、不改 schema、不动 Go。

## 运行

```sh
cd app/vexnar-core
npm install
PORT=8790 npm start        # Go 在 8787 时用于对账
node compare.mjs           # 逐端点对比 Go 与 TS
```

鉴权与 Go 相同：`Authorization: Bearer <HS256 JWT>`（用仓库根 `jwt.key` 签发）或
`vexnar_token` cookie；`/api/health` 免鉴权。

## 存储

- **领域数据**（tasks/findings/assets/nodes）：JSON store 的 per-record 文件；
- **元数据**（agents/tools/mcp/notify/llm/settings/categories/templates）：`meta.json`
  单文件域（`vexnar-meta`）；
- **companies** 走 store（assets 域）；core 不再直接连接 PostgreSQL；
写路径：`journal`（prepared→apply→committed）+ 每记录 `rev` + 单写者锁
（`store.lock`，崩溃残留 pid 会被识别并接管）；读侧写后自动失效缓存。
`VEXNAR_STORE=postgres` + `VEXNAR_PG_URL` 可整体切回 PostgreSQL；存量导入：
  `cd ../vexnar-store && npm run seed`。

## 端点（20）

| 端点 | 状态 |
|---|---|
| `GET /api/health` | ✅ 对账通过 |
| `GET /api/agents`、`/api/agents/:key` | ✅ 列表对账通过 |
| `GET /api/llm/profiles` | ✅ |
| `GET /api/task-categories` | ✅ |
| `GET /api/task-templates` | ✅ |
| `GET /api/companies` | ✅（含 scope 规则对象） |
| `GET /api/tools` | ✅（含调用次数） |
| `GET /api/mcp` | ✅ |
| `GET /api/notify/channels` | ✅ |
| `GET /api/settings` | ✅（只暴露 Go 的 20 个白名单键） |
| `GET /api/assets/counts` | ✅ |
| `GET /api/exploration/findings/stats` | ✅（含任务下拉） |
| `GET /api/tasks`、`/api/tasks/:id` | ✅ 核心字段 + tokens/goals/in_flight/findings 已对账；`last_activity_unix` 为引擎内存值，暂不比较 |
| `GET /api/tasks/:id/metrics` | 🟡 漏洞计数已填，其余验证类指标待迁移 |
| `GET /api/assets` | 🟡 已实现核心字段，DSL/图查询未迁 |
| `GET /api/exploration/findings`、`/:id` | 🟡 已实现，traffic/report 版本字段暂为 0 |
| `GET /api/exploration/nodes` | 🟡 已实现 items/edges，refs 暂空 |
| `POST /api/tasks` | ✅ 新建任务：journal + rev，返回任务 DTO |
| `PATCH /api/exploration/findings/:id` | ✅ 改状态/严重度：乐观锁，冲突 409 |

最近一次对账：元数据 **12/12 PASS**（全部走 store）；
领域端点 **6/6 PASS**
（`node compare-domain.mjs`：tasks 核心字段、assets、findings、findings stats、nodes items/edges）。

## 对账中确认的实现细节

1. `int8` 必须转成 number：`pg` 默认返回字符串，Go 的 JSON 是数字。
2. 时间格式：任务/分类用 RFC3339（`to_char + OF + ':00'`），公司/资产用 `::text`。
3. `settings` 不是整表：Go 只暴露固定白名单，且 `auth.*` 永不出现。
4. `companies.scope` 是对象数组（id/company_id/kind/domain/net/value/raw/reason），不是字符串。
5. `tools.calls` 来自 `tool_usage` 聚合；`findings/stats.tasks` 按最近漏洞时间排序。
6. 任务 `status`、`tokens`、`goals_*`、`in_flight`、`findings` 由引擎/聚合计算，读路径无法直接等价。

## 下一步

- 把 `tasks / assets / findings / nodes` 的派生字段补齐（依赖 P3 引擎与活动聚合）；
- 引入 zod 契约 + OpenAPI 生成，作为双跑对比的机器基线；
- 拆成 `packages/db`（仓储）与 `packages/api`（路由），供 dsh 与 web 共用。
