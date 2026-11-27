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
| D1 | 唯一 agent 循环归谁 | A. dsh 唯一循环；B. core engine 为自主执行器、dsh 只做 UI | **A**：core engine 降为确定性工具执行器，触发器/定时任务改成创建 dsh 会话 | 已拍板（A） | P2、P4 全部 |
| D2 | `web/` Next 控制台去留 | A. 保留并继续维护；B. 冻结只读；C. 删除 | **B**：先冻结，禁止新功能；等 P5 再决定删除 | 待拍板 | P5-3 |
| D3 | Go 服务终局 | A. 只读归档保留一个版本周期；B. P3 后彻底移除 | **A**：先只读，P5 再评估移除 | 待拍板 | P3-3、P3-4 |
| D4 | 领域工具面形态 | A. `ctx.tools.register` 进程内注册；B. 保留一个 HTTP MCP；C. 继续多 MCP | **A**：符合 `AGENTS.md` 单端口约束，复用 `vexnarCore.request` | 已拍板（A） | P1 全部 |
| D5 | 唯一写库 | A. SQLite 单写；B. PG 单写；C. 继续双写 | **A**：与 `STORAGE-ARCHITECTURE.md` 的 M4 方向一致 | 待拍板 | P3 全部 |

> D4 于 2026-11-27 拍板选 A：领域工具面用 `ctx.tools.register` 进程内注册，经 `vexnarCore.request` 直连 core，不再保留第二个 MCP 端口。P1-1 已按此落地。
>
> D1 于 2026-11-27 拍板选 A：dsh 是唯一 agent 循环；core engine 降为确定性工具执行器，触发器/定时任务改为创建 dsh 会话。P2 前置解除，启动项为 P2-1；P4 也按 A 执行。D2/D3/D5 未落定前，P3/P5-3 的实现任务不启动。

---

## 4. 阶段任务

### P0 可观测性：先让“当前 harness 是什么”可回答

**阶段目标**：不靠读代码和猜，能用一个接口/命令列出：模式、存储路径、agent 名册、工具数、MCP server、监听端口、profile bundle。  
**阶段状态**：`[x] 已完成`（P0-0～P0-4；无 8792 断言按依赖留到 P1-6）

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

- 状态：`[x] 已完成`
- 分支：`refactor/harness-smoke`
- 动作：新增 `app/scripts/smoke-harness.ts`：临时 `VEXNAR_HOME` → `setup` → 启动 core → 断言 8 个 preset、至少 10 个已启用且绑定 agent 的领域工具；默认关闭 extras/theme，`--full` 才装预置插件；`--check` 可单独校验 patch 的 preset 集合。
- 验收：
  - `pnpm exec tsx scripts/smoke-harness.ts` 在干净 home 下退出码 0，并打印实际 preset/tool 列表。已执行。
  - 故意删掉 `preset-vexnar-goals` 的副本执行 `--check`，退出码 1。已执行。
  - 单文件 `tsc --noEmit ... scripts/smoke-harness.ts` 退出码 0；`git diff --check` 退出码 0。已执行。
  - “无 8792 监听”断言：已由 P1-6 补齐；core 启动期间探活 8792 失败，`lsof` 退出码 1。
- 证据：
  - 分支 `refactor/harness-smoke`；提交 `81e513db1`；合并 `49b93355d`。
  - 干净临时 home：`setup` 0.5s；presets `8/8`（goals/planner/main/worker/auto/pentest/reporter/retester）；core `agents total=0`、`tools total=61 enabled=61 bound=60`、`mcp total=3 enabled=3`、SQLite store；Web MCP 监听随机端口（非 8792，P1-6 后不再启动）；`SMOKE PASS 8 presets / tools 61/61（bound 60）`。
  - 负向自检：删一个 preset 后读到 `7/8`，检查器拒绝；外部 `--check /tmp/vexnar-smoke-corrupt.yml` → 退出码 1，`缺少 preset: vexnar-goals；preset 数 7 != 8`。
- 依赖：P0-1；P1-6 已补齐“无 8792”断言。
- 风险：`setup` 会联网装 profile，CI 上要允许离线缓存；否则标记为“本机冒烟”，不塞进默认门禁。
- 备注：工具断言口径是 `topology.tools.enabled/bound`（已注册且绑定 agent），未通过 dsh 实际调用工具；`--full` 未跑（联网 extras），默认只做本机结构冒烟。

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

### P1 工具面收口：从“62 条目录”到“12 个可调用工具”

**阶段目标**：dsh 会话里能直接调用领域工具；删除进程内第二个 MCP 端口 8792；工具实现复用 core 现有路由，不新开服务。  
**阶段状态**：`[x] 已完成`（D4=A；P1-1～P1-8 全部完成；真实 dsh 模型会话内 12 个工具已实际调用并回填结果，见下方 P1 补验）

#### P1-1 新建 `@vexnar/dsh-tools` 插件包

- 状态：`[x] 已完成`
- 分支：`refactor/harness-tool-plane`
- 动作：
  1. 新增 `app/vexnar-tools/`：`package.json`、`index.ts`、`build.ts`、`tsconfig.json`。
  2. `inject: ['tools', 'vexnarCore']`；实现 `registerTool(name, description, schema, handler)`。
  3. 构建产物 `index.js`，由 profile 以 `file:` 依赖加载。
  4. 加入 `app/pnpm-workspace.yaml`、`app/package.json` 的 build/typecheck 链。
- 验收：
  - `pnpm --filter @vexnar/dsh-tools run build` → `built @vexnar/dsh-tools -> index.js`，退出码 0。
  - `pnpm typecheck` → 6 个包（ui/account/egress/tools/core/web）全部退出码 0。
  - `pnpm run build` → tools/egress/ui/account 与 core embedded 均重建成功。
  - `pnpm run check:artifacts` → `4 个 bundle / 23 个文件`，退出码 0。
  - 临时 `VEXNAR_HOME` 执行 `setup-app-profile.ts` → 退出码 0；profile 依赖为 `@vexnar/dsh-tools file:/…/app/vexnar-tools`，`node_modules/@vexnar/dsh-tools/index.js` 存在，`cordis.patch.yml` 已含 `vexnar-tools` 行。
  - `./node_modules/.bin/tsx scripts/smoke-harness.ts` → `SMOKE PASS 8 presets / tools 61/61（bound 60）`，退出码 0。
  - `pnpm run test:preset` → `tests 2 / pass 2 / fail 0`；`plugin inventory: 13 checks passed`。
