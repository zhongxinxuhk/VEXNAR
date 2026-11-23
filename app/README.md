<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# VEXNAR 客户端工作区

VEXNAR Web 和桌面客户端共用隔离的运行时；运行时底座是 TypeScript（`vexnar-core`），
Go 服务只是回退路径。

| 方向 | 走哪条链路 | 说明 |
|---|---|---|
| 账户登录 | HXSEC AI Platform | 客户端启动时验证。密码和两步验证码可在 App 输入，第三方认证使用独立平台窗口 |
| 模型目录与推理 | dsh 进程内的账号插件 | 设置 → 模型维护目录，账号插件通过 `setModelCompletion` 向 core 注册调用函数 |
| 领域工具 | core 原生路由 | 任务/漏洞/流量/资产/拦截/用量全部读本地 SQLite store |
| 回退 | Go 服务 | `VEXNAR_RUNTIME_MODE=go` 时数据面转发给配置的 Go 服务，dsh 的模型访问仍在自身进程内 |

## 目录

```text
app/                          # WebStorm 工程根（项目名 app）
├─ package.json               # pnpm scripts：setup / web / desktop / build / typecheck
├─ .idea/runConfigurations/   # npm 类型运行配置，package manager=pnpm（无 shell）
├─ dsh/                       # 上游源码（gitignored，fetch-dsh.sh 拉取）
├─ scripts/                   # 全部 .ts，由 tsx 执行
│  ├─ fetch-dsh.sh            # 固定 tag 拉取/校验上游
│  ├─ vexnar.ts               # VEXNAR CLI
│  ├─ vexnar-runtime.ts       # 解析独立运行时与设置
│  ├─ vexnar-web.ts           # web 启动器（隔离 home / 端口 3099）
│  ├─ vexnar-desktop.ts       # 桌面启动器（Electron 主进程）
│  ├─ setup-app-profile.ts    # 安装 VEXNAR bundle 和客户端插件
│  └─ ide-mcp.ts              # JetBrains IDE MCP 直连客户端
├─ vexnar-mcp/                # @vexnar/dsh-vexnar-mcp：MCP 注册插件（index.ts → index.js）
└─ vexnar/
   ├─ cordis.patch.yml        # provider + MCP + 品牌/账户的 profile 覆盖层
   ├─ ui/                     # @vexnar/dsh-ui：卡片 + 品牌槽位
   │  ├─ src/                 # 源（.ts / .tsx）
   │  └─ lib/                 # 构建产物（index.js / client.js，由 build.ts 生成）
   ├─ account/                # @vexnar/dsh-account：账户登录与状态
   │  ├─ src/                 # 源（.ts / .tsx）
   │  └─ lib/                 # 构建产物（宿主模块 + client.js + core-embedded.js）
```

## 语言与构建：全员 TypeScript

`app/` 下不再有手写的 `.js` / `.mjs`：脚本、测试、插件源码、构建脚本都是 TypeScript。

| 位置 | 怎么执行 | 为什么 |
|---|---|---|
| `scripts/*.ts`、`vexnar-core/*.test.ts`、`vexnar-store/*.test.ts`、`spike/**/*.ts`、`vexnar/{ui,account}/build.ts` | `tsx <file>.ts`（或用 `node --test` 跑测试） | 直接跑源码，不经编译；`tsx` 负责类型擦除与 `.ts` 说明符 |
| 桌面主进程 `scripts/vexnar-desktop.ts` | Electron 44 自带 Node 24 直接执行 | 主进程入口本身就是 `.ts`；Electron API 用 `createRequire` 取（ESM 裸说明符会解析到 npm 包） |
| `vexnar/{ui,account}/src/*.ts`（宿主半边）、`vexnar-mcp/index.ts` | `pnpm run build` 生成 `lib/*.js` / `index.js` 后由 dsh 加载 | dsh 从 profile 的 `node_modules` 里 import 插件；Node 对 `node_modules` **不擦类型**（`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`），所以入口必须是真 JS |
| `website/`（见 `website/`） | `vite` / `node --test` / `node scripts/prerender.ts` | vite 自己处理 TS；prerender 与测试用 Node 原生擦类型 |

`pnpm run typecheck` 检查 `@vexnar/dsh-ui`、`@vexnar/dsh-account`、`@vexnar/dsh-egress` 和 `@vexnar/core`。
启动脚本可单独运行 `pnpm exec tsc -p scripts/tsconfig.json` 检查。

## 包管理器：只用 pnpm

`app/` 是**一个** pnpm workspace（`pnpm-workspace.yaml`），`app/package.json` 是唯一入口：

