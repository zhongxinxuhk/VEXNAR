# VEXNAR Harness 重构评估报告

> 设计台账：2026-11-23 · v1 · 轨道=重构 · 审计材料=`app/vexnar-core`（23.6k 行）+ `app/vexnar-store`（4.4k 行）+ `app/vexnar-egress` + `app/vexnar/{account,ui}` + `app/vexnar/cordis.patch.yml` + 仓库根 Go 侧（`agent/`·`server/`·`traffic/`·`db/`）+ 运行数据快照（`.vexnar-home/vexnar/store/vexnar.sqlite`、`data/traffic/_index/index.sqlite`、`profiles/vexnar/package.json`）· 独立评审 **存疑 9 项已全部回修（1 项经复核为评审误读，补全路径消歧）**
>
> 审计范围按需求方提问收敛为一条业务链：**会话 → 调用抓包 → 代理池通过 → 漏洞复测 → 落库**。六层其余部分只记录与这条链相关的现状。

> **方向变更（2026-11-23 晚）**：本报告 §3 的 D2「采集面与出口面串联」以及 G2/G4 的抓包路线
> 已被需求方否决，改为**会话感知 HTTP 引擎**（`app/vexnar-web/`，见 `docs/WEB-TESTING-ENGINE.md`）：
> 不再使用 tshark/Yakit/mitmproxy，请求由 undici 在应用层发起与记录。
> 本报告仍然有效的部分：G1（工具面归位）、G3（复测闭环）、G7（V 层）、G8-G13（策略/评估/成本），
> 以及"三个 0"这一现状证据。



---

## 0. 结论先行

**这条链在代码里是四段各自成立的实现，在运行时是断开的。** 不是"逻辑有 bug"，是**连接件缺失**：四段之间没有任何一处是端到端验证过的路径。

| 跳 | 期望 | 实际（默认 `ts` 模式） | 判定 |
|---|---|---|---|
| 会话 → 工具 | 会话里能调 `traffic_search` / `report_finding` / 复测工具 | dsh 的工具面 `mcp-manager.servers = {}`（`vexnar/cordis.patch.yml:56-66`）；TS core **没有 `/mcp` 服务端**；`yak_*` 工具也被 `VEXNAR_RUNTIME_MODE === 'go'` 关掉（`vexnar/account/src/index.ts:152`） | **断** |
| 会话 → 抓包 | agent 自己发起/停止抓包 | 目录里的 61 条默认工具**没有采集控制工具**（`catalog/defaults.ts`；当前 profile 实测 62 行，多出的一条是自定义工具）；抓包只能由人点 chat 头部按钮（`vexnar/ui/src/capture-action.tsx:54`） | **断** |
| 抓包 → 代理池 | 流量经代理池出网，同时被录下来 | MITM 的 `connectUpstream()` 用 `netConnect/tlsConnect` **直连目标**（`traffic-proxy/mitm.ts:344-360`），不支持上游代理；egress 也不把 capture scope 当会话。**反向也断**：egress 已具备"给别人当上游"的能力（`egress/manager.ts:292` 的 `endpoint()` 发带凭据的上游 URL、`gateway.ts:51-65` 的 `openFixed` 无认证回环端口），却没有任何地方把采集面接上去；Go 采集面反而**已有** `SetUpstreamProxy` 钩子（`traffic/traffic.go:254,390`），只在测试里被调用 | **断** |
| 代理池 → 复测 | 复测在池里的出口上做最小验证 | retester preset 只给了 `tool-bash`（直连出口），人格文本也**没有**要求走出口（`cordis.patch.yml:536-539`）；看起来是要靠 egress 插件提供 `egress_exec`，但该插件在当前 profile **未安装**（`profiles/vexnar/node_modules/@vexnar/` 只有 app-bundle/dsh-account/dsh-ui），patch 的 `disabled` 守卫把它静默关掉（`cordis.patch.yml:37-52`） | **断** |
| 复测 → 落库 | 复测结论写回该 finding 的复测记录 | TS 只负责**建 pending 行 + 读行**（`routes/exploration.ts:741-802` / `1184`），没有任何状态迁移与 verdict 写入器；真正实现 `record_finding_retest_result` 的只有 Go（写 PG） | **断** |
| 落库 → 回看 | 抓到的流量成为漏洞证据，agent 之后能引用 | 流量是两个库：TS `traffic_exchanges` **0 条**；Go `index.sqlite` **2364 条**。证据绑定走的是**内容寻址快照**（`finding_traffic_bindings` 只有 `snapshot_id`，见的字段 `['id','note','role','position','created_at','finding_id','snapshot_id','rev']`），快照里的 `source_traffic_id` 是自由字符串（实测样本 `"reporter-baseline"`）——跨库既不可校验也无法回溯，agent 的流量工具读 Go，会话抓包写 SQLite | **半通**（结构可存证，但不可互相验证） |

