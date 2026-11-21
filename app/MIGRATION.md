<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Go → TypeScript 全栈迁移评估

**版本**：v1 · 2026-11-21
**范围**：`server/ db/ agent/ traffic/ intercept/ notify/ …` 全部 Go 后端，迁到 TypeScript，
以 dsh 作为 Agent 运行时与客户端壳。
**不在范围**：`web/`（Next.js 前端保持，只换 API 消费方式）、`参考项目/`。

---

## 0. 结论

1. **可行，但不是一个"重写框架"的活，而是 71.5k 行领域逻辑的移植。** Go 生产代码
   71,542 行、测试 34,830 行、275 条 REST 路由、60 张表、177 个测试文件。
2. **推荐目标形态**：dsh（Agent 运行时 + 客户端）+ `vexnar-core`（TS HTTP/MCP 服务）
   + `vexnar-worker`（任务执行与采集进程）+ PostgreSQL（沿用同一份 schema）。
   不是把所有东西塞进 Next.js。
3. **工作量约 26–32 人月**（3 人 10–12 个月，2 人 14–16 个月），其中 **35% 花在
   流量采集（MITM）与任务引擎**这两块"非 CRUD"逻辑上。
4. **最稳妥路径是"同库双跑、按域切换"**：TS 先只读、再影子写、再切读、最后停写 Go；
   不做一次性 big-bang。
5. **风险最高的三项**：MITM 逐请求留痕的等价实现、引擎并发/暂停/续跑语义、
   177 个测试文件所覆盖的边界行为。这三项必须在 P0 用 spike 证明，再定排期。

---

## 1. 现状基线（可复核）

| 指标 | 数值 | 出处 |
|---|---:|---|
| Go 生产代码 | 71,542 行 | `find . -name '*.go' ! -name '*_test.go'` |
| Go 测试代码 | 34,830 行 / 177 文件 | 同上 `*_test.go` |
| REST 路由 | 275 条 | `server/*.go` 的 `mux.HandleFunc` |
| 数据表 | 60 张 | `db/schema.sql` |
| db 模块 | 112 个文件 / 21.6k 行 | `db/` |
| 领域工具 | 30+（`report_finding`、`traffic_get`、`add_intent` …） | `agent/tools*.go` |
| MCP 工具 | 20 个（已对外） | `server/mcp.go` |
| 通知通道 | 6 类（钉钉/飞书/企微/Webhook/Telegram/邮件） | `notify/` |
| 并发原语 | 56 处 `go func`/goroutine 调用 | `server agent traffic db` |
| SSE/流式端点 | 12 处 | `server/*.go` |
| 外部进程 | 3 个包用 `os/exec`（Kali、shell、更新） | `server agent selfupdate` |
| 关键依赖 | norma（Agent loop）、go-mitmproxy、pgx、modernc sqlite、dnsx | `go.mod` |

子系统规模：

| 子系统 | 生产行数 | 迁移难度 |
|---|---:|---|
| `server/`（HTTP/引擎/管理面） | 29,628 | 高 |
| `db/`（PG 数据层） | 21,559 | 中 |
| `agent/`（提示/工具集） | 8,263 | 中高 |
| `traffic/`（MITM 采集） | 2,505 | **极高** |
| `notify/`（通知交付） | 2,621 | 中 |
| `intercept/`（审批拦截） | 1,232 | 中 |
| `selfupdate/` | 968 | 中 |
| `sidequestion/` | 774 | 低 |
| `mcphttp/`+`mcpserver/` | 887 | 低 |
| `llmrec/`+`llmpool/` | 1,072 | 低 |
| `evidence/`+`report/`+`enrich/`+`vulnclass/`+`capability/`+`guard/` | 1,672 | 低 |

---

## 2. 目标架构

```text
┌──────────────────────────────────────────────────────────────┐
│ 客户端                                                       │
│   dsh desktop/web（TS，已有品牌/账户/工具卡）                  │
│   web/ Next.js 控制台（保持，API base 改为 TS 服务）           │
└───────────────┬──────────────────────────────┬───────────────┘
                │ REST / SSE / MCP              │ OpenAI 兼容
┌───────────────▼──────────────┐   ┌───────────▼───────────────┐
│ vexnar-core（Node + Hono）    │   │ NewAPI（外部，直连）        │
│  · 275 条路由 → 分组路由       │   └───────────────────────────┘
│  · 鉴权 JWT、桌面 token        │
│  · MCP server（20 工具）       │
│  · SSE 活动流/日志             │
└───────────────┬──────────────┘
                │ pg（Kysely，同 schema）
┌───────────────▼──────────────┐
│ PostgreSQL（验证过的 60 表）   │
└───────────────▲──────────────┘
                │ 任务/意图/证据
┌───────────────┴──────────────┐
│ vexnar-worker（独立 Node 进程）│
│  · planner/worker 调度         │
│  · 工具执行（bash/Kali/HTTP）   │
│  · 流量采集（MITM）            │
│  · 通知/报告/归档              │
└──────────────────────────────┘
```

