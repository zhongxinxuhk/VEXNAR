<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# 代理池跨语言桥（Egress Bridge）

**版本：** v1.0 · 2026-11-22
**对象：** `app/vexnar-core`（TS）↔ Go 服务 `egress` 包
**契约版本：** 1（`X-VEXNAR-Egress-Contract`）

---

## 0. 结论

**不能整体迁到 TypeScript。** 代理池的数据面是 Go 独占能力：mihomo 协议核是 Go 库，
SOCKS5/HTTP 会话网关、租约与并发预算、健康探测、MITM 会话录制、以及"把出口注入 Agent 的
bash/WebFetch"都发生在 Go 进程里。把这些搬到 TS 等于重写协议栈，并把 `egress.db` 变成
双写（Go 运行时缓存与 TS 写入必然不一致）。

所以采用**控制面桥**：

- **Go**：唯一的数据面与 `egress.db` 持有者；
- **TS core**：按契约暴露 `/api/proxy/*`，做端点清单校验、SSE 直通、错误语义，再受控转发；
- **app 启动器**：按源码 stamp 独立编译并启动 Go 引擎（`app/scripts/vexnar-go.mjs`），
  客户端退出时回收；
- **web**：只消费 TS 侧的同一组接口，契约与 Go 保持一一对应。

这样"接口在 TypeScript 侧有实现"（可鉴权、可自检、可测试），而重活仍在 Go，不产生第二份状态。

---

## 1. 为什么不能纯 TS

| 能力 | 现所在 | 能否迁 TS | 原因 |
|---|---|---|---|
| ss/ssr/vmess/vless/trojan 拨号 | `egress/core.go`（mihomo 库） | ❌ | mihomo 是 Go 库；TS 无等价成熟实现 |
| SOCKS5 / HTTP CONNECT 网关 | `egress/gateway.go`、`socks5.go` | ❌ | 需要和租约/并发/审计同进程；TS 重写后仍要回连 Go |
| 租约/健康/熔断/host 记忆 | `egress/pool`、`manager.go` | ❌ | 状态属于数据面；跨进程同步会引入双写 |
| 对抗引擎（K 路并发/判定器） | `egress/fanout.go` | ❌ | 必须与节点拨号器同进程 |
| MITM 会话录制 | `traffic/listener.go` | ❌ | go-mitmproxy + 共享根 CA + 索引库 |
| 出口注入 Agent（bash/WebFetch/工具） | `server/task_llm.go`、`agent/` | ❌ | 与 Go 的 Agent 运行时同进程 |
| CRUD / 订阅调度 / 差异 | `egress/store.go`、`subscription.go` | 理论上可 | 但需要与运行时共享 `egress.db` 和内存快照，双写代价更高 |
| 页面与鉴权 | `web/`、`app/vexnar-core` | ✅ | 已在 TS |

---

## 2. 职责划分

| 层 | 持有者 | 负责 |
|---|---|---|
| 数据面 | Go `egress` | 节点拨号、会话网关、租约、健康、对抗、录制、`egress.db`（单写） |
| 控制面契约 | 两侧 | `proxy-contract.ts` ↔ Go DTO；只加字段，不改语义 |
| 控制面网关 | TS `proxy-bridge.ts` | 本机来源校验、端点清单、桌面令牌、SSE、超时、错误映射 |
| 展示 | `web/` | 已有的代理池/订阅页面，不变 |
| 编译与载入 | `app/scripts/vexnar-go.mjs` | 源码 stamp → 编译 → 启动 → 健康检查 → 退出回收 |

**单写原则**：`data/egress/egress.db` 只允许一个 Go 进程打开写入。app 启动器在端口上发现
另一个构建的 Go 时会直接报错，不会悄悄连接（见 `reuseOrRefuse`）。

---

## 3. 契约

- 文件：`app/vexnar-core/src/proxy-contract.ts`；Go 常量 `egress.ContractVersion`。
- 响应头：`X-VEXNAR-Egress-Contract: 1`（Go 中间件对 `/api/proxy/*` 全部响应打标；
  TS 在缺失时补上自己的版本）。