**一句话**：链路不是"通顺但慢"，是"**每一跳都能单独跑，但没有一跳跑到下一跳**"。当前 profile 里这条链的实际证据是三个 0：`trafficCaptures = 0`（从未起过抓包）、`traffic_exchanges = 0`（从未落过一条会话流量）、`finding_retests = 0`（从未有过一次复测记录）。

---

## 1. 现状映射表

### 1.1 六层

| 层 | 现状实现 | 备注 |
|---|---|---|
| **E 执行循环** | 三套循环并存：①dsh 宿主主循环（插件化、日志驱动，上游能力）；②TS engine `createEngine.plan/work`（`vexnar-store/src/engine.ts`，`maxTurns=4`、重试 3 次、`serialized()` 串行领意图）；③TS 会话回合 `runConversationTurn`（`routes/conversations.ts:290-317`，**单次补全，无工具**） | 三套循环各有自己的终止条件，互不共享预算；`runTaskChat`（:319）同样单轮 |
| **T 工具注册** | 默认 61 条目录行落在 SQLite `meta.tools`（`catalog/defaults.ts`，Go 侧生成；当前 profile 实测 62 行，多一条自定义）；**可调用面向**：MCP `vexnar`（仅 go 模式）/ dsh 内置（bash·fs·web·todo·ask_user）/ 第三方 bundle / `vexnar-egress` 6 工具（当前未装）/ engine 10 个 CLI 白名单（`store/src/tools.ts`）；自定义工具有独立执行器（`routes/gaps.ts:158-197`），系统工具**没有** | 注册（目录行）≠ 披露（dsh 决定）≠ 授权（intercept 表）；三者分散在三处 |
| **C 上下文** | dsh 侧 compaction 插件；engine 用 `compact()` 硬截断 4000 字符（`engine.ts:30-36`）；会话历史 `buildHistory()` 全量回放 | 无预算分配（指令/历史/工具结果/资料），无前缀稳定性设计 |
| **S 状态存储** | 五处：SQLite `vexnar.sqlite`（kv+meta）/ `storeRoot()` 下 per-record JSON / Go PostgreSQL（127.0.0.1:7432/artex）/ Go `data/traffic/_index/index.sqlite` / 每会话附件目录 `storeRoot()/sessions/<key>` | 写者与读者跨库无仲裁 |
| **L 生命周期** | `intercept_rules` + `intercept_pending`（人在回路四档的配置面，`routes/intercept.ts`）；入口鉴权 = loopback + Host/Origin/Sec-Fetch-Site 校验 + `x-vexnar-desktop-token`（`go-data.ts:73-87`、`proxy-bridge.ts:66-80`）；抓包 ingest 独立 key（`traffic-key.ts`） | 规则存在，**TS 侧找不到强制执行点**（无 pre-tool-call hook），强制力留在 Go/宿主 |
| **V 评估** | 无。终止靠 agent 自报 `finish`（`engine.ts:121-127`）；finding 由上报者自己 `bind_finding_traffic` 绑证据；报告由 reporter 自写 | 生成者兼任评估者，属 E 层验证强度阶梯第三档 |
| **范式 P** | 插件化（dsh bundle + cordis patch 覆盖层）+ 声明式（YAML）+ 单机 + 中心化调度；**能力供给三形态并用**：内置（TS core）、MCP 服务器（Go）、bundle 插件（egress / 第三方） | 双栈迁移期：`VEXNAR_RUNTIME_MODE` 决定数据面归谁（`mode.ts:19-22`、`go-data.ts:70`） |
| **模型组合** | **未设计**：planner / worker / 会话 / 复测全部落在 `agent-default-model`（profile 里 write 成 `devops-herness-pro`）；无任务-模型分派表、无级联升级条件、无升级率监控 | `cordis.patch.yml` 只给了默认模型，没有分档 |

### 1.2 框架外现状（不硬塞进六层）

