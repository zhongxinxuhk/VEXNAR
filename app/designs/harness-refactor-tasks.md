<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# VEXNAR Harness 重整任务台账

> 建立：2026-11-26 · 基线：`main@945de32ee` · 关联评估：[`vexnar-harness-refactor-v1.md`](./vexnar-harness-refactor-v1.md)
>
> 这份文件是**执行台账**，不是设计文档。每完成一项，就在本文件把状态改为 `已完成`，补上验收证据与提交号；没有实际跑过的检查一律写 `未核验`，不写“应该能过”。

## 0. 目标与边界

### 0.1 一句话目标

把当前“dsh 上游 + VEXNAR 自建 core + 可选 Go 后端”三套运行时，收口成一条明确的链路：

```text
dsh agent loop（唯一循环）
  → 一个领域工具面（进程内注册，无第二个 MCP 端口）
  → 一个 core 域服务（一个 SQLite 写库）
  → web / egress / capture / CLI 作为库或适配器
```

### 0.2 本台账覆盖的范围

- `app/vexnar-core`、`app/vexnar-store`、`app/vexnar-web`、`app/vexnar-egress`、`app/vexnar-mcp`
- `app/vexnar/{account,ui}`、`app/vexnar/cordis.patch.yml`
- `app/scripts`、`app/desktop`
- 根目录 Go 服务（只作为历史/回退面）
- `web/` Next 控制台（只做“保留/冻结/删除”决策，不在本台账内重构）

### 0.3 不做什么

- 不改 dsh 上游源码；只通过 bundle patch / 插件扩展。
- 不在本台账里重写 Go 服务；Go 只降级为只读归档或回退路径。
- 不把 `web/` 的页面重做一遍；前端收口是决策项，不是默认动作。
- 不为了“看起来整齐”做纯目录搬迁；每一项都必须有可观测的验收信号。

---

## 1. 基线快照（2026-11-26）

| 项 | 观测值 | 来源 |
|---|---|---|
| 代码基线 | `main@945de32ee` | `git log` |
| 第一方 TS（app 内，不含 dsh） | 约 69k 行 | `find ... wc -l` |
| dsh 上游 TS/TSX | 约 472k 行 | `app/dsh` |
| 根目录 Go | 约 354k 行 | `find . -name '*.go'` |
| `web/` Next 控制台 | 约 60k 行 | `web/src` |
| profile bundle | 20 个，其中第三方 10 个 | `.vexnar-home/profiles/vexnar/package.json` |
| core 工具目录 | 62 条（`meta.tools`） | `vexnar.sqlite` |
| core agent 名册 | 8 个内置 + 2 个 run artifact | `meta.agents` |
| dsh agent preset | 8 个 | `app/vexnar/cordis.patch.yml` |
| 本机会话抓包 | `traffic_exchanges = 0` | `vexnar.sqlite` |
| Web 引擎记录 | `web_exchanges = 0` | `store/web/web.sqlite` |
| Go 归档流量 | 2364 条 | `data/traffic/_index/index.sqlite` |
| 复测记录 | `finding_retests = 0` | `vexnar.sqlite` |

**基线判断**：配置面（62 工具、8 角色、复测工具绑定）是齐的，但数据面三个 0 说明这条链从未端到端跑通过；不能把“目录里有”当成“运行时可用”。

---

## 2. 状态图例与更新规则

| 标记 | 含义 |
|---|---|
| `[ ] 待开始` | 尚未动代码 |
| `[~] 进行中` | 已开分支，正在改 |
| `[x] 已完成` | 代码已合并，验收命令实际跑过且退出码 0 |
| `[!] 阻塞` | 有明确阻塞原因，写在“证据/备注”里 |
| `[-] 取消` | 决策后不做，写原因 |

更新规则：

1. 每项任务开始前把状态改为 `[~]`，并写分支名。
2. 完成时改为 `[x]`，在“证据”列写：验收命令、关键输出、提交号。
3. 检查失败或跳过，保持 `[~]` 或 `[!]`，如实写失败信息；不允许写成通过。
4. 一个任务一个分支；合并用 `git merge --no-ff`，合并后再把分支删掉。
5. 阶段全部完成才更新阶段标题的状态；单项完成不改阶段结论。

