<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# VEXNAR Desktop (Electron)

独立的桌面 Agent 客户端。它使用独立的 React 界面，与 Web 共用 Go 业务后端；可单独迭代桌面端的会话、工作区、终端和 Diff 体验。

## 界面

桌面壳层按 Codex 的三栏结构重做：

- 最左侧图标栏：对话、任务、最近对话、工作区文件、资产、更多，以及工作区/Git/安全发现入口。
- 会话栏：新聊天、置顶、按工作区分组的项目会话，支持折叠、排序、搜索、置顶与删除。
- 主区域：居中的项目空态，以及底部悬浮输入框（此计算机/项目上下文、完全访问状态、模型选择、语音输入、发送/停止）。

界面**不提供后端地址、登录或连接配置**。Go 服务与便携 PostgreSQL 按发行包内置运行时的形态设计，主进程只在本机回环地址访问；渲染层没有 URL 输入口。

## 技术栈

| 层 | 选择 |
| --- | --- |
| Shell | Electron + electron-vite |
| UI | React 19 + TypeScript + Tailwind CSS + Radix UI + shadcn/ui 风格组件 |
| State | Zustand |
| Animation | Motion |
| Terminal | xterm.js + node-pty |
| Editor | Monaco DiffEditor |
| Git | simple-git |
| IPC | contextBridge + typed IPC + Zod |
| Storage | **内置便携 PostgreSQL**（不是 SQLite） |
| Packaging | electron-builder + GitHub Actions |

## 架构

