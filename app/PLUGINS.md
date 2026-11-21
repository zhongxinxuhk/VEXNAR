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
