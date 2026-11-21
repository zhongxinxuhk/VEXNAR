<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# DSH 桌面对话工作区适配

## 源码核对

参考本地 DeepSeek Harness 0.2.2-rc.3 的 MIT 源码。DSH 利用 React 和 Cordis 组合视图，由会话控制器提供行与工作区数据。VEXNAR 使用 Electron、React、Zustand 和现有 Go 会话接口。改造适配布局与交互，保留现有业务实现。

| DSH 源码 | 适配到 VEXNAR 的行为 |
| --- | --- |
| `packages/client/ui-conversation/src/client/skeleton/ConversationRoot.module.css`、`InputBar.module.css` | 正文与输入卡共享响应式宽度，空会话让欢迎内容和输入卡在同一工作区居中。 |
| `packages/client/ui-chat/src/client/chat/ChatView.tsx`、`ChatView.module.css`、`use-chat-scroll.ts`、`TurnNavigator.tsx` | 会话标题和视图切换各有区域，历史向前加载保持原阅读位置，并能跳到已加载的用户回合。使用已保存事件的有序时间线。 |
| `packages/client/ui-chat/src/client/chat/MessageItem.module.css` | 用户消息右对齐，限制气泡宽度，消息内容和操作使用清晰的间距。 |
| `packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.tsx`、`Rows.tsx` | 工作区有分组行与分组动作，每组折叠、逐步展开。会话行独立承载时间、状态和操作。 |
| `packages/client/ui-workspace/src/client/rows/WorkspaceDialogs.tsx` | 会话改名和删除使用明确的对话框、提交状态和错误反馈。 |

## 适配约束

会话操作复用现有 Go 接口，首条消息的自动命名由 Go 完成。未发送草稿和历史空会话沿用现有处理。项目注册及归属保持后端数据，工作区菜单仅展示已有能力。当前 Go 项目接口缺少项目重命名、删除，本次按方案保留接口与数据库结构，因此不提供这些操作。全局导航、其它页面、运行时、工具、模型和权限保持原业务流程。

## 验收结果

在实际项目工作树完成桌面类型检查、123 项单元测试、生产前端构建，以及使用本机 Electron 的隔离界面验收。界面覆盖首发命名、二轮定位、重命名、取消和确认删除、空项目、草稿隔离、工具记录、会话审批显示、模型选择、输入交互、窗口缩放和明暗主题。Electron 夹具使用临时用户目录和模拟接口，未接入业务数据库。
