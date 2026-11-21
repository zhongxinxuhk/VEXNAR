<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# P0-2 · 工具 TS 化对账

验证 TS 实现与 Go MCP 工具在**同一输入**下输出一致，再谈整工具迁移。

## 运行

```sh
# Go 以固定 token 启动，便于脚本对账
VEXNAR_MCP_TOKEN=spike-token go run ./cmd/vexnar -addr 127.0.0.1:8787 -data ./data

VEXNAR_MCP_TOKEN=spike-token pnpm --filter @vexnar/p0-tools-spike run compare
```

## 覆盖

| 工具 | 对比内容 | 结果 |
|---|---|---|
| `list_assets` | `ids` 直取、`domain=` 模糊、`domain==` 精确 + type/limit | 3/3 |
| `traffic_get` | SQLite 索引 + 请求/响应重建，逐字节比对 | 3/3 |
| `report_finding` | MCP 包装层/处理器拒绝文本；插入行形状（事务内回滚） | 3/3 |

最近一次：

```text
[PASS] list_assets {"ids":[20,1727]}
[PASS] list_assets {"type":"root_domain","dsl":"domain=example","limit":3}
[PASS] list_assets {"dsl":"domain==example.test","limit":1}
[PASS] traffic_get 1794415806-0001
[PASS] traffic_get 1794415807-0002
[PASS] traffic_get 1794415810-0003
[PASS] report_finding validate {}
[PASS] report_finding validate {"task_id":"999999",...}
[PASS] report_finding insert shape
9/9 passed
```

## 对账暴露的细节

1. **MCP 文本会 TrimSpace**：Go 的 `wrapCoreTool` 对工具输出做 `TrimSpace`，`traffic_get`
   末尾换行被吃掉；TS 必须同样 trim，否则逐字节比对差 1 字节。
2. **`list_assets` 的转义语义**：`domain=` 是 ILIKE，`domain==` 是精确；顺序是
   `last_seen DESC, id DESC`，`task_ids` 是 BIGINT[]（TS 侧 pg 返回字符串，需要归一）。
3. **`report_finding` 的写形状**：在事务里复制一条现有 finding 再回滚，6 个字段一致；
   注意 PG 序列不回滚，演练会消耗 id（无害，但要在测试库里做）。
4. **校验顺序**：MCP 包装层先查 `task_id` 必填，再查任务存在；错误文本是 UI 契约的一部分。

## 不在本 spike 范围

- 完整 DSL（AND/OR/括号/比较符）与任务范围内的资产过滤；
- `report_finding` 真实落库后的下游副作用（报告 Agent、证据绑定）；
- `traffic_blob` 分段读取与二进制判定；
- 并发/性能。
