<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# 会话感知 HTTP 测试引擎（Session-aware HTTP Testing Engine）

**版本：** v1.0 · 2026-11-23
**位置：** `app/vexnar-web/`（引擎 + MCP 工具面）、`app/vexnar-core/src/web.ts`（core 接线）、`app/vexnar/cordis.patch.yml`（MCP 注册）

---

## 0. 为什么不用抓包代理

抓包代理（tshark / Yakit / mitmproxy）解决的是"**旁路观察**"：先有流量，再解协议。
而受控测试需要的是"**我方发起的请求，我方负责记录**"——请求是引擎发的，响应是引擎读的，
会话状态、预算、去重、熔断都在应用层，天然可得，不需要额外进程去嗅探、也不需要 TLS 中间人。

因此本域**不包含**任何抓包进程、`tshark` 解码、`yak` 依赖或 BPF 权限要求：

| 旧方案（已移除） | 新方案 | 收益 |
|---|---|---|
| dumpcap/tshark 抓网卡 → 解析 → 规则 | undici 直接发请求，响应流内记录 | 无权限依赖、无协议重建误差 |
| PCAP 文件作为证据 | 请求/响应正文密文入库，记录只留 hash | 证据可检索、可按会话隔离 |
| 会话靠 scope 字符串对齐 | `sessionId` 是引擎一等公民 | 预算/去重/熔断天然按会话 |
| 无法控制请求节奏 | 串行队列 + 预算 + 窗口 + 退避 | 不制造无意义的告警量 |

---

## 1. 五层结构（与架构图一一对应）

```
Harness / Agent（dsh）
   │  MCP: web_session_create / web_request_execute / web_response_analyze / web_session_inspect
   ▼
┌─ Session-aware Testing Engine ─────────────────────────────────────────┐
│ 1 Policy Gate          policy.ts      目标授权 · origin 范围 · 预算/窗口/写/攻击载荷 │
│ 2 Session Manager      vault.ts       独立 CookieJar · Token · CSRF · 会话状态      │
│ 3 Scheduler + Transport engine.ts     串行队列 · 去重 · 间隔 · undici + SSRF 防线   │
│ 4 Response Observer    analyzer.ts    状态码 · WAF/限流特征 · 结构信号              │
│ 5 Evidence Store       store.ts       脱敏记录 + AES-256-GCM 证据 + 差异分析        │
└───────────────────────────────────────────────────────────────────────┘
   │
   ▼
目标站点（HTTP/HTTPS/API）
```

| 文件 | 职责 | 关键实现 |
|---|---|---|
| `src/policy.ts` | 准入与限制 | zod 校验、origin 归一化、私网判定、预算/窗口/写/攻击载荷裁决 |
| `src/vault.ts` | 身份隔离 | tough-cookie jar + secrets，AAD 绑定 sessionId，Agent 永不可见 |
| `src/transport.ts` | 传输 | undici Agent（`connections:1`）、**连接时 DNS 过滤**（防 SSRF/Rebinding）、响应限长 |
| `src/engine.ts` | 编排 | 每会话串行队列、幂等去重、重定向逐跳复查、429/挑战页熔断、证据落库 |
| `src/analyzer.ts` | 观察与分析 | parse5 表单/链接/脚本、JSON 形状、WAF 特征、差异对比、脱敏 |
| `src/store.ts` | 持久化 | `web_sessions / web_exchanges / web_evidence / web_vault / web_policy_events` |
| `src/mcp.ts` | 工具面 | JSON-RPC 2025-06-18，Bearer + loopback，5 个工具 |
| `src/routes.ts` | REST 面 | `/api/web/*`，与 MCP 同一引擎、同一策略 |

---

## 2. MCP 工具（Harness 的完整决策环）

| 工具 | 作用 | 关键约束 |
|---|---|---|
| `web_session_create` | 建隔离会话（origin/预算/身份） | origin 必须在白名单；凭据只进 Vault |
| `web_request_execute` | 发一次受控请求 | 跨源拒绝、写需批准、超预算/窗口拒绝、只读去重 |
| `web_response_analyze` | 结构提取 / 与基线 diff | 只读本地密文证据，不发新请求 |
| `web_session_inspect` | 历史/统计/策略事件 | 只返回脱敏记录 |
| `web_session_control` | pause / resume / close / 加预算 | close 会销毁 Vault 凭据并释放连接池 |
| `web_evasion_report` | 对抗效果矩阵：各变异/出口/身份的尝试与通过次数、升级样本、最终仍被拦的请求 | 只陈述观测结果，不承诺绕过 |

调用顺序（实测链路）：`create → execute(基线) → analyze(structure) → execute(候选) → analyze(diff) → inspect`。

---

## 3. 降噪与信息泄漏的边界

### 3.1 降低 WAF 干扰（做得到的）