---

## 3. 决策台账（未拍板前，相关任务保持待开始）

| ID | 决策 | 选项 | 建议 | 状态 | 影响任务 |
|---|---|---|---|---|---|
| D1 | 唯一 agent 循环归谁 | A. dsh 唯一循环；B. core engine 为自主执行器、dsh 只做 UI | **A**：core engine 降为确定性工具执行器，触发器/定时任务改成创建 dsh 会话 | 待拍板 | P4 全部 |
| D2 | `web/` Next 控制台去留 | A. 保留并继续维护；B. 冻结只读；C. 删除 | **B**：先冻结，禁止新功能；等 P5 再决定删除 | 待拍板 | P5-3 |
| D3 | Go 服务终局 | A. 只读归档保留一个版本周期；B. P3 后彻底移除 | **A**：先只读，P5 再评估移除 | 待拍板 | P3-3、P3-4 |
| D4 | 领域工具面形态 | A. `ctx.tools.register` 进程内注册；B. 保留一个 HTTP MCP；C. 继续多 MCP | **A**：符合 `AGENTS.md` 单端口约束，复用 `vexnarCore.request` | 待拍板 | P1 全部 |
| D5 | 唯一写库 | A. SQLite 单写；B. PG 单写；C. 继续双写 | **A**：与 `STORAGE-ARCHITECTURE.md` 的 M4 方向一致 | 待拍板 | P3 全部 |

> 决策没有落定之前，P1/P3/P4/P5 的实现任务不启动；P0 可观测性不受决策影响，先做。

---

## 4. 阶段任务

### P0 可观测性：先让“当前 harness 是什么”可回答

**阶段目标**：不靠读代码和猜，能用一个接口/命令列出：模式、存储路径、agent 名册、工具数、MCP server、监听端口、profile bundle。  
**阶段状态**：`[~] 进行中`（P0-0～P0-2、P0-4 完成，P0-3 待开始）

#### P0-0 建立台账与基线快照

- 状态：`[x] 已完成`
- 分支：`docs/harness-refactor-ledger`
- 动作：记录基线数字、决策项、阶段任务、验收口径。
- 验收：本文件存在且基线数字有来源；`git diff --check` 通过。
- 证据：本文件；提交 `db561a499`；合并 `b7d01816d`。
- 备注：本轮只建台账，不改运行时代码。

#### P0-1 `GET /api/_topology`

- 状态：`[x] 已完成`
- 分支：`refactor/harness-observability`
- 动作：
  1. 新增 `app/vexnar-core/src/topology.ts`，聚合 `runtimeInfo()`、`storeRoot()`、`meta` 中的 `agents/tools/mcp/settings`、Web 引擎配置、`VEXNAR_*` 模式开关。
  2. 在 `app/vexnar-core/src/routes.ts` 注册 `GET /api/_topology`，只读，不启动 Web 引擎、不触发后台循环。
  3. 输出稳定 JSON：`{ runtime, store, agents, tools, mcp, web, listeners, env }`，字段顺序固定，便于快照测试。
- 验收：
  - `curl -s http://127.0.0.1:8790/api/_topology | jq .` 返回上述字段。**未核验**：未启动常驻 core（避免占用 8792），改由路由层断言覆盖。
  - 新增 `topology.test.ts`：临时 `VEXNAR_HOME` 下断言 agent 数、工具数、mcp server 名、store 路径。已执行。
  - `pnpm --filter @vexnar/core run typecheck` 退出码 0。已执行。
- 证据：
  - 分支 `refactor/harness-observability`；提交 `42a55ee2c`；合并 `121034d04`。
  - `./node_modules/.bin/tsx --test topology.test.ts` → `topology.test.ts: 18 assertions passed`（含 `api.request('/api/_topology')` 返回 200、字段与 token 排除断言）。
  - `pnpm --filter @vexnar/core run typecheck` → 退出码 0。
  - `pnpm --filter @vexnar/core run test` → `tests 29` / `pass 29` / `fail 0`。首次运行缺 `account/lib` 与 `core-embedded.js`，执行 `pnpm run build` 后全绿；与本次改动无关。