- 证据：任务提交 `3f00328a8`；合并 `c4d3a898b`；18 files changed, 238 insertions(+), 16 deletions(-)。
- 备注：P1-1 只落插件入口、`tools`/`vexnarCore` 注入、`registerTool` 助手和 profile 装载；`apply` 暂不注册领域工具，P1-2 起接入。dsh 会话内的实际工具调用未核验，留给 P1-2/P1-7。
- 风险：dsh 从 `node_modules` 加载插件，入口必须是真 JS；构建脚本要像 `vexnar-egress/build.ts` 一样稳定。

#### P1-2 只读流量三件套

- 状态：`[x] 已完成`（工具契约测试通过；dsh 会话内实测未核验）
- 分支：`refactor/harness-tool-plane-p1-2`
- 动作：
  1. 注册 `traffic_search`，只透传 `GET /api/traffic` 已支持的 `host/method/q/status/resp_min/resp_max/sort/order/page/size`；返回 core 的 DTO（含 `source=local|archive`）。
  2. 注册 `traffic_get`，映射 `GET /api/traffic/exchange?id=...`，回填请求的 id。
  3. 注册 `traffic_blob`，映射 `GET /api/traffic/blob?hash=...`；`vexnarCore.request` 增加 `response: 'base64'` 分支，避免二进制正文被当 JSON 读坏。
  4. 不提供任意路径/URL 参数；工具面只有这三条固定路由。
- 验收：
  - 工具处理器 + 真实 core 路由（临时 SQLite + 临时归档索引）集成测试：`host=shared.test` 同时返回 `local-1:local` 与 `arch-1:archive`；`q=history` 命中归档 URL；`status=2xx` 命中两行。
  - `traffic_get` 能取本地与归档两侧原文；`traffic_blob` 能还原 300 KiB 超限正文（base64 解码后字节数与内容一致）。
  - 传入 `path=/api/secret` 不会改变目标路由；工具名集合精确为三条。dsh 会话内“未登记工具返回 404”未核验（当前没有可用的 dsh 模型会话）。
  - **未核验**：会话里实际调用工具；本任务只验证到工具处理器与真实 core 路由。
- 证据：任务提交 `ac15626ce`；合并 `c98384668`；8 files changed, 421 insertions(+), 12 deletions(-)。
  - `pnpm --filter @vexnar/dsh-tools run typecheck` → 0；`pnpm --filter @vexnar/dsh-tools run test` → 6/6（含真实 core 路由集成）。
  - `pnpm typecheck` → 6 个包全部 0；`pnpm run build` → 0。
  - `pnpm --filter @vexnar/dsh-account run test` → 59/59；`pnpm --filter @vexnar/core exec tsx traffic.test.ts` → 17/17。
  - `pnpm test:preset` → 2/2，`plugin inventory: 13 checks passed`；`pnpm run check:artifacts` → 4 个 bundle / 24 个文件。
  - `pnpm exec tsx scripts/smoke-harness.ts` → `SMOKE PASS 8 presets / tools 61/61（bound 60）`；这里的 tools 是 core 目录统计，不等于 dsh 插件工具数。
- 备注：`q` 只匹配本地行的内联正文；归档行只有索引元数据，不能承诺按归档正文搜索。`traffic_blob` 走 base64 通道，二进制不经过 JSON 文本。
- 风险：base64 有约 33% 体积膨胀，超大 blob 仍可能受工具结果上限约束；dsh 实际会话调用与原生工具名校验未核验。
- 依赖：P1-1。

#### P1-3 `capture_control`

- 状态：`[x] 已完成`（真实 core 生命周期测试通过；dsh 会话内实测未核验）
- 分支：`refactor/harness-tool-plane-p1-3`
- 动作：
  1. 注册 `capture_control`，只接受 `action=status|start|stop`；scope 从当前 dsh 会话 id 推导，不接受任意 session id 或路径参数。
  2. 核对后按**真实路由**实现：
     - `status` → `GET /api/sessions/:id/traffic/endpoint`
     - `start/stop` → `POST /api/sessions/:id/traffic/capture`，body `{action}`
     - 站点级 `GET /api/traffic/capture` 只做概览，没有对应 POST；台账原写的 `GET/POST /api/traffic/capture` 不成立。
  3. 会话 id 与 UI 的 `sessionKey()` 一样先剥一层 `session-`，避免 core 拼成 `session-session-…`。
  4. 统一 start/stop/status 返回字段：`action/ok/scope/active/proxy/ca_pem_url/source/started_at/stopped_at/items/last_ts/ingest_url/hook`；start/stop 的条数取 `summary`，status 的条数取 `capture`。
- 验收：
  - 工具处理器 + 真实 core 路由（临时 SQLite）：`start` 后 `active=true`、`scope=session-chat-abc`、`proxy=http://127.0.0.1:<port>`、`started_at>0`、`stopped_at=0`；`trafficCaptures` 有 active 行，mitm scope 表出现该端口。
  - `status` 读到同一 scope、同一端口和 started_at；`stop` 后 `active=false`、`proxy=''`、`stopped_at>0`，mitm scope 表中该端口消失，capture 行保留 stopped_at。
  - `hook` 含 `X-Flow-Scope: session-chat-abc`；工具名集合为 4 个。
  - **未核验**：dsh 会话内实际调用；本次验证到工具处理器与真实 core 路由。
