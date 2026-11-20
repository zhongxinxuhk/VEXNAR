<!--
Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
Repository: https://github.com/zhongxinxuhk/VEXNAR
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# VEXNAR React 官方网站

官网地址：https://zhongxinxuhk.github.io/VEXNAR/

React 负责全部页面与交互；Vite 构建客户端资源，再通过 ReactDOMServer 预渲染七个页面与 404。GitHub Pages 托管生成的静态产物，不需要 Node 服务器、Go API 或模型凭据。`index.html` 只是 React 入口模板，产品页面不再使用 Python 拼接 HTML。

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

## React 页面

- `src/App.jsx`：总览、下载、版本、分支、提交、合作者、开源致谢及站内导航。
- `src/Architecture.jsx`：架构选项卡、节点详情、边高亮、可暂停的设计导览与键盘导航。
- `src/architecture.js`：系统、缓存、工具调用、双图四套数据；每个节点链接固定公开源码版本与行号。
- `src/content.js`：路由、平台发行包识别、致谢筛选与链接边界。
- `src/style.css`：景深、光效、路径动画、滚动显现、过渡与响应式样式，支持减少动画偏好。
- `scripts/prerender.mjs`：从相同 React 组件生成可抓取的页面，再由浏览器 hydrate。
- `credits.json`：人工核对的项目来源、用途、作者、Logo 来源与许可证；第三方 Logo 及许可证副本在 `assets/credits/`。

旧地址 `downloads.html`、`credits.html` 等保持可直接访问。浏览器前进、后退和复制链接均受支持。导航使用真实链接，没有 JavaScript 时仍可跨页阅读。404 以 `/VEXNAR/` 为资源基准，避免未知嵌套路径下的资源失效。

## 架构内容边界

图示依据 `src/architecture.js` 指定的公开源码提交，不读取未发布开发提交。图中的导览是设计演示，不是实时任务、缓存命中率、性能测试或已完成的部署验收。

缓存图描述几种相互独立的机制：Provider 按配置 ID 与代际复用、MCP 目录持久化、旁路摘要按快照身份复用、探索摘要按内容版本签名复用、应用更新查询的 30 / 2 分钟 TTL。它不表示串行的多级缓存，也不宣称采用 Redis。

工具图中的审查范围和 allow / deny / ask 分支由配置决定。MCP Schema 延迟发现、Skill 解锁、工具装配、执行和证据写回分别注明来源。系统图不把桌面外壳视为独立模型运行时。

## GitHub Pages

工作流 `.github/workflows/website-pages.yml`：安装锁定依赖 → 准备公开元数据 → Vite 客户端与服务端构建 → React 静态预渲染 → 功能契约检查 → 部署。

官网文件变化、Release 发布/编辑/删除、手动触发和每六小时定时触发会重建。构建失败不发布不完整快照。资源文件名带内容指纹，避免新页面沿用旧脚本和样式。相对资源路径兼容 `/VEXNAR/` 项目站点。

## 检查覆盖

`npm run check` 检查旧链接、站点子路径与 404、Darwin / Windows 平台匹配、预发布排除、致谢组合筛选、架构引用完整性、静态预渲染内容、资源存在性及公开快照的字段边界。浏览器验收还需检查 hydration、架构切换、节点选择、播放暂停、搜索、移动导航、站内前进后退与减少动画偏好。