- 依赖：无。
- 风险：不要在 `/api/_topology` 里调用 `webRuntime()`，否则会把 8792 端口拉起来，违背“只读”语义。
- 备注：接口只读 meta 与环境，不启动 Web 引擎、不开监听；`env` 不含 token / DSN。

#### P0-2 拓扑 CLI

- 状态：`[x] 已完成`
- 分支：`refactor/harness-topology-cli`
- 动作：新增 `app/scripts/harness-topology.ts`，读取 profile `package.json` + core 的 `/api/_topology`（或直接读 SQLite），打印一张人类可读表；支持 `--json`。
- 验收：
  - 在 `app/` 下 `pnpm exec tsx scripts/harness-topology.ts` 能列出：profile bundles、presets、工具数、agent keys、MCP servers、存储路径、端口。已执行。
  - `--json` 输出可被 `jq` 解析。已执行。
- 证据：
  - 分支 `refactor/harness-topology-cli`；提交 `572438ebd`；合并 `3295f4d9b`。
  - `pnpm exec tsx scripts/harness-topology.ts` → `bundles=24 layer=21 presets=8`；`agents total=10 enabled=10 run_artifacts=2`；`tools total=62 enabled=62 bound=60`；`mcp total=4 enabled=3`；SQLite `.../.vexnar-home/vexnar/store/vexnar.sqlite`。
  - `pnpm exec tsx scripts/harness-topology.ts --json | jq -e ...` → `source=store`、`presets=8`、`agents=10`、`tools=62`、`mcp=4`。
  - `tsc --noEmit ... scripts/harness-topology.ts` → 退出码 0；`pnpm run test:preset` → `tests 2 / pass 2 / fail 0`。
  - `--url http://127.0.0.1:1 --json` → 退出码 0，`source=store` 且 `http_error` 记录回退原因。
- 依赖：P0-1。
- 风险：不要复制 store 的读逻辑；优先调用 P0-1 的接口，进程未启动时再读 SQLite。
- 备注：dsh web 把 core 嵌在同一进程，没有稳定的 8790 监听可探测；默认直接调用 P0-1 同一个 `topology()`，显式 `--url` 时才先走 HTTP。顺带修正 `@vexnar/dsh-egress` 的自有 bundle 归类，避免盘点误报预设缺口。