```sh
cd app
pnpm install                 # 全 workspace 一次装完：vexnar/ui、vexnar/account、core、store、spike
pnpm run build               # 构建 UI、账号、出口插件及内嵌 core
pnpm run setup               # 初始化 VEXNAR profile
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

## 侧边栏融入 dsh

Web 控制台的导航如何映射到 dsh 面板、哪些复用 dsh 原生能力，见 [SIDEBAR-INTEGRATION.md](./SIDEBAR-INTEGRATION.md)。

## 内置插件

Craft Anything（MCP）与 dsh-plugin-shop（插件商店）的安装、更新见 [PLUGINS.md](./PLUGINS.md)。

## 存储架构

域划分、读写路径、性能预算、冲突规则与迁移阶段见 [STORAGE-ARCHITECTURE.md](./STORAGE-ARCHITECTURE.md)。

## 迁移评估

Go → TypeScript 全栈的基线、目标架构、单元工作量与风险见 [MIGRATION.md](./MIGRATION.md)。

## 上游保护

上游/下游的边界、升级流程与冲突处理见 [UPSTREAM.md](./UPSTREAM.md)。核心约束：
`app/dsh` 只读、tag 锁定、`pnpm run upstream:check` 36 项断言、升级失败自动回滚。

## 启动和本机数据

```sh
cd app
pnpm install && pnpm run build && pnpm run setup
pnpm run web                 # 或 pnpm run desktop
```

### 客户端数据目录

Web 与桌面启动器使用 profile 下的 `vexnar/store/vexnar.sqlite`。可通过 `VEXNAR_HOME` 选择 profile，或通过 `VEXNAR_SQLITE_PATH` 指定 SQLite 文件。启动器不会把 PostgreSQL 连接串传给 dsh。账号、凭据和会话仍由 dsh profile 管理，归档流量仍使用本地索引和正文文件。

首次接管旧 PostgreSQL 数据时，可从 `app/` 生成一个待验证的新文件。以下三个路径都使用绝对路径。

```sh
pnpm --filter @vexnar/store run import:pg \
  --config /path/to/config.json \
  --base /path/to/existing/vexnar.sqlite \
  --to /path/to/client-candidate.sqlite
