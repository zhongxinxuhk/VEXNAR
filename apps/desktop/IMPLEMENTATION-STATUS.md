<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# 实施与验收状态

核对日期为 2026-11-21。以下状态以当前分支可验证的行为为准。

| 范围 | 状态 | 验收依据 |
| --- | --- | --- |
| 桌面 Chat View | 已完成会话记录子范围 | 历史分页、增量追赶、重开流式回复、原始推理正文隐藏 |
| 只读工具记录 | 已完成 | 状态筛选、25 条每页、按事件序号排序、结果关联和跨页聚焦 |
| 会话活动持久化 | 已完成会话子范围 | Go 会话 API 与 PostgreSQL 17 的 5 项集成测试 |
| 桌面回归 | 已完成当前子范围 | 类型检查、108 项测试和 Electron 固定数据回归，覆盖 120 次调用与 239 条事件 |
| 独立 Execution Detail、Agent Workspace、统一事件存储与检查点 | 未交付 | 当前可用界面是会话内只读工具记录 |
| 独立运行时、调度器、路由、上下文与记忆、执行器和治理 | 未交付 | 现有系统的基础能力不计为本轮交付 |
| 200 Agent／500 活动任务 | 未验收 | 工具记录样本量与调度容量指标口径不同 |
| 三平台安装包、便携 PostgreSQL、安装验收、自动补丁版本与 Releases | 未交付 | 无本轮通过验收的安装包或正式发行 |

会话回放与详情见 `47ea04e0`，状态筛选和时间线见 `9fdcd2ef`，跨页定位见 `124ec8d6`。

## 自动化验收

`conversation-qa.yml` 在 GitHub 的 Windows x64、Linux x64 和 macOS arm64 运行器定义桌面类型检查和单元测试。macOS 额外执行固定数据 Electron 回归，Linux 另用 PostgreSQL 17 服务执行会话测试，官网执行构建和内容契约测试。当前已验证本地测试与工作流静态检查，GitHub 托管三平台运行尚未验收。