1. **双采集面**：TS 进程内 MITM（每 scope 一个回环端口 + 自己的 CA，`store/traffic/mitm-ca`）与 Go 的 `traffic.Traffic`（`data/traffic/_ca` + `_index`）并行存在。TS 侧注释已自认这件事（`traffic-index.ts:12-24`："历史流量只在 Go 的索引里"）。
2. **双存储真相**：`TASK-LIFECYCLE.md` 明写 Go 的 `server/task_summary.go` 是"权威定义"，而代码默认 TS 直接用 SQLite 回答（`mode.ts` 默认 `ts`）。同一条任务在两个库里可以同时存在且状态不同。
3. **契约桥**：`proxy-contract.ts`（v1 + `PROXY_ENDPOINTS` 白名单）与 `proxy-bridge.ts` 是 Go 回退期唯一的跨语言耦合面，`VEXNAR_EGRESS=go` 才启用。
4. **离线一次性迁移**：`vexnar-store/import-pg.ts` / `seed.ts` 把 PG 投影到 SQLite（tasks/findings/assets/nodes/activity/schedules/triggers/绑定…），**不含 agents/tools/mcp/LLM 配置**——但当前 profile 的 `meta.agents` 里确有 8 个内置角色 + 2 个 run artifact，说明这批数据来自更早的导入路径。
5. **大量"唯一定义"文档**（TASK-LIFECYCLE / STORAGE-ARCHITECTURE / UPSTREAM / EGRESS-*）：口径写得比实现严，实现跟上之前，文档本身是负债（读者会按文档判断行为）。

---

## 2. 缺口清单

> 判据来源：`h-framework.md` 六层必答问题（简写 L 层 Q3 等）/ `production-checklist.md` 七项 / 模型分派表。

