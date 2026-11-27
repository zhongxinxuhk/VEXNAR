<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# P0-4 · MITM 采集对比（Go vs sidecar）

同一目标、同一 curl 客户端，分别经过两套代理，比较：

- 状态码与响应体 sha256（代理采集 / sidecar 采集 / 直连三方一致）
- 叶子证书 subject/issuer 与链校验结果

## 运行

```sh
# 1. 启动 Go（默认 8787，捕获代理 8788；Go 侧在 VEXNAR/）
(cd ../../../VEXNAR && go run ./cmd/vexnar -addr 127.0.0.1:8787 -data ./data)

# 2. 打开流量捕获（脚本外执行一次；会持久化到 settings）
PUT /api/settings {"traffic_capture":true}

# 3. 对比（自动起 mitmdump 8899，结束后清理）
cd app/spike/p0-mitm && tsx compare.ts
```

## 实测结果

```text
[PASS] direct status 200
[PASS] go proxy status matches direct
[PASS] sidecar status matches direct
[PASS] go capture recorded
[PASS] sidecar flow recorded
[PASS] go body sha == direct
[PASS] sidecar body sha == direct
[PASS] proxied bodies equal
[PASS] go chain verifies   O=mitmproxy; CN=example.com / O=mitmproxy; CN=mitmproxy
[PASS] sidecar chain verifies   CN=example.com / CN=mitmproxy; O=mitmproxy
[PASS] both leaves name the target
11/11 passed
```

## 关键发现

1. **响应体一致**：三条路径（直连、Go 代理、mitmproxy）的 body sha256 完全相同，
   证明 sidecar 方案不会改变采集内容。
2. **证书链可自签并校验**：两套代理都为 `example.com` 签发自己的叶证书，链在各自 CA
   下校验通过；采集端只要拿到对方 CA 就能验。
3. **openssl s_client 探针会污染 Go 代理**：先用 `openssl s_client` 再发普通请求（或反过来）
   会让 go-mitmproxy 的下一次握手失败（`no peer certificate available`）。
   因此证书证据改由 **curl -v 在同一次请求里**采集，而不是单独跑 openssl。
   这条行为在迁移到 Node 代理时必须对齐（或明确不兼容）。
4. **mitmproxy sidecar 可行**：加一个 addon 即可输出 url/status/body hash，
   TS 只需读取 JSONL；不需要自己实现 TLS 拦截就能先拿到证据链。

## 结论

- P0-4 通过：**sidecar 方案在内容层面与 Go 采集等价**。
- 若要"纯 TS 全栈"，Node 自研 MITM 仍属独立立项；先以 sidecar 过渡是低风险路径。
- 该实验只覆盖 HTTP/1.1 GET；HTTP/2、WebSocket、大 body、压缩未验证，属于 P4 范围。