- 证据：任务提交 `6c6f82928`；合并 `3184e57f7`；5 files changed, 273 insertions(+), 9 deletions(-)。
  - `pnpm --filter @vexnar/dsh-tools run typecheck` → 0；`pnpm --filter @vexnar/dsh-tools run test` → 8/8（含真实 core 生命周期）。
  - `pnpm --filter @vexnar/core exec tsx session-traffic.test.ts` → 18/18。
  - `pnpm typecheck` → 6 个包全部 0；`pnpm run build` → 0。
  - `pnpm --filter @vexnar/dsh-account run test` → 59/59；`pnpm test:preset` → 2/2（inventory 13 checks）；`pnpm run check:artifacts` → 4 个 bundle / 24 个文件。
  - `pnpm exec tsx scripts/smoke-harness.ts` → `SMOKE PASS 8 presets / tools 61/61（bound 60）`；这里的 tools 是 core 目录统计，不等于 dsh 插件工具数。
- 备注：dsh 会话 id 的前缀处理与 UI 共用同一口径，但实现是两处独立代码；P1-7 的工具契约测试应继续锁住路径与字段。工具描述已写明卸载插件前先 `stop`。
- 风险：插件卸载不会自动关闭 scope 端口，必须显式 stop；若宿主改变 session id 形态，剥离规则需同步 UI 与工具。
- 依赖：P1-1。

#### P1-4 finding 写入与证据绑定

- 状态：`[x] 已完成`（真实 core 路由与工具处理器通过；dsh 会话内实测未核验）
- 分支：`refactor/harness-tool-plane-p1-4`
- 动作：
  1. 注册 `report_finding`：固定 `POST /api/exploration/findings`，白名单字段 `task_id/vulnclass/name/severity/summary/evidence/intent_id/worker/asset_ids`；本地拒绝非法 severity、空 evidence 和非正整数 id。
  2. 核对绑定路由：core 只有 `GET /api/exploration/findings/:id/traffic`、`/traffic/export`、`/:bindingId/body`，**没有 POST 绑定路由**；Go 侧的实现在 `server/finding_traffic.go`。本次补了等价的最小 `POST /api/exploration/findings/:id/traffic`（body `traffic_refs`）。
  3. `bind_finding_traffic` 只接受数字 finding_id 和 `traffic_refs[{traffic_id,role,note}]`；core 按 ID 从本地 `traffic_exchanges` / 归档索引解析真实流量，落 `traffic_evidence_snapshots` 与 `finding_traffic_bindings`，并在一次 `writer.commit` 中提交。
  4. 本地大正文从 blob 还原；归档流量按组装文本拆回 head/body；重复快照不新增 binding、不覆盖已有 role/note，只有实际新增才 bump `evidence_version`。响应去掉原始 `req_head/resp_head`，并带 `written/added`。
- 验收：
  - 工具处理器 + 真实 core 路由：`report_finding` 后 `findings` 行数 +1；`bind_finding_traffic` 后 `finding_traffic_bindings` 与 `traffic_evidence_snapshots` 各 +1，snapshot 的 `source_traffic_id` 指向真实流量、`method=GET`、响应正文 hash 为 64 位。
  - GET `/api/exploration/findings/:id/traffic` 能读回同一条 binding；返回 snapshot 不含 `req_head/resp_head`。
  - 重复绑定同一 traffic_id 返回 `added=0`，binding 仍只有一条，原 `role=proof` / note 未被新角色覆盖；绑定不存在的 traffic_id 返回 404，不新增行。
  - `traffic_refs` 去重按首次出现；空数组、非数字 finding_id、非法 role/空 traffic_id 在工具本地拒绝。
  - **未核验**：dsh 会话内实际调用；本次验证到工具处理器与真实 core 路由。
- 证据：任务提交 `03fe79b0d`；合并 `5ff12f13f`；6 files changed, 508 insertions(+), 11 deletions(-)。
  - `pnpm --filter @vexnar/dsh-tools run typecheck` → 0；`pnpm --filter @vexnar/dsh-tools run test` → 12/12（含 `finding-tools.test.ts` 端到端绑定）。
  - `pnpm --filter @vexnar/core exec tsx traffic.test.ts` → 17/17；`pnpm typecheck` → 6 个包全部 0；`pnpm run build` → 0。
  - `pnpm --filter @vexnar/dsh-account run test` → 59/59；`pnpm test:preset` → 2/2（inventory 13 checks）；`pnpm run check:artifacts` → 4 个 bundle / 24 个文件。
  - `pnpm exec tsx scripts/smoke-harness.ts` → `SMOKE PASS 8 presets / tools 61/61（bound 60）`，`routes=361`；构建后的插件注册 6 个工具：`bind_finding_traffic,capture_control,report_finding,traffic_blob,traffic_get,traffic_search`。
  - 合并后在 `main` 复跑 tools test → 12/12；core traffic → 17/17。
- 备注：本次只补 Go 的 POST 补绑；Go 的 PATCH/DELETE/PUT order 仍未迁到 TS，P1-4 不涉及编辑已有绑定。`report_finding` 需要显式 `task_id`，因为 dsh 工具上下文没有 Go 的 RunInfo；调用方从当前任务读取，不能猜。归档流量的正文若在 Go blob 中，TS 侧只拿索引里可读的组装文本，不等同逐字节复制。
- 风险：绑定只接受数字 finding_id；归档正文依赖采集面索引可读，缺失时会明确 404，不会写空 snapshot。实际 dsh 会话内的模型调用仍未核验。
- 依赖：P1-1。

#### P1-5 Web 六工具并入同一插件