- **Request Budget**：会话级预算 + 60s 窗口上限 + 最小间隔（默认 800ms，遇限流自动×2～×3）。
- **Session Affinity**：一个会话一个 CookieJar、一组身份、一个连接池。
- **Request Deduplication**：同 `method+URL` 的只读请求 5 分钟内复用，复用记录带 `parent_request_id`。
- **Adaptive Backpressure**：限流/挑战页后提高间隔；会话转 `blocked`，必须人工 `resume`。
- **Redirect Guard**：不自动跟随跨源跳转；同源跳转逐跳复查 origin 与预算。
- **Payload Control**：攻击性载荷需要 `VEXNAR_WEB_AGGRESSIVE=on` **且**每次请求标 `aggressive=true`。

### 3.2 做不到的（写在前面，避免误解）

- 不能消除 **TLS/HTTP 客户端指纹**：undici ≠ 浏览器网络栈，改 UA 也改不了握手特征（对抗模式同样改变不了这一点）。
- **默认行为是遇拦截就停**：不换载荷、不换出口、不伪装客户端。需要"被打回后继续试"时，必须显式开启 §3.4 的对抗模式。
- 不能保证对抗模式下一定通过；它只是把"哪些编码/出口/身份还能被拦"测出来。
- **403 不等于 WAF**：无挑战特征时归 `auth_denied`，只有命中特征（`cf-mitigated`、挑战页文案、Akamai reference 等）才归 `waf_blocked`。
- 需要 WAF 不干扰已授权深度测试时，应在测试环境或经审批的 WAF 规则里解决。

### 3.3 信息泄漏控制（做得到的）

| 特征 | 处理 |
|---|---|
| Agent/Harness 元数据 | 不进 Header/Body/URL；UA 固定为 `Authorized-Web-Test/1.0` |
| 身份与会话 | Vault 隔离；记录里 `authorization/cookie/set-cookie/x-csrf-token` 一律 `***` |
| 证据正文 | 只存密文（AES-256-GCM，AAD=ref/sessionId）；SQLite 被拷走也读不出明文 |
| 敏感参数与正文 | URL 敏感 query 值、Bearer/JWT、`password=` 样式在入库前脱敏 |

### 3.4 对抗模式（adversarial，可选）

定位：**测规则覆盖**，不是"保证绕过"。开启后，被 `waf_blocked` / `rate_limited` 打回时按阶梯自动升级，
每一次升级都留痕，配额耗尽立即停。

**双开关 + 白名单**（缺一不可）：

| 闸门 | 位置 | 说明 |
|---|---|---|
| 平台级 | `VEXNAR_WEB_ADVERSARIAL=on` | 关着就完全不能开，避免"随手一开就在生产站点轮换身份" |
| 会话级 | `web_session_create { adversarial: true }` | 单会话生效，不影响其它会话 |
| 范围 | `VEXNAR_WEB_ALLOWED_ORIGINS` 非空 | 不允许对"任意站点"开对抗，把授权范围变成配置事实 |

**升级阶梯**（顺序固定，每步都写 `web_policy_events`）：

```
被拦(403 挑战页/429)
  ├─ 换载荷（case_toggle → sql_comment → space_as_comment → double_url → html_entity → …）  × perLevel
  ├─ 换出口（egress 池轮换；429 时优先走这一步并尊重 Retry-After）                        × 出口数
  ├─ 换身份（UA/Accept/sec-ch-ua 画像切换 + 清空 Cookie，出口重置）                       × 身份数
  └─ 停（写 stoppedReason，会话转 blocked，交人工判断）
```

硬上限：`maxAttempts`（默认 8）与 `maxRotations`（默认 6）双重约束；`auth_denied`（无 WAF 特征的 401/403）**不升级**
——那是权限问题，换编码没有意义，继续试只会变成撞库。

**不做什么（写死）**：

- 不改 TLS ClientHello / JA3-JA4 / HTTP2 帧行为（undici 改不了，也不假装能改）；
- 不做无界随机探测，变异清单是固定的、确定性的（同 seed 同结果，便于复现）；
- 不在 429 时刷载荷（只会加重限流）；
- 不把"通过一次"写成"WAF 无效"——`web_evasion_report` 只报计数与样本。

**可核验的产出**（`web_evasion_report`）：

| 字段 | 含义 |
|---|---|
| `totals.logical_requests / attempts` | 逻辑请求数 vs 实际请求数（升级放大了多少流量） |
| `totals.passed_after_escalation` | 首次被拦、升级后通过的请求数 |
| `mutations[].passed/attempts` | 每种编码的通过率 → 直接对应"规则覆盖缺口" |
| `egresses[] / identities[]` | 哪个出口/身份还能通 → 供防守方补策略 |
| `escalations[]` | 每个样本的 `首次分类 → 最终分类` 与用过的变异 |

---

