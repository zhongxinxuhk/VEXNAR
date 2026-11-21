<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# 代理池（Egress）TS 实现

**版本：** v1.0 · 2026-11-22
**位置：** `app/vexnar-core/src/egress/`
**状态：** 控制面 + 出口网关 + 协议引擎托管已全部在 TS 内；Go 版保留为回滚路径。

---

## 0. 结论：技术栈怎么统一

| 层 | 实现 | 说明 |
|---|---|---|
| 节点/池/订阅存储 | **TS**（`node:sqlite`） | 独立库 `data/egress/egress.db`（可 `VEXNAR_EGRESS_DIR` 覆盖） |
| 节点解析 / 指纹 / 去重 | **TS**（`yaml` + 原生 crypto） | clash YAML / base64 / URI 与 Go 版同一套 clash `proxies` 结构 |
| 会话、租约、并发、健康、预算 | **TS**（`manager.ts`） | sticky/rotate、熔断冷却、fanout K 路并发 + WAF 判定 + host 记忆 |
| HTTP / SOCKS5 网关 | **TS**（`gateway.ts`） | 回环，会话凭据 `sess_<key>:<secret>`，失败关闭 |
| socks5 / http 拨号 | **TS**（`dialer.ts`） | 原生实现，不依赖任何外部二进制 |
| vmess/vless/ssr/ss/... 拨号 | **mihomo 二进制**（`engine.ts` 托管） | 固定版本 + sha256；每个节点一个回环 SOCKS 入口（`IN-NAME` 路由） |
| 控制面 API | **TS** `/api/proxy/*` | 与 web 现有契约一致，页面无需改动 |

**没有 Go 源码参与编译。** 协议引擎是"应用自带的固定二进制"，和 Electron 应用带 ffmpeg 同理：
`tsx scripts/fetch-mihomo.ts` 下载 → sha256 校验 → 放到 `app/.vexnar-bin/mihomo`；
运行时 `resolveEngineBinary()` 依次找 `VEXNAR_MIHOMO_BIN`、仓库/app 的 `.vexnar-bin`。

---

## 1. 为什么协议核仍是二进制

Node 没有覆盖 vmess/vless/ssr 的成熟协议栈；自己实现 AEAD/KDF/reality/mux 会把"方便开发"
变成长期维护负担，且难以验证。mihomo 是固定版本、可校验的协议实现，TS 只负责：

1. 生成配置（`proxies` + 每节点 SOCKS listener + `IN-NAME` 规则）；
2. 启动/重载/回收进程（配置签名不变则不重启）；
3. 把本地 SOCKS 入口当拨号器用。

实测（v1.19.34）：`listeners` + `IN-NAME,<listener>,<proxy>` 能把每个回环 SOCKS 入口
绑定到指定节点；测试里"fixture 节点 → mihomo → HTTP target"返回 200。

没有二进制时：socks5/http 仍可用（原生拨号），其它协议返回明确错误
`协议 X 需要协议引擎（mihomo）`，不会静默直连。

---

## 2. 目录

```
src/egress/
  types.ts       领域类型
  store.ts       node:sqlite（schema 与 Go 版对齐，独立文件）+ AES-256-GCM 密钥列
  parse.ts       clash YAML / base64 订阅 / 单条 URI → clash proxies + 指纹
  engine.ts      mihomo 进程托管、配置生成、端口分配、YAML 序列化
  dialer.ts      socks5/http 原生拨号 + 引擎入口
  gateway.ts     HTTP 代理（CONNECT/absolute-URI）+ SOCKS5 入口
  manager.ts     快照/会话/租约/健康/并发/对抗/订阅调度/SSE 事件
  routes.ts      /api/proxy/* 与 /api/tasks/:id/proxy
```

注册点：`src/routes.ts` 在任务域之前 `registerEgress(api)`，保证
`/api/tasks/:id/proxy` 由代理池处理。

---

## 3. 数据与单写约束

- TS 的库：`<storeRoot>/egress/egress.db`（`node:sqlite`，WAL）；
- Go 的库：`<repo>/data/egress/egress.db`。**两者不同文件**，不要同时启用同一实例的
  两套出口：Agent 出口只应有一个所有者。
- 迁移：先在 TS 侧重新导入订阅/节点即可；Go 的库不需要读。
- 回滚：`VEXNAR_EGRESS=go` + Go 服务在线时，`/api/proxy/*` 走之前的 Go 桥
  （`src/proxy-bridge.ts`），页面行为不变。

---

## 4. 与 Go 版的差异（明确边界）

| 能力 | TS | 说明 |
|---|---|---|
| 节点/池/订阅/健康/租约/对抗 | ✅ | 与 Go 版行为对齐（含 fanout 预算 600/小时、host 记忆） |
| HTTP/SOCKS5 入口 | ✅ | 鉴权/失败码一致 |
| 浏览器固定端口 | ⚠️ 未提供 | 需要 Chromium 免认证端口；当前 dsh 的浏览器 MCP 仍由 Go/外部管理 |
| MITM 抓包 + 流量落库 | ❌ | 属于 Go 的 traffic 子系统；TS egress 不做中间人录制 |
| 把出口注入 Go Agent 的 bash/WebFetch | ❌ | dsh Agent 的工具出口由 dsh 侧决定；TS egress 暴露 `state.gateway/socks` 供其配置 |
| Agent 工具 `fanout_fetch` / `egress_status` | ❌ | Go Agent 专用；dsh 工具面不在本包 |

这些边界不是遗漏，而是"单一所有者"：抓包与 Go Agent 注入依赖 Go 运行时；TS 只接管
代理池本身。需要时再按同样模式迁移（traffic 子系统将是下一个独立项）。

---

## 5. 使用

```bash
# 1) 协议引擎（可选；没有也能用 socks5/http 节点）
cd app && pnpm run fetch:mihomo
export VEXNAR_MIHOMO_BIN="$PWD/.vexnar-bin/mihomo"

# 2) 启动 core（TS 原生代理池随首次请求初始化）
cd vexnar-core && pnpm start

# 3) 接口自检
curl -s localhost:8790/api/proxy/settings | jq .
curl -s localhost:8790/api/proxy/state | jq '.gateway,.engine'
curl -s localhost:8790/api/proxy/_bridge | jq .
```

页面不变：`/system/proxy`（池/节点/导入/对抗测试/任务绑定）、
`/system/settings`（订阅维护、出口端口鉴权）。

---

## 6. 测试

```bash
cd app/vexnar-core
pnpm test:egress        # 17 项：解析/网关/CONNECT/SOCKS5/鉴权/空池/fanout/订阅/引擎
pnpm test:bridge        # 17 项：回滚桥契约
pnpm typecheck
```

`egress.test.mjs` 用本地 SOCKS5 fixture 当节点、HTTP server 当目标，
并在检测到 mihomo 时额外验证"fixture 节点 → mihomo → 目标"。

---

## 7. 边界与后续

1. 引擎重载是"重启进程"（配置签名变化才触发），节点很多时会有秒级窗口；
2. 对抗引擎是并发发起 K 路后取首个 pass，未做 TCP 级取消（连接会自然结束）；
3. MITM 抓包、浏览器固定端口、Go Agent 工具注入未迁移，见 §4；
4. 订阅仍是全量差异（同指纹改名记 changed）。