| # | 缺口 | 定级 | 判据来源 | 证据 |
|---|---|---|---|---|
| G1 | 默认 `ts` 模式下 agent **一个领域工具都没有**：MCP fleet 为空、`yak_*` 只在 go 模式注册、egress 插件未安装 | 阻断 | T Q5（注册≠披露）、T Q10（能力降级链） | `vexnar/cordis.patch.yml:56-66`；`vexnar/account/src/index.ts:152`；`profiles/vexnar/package.json` 依赖清单无 `@vexnar/dsh-egress` |
| G2 | 采集面与出口面**两侧都没有接线**：TS MITM 直连上游、无 `via`/upstream 能力；egress 已具备"作为他人上游"的能力（`egress/manager.ts:292` `endpoint()` 发带凭据 URL、`gateway.ts:52` `openFixed()` 开无认证回环口）却无人接；Go 采集面有 `SetUpstreamProxy` 钩子但只在测试里用（`traffic/traffic.go:254,390`） | 阻断 | T Q3（工具在哪执行）、E Q8 | `traffic-proxy/mitm.ts:344-360`；`egress/manager.ts:292`；`egress/gateway.ts:52`；`traffic/traffic.go:254,390` |
| G3 | 复测无闭环：只有 `enqueueFindingRetest`（建 pending）与两条读路由，**无状态迁移/verdict 写入器**；两个复测工具的实现在 Go（写 PG） | 阻断 | E Q1（终止由 V 说了算）、S Q2（可恢复） | `routes/exploration.ts:741-802`、`1184`；Go 侧 `server/finding_retests.go`、`agent/retester.go` |
| G4 | 流量双库、双 ID 空间：会话抓包写 SQLite（实测 0 条），agent 的 `traffic_search/get/blob` 读 Go 索引（实测 2364 条）。存证侧不是 `traffic_id` 而是内容寻址快照（`finding_traffic_bindings.snapshot_id`，`source_traffic_id` 是自由字符串、实测样本 `"reporter-baseline"`），因此**证据链在结构上是通的，但在两个库之间不可校验、不可回溯**；agent 无法用抓到的流量自查，人也无法判断证据出自哪次抓包 | 风险（原判阻断，经独立评审下调：快照机制提供了存证通路） | S（单一真相源）、V Q5（工具回执≠事实） | `traffic-index.ts:12-24`；实测行数对比；`finding_traffic_bindings` 字段实测 |
| G5 | 人格指令与能力不一致：worker / pentest 的 persona 明写"出网统一走 `egress_exec` / fanout_fetch / pivot_add"，而工具缺失时是**静默 disabled**（无告警、无 `egress_status` 可探）；反方向同样有问题——**retester 的 persona 完全没提出口**（`cordis.patch.yml:536-539`），复测会走 `tool-bash` 直连，与"复测应在池出口验证"的意图相反 | 风险 | T Q5、T Q10（降级链要可见） | `cordis.patch.yml:37-52`（`disabled: !!js existsSync(...)`）、`:297-299`、`:418-420`、`:536-539` |
| G6 | engine 执行面**完全绕过出口面与采集面**：`createRunner` 的 env 只有 `PATH/HOME`（`vexnar-store/src/exec.ts:61`），nuclei/sqlmap/ffuf 直连出网，不写 capture scope；自定义工具测试路径 `execFile(cmd, …, {cwd: storeRoot()})` 既无命令白名单也无代理注入（`vexnar-core/src/routes/gaps.ts:170-183`） | 风险 | T Q3（凭证/出口不进执行环境）、L 层纵深 | `exec.ts:61`；`engine.ts:166,174`；`vexnar-core/src/routes.ts:487`；`routes/gaps.ts:170-183` |
| G7 | 无 V 层：终止靠自报 `finish`；证据由上报者自绑；报告由 reporter 自写。复测判定也准备走同一形态（pending→自报 done） | 风险 | V Q1/Q3/Q7（验证强度阶梯） | `engine.ts:121-127`；`finding_workflow.go` 的自动绑定指引 |
| G8 | L 层规则无强制点：`intercept_pending` 有表、有审批 UI，但 TS 侧与各插件侧都找不到 pre-tool-call 拦截器；宿主侧是否由 `@deepseek-ai/dsh-experimental-auto-review` bundle 承担**无法确认**（该 bundle 在 profile 的 bundles 清单里，但不在 profile 的 `node_modules` 里，无法判定是否由运行时内置提供） | 风险 | L Q2（安检门不可绕过）、L Q5（纵深） | `routes/intercept.ts` 全文；`vexnar/account/src/index.ts` 无 hook；`profiles/vexnar/package.json` bundles 清单 |
| G9 | 单一真相缺失且无人仲裁：tasks/findings/assets 同表存在于 SQLite 与 PG，写者取决于进程，读者取决于模式开关。项目自己的 M4 目标是"停 Go 写、单一真相"（`STORAGE-ARCHITECTURE.md:151`），当前处在 M3 与 M4 之间 | 风险 | S Q2/Q5 | `mode.ts:19-22`；`go-data.ts:63-71`；`TASK-LIFECYCLE.md` 开头"Go 是权威"；`STORAGE-ARCHITECTURE.md:9,151` |
| G10 | 会话回合是**单次补全**（无工具循环）：`runConversationTurn` 一次 `gatewayComplete` 即写结果。注意范围：主 UX 的「对话」已改为 dsh 原生会话（`SIDEBAR-INTEGRATION.md:65`），TS 这套回路现在只服务旧的 Next 控制台（`web/src/lib/api.ts` 仍在调 `/api/conversations`），因此这是**技术债**而非当日阻断——但它会让人误判"会话里的工具循环在 TS 里" | 优化 | E Q1-Q4、P 能力供给形态 | `routes/conversations.ts:290-317`；`SIDEBAR-INTEGRATION.md:65` |
| G11 | 防跑飞三保险只落了 1 个：有 `maxTurns`，无 token 预算、无端到端墙钟预算；无"原地打转"检测（同工具+同参指纹） | 优化 | E Q2、E Q5、E Q8 | `engine.ts:91-209`（无 budget/ping-pong 逻辑） |
| G12 | 全链路同档模型：**代码配置层面**只写了一个 `agent-default-model`，没有任务-模型分派表、没有级联升级条件、没有升级率监控（profile 里被固定成 `devops-herness-pro`）。运行时是否真的全部同档无法从仓库证明 | 成本浪费（证据不足：运行时分档未实测） | 模型组合 Q1/Q3 | `cordis.patch.yml` 仅 `agent-default-model`；`runtime.ts:135-147` 无档位信息；`profiles/vexnar/cordis.patch.yml:54-58` |
| G13 | 抓包只能人工触发；默认 61 条目录里没有采集控制工具（start/stop/endpoint） | 优化 | T Q8（供给来源完整性） | `catalog/defaults.ts` 工具清单；`capture-action.tsx:54` |

**定级口径**：阻断 = 这条链今天不可能跑通；风险 = 特定条件下静默错误或承诺失效；优化 = 能跑但质量/体感有硬提升空间；成本浪费 = 功能正确、资源错配。

