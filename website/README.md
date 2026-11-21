<!--
Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
Repository: https://github.com/zhongxinxuhk/VEXNAR
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# VEXNAR React 官方网站

官网地址：https://zhongxinxuhk.github.io/VEXNAR/

React 负责全部页面与交互；`index.html` 只是 Vite 的入口模板，产品内容全部由 React 组件生成，再由 ReactDOMServer 预渲染九个页面与 404。GitHub Pages 托管生成的静态产物，不需要 Node 服务器、Go API 或模型凭据。

## 构建与验证

Node 22.12+（CI 使用 Node 24）、Python 3.9+。

```bash
npm ci --prefix website
python3 website/scripts/prepare_data.py
npm run build --prefix website
npm run check --prefix website
npm run preview --prefix website
```

首次启动开发服务器前也需要准备 GitHub 元数据：

```bash
python3 website/scripts/prepare_data.py
npm run dev --prefix website
```

元数据准备访问 GitHub 公开端点；可设置环境变量 `GITHUB_TOKEN` 避免匿名配额不足。输出只保留页面需要的公开字段，不保存凭据、提交邮箱或原始 API 响应。`.generated/`、`.ssr/`、`dist/`、`node_modules/` 均不跟踪。

## 页面

- `index.html`：Hero、可交互的 Agent 控制台、能力卡片、3D 架构、四套节点级架构图、上下文管理、项目入口。
- `console.html`：交互体验。完整复刻的控制台演示：21 个页面、会话列表、工具调用、审批、探索图、资产、流量、拦截规则与系统配置。
- `architecture.html`：架构剖析。六层 3D 剖面、层间契约、设计取舍、四套节点级架构图。
- `downloads.html`、`releases.html`、`branches.html`、`commits.html`：平台安装包、发行说明、分支与提交检索。
- `contributors.html`、`credits.html`：合作者与开源项目目录。

旧地址（`downloads.html`、`credits.html` 等）保持可直接访问。浏览器前进、后退和复制链接均受支持。导航使用真实链接，没有 JavaScript 时仍可跨页阅读。404 以 `/VEXNAR/` 为资源基准，避免未知嵌套路径下的资源失效。

## React 源码

- `src/App.jsx`：站点外壳、导航、路由切换、页脚与快捷搜索入口。
- `src/components/Home.jsx`：首页编排；`ConsolePage.jsx`、`ArchitecturePage.jsx` 是两个新页面。
- `src/console/Console.jsx`：控制台外壳（窗口、侧边栏、顶栏、命令面板、新建任务、Toast）。
- `src/console/Chat.jsx`：Agent 首页。会话列表、思考折叠、工具调用展开、审批分支、待办、Composer 与脚本化流式回复。
- `src/console/Dashboard.jsx`、`Work.jsx`、`Systems.jsx`：仪表盘、任务 / 发现 / 流量 / 资产 / 同步 / 工作空间，以及 LLM / Agent / MCP / Skill / 工具 / 通知 / 拦截 / 审批 / 日志 / 配置。
- `src/console/data.js`：演示数据集与脚本化会话；`nav.js` 与产品侧边栏一一对应。
- `src/architecture/Arch3D.jsx`：可拖拽旋转、展开、逐层剖析的 CSS 3D 分层视图；节点可直接跳转到源码行。
- `src/architecture/layers.js`：六层结构、30 个节点、层间契约、生命周期与设计取舍。
- `src/architecture.js`：系统、缓存、工具调用、双图四套节点级图与源码引用。
- `src/styles/`：`home.css`、`console.css`、`architecture.css` 分别承载站点版式、控制台与 3D 视图；`style.css` 保留项目数据页样式。
- `scripts/prerender.mjs`：从相同 React 组件生成可抓取的页面，再由浏览器 hydrate。

## 控制台演示的边界

演示完全在浏览器内运行：没有模型调用，没有工具执行，没有网络请求，也不写服务端状态。`acme.test` 等域名使用保留的 `.test` TLD。会话、审批、待办、筛选、策略开关与主题都属于页面内状态，刷新后回到初始快照。

## 架构内容边界

图示依据 `src/architecture.js` 与 `src/architecture/layers.js` 指定的公开源码提交，不读取未发布开发提交。3D 视图与导览是结构示意，不是实时任务、缓存命中率、性能测试或已完成的部署验收。

缓存图描述几种相互独立的机制：Provider 按配置 ID 与代际复用、MCP 目录持久化、旁路摘要按快照身份复用、探索摘要按内容版本签名复用、应用更新查询的 30 / 2 分钟 TTL。它不表示串行的多级缓存，也不宣称采用 Redis。

工具图中的审查范围和 allow / deny / ask 分支由配置决定。MCP Schema 延迟发现、Skill 解锁、工具装配、执行和证据写回分别注明来源。系统图不把桌面外壳视为独立模型运行时。

## GitHub Pages

工作流 `.github/workflows/website-pages.yml`：安装锁定依赖 → 准备公开元数据 → Vite 客户端与服务端构建 → React 静态预渲染 → 功能契约检查 → 部署。

官网文件变化、Release 发布/编辑/删除、手动触发和每六小时定时触发会重建。构建失败不发布不完整快照。资源文件名带内容指纹，避免新页面沿用旧脚本和样式。相对资源路径兼容 `/VEXNAR/` 项目站点。

## 检查覆盖

`npm run check` 检查旧链接、站点子路径与 404、Darwin / Windows 平台匹配、预发布排除、致谢组合筛选、四套节点级图与六层 3D 数据的源码引用完整性、控制台演示数据（工具、审批、图的边）与文案标记、静态预渲染内容、资源存在性及公开快照的字段边界。

浏览器验收还需检查：hydration 无警告、3D 拖拽与键盘旋转、逐层剖析、生命周期定位、控制台 21 个页面切换、工具卡片展开、审批同意/拒绝与角标联动、新建对话的空状态与脚本化回复、⌘J 命令面板、深色外观、移动端抽屉导航与横向溢出。

## 数据与许可

页面展示的版本、分支、提交与贡献者来自公开 GitHub 仓库；第三方 Logo 与许可证副本在 `assets/credits/`，来源核对见 `credits.json`。项目自有代码采用 AGPL-3.0-or-later。
