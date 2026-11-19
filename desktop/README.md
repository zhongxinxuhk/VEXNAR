# VEXNAR Desktop

Tauri v2 外壳，把 Go 后端、Web 控制台和便携 PostgreSQL 包成一个桌面应用。业务逻辑仍然全部在 `vexnar` 里，这一层负责：

1. 选空闲回环端口，必要时首次 `initdb` 并启动内置 PostgreSQL；
2. 拉起 Go sidecar，把 `VEXNAR_PG_DSN`、数据目录和密钥目录传给它；
3. 轮询 `GET /api/health`，通过后把窗口导航到本地服务；
4. 应用退出（含 SIGINT/SIGTERM）时先停 sidecar，再停 PostgreSQL。

## 目录

```
desktop/
  src/main.rs          # Tauri 入口：启动画面 → 健康检查 → 导航
  src/supervisor.rs    # sidecar 解析、端口、健康探针、信号与退出清理
  src/pg.rs            # 便携 PG：initdb、启动、建库、DSN、停止
  resources/pg/        # 构建产物（gitignored，只有 .keep 入库）
  ui/index.html        # 启动/失败画面
  scripts/prepare-sidecar.sh
  scripts/fetch-pg.sh
  tests/fake-sidecar.py
  tauri.conf.json
```

## 准备内置 PostgreSQL

macOS arm64 的精简 PG 由 CI 或本地脚本构建：

```bash
# 本地构建（约 1–2 分钟，产物 dist/pg-darwin-arm64.tar.gz）
bash scripts/ci/build-pg-macos.sh
# 安装到 desktop/resources/pg
bash desktop/scripts/fetch-pg.sh
```

CI 在 `.github/workflows/pg-macos.yml` 里跑同一脚本，上传 `pg-darwin-arm64` artifact。下载后同样用 `fetch-pg.sh <tarball>` 安装。

没有 `resources/pg` 时，应用回退到 `VEXNAR_PG_DSN` 或 `config.json`。

## 开发运行

```bash
cd desktop
npm install
npm run dev
```

首次运行会先构建静态前端（`web` → `server/webui/dist`），再以 `-tags embedui` 编译 Go sidecar，最后启动 Tauri。`scripts/dev.sh` 会**同步**完成这些步骤再启动 Tauri，避免 Tauri 的 `beforeDevCommand` 与 cargo 并发时用到旧 sidecar。前端和 Go 有改动时需要重新构建；只改 Rust 时可以用：

```bash
SKIP_WEB=1 npm run dev
```

不要直接运行 `npx tauri dev`：它不会先构建 sidecar。统一用 `npm run dev`。

### 在 GoLand 中启动

本机 GoLand 的 Run/Debug 下拉框里已添加两个 npm 配置（`.idea/runConfigurations/`）：

- `VEXNAR Desktop`：完整构建静态前端 + sidecar，再打开 Tauri 窗口。
- `VEXNAR Desktop (fast)`：设置 `SKIP_WEB=1`，复用已有的 `server/webui/dist`，只重编 sidecar 和 Rust。

选好后点 Run 即可；Tauri 窗口会自行拉起 sidecar 和内置 PostgreSQL。GoLand 的 Debug 按钮只能调试 npm/Node 启动器，Rust 外壳和 Go sidecar 需要分别用 cargo/dlv 调试。`.idea/` 被 git 忽略，这两个配置是本机 IDE 配置，换机器后需要重新添加。

调试构建会自动把 `VEXNAR_CONFIG` 指向仓库根目录的 `config.json`；只有找不到内置 PG 时才会用到它。

## 首次启动与运行时目录

| 平台 | 默认位置 |
| --- | --- |
| macOS | `~/Library/Application Support/com.vexnar.desktop/` |
| Windows | `%APPDATA%\com.vexnar.desktop\` |
| Linux | `~/.local/share/com.vexnar.desktop/` |

目录内：

- `data/`：SQLite 数据目录（传给 `vexnar -data`）
- `pgdata/`：内置 PostgreSQL 数据目录
- `pgpassword`：自动生成的 PG 密码（`0600`）
- `logs/sidecar.log`：sidecar 的 stdout/stderr
- `logs/postgres.log`：PostgreSQL 日志
- `jwt.key`：会话签名密钥（传给 `vexnar -keydir`，刻意不放进可浏览的 `data/`）

首次启动流程：`initdb`（用户 `vexnar`，host 认证 SCRAM-SHA-256）→ 随机端口启动 `postgres`（只监听 `127.0.0.1`）→ 创建 `vexnar` 数据库 → 生成 DSN → 注入 sidecar。密码和 DSN 不会写进日志。

上次异常退出留下的 `postmaster.pid` 会在下次启动时先清理；SIGINT/SIGTERM 也会走正常停止流程。

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `VEXNAR_SIDECAR` | 指定 sidecar 可执行文件，优先于自动查找 |
| `VEXNAR_HOME` | 覆盖应用数据目录 |
| `VEXNAR_CONFIG` | 指定 Go 的 `config.json`（调试构建默认指向仓库根） |
| `VEXNAR_PG_DSN` | 直接用外部 PostgreSQL，跳过内置 PG |
| `VEXNAR_PG_BIN` | 指定 PG 的 `bin` 目录（开发/测试） |
| `VEXNAR_PG_DISABLE=1` | 禁用内置 PG，回退到 `config.json` |
| `VEXNAR_DESKTOP_SMOKE=1` | 无界面冒烟：启动 PG/sidecar、等健康检查、退出 |

## 验证

```bash
cargo test

# 有内置 PG 时：完整链路（PG → sidecar → /api/health）
VEXNAR_DESKTOP_SMOKE=1 cargo run

# 没有 PG 时：用桩 sidecar 验证端口/进程管理
VEXNAR_PG_DISABLE=1 VEXNAR_DESKTOP_SMOKE=1 \
  VEXNAR_SIDECAR="$PWD/tests/fake-sidecar.py" cargo run
```

`fake-sidecar.py` 只实现 `/api/health`，用来在没有数据库时验证端口选择、进程拉起和清理。

## 打包

```bash
SKIP_WEB=1 npx tauri build --debug --bundles app
```

产物在 `desktop/target/debug/bundle/macos/VEXNAR.app`，约 80 MB（含 18 MB PG）。`tauri build` 的 `beforeBuildCommand` 默认会重新构建前端；`SKIP_WEB=1` 可复用已有的 `server/webui/dist`。

## 当前限制

- 未做代码签名/公证，macOS 上首次打开会被 Gatekeeper 拦截。
- 未做单实例；重复启动会争用同一个 `pgdata`（后启动的实例会停掉前一个的 PG）。
- PG 大版本升级还没有迁移流程；换 PG major 前需要 `pg_dump`/`pg_restore`。
- 未做崩溃重启；SIGKILL 留下的 PG 会在下次启动时清理。
- Agent 界面的 Affect UI 接入尚未开始（见 `docs/客户端化与插件商城方案.md` §5.5）。