#### P0-3 干净 profile 启动冒烟

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-smoke`
- 动作：新增 `app/scripts/smoke-harness.ts`：临时 `VEXNAR_HOME` → `setup` → 启动 core → 断言 8 个 preset、至少 10 个可调用领域工具、无 8792 监听（P1 后）。
- 验收：
  - 干净 home 下脚本退出码 0，并打印实际 tool/preset 列表。
  - 故意删掉一个 preset 时脚本退出码非 0（负向用例）。
- 依赖：P0-1；P1-6 完成后才能断言“无 8792”。
- 风险：`setup` 会联网装 profile，CI 上要允许离线缓存；否则标记为“本机冒烟”，不塞进默认门禁。

#### P0-4 文档口径对齐

- 状态：`[x] 已完成`
- 分支：`docs/harness-docs-align`
- 动作：
  1. 修根 `README.md` 与 `app/README.md` 的架构描述冲突（Go 单体 vs dsh + TS core）。
  2. 修根 `AGENTS.md` 的“已移除桌面客户端”与 `app/desktop` 并存的矛盾。
  3. 在 `app/designs/vexnar-harness-refactor-v1.md` 顶部加一行“执行状态看 `harness-refactor-tasks.md`”。
- 验收：三处文档不再互相否证；`rg "已移除|no longer ships"` 的结果与代码树一致。已执行。
- 证据：
  - 分支 `docs/harness-docs-align`；提交 `40eae6027`；合并 `9f60d373e`。
  - 根 `README.md`：默认栈改为 dsh + `vexnar-core`（SQLite），Go/PostgreSQL 与 `web/` 标为回退/兼容栈；安装段补 `app/` 默认路径；桌面壳明确为 `app/desktop`。
  - `app/README.md`：边界改为默认以 core SQLite 为准；模型留在 dsh 进程；构建/typecheck 覆盖补 `@vexnar/web`，并修正“全员 TypeScript”与 `scripts/tsconfig.json` 门禁表述。
  - `AGENTS.md`：桌面客户端段改为 dsh 宿主 + `app/desktop` 现状、Go 为回退；typecheck 覆盖补 `@vexnar/dsh-egress` 与 `@vexnar/web`。
  - `app/designs/vexnar-harness-refactor-v1.md` 顶部已指向 `harness-refactor-tasks.md`。
  - `git diff --check` 退出码 0；本地 Markdown 链接检查 0 缺失；`grep` 旧口径关键词无命中；`app/desktop`、`desktop:build`、`desktop:package` 与 typecheck 五项均与代码树一致。
  - 未运行运行时测试（纯文档改动）。
- 依赖：无。
- 风险：文档改动不要顺手改行为；只改口径。

---

### P1 工具面收口：从“62 条目录”到“10 个可调用工具”

**阶段目标**：dsh 会话里能直接调用领域工具；删除进程内第二个 MCP 端口 8792；工具实现复用 core 现有路由，不新开服务。  
**阶段状态**：`[ ] 待开始`（依赖 D4）

#### P1-1 新建 `@vexnar/dsh-tools` 插件包

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-tool-plane`
- 动作：
  1. 新增 `app/vexnar-tools/`：`package.json`、`index.ts`、`build.ts`、`tsconfig.json`。
  2. `inject: ['tools', 'vexnarCore']`；实现 `registerTool(name, description, schema, handler)`。
  3. 构建产物 `index.js`，由 profile 以 `file:` 依赖加载。
  4. 加入 `app/pnpm-workspace.yaml`、`app/package.json` 的 build/typecheck 链。
- 验收：`pnpm --filter @vexnar/dsh-tools run build` 生成 `index.js`；`pnpm typecheck` 覆盖该包。
- 依赖：D4 = A。
- 风险：dsh 从 `node_modules` 加载插件，入口必须是真 JS；构建脚本要像 `vexnar-egress/build.ts` 一样稳定。

#### P1-2 只读流量三件套

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-tool-plane`
- 动作：注册 `traffic_search`、`traffic_get`、`traffic_blob`，分别映射：
  - `GET /api/traffic`
  - `GET /api/traffic/exchange`
  - `GET /api/traffic/blob`
- 验收：
  - 会话里 `traffic_search(host=...)` 返回 local + archive 合并结果，行上有 `source`。
  - `traffic_get(id)` 能取到正文；`traffic_blob(hash)` 能取到超限正文。
  - 未登记路径返回 404，不变成任意 API 代理。
- 依赖：P1-1。
- 风险：`traffic_search` 的参数语义要与 `traffic-history.ts` 的过滤字段对齐，不能另造一套。

#### P1-3 `capture_control`

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-tool-plane`
- 动作：注册 `capture_control`，支持 `status/start/stop`，映射 `GET/POST /api/traffic/capture`；`start` 返回 scope + proxy endpoint。
- 验收：
  - 会话里 `capture_control({action:'start'})` 后 `trafficCaptures` 出现 active 行。
  - `stop` 后行消失/停止，端口释放。
- 依赖：P1-1。
- 风险：卸载插件前必须 stop，否则 scope 端口留到进程退出；在工具描述里写清。

#### P1-4 finding 写入与证据绑定

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-tool-plane`
- 动作：注册 `report_finding`（`POST /api/exploration/findings`）、`bind_finding_traffic`（先确认 core 路由；没有就补一条最小路由）。
- 验收：会话里上报一条 finding，`findings` 计数 +1；绑定后 `finding_traffic_bindings` 有可解析的 snapshot。
- 依赖：P1-1。
- 风险：`bind_finding_traffic` 当前只有目录行，没有确认的可调用路由；先查 `routes/exploration.ts`，没有就作为 P1-4b 补路由，不硬编。

#### P1-5 Web 六工具并入同一插件

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-tool-plane`
- 动作：把 `web_session_create`、`web_request_execute`、`web_response_analyze`、`web_session_inspect`、`web_session_control`、`web_evasion_report` 的实现改为调用 core 的 `/api/web/*`，注册到 `dsh-tools`。
- 验收：会话里只看到一套工具前缀；六个 web 工具行为与当前 MCP 版一致（用同一组 fixture 对比）。
- 依赖：P1-1；`vexnar-web/src/routes.ts` 的 REST 面覆盖 MCP 能力。
- 风险：MCP 工具有 SSE/流式语义，REST 面若没有对应端点，先补最小 REST，不要复制引擎。

