<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Go → TypeScript 全量迁移执行清单（融入 dsh · SQLite · 不开新端口）

> 本文件是可勾选、可并行的执行清单。每条工作包都有：范围、Go 源文件、TS 落点、
> 验收标准、负责人。状态用 `[ ]` 标记；完成一项勾一项。

## 0. 目标与硬约束

| 约束 | 决定 |
|---|---|
| 运行位置 | dsh 内嵌 core，`/vexnar-api` 前缀，**不监听新端口**（standalone `server.ts` 仅保留给对账用） |
| 持久层 | **SQLite 单文件**（`node:sqlite` 内置，无原生依赖），替换 PostgreSQL；保留 JSON 后端仅作导入/回退 |
| 数据迁移 | 从现有 PG `db/schema.sql`（60 表）导出行 → 写进 SQLite；schema 语义对齐 Go |
| 模型访问 | OpenAI 兼容回环网关 `POST /api/desktop/openai/v1/*` 由 TS 实现，上游 key 不出进程 |
| UI 样式 | 卡片/任务/漏洞/流量/审批/日志/报告对齐 `web/`（Next.js）现有观感 |
| 范围 | 全部 280 条 Go 路由 + 60 张表 + MITM 采集，逐条对账 |

## 1. 现状基线（2026-11-21 实测）

- Go：71.5k 生产行 + 34.8k 测试行；280 条路由；60 张表；30+ 领域工具；20 MCP 工具。
- TS 已完成：P0 四 spike、JSON store + 引擎 E1–E4（图谱/状态机/plan/work/工具/报表/队列/调度/触发器/通知/证据 blob）。
- TS 原生路由：92 注册 / 69 路径，覆盖 81/280 条；198 条仍在 Go。
- TS 单测：98/98 PASS。
- **缺口**：in-process 版无 Go fallback（未迁移路由 404）；meta 域未 seed；5 项契约差异；MITM 采集无 TS 实现。

## 2. 工作包清单（可并行）

### WP-0 存储后端（地基，先行）— 负责人 lead

- [ ] `[ ]` 重构 store 层为后端无关：`writer` 增加 `list/maxKey/delete`，`operations.ts` 不再直读文件系统
- [ ] `[ ]` 实现 `sqlite.ts`（`node:sqlite`）：`sqliteWriter` + `sqliteStore`(读) + `sqliteMetaStore`，单文件 `vexnar.sqlite`（WAL）
- [ ] `[ ]` `openStore`/`storeOperations`/`metaStore` 默认走 SQLite；`VEXNAR_STORE=json` 回退
- [ ] `[ ]` PG 导入脚本 `import-pg.mjs`：`db/schema.sql` 60 表全量 → SQLite
- [ ] 验收：98 项 store 测试在 SQLite 后端全绿 + 与 Go 对账一致

### WP-1 桌面模型网关 `/api/desktop/*`（19 条）— agent A

- Go：`desktop_gateway.go` `desktop_preferences.go` `desktop_projects.go` `desktop_project_sessions.go`
- 内容：`/api/desktop/llm`(get/configure/clear/key/models)、`/api/desktop/openai/v1/models|chat/completions|responses`（回环网关→NewAPI，token 守护）、`/api/desktop/preferences`、`/api/desktop/projects[/{id}/tasks[/{id}[/history]]`
- 验收：模型目录/推理走 TS 回环网关，key 不出进程；桌面偏好与项目 CRUD 对账

### WP-2 审批拦截 `/api/intercept/*`(17) + asset-intercept(5) + task-intercept(5) — agent B

- Go：`intercept.go` `asset_intercept.go` `task_intercept.go`
- 内容：规则 CRUD/toggle、pending 列表/详情/decide、judge/tool 配置、历史与 execution、任务级拦截规则、资产拦截规则
- 验收：审批拦截规则命中/挂起/恢复与 Go 等价

### WP-3 LLM 池/记录/用量 `/api/llm/*`(17) — agent C

- Go：`llmpool.go` `llmrec/` `llmretry.go` `metrics.go`(tokens)
- 内容：profiles CRUD/active、pool status/reset、records list/get/delete/by-model/tasks、models、retry-policy、test、`/api/tokens/usage`、`/api/tokens/conversations`、`/api/commands/stats`
- 验收：failover/账本/用量聚合与 Go 一致

### WP-4 会话与聊天 `/api/conversations/*`(11) + `/api/chat/*`(3) + mentions — agent D

- Go：`conversations.go` `chat_mentions.go` `chatupload.go` `conv_live.go` `conversation_trace.go`
- 内容：会话 CRUD/rename/stop/profile、messages list/detail/send、digest、batch delete、`/api/chat`、`/api/chat/upload`、`/api/chat/mentions`、`/api/tasks/{id}/chat/status|stop`
- 验收：会话消息流经 Go 网关模型，SSE 事件序号对齐

### WP-5 技能与市场 `/api/skills/*`(14) + `/api/market/*`(5) — agent E