```

迁移在一个只读快照中导出业务表，逐表核对行数与 SHA-256，并检查 SQLite 完整性。原始行保存在 `legacy_pg_rows`，表结构摘要和校验记录保存在 `legacy_pg_tables`。任务、资产、发现及目录等历史数据另按客户端字段投影到 `kv` 和 `meta`。相同键保留 `--base` 中的本地值。执行配置和凭据留在原始归档中。这个文件包含私有数据，需和 profile 一样保护。

迁移生成新文件之后，可以使用 `VEXNAR_SQLITE_PATH=/path/to/client-candidate.sqlite pnpm run web` 验收。正式替换前先停止客户端，并保留原文件及其 WAL。迁移不修改 PostgreSQL。

独立 Go 服务保留自己的数据库配置。如果需要显式切回旧 API，可设置 `VEXNAR_RUNTIME_MODE=go`，配合 `VEXNAR_GO_URL` 或 `VEXNAR_GO=on` 使用。模型调用仍由账号插件在 dsh 进程内管理。

旧 Go 服务的工具入口仅在显式 Go 模式中挂载。SQLite 客户端可以查询已迁移的历史记录和配置。

```sh
pnpm run go:build            # 需要 Go 时：只编译，不启动
pnpm run go:stamp            # 打印当前 Go 源码指纹
```

`pnpm run vexnar --help` 查看 VEXNAR CLI 命令。Web 默认绑定
`127.0.0.1:3099`，桌面通过独立 Electron 进程启动本机页面。
VEXNAR 使用 `app/.vexnar-home`（可用 `VEXNAR_HOME` 指定独立目录）和
`profiles/vexnar`。默认工作区也建在该目录内，Electron 用户数据位于其下的 `electron/`。运行时由工作区的
pnpm 依赖提供。已有的原版客户端和旧 `app/.dsh-home` 可以继续保留。
账户配置见 [账户和模型](./vexnar/account/README.md)。

## 运行时诊断

已登录客户端可从 `GET /vexnar-api/api/_runtime` 查看运行时状态。
`core_state` 表示模块加载状态，分别为 `loading`（加载中）、`available`（模块可用）和
`failed`（加载失败）。`started` 表示运行时底座（触发器、定时任务、store 锁、任务队列）
是否已经启动。诊断由 dsh 宿主回答，core 仍在加载时也能读取；加载完成后域接口等待同一个
导入结果，不再有固定期限的「启动超时」。

## 管理客户端数据

- 在 **任务 → 归档记录** 查看、恢复或移除归档。运行中或排队的本地任务需先暂停才能归档。
- 在 **流量 → 清理本地流量** 选择截止日期，可按主机精确筛选，然后预览并确认清理。
  清理只删除客户端 SQLite 中日期零点之前的流量条目。Yak 历史、已绑定证据和共享正文仍可用。

## 更新客户端

源码安装从已验证的仓库版本运行。升级前停止 dsh，备份当前 profile，以及通过
`VEXNAR_SQLITE_PATH` 单独指定的数据库。切换到目标版本后，在 `app/` 依次运行
`pnpm install --frozen-lockfile`、`pnpm run build`、`pnpm run setup`，然后用原来的
`VEXNAR_HOME` 和数据路径启动。回退时用上一版本重新构建，并使用该版本对应的数据备份。

dsh 的更新接口会返回工作区管理状态。Go 服务在自己的 Web 控制台中管理 Go 二进制更新。

## 皮肤：内嵌 dsh-claude-style

Web 客户端默认套上 [dsh-claude-style](https://github.com/Nwflower/dsh-claude-style)
（Claude Code Desktop 风格主题，registry 包 `dsh-claude-style`）：

- **接入方式**：`setup-app-profile.ts` 把它装进 profile 依赖，并写进 profile 的
  `dsh.profile.bundles`。它自带 `dsh.bundle.patch`，因此 `ui-skin-claude-style` 行由**它自己**插入，
  我们不再手写这一行，也不复制它的源码。
- **层级位置**：dsh 的组装顺序是「各 bundle 的 patch → profile 的 `cordis.patch.yml` → `$DSH_HOME` 补丁」，
  所以 `app/vexnar/cordis.patch.yml` 仍然最后生效：品牌槽、MCP、模型路由不受皮肤影响。
- **令牌关系**：皮肤改的是 dsh 的 alias 令牌（`--dsw-alias-*`），而 `@vexnar/dsh-ui` 的 `--vx-*`
  只绑定这些 alias，所以卡片会自动跟随皮肤的配色，不需要为皮肤写第二套样式。
- **品牌不被皮肤顶掉**：皮肤画自己的侧栏品牌行、不渲染宿主 `sidebar.brand.*` 槽位，因此
  `@vexnar/dsh-ui` 在皮肤激活（`body[data-dsh-claude-style]`）时就地改写它的
  `brand-identity` / `rail-mark` 内容为 VEXNAR 标志与字标。不通过关皮肤开关实现——那会整对象
  替换该行 config，连带清掉用户在设置里存的配色与布局。
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
| `VEXNAR Web` | `app/package.json` | `web` | 起 `127.0.0.1:3099`，`VEXNAR_HOME=app/.vexnar-home` |
| `VEXNAR Desktop` | `app/package.json` | `desktop` | 隔离 home 的桌面壳 |
| `Plugin bundles build` | `app/package.json` | `build` | 产出 ui + account 两个 `lib/client.js` |
| `UI cards build` | `app/package.json` | `ui:build` | 只重建卡片 bundle |
| `Setup app profile` | `app/package.json` | `setup` | 安装 UI/账户插件并写 profile patch |
| `Upstream check` | `app/package.json` | `upstream:check` | 上游边界 + 包管理器边界断言 |

启动器自动注入：`data/mcp.token` → `VEXNAR_MCP_TOKEN`，`data/desktop.token`（缺省
`devtoken`）→ `VEXNAR_DESKTOP_TOKEN`。

首次顺序：`Setup app profile` → 启 Go（`VEXNAR_DESKTOP_TOKEN=devtoken`）→ `VEXNAR Web`。

## IDE MCP

WebStorm 的 MCP 端点（`127.0.0.1:64542/stream`，项目路径 `app`）不在 Docker MCP
网关的 catalog 里，无法注册成会话工具；用 `scripts/ide-mcp.ts` 直连，支持
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

## GitHub Actions 编译

仓库的 **App build** 工作流在 `app/`、品牌 Logo 或工作流文件发生变更时对 PR 和
`main` 推送运行。它用 npm 锁文件安装依赖、重新编译 UI 与账户插件并检查生成的
JavaScript。运行详情的 **Artifacts** 可下载 `vexnar-app-bundle`，其中包含编译后的
插件、profile patch 和上游版本锁。

在 **Actions → App build → Run workflow** 保持 `desktop` 勾选，会额外编译 macOS
Apple Silicon、macOS Intel 和 Windows x64 的无签名 dsh 安装包。工作流使用
`scripts/fetch-dsh.sh` 校验上游 commit，安装包和 VEXNAR 覆盖层分别下载。
安装 dsh 后可在源码工作区执行 `npm run setup`，将 VEXNAR 插件和配置装入隔离 profile。

推送 `app-v<版本>` 标签（例如 `app-v0.1.0`）会在当前 VEXNAR 仓库发布预发行版，
附带三个平台的无签名安装包、`vexnar-app-bundle.tar.gz` 和 `SHA256SUMS`。
Go 服务继续使用 `v*` 标签发布，App 预发行版不会成为仓库的 Latest Release。
