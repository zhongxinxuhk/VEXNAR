<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# app — dsh 客户端工作区

这里放 **app 端**：DeepSeek Harness（dsh）的本地源码树，加上 VEXNAR 自己的
bundle 层。Go 服务仍是产品本体，app 只通过两个接口消费它：

| 方向 | 走哪条链路 | 说明 |
|---|---|---|
| 模型推理 | **TS 直连 NewAPI** | 登录后由账户插件写入 dsh 凭据库与 `llm-pi-ai` 设置 |
| 模型目录 | `GET {api}/v1/models` | 登录时自动拉取，写入 provider 的 models |
| 领域工具 | Go `POST /mcp`（过渡） | 任务/漏洞/流量工具尚未迁移到 TS |

## 目录

```text
app/                          # WebStorm 工程根（项目名 app）
├─ package.json               # pnpm scripts：setup / web / desktop / build / ui:build / account:build
├─ .idea/runConfigurations/   # npm 类型运行配置，package manager=pnpm（无 shell）
├─ dsh/                       # 上游源码（gitignored，fetch-dsh.sh 拉取）
├─ scripts/
│  ├─ fetch-dsh.sh            # 固定 tag 拉取/校验上游
│  ├─ dsh-runtime.mjs         # 解析 dsh runtime + 读取 token
│  ├─ dsh-web.mjs             # web 启动器（隔离 home / 端口 3099）
│  ├─ dsh-desktop.mjs         # 桌面启动器
│  ├─ setup-app-profile.mjs   # 安装 UI/账户插件 + Claude 皮肤，写 profile patch
│  └─ ide-mcp.mjs             # JetBrains IDE MCP 直连客户端
└─ vexnar/
   ├─ cordis.patch.yml        # provider + MCP + 品牌/账户的 profile 覆盖层
   ├─ ui/                     # @vexnar/dsh-ui：卡片 + 品牌槽位
   └─ account/                # @vexnar/dsh-account：账户登录与状态
```

## 包管理器：只用 pnpm

`app/` 是**一个** pnpm workspace（`pnpm-workspace.yaml`），`app/package.json` 是唯一入口：

```sh
cd app
pnpm install                 # 全 workspace 一次装完：vexnar/ui、vexnar/account、core、store、spike
pnpm run build               # @vexnar/dsh-ui + @vexnar/dsh-account 出 bundle
pnpm run setup               # 安装插件并写隔离 profile
pnpm run upstream:check      # 上游边界 + 包管理器边界
pnpm --filter @vexnar/core start
```

硬规则（`pnpm run upstream:check` 逐条断言，违反即失败）：

| 规则 | 原因 |
|---|---|
| 只有 `app/pnpm-lock.yaml` 一个 lockfile | 一份锁定 = 一次 install 在所有机器上结果一致 |
| 不许出现 `package-lock.json` / `yarn.lock` | 第二个包管理器一进来，依赖树就分叉 |
| 子包不放 `pnpm-lock.yaml` / `pnpm-workspace.yaml` | workspace 只在本目录定义，子包只声明依赖 |
| `node_modules/` 不入库 | 可由 lockfile 复现，`pnpm install` 重建 |
| 根 `package.json` 固定 `packageManager` | 团队装出同一个 pnpm 版本 |

**install 只在 `app/` 里跑**：在子目录（如 `app/vexnar/ui`）里 `pnpm install` 会读不到
workspace 的 `allowBuilds`，esbuild 的 postinstall 会被拦下。要装子包依赖，回 `app/` 跑一次
`pnpm install`；要跑子包脚本，用 `pnpm --filter <name> run <script>`。

例外：`app/dsh/` 是上游 MIT 工作树，自带 workspace 与 lockfile，不参与本 workspace。

## 上游版本

- tag：`dsh-v0.2.2-rc.5`
- commit：`9c2670d3bce5275e0d1610272958121af87787bb`
- 许可：MIT（见 `dsh/LICENSE`），上游文件一律不加本仓库的 AGPL 头。

## 存储架构

域划分、读写路径、性能预算、冲突规则与迁移阶段见 [STORAGE-ARCHITECTURE.md](./STORAGE-ARCHITECTURE.md)。

## 迁移评估

Go → TypeScript 全栈的基线、目标架构、单元工作量与风险见 [MIGRATION.md](./MIGRATION.md)。

## 上游保护

上游/下游的边界、升级流程与冲突处理见 [UPSTREAM.md](./UPSTREAM.md)。核心约束：
`app/dsh` 只读、tag 锁定、`pnpm run upstream:check` 36 项断言、升级失败自动回滚。

## 隔离：不碰正在使用的 dsh

`app/.dsh-home` 是本工程专用 home，与安装版 `~/.dsh`、`~/.dsh/profiles` 完全分离：

- 启动器只认 `VEXNAR_DSH_HOME`，缺省 `app/.dsh-home`，**不继承**外部 `DSH_HOME`；
- web 固定 `127.0.0.1:3099`，与安装版的 3080/62698 不冲突；
- 插件只装进 `app/.dsh-home/profiles/web`，不写安装包目录；
- 唯一的共享是 dsh runtime 二进制（只读使用）。