- 状态：`[x] 已完成`（REST/工具处理器与 MCP 同 fixture 对照通过；dsh 会话内实测未核验；旧 8792 MCP 已由 P1-6 删除）
- 分支：`refactor/harness-tool-plane-p1-5`
- 动作：
  1. 把 `web_session_create`、`web_request_execute`、`web_response_analyze`、`web_session_inspect`、`web_session_control`、`web_evasion_report` 注册到 `@vexnar/dsh-tools`，分别固定映射 `POST /api/web/sessions`、`POST /api/web/sessions/:id/requests`、`POST .../analyze`、`GET .../:id`、`POST .../control`、`GET .../evasion`。不复制 Web 引擎，不新开端口。
  2. 核对 REST 面与 MCP 语义：6 个能力都有端点；补了两个最小缺口。`GET /api/web/sessions/:id` 原先忽略 `limit`/`request_id`，现透传 `limit`（1..200）和 `request_id`；`POST .../control` 原先不校验 `action`，现只接受 `pause|resume|close|reset_budget`，其他值 400。
  3. 工具统一用 `x-vexnar-session: <dsh 会话 id>` 做 Web agentSession 隔离，不回退到 `local`；`session_id` 先做格式校验，所有可选字段在本地按 MCP schema 的长/值域拒绝。
  4. `web_session_create` 只回传 MCP `publicPolicy` 的同一组字段，过滤内部 `adversarial/maxRedirects/egressMode` 等整包策略；凭据仍只进 Vault，不进入工具返回。
  5. 新增 `web-tools.test.ts`（契约与本地拒绝）、`web-core.test.ts`（真实 `WebTestingEngine` + core 挂载的 `handleWebHttp` 生命周期/跨会话 403）、`web-mcp-parity.test.ts`（MCP 与 REST 同 fixture 逐项对照）。
- 验收：
  - 工具集合从 6 个扩到 12 个，6 个 `web_*` 名称精确存在；参数 JSON Schema 均 `additionalProperties:false`，必填 `session_id`/`path`/`request_id`/`action` 等。
  - 同 fixture 对照通过：创建、执行、分析、巡检、规避报告、关闭六步的 session/policy/outcome/structure/inspect/evasion/control 业务字段与 MCP 版逐项相等；只忽略每次运行必然不同的 id、时间戳和耗时。
  - 真实引擎生命周期通过：创建 → 两次请求 → 分析 → `request_id` 精确巡检（只回 1 条）→ 规避报告 → 暂停/恢复/重置预算/关闭；跨 Harness 会话读取返回 403；Authorization 在记录中为 `***`，返回值不含明文凭据。
  - REST 缺口回归通过：`request_id` 过滤生效；非法 `control.action` 由 core 返回 400，而不是被当成 `reset_budget` 静默执行。
  - **未核验**：dsh 会话内实际调用。P1-5 当时旧 `vexnar-web` MCP 仍由 `mcp-manager` 挂在 8792；P1-6 已删除。
- 证据：任务提交 `7f518b937`；合并 `fb0c7e686`；8 files changed, 914 insertions(+), 6 deletions(-)。
  - `pnpm --filter @vexnar/dsh-tools run typecheck` → 0；`pnpm --filter @vexnar/dsh-tools run test` → 20/20（含 `web-core` 2 条、`web-mcp-parity` 1 条、`web-tools` 5 条）。
  - `pnpm typecheck` → 6 个包全部 0；`pnpm run build` → 0；构建后 `index.js` 注册 12 个工具（6 个 `web_*` 全在）。
  - `pnpm --filter @vexnar/core run test` → 29/29 个测试文件通过；`traffic.test.ts` → 17/17；`pnpm --filter @vexnar/web run test` → 20/20。
  - `pnpm --filter @vexnar/dsh-account run test` → 59/59；`pnpm test:preset` → 2/2（inventory 13 checks）；`pnpm run check:artifacts` → 4 个 bundle / 24 个文件。
  - `pnpm exec tsx scripts/smoke-harness.ts` → `SMOKE PASS 8 presets / tools 61/61（bound 60）`，`routes=361`，Web MCP 在 8792 启动 6 个工具（P1-6 后该监听已移除）。
  - 合并后在 `main` 复跑 tools test → 20/20；core traffic → 17/17；重新构建后 `index.js` 仍为 12 个工具。
- 备注：旧 MCP 版保留了富文本摘要和 SSE 传输；这六个工具本身都是同步请求/响应，REST 返回的是同一份结构化 `record/outcome/snapshot/report`，因此本次没有补 SSE。`web_session_inspect` 的 `include` 只影响 MCP 文本展示，结构化快照两边本来就一致；工具仍返回完整快照。P1-5 只扩了 `dsh-tools`，没有删除 8792、没有改启动注入。
- 风险：P1-5 当时旧 8792 MCP 仍会和 `dsh-tools` 的 6 个同名工具并存（P1-6 已删除）；旧 profile 若未装 `@vexnar/dsh-tools`，`cordis.patch.yml` 会跳过新插件，只能继续走旧 MCP。实际 dsh 会话内的工具发现/调用仍未核验，需后续用真实模型会话补验。REST 的 `include` 参数仍只是 MCP 文本层语义，不改结构化快照。
- 依赖：P1-1。

#### P1-6 删除 8792 监听

- 状态：`[x] 已完成`（8792 无监听、6 个 `web_*` 与真实 dsh 单 URL 启动均已核验；dsh 会话内模型调用未核验）
- 分支：`refactor/harness-tool-plane-p1-6`
- 动作：
  1. `vexnar-core/src/web.ts` 的 `webRuntime()` 给 `startWebRuntime` 传 `mcp: false`；`webStatus()` 返回 `mode=in-process`、`mcp=null`，`webHttp` 不再传空的 `mcpUrl`。
  2. `vexnar-web/src/index.ts` 只在 `mcp !== false` 时解析 token；进程内模式 `tokenSource=''`，不写 `mcp.token`。
  3. `vexnar/cordis.patch.yml` 的 `mcp-manager` 删除 `vexnar-web`；只有 `VEXNAR_RUNTIME_MODE=go` 时注册 Go `vexnar` server，默认返回空对象。
  4. 不再注入 `VEXNAR_WEB_MCP_TOKEN` / `VEXNAR_WEB_MCP_PORT`；topology 的 `runtime.web_mcp`、`web.mcp_port/mcp_url` 均为 `null`，`web.mode='in-process'`，`listeners` 不再包含 `web-mcp`。
  5. 冒烟新增断言：已安装 patch 不含 `vexnar-web` 与 `VEXNAR_WEB_MCP_TOKEN/PORT`；core 存活时探活 8792 必须失败；topology 必须是 `in-process` 且无 `web-mcp` listener。
  6. 新增 `vexnar-web/test/runtime.test.ts` 覆盖 `mcp:false`；`vexnar-tools/test/web-core.test.ts` 改用同一契约。