> **G1 的模式条件**：本表按代码默认值 `VEXNAR_RUNTIME_MODE=ts` 判定（`mode.ts:19-22`）。若实际以 `go` 运行，G1 的"工具面为空"不成立（Go MCP 会挂上），但 G5/G6（出口未串联）与 G2/G3（采集与复测仍在 TS 侧）照样成立，G4/G9 反而升级为日常问题（工具写 PG、控制台读 SQLite）。**同一个缺口在不同模式下严重度会换位**，所以修复顺序应按"与模式无关"的 G2/G3 先做。

---

## 3. 重构决策卡

### 3.1 改什么（按缺口级别排序）

**D1（对应 G1/G13）工具面归位——本报告最关键的一次架构裁决**

现状是"目录在 TS、执行面在 Go、且 ts 模式下执行面被关空"。三条路：

| 方案 | 做法 | 优点 | 代价 | 建议 |
|---|---|---|---|---|
| A. TS 侧 tools 插件 | 新增 `@vexnar/dsh-tools`，用 `ctx.tools.register` 把高频子集（流量三件套、finding 三件套、复测两件套、task 查询）直接桥到 core | 主源在 SQLite（历史归档按 D4 并查，不再有"第二套写入真相"）；进程少一跳；**桥已经现成**：`ctx.provide('vexnarCore', { request })` 已在同进程内用 `handle()` 直调 Hono 路由，不需要端口/token（`vexnar/account/src/index.ts:195-214`）；与 `vexnar-egress` 同构，运维一致 | **壳薄的是 finding/task/复测队列**（路由已在）；**流量三件套不是薄壳**：要先把 `/api/traffic` 的检索、单条 get、blob 分段取三件套补齐/接上（`recordExchange`/`getExchangeRaw`/`blobStore` 已有底座，但 search 的过滤语义与 `traffic_search` 的契约要对齐），这部分工作量真实存在，不能按"零成本"估 | **推荐** |
| B. 把 Go MCP 常开 | 去掉 `runtimeMode === 'go'` 门槛，ts 模式也挂 Go MCP | 零新代码 | 工具面写 PG、控制台读 SQLite，G4/G9 变成日常；隐蔽性与一致性都退步 | 不推荐 |
| C. TS core 自建 `/mcp` | core 实现 MCP server | 与 dsh 天然对齐 | 要自己做会话/鉴权/超时/SSE，且与 core 的 Hono 路由重复 | 备选 |

同时补一个 `capture_control` 工具（start/stop/endpoint），让"会话里调用抓包"成为 **agent 可自证** 的动作，而不是人点按钮。

**D2（对应 G2/G6）采集面与出口面串联**

先选接线点，三条路（只影响"谁给 MITM 当上游"，不影响是否串联）：

| 方案 | 做法 | 判断 |
|---|---|---|
| a. MITM 走 egress gateway | `connectUpstream()` 改成"若该 scope 有 egress 会话 → 用 `gateway` 的 HTTP CONNECT（带 core 生成凭据）跳出；否则直连"；`gateway.openFixed(key)` 给不支持凭据的客户端用 | **推荐**：与 M4 方向一致，采集面留在 TS，鉴权/计费/健康都在 egress 一处 |
| b. 接线 Go 的 `SetUpstreamProxy` | Go 采集面本来就有这个钩子（`traffic/traffic.go:254,390`），把 Go 的出口指到 egress 即可 | 代码最省，但采集面回到 Go、流量又落 Go 索引，直接撞 D4 的 M4 目标；只可作为**过渡验证**，不作为终态 |
| c. 让 egress 认领采集 | 在 egress 内部录包 | 等于重写采集面（TLS 终止、CA、scope 归属），与现有 MITM 重复，不做 |

具体三步：

- MITM 增加上游：`connectUpstream()` 按上表 a 走，失败**降级直连**并在 exchange 上打 `egress: 'bypass'` 标记（不静默）。
- `capture/start` 请求体增加 `pool_id/mode`，把 `capture scope ↔ egress session` 存成一条绑定（复用 `capture-state.ts` 的 meta 行，加两个字段）。
- engine 的 `createRunner` 注入 `HTTP(S)_PROXY`（取 `mgr.endpoint({taskId})`）+ 写回 capture scope，使 nuclei/sqlmap 与 agent 出口同源。

**D3（对应 G3）复测闭环**

- TS 侧补 `finding_retests` 状态机：`pending → running → done|failed`，字段沿用 Go 的 `verdict/summary/evidence/error`（`retestDto` 已定义好）。
- 由 D1 的工具面暴露 `get_finding_retest_context` / `record_finding_retest_result`；`record` 的写入必须走 core 的同一行（`exploration.ts` 的 `FINDING_RETESTS`），并同事务把 finding 的 `status` 一并更新。
- `retestAgentReady()` 的校验对象从 `meta.agents` 改为"dsh preset 的 retester 是否存在"——现在校验 SQLite 里一行可能在干净安装上不存在的手抄数据（`exploration.ts:725-739`），这是把两份名册当一份用。

