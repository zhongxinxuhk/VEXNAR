<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# 存储架构设计（dsh 优先，PG 可选）

**目标**：把 VEXNAR 的持久化从"PostgreSQL 为唯一真相"改成"dsh 存储为主、PostgreSQL
为可选适配器"，同时保证：

1. **不冲突**：不与 dsh 自己的会话/配置域混用，不发生双写、跨进程写、静默覆盖；
2. **不拖性能**：读不整文件扫描，写不整库重写，热点表不被单写链拖死；
3. **可回退**：PG 适配器随时可切回，导入/导出可逆。

---

## 1. 现状与约束（dsh storage-domain 的真实边界）

| 能力 | 事实 | 对设计的影响 |
|---|---|---|
| 写链 | **每个 domain 一条写链**，同一 domain 的写串行 | 按写模式拆分 domain，避免图写阻塞配置写 |
| 事务 | **没有跨表事务** | 多实体写必须用日志/出站表，不能假设原子 |
| 索引 | **没有二级索引**，只有 KV | 读侧在内存建索引，分页在内存完成 |
| 变更通知 | `domain/changed` **仅进程内** | 只允许一个写进程；其他进程走 API |
| JSON 布局 | `single` 整文件重写；`per-record` 单文档写 | 大表/高频表用 `per-record`；小配置用 `single` |
| 键约束 | `per-record` 键限 `[a-zA-Z0-9_-]+` | 复合键用 `-` 连接，不用 `:`/`/` |
| 版本 | `compatibleVersions` + 写时升版 | schema 演进按版本号迁移，不做原地破坏 |
| 失败 | 未知状态需关闭重开；批量可能部分应用 | 写前 journal，写后校验；崩溃可重放 |

结论：**不能把 60 张表塞进一个 domain**。单写链 + 无事务 + 无索引，会同时造成
写阻塞和读放大。

---

## 2. 域划分（一个 domain = 一个存储单元 = 一条写链）

```text
dsh home
└─ vexnar/
   ├─ graph/        vexnar-graph      tasks / findings / nodes / edges     per-record
   ├─ assets/       vexnar-assets     assets / companies / scope           per-record
   ├─ activity/     vexnar-activity   activity / tool_usage / usage        per-record（可路由 sqlite）
   ├─ meta/         vexnar-meta       agents / tools / mcp / notify / llm  single
   ├─ journal/      vexnar-journal    跨域写的提交日志                     per-record
   └─ traffic/      （沿用文件树 + SQLite 索引，不进 domain）
```

| domain | 表 | 布局 | 理由 |
|---|---|---|---|
| `vexnar-graph` | tasks, findings, nodes, edges | per-record | 写频繁、单条更新多，整文件重写不可接受 |
| `vexnar-assets` | assets, companies, company_scope | per-record | 资产高频 upsert，3k+ 记录 |
| `vexnar-activity` | activity, tool_usage, llm_usage | per-record；量再大迁 sqlite | 追加型、量大，读多写多 |
| `vexnar-meta` | agents, tools, mcp_servers, notification_channels, llm_profiles, settings(非 secret) | single | 记录少、读多写少，整文件可读性更好 |
| `vexnar-journal` | commits | per-record | 崩溃恢复，按 key 单写 |

拆分依据不是"业务分类"，而是**写频率 + 事务边界 + 后端选择**：

- 图写（intent→fact→edge）不能和 activity 追加抢同一条写链；
- activity 未来可单独路由到 sqlite，其他域继续 JSON；
- meta 用 `single` 换可读性，写放大可接受（几十条记录）。

**键设计**

```text
tasks/<id>                     id 为数字字符串
findings/<id>
nodes/<id>
edges/<src>-<rel>-<dst>        复合键，符合 [a-zA-Z0-9_-]+
activity/<ulid>                时间有序，避免热点
companies/<id>  scope/<company_id>-<hash>
meta 表主键即 key
```

---

## 3. 读写路径与性能

### 3.1 读

- 打开 domain 时一次性加载并校验到内存；此后读是**同步内存读**。
- 每个 domain 建内存索引（启动时构建，`domain/changed` 增量维护）：
  - tasks：`id`、`status`、`created_unix`
  - nodes：`exploration_id`、`(exploration_id, state)`、`(exploration_id, kind)`
  - findings：`task_id`、`status`、`severity`、`created_at`
  - assets：`type`、`company_id`、`last_seen`
