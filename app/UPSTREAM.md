<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# 上游 / 下游保护设计

目标只有三句话：

1. **继续吃 DeepSeek 官方的 dsh 更新**；
2. **官方更新永远不覆盖 VEXNAR 的开发**（品牌、账户、工具卡片、Profile 配置）；
3. **VEXNAR 的开发也永远不改上游文件**，否则下一次更新一定冲突。

---

## 1. 分层：谁可以改，谁只读

```text
┌─────────────────────────────────────────────────────────────┐
│ L4  VEXNAR app 层（可写，本仓库）                            │
│     app/vexnar/cordis.patch.yml   provider / MCP / 品牌 / 账户行│
│     app/vexnar/ui/                客户端插件（卡片 + 品牌槽位） │
│     app/scripts/                  setup / 启动 / 升级 / 校验    │
├─────────────────────────────────────────────────────────────┤
│ L3  dsh Profile（可写，但只在 app/.dsh-home）                 │
│     profiles/web/cordis.patch.yml 由 setup 生成，不作事实源     │
├─────────────────────────────────────────────────────────────┤
│ L2  dsh 官方 bundle（只读）                                   │
│     dsh-base / dsh-web-app / dsh-desktop …                   │
├─────────────────────────────────────────────────────────────┤
│ L1  dsh 上游源码（只读、gitignored、tag 锁定）                 │
│     app/dsh/   = dsh-v0.2.2-rc.5 @ 9c2670d3                  │
└─────────────────────────────────────────────────────────────┘
```

**唯一规则：L1/L2 只读，所有差异只存在于 L4。**

- `app/dsh` 由 [fetch-dsh.sh](/Users/xuzhongxin/GolandProjects/HKXsec VEXNAR/app/scripts/fetch-dsh.sh) 拉取，版本记录在 [upstream.lock.json](/Users/xuzhongxin/GolandProjects/HKXsec VEXNAR/app/upstream.lock.json)；
- `.gitignore` 屏蔽 `app/dsh/`，上游代码不进本仓库历史；
- 任何"想改 dsh 源码"的念头，都改写成 bundle patch 或客户端插件。

---

## 2. 硬不变量（有脚本兜底）

| # | 不变量 | 检查点 |
|---|---|---|
| 1 | `app/dsh` HEAD == lock.commit | `check-upstream.mjs` |
| 2 | `app/dsh` 工作树干净（无人改上游） | `git -C app/dsh status --porcelain` |
| 3 | lock 的 tag 仍解析到同一 commit | `git rev-list -n1 <tag>` |
| 4 | 依赖的上游 API 面存在：`tool.call.toolview`、`sidebar.brand.mark/name`、`llm-pi-ai`、`mcp-manager`、`streamable-http`、`__ModuleLoader__` | 文件级断言 |
| 5 | VEXNAR bundle 仍指向存在的行 id（`llm-pi-ai`、`mcp-manager`、`ui-brand-official`、`deepseek-account`、`llm-deepseek-account`） | patch 断言 |
| 6 | 客户端插件仍产出 loader 工厂、React 仍 external | bundle 断言 |
| 7 | 包管理器只有 pnpm：无 `package-lock.json`/`yarn.lock`，只有 `app/pnpm-lock.yaml` 与 `app/pnpm-workspace.yaml` | 文件级断言 |

一条命令：

```sh
pnpm run upstream:check
```

36 项断言，失败即非零退出。这个脚本就是"更新没覆盖我"的机器证明。

---

## 3. 品牌 UI：用槽位占领，不碰源码

上游 `@deepseek-ai/dsh-client-ui-brand-official` 的 README 明确写了替换方式：
**不要改它，把它从组合里去掉，用另一个包占据相同槽位。**

实现：

- `app/vexnar/cordis.patch.yml`：`- id: ui-brand-official` → `disabled: true`
- `@vexnar/dsh-ui` 注册：
  - `sidebar.brand.mark` → VEXNAR 的 V 字标
  - `sidebar.brand.name` → `VEXNAR`

