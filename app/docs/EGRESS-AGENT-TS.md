<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Agent 出口注入、链式代理与多层级利用（TS / dsh）

**版本：** v1.0 · 2026-11-22
**位置：** `app/vexnar-egress/`（dsh 插件）+ `src/egress/`（core 控制面）

---

## 0. 结论

Go 版给 agent 做两件事：把 `HTTP(S)_PROXY` 注入 bash 环境，以及注入 `fanout_fetch`、
`egress_status` 等工具。dsh 没有“改内置 bash 环境”的接缝，所以改成 **dsh 原生工具面**：

| Go 时代 | TS/dsh |
|---|---|
| bash 环境注入 | `egress_exec`：用 dsh 的 shell 执行器跑命令，自动带会话代理 |
| `fanout_fetch` | `fanout_fetch` 工具（core `/api/proxy/fanout`） |
| `egress_status` | `egress_status` 工具 |
| 会话/任务绑定 | core `POST /api/proxy/session`（task/pool/scope） |
| 浏览器固定端口 | `browser_proxy` → core `POST /api/proxy/fixed` |
| 无链式代理 | 节点 `via_node_id` + mihomo `dialer-proxy` / TS 多跳握手 |
| 无跳板登记 | `pivot_add` → core `POST /api/proxy/pivots` |

插件通过 **同进程的 `vexnarCore` 服务**调用 core（`@vexnar/dsh-account` 提供），
不经过 `/vexnar-api` 登录闸门，也不需要复制端口/token；独立部署时回退到 `coreUrl` HTTP。

---

## 1. 工具

| 工具 | 说明 |
|---|---|
| `egress_status` | 池/节点（含 pivot、via）/绑定/会话/引擎状态 |
| `fanout_fetch` | K 路并发，取首个未被 WAF/拦截页挡住的响应；只对幂等方法并发 |
| `egress_exec` | `bash -c` 执行命令，注入 `HTTP_PROXY/HTTPS_PROXY/ALL_PROXY` 与 `DSH_*` 环境 |
| `egress_proxy` | 返回会话的带凭据代理与 SOCKS 地址（给 `--proxy` 类工具） |
| `pivot_add` | 登记 SOCKS5/HTTP 跳板；`via_node_id` 让跳板端点本身经现有节点到达 |
| `browser_proxy` | 开无认证回环端口，给 Playwright MCP 的 `--proxy-server` |

`egress_exec` 复用 dsh 的 `shell` 执行器（sandbox/超时语义一致），但没有走 bash 工具的
审批包装；高权限 profile 里应保持默认 sandbox 或由操作者显式放行。

---

## 2. 链式代理

节点新增 `via_node_id`：

- **socks5/http 节点**：TS 侧逐跳握手——先经 via 拨到 `node.server:node.port`，再在该 socket
  上对目标做 SOCKS5/HTTP CONNECT，支持多跳（上限 5）；
- **引擎协议（vmess/vless/trojan/ss/…）**：mihomo 配置写入 `dialer-proxy: vx-<via>`；
  链上的 socks5/http 节点也会被加入引擎配置，保证 `dialer-proxy` 引用存在。

```
client → gateway → node B (via=A) → A → B endpoint → B → target
```

引擎节点与原生节点可以混链：B 是 vmess、A 是 socks5 时，B 的 `dialer-proxy` 指向 A。

---

## 3. 跳板与多层级利用

`pivot_add` 的典型流程：

```json
{"name":"dmz-ssh","protocol":"socks5","server":"10.0.0.15","port":1080,
 "via_node_id":7,"pool_id":3,"tags":["pivot","dmz"]}
```

- 跳板立即成为节点并入池，下一次 `egress_exec`/`fanout_fetch` 就能选到；
- `via_node_id` 表示“先到 7，再从 7 到 10.0.0.15:1080”，适合只在 DMZ 可达的跳板；
- 每层跳板都保留 node id 与 via 关系，报告里可以画出利用链；
- 找到下一层凭据/主机后重复 `pivot_add`，池内节点按健康/延迟/策略选择。

配合 fanout：同一请求打多节点，取首个 `pass`（非拦截页）响应，降低单节点被 WAF 拦的误判。

---

## 4. 浏览器固定端口

`browser_proxy` 返回 `http://127.0.0.1:<port>`（无认证、仅回环），按会话复用：

```bash
npx @playwright/mcp --headless --proxy-server=http://127.0.0.1:<port>
```

Playwright MCP 的 args 是静态配置，任务级切换需要重启该 MCP；`browser_proxy` 至少让端口
与会话绑定，避免给浏览器开放带凭据的全量网关。

---

## 5. 数据流与权限

```
dsh agent → vexnar-egress 工具
  → vexnarCore.request('/api/proxy/session' | '/fanout' | '/pivots' | '/fixed')
    → EgressManager（池/租约/健康/预算/链式）
      → mihomo / 原生 socks5/http → target
```

- 工具只拿会话范围出口；`task_id` 优先，其次 `VEXNAR_TASK_ID`、`defaultTaskId`；
- 代理凭据在 core 内存中生成，`egress_exec` 返回时脱敏；
- `browser_proxy` 固定端口无认证，仅绑 `127.0.0.1`，不用时 `DELETE /api/proxy/fixed/:key`。

---

## 6. 测试

```bash
cd app/vexnar-egress && pnpm test      # 10/10：注册/状态/fanout/跳板/固定端口/exec 环境
cd ../vexnar-core && pnpm test:chain   # 8/8：A→B→target、via、固定端口、dialer-proxy
pnpm test:egress                      # 解析/网关/对抗/订阅回归
```

插件测试用假 core + 假 shell，断言六个工具注册、`task_id` 透传、`HTTP_PROXY` 注入与脱敏；
链式测试用两个本地 SOCKS5 fixture，断言 A 被要求拨到 B 入口、B 被要求拨到目标。

---

## 7. 边界

1. 链式跳数上限 5；引擎链依赖 mihomo 的 `dialer-proxy` 语义；
2. `egress_exec` 只对读 `HTTP(S)_PROXY` 的工具生效；不读代理的原始 socket 工具需显式
   `egress_proxy` + 工具自己的代理参数；
3. 固定端口无认证，属于本机会话级能力；多用户主机靠 OS 用户隔离；
4. Playwright MCP 的代理参数是启动参数，任务切换需重启 MCP；
5. 跳板节点本身不验证可达性，健康检查会按池策略标记 down，不影响已登记的链路关系。