- 分页：先走索引取 id 列表，再按键取记录；**不做全表 filter + sort**。
- 列表接口只取投影字段，详情才取大字段（payload/report/evidence）。
- 大对象（HTTP body、截图）不进 domain：沿用 traffic 文件树 + 引用 ID。

### 3.2 写

- 单进程写：只有 `vexnar-core` 打开可写 domain；dsh 插件/其他进程只读 API。
- 同一 domain 的写天然串行；跨 domain 的写**不保证原子**，用 journal：
  1. `journal.put(commitId, {state:'prepared', ops:[...]})`（幂等）
  2. 按序应用各 domain 写
  3. `journal.put(commitId, {state:'committed'})`
  - 崩溃恢复：启动时扫描 `prepared`，按 op 幂等重放；无法判定则标记 `unknown` 并告警。
- 冲突：每条记录带 `rev`；`update` 校验 `rev`，不匹配返回 409，不做静默合并。
- 禁止双写：**同一数据同一时刻只有一个写后端**。JSON 与 PG 不并行写。

### 3.3 性能预算与阈值

| 指标 | 目标 | 触发调整 |
|---|---:|---|
| domain 打开（10k 记录） | < 300 ms | 超过则拆分或迁移 sqlite |
| 列表 P95（1k 记录内） | < 30 ms | 超过则补索引/投影 |
| 单条写 P95 | < 15 ms | 超过则检查磁盘/文件数 |
| `single` 文件 | < 1 MB | 超过改 per-record |
| 单 domain 记录数 | < 50k | 超过路由 sqlite 或再拆分 |
| 单记录 payload | < 256 KB | 超过外置 blob + 引用 |

基准脚本放在 `app/vexnar-store/bench/`（下一步实现），固定 1k/10k 两档数据。

---

## 4. 不冲突的规则

1. **命名空间**：domain 名统一 `vexnar-*`；不碰 dsh 的 `workspace`、`session` 等域。
2. **目录**：`$DSH_HOME/vexnar/` 下；不写 dsh 自己的 `sessions/`、`profiles/`。
3. **单写者**：`vexnar-core` 持锁文件 `vexnar/store.lock`（pid + 启动时间）；
   第二个写进程启动即失败，只允许只读模式。
4. **不存密钥**：settings 只存非敏感项；API key 进 dsh credentials；
   `auth.*` 永不落 JSON。
5. **不重复真相**：会话/转录归 dsh session 日志；VEXNAR 只存任务/资产/漏洞/流量引用。
6. **版本**：domain `version` 随 schema 升；旧数据通过 `compatibleVersions` 读，
   写时升级；迁移脚本只做"读旧→写新"，不原地改文件。

---

## 5. PostgreSQL 适配器（可选插件）

- 同一个 `Store` 接口，两种实现；`VEXNAR_STORE=postgres` 时整体切换，**不混用**。
- 用途：
  1. 存量部署继续跑；
  2. 从 PG 一次性导入 JSON（`pnpm --filter @vexnar/store run seed`）；
  3. 回退通道（JSON 出问题时切回）。
- 写支持在 P2 补；当前 PG 适配器只读。
- 切换流程：停写（或维护窗口）→ 导入/导出 → 校验计数与抽样 → 切 `VEXNAR_STORE`
  → 观察一周 → 删除旧路径。

---

## 6. 迁移与版本

| 阶段 | 动作 | 验收 |
|---|---|---|
| M1 | `vexnar-meta` 建域，元数据（agents/tools/mcp/notify/llm/settings）从 PG 导入 | 12 个元数据端点对账 12/12 |
| M2 | graph/assets/activity 从 PG 增量导入，写路径仍 Go | 读对账 6/6，PG 继续写 |
| M3 | core 接管写（journal + rev），Go 只读回退 | 写路径对账 + 崩溃恢复演练 |
| M4 | 停 Go 写，JSON 为唯一真相；PG 保留只读导出 | 一周零回滚 |

每阶段都保留：`seed`（PG→JSON）、`export`（JSON→PG）、计数与抽样校验。

---

## 7. 失败模式与恢复