#### P1-6 删除 8792 监听

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-tool-plane`
- 动作：
  1. `vexnar-core/src/web.ts` 的 `startWebRuntime` 传 `mcp: false`。
  2. `vexnar/cordis.patch.yml` 的 `mcp-manager.servers` 删除 `vexnar-web`。
  3. 删除 `VEXNAR_WEB_MCP_TOKEN` / `VEXNAR_WEB_MCP_PORT` 的启动注入（保留读取兼容一个版本）。
- 验收：
  - `lsof -nP -iTCP:8792 -sTCP:LISTEN` 无输出。
  - dsh 启动输出只有一个 URL。
  - 六个 web 工具仍可调用（走 P1-5 的进程内实现）。
- 依赖：P1-5 完成后再删，避免工具面断档。
- 风险：旧 profile 仍可能引用 8792；`setup` 要能迁移，旧 profile 启动时给出明确告警。

#### P1-7 工具面契约测试

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-tool-plane`
- 动作：新增 `app/vexnar-tools/test/registration.test.ts`：
  - 断言注册的工具名集合精确等于预期列表。
  - 断言每个工具只映射到白名单路径。
  - 断言未登记路径返回 404。
- 验收：`pnpm --filter @vexnar/dsh-tools run test` 退出码 0。
- 依赖：P1-1。
- 风险：工具描述直接进 prompt，测试要锁住描述里的危险措辞（不能出现“任意 URL/任意路径”）。

#### P1-8 更新 README 与工具文档

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-tool-plane`
- 动作：在 `app/README.md` 的“Web 测试引擎”与“领域工具”段落写明：工具由 `@vexnar/dsh-tools` 进程内注册，8792 已移除；给出一张“工具 → core 路由”的表。
- 验收：文档与 `registration.test.ts` 的清单一致。
- 依赖：P1-7。
- 风险：不要把计划写成已实现；P1 合并后再改。

---

### P2 名册与复测闭环

**阶段目标**：dsh preset 是唯一 agent 名册；复测从 `pending` 走到 `done/failed`，verdict 落库，两个复测工具真正可调用。  
**阶段状态**：`[ ] 待开始`（依赖 D1、D4）

#### P2-1 名册单一化

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-roster`
- 动作：把 `meta.agents` 改为 dsh preset 的只读投影，或删除该表；`/api/agents` 只读 preset；写操作统一走 dsh 设置。
- 验收：`/api/_topology` 的 `agents.source = 'dsh-presets'`；`meta.agents` 不再被 core 写入。
- 依赖：D1。
- 风险：`retestAgentReady()`、触发器、`conversations` 都读 `meta.agents`，要逐个替换。

#### P2-2 名称与内置键对齐

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-roster`
- 动作：统一 `main` / `mainagent`；`BUILTIN_KEYS` 补 `reporter`、`retester`；清理“靠历史数据才能跑”的路径。
- 验收：干净 profile 下 8 个 preset 都能在 core 侧解析；不再出现 `mainagent` 找不到 preset 的告警。
- 依赖：P2-1。
- 风险：改名会影响触发器、conversation、UI 文案；加兼容映射一个版本。

#### P2-3 复测状态机

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-retest`
- 动作：在 `routes/exploration.ts` 补 `pending → running → done|failed` 迁移；`record` 同事务更新 finding 状态；拒绝无证据指针的 verdict（409）。
- 验收：复测行状态可观测地变化；`finding_retests` 不再只有 pending；非法 evidence 返回 409。
- 依赖：P2-1。
- 风险：与 Go 同名表并存时只允许 core 写；`VEXNAR_RUNTIME_MODE=go` 下强制关闭 TS 写路径。