- 验收：
  - `pnpm exec tsx scripts/smoke-harness.ts` → `web: in-process (no 8792 MCP)`，core 存活时 `portListening(8792)=false`；脚本退出后 `lsof -nP -iTCP:8792 -sTCP:LISTEN` 退出码 1。
  - 真实 dsh 包装器（临时 `VEXNAR_HOME`，端口 3199）启动输出只有一行 `vexnar web: http://127.0.0.1:3199/...`；3199 在监听，8792 不在监听；停止后 3199/8792 都无监听。
  - 六个 `web_*` 工具仍可调用：`web-core.test.ts` 走真实 `/api/web/*` 完成创建→执行→分析→巡检→规避报告→控制；tools test 20/20。
  - 构建后的 `app/vexnar-tools/index.js` 注册 12 个工具，6 个 `web_*` 全在；冒烟 `tools 61/61（bound 60）`。
  - **未核验**：dsh 会话内让模型实际调用 6 个 `web_*` 工具（当前没有可用的模型会话）；本次验证到工具处理器、真实 core 路由与真实 dsh 启动。
- 证据：任务提交 `9bfa20ef0`；分支先合入 `main` 的 `8c0932b4e`，最终 `--no-ff` 合并 `c14e77a68`；11 files changed, 136 insertions(+), 99 deletions(-)。
  - `pnpm typecheck` → 6 个包全部 0；`pnpm run build` → 0；`pnpm run check:artifacts` → 4 个 bundle / 24 个文件。
  - `pnpm --filter @vexnar/core run test` → 29/29 个测试文件通过；`topology.test.ts` → 21 assertions passed。
  - `pnpm --filter @vexnar/web run test` → 21/21；`pnpm --filter @vexnar/dsh-tools run test` → 20/20；`pnpm --filter @vexnar/dsh-account run test` → 59/59。
  - `pnpm test:preset` → 2/2（inventory 13 checks）；`pnpm exec tsx scripts/smoke-harness.ts` → `SMOKE PASS 8 presets / tools 61/61（bound 60）`，`routes=361`。
  - 合并后在 `main` 复跑：`pnpm typecheck` 0、`pnpm run build` 0、tools 20/20、web 21/21、smoke 通过；构建入口注册 12 个工具，`web_tools=6/6`。
- 备注：`startWebRuntime` 的默认值仍是 `mcp: true`，只服务独立兼容入口 `pnpm --filter @vexnar/web run mcp`；core 始终传 `false`，所以常规启动没有第二个监听。旧 profile 由 `setup`/`ensureProfile` 刷新 app-bundle 文件后生效；本次只在干净 profile 验证了安装后的 patch，没有对已有旧 profile 做升级实测。
- 风险：仍在运行的旧 dsh 进程会继续使用内存里的旧 patch，并尝试连接已关闭的 8792，直到重启/setup 后消失；手工执行独立 MCP 入口时 8792 会再次监听，这是兼容入口，不是 core 的默认行为。
- 依赖：P1-5。

#### P1-7 工具面契约测试

- 状态：`[x] 已完成`（12 个工具名、13 条 pathname/method、未登记路径 404 均已锁住；dsh 会话内模型调用未核验）
- 分支：`refactor/harness-tool-plane-p1-7`
- 动作：
  1. 新增 `app/vexnar-tools/test/registration.test.ts`：精确断言 12 个工具名；遍历 14 个调用（覆盖 13 条 pathname/method），逐项断言 core 路径、method、Web 会话头与 body。
  2. 测试给每次调用注入伪造的 `route`/`url`/`core_path`，断言它们不会进入 core 路径；Web 工具必须带 `x-vexnar-session`，非 Web 工具不能带。
  3. 在 `vexnar-tools/index.ts` 增加 `CORE_ROUTES` 显式白名单（13 条：12 个工具，`capture_control` 的 endpoint/capture 两条）和 `guardedCore()`；`apply()` 统一包住 `ctx.vexnarCore`。
  4. `guardedCore` 只放行白名单 pathname + method；未登记路径、method 不符、绝对 URL 都在触达 core 前抛 `CorePathNotFoundError`，`status=404`。
  5. 测试同时锁定描述与 schema：每个工具描述非空、`additionalProperties:false`，且描述不出现“任意 URL/任意路径”的承诺。
- 验收：
  - `pnpm --filter @vexnar/dsh-tools run test` → 23/23（原 20 条 + 新增 registration 3 条）。
  - 测试覆盖 13 条 pathname/method，与 `CORE_ROUTES.length` 相等；伪造 route/url 不出现在 core path/body；未登记路径 `CorePathNotFoundError.status=404` 且底层桥调用次数为 0。
  - 构建后的 `app/vexnar-tools/index.js`：12 个工具、`CORE_ROUTES=13`，`guardedCore('/api/not-registered')` 返回 `status=404`，允许路径 `/api/traffic?host=x` 正常过桥。
  - `pnpm typecheck` → 6 个包全部 0；`pnpm run build` → 0；`pnpm run check:artifacts` → 4 个 bundle / 24 个文件；`pnpm test:preset` → 2/2。
  - `pnpm --filter @vexnar/core run test` → 29/29；`pnpm --filter @vexnar/web run test` → 21/21；`pnpm --filter @vexnar/dsh-account run test` → 59/59；`pnpm exec tsx scripts/smoke-harness.ts` → `SMOKE PASS 8 presets / tools 61/61（bound 60）`。
  - **未核验**：dsh 会话内让模型实际调用 12 个工具；本次验证到注册面、假桥/真实工具处理器与构建产物。