选择理由：

- **dsh 负责 Agent 循环**：Go 侧 `norma` 的 loop 已经不用自己写；TS 侧直接复用 dsh 的
  session/tool/approval 管线，只保留 VEXNAR 的领域工具与调度。
- **core 与 worker 分进程**：长任务、子进程、MITM 都不能挂在 HTTP 事件循环上；
  分开也让"重启 API 不杀任务"成为默认行为（现在 Go 是单进程，重启即杀）。
- **沿用同一份 PostgreSQL schema**：数据迁移风险从"重设计"降为"换驱动"。
- **Next.js 不承载长任务**：现有 `web/` 只做 UI，API 由 core 提供，避免把调度塞进
  Route Handler。

技术选型建议：

| 层 | 选型 | 备选/理由 |
|---|---|---|
| HTTP | Hono + zod | Fastify：生态更成熟，SSE 与中间件略重 |
| SQL | Kysely（SQL-first） | Drizzle：类型好但复杂 JSONB/图查询会打架 |
| 迁移 | 直接执行现有 `schema.sql` + `node-pg-migrate` | 不重写 DDL |
| 队列 | pg-boss（PG 原生） | BullMQ 需 Redis，多一个运维件 |
| 进程 | `execa` / dsh bash | 保留 PTY 时用 `node-pty` |
| 流 | SSE（`hono/streaming`） | WebSocket 只在需要双向时用 |
| 浏览器 | Playwright（已有） | 设备控制另行设计 |
| 打包 | Node SEA / Electron | 先不解决，P6 处理 |

---

## 3. 迁移单元与工作量

人月按"熟悉现有行为 + 移植 + 测试"估算，不含产品新需求。

| # | 单元 | Go 行数 | 目标 | 人月 | 风险 |
|---|---|---:|---|---:|---|
| 1 | 数据层（`db/`） | 21,559 | Kysely + 现有 schema，逐模块移植查询 | 5–6 | 中 |
| 2 | HTTP/API（`server/` 非引擎） | ~14,000 | Hono 路由 + zod 契约 + JWT/桌面 token | 4–5 | 中 |
| 3 | 任务引擎/调度（`engine`/`manager`/`scheduler`） | ~8,000 | worker 进程 + pg-boss + 状态机 | 4–5 | **高** |
| 4 | Agent 工具与提示（`agent/`） | 8,263 | dsh 工具注册 + 现有提示词迁移 | 2–3 | 中高 |
| 5 | 流量采集（`traffic/`） | 2,505 | Node MITM 或 sidecar（见 §6） | 3–5 | **极高** |
| 6 | 审批拦截（`intercept/`） | 1,232 | 规则引擎 + pending 表 + 挂起恢复 | 1 | 中 |
| 7 | 通知（`notify/`） | 2,621 | 6 通道 + 模板/签名/SSRF 防护 | 2 | 中 |
| 8 | 证据/报告/富化/漏洞类目 | ~1,672 | 纯逻辑移植 | 1–1.5 | 低 |
| 9 | LLM 池/记录/用量 | 1,072 | 已部分在 TS（账户/直连），补 failover/账本 | 1 | 低 |
| 10 | MCP server/client | 887 | 已有 20 工具契约，改 TS 注册 | 0.5–1 | 低 |
| 11 | 技能/市场/归档/自更新 | ~3,000 | 文件与 DB 操作 | 2 | 中 |
| 12 | 前端适配 + 双跑工具 | — | `web/` 换 base、对比脚本 | 2 | 中 |
| | **合计** | **71.5k** | | **26–32** | |

> 说明：行数→人月不是线性换算。CRUD 类约 2–3k 行/人月；MITM/引擎这类状态机
> 约 0.8–1.2k 行/人月，且需要额外 spike。

---

## 4. 数据迁移策略（同库双跑）

不做"导出再导入"，而是**同一套 PostgreSQL schema 上双栈读写**：

```text
阶段 A（只读）   TS 读 PG，写操作仍走 Go；只做对账，不对外
阶段 B（影子写） TS 与 Go 同时写，比较结果差异（按表/按接口）
阶段 C（切读）   API 读流量切到 TS；写仍 Go，回滚只需切回读
阶段 D（切写）   写切 TS；Go 保留只读回退
阶段 E（停写）   Go 下线，删双写开关
```

