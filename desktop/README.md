# VEXNAR Desktop

Tauri v2 外壳，把 Go 后端和 Web 控制台包成一个桌面应用。业务逻辑仍然全部在 `vexnar` 里，这一层只负责：

1. 选一个空闲的回环端口；
2. 拉起 Go sidecar，并把数据目录指到系统应用数据目录；
3. 轮询 `GET /api/health`，通过后把窗口导航到本地服务；
4. 应用退出时终止 sidecar（SIGTERM，5 秒后退强杀）。

## 目录

```
desktop/
  src/main.rs          # Tauri 入口：启动画面 → 健康检查 → 导航
  src/supervisor.rs    # sidecar 解析、端口、健康探针、退出清理
  ui/index.html        # 启动/失败画面
  scripts/prepare-sidecar.sh
  tests/fake-sidecar.py
  tauri.conf.json
```

## 开发运行

```bash
cd desktop
npm install
npm run dev
```

首次运行会先构建静态前端（`web` → `server/webui/dist`），再以 `-tags embedui` 编译 Go sidecar，最后启动 Tauri。前端和 Go 有改动时需要重新构建；只改 Rust 时可以用：

```bash
SKIP_WEB=1 npm run dev
```

调试构建会自动把 `VEXNAR_CONFIG` 指向仓库根目录的 `config.json`，所以本地开发直接复用现有 PostgreSQL 配置。

## 运行时目录

| 平台 | 默认位置 |
| --- | --- |
| macOS | `~/Library/Application Support/com.vexnar.desktop/` |
| Windows | `%APPDATA%\com.vexnar.desktop\` |
| Linux | `~/.local/share/com.vexnar.desktop/` |

目录内：

- `data/`：SQLite 数据目录（传给 `vexnar -data`）
- `logs/sidecar.log`：sidecar 的 stdout/stderr
- `jwt.key`：会话签名密钥（传给 `vexnar -keydir`，刻意不放进可浏览的 `data/`）

可以用 `VEXNAR_HOME` 覆盖整个运行时目录。

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `VEXNAR_SIDECAR` | 指定 sidecar 可执行文件，优先于自动查找 |
| `VEXNAR_HOME` | 覆盖应用数据目录 |
| `VEXNAR_CONFIG` | 指定 Go 的 `config.json`（调试构建默认指向仓库根） |
| `VEXNAR_PG_DSN` | 直接给 sidecar 一个 PostgreSQL DSN |
| `VEXNAR_DESKTOP_SMOKE=1` | 无界面冒烟：启动 sidecar、等健康检查、退出 |

## 验证

```bash
cargo test
VEXNAR_DESKTOP_SMOKE=1 VEXNAR_SIDECAR="$PWD/tests/fake-sidecar.py" cargo run
```

`fake-sidecar.py` 只实现 `/api/health`，用来在没有数据库时验证端口选择、进程拉起和清理。真实 Go sidecar 需要可用的 PostgreSQL：当前版本还没有内置便携 PG，需要 `VEXNAR_PG_DSN` 或 `config.json`。

## 打包

```bash
SKIP_WEB=1 npx tauri build --debug --bundles app
```

产物在 `desktop/target/debug/bundle/macos/VEXNAR.app`。`tauri build` 的 `beforeBuildCommand` 默认会重新构建前端；`SKIP_WEB=1` 可复用已有的 `server/webui/dist`。

## 当前限制

- 未内置 PostgreSQL：便携 PG、`initdb` 与首次启动迁移是下一阶段。
- 未做代码签名/公证，macOS 上首次打开会被 Gatekeeper 拦截。
- 未做单实例与崩溃重启；重复启动会各自拉起一个 sidecar。
- Agent 界面的 Affect UI 接入尚未开始（见 `docs/客户端化与插件商城方案.md` §5.5）。