- 证据：任务提交 `2e61ecee0`；`--no-ff` 合并 `8715a35d2`；2 files changed, 363 insertions(+), 13 deletions(-)。
  - `registration.test.ts` 通过；`tools test` 23/23；`pnpm typecheck` 0；`pnpm run build` 0。
  - 构建入口：`built_tools=12`、`guard_status=404`、`routes=13`；工具名单与 P1-5 一致。
  - 合并后在 `main` 复跑 tools 23/23、typecheck 0、build 0；构建入口仍为 12 个工具、404 守卫生效。
- 备注：404 是**工具桥边界**的行为；core 通用 `notFound` 仍返回 501，未在这次改动中切换，避免影响非工具 HTTP 客户端。`CORE_ROUTES` 是新增工具时必须同步更新的第二份清单，P1-8 的文档表以它和 `registration.test.ts` 为准。
- 风险：白名单用正则匹配动态 id 段，新增路由或改变 method 会先被测试/桥拦下；如果未来允许工具直接拿任意 core 路径，这个守卫必须同步放宽，否则会出现“工具已实现但 404”。真实 dsh 模型会话内的工具发现/调用仍未核验。
- 依赖：P1-1。

#### P1-8 更新 README 与工具文档

- 状态：`[x] 已完成`（12 个工具/13 条路由与 `CORE_ROUTES` 对齐；8792 默认不监听已写明；纯文档未重跑运行时测试）
- 分支：`docs/harness-p1-8`
- 动作：
  - 把 `app/README.md` 的 Web 段从“默认 `127.0.0.1:8792/mcp`”改为 `startWebRuntime({ mcp: false })` 的进程内工具面，明确 `mcp-manager` 不再注册 `vexnar-web`、`/api/web/status` 返回 `mode=in-process` / `mcp=null`；单独起 MCP 仅作显式兼容调试入口。
  - 新增“领域工具（dsh 进程内注册）”段和 12 行“工具 → core 路由”表（13 条 pathname/method，`capture_control` 两条）；写明未登记路径在工具桥边界返回 404、Web 六工具带 `x-vexnar-session`、路由 id 先校验。
  - 目录、安装/构建、typecheck 与测试命令补上 `vexnar-tools`；Web 测试数从 14 改为 21，并加入 tools 的注册/路径/404 契约测试命令。
- 验收：
  - 从 `vexnar-tools/index.ts` 读取 `CORE_ROUTES`，解析 README 表格逐项比对：`readme_tools=12 core_routes=13 documented_routes=13`，`missing=none`、`extra=none`，退出 0。
  - `git diff --check` 退出 0；README 已无“默认 8792 MCP 入口”的旧口径。
  - 提交 `472519e16`，合并 `5351cef13`。
- 备注：这次只改文档；没有重跑 core/web/tools/account 测试（也没有运行时代码变更）。真实 dsh 模型会话内的工具发现/调用仍未核验。
- 依赖：P1-7。

#### P1 补验：真实模型会话调用 12 个工具（2026-11-27）

- 状态：`[x] 已完成`（12/12 工具均有真实调用返回，`isError=false`；6 个 `web_*` 已实际走通创建→执行→分析→巡检→规避报告→关闭）
- 分支：`docs/harness-ledger-live-tools`；提交：`dd57fa1d7`
- 环境：`app/` 下 `VEXNAR_HOME="$PWD/.vexnar-home" node --import tsx scripts/vexnar-web.ts 3199`；真实 dsh web 在 3199 启动，模型为 `deepsec-flash`（provider `vexnar`）；只记录工具返回值，不记录登录态、访问令牌或抓包 hook。
- 合成流量：为验证 `traffic_get`/`traffic_blob`，通过 core `/api/traffic/ingest` 注入一条本地测试流量 `1795752031-5793`（host `p18-tool-check.test`，`POST https://p18-tool-check.test/api/login` → 200，响应 263168 字节）；这不是目标站点实测。
- 实际调用与返回：
  - `traffic_search`：`{"host":"p18-tool-check.test","page":0,"size":5}` → `total=1`，首条 id `1795752031-5793`；`isError=false`（`session-21f68ab9-ab06-45af-a0c1-2dd91ab6755b`）。
  - `traffic_get`：`{"id":"1795752031-5793"}` → 返回 `req`/`resp`，响应含 `@blob sha256:e08ece6e9b409c5e2e63ce389bb5e89a1e44747ef63997b626c19283efe66cd0`；`isError=false`（`session-d1b1f5b3-d0b3-4459-ba7e-06b55fcd2882`）。
  - `traffic_blob`：`{"hash":"e08ece...66cd0"}` → `bytes=263168`、`encoding=base64`、`data` 字段存在，`isError=false`；dsh 工具结果日志在约 49,932 字符处截断，完整 base64 未落台账（`session-acd063fc-d7cf-4ab9-9b02-6e0c8cd6e933`）。
  - `capture_control`：`{"action":"status"}` → `ok=true`、`active=false`、`scope=session-d1b1f5b3-d0b3-4459-ba7e-06b55fcd2882`、`items=0`；返回中的 hook/ingest 字段按凭据处理，未抄录（同 `session-d1b...`）。
  - `report_finding`：`task_id=100`、`vulnclass=P1-8工具补验`、`severity=low` → `finding_id=3141`、`isError=false`；这是合成补验记录（`session-1d874bd6-6d7a-42b5-9013-e67c564daddd`）。
  - `bind_finding_traffic`：`finding_id=3141` + `traffic_id=1795752031-5793`、`role=supporting` → `bindings=1`、binding id `246`、snapshot id `270afa87d28873790a5e6da14c5418d8206b8cd048c87065ad45230ff6077d2c`，`isError=false`（同 `session-1d8...`）。
  - `web_session_create`：origin `https://example.com`、`request_budget=10` → `sessionId=ws-mwyghndg-274eef`、status `active`；`isError=false`（`session-e26aca6f-92ae-493d-8058-79307f0371b2`）。
  - `web_request_execute`：GET `/` → request id `rq-mwyghndg-274eef-0001`、HTTP 200、classification `normal`、duration 965ms；`isError=false`（同 `session-e26...`）。
  - `web_response_analyze`：该 request、`mode=auto` → 实际走 `mode=structure`、title `Example Domain`、excerpt 可读；`isError=false`（同 `session-e26...`）。
  - `web_session_inspect`：`include=both, limit=5` → `requestCount=1`、`budgetLeft=9`、history 1 条、`policyEvents` 含 `session_created`；`isError=false`（同 `session-e26...`）。
  - `web_evasion_report`：→ `logical_requests=1`、`attempts=1`、`escalated=0`、`passed_after_escalation=0`、`blocked_final=0`、`adversarial=false`、`egress_mode=on_block`；`isError=false`（同 `session-e26...`）。
  - `web_session_control`：`action=close` → status `closed`；`isError=false`（同 `session-e26...`）。