**D4（对应 G4）流量真相收口**

建议收口到 SQLite 单库：Go 采集面降级为"只读历史源"，`traffic-index.ts` 继续只读打开它做历史查询，新采集一律走 TS MITM；`traffic_search/get/blob` 由 D1 的 TS 工具实现，查询面 = `traffic_exchanges` ∪ 归档索引（两个来源在 DTO 层合并，ID 加来源前缀避免撞号）。另一条路（收口到 PG）会让迁移方向反转，不推荐。**此建议与项目自己的目标一致**：`STORAGE-ARCHITECTURE.md:9` 写的就是"dsh 存储为主、PostgreSQL 退为可选"，M4 里程碑是"停 Go 写、JSON 为唯一真相、PG 保留只读导出"（:151）——现在的状态是 M3 之后、M4 之前，本报告 D4 只是把 M4 落到流量域。

**D5（对应 G7）V 层最小化落地**

先只做两条**程序化**验证，不进模型裁判：
1. `report_finding` 时由 core 按 scope **自动**绑定该会话的 capture 流量（禁止 agent 自绑）；
2. 复测结论落库前校验"引用的证据能在本库解析"：要么是 `traffic_exchanges` 的一条 exchange，要么是能反查到 `source_traffic_id` 的快照；解析不到就**拒绝写入并回 409**（把 G4 从"人记得核"变成硬约束。注意：这是校验，不是拦截登记动作——人工挂证仍应允许，只是必须带可解析指针）。

### 3.2 不改什么（克制）

| 保留现状 | 理由 |
|---|---|
| dsh 宿主 + bundle/patch 分层 | 上游保护机制（`upstream:check` 36 项断言）是资产；工具面用插件接进来，正好顺着它的扩展点走 |
| egress 数据面（mihomo 托管 + 链式 + pivot） | 实现完整、有链式测试；问题只在"没接上采集面"，不在自身 |
| intercept 规则表与契约 | 规则字段与 Go 一致，缺的是执行器，不是设计 |
| `writer`/`taskQueue`/`scheduler` | 单写 + 恢复 + 队列已可用，重构不碰 |
| Go 服务本体 | 作为**历史数据源 + 回退路径**保留一个版本周期，不新增 Go 功能 |
| `PROXY_CONTRACT` 白名单转发纪律 | 这是"桥不是任意代理"的正确做法，值得作为新工具面的模板 |

### 3.3 迁移顺序（每步可独立验证）

| 步 | 动作 | 独立验证（信号必须可观测，不是"改完就好"） |
|---|---|---|
| S0 | `pnpm run setup` 重装 profile（把 `@vexnar/dsh-egress` 装进去） | 会话里 `egress_status` 有返回（当前应当报"未知工具"）；改后 `egress_exec` 跑 `curl -s ifconfig.me` 的出网 IP ≠ 本机出口 IP |
| S1a | D1 只读面：`traffic_search/get/blob` | 人点一次抓包 → `select count(*) from kv where tbl='traffic_exchanges'` > 0 → 同一会话里 `traffic_search(host=…)` 返回该 host 的记录，且 id 能在 `traffic_get` 取到正文 |
| S1b | D1 写入面：`capture_control` + `report_finding` + `bind_finding_traffic` | 会话里 agent 自己 `capture_control(start)` → `trafficCaptures` 出现该 scope 的 `started_at`；随后 `report_finding` 能在 `findings` 表查到新行 |
| S2 | D2 上游串联（MITM→gateway，方案 a） | 抓包期间**从目标站侧看**访问日志的源 IP = 池内节点 IP（不是本机）；同一条 exchange 上带 `egress` 归属标记（`node_id` 或 `bypass`） |
| S3 | D3 复测状态机 + 两工具 | 点复测 → 行 `pending→running→done`，`verdict` 非空，finding `status` 同步变化；复测期间 egress 会话的 `requests` 计数 +N（证明验证请求走了池） |
| S4 | D5 程序化挂证 | 新 finding 的 `finding_traffic_bindings` 非空、`snapshot_id` 可解析；构造一条引用不存在的复测结论 → 得到 409 而不是写入成功 |
| S5a | D4 流量单库收口 | agent 的 `traffic_search` 结果里同时能看到"新抓的（SQLite）"与"历史的（归档索引）"，且都能 `traffic_get` 取到正文 |
| S5b | G6 engine 出口注入 | 同一任务里 engine 跑 nuclei 与 agent 跑 `egress_exec` 的出网 IP 一致；任务 activity 里能查到该次调用的出口会话 |

