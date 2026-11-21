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
cd app && pnpm install     # workspace 统一安装，只需一次
cd vexnar-core
PORT=8790 pnpm start       # Go 在 8787 时用于对账
node compare.mjs           # 逐端点对比 Go 与 TS
```

鉴权与 Go 相同：`Authorization: Bearer <HS256 JWT>`（用仓库根 `jwt.key` 签发）或
`vexnar_token` cookie；`/api/health` 免鉴权。

## M3 过渡：未迁移路由回退 Go

```sh
VEXNAR_GO_FALLBACK=http://127.0.0.1:8787 pnpm start
```

- 已迁移的 14 组路由由 TS 处理；
- 其余 `/api/*` 原样转发给 Go（方法、body、Authorization/cookie、状态码）；
- `VEXNAR_FALLBACK_METHODS=GET` 可只放行读请求；
- `VEXNAR_FALLBACK_ALLOW=/api/llm,/api/chat` 只放行指定前缀，其余 501；
- 未配置 fallback 时返回 `501 {"error":"route not migrated"}`；
- `GET /api/_migration` 返回原生路由清单与当前 fallback 地址。

这样 web 可以先指向 TS core，未迁移的写接口仍由 Go 服务，逐条切换。

## 代理池（TS 原生）

`/api/proxy/*` 由 `src/egress/` 原生实现：SQLite、解析、订阅、租约/健康、HTTP/SOCKS5 网关、
对抗模式都在 TS 内；协议核（vmess/vless/ssr 等）由固定版本的 mihomo 二进制托管，
socks5/http 用原生拨号。设计见 [`../docs/EGRESS-TS.md`](../docs/EGRESS-TS.md)。

回滚：`VEXNAR_EGRESS=go` 时改用 `src/proxy-bridge.ts`，把请求转给 Go 引擎
（见 [`../docs/EGRESS-BRIDGE.md`](../docs/EGRESS-BRIDGE.md)）。

## 引擎（E1/E2）

`POST /api/engine/plan`、`POST /api/engine/work` 已接入引擎循环；模型经
`VEXNAR_GATEWAY_URL` + `VEXNAR_GATEWAY_TOKEN` 走 Go 回环网关。


图谱写入原语已落地：`addNode`、`setNodeState`、`claimIntent`、`anchorAsset`，
全部 journal + `rev`。完整渗透引擎路线见 [ENGINE-MIGRATION.md](../ENGINE-MIGRATION.md)。

## 存储

- **领域数据**（tasks/findings/assets/nodes）：JSON store 的 per-record 文件；
- **元数据**（agents/tools/mcp/notify/llm/settings/categories/templates）：`meta.json`
  单文件域（`vexnar-meta`）；
- **companies** 走 store（assets 域）；core 不再直接连接 PostgreSQL；
写路径：`journal`（prepared→apply→committed）+ 每记录 `rev` + 单写者锁
（`store.lock`，崩溃残留 pid 会被识别并接管）；读侧写后自动失效缓存。
`VEXNAR_STORE=postgres` + `VEXNAR_PG_URL` 可整体切回 PostgreSQL；存量导入：
  `pnpm --filter @vexnar/store run seed`。

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
| `/api/proxy/*` | ✅ TS 原生（SQLite/网关/订阅/对抗）+ 可选 mihomo 协议引擎 |
| `GET /api/assets/counts` | ✅ |
| `GET /api/tasks/:id/coverage` | ✅ 范围/已测/by_type/pct，含直接来源任务上下文 |
| `GET /api/exploration/findings/stats` | ✅（含任务下拉） |
| `GET /api/tasks`、`/api/tasks/:id` | ✅ 核心字段 + tokens/goals/in_flight/findings 已对账；`last_activity_unix` 为引擎内存值，暂不比较 |
| `GET /api/tasks/:id/metrics` | 🟡 漏洞计数已填，其余验证类指标待迁移 |
| `GET /api/assets` | ✅ `task_id` 过滤、完整 DTO、DSL 搜索（AND/OR/括号/比较）已对账 |
| `GET /api/exploration/findings`、`/:id` | ✅ 分页/过滤已对账 |
| `GET /api/exploration/findings/:id/traffic` | ✅ 绑定 + 快照摘要（正文头清空）已对账 |
| `GET /api/exploration/nodes` | 🟡 已实现 items/edges，refs 暂空 |
| `GET /api/tasks/:id/goals` | ✅ 目标列表（id/text/vulnclass/state/origin/ts） |
| `POST/PATCH/DELETE /api/tasks/:id/goals` | ✅ 目标新增/修改/删除；新增挂到根事实 `spawns` 边 |
| `POST /api/tasks/:id/intents/:iid/control` | ✅ pause/resume/cancel（soft 删状态、hard 删节点与边） |
| `POST /api/tasks/:id/intents/:iid/rerun` | ✅ blocked/exhausted/stopped → open |
| `POST /api/tasks/:id/intents/rerun-blocked` | ✅ 批量重跑 blocked 意图 |
| `POST /api/tasks/:id/intents/:iid/messages` | ✅ 向已暂停 Worker 下发消息：置 running + 记 message 活动 |
| `GET/POST/PATCH/DELETE /api/tasks/:id/constraints` | ✅ 操作约束 CRUD（allow/deny） |
| `GET /api/exploration/intents` | ✅ 意图列表，支持 `limit` / `before` / 分页形状 |
| `GET /api/exploration/activity/history` | ✅ 活动历史，`session=main/plan/main:N/intent:ID`，`before` 游标 |
| `GET /api/exploration/tokens` | ✅ workers / sessions / total 全部对账 |
| `GET /api/tokens/daily` | ✅ 按 UTC 日聚合 token，`days` 可调 |
| `POST /api/tasks` | ✅ 新建任务：journal + rev，返回任务 DTO |
| `PATCH /api/exploration/findings/:id` | ✅ 改状态/严重度：乐观锁，冲突 409 |
| `POST /api/exploration/findings` | ✅ 上报漏洞：finding + node + edge 一次 journal 提交 |
| `PATCH /api/tasks/:id` | ✅ 改名/置顶，支持 `rev` 乐观锁 |
| `POST /api/tasks/:id/control` | ✅ pause / resume |
| `DELETE /api/tasks/:id` | ✅ 软删除：任务消失，findings 与图保留 |
| `POST/PATCH/DELETE /api/task-categories` | ✅ 分类增改删；删除时自动解绑任务 |
| `PATCH /api/tasks/:id/category` | ✅ 任务归入/移出分类 |
| `POST/PATCH/DELETE /api/task-templates` | ✅ 模板增改删 |
| `POST/DELETE /api/tasks/:id/assets` | ✅ 资产挂载/卸载（幂等计数） |
| `POST/DELETE /api/tasks/:id/scope` | ✅ 任务范围增删（域名/IP 同时建资产） |
| `POST/PATCH/DELETE /api/notify/channels` | ✅ 通知渠道增改删 |
| `PATCH /api/agents/:key` | ✅ 改名称/描述 |
| `PUT /api/tools/:key` | ✅ 改描述/schema/绑定/启用 |
| `POST/PUT/DELETE /api/tools/custom` | ✅ 自定义工具增改删（key/kind 校验、内置保护） |
| `POST/PUT/DELETE /api/mcp` | ✅ MCP server 增改删与启停 |
| `POST /api/tasks/:id/archive`、`/archive/batch` | ✅ 归档（任务从列表隐藏，图保留） |
| `GET /api/task-archives`、`/:id` | ✅ 归档列表/详情 |
| `POST /api/task-archives/:id/restore` | ✅ 恢复归档 |
| `DELETE /api/task-archives/:id` | ✅ 删除归档（同时软删任务） |

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
