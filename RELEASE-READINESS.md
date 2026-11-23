<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# VEXNAR v0.0.1 发布就绪检查

检查日期为 2026-11-23，基线为本地 `main` 的 `44cdd17db`。

远端已有 `v0.0.1` 标签，指向 `61798fc`。GitHub 页面列出两项资源，本次未核实有独立安装包。当前主线比该标签多 603 个提交，本文验收的是这批主线变更。下一次发布需确定新版本和本次交付的产物范围。[GitHub v0.0.1](https://github.com/zhongxinxuhk/VEXNAR/releases/tag/v0.0.1)

## 已进入主线的能力

- dsh 默认使用内嵌 TypeScript core 和客户端 SQLite。Go 服务和原 Web 控制台仍可单独部署，dsh 可显式使用 Go 数据 API。
- dsh 的设置页管理模型目录及参数，账号插件在 dsh 进程内安装模型调用函数。旧迁移文档中的桌面网关说明已过时。
- 已合入 PostgreSQL 历史数据导入、旧 profile 插件保留、设置与通知配置写入修复，以及 Yak 历史只读接口。
- 任务、发现、资产、流量、审批和报告已有代码与部分回归覆盖。当前候选构建仍需验证用户能否完成对应的操作。

源码线索见 [App 说明](app/README.md)、[迁移执行清单](app/MIGRATION-EXEC.md)和[更新日志](CHANGELOG.md)。

## 发布前待完成事项

| 优先级 | 事项 | 当前证据与完成条件 |
| --- | --- | --- |
| P0 | 版本及交付范围 | 交付范围只有客户端：macOS arm64 的 dmg、Windows x64 的 exe，外加 VEXNAR 插件 / profile 包。安装包内置覆盖层（四个插件 + 装好全部预置插件的 profile），装完即用。版本从 `app-v0.0.1` 起由 [App CI](.github/workflows/app-build.yml) 自动延续，打包成功即发版。Go 服务、多平台二进制与 Docker 镜像不再发布。 |
| P0 | App CI 和归档 | [App CI](.github/workflows/app-build.yml) 已改为 pnpm 冻结安装、全量重建四个插件包、`check-built-artifacts.mjs` 逐个校验产物，并在 checkout 后先跑数据守卫。桌面任务把 `vexnar-desktop-overlay` 解到 `app/.desktop-overlay` 后由 `brand-desktop.mjs` 写进 `extraResources`，打包完成后自动建 Release 并附 `SHA256SUMS`。 |
| P0 | 登录及客户端路径 | 用注明 dsh 版本和 Git 提交的构建，验证新 profile、旧 profile 与重启。通过客户端验证登录、设置、历史任务、流量记录及报告读取，记录数据实际来自内嵌 TS core 或显式 Go 服务。 |
| P0 | 数据升级与恢复 | 用脱敏数据核对 PostgreSQL 导入前后的任务、资产、发现与历史流量，抽查代表性记录、校验和重启后读取，验证原库与备份可用。 |
| P1 | 错误和状态展示 | 验证登录过期、模型配置错误、通知配置写入失败和后端不可用时的页面反馈，以及审批和审计记录读取。 |
| P1 | 用户文档 | 更新 App 启动、存储、进程内模型和 Go 回退说明，为交付范围内的安装方法补齐迁移与恢复步骤。 |

自主渗透执行和漏洞复现未纳入本次验证。当前主线仍处于发布候选准备阶段。

## 本轮验证记录

- 在独立 worktree 中使用 Node 24.15.0、pnpm 12.21.0，冻结安装及 App 四个包的类型检查通过。
- 旧 profile 单测 9 项通过。SQLite 历史数据投影单测通过，覆盖本地行优先和历史行留档。
- Go 1.26.3 下自更新包测试通过，报告包编译通过。通过命令级 `GOSUMDB=sum.golang.org` 恢复工具链校验，未改动全局设置。
- 已修复旧 profile 的清单解析。回归测试先复现了字段类型错误导致迁移抛错，再验证异常清单被跳过、正常 profile 仍可迁移。
- 使用本次源码构建的 dsh `0.2.2-rc.5` 插件和隔离 profile，验证 setup 成功、启动链接返回 HTTP 200、账号就绪接口返回 `ready: false`、未登录的领域 API 返回 HTTP 401。此次请求走 dsh，配置为内嵌 TS 模式且禁用 Go 服务。
- 已登录的客户端会话、SQLite 端到端读取、远端 CI、安装包与部署仍待验证。