- 端点清单（TS 只转发这些，未知路径 404）：
  - `state / pools / pools/:id / pools/:id/nodes / pools/:id/check`
  - `nodes / nodes/parse / nodes/import / nodes/batch / nodes/:id / nodes/:id/check`
  - `leases/reset / default-pool / fanout`
  - `subscriptions / subscriptions/preview / subscriptions/:id / subscriptions/:id/refresh`
  - `events`（SSE）
- `/api/tasks/:id/proxy` 仍走 `/api/tasks` 的通用 Go 前缀（TS core 已整体转发任务域），
  但 DTO 与 `task_proxy_bindings` 的语义由同一契约约束。
- **兼容规则**：新增字段可直接上线；改字段语义/删除字段必须同时提升契约版本，并在
  `_bridge` 中暴露给运维。

---

## 4. 桥的行为

实现：`app/vexnar-core/src/proxy-bridge.ts`

1. **来源校验**：`localPeer` + `Host` 必须是回环 + `Origin`/`Sec-Fetch-Site` 同源
   （与 `go-data.ts` 同一把锁）；
2. **端点校验**：只转发清单内的 `method + path`，避免变成任意 Go 代理；
3. **令牌**：`VEXNAR_DESKTOP_TOKEN` 通过 `x-vexnar-desktop-token` 注入，不出进程、不落日志；
4. **SSE**：`/api/proxy/events` 不设总超时、不缓冲，逐块转发并关闭代理缓冲；
5. **超时**：普通请求 180s（订阅拉取、批量体检都在内）；
6. **错误映射**：

| 场景 | 返回 |
|---|---|
| 非本机来源 | `403` |
| 端点不在清单 | `404` + `hint` 指向 `_bridge` |
| 缺少令牌 / `VEXNAR_GO_URL` 非 loopback | `503` |
| 引擎 401（令牌不一致） | `502`（不冒充登录失效） |
| 引擎不可达 | `503` + `engine` 地址 |
| 其余 | 原状态码 + 原正文 |

7. **自检**：`GET /api/proxy/_bridge` 返回契约版本、端点清单、引擎可达性、`state` 形状校验结果。

---

## 5. 独立编译与载入

`app/scripts/vexnar-go.mjs` 已负责：

- 用 `git HEAD` + 未提交 `.go` 内容算 stamp，构建到 `app/.vexnar-bin/vexnar-<stamp>`；
- `goSourceDirs` 已包含 **`egress`**，因此本特性的改动会触发重编，不会复用旧二进制；
- 启动参数固定 `-addr 127.0.0.1:<port> -data <repo>/data -keydir <repo>`，`data/egress/`
  跟随现有数据目录，不产生第二份 SQLite；
- 端口上已有同 stamp 实例则复用，不同构建则报错并给出 PID；
- 进程随客户端退出回收。

可用开关：

| 变量 | 作用 |
|---|---|
| `VEXNAR_GO=off` | 不启动内置 Go，要求外部 `VEXNAR_GO_URL` |
| `VEXNAR_GO_URL` | 外部 Go 地址（必须是 loopback IP） |
| `VEXNAR_GO_BIN` | 打包环境用现成二进制 |
| `VEXNAR_GO_PORT` | 内置后端端口（默认 8787） |

---

## 6. 测试与自检

```bash
cd app/vexnar-core
node proxy-bridge.test.mjs        # 17 项：透传/SSE/401→502/不可达/来源校验/契约
pnpm --filter @vexnar/core typecheck

# Go 侧
go test ./egress/ ./traffic/

# 运行时
curl -s http://127.0.0.1:8790/api/proxy/_bridge | jq .
```

`proxy-bridge.test.mjs` 用本地 stub 引擎模拟 `/api/proxy/*`，不需要真的启动 Go。

---

## 7. 后续边界

1. 若未来要让 TS 接管控制面写入，需要 Go 暴露"控制 socket + reload 钩子"，并放弃
   `egress.db` 单写约束；当前评估收益不足（页面已经是薄层）。
2. 换协议核心（例如从 mihomo 换 sing-box）只改 `egress/core.go`，契约与 TS 桥不变。
3. 新增代理池端点时：Go handler + 契约类型 + `PROXY_ENDPOINTS` 三处同步，测试会拦截漏登记。
