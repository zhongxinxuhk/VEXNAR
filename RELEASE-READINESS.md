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
| P0 | 版本及交付范围 | 保留原 `v0.0.1` 标签，明确下一候选版本涵盖 Go 服务、dsh Web、桌面安装包中的哪些产物。历史桌面客户端已移除，仓库仍有基于 dsh 的桌面启动器及独立 App 流水线。 |
| P0 | App CI 和归档 | [App CI](.github/workflows/app-build.yml)仍引用已移除的 npm 锁文件，并执行 `npm ci`。需验证冻结安装、归档完整性和解包安装，再验证交付范围内的平台。 |
| P0 | 登录及客户端路径 | 用注明 dsh 版本和 Git 提交的构建，验证新 profile、旧 profile 与重启。通过客户端验证登录、设置、历史任务、流量记录及报告读取，记录数据实际来自内嵌 TS core 或显式 Go 服务。 |
| P0 | 数据升级与恢复 | 用脱敏数据核对 PostgreSQL 导入前后的任务、资产、发现与历史流量，抽查代表性记录、校验和重启后读取，验证原库与备份可用。 |
| P0 | Go 服务交付 | [Go Release CI](.github/workflows/release.yml)定义前端导出、五平台二进制、校验文件和多架构镜像。用当前候选验证承诺的产物，再以隔离数据库验证首次管理员设置、登录、健康检查和重启。 |
| P1 | 错误和状态展示 | 验证登录过期、模型配置错误、通知配置写入失败和后端不可用时的页面反馈，以及审批和审计记录读取。 |
| P1 | 用户文档 | 更新 App 启动、存储、进程内模型和 Go 回退说明，为交付范围内的安装方法补齐迁移与恢复步骤。 |

自主渗透执行和漏洞复现未纳入本次验证。当前主线仍处于发布候选准备阶段。

## 本轮验证记录

- 在独立 worktree 中使用 Node 24.15.0、pnpm 12.21.0，冻结安装及 App 四个包的类型检查通过。
- 旧 profile 单测 8 项通过。SQLite 历史数据投影单测通过，覆盖本地行优先和历史行留档。
- Go 1.26.3 下自更新包测试通过，报告包编译通过。通过命令级 `GOSUMDB=sum.golang.org` 恢复工具链校验，未改动全局设置。
- 旧 profile 读取器对 JSON 结果做了类型断言。合法 JSON 若包含对象类型的 `dsh.profile.bundles`，迁移计划会抛错并中断 setup，需补回归验收。
- 本轮未验证实际客户端会话、远端 CI、安装包与部署。
