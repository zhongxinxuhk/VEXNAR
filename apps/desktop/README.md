# VEXNAR Desktop (Electron)

独立的桌面 Agent 客户端。它与 `web/`、Go 后端以及旧的 Tauri `desktop/` 互不依赖，可以单独迭代桌面端的会话、工作区、终端和 Diff 体验。

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
  ┌─────┴──────────────────┐
  │                        │
Portable PostgreSQL     Agent Runtime (separate Node process)
  pgdata in userData       JSON IPC · tools · LLM SSE
```

- Renderer 不具备 Node 权限；`contextIsolation: true`、`nodeIntegration: false`。
- 所有文件/Git 路径都经过 `ensureInside()` 限制在当前工作区内。
- API Key 使用 Electron `safeStorage` 加密后写入本地 PG。
- Agent Runtime 通过 `child_process.fork` 启动，UI 重载不会中断工具执行。

## 便携 PostgreSQL

桌面端**始终使用 PostgreSQL**。SQLite 仅作为历史实现被移除，不提供回退。

首次启动：

1. 从打包资源 `resources/pg`（安装后为 `process.resourcesPath/pg`）找到 `initdb`。
2. 在 `app.getPath('userData')/pgdata` 初始化本地集群。
3. 生成 `userData/pgpassword`（0600）并使用 `scram-sha-256`。
4. 在随机 loopback 端口启动 `postgres`，创建 `vexnar` 数据库。
5. 退出时执行 `pg_ctl -m fast stop`，并清理子进程。

日志：`userData/logs/postgres.log`。

开发时可以覆盖：

```bash
# 使用已有 PG（不会启动内置实例）
VEXNAR_PG_DSN='postgres://user:pass@127.0.0.1:5432/vexnar?sslmode=disable' npm run dev

# 指向本地构建/解压的便携 PG bin 目录
VEXNAR_PG_BIN="$PWD/../../.pg-build/pg-16.16/bin" npm run dev
```

`npm run smoke` 会依次验证 PG、PTY、Agent Runtime。

## 开发命令

```bash
cd apps/desktop
npm install
npm run dev          # Electron + Vite
npm run typecheck
npm run test
npm run build
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
  src/main/           Electron main：PG、DB、settings、workspace、git、PTY、IPC
  src/preload/        contextBridge API
  src/renderer/       React UI
  src/agent-runtime/  独立 Node.js Agent Runtime
  resources/pg/       CI 注入的便携 PostgreSQL（git 忽略）
  scripts/            本地 PG 获取与平台 CI 脚本
  tests/              Vitest：contracts + agent-runtime
```

## 安全与限制

- 不签名/不公证（`identity: null`）；分发前由发布方自行处理。
- Renderer 不直接访问文件系统、Git 或 PTY。
- 当前 Agent Runtime 在未配置 `baseUrl` + API Key 时使用本地工具巡检回退；配置后走 OpenAI-compatible `/chat/completions` SSE。
- 便携 PG 只监听 `127.0.0.1`，不对外暴露。
