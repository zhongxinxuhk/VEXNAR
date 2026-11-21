<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# app — dsh 客户端工作区

这里放 **app 端**：DeepSeek Harness（dsh）的本地源码树，加上 VEXNAR 自己的
bundle 层。Go 服务仍是产品本体，app 只通过两个接口消费它：

| 方向 | 接口 | 鉴权 |
|---|---|---|
| 模型推理 | `POST /api/desktop/openai/v1/chat/completions` | `X-VEXNAR-Desktop-Token` |
| 模型目录 | `GET /api/desktop/openai/v1/models` | 同上 |
| 领域工具 | `POST /mcp`（MCP Streamable HTTP） | `Authorization: Bearer <data/mcp.token>` |

## 目录

```text
app/
├─ dsh/                 # 上游源码（gitignored，由 scripts/fetch-dsh.sh 拉取）
├─ scripts/
│  └─ fetch-dsh.sh      # 固定 tag 重新拉取/校验上游
└─ vexnar/
   ├─ cordis.patch.yml  # provider + MCP 的 profile 覆盖层
   ├─ package.json      # dsh bundle 声明
   └─ src/client.ts     # 客户端插件（toolview / 侧栏面板）待实现
```

## 上游版本

- tag：`dsh-v0.2.2-rc.5`
- commit：`9c2670d3bce5275e0d1610272958121af87787bb`
- 许可：MIT（见 `dsh/LICENSE`），上游文件一律不加本仓库的 AGPL 头。

重新拉取或校验：

```sh
bash app/scripts/fetch-dsh.sh
git -C app/dsh rev-parse --short HEAD   # 9c2670d3
```

## 本地跑起来

```sh
cd app/dsh
pnpm install
pnpm --filter @deepseek-ai/dsh build     # 首次需要构建 CLI/web 产物
DSH_HOME="$PWD/.dsh-home" pnpm dsh web   # 起 web profile（默认 127.0.0.1）
```

VEXNAR 侧需要：

1. `data/mcp.token` 存在（MCP 端点启用，默认 loopback）；
2. 启动时导出 `VEXNAR_DESKTOP_TOKEN=<token>`（模型网关）；
3. Go 服务监听 `127.0.0.1:8787`。

app 层通过 `app/vexnar/cordis.patch.yml` 把 provider 指向 Go 网关、把 MCP 指向
`/mcp`；它只是 patch 层，不修改 dsh 上游代码，升级上游只需改 tag 与 patch。

## 边界

- 不把 Go 的会话/任务真相复制到 dsh：dsh 的 session 是客户端本地状态，任务、
  漏洞、流量、资产以 Go 的 PostgreSQL 为准。
- 不在 app 里另建模型目录：模型来自 `GET /api/desktop/openai/v1/models`。
- 上游 `dsh/` 目录内的文件保持 MIT 原样；本目录内 VEXNAR 自己写的文件带 AGPL 头。

## 运行与调试（GoLand）

`.idea/runConfigurations` 里已加入三条 app 端配置：

| 配置 | 作用 | 实际命令 |
|---|---|---|
| `VEXNAR app · dsh web (packaged)` | 浏览器客户端 | `node app/scripts/dsh-web.mjs` |
| `VEXNAR app · dsh desktop` | Electron 壳 | `node app/scripts/dsh-desktop.mjs` |
| `VEXNAR app · build UI cards` | 构建 finding / traffic 卡片 | `npm run build`（app/vexnar/ui） |

三条配置都通过 `app/scripts/*.mjs` 启动，统一做三件事：解析 dsh runtime（`DSH_RUNTIME` →
`app/dsh`（已构建）→ 安装版 DeepSeek Harness.app）、固定 `DSH_HOME=app/.dsh-home`、
从 `data/desktop.token` 与 `data/mcp.token` 注入 `VEXNAR_DESKTOP_TOKEN` / `VEXNAR_MCP_TOKEN`。

首次准备 profile：

```sh
node app/scripts/setup-app-profile.mjs   # 装 @vexnar/dsh-ui 并写 provider/MCP/UI 行
node app/scripts/dsh-web.mjs --no-open   # 起在 127.0.0.1:3080
```

## web 与桌面端在开发时的区别

| 维度 | `dsh web` | `dsh desktop` |
|---|---|---|
| 渲染载体 | 浏览器，`dsh-host-webserver` 提供静态资源与 RPC | Electron 窗口，打包的 Web 资源 + 同一套 Client 模块 |
| 启动方式 | `dsh --profile web` | Electron main 启动 Desktop Host，再拉起 web 应用 |
| 插件加载 | 相同：`dsh.client` 扫描 → `window.__DSH_BOOT__` → `/plugins/??pkg/client.js` | 相同（Desktop 也走 Client 模块表） |
| 原生能力 | 无（文件/终端都经 Host RPC） | 原生对话框、目录选择器、窗口控制、托盘 |
| 调试 | 浏览器 DevTools + Host 日志 | Electron DevTools + main/renderer 双进程日志 |
| 本仓库用途 | 快速验证 UI 卡片与 MCP 工具链路 | 验证最终发行形态、打包与签名 |

结论：开发期以 `dsh web` 为主，卡片和工具链完全一致；只在验证窗口、原生菜单、打包时才需要进桌面端。