#### P2-4 复测两工具实现

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-retest`
- 动作：实现 `get_finding_retest_context`、`record_finding_retest_result`，注册到 `dsh-tools`；上下文包含 finding、绑定证据、约束、上次复测。
- 验收：会话里两个工具可见且可调用；`record` 后 `verdict/summary/evidence` 非空。
- 依赖：P2-3、P1-1。
- 风险：当前这两个名字只作为字符串存在（`exploration.ts:33,757`），没有执行器；不要只加目录行。

#### P2-5 自动挂证与硬校验

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-retest`
- 动作：`report_finding` 时按 scope 自动绑定本会话 capture 流量；引用不可解析时拒绝写入。
- 验收：新 finding 的 `finding_traffic_bindings` 非空；构造不存在的 evidence → 409。
- 依赖：P2-3、P1-4。
- 风险：同 host 多请求会绑错；先用 method+path+参数指纹全等，匹配不到就空绑定 + 告警。

#### P2-6 复测 E2E

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-retest`
- 动作：一条测试从 finding → 复测 → verdict → finding 状态，全程不 mock 存储。
- 验收：`finding_retests` 出现 `done` 行；finding 状态同步；重复点击复用同一 active 行。
- 依赖：P2-3、P2-4。
- 风险：不要用 Go 进程；测试必须能在 `VEXNAR_RUNTIME_MODE=ts` 下独立跑。

---

### P3 存储收口：一个写库

**阶段目标**：会话抓包、Web 引擎证据、finding 绑定写同一个 SQLite；Go 索引只读并集；PG 只做导出。  
**阶段状态**：`[ ] 待开始`（依赖 D5）

#### P3-1 存储清单与写者审计

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-store`
- 动作：列出每个表/文件的写者、读者、生命周期；标出可删除的重复。
- 验收：`app/designs/harness-store-map.md` 一张表覆盖 `vexnar.sqlite`、`web.sqlite`、Go 索引、PG、dsh storages。
- 依赖：D5。
- 风险：不要凭印象画；以 `grep` 到的 writer 调用为准。

#### P3-2 `web.sqlite` 并入主库

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-store`
- 动作：建 `web_*` 表迁移；启动时幂等迁移；旧文件保留只读一个版本。
- 验收：新写入只落 `vexnar.sqlite`；`web.sqlite` 不再增长；旧数据可读。
- 依赖：P3-1。
- 风险：迁移期间双写会造成第二真相；迁移开关只允许“读旧写新”，不允许“双写”。

#### P3-3 流量单 DTO 与来源前缀

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-store`
- 动作：`allExchanges()` 统一 DTO；local 与 archive 的 id 加来源前缀；`traffic_get` 能按前缀路由。
- 验收：同一 id 不会跨库撞号；`traffic_search` 结果同时有 local/archive；旧 binding 仍可解析。
- 依赖：P3-2、D3。
- 风险：226 条既有 binding 引用 `source_traffic_id` 自由字符串；先做兼容映射，不批量改历史。

#### P3-4 PG 写路径降级

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-store`
- 动作：`VEXNAR_STORE=postgres` 改为只读导出/对账；core 默认不再写 PG。
- 验收：ts 模式下 PG 无新写入；`/api/_topology` 显示 `store.writers = ['sqlite']`。
- 依赖：P3-2、D3。
- 风险：旧回退路径可能依赖 PG；保留 `VEXNAR_RUNTIME_MODE=go` 的只读查询，不保留双写。

#### P3-5 备份/恢复一个文件

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-store`
- 动作：新增 `scripts/backup-store.ts` / `restore-store.ts`；备份包含主库 + blob + vault key。
- 验收：干净 home 下备份 → 删除 → 恢复 → `/api/_topology` 计数一致。
- 依赖：P3-2。
- 风险：vault key 丢失会导致 Web 证据不可解密；备份必须显式包含并校验权限 0600。