配套：

- **契约冻结**：275 条路由生成 OpenAPI/JSON Schema，作为 TS 的验收基线；
- **对账任务**：同一请求分别打 Go/TS，比较状态码 + 关键字段（忽略时间戳/ID 顺序）；
- **迁移开关**：按路由前缀灰度（`/api/findings/*` → TS），出问题按前缀回滚；
- **schema 只加不改**：迁移期间禁止破坏性 DDL，新列可为空。

---

## 5. 阶段计划

| 阶段 | 周期 | 交付 | 验收门 |
|---|---|---|---|
| P0 契约与 spike | 2 周 | OpenAPI、4 个 spike（见 §9） | 4 个 spike 全过，否则重估 |
| P1 数据层 | 4 周 | Kysely 全表读 + 核心写（tasks/findings/assets） | 与 Go 查询结果一致率 100% |
| P2 工具与 MCP | 3 周 | 20 个工具 TS 化，接 dsh | 同一会话工具结果与 Go 等价 |
| P3 引擎 | 5 周 | planner/worker/暂停/续跑/归档 | 10 个真实任务端到端通过 |
| P4 流量与拦截 | 4 周 | 采集、索引、证据绑定、审批 | 同一目标抓包条数与内容一致 |
| P5 平台面 | 4 周 | 通知/报告/技能/市场/更新/鉴权 | 6 通道实发成功 |
| P6 切换 | 3 周 | 灰度切读切写、Go 下线 | 一周零回滚 |

并行建议：P1 与 P2 可并行（不同人），P4 必须独立负责人。

---

## 6. 决策点：MITM 怎么做

Go 用 `go-mitmproxy`：逐请求落文件树 + SQLite 索引 + body blob，是"证据链"的地基。
Node 生态没有等价成熟件，三个选项：

| 方案 | 说明 | 优点 | 缺点 |
|---|---|---|---|
| A. 纯 TS MITM | `node:https` + `node-forge` 动态证书 + 自写 CONNECT | 单语言、可打包 | HTTP/2/WebSocket/大 body/并发要自己啃，3–5 人月且坑多 |
| B. 外部 sidecar | mitmproxy（Python）或 Rust 代理，TS 通过 IPC/HTTP 取流 | 稳定、成熟 | 破坏"纯 TS"，多一个二进制 |
| C. 抓取式 | Playwright/CDP 采集浏览器流量 | 与浏览器场景贴合 | 覆盖不到非浏览器客户端 |

**建议**：P0 用 B 验证行为等价（最快拿到证据链），P4 再评估是否换 A；
若"全栈 TS"是硬约束，A 的单独立项不要塞进主排期。

---

## 7. 风险登记

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| 1 | MITM 行为差异（HTTP/2、压缩、流式） | 证据缺失、误判 | P0 spike 对比 100 条真实请求 |
| 2 | 引擎并发语义（goroutine → async） | 任务卡死/重复执行 | 用 PG 行锁 + 显式状态机，禁止内存态 |
| 3 | 177 个测试文件的行为覆盖 | 回归不可见 | 先迁测试再迁实现（红→绿） |
| 4 | 长事务/连接池 | 锁等待、超时 | pg-boss + 短事务 + `FOR UPDATE SKIP LOCKED` |
| 5 | SSE/流式差异 | UI 卡在"运行中" | 事件序号与 Go 对齐，UI 不改协议 |
| 6 | 子进程/PTY | Kali 工具行为变化 | 直接用 dsh 的 bash/terminal 管线 |
| 7 | 打包分发 | 用户安装变复杂 | P6 再定 Node SEA/Electron |
| 8 | 许可证 | 分发合规 | dsh MIT、VEXNAR AGPL，保留 NOTICE |

---

## 8. 不建议的做法

- **一次性重写后切换**：71k 行 + 177 测试，回归面不可控；
- **把引擎塞进 Next.js Route Handler**：部署模型与长任务冲突；
- **先做 UI 再补后端**：契约会漂移，双跑失去基准；
- **用 ORM 自动生成全部查询**：现有 SQL 含大量 JSONB/图查询/锁，ORM 会逼你改语义。

---

## 9. P0 的两周 spike（必须先做）

1. **PG 读路径**：Kysely 读 `tasks/exploration_nodes/findings/assets`，与 Go 接口逐字段对比 50 条；
2. **工具等价**：把 `report_finding`/`traffic_get`/`list_assets` 三个工具在 dsh 里以 TS 实现，跑同一任务对比输出；
3. **引擎双跑**：一个只读任务在 TS worker 里完成"规划→执行→写回"，与 Go 同任务结果对比；
4. **MITM 对比**：sidecar 方案抓同一站点，比较请求条数、header/body 哈希、证书链。