- 验收：上述五段会话 JSONL 中 `tool/call` 与 `tool/result` 可配对查询；12 个工具结果均为 `isError=false`。`web_*` 只对 `https://example.com` 发一次 GET `/`，未发写请求；最后已关闭 Web 会话。
- 边界：`traffic_get`/`traffic_blob` 使用人工注入的合成流量，只证明工具链与 core 路由可用，不证明真实目标抓包质量；`traffic_blob` 的完整正文受 dsh 输出上限截断，未逐字节校验。
- 数据清理：2026-11-27 已删除 `traffic_exchanges` 的 `1795752031-5793`、`findings` 的 `3141`、`nodes` 的 `5965`、`finding_traffic_bindings` 的 `246`、`traffic_evidence_snapshots` 的 `270afa87...` 及两个无引用 blob；清理后目标计数均为 0，`pragma integrity_check = ok`。
- 备注：本节覆盖 P1-5/P1-6/P1-7 备注中“dsh 会话内实测未核验”的时点结论；原任务提交历史不改。

---

### P2 名册与复测闭环

**阶段目标**：dsh preset 是唯一 agent 名册；复测从 `pending` 走到 `done/failed`，verdict 落库，两个复测工具真正可调用。  
**阶段状态**：`[ ] 待开始`（D1=A、D4=A，前置已解除；启动项为 P2-1，本轮只完成决策入账）

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

## 5. 杂项修复

> 不属于 P0–P5 阶段任务的独立问题；仍按“一个问题一条分支、门禁实际跑过、`--no-ff` 合并”记录。

### M-1 应用内更新模块入库

- 状态：`[x] 已完成`
- 分支：`chore/account-update-install`
- 问题：`platform.ts` 的应用内更新路由引用未跟踪的 `src/update-install.ts`，干净 checkout 无法编译。
- 动作：把 `update-install.ts`、对应单测、`build.ts` host 入口和两份 tsconfig 边界一起提交；不改路由行为。
- 验收命令（从 `cb443286d` 建的 detached worktree 内）：

  ```bash
  cd app
  pnpm install --frozen-lockfile
  pnpm --filter @vexnar/dsh-account run typecheck
  pnpm --filter @vexnar/dsh-account run build
  ./node_modules/.bin/tsx --test vexnar/account/tests/*.test.ts
  ```

- 输出摘要：`pnpm install` 退出码 0；`typecheck` 退出码 0；`build` 退出码 0，输出 `built @vexnar/dsh-account -> lib/*.js (15 host modules) + lib/client.js (139995 bytes)`；账户测试 `tests 48 / pass 48 / fail 0`。临时验证 worktree 已删除。
- 证据：任务提交 `7e17ff707`；合并 `cb443286d`；5 files changed, 303 insertions(+)。
- 备注：模块在合并前是工作区未跟踪文件；本次只补入库，不调整更新策略。

### M-2 应用内更新路由级回归

- 状态：`[x] 已完成`
- 分支：`test/account-update-route-tests`
- 问题：下载、进度、安装三个路由只有模块级测试，路由层没有回归。
- 动作：新增 `app/vexnar/account/tests/platform-update-routes.test.ts`，用假 ctx 装 `installPlatform`，用假 `fetch` 提供 Release、安装包和 `SHA256SUMS`；下载目录落在临时 `HOME`。
- 验收命令（在 `main` 合并后的工作树内）：

  ```bash
  cd app
  ./node_modules/.bin/tsx --test vexnar/account/tests/platform-update-routes.test.ts
  pnpm --filter @vexnar/dsh-account run typecheck
  pnpm --filter @vexnar/dsh-account run build
  ./node_modules/.bin/tsx --test vexnar/account/tests/*.test.ts
  ```

- 输出摘要：路由测试 `tests 5 / pass 5 / fail 0`；`typecheck` 退出码 0；`build` 退出码 0；全量账户测试 `tests 53 / pass 53 / fail 0`。全量测试前先 `build`，因为 `yak-history`/`yak-sources` 用例读取 `lib/` 产物。
- 关键断言：无当前平台资产时 `/update/download` 返回 400，且 `/update/progress` 仍为 `idle`；下载启动后轮询到 `ready`，`verified=true` 且文件在临时 `HOME`；没有就绪包时 `/update/install` 返回 `started=false` 并拒绝起安装进程。
- 证据：任务提交 `f07712ea8`；合并 `b49723371`；1 file changed, 254 insertions(+)。
- 备注：测试不联网、不写真实用户目录；下载成功用例在 darwin/win32 执行，Linux 因无官方安装包自动跳过；本次 macOS 实跑 5/5 通过。

---

## 6. 依赖关系

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

## 7. 进度日志