#### P3-6 存储契约测试

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-store`
- 动作：断言“一个逻辑记录只在一个库有写者”；对 traffic/finding/retest 各一条。
- 验收：测试能捕获“又开了一个写库”的回归。
- 依赖：P3-2、P3-3。
- 风险：不要只测“能读”，要测“写者唯一”。

---

### P4 执行循环收口

**阶段目标**：只保留 dsh 的 agent 循环；core engine 降为工具执行器；触发器/定时任务创建 dsh 会话，不再自己跑 `plan/work`。  
**阶段状态**：`[ ] 待开始`（依赖 D1、P1、P2）

#### P4-1 循环调用点盘点

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-loop`
- 动作：列出 `engine.plan/work/workMany`、`taskQueue`、`startTriggers`、`startSchedules`、`runConversationTurn` 的所有调用点与终止条件。
- 验收：一张表：调用点 / 触发者 / 预算 / 终止 / 失败恢复。
- 依赖：D1。
- 风险：不要先删代码；先把“谁在跑”画清楚。

#### P4-2 触发器/定时任务改走 dsh

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-loop`
- 动作：触发器命中 → 创建任务 + dsh 会话（或 dsh 子代理），由 dsh 循环推进；core 不再 `engine.plan`。
- 验收：触发一次，dsh 会话出现；core engine 调用计数为 0。
- 依赖：P4-1、P1。
- 风险：dsh 会话创建 API 需要确认；没有稳定 API 就先做“任务 + 提示”，不硬造第二套循环。

#### P4-3 删除/降级 engine 循环

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-loop`
- 动作：保留 `runTool`/`persistToolResult` 作为工具执行器；删除 `plan/work/workMany` 或改为仅测试用。
- 验收：`rg "engine.plan|workMany"` 只剩迁移说明；任务仍能由 dsh 推进。
- 依赖：P4-2。
- 风险：自主任务链会短暂失去推进器；必须先把 dsh 路径跑通再删。

#### P4-4 删除单轮会话回路

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-loop`
- 动作：删除 `routes/conversations.ts` 的 `runConversationTurn`/`runTaskChat` 模型调用；保留会话 CRUD 与活动记录（如 UI 仍需要）。
- 验收：`/api/conversations` 不再触发模型补全；dsh 会话是唯一对话入口。
- 依赖：D1、D2（`web/` 若保留，需先迁移其聊天页）。
- 风险：`web/` 仍调 `/api/conversations`；D2 未定前不要删。

#### P4-5 单循环 E2E

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-loop`
- 动作：一条任务从创建 → 规划 → 工具调用 → finding → 结束，全部由 dsh 循环完成。
- 验收：activity 里只有一个循环的 trace；core engine 无调用。
- 依赖：P4-2、P4-3。
- 风险：需要稳定的模型 stub；不要让测试依赖真实 LLM。

---

### P5 组合与客户端收口

**阶段目标**：一份 composition manifest；一个前端主面；一个桌面入口；减少模式开关组合。  
**阶段状态**：`[ ] 待开始`（依赖 D1-D5）

#### P5-1 单一 composition manifest

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-composition`
- 动作：把 `extras.json` 升级为 manifest：bundle/version/enabled/presets/mcp/expectedTools；`setup` 从它渲染 profile；plugin-shop 写回它。
- 验收：删掉 profile 后重跑 `setup`，bundle 集合与 manifest 完全一致；`plugin-inventory` 对着 manifest 校验。
- 依赖：P1（工具清单）。
- 风险：第三方插件版本要锁；GitHub 包必须锁 commit。

#### P5-2 打包与开发同源

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-composition`
- 动作：`.desktop-overlay/profile` 由 manifest 生成，不再手工维护快照；开发/打包共用同一份 bundle 列表。
- 验收：开发 profile 与安装包 profile 的 bundle 差集为空。
- 依赖：P5-1。
- 风险：安装包离线安装需要预装 node_modules；生成逻辑要保留。

