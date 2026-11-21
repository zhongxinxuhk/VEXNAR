<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# 流量抓取（MITM）与落库：TS 实现

**版本：** v1.0 · 2026-11-22
**位置：** `app/vexnar-core/src/traffic-proxy/` + `src/routes/traffic.ts` / `session-traffic.ts`
**状态：** 进程内 MITM、按会话抓包、CA 签发、交换落库全部在 TS；Go 的 go-mitmproxy 保留为旧控制台路径。

---

## 0. 结论

| 能力 | 实现 |
|---|---|
| CONNECT 拦截 / TLS 终止 | **TS**（`node:http` + `node:tls`） |
| 本地 CA / 按 host 签叶证书 | **TS**（`node-forge`，根证书持久化） |
| 明文 HTTP / HTTPS 请求响应转发 | **TS** |
| 抓包归属（conv / session / task） | **TS**，每个 scope 一个回环监听 |
| 落库（`traffic_exchanges` + blob） | **TS**，复用既有 `recordExchange`（inline ≤256KiB，超出落内容寻址 blob） |
| 抓包开关 API / CA 下载 | **TS** `/api/.../traffic/capture`、`/api/traffic/mitm*` |

dsh 内不再需要启动 Go 才能抓包；客户端把工具/浏览器的 HTTP(S) 代理指向会话返回的
`proxy`，并信任下载的 CA 即可。

---

## 1. 数据流

```
工具/脚本/浏览器
  └─ HTTP_PROXY=http://127.0.0.1:<scope-port> + SSL_CERT_FILE=mitm-ca.pem
       └─ TS MITM（每 scope 一个监听）
            ├─ CONNECT → 现场签发 host 证书 → TLS 终止
            ├─ HTTP/1.1 请求 → 上游 TLS/HTTP → 响应
            └─ recordExchange({scope, req/resp head+body, status, duration})
                 └─ traffic_exchanges（SQLite kv）+ blobStore
```

- **每 scope 一个端口**：`conv-<id>` / `session-<id>` / `task-<id>`，stop 即关端口；
- 端口只绑 `127.0.0.1`；无认证（与 Go 版一致），依赖本机与 scope 端口隔离；
- 根证书/私钥：`<storeRoot>/traffic/mitm-ca/{ca.key.pem,ca.crt.pem}`（key 0600）。

---

## 2. 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/conversations/:id/traffic/capture` | `{action:"start"\|"stop"}`；start 返回 `proxy` 与 `ca_pem_url` |
| GET | `/api/conversations/:id/traffic/endpoint` | 当前 scope 的 `proxy` / capture 状态 / hook |
| POST | `/api/sessions/:id/traffic/capture` | 同上（Host chat session） |
| GET | `/api/traffic/mitm` | `{running, scopes:[{scope,proxy}], ca_pem_url}` |
| GET | `/api/traffic/mitm/ca.pem` | 下载根证书 |

`/api/traffic/capture` 概览额外返回 `mitm` 与每个会话的 `proxy`。

---

## 3. 与 Go 版的差异（有意为之）

| 项 | TS | 说明 |
|---|---|---|
| HTTP/2 抓包 | ❌ | ALPN 只谈 http/1.1；h2-only 站点会回落到 1.1 或失败 |
| WebSocket 帧 | ❌ 仅记录 101 握手并隧道 | 与 Go 的 passthrough 行为接近 |
| 非 TLS CONNECT | 白名单外一律 TLS 拦截 | 22/25/110/143/3306/5432/6379/11211/27017 等保持原样隧道；其它端口假定 TLS |
| 上游链式出网 | 直接拨号 | 未接 egress 池；需要时可按 `proxy-bridge` 的方式加一层 |
| 正文上限 | 5MiB/侧，超出截断并标记 | 落库阶段再按 256KiB inline / blob 处理 |
| 证书校验上游 | `rejectUnauthorized:false` | 抓包代理不因目标证书问题中断 |

---

## 4. 使用

```bash
# 1) 会话发起抓包（web/dsh 调同一个接口）
curl -s -X POST localhost:8790/api/conversations/12/traffic/capture \
  -H 'content-type: application/json' -d '{"action":"start"}'
# → {"proxy":"http://127.0.0.1:50xxx","ca_pem_url":"/api/traffic/mitm/ca.pem",...}

# 2) 工具侧
curl -s http://127.0.0.1:8790/api/traffic/mitm/ca.pem -o vexnar-ca.pem
HTTPS_PROXY=http://127.0.0.1:50xxx HTTP_PROXY=http://127.0.0.1:50xxx \
SSL_CERT_FILE=$PWD/vexnar-ca.pem CURL_CA_BUNDLE=$PWD/vexnar-ca.pem \
curl -sS https://target.example/ -o /dev/null

# 3) 结束
curl -s -X POST localhost:8790/api/conversations/12/traffic/capture \
  -H 'content-type: application/json' -d '{"action":"stop"}'
```

面板：聊天右侧「本会话流量」头部展示 MITM 代理地址、复制按钮与 CA 下载链接。

---

## 5. 测试

```bash
cd app/vexnar-core
pnpm test:mitm     # 10/10：HTTPS 拦截/明文转发/落库/scope/停止关端口/CA
pnpm typecheck
node egress.test.mjs        # 代理池既有 15/15（本机无 mihomo 时跳过 2 项）
```

`traffic-mitm.test.mjs` 用同一 CA 起本地 HTTPS 目标，客户端信任 MITM CA 完成
CONNECT → TLS → GET，再断言 `traffic_exchanges` 有带 scope 的请求/响应与头部。

---

## 6. 安全与边界

1. 根私钥 0600，仅本机；CA 只用于本地抓包，**不要**分发到其它机器；
2. 监听只绑 `127.0.0.1`，端口按 scope 隔离，stop 即关闭；
3. 不做 h2 帧级抓包、QUIC/UDP 抓包；
4. 无认证端口意味着同机其它进程可借用该端口（与 Go 版相同）；多用户主机应限制 OS 用户；
5. dsh 工具/浏览器的出口注入仍由 dsh 侧配置（本模块只返回 proxy URL 与 CA）。