## 4. 配置（全部为操作员级，Agent 不可改）

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `VEXNAR_WEB_ALLOWED_ORIGINS` | 空（逐个授权） | 逗号分隔的 origin 白名单 |
| `VEXNAR_WEB_ALLOW_PRIVATE` | off | 是否允许私网/回环目标（本地联调用） |
| `VEXNAR_WEB_RESOLVE` | 空 | `host=ip;host2=ip` 地址钉定（假 IP/透明代理环境） |
| `VEXNAR_WEB_MAX_REQUESTS` | 200 | 单会话总预算 |
| `VEXNAR_WEB_MAX_PER_WINDOW` | 20 | 窗口内请求上限 |
| `VEXNAR_WEB_WINDOW_SECONDS` | 60 | 窗口长度 |
| `VEXNAR_WEB_MIN_INTERVAL_MS` | 800 | 最小请求间隔 |
| `VEXNAR_WEB_TIMEOUT_MS` | 15000 | 单请求超时 |
| `VEXNAR_WEB_MAX_RESPONSE_BYTES` | 262144 | 响应读取上限（超出截断并标记） |
| `VEXNAR_WEB_ALLOW_WRITE` | off | 是否允许写方法（仍需 `approved_write`） |
| `VEXNAR_WEB_AGGRESSIVE` | off | 是否允许攻击性载荷 |
| `VEXNAR_WEB_PROFILES` | 空 | `{"id":{"headers":{...}}}` 身份配置（凭据不进对话） |
| `VEXNAR_WEB_MCP_PORT` | 8792 | MCP 监听端口（loopback） |
| `VEXNAR_WEB_MCP_TOKEN` | 回落桌面令牌 | MCP Bearer |
| `VEXNAR_WEB_ADVERSARIAL` | off | 对抗模式总闸（还要求会话级开关 + origin 白名单） |
| `VEXNAR_WEB_EVASION_MAX_ATTEMPTS` | 8 | 单次逻辑请求最多尝试次数 |
| `VEXNAR_WEB_EVASION_MAX_ROTATIONS` | 6 | 最多升级次数 |
| `VEXNAR_WEB_EVASION_PER_LEVEL` | 2 | 每个等级内换几次载荷 |
| `VEXNAR_WEB_EVASION_JITTER_MS` | 600 | 升级间隔抖动上限 |
| `VEXNAR_WEB_EGRESS_PROXIES` | 空（直连） | 出口池，`http://u:p@h:p,http://...`（对外只显示脱敏标签） |
| `VEXNAR_WEB_EGRESS_MODE` | on_block | `sticky` / `on_block` / `per_attempt` |

---

## 5. 运行与验证

```sh
cd app
pnpm install
pnpm --filter @vexnar/web run test      # 14 个用例：策略/会话/去重/重定向/熔断/分析/MCP
pnpm --filter @vexnar/web run mcp       # 独立起 MCP（默认 8792）

# 或随 core 一起起（内置在 dsh profile 里，patch 已注册 mcp-manager 条目）
pnpm --filter @vexnar/core start
```

实测（2026-11-23，目标为 DASCTF 授权练习实例）：

| 项 | 结果 |
|---|---|
| `web_session_create` | `ws-mwt8c5mx-4aa25d`，预算 12 |
| `web_request_execute GET /` | **200 normal**，10790B，315ms |
| 结构分析 | 标题 `VOLTCRAFT VC-2 // 安全元件实验台`，表单 1（`GET /(cmd)`），链接 0 |
| 内置浏览器对照 | 同一页面渲染成功（经本地中继，见下） |
| 直接浏览器访问 | Chrome 走系统代理返回 **502**；curl 按域名超时，按真实 IP+Host 返回 200 → 故用 `VEXNAR_WEB_RESOLVE` 钉定 |
| 对抗模式（本地 WAF 模拟器） | 4 次尝试：`none`→403、`case_toggle`→403、`sql_comment`→403、`sql_comment + safari-mac`→**200**；报告显示 `sql_comment 1/2`、`case_toggle 0/1`（不碰任何外部目标） |

> 复现命令：
> `VEXNAR_WEB_RESOLVE="eedb7468159ac95e6da06ad8.http-ctf2.dasctf.com=117.21.200.176" VEXNAR_WEB_MCP_TOKEN=dev-test pnpm --filter @vexnar/web run mcp`

---

## 6. 已知边界与后续

1. **HTTP/2**：undici 默认按 ALPN 协商，未做协议级控制；如需固定 h1 需显式 `allowH2:false`（当前未暴露）。
2. **TLS 指纹**：不做模拟；需要浏览器一致性时应另建 Browser Transport，而不是在本引擎里堆指纹逻辑。
3. **DNS 与连接的一致性**：用连接层 `lookup` 过滤，缩小但无法完全消除 DNS Rebinding 窗口；高危环境应配出口代理或在策略层加 IP 允许列表。
4. **多身份并发**：当前一会话一连接池、串行；若要并行多身份，应扩为"会话 → 池"映射而不是放宽 `connections`。
5. **报告导出**：`web_exchanges` 已具备导出脱敏 HAR 的字段，导出器尚未实现。
6. **对抗模式 ≠ 匿名**：出口轮换只是换代理；TCP/TLS 层特征不变，目标侧仍可做基础设施级归因。把头/载荷换掉只影响应用层规则命中率。
7. **对抗模式的使用前提**：仅限已书面授权的目标与时间窗。引擎把这件事固化成"平台开关 + 会话开关 + origin 白名单"三件套，并在 `web_policy_events` 留下每一步升级记录。
