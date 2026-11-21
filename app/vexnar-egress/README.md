<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# @vexnar/dsh-egress

把 VEXNAR 的代理池注入 dsh agent：会话出口、对抗 fanout、跳板/链式代理、浏览器固定端口，
以及带代理环境的命令执行。

| 工具 | 作用 |
|---|---|
| `egress_status` | 池/节点/绑定/会话/引擎状态 |
| `fanout_fetch` | K 路并发取首个未被 WAF 拦的响应 |
| `egress_exec` | 在 `HTTP(S)_PROXY` 指向会话出口的 shell 里跑命令 |
| `egress_proxy` | 返回带凭据代理与 SOCKS 地址 |
| `pivot_add` | 登记 SOCKS5/HTTP 跳板，可经现有节点链式拨号 |
| `browser_proxy` | 开无认证回环端口，供 Playwright MCP 的 `--proxy-server` |

控制面在 `vexnar-core` 的 `/api/proxy/*`；插件只做调用，不维护第二份节点/池状态。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `coreUrl` | `http://127.0.0.1:8790` | 仅 loopback |
| `token` | 空 | 与服务共享的 `x-vexnar-token`；优先于 `tokenEnv` |
| `tokenEnv` | `VEXNAR_API_TOKEN` | 环境变量里的 token |
| `taskIdEnv` | `VEXNAR_TASK_ID` | 任务 id 来源；工具参数 `task_id` 优先 |
| `defaultTaskId` | `0` | 兜底任务 id（0 = 用默认池） |

任务未显式传 `task_id` 时，使用 `VEXNAR_TASK_ID`、`defaultTaskId` 或会话 scope；
会话出口由 core 按任务绑定/默认池解析。

## 构建

```bash
cd app/vexnar-egress && pnpm build   # index.ts -> index.js
```