> S5a 与 S5b 必须分开：前者是数据面收口、后者是执行面接线，混在一起出问题时无法判断是哪一层没生效。

### 3.4 回滚点

| 步 | 回滚方式 | 备注 |
|---|---|---|
| S0 | profile 用 `pnpm add` 回退到旧依赖清单；或临时改 patch 的 `disabled` 守卫为 `true` | 纯配置，无数据迁移 |
| S1a | 新工具插件整包 disable（bundle 层单行），core 不受影响 | 插件是新增件，卸载即净 |
| S1b | 同上；`capture_control` **必须手工 stop** 再卸载，否则 scope 端口会留到进程退出 | 卸载前清 `trafficCaptures` 的 active 行 |
| S2 | 环境开关 `VEXNAR_CAPTURE_UPSTREAM=direct`（一行退回直连） | 开关默认值设为 `direct`，灰度时显式打开 |
| S3 | 状态机只加字段与写路径，旧 pending 行仍可读；如需回退，代码层回退（**无运行时开关，需代码回滚**——已标注） | 不加开关是有意的：复测写入路径不该有第二条真相 |
| S4 | 校验失败降级为"空绑定 + 告警"而不是整单失败 | 需与 D5 的 409 口径一起确认：**人工挂证允许，自动绑定失败不阻断** |
| S5a | `VEXNAR_TRAFFIC_SOURCE=go|ts|both` 双读开关保留一个版本 | 只读并查，切换不改数据 |
| S5b | `VEXNAR_ENGINE_EGRESS=off` 退回不注入 | 注入失败降级直连并打标，不阻断工具执行 |

---

## 4. 经济性三视角（必答）

**成本**

现状是"全链路同一档模型 + 无预算分配"，这既是浪费也是风险（复测这种窄判定用强档 = 用大炮打蚊子）。建议的分派表（档位不绑产品名，落地时按 profile 里的实际目录填）：

| 步骤 | 归属 | 理由 |
|---|---|---|
| 目标拆解 / 规划 | 强力 LLM | 开放推理、跨步因果 |
| 执行循环主体 | 强力 LLM | 同上，且要带工具 |
| 流量检索结果摘要、活动条目摘要 | 快速低价 LLM | 语义简单、容错大 |
| "这条 exchange 是否支持该漏洞"判定 | 决策型模型 / 确定性规则 | 封闭答案集（host+path+参数匹配），可先跑规则 |
| 复测结论分类（复现/未复现/证据不足） | 快速低价 LLM + 规则兜底 | 窄判定，升级条件=置信度低 |
| 通知/报告首稿 | 快速低价 → 强力润色 | 分两段，避免一次强档长生成 |

预算分配建议按 4:3:2:1（主推理 : 生成 : 摘要 : 判定），并把复测/绑定这类验证开销**显式算进任务预算**，否则它永远是预算外支出。

**缓存**

- **必须警惕**：如果把 61 条目录工具全量常驻进前缀，按产品经验值（30–50 条）会拖累选择质量且顶掉前缀缓存（T Q9）。正确做法是延迟加载：常驻只留"流量三件套 + finding 三件套 + 复测两件套"约 10–12 条，其余按需发现。
- 工具表顺序与 schema 序列化必须**固定**（`defaults.ts` 是生成文件，顺序天然稳定 → 保持"生成后不手改"的纪律即有前缀稳定性）。
- 结果复用：prompt 已经写了"先查流量、不要重复 curl"，但因为 G4，这条指令今天**必然空转**（库里 0 条）。修 G4 是让这条缓存策略生效的前提。
- 不可缓存：`record_finding_retest_result`、`capture/start`、`pivot_add` 全部是写/非幂等，禁缓存。

**体感**

- 现状可观测的墙钟瓶颈：engine `concurrency=2`、`workMany(workers=1)`、runner 默认 120s、`maxTurns=4` → 单意图上限约 8 分钟且串行；复测要人点一次、等一次。
- 抓包侧 SSE 有 600ms 轮询兜底（断线可恢复，代价是首屏最多 600ms 迟滞）——可接受。
- 建议：抓包窗口先回 `next_seq` 再流式补齐（已实现）；复测改为**后台会话 + 完成后通知**（`createNotifier` 已有通道），把人从"等"里解放出来。