- Go：`skill_github.go` `skill_zip.go` `skill_usage.go` `market.go` `market_seed.go`
- 内容：技能文件系统 CRUD（list/read/write/mkdir/delete/upload/install-github/meta/enabled/missing/usage）、市场 sources/items/sync
- 验收：技能文件读写、GitHub 安装、市场同步对账

### WP-6 流量证据 `/api/traffic/*`(7) + finding traffic/export + MITM 采集 — agent F（风险最高）

- Go：`traffic/`(MITM) `finding_traffic.go` `finding_traffic_export.go`
- 内容：`/api/traffic`(list/blob/exchange/hosts, delete, delete/all)、finding 流量绑定/导出/正文分段、**MITM 采集**（按 P0-4 结论：mitmproxy sidecar 或自写 CONNECT）
- 验收：同一站点抓包条数与 body sha256 与 Go 一致；证据绑定版本号语义一致

### WP-7 工作区与同步 `/api/workspace/*`(7) + `/api/sync/*`(5) — agent G

- Go：`workspace.go` `sync_scopesentry.go`
- 内容：工作区 list/read/write/mkdir/upload/download/delete、ScopeSentry datasource/projects/tasks/sync/status
- 验收：文件操作与同步触发对账

### WP-8 更新与自更新 `/api/update/*`(4) — agent H

- Go：`update.go` `selfupdate/`
- 内容：check/apply/rollback/stream；`os/exec` 保留在 worker 侧
- 验收：版本检查/应用/回滚/流式进度

### WP-9 鉴权 `/api/auth/*`(4) + `/api/settings`(put) + python detect/web-search test — agent I

- Go：`auth.go`
- 内容：login/init/status/change-password；settings 写；python 探测；web-search 测试
- 验收：JWT 签发/校验、密码策略、settings 白名单写

### WP-10 日志与审计 `/api/logs/*`(3) + `/api/audit` + `/api/stats` + `/api/gc` + `/api/active` — agent J

- Go：`logsink.go` `broadcast.go` `assembly.go`
- 内容：logs list/history/stream、审计、统计、gc、active 设置
- 验收：SSE 日志流、审计与统计聚合

### WP-11 可见性/资源 `/api/visibility/*`(4) + `/api/commands`(2) — agent K

- Go：`server_mgmt.go` `platform_tools.go`
- 内容：visibility toggle/资源可见性/技能可见性、commands list/stats
- 验收：可见性切换与命令列表

### WP-12 探索图扩展 `/api/exploration/*` 剩余 — agent L

- Go：`findings_groups.go` `finding_retests.go` `findings_groups.go` `goals.go` `intent_intervention.go`
- 内容：graph/frontier/main-sessions(+new)、findings groups/export/asset-tree/lineage/deepen、retests(active/start)、goals 剩余、activity detail/stream
- 验收：图/血缘/复测/导出与 Go 等价

### WP-13 Agent 配置扩展 `/api/agents/*` 剩余 — agent M

- Go：`server_mgmt.go`(agent) `prompt_vars_test.go` 相关
- 内容：prompts(list/save/reset/preview/versions)、variables、wrapup(+task-timeout)、config、visibility、triggers(list/create/update/delete)
- 验收：prompt/变量/wrapup 配置对账

### WP-14 通知扩展 `/api/notify/*` 剩余 + MCP 扩展 — agent N

- Go：`notifier.go` `notify_api.go` `mcpdiscover.go`
- 内容：deliveries/retry/meta/test、`/api/mcp/import|{id}/tools|{id}/refresh`、`/api/side-questions/*`
- 验收：6 通道实发、投递重试、MCP 发现

### WP-15 任务扩展 `/api/tasks/*` 剩余 + `/api/companies/*` 剩余 — agent O

- Go：`task_llm.go` `task_metadata.go` `task_resolution.go` `task_control.go` `task_archives.go` `task_archive_package.go` `assets.go` `dto.go`
- 内容：llm resolution/profiles、metadata、control batch、category batch、asset-refs/intent-assets/coverage-graph、companies CRUD/scope/reattribute、archives batch
- 验收：任务元数据/LLM 绑定/批量控制对账

### WP-16 UI 样式对齐 + 集成验证 — agent P（依赖其余）

- 内容：dsh 卡片/任务/漏洞/流量/审批/日志/报告组件对齐 `web/` 观感
- 验收：dsh web 内视觉与 `web/` 一致，全链路端到端通过

## 3. 验收总门槛

1. 280 条路由：状态码/字段/错误码逐条对齐；SSE 事件序号单调。
2. 60 张表 SQLite 化，`db/schema.sql` 语义保留；导入后行数与 Go 一致。
3. 20 MCP 工具 + 30+ 领域工具：同输入同输出。
4. 任务全链路：创建→规划→执行→上报→复测→归档，重启可续。
5. 流量：同会话抓包条数与 body 哈希一致。
6. 通知 6 通道实发成功。
7. 无新端口；`/vexnar-api` 前缀内完成全部读写。
