<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# vexnar-mcp — 把 VEXNAR 的工具面挂到 dsh 的 MCP 管理面上

dsh 里没有"工具配置"和"MCP 配置"两套东西：**每一样能力都是一个 Cordis 插件行**。
工具行（`dsh-tool-*`）是插件，MCP 也是插件 —— 分两层：

| 层 | 插件 | 作用 |
|---|---|---|
| 单个 MCP 服务器 | `@deepseek-ai/dsh-mcp-client` | 一个实例一个服务器，工具注册成 `mcp__<serverName>__<tool>` |
| MCP 舰队（管理面） | `@deepseek-ai/dsh-mcp-manager` | 全 Host 一套服务器清单，按 `config.servers` 和插件注册增删、启停、重连、探活 |

本包用的是**插件注册**这条路（`ctx.mcpManager.register()`），不是往 patch 里手写
`dsh-mcp-client` 行，也不是在 VEXNAR 里再维护一份 MCP 清单：

- VEXNAR 服务作为 `vexnar` 出现在 mcp-manager 的同一份舰队清单里；
- 工具名 `mcp__vexnar__list_tasks`、`mcp__vexnar__report_finding` 等；
- 关掉/卸载本插件，服务器与它的工具一起撤下，不留残行。

## 1. 安装

```bash
# 在 dsh 里用 plugin_manager 安装本目录（绝对路径），或 设置 → 插件 → 添加插件
```

安装后 `package.json` 的 `dsh.profile.bundles` 里会多出 `@vexnar/dsh-vexnar-mcp`，
插件行为 `vexnar-mcp`。

## 2. 配置项（`cordis.patch.yml` 的 `config`）

| 字段 | 默认 | 说明 |
|---|---|---|
| `serverName` | `vexnar` | 工具命名空间，`mcp__vexnar__*` |
| `url` | `http://127.0.0.1:8787/mcp` | Go 服务的 MCP 端点（只接受 loopback） |
| `tokenFile` | `""` | token 文件，默认指向本仓库 `data/mcp.token` |
| `tokenEnv` | `VEXNAR_MCP_TOKEN` | 环境变量优先于 token 文件 |
| `startupTimeoutMs` | `20000` | 首次连接 + 工具发现的预算 |
| `toolCallTimeoutMs` | `60000` | 单次工具调用预算 |

token 在 apply 时读一次，作为请求头交给 mcp-manager，不落进 patch、不落进会话记录。
Go 服务重启换 token 后，`restart` 该服务器或重启 Host 即生效。

## 3. 与 `app/vexnar/` 的关系

- `app/vexnar/` 是 VEXNAR **自有 profile** 的整套 app bundle（品牌、账号、六个 agent preset），
  它直接用 `mcp-manager` 的 `config.servers` 写死 `vexnar` 一项。
- 本包是**只做 MCP 对接**的独立 bundle，可装进任何 dsh profile（例如 Desktop 的 `desktop`
  profile），与 VEXNAR profile 的部署互不覆盖：一个走 Settings 配置层，一个走插件注册层，
  两者都汇入同一个 mcp-manager 舰队，重名会在注册时被拒绝，不会出现两套服务器。

## 4. desktop profile 的收敛（2026-11-21）

本机 `~/.dsh/profiles/desktop/cordis.patch.yml` 里原本是 5 条 cc-switch 手写的
`@deepseek-ai/dsh-mcp-client` 行（`Clionmcp` / `MCP_DOCKER` / `ideamcp` / `node_repl` /
`rustrovermcp`），它们绕过管理面：不在舰队清单里、Settings 停不了、状态拿不到。现已
改成**一条** `mcp-manager` 行 + `config.servers` 五项（键即 `serverName`，工具名不变），
和本包的 `vexnar` 注册项一起落进同一份舰队。

要留意的两点：

- cc-switch 是外部写手，它再跑一次可能把这些 `cc-switch-mcp-*` 行加回来；加回来就是
  重名服务器（Manager 会拒绝注册同名项，不会出现两套工具）。收敛后建议让 cc-switch
  只管模型侧，MCP 侧交给 Settings 或这份 patch。
- `mcp-manager` 的 `config.servers` 是整份替换：手工加服务器要一次写全，日常增删用
  Settings 更安全。

## 5. 边界

- 不在客户端维护第二套模型目录、任务库或漏洞库：工具的真相在 Go 服务。
- `VEXNAR_MCP_TASK_IDS=t1,t2` 仍在 Go 侧限制带 `task_id` 的调用范围。
- 本包不写 `cordis.patch.yml`（profile 的那份属于用户），也不改 `mcp-manager` 行的
  `config.servers`：一旦覆盖就是整份替换，会丢掉用户自己加的服务器。
