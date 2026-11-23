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

## 出厂预设：装了什么都写进 `extras.json`

`pnpm run setup` 只认两份清单：`app/vexnar/extras.json`（第三方与运行时自带的
bundle）和模板（`@deepseek-ai/dsh-base` / `dsh-web-app`）。两者之外的东西，换台
机器重跑 setup 就会消失。所以预设必须覆盖**当前装着的全部 bundle**：

```sh
pnpm run plugins:check                       # 对照真实 profile 盘点，缺一个就退出 1
pnpm run plugins:check -- --profile /path     # 指定别的 profile
pnpm run test:preset                          # 清单与分类规则的自检
```

盘点把每个 bundle 归到一个来源：`template`（模板）、`own`（`@vexnar/*`）、
`theme`（Claude Style）、`extras`（预设里的第三方包）、`runtime`（dsh 安装自带，
预设里标 `"runtime": true`，只补 bundle 层、不写 spec）。出现 `unknown` 就是分叉：
把它补进 `extras.json`。

当前预设覆盖 extras 的 17 条：10 个第三方依赖（含 `dsh-plugin-shop`）与 7 个
运行时自带的 `@deepseek-ai/dsh-*`（CUA、会话标题、思维链翻译、Codex 子代理、
Forge、自动评审、插件市场）；皮肤 `dsh-claude-style` 由 setup 单独安装。

## 皮肤与界面默认值：写进 bundle patch

Claude Style 的设置页把用户改过的值写进 profile 的 patch 层（`profiles/vexnar/
cordis.patch.yml`）。新机器没有那一层，皮肤会回到上游默认。`app/vexnar/
cordis.patch.yml` 现在把选定的整套写成默认：

```yaml
- id: ui-skin-claude-style
  name: dsh-claude-style
  config:
    brand: deepseek
    statusMotion: wash
    sodium: on
    homeLayout: classic
    homeRipple: true
    searchStyle: icon
    ongoingIndicator: ring
    reasoningDisplay: stepped
    sidebarLayout: compact
```

会话日志（`session-log-deepseek.enabled=false`）与对话视图（`ui-chat` 的
`collapseTiming` / `foldedReplies` / `transcriptView`）也一并固化。bundle patch
先应用、profile patch 后应用，所以用户自己改过的值仍然优先；想恢复出厂值，删掉
profile patch 里对应的 `id` 行再重启即可。

## 拦截规则在 dsh 运行时真的生效

设置 → 拦截规则写的规则存在 core 的 meta 里，但**规则不会自己生效**：Go 引擎由
`intercept.Interceptor` + `guard` 在 PreToolUse 上执行，dsh 运行时此前没有这个
执行点。现在 `@vexnar/dsh-account` 注册了 `tools/pre-execute` 监听器
（`account/src/intercept-guard.ts`）：

- 每 2 秒把规则与拦截范围拉成快照，调用路径上只做内存匹配；
- 判定顺序与 Go 一致：优先级降序、第一条命中、`string` 包含 / `regex` 匹配、
  `tool_name` / `tool_input` 二选一；
- `deny` 直接拦下并把规则文案回给模型；`allow` 跳过后续规则；
- `ask` 写一条 pending 记录（`POST /api/intercept/pending`），在「拦截审批」里
  点允许/拒绝后轮询到结果，超时按 `timeout_action` 收尾；
- 每次判定写回 `/api/intercept/decisions`，历史页能看到规则战果。

工具名两套命名都认：规则里写 `Bash` / `Write` / `Edit`，dsh 注册的是 `bash` /
`write` / `edit`，匹配时大小写无关并走别名表（`MultiEdit` ↔ `edit` /
`apply_patch`，`shell_open` ↔ `terminal_open`）。

Go 回退模式（`VEXNAR_RUNTIME_MODE=go`）不挂这个监听器，避免同一次调用被判两遍。

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

