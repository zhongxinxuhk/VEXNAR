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
├─ package.json               # npm scripts：setup / web / desktop / ui:build
├─ .idea/runConfigurations/   # 四个 npm 运行配置（无 shell）
├─ dsh/                       # 上游源码（gitignored，fetch-dsh.sh 拉取）
├─ scripts/
│  ├─ fetch-dsh.sh            # 固定 tag 拉取/校验上游
│  ├─ dsh-runtime.mjs         # 解析 dsh runtime + 读取 token
│  ├─ dsh-web.mjs             # web 启动器（隔离 home / 端口 3099）
│  ├─ dsh-desktop.mjs         # 桌面启动器
│  ├─ setup-app-profile.mjs   # 安装 UI 插件并写 profile patch
│  └─ ide-mcp.mjs             # JetBrains IDE MCP 直连客户端
└─ vexnar/
   ├─ cordis.patch.yml        # provider + MCP + 品牌/账户的 profile 覆盖层
   ├─ ui/                     # @vexnar/dsh-ui：卡片 + 品牌槽位
   └─ account/                # @vexnar/dsh-account：账户登录与状态
```

## 上游版本

- tag：`dsh-v0.2.2-rc.5`
- commit：`9c2670d3bce5275e0d1610272958121af87787bb`
- 许可：MIT（见 `dsh/LICENSE`），上游文件一律不加本仓库的 AGPL 头。

## 迁移评估

Go → TypeScript 全栈的基线、目标架构、单元工作量与风险见 [MIGRATION.md](./MIGRATION.md)。

## 上游保护

上游/下游的边界、升级流程与冲突处理见 [UPSTREAM.md](./UPSTREAM.md)。核心约束：
`app/dsh` 只读、tag 锁定、`npm run upstream:check` 27 项断言、升级失败自动回滚。

## 隔离：不碰正在使用的 dsh

`app/.dsh-home` 是本工程专用 home，与安装版 `~/.dsh`、`~/.dsh/profiles` 完全分离：

- 启动器只认 `VEXNAR_DSH_HOME`，缺省 `app/.dsh-home`，**不继承**外部 `DSH_HOME`；
- web 固定 `127.0.0.1:3099`，与安装版的 3080/62698 不冲突；
- 插件只装进 `app/.dsh-home/profiles/web`，不写安装包目录；
- 唯一的共享是 dsh runtime 二进制（只读使用）。

## 运行与调试（WebStorm，全部用运行配置选项）

WebStorm 工程根是 `app/`，配置在 `app/.idea/runConfigurations/`，全部是 **npm**
类型（`package.json` + script），没有 shell 脚本配置：

| 配置 | package.json | script | 说明 |
|---|---|---|---|
| `dsh web (isolated)` | `app/package.json` | `web` | 起 `127.0.0.1:3099`，`VEXNAR_DSH_HOME=app/.dsh-home` |
| `dsh desktop (isolated)` | `app/package.json` | `desktop` | 隔离 home 的桌面壳 |
| `UI cards build` | `app/vexnar/ui/package.json` | `build` | 产出 `lib/client.js` |
| `Setup app profile` | `app/package.json` | `setup` | 安装 UI/账户插件并写 profile patch |

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