**任一项失败 → 重估排期，不进入 P1。**

### P0-1 已完成（2026-11-21）

[`app/spike/p0-db`](./spike/p0-db/README.md) 用 Kysely 读取 `tasks / findings /
assets / exploration_nodes`，与运行中的 Go API 对账：

```text
[PASS] tasks: compared=232 mismatches=0
[PASS] findings: compared=500 mismatches=0
[PASS] assets: compared=73 mismatches=0
[PASS] exploration_nodes: compared=100 mismatches=0
```

同时确认了两个必须带进迁移的语义：任务 `status` 由引擎计算、全局与任务内 finding
使用不同 id（`findings.id` vs 探索节点 id）。

### P0-2 已完成（2026-11-21）

[`app/spike/p0-tools`](./spike/p0-tools/README.md) 把 `list_assets` / `traffic_get` /
`report_finding` 的 TS 实现与 Go MCP 工具对账：**9/9 通过**（读工具逐字节一致，
写工具用事务回滚验证插入形状）。对账暴露的 `TrimSpace`、DSL 转义、校验顺序已记录。

### P0-3 已完成（2026-11-21）

[`app/spike/p0-worker`](./spike/p0-worker/README.md)：TS 用
`FOR UPDATE SKIP LOCKED` 领取意图，执行模拟工具，写回 fact / edge / activity，
6/6 断言通过；随后重启 Go，`/api/exploration/nodes` 能读到同一张图
（intent done、fact confirmed、两条边）。临时任务已清理。

### P0-4 已完成（2026-11-21）

[`app/spike/p0-mitm`](./spike/p0-mitm/README.md) 用同一 curl 分别经过 Go MITM 与
mitmproxy sidecar：11/11 通过——状态码、响应体 sha256 三方一致，两套代理签发的
叶证书都能在各自 CA 下校验。附带发现：`openssl s_client` 探针会让 go-mitmproxy
的下一次握手失败，证书证据需用 `curl -v` 单次请求采集（Node 代理迁移时要对齐或明确不兼容）。

### P1-1 已完成（2026-11-21）

[`app/vexnar-core`](./vexnar-core/README.md)：Hono + Kysely 的只读 API，20 个端点，其中
12 个与 Go 严格/子集对账 **12/12 PASS**；其余 8 个（tasks/assets/findings/nodes）已实现，
派生字段待引擎迁移。同时确认了 int8、时间格式、settings 白名单、scope 对象、
tools.calls、stats.tasks 等契约细节。

### 存储决策修正（2026-11-21）

按产品方向，**数据存储跟随 dsh**：默认用 `$DSH_HOME/vexnar/store` 下的 JSON 域
（可读、原子写、zod 校验），PostgreSQL 降级为可选适配器。`app/vexnar-store` 已实现
两种后端，并从现有 PG 导入后逐项对比：tasks/findings/assets/nodes/stats **6/6 一致**。
存储的域划分、写链/事务/索引边界与性能预算见 [STORAGE-ARCHITECTURE.md](./STORAGE-ARCHITECTURE.md)。
M1（meta 域）已完成：元数据 10 个端点走 `meta.json`，对账 12/12。

`vexnar-core` 已切到该 store：领域读端点（tasks/assets/findings/nodes/stats/counts）
默认走 JSON，PG 仅作为可选适配器；与 Go 的领域对账 **6/6 PASS**，元数据端点仍保持
**12/12 PASS**（P1-2 完成）。

---

## 10. 验收标准（功能对等）

- 275 条路由：状态码/字段/错误码逐条对齐；SSE 事件序号单调；
- 20 个 MCP 工具：同一输入输出语义一致（允许措辞差异，不允许字段缺失）；
- 任务：创建→规划→执行→上报→复测→归档全链路通过，重启可续；
- 流量：同一浏览器会话抓包条数与 body 哈希一致，证据绑定版本号语义不变；
- 通知：6 通道各实发 1 条成功，签名/掩码/SSRF 防护用例通过；
- 性能：列表接口 P95 不高于 Go 基线的 1.2 倍（同机同数据量）。

---

## 11. 成本汇总

| 项 | 人月 |
|---|---:|
| 核心迁移（§3） | 26–32 |
| P0 spike 与契约 | 1 |
| 双跑/对账/切换 | 2–3 |
| 缓冲（20%） | 5–7 |
| **合计** | **34–43** |

3 人团队约 12–15 个月；4 人并行的下限约 10–12 个月。若只做"模型+客户端+工具"
（当前已完成的 part），剩余以数据/引擎/流量为主，不能靠加人线性压缩。
