<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# 内置插件：Craft Anything 与插件商店

两套能力都装在**本仓库自己的 dsh home**（`app/.dsh-home`），与用户安装版隔离。

## Craft Anything（来自插件商店）

不再自建插件：直接安装商店里的 `dsh-craft-anything@0.6.1`（MIT，Fanqi89）：

```sh
dsh plugin --profile web add dsh-craft-anything@0.6.1
```

它自带：

- MCP 桥：`mcp__craft__*`（默认 Essentials 30 个工具，可用 `list_toolsets` 按需加载）；
- 左侧栏 **Craft Anything** 状态页；
- **净室 / 深度模式**切换（dsh 输入栏左下角）；
- `craft_status` / `craft_cli` / `craft_install` 与页面「检查更新」——从 GitHub Releases
  下载并校验 SHA256，更新后重启 MCP 桥；
- 中英文界面、环境依赖检查与一键补齐。

CLI 由插件管理在 `~/.dsh/plugins-data/craft-anything/`，不再需要仓库内的 `craft:update` 脚本。

## dsh-plugin-shop（插件商店）

已装进 web profile：

```sh
dsh plugin --profile web add dsh-plugin-shop@0.9.4
```

- 侧栏出现 **Plugin shop**；
- 商店自身支持检查更新并自更新；
- 也可以用脚本：

```sh
pnpm run shop:check
pnpm run shop:update
```

**注意**：新增 bundle 需要重启 dsh 才生效；启用/禁用已安装插件是热生效。

## 首次同步

`app/vexnar/cordis.patch.yml` 是唯一真源，`pnpm run setup` 会把它复制到
`app/.dsh-home/profiles/web/cordis.patch.yml`。改完 patch 后要重新 setup（或复制）并重启 dsh。