## 皮肤：内嵌 dsh-claude-style

Web 客户端默认套上 [dsh-claude-style](https://github.com/Nwflower/dsh-claude-style)
（Claude Code Desktop 风格主题，registry 包 `dsh-claude-style`）：

- **接入方式**：`setup-app-profile.mjs` 把它装进 profile 依赖，并写进 profile 的
  `dsh.profile.bundles`。它自带 `dsh.bundle.patch`，因此 `ui-skin-claude-style` 行由**它自己**插入，
  我们不再手写这一行，也不复制它的源码。
- **层级位置**：dsh 的组装顺序是「各 bundle 的 patch → profile 的 `cordis.patch.yml` → `$DSH_HOME` 补丁」，
  所以 `app/vexnar/cordis.patch.yml` 仍然最后生效：品牌槽、MCP、模型路由不受皮肤影响。
- **令牌关系**：皮肤改的是 dsh 的 alias 令牌（`--dsw-alias-*`），而 `@vexnar/dsh-ui` 的 `--vx-*`
  只绑定这些 alias，所以卡片会自动跟随皮肤的配色，不需要为皮肤写第二套样式。
- **关闭方式**：`VEXNAR_THEME=off pnpm run setup`，然后从 profile 的 `dsh.profile.bundles` 里去掉该包
  （脚本不会自动删已存在的行，避免误删他人配置）。
- **许可**：主题本体 MIT；`packages/client/src/features/sodium/` 与 `packages/engine/src/sheet-rewrite.ts`
  是 Sodium 引擎，采用 PolyForm Shield 1.0.0。本项目只把它作为依赖使用，不复制进仓库、不改许可头。

## 运行与调试（WebStorm，全部用运行配置选项）

WebStorm 工程根是 `app/`，配置在 `app/.idea/runConfigurations/`，用 WebStorm 的
npm 运行配置类型 + **package manager = pnpm**（`package.json` + script），没有 shell 脚本配置：

| 配置 | 位置 | script | 说明 |
|---|---|---|---|
| `pnpm install` | `app/` | — | 全 workspace 一次装完，先跑这个 |
| `dsh web (isolated)` | `app/package.json` | `web` | 起 `127.0.0.1:3099`，`VEXNAR_DSH_HOME=app/.dsh-home` |
| `dsh desktop (isolated)` | `app/package.json` | `desktop` | 隔离 home 的桌面壳 |
| `Plugin bundles build` | `app/package.json` | `build` | 产出 ui + account 两个 `lib/client.js` |
| `UI cards build` | `app/package.json` | `ui:build` | 只重建卡片 bundle |
| `Setup app profile` | `app/package.json` | `setup` | 安装 UI/账户插件并写 profile patch |
| `Upstream check` | `app/package.json` | `upstream:check` | 上游边界 + 包管理器边界断言 |

启动器自动注入：`data/mcp.token` → `VEXNAR_MCP_TOKEN`，`data/desktop.token`（缺省
`devtoken`）→ `VEXNAR_DESKTOP_TOKEN`。

首次顺序：`Setup app profile` → 启 Go（`VEXNAR_DESKTOP_TOKEN=devtoken`）→ `dsh web (isolated)`。

## IDE MCP

WebStorm 的 MCP 端点（`127.0.0.1:64542/stream`，项目路径 `app`）不在 Docker MCP
网关的 catalog 里，无法注册成会话工具；用 `scripts/ide-mcp.mjs` 直连，支持
`tools` / `call`，以及 IDE 的 `execute_tool` 命令（`get_run_configurations`、
`execute_run_configuration --configurationName "UI cards build"` 等）。

## web 与桌面端在开发时的区别

| 维度 | `dsh web` | `dsh desktop` |
|---|---|---|
| 渲染载体 | 浏览器，`dsh-host-webserver` 提供静态资源与 RPC | Electron 窗口 + 打包的 Web 资源 |
| 插件加载 | 相同：`dsh.client` 扫描 → `__DSH_BOOT__` → `/plugins/??pkg/client.js` | 相同 |
| 原生能力 | 无（文件/终端走 Host RPC） | 原生对话框、目录选择、窗口控制、托盘 |
| 调试 | 浏览器 DevTools + Host 日志 | Electron DevTools + main/renderer 双进程 |
| 本仓库用途 | 日常验证卡片与 MCP 链路 | 只在验证打包/签名/窗口行为时用 |

结论：开发期用 web；卡片与工具链完全一致，桌面端只在发行验证时启动。

## 边界

- 不把 Go 的会话/任务真相复制到 dsh：dsh session 是客户端本地状态，任务、漏洞、
  流量、资产以 Go 的 PostgreSQL 为准。
- 不在 app 里另建模型目录：模型来自 `GET /api/desktop/openai/v1/models`。
- 上游 `dsh/` 保持 MIT 原样；本目录 VEXNAR 自写文件带 AGPL 头。