上游更新只会改它自己的品牌组件；我们的槽位占据不受影响。若未来某版把槽位改名，
不变量 #4 会直接失败并阻止升级——这就是保护网。

---

## 4. 账户登录：关掉上游，接管入口

当前 dsh 的账户体系是 DeepSeek 账号（`deepseek-account`、`llm-deepseek-account`、
`ui-settings-account`、`ui-account-notifications`）。VEXNAR 的模型访问走 Go 网关，
所以：

- 这四行在 patch 里统一 `disabled: true`；
- 模型凭据只存在 Go 进程，客户端拿不到上游 key；
- VEXNAR 自己的登录（NewAPI / 企业账号）后续以独立客户端插件实现，注册到
  设置页的账户卡槽位，**不与上游账号组件共用状态**。

这样即使上游大改账户 UI，也只会影响被禁用的行；我们的账户插件和 Go 网关不受影响。
若某天要恢复上游账号，删掉这四行即可，不需要回滚代码。

---

## 5. 升级流程（runbook）

```text
1. pnpm run upstream:upgrade -- --tag dsh-vX.Y.Z
   └─ 检查上游树干净 → fetch tag → checkout → 跑 36 项断言
      ├─ 失败：自动 checkout 回旧 commit，lock 不变，退出 1
      └─ 成功：更新 upstream.lock.json
2. pnpm run setup                       # 重新生成隔离 profile
3. pnpm run build                      # 重建 ui/账户两个 bundle
4. pnpm run upstream:check              # 再校验一次
5. 手工冒烟：dsh web 能启动、品牌是 VEXNAR、MCP 20 工具、模型能出字
6. 提交：lock + 必要的 patch/插件适配
```

失败处理：**先回滚，再适配**。绝不在上游树里"顺手改一行"让检查通过。

回滚：

```sh
pnpm run upstream:upgrade -- --rollback
```

---

## 6. 账户/品牌的"更新冲突"矩阵

| 上游变更 | 影响 | 我们的反应 |
|---|---|---|
| 品牌组件改样式/资源 | 无（已 disabled） | 不用动 |
| 品牌槽位改名 | 断言 #4 失败 | 改我们的 slot key，升级暂停 |
| 账户插件重构 | 无（已 disabled） | 不用动 |
| 账户 row id 改名 | 断言 #5 失败 | 改 patch 行 id |
| `llm-pi-ai` 配置字段变化 | 断言 #5 通过但可能运行失败 | 冒烟发现 → 改 patch |
| `mcp-manager` transport 改名 | 断言 #4 失败 | 改 patch 的 transport |
| `tool.call.toolview` 契约变化 | 断言 #4 通过但卡片异常 | 改 `client.tsx` 注册 |
| Client loader 格式变化 | 断言 #6 失败 | 改 `build.mjs` 包装 |

---

## 7. 协作规则（写进评审）

- PR 里出现 `app/dsh/**` 的 diff = 直接拒绝；
- 新增定制一律落 `app/vexnar/**` 或 `app/scripts/**`；
- 每次升级必须带 `upstream.lock.json` 变更和 `upstream:check` 通过记录；
- 品牌/账户的定制优先用 patch 行 + 槽位，不改上游组件。

---

## 8. 验收清单

- [x] `app/dsh` 干净、tag/commit 锁定
- [x] `pnpm run upstream:check` 36/36
- [x] 品牌：官方行 disabled，VEXNAR 占据 `sidebar.brand.*`
- [x] 账户：四行 disabled，模型只走 Go 网关
- [x] 升级脚本失败自动回滚
- [x] 账户插件：`@vexnar/dsh-account`（设置页「账户」，登录后 TS 直连 NewAPI）
- [ ] 首次真实升级演练（等下一个 tag）