| 失败 | 表现 | 处理 |
|---|---|---|
| 写一半崩溃 | journal `prepared` | 启动重放；幂等键防重复 |
| 磁盘满/IO 错 | domain `unknown-state` | 关闭重开；从 journal 恢复；告警 |
| 文件被手改坏 | 打开时 `invalid-record` | 定位记录→修复/剔除；保留 `.bak` |
| 两进程写 | 锁冲突 | 第二个进程只读；提示关闭 |
| 版本不兼容 | `version-mismatch` | 用兼容读或迁移；禁止降级写 |

---

## 8. 与 dsh 的接线方式

- **P2**：`@vexnar/store` 变成 dsh 插件：`defineDomain` 四个域，`ctx.storageDomain.open`；
  PG 作为独立 backend 插件注册。
- dsh 客户端只通过 `vexnar-core` 的 REST/MCP 读写，不直接打开 store 写。
- 若 dsh 进程需要只读展示，提供 `readOnly` 打开模式（不加写链）。

---

## 9. M1 落地状态（2026-11-21）

- `vexnar-meta` 已实现：`$DSH_HOME/vexnar/store/meta.json`（version + tables），
  agents / tools / mcp / notify / llmProfiles / taskCategories / taskTemplates / settings；
- 元数据端点 10 个已切到 meta 域，对账 12/12；companies 仍在 PG（assets 域）；
- seed 修正了两个 PG 别名排序陷阱（`id::text AS id` 会让 `ORDER BY id` 变成字典序），
  并补齐 profiles 的 null 省略、tools 的 `agents: []` 归一。

M2 首步已完成：graph/assets/companies 全部改为 **per-record 目录**
（`tasks/<id>.json` 等），单次写只替换一个文档；companies 的 PG 顺序用
`<ordinal>-<id>` 键保持；core 不再直连 PG。store 对账 **7/7**。
activity 域已进 store（`activity/<id>.json`，9.6k 条），任务指标
（tokens / goals / in_flight / findings）由 store 计算并与 Go 对账一致；
`last_activity_unix` 仍是引擎内存心跳，读路径无法等价，比较时排除。

写路径已落地：`store.writer` 提供 per-record 原子写、journal 提交/重放、
`rev` 乐观锁、单写者锁；core 新增 `POST /api/tasks` 与
`PATCH /api/exploration/findings/:id`，写后读缓存失效。写入测试 7/7。
`report_finding` 已落地：finding + finding 节点 + `yields` 边在**一个 journal 提交**
里写入，校验 task/intent 归属；写入测试 9/9，HTTP 冒烟通过。
任务生命周期已落地：PATCH 改名/置顶（`rev` 冲突 409）、pause/resume、
软删除（任务从列表消失，findings/图保留）。写入测试 **14/14**。
journal 恢复只重放 `prepared`；`failed`（如乐观锁冲突）不重放，避免半记录覆盖。

M3 第一段：core 增加 `VEXNAR_GO_FALLBACK` 过渡代理，未迁移路由原样转发 Go；
`/api/_migration` 暴露原生清单。web 可先整体指向 TS core，再逐条把写接口迁过来。

分类/模板、资产挂载、任务范围写路由已迁；资产挂载幂等计数，范围域名/IP
会同时建资产。写入测试 **22/22**。通知渠道增改删、agent 名称/描述、tool 配置已迁；写入测试 **24/24**。
归档已迁（27/27 写测试）。M4 读路径：intents、activity/history、tokens 的 workers/total 已由 store 提供；
activity 的 session 过滤、seq/ts DTO、升序页与 snapshot 游标与 Go 一致（domain 9/9）。
tokens 的 workers/sessions/total 已对齐。目标读写出齐：列表与 Go 完全一致；新增目标写入 goal 节点并挂根事实
`spawns` 边，修改/删除走节点记录。
引擎类接口继续走 fallback。

锁的边界补充：空的 `store.lock`（旧版本释放后留下）被识别为陈旧锁并接管。

## 10. 待决问题

1. `activity` 何时切 sqlite？建议 > 50k 行或单文件 > 10 MB 时。
2. `journal` 的清理策略：保留 7 天 + 最近 1000 条。
3. `rev` 是全局单调还是每记录？建议每记录 `rev` + 域级 `epoch`。
4. meta 的 `settings` 是否仍允许 UI 直接改文件？建议只走 core API。