#### P5-3 `web/` 控制台去留

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-clients`
- 动作：按 D2 执行：冻结（加 CODEOWNERS/README 声明）或删除；删除前把仍独有的 API 契约迁到 dsh UI。
- 验收：只有一个前端在新增功能；另一个要么只读，要么不存在。
- 依赖：D2。
- 风险：`web/` 的聊天/流量页仍调 `/api/conversations`；先确认没有用户依赖。

#### P5-4 一个桌面入口

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-clients`
- 动作：合并 `scripts/vexnar-desktop.ts` 与 `app/desktop/main.ts` 的启动逻辑；开发模式复用同一个 main，只换资源根。
- 验收：`pnpm desktop` 与安装包走同一条代码路径；`rg "startWeb\\("` 只剩一处。
- 依赖：P5-2。
- 风险：打包环境的 `resourcesPath` 与 `appDir` 求值时机不同；先加冒烟。

#### P5-5 模式开关收敛

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-config`
- 动作：保留 `VEXNAR_RUNTIME_MODE`（ts/go）与 `VEXNAR_STORE`（迁移期）；删除/降级 `VEXNAR_EGRESS=go`、`VEXNAR_CORE_EMBEDDED`、`VEXNAR_WEB_MCP_PORT`。
- 验收：`/api/_topology` 的 `env` 只剩必要开关；组合矩阵从 2×3×2 降到 1×2。
- 依赖：P1-6、P3-4、P4-3。
- 风险：保留一个版本的兼容读取，但不再写入文档。

#### P5-6 文档与门禁收口

- 状态：`[ ] 待开始`
- 分支：`refactor/harness-config`
- 动作：更新根 `README.md`、`app/README.md`、`app/AGENTS.md`、`UPSTREAM.md`；把本台账的“已完成”项写进 CHANGELOG。
- 验收：文档只描述一套架构；`pnpm run upstream:check`、`pnpm typecheck` 通过。
- 依赖：P5-1..P5-5。
- 风险：不要在代码未合并前把文档写成已完成。

---

## 5. 依赖关系

```text
P0-0（台账）
  └─ P0-1（/api/_topology）
       ├─ P0-2（CLI）
       └─ P0-3（boot smoke，P1-6 后补“无 8792”断言）

D4 ── P1-1 ── P1-2 / P1-3 / P1-4 / P1-5 / P1-7
                         └─ P1-6 ── P1-8

D1 ── P2-1 ── P2-2
       └─ P2-3 ── P2-4 ── P2-6
                   └─ P2-5

D5 ── P3-1 ── P3-2 ── P3-3 ── P3-5
                   └─ P3-4
                   └─ P3-6

D1 + P1 + P2 ── P4-1 ── P4-2 ── P4-3 ── P4-5
                                  └─ P4-4（还依赖 D2）

D1-D5 + P1 + P3 + P4 ── P5-1 ── P5-2 ── P5-4
                                   └─ P5-3
                                   └─ P5-5 ── P5-6
```

---

## 6. 进度日志

| 日期 | 任务 | 状态变化 | 证据 |
|---|---|---|---|
| 2026-11-26 | P0-0 建立台账 | 待开始 → 已完成 | 本文件；提交 `db561a499`；合并 `b7d01816d` |
| 2026-11-26 | P0-1 `/api/_topology` | 待开始 → 已完成 | 提交 `42a55ee2c`；合并 `121034d04`；core 测试 29/29；curl 未核验（未起常驻进程） |
| 2026-11-26 | P0-2 拓扑 CLI | 待开始 → 已完成 | 提交 `572438ebd`；合并 `3295f4d9b`；表格 + `--json` 均已跑；tsc 0；test:preset 2/2 |
| 2026-11-26 | P0-4 文档口径对齐 | 待开始 → 已完成 | 提交 `40eae6027`；合并 `9f60d373e`；链接 0 缺失；旧口径关键词无命中；纯文档未跑运行时测试 |

> 每次只追加一行，不覆盖历史；完成的提交号写在“证据”里。

---

## 7. 下一步（按顺序）

1. **P0-3**：干净 profile 启动冒烟（“无 8792”断言待 P1-6 后补）。
2. **P1-1**：等 D4 确认后，建 `@vexnar/dsh-tools`，先落只读三件套。
3. **P1-6**：工具面切换完成后再删 8792，避免中途断档。

**当前阻塞**：D1-D5 需要拍板；P1 实现不能先于 D4，P3 不能先于 D5，P4 不能先于 D1。
