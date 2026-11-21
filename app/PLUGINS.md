<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# 内置插件：Craft Anything 与插件商店

插件装在 VEXNAR 的独立配置 `app/.vexnar-home/profiles/vexnar`。

## Craft Anything（来自插件商店）

在 VEXNAR 的插件面板安装 `dsh-craft-anything@0.6.1`（MIT，Fanqi89）。

它自带：

- MCP 桥：`mcp__craft__*`（默认 Essentials 30 个工具，可用 `list_toolsets` 按需加载）；
- 左侧栏 **Craft Anything** 状态页；
- **净室 / 深度模式**切换（dsh 输入栏左下角）；
- `craft_status` / `craft_cli` / `craft_install` 与页面「检查更新」——从 GitHub Releases
  下载并校验 SHA256，更新后重启 MCP 桥；
- 中英文界面、环境依赖检查与一键补齐。

VEXNAR 使用自己数据目录下的 `plugins-data/craft-anything/`。

## dsh-plugin-shop（插件商店）

用 `pnpm run shop:update` 安装到 VEXNAR 配置。

- 侧栏出现 **Plugin shop**；
- 商店自身支持检查更新并自更新；
- 也可以用脚本：

```sh
pnpm run shop:check
pnpm run shop:update
```

**注意**：新增 bundle 需要重启 VEXNAR 才生效；启用/禁用已安装插件是热生效。

## 首次同步

`app/vexnar/cordis.patch.yml` 是 VEXNAR bundle 的配置。修改后重新执行
`pnpm run setup` 并重启 VEXNAR，用户配置继续保存在自己的 profile 内。

## 换数据目录时，已装插件会一起搬过来

VEXNAR 的数据目录换过名（`app/.dsh-home` → `app/.vexnar-home`）。新目录里的
profile 由出厂模板生成，模板不认识商店装的 bundle，于是商店、Craft Anything
和从「发现」页装的实验性插件看着像被删了——其实它们还在旧目录里。

`pnpm run setup` 现在会读旧目录的 profile，把**旧配置里列过、但新配置没有**
的 bundle 装回来（`app/scripts/profile-migration.ts`）：

- 有 npm 依赖的（`dsh-plugin-shop`、`dsh-craft-anything`、`dsh-subagent-codex`
  之类）重新 `dsh plugin add`，版本按旧配置的写法；
- 运行时自带的（`@deepseek-ai/dsh-experimental-*`、`@deepseek-ai/dsh-cua-bundle`）
  只补回插件层条目，不重复安装；
- `file:` / `link:` / `workspace:` 指向某次 checkout 的一律不搬，避免搬进一个
  已经不存在的路径。

开关：

```sh
VEXNAR_LEGACY_HOME=/path/to/old/home pnpm run setup   # 额外的旧目录
VEXNAR_MIGRATE_PROFILE=off pnpm run setup              # 关掉迁移
```

反向的规则同样成立：profile 一旦写好就只做补丁，`pnpm run setup` 只重排
bundle 顺序、不删用户装过的 bundle，所以重复执行不会再把插件抹掉。