---

## 5. 风险与回滚

| 改动 | 风险 | 回滚方式 |
|---|---|---|
| D1 新增工具插件 | 工具描述直接进 prompt（不可信输入面），措辞不当会诱导越权调用 | 插件级 disable；描述统一沿用 `defaults.ts` 原文 |
| D1 桥接白名单 | 漏配端点 → 工具 404；配宽 → 变任意 API 代理 | 复用 `PROXY_ENDPOINTS` 式显式清单 + 单测断言"未登记路径 404" |
| D2 MITM 走上游 | 上游抖动会让抓包整体失败（原本直连可用） | `VEXNAR_CAPTURE_UPSTREAM=direct` 开关；上游失败降级直连并打标记 |
| D3 状态机 | 与 Go 同名表并存造成二次真相 | 只允许 core 写；Go 侧复测写入在 ts 模式下强制关闭 |
| D4 单库收口 | 历史流量 ID 与 agent 既有引用（226 条 binding）对不上 | 保留来源前缀 + 只读并查；binding 引用按 `source_traffic_id` 兼容 |
| D5 自动绑定 | 绑错流量（同 host 多请求） | 规则先窄（method+path+参数指纹全等），不匹配就空绑定 + 告警 |

---

## 6. 遗留问题与未知区

1. **未实测运行中进程的工具清单**：沙箱拒绝 `ps`/attach，`VEXNAR_RUNTIME_MODE` 与 dsh 实际工具面未能直接读取；结论基于 patch 文本、profile 依赖清单与三个 0 的数据快照。**若实际以 `go` 模式运行，G1 降级为"仅代理面缺失"，G4/G9 反而升级为日常（工具写 PG、控制台读 SQLite）。**
2. **Go 侧 `yak/history` 与 `traffic` 索引的关系**只验证了行数（2364）与 FTS 存在，未逐行核对两条读取路径是否会漏掉/重复某些 scope。
3. **HTTP/2 不做帧级抓包**（`mitm.ts:13` 自述），对 HTTP/2 目标站点会产生"抓不到"的错觉，属于已知能力边界而非缺口，但需要写进用户文档。
4. **`retester` 在干净安装上必然 409**：`meta.agents` 不由 TS 播种（`catalog/register.ts` 只播 tools/mcp），`BUILTIN_KEYS` 也不含 `retester`（`routes/agents.ts:30`）。当前 profile 里有这行是历史导入的结果——这类"靠历史数据才能跑"的路径，重装即失效，应在 D3 一并修掉。
5. **多 Agent 折叠判定未做**：本报告未评估 goals/planner/main/worker/auto/pentest/reporter/retester 八角色是否应折叠回单循环（缺 F0 端到端任务集与基线数据）。这是下一步的独立议题，不建议与本次链路修复混做。
6. **独立评审未覆盖的项**：评审抽查范围是缺口定级与决策卡，评分口径"案例对照贴切性"因本报告未引用知识库案例而不适用（记证据不足）；`G2` 的"Go 钩子只被测试调用"仅核到 `traffic/proxy_test.go` 有调用，未穷举 Go 侧全部调用点。
7. **未验证的隐含前提**：D2 方案 a 假设 egress gateway 的 HTTP CONNECT 能承载任意目标端口；这一点需要用"SOCKS5 目标 + 非 443 端口"两条实测确认，否则抓包会把不可达误报成"目标拒绝"。
8. **`VEXNAR_TRAFFIC_SOURCE` 等开关名**均为本报告建议的新开关，不是现有实现，落地时按仓库既有命名习惯（`VEXNAR_GO_DATA` / `VEXNAR_EGRESS`）定稿。

---

## 7. 需要拍板的三件事

| # | 决策 | 我的建议 | 影响面 |
|---|---|---|---|
| 1 | 工具面落 TS 插件 / 常开 Go MCP / TS 自建 MCP | TS 插件（方案 A） | 决定 G1/G4/G9 是一次性解决还是长期共存 |
| 2 | 流量真相收口 SQLite 还是 PG | SQLite（Go 降为只读历史源） | 决定迁移方向是否反转 |
| 3 | 复测判定是否允许 agent 自评 | 不允许：结论必须带**可解析的证据指针**（本库 exchange id 或可反查的快照），由 core 校验后落库 | 决定 V 层是否真的存在 |
