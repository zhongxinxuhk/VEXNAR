<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# P0-3 · TS worker 写回验证

验证 TS 能完成一条最小执行链：**claim intent → 执行 → 写回 fact/edge/activity**，
并让 Go 的读接口看到同一张图。

## 运行

```sh
cd app/spike/p0-worker
node demo.mjs          # 建临时任务 → claim → 执行 → 写回 → 校验 → 清理
node demo.mjs --keep   # 保留任务，重启 Go 后用 /api/exploration/nodes?task=<id> 查看
```

## 链路

```text
createFixture()   paused 任务 + begin + open intent + spawns 边
claimOne()        SELECT … FOR UPDATE SKIP LOCKED → state=running
executeAndWriteBack()
                  fact(confirmed) + edge(intent -yields-> fact)
                  intent state=done + completed_at
                  activity ×2（tool / writeback）
verify()          intent/fact/edge/activity 六项断言
cleanupTask()     删除任务与探索
```

## 实测

```text
[PASS] intent done
[PASS] intent completed_at set
[PASS] fact recorded
[PASS] fact summary
[PASS] edge intent -> fact (yields)
[PASS] activity recorded  rows=2
```

再用 Go 重启后读取同一任务：

```text
GET /api/exploration/nodes?task=1846  200 total=3
intent { id: '5969', state: 'done' }
fact   { id: '5970', state: 'confirmed', payload: '…GET /health -> 200…' }
edges  2（begin→intent spawns、intent→fact yields）
```

## 结论与边界

- **写回形状可行**：TS 事务与 Go 写出的节点/边/活动结构一致，Go 读接口能正常展示。
- **claim 语义可行**：`FOR UPDATE SKIP LOCKED` 在 PG 上直接对应 Go 的意图抢单。
- 未覆盖：真实工具执行（LLM/HTTP/Kali）、暂停与续跑、失败/重试、预算与阶段门禁；
  这些属于 P3（引擎迁移）的验收项，不在本 spike。
- 临时任务用 `paused` 创建，Go 引擎不会领取；对账后已清理。