```text
Electron Renderer
  React · Chat · Workspace · Terminal · Diff
        │
Preload + IPC Gateway
  contextBridge · Zod validation · typed VexnarApi
        │
Electron Main
  window lifecycle · settings · workspace · git · PTY
        │
  ├──────────────────────┐
  │                      │
Agent Runtime        Go sidecar (bundled `vexnar`)
  separate Node proc    loopback `/api/desktop/*`
  JSON IPC · tools      model config · catalog · inference proxy
        │                      │
        └────── SSE ───────────┘
                               │
                    PostgreSQL `vexnar_backend`
```

- Renderer 不具备 Node 权限；`contextIsolation: true`、`nodeIntegration: false`。
- 所有文件/Git 路径都经过 `ensureInside()` 限制在当前工作区内。
- Go 进程是模型提供方、模型目录、选择、凭据、路由和推理的唯一权威来源。
- Electron 主进程只持有 Go sidecar 的随机回环端口与每次启动随机令牌；渲染层和 Agent Runtime 都拿不到上游 API Key。
- Agent Runtime 通过 `child_process.fork` 启动，使用主进程下发的回环网关地址访问 `/api/desktop/openai/v1/chat/completions`。

## 便携 PostgreSQL

桌面端**始终使用 PostgreSQL**。SQLite 仅作为历史实现被移除，不提供回退。

首次启动：

1. 从打包资源 `resources/pg`（安装后为 `process.resourcesPath/pg`）找到 `initdb`。
2. 在 `app.getPath('userData')/pgdata` 初始化本地集群。
3. 生成 `userData/pgpassword`（0600）并使用 `scram-sha-256`。
4. 在随机 loopback 端口启动 `postgres`，创建 `vexnar`（Electron 会话/设置）与 `vexnar_backend`（Go 模型、任务、资产等）两个数据库。
5. 启动 `resources/vexnar/vexnar` sidecar，随机回环端口 + `VEXNAR_DESKTOP_TOKEN`，等待 `/api/health`。
6. 退出时先停 sidecar，再执行 `pg_ctl -m fast stop`，并清理子进程。

日志：`userData/logs/postgres.log`。

开发时可以覆盖：

```bash
# 使用已有 PG（不会启动内置实例）
VEXNAR_PG_DSN='postgres://user:pass@127.0.0.1:5432/vexnar?sslmode=disable' npm run dev

# 指向本地构建/解压的便携 PG bin 目录
VEXNAR_PG_BIN="$PWD/../../.pg-build/pg-16.16/bin" npm run dev
```

`npm run dev` 会依次检查 `node_modules`、`VEXNAR_PG_DSN`、`VEXNAR_PG_BIN`、`resources/pg` 和仓库的 `.pg-build`；缺 PG 时会直接给出可操作的提示，不会先弹出 Electron 错误框。

GoLand 的运行配置：

- `VEXNAR Desktop`：本目录的 Electron/Codex UI（默认）。
- `VEXNAR Desktop (Tauri)` / `(Tauri fast)`：旧的 Tauri + Go sidecar 壳层。

`npm run smoke` 会依次验证 PG、Go sidecar 健康检查、PTY、Agent Runtime。Go sidecar 未构建时 `npm run dev` 会自动调用 `npm run backend:prepare`。

## 开发命令

```bash
cd apps/desktop
npm install
npm run dev          # 自动探测 portable PG 后启动 Electron + Vite
npm run typecheck
npm run test
npm run build
npm run backend:prepare  # 构建 resources/vexnar/vexnar（需要 Go）
npm run smoke        # 需要便携 PG；可使用 VEXNAR_PG_BIN / VEXNAR_PG_DSN

# 安装本地/CI 产出的便携 PG 到 resources/pg
npm run pg:fetch -- ../../dist/pg-darwin-arm64.tar.gz

# 打包（CI 会先放入对应平台的 resources/pg）
npm run dist:mac
npm run dist:linux
npm run dist:win
```

## GitHub Actions

`.github/workflows/desktop-electron.yml` 分两阶段：

1. `pg`：按平台构建/下载便携 PostgreSQL，上传 `pg-darwin-arm64`、`pg-linux-x64`、`pg-windows-x64`。
2. `package`：下载匹配平台的 PG 到 `apps/desktop/resources/pg`，再运行 electron-builder 生成安装包。

macOS 使用 `scripts/ci/build-pg-macos.sh`，Linux 使用 `scripts/ci/build-pg-linux.sh`，Windows 使用 `scripts/ci/fetch-pg-windows.ps1`（EnterpriseDB 官方 Windows binaries，裁剪后打包）。任何平台都不会把 SQLite 打进安装包。

## 目录

```text
apps/desktop/
  src/main/           Electron main：PG、Go sidecar、DB、settings、workspace、git、PTY、IPC
  src/preload/        contextBridge API
  src/renderer/       React UI
  src/agent-runtime/  独立 Node.js Agent Runtime
  resources/pg/       CI 注入的便携 PostgreSQL（git 忽略）
  resources/vexnar/   Go sidecar（git 忽略，由 backend:prepare 生成）
  scripts/            本地 PG 获取与平台 CI 脚本
  tests/              Vitest：contracts + agent-runtime
```

## 安全与限制

- 本地开发可不签名；macOS 稳定 tag 发布强制提供签名证书，公证与真实升级验收由发布环境完成。
- Renderer 不直接访问文件系统、Git 或 PTY。
- 未登录/未配置模型时，Agent Runtime 只返回本地工具巡检结果；模型请求必须经过 Go sidecar，不存在桌面端直连中转站的推理路径。
- 便携 PG 只监听 `127.0.0.1`，不对外暴露。
- `/api/desktop/*` 仅在设置 `VEXNAR_DESKTOP_TOKEN` 时启用，并只接受回环请求；普通服务端仍使用 JWT 鉴权。

## 设置与桌面更新

设置采用左侧分类导航、搜索与右侧详情的分栏弹窗。账户、常规、外观、工作区、模型、Agent 与并发、网络与搜索、数据与隐私、通知、快捷键、关于与更新各有独立页面。桌面偏好点「保存设置」保存；系统配置逐项保存，经原生 IPC 转交 Go 的 `/api/settings`，与 Web 控制台共用 PostgreSQL 数据。密钥只提交新值，后端仅返回是否已配置。

额度图标上方在发现更新时显示下载图标；悬停或键盘聚焦显示版本、发布日期与 GitHub Release 更新说明。启动后及每四小时检查稳定版，用户点击后下载，安装器校验下载内容，随后清理 Agent、终端、Go、数据库连接和 PostgreSQL，再安装并重启。仍有本地对话或后台任务时保留下载结果，提示稍后点击重启。检查/下载失败可重试；不自动降级、不安装预发行版、不在普通退出时偷偷安装。开发模式禁用安装。

发布到 `zhongxinxuhk/VEXNAR` 的稳定 `vX.Y.Z` tag 时，CI 把桌面版本同步到 tag，构建三个平台并汇总 `latest.yml`、`latest-mac.yml`、`latest-linux.yml`、安装包与 blockmap；仅三个平台全部完成后上传桌面更新资源。普通分支构建只保存 artifacts。Go 二进制更新入口不会用于替换 Electron 应用。

macOS 原生更新需要签名：tag 发布必须配置 GitHub Actions secrets `CSC_LINK` 和 `CSC_KEY_PASSWORD`（同一 Developer ID Application 身份签署新旧版本）。公证与 Gatekeeper 分发验收还需发布环境配置 Apple 凭据。未签名开发包能验证 UI、状态机、打包和后端边界，不能作为真实在线升级通过的证据。

验证命令：`npm run typecheck`、`npm test`、`npm run test:ui`、`npm run build`、`npm run smoke`。`test:ui` 在隔离 Electron 窗口中使用测试账户与 IPC fixture，检查设置提交、更新版本与说明悬浮提示并输出截图，不访问真实账户或安装更新。Smoke 使用隔离数据库目录，包含 Go settings 读写回归；线上升级还需两个已签名发行版、完整 Release assets，并在每个目标系统验证真实下载、安装和重启。当前 CI runner 不会替用户执行生产安装。

## 聊天布局、图片与访问模式

- 顶部窗口工具栏独立于导航栏和聊天列表，竖向分隔线从工具栏下面开始。聊天列表右边缘可拖动到 200–420 px，宽度保存在当前应用；双击恢复默认，聚焦分隔条后也可用方向键调整。顶部按钮可收起/展开列表。
- 输入框只有一层外框。「此计算机 / 工作区」是独立的上下文栏，可在加号菜单里显示/隐藏；环境菜单能打开本地终端，工作区菜单可选择文件夹、切换已有项目会话或新建无工作区会话。切换会话同步本地文件/Git 上下文，运行时发送以会话实际目录为准。
- 支持直接粘贴图片、拖入图片及加号菜单选图。PNG/JPEG/WebP/GIF，单张 4 MB、最多 6 张、合计 12 MB；发送前可移除。文本和图片草稿按聊天保留在内存中，发送成功才清空；应用关闭后未发送草稿不会恢复。已发送图片存于独立会话数据库 `messages.attachments` JSONB 列，经 Go 网关作为 `image_url` 消息转发。模型是否识图取决于所选提供方，拒绝请求时会显示服务错误。
- 访问菜单的三种模式由 Go `/api/desktop/preferences` 持久化。请求批准：每次模型发送前显示原生批准框，Go 网关也校验批准标记；帮我批准：当前普通模型请求和工作区内只读工具自动执行，工作区外读取询问批准；完全访问权限：当前工具的本地读取/模型请求不弹批准框。读取权限基于真实路径判断，符号链接越界也需要批准。此菜单针对当前运行时能力，不会凭空提供模型工具调用、文件写入或任意命令执行能力。
- 图片/消息不会写入日志或发布流水线。主进程验证实际图片解码与尺寸，渲染层仍拿不到上游凭据。开发验证使用隔离 fixture；正式模型识图结果需使用支持视觉的已配置模型另行验收。