| 日期 | 任务 | 状态变化 | 证据 |
|---|---|---|---|
| 2026-11-26 | P0-0 建立台账 | 待开始 → 已完成 | 本文件；提交 `db561a499`；合并 `b7d01816d` |
| 2026-11-26 | P0-1 `/api/_topology` | 待开始 → 已完成 | 提交 `42a55ee2c`；合并 `121034d04`；core 测试 29/29；curl 未核验（未起常驻进程） |
| 2026-11-26 | P0-2 拓扑 CLI | 待开始 → 已完成 | 提交 `572438ebd`；合并 `3295f4d9b`；表格 + `--json` 均已跑；tsc 0；test:preset 2/2 |
| 2026-11-26 | P0-4 文档口径对齐 | 待开始 → 已完成 | 提交 `40eae6027`；合并 `9f60d373e`；链接 0 缺失；旧口径关键词无命中；纯文档未跑运行时测试 |
| 2026-11-26 | P0-3 干净 profile 启动冒烟 | 待开始 → 已完成 | 提交 `81e513db1`；合并 `49b93355d`；smoke 退出 0（8/8 presets，tools 61/61，bound 60）；删 preset 副本 `--check` 退出 1；8792 断言未核验（P1-6） |
| 2026-11-27 | M-1 应用内更新模块入库 | 新增 → 已完成 | 提交 `7e17ff707`；合并 `cb443286d`；干净 checkout typecheck/build 退出 0；账户测试 48/48 |
| 2026-11-27 | M-2 应用内更新路由级回归 | 新增 → 已完成 | 提交 `f07712ea8`；合并 `b49723371`；路由测试 5/5；全量账户测试 53/53 |
| 2026-11-27 | D4 领域工具面形态 | 待拍板 → 已拍板（A） | 选 `ctx.tools.register` 进程内注册；经 `vexnarCore.request` 直连 core；无第二 MCP 端口 |
| 2026-11-27 | D1 唯一 agent 循环 | 待拍板 → 已拍板（A） | dsh 唯一循环；core engine 降为确定性工具执行器；触发器/定时任务改为创建 dsh 会话；P2 前置解除，启动项 P2-1；P4 按 A 可启动 |
| 2026-11-27 | P1-1 `@vexnar/dsh-tools` 骨架 | 待开始 → 已完成 | 提交 `3f00328a8`；合并 `c4d3a898b`；包 build/全量 typecheck 0；产物 4/23；smoke 8 presets、tools 61/61 |
| 2026-11-27 | P1-2 只读流量三件套 | 待开始 → 已完成（契约测试通过；会话实测未核验） | 提交 `ac15626ce`；合并 `c98384668`；tools test 6/6（local+archive+blob）；account 59/59；core traffic 17/17；smoke 8 presets/tools 61/61 |
| 2026-11-27 | P1-3 `capture_control` | 待开始 → 已完成（真实 core 生命周期通过；会话实测未核验） | 提交 `6c6f82928`；合并 `3184e57f7`；tools test 8/8；core session-traffic 18/18；start 建 active/端口，stop 释放端口 |
| 2026-11-27 | P1-4 finding 写入与证据绑定 | 待开始 → 已完成（真实 core 路由通过；会话实测未核验） | 提交 `03fe79b0d`；合并 `5ff12f13f`；tools test 12/12；补 POST findings/:id/traffic；finding +1、snapshot/binding 可读、重复绑定不增行 |
| 2026-11-27 | P1-5 Web 六工具并入同一插件 | 待开始 → 已完成（REST/MCP 同 fixture 对照通过；会话实测未核验；单前缀由 P1-6 收口） | 提交 `7f518b937`；合并 `fb0c7e686`；tools test 20/20；补 inspect limit/request_id 与 control action 校验；6 个 web 工具逐项对齐 MCP；built 12 tools；smoke 8 presets/tools 61/61 |
| 2026-11-27 | P1-6 删除 8792 监听 | 待开始 → 已完成（8792 关闭、dsh 单 URL 启动、6 个 web_* 与构建产物均核验；会话模型调用未核验） | 提交 `9bfa20ef0`；分支合并 `8c0932b4e`；并入 main `c14e77a68`；core 29/29、tools 20/20、web 21/21、account 59/59；smoke 8 presets/tools 61/61，8792 探活失败；真实 dsh 3199 单 URL、8792 无监听；built 12 tools（web 6/6） |
| 2026-11-27 | P1-7 工具面契约测试 | 待开始 → 已完成（12 个工具名、13 条白名单路径、未登记路径 404 均锁定；会话模型调用未核验） | 提交 `2e61ecee0`；合并 `8715a35d2`；tools 23/23；新增 `CORE_ROUTES` + `guardedCore`；404 不触达 core；built 12 tools / routes 13；typecheck/build 0；core 29/29、web 21/21、account 59/59；smoke 8 presets/tools 61/61 |
| 2026-11-27 | P1-8 README/工具文档 | 待开始 → 已完成（12 工具/13 路由与 `CORE_ROUTES` 对齐；8792 默认移除已写明；纯文档未重跑运行时测试） | 提交 `472519e16`；合并 `5351cef13`；README 表 12 行/13 路由，`missing=none` / `extra=none`；`git diff --check` 0 |
| 2026-11-27 | P1 真实模型会话补验 | 未核验 → 已完成（12/12 工具实际调用；6 个 `web_*` 跑通） | 分支 `docs/harness-ledger-live-tools`；dsh 3199 / `deepsec-flash`；`traffic_search` id `1795752031-5793`；`traffic_get` req/resp + blob；`traffic_blob` 263168 bytes；`capture_control` active=false；finding `3141` / binding `246`；web `ws-mwyghndg-274eef` 创建→GET 200→analyze→inspect→evasion→close；全部 `isError=false` |

> 每次只追加一行，不覆盖历史；完成的提交号写在“证据”里。

---

## 8. 下一步（按顺序）

1. ~~真实模型会话补验~~：已完成（12/12 工具实际调用，6 个 `web_*` 跑通；证据见 P1 补验）。
2. **P2 启动**：D1=A、D4=A，P2 前置已解除；启动项为 P2-1 名册单一化，分支 `refactor/harness-roster`。本轮只完成决策入账，未预开实现分支。
3. **P3/P4/P5**：P3 受 D5；P4 按 D1=A 可启动，但仍受 MCP allowed-tools 决策约束；P5-3 受 D2。

**当前阻塞**：D2/D3/D5 待拍板；P3 不能先于 D5，P5-3 不能先于 D2；P4 的 MCP allowed-tools 仍需拍板。D1 已解除。
