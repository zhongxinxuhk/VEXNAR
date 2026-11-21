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
| 模型目录与推理 | core 桌面网关（进程内） | 契约与 Go 的回环网关相同，引擎直接 `api.fetch` 调用，不开端口、不依赖 Go |
| 领域工具 | core 原生路由 | 任务/漏洞/流量/资产/拦截/用量全部读本地 SQLite store |
| 回退 | Go 服务 | `VEXNAR_RUNTIME_MODE=go` 时数据面整段转发回 Go（含模型走 8787 网关） |

## 目录

```text
app/                          # WebStorm 工程根（项目名 app）
├─ package.json               # pnpm scripts：setup / web / desktop / build / ui:build / account:build
├─ .idea/runConfigurations/   # npm 类型运行配置，package manager=pnpm（无 shell）
├─ dsh/                       # 上游源码（gitignored，fetch-dsh.sh 拉取）
├─ scripts/
│  ├─ fetch-dsh.sh            # 固定 tag 拉取/校验上游
│  ├─ vexnar.mjs              # VEXNAR CLI
│  ├─ vexnar-runtime.mjs      # 解析独立运行时与设置
│  ├─ vexnar-web.mjs             # web 启动器（隔离 home / 端口 3099）
│  ├─ vexnar-desktop.mjs         # 桌面启动器
│  ├─ setup-app-profile.mjs   # 安装 VEXNAR bundle 和客户端插件
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

默认不需要 Go：数据面（任务/漏洞/流量/资产/拦截/用量）与模型网关都由 `pnpm run web` 拉起的
dsh 客户端内的 `vexnar-core` 直接回答。要看底座当前跑的是哪一套：

```sh
curl -s -H "x-vexnar-token: $VEXNAR_API_TOKEN" http://127.0.0.1:3099/vexnar-api/api/_runtime
# {"mode":"ts","store":"sqlite","started":true,"triggers":10,...}
```

`VEXNAR_RUNTIME_MODE=go` 回到旧路径：由 `app/` 自己编译和托管 Go 后端（不用另开终端）：

1. `scripts/vexnar-go.mjs` 用 Go 源码算一个指纹（git HEAD + 未提交的 `.go` 改动），
   编到 `app/.vexnar-bin/vexnar-<指纹>`，并 `-X main.version=<指纹>` 注入版本；
   源码没变就跳过编译。
2. 启动前先探 `127.0.0.1:8787`：同版本就复用（避免两个进程写同一份 SQLite），
   是别的构建就报错并给出 `lsof` 命令，绝不静默连上一个对不上的后端。
3. 自己起的进程随客户端退出一起回收；`-data`/`-keydir` 仍指回仓库根的 `data/` 与
   `jwt.key`，不搬家、不产生第二份数据库。

```sh
pnpm run go:build            # 只编译，不启动
pnpm run go:stamp            # 打印当前源码指纹
```

逃生口：

| 变量 | 作用 |
|---|---|
| `VEXNAR_RUNTIME_MODE=go` | 数据面与模型回到 Go：拉起内置后端，请求整段转发 |
| `VEXNAR_GO=off` | 不启动内置后端，改用 `VEXNAR_GO_URL` 指定的外部服务 |
| `VEXNAR_GO_URL` | 外部 Go 地址；设置后客户端不再自己起 |
| `VEXNAR_GO_BIN` | 指定现成二进制（打包环境没有 Go 工具链时用，版本不做强校验） |
| `VEXNAR_GO_PORT` | 内置后端端口，默认 8787 |

`node scripts/vexnar.mjs --help` 查看 VEXNAR CLI 命令。Web 默认绑定
`127.0.0.1:3099`，桌面通过独立 Electron 进程启动本机页面。
VEXNAR 使用 `app/.vexnar-home`（可用 `VEXNAR_HOME` 指定独立目录）和
`profiles/vexnar`。默认工作区也建在该目录内，Electron 用户数据位于其下的 `electron/`。运行时由工作区的
pnpm 依赖提供。已有的原版客户端和旧 `app/.dsh-home` 可以继续保留。
账户配置见 [账户和模型](./vexnar/account/README.md)。

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
