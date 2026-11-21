<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# 内置插件：Craft Anything 与插件商店

两套能力都装在**本仓库自己的 dsh home**（`app/.dsh-home`），与用户安装版隔离。

## Craft Anything（MCP）

Craft Anything 是 Rust 引擎 + CLI + MCP server，按 MCP server 内置进 profile：

```yaml
# app/vexnar/cordis.patch.yml → mcp-manager.servers.craft
craft:
  transport: stdio
  command: ${CRAFT_ANYTHING_CLI:-~/.dsh/plugins-data/craft-anything/craft-anything-cli}
  args: [mcp]
```

- 默认只暴露 **Essentials + 已启用 toolset**，不是全部 320 个工具；
- 启动器（`dsh-web.mjs` / `dsh-desktop.mjs`）注入 `CRAFT_ANYTHING_CLI`；
- 侧栏 **Craft** 页展示版本、路径与 MCP 工具清单（`GET /api/craft/status`）；
- 二进制在 `~/.dsh/plugins-data/craft-anything/`，不进仓库。

更新：

```sh
pnpm run craft:check     # 当前/最新版本
pnpm run craft:update    # 下载最新 release，校验 SHA256 后原子替换
```

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
