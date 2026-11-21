<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# 任务：定义、生命周期与统计口径

这份文档是「任务」这个概念的**唯一定义**。概览 KPI、任务面板、web 控制台、MCP 工具
都按这里说的口径读同一条聚合；只要有一处自造词表或自算比例，同一个任务就会在不同
界面里是不同状态，统计数字也就失去了意义。

代码落点：

| 位置 | 作用 |
| --- | --- |
| `server/task_summary.go` | Go 的权威定义：`TaskLifecycle` 表、`summarizeTaskDTOs()`、`GET /api/tasks/summary` |
| `app/vexnar-store/src/task-status.ts` | TS 侧的同一份定义：`TASK_LIFECYCLE`、`resolveTaskStatus()`、`summarizeTasks()` |
| `app/vexnar-core/src/routes.ts` | `GET /api/tasks/summary` 的 TS 实现（默认数据面） |
| `app/vexnar/ui/src/overview.tsx`、`src/tasks/*` | 只管展示：标签/颜色优先取接口下发的 `lifecycle`，本地表只是断网兜底 |

## 1. 任务是什么

一个**任务**（task）是一次以 `goal` 为终止条件的自主探索单元，它的所有权范围是：

- `tasks` 行：描述、目标、分类、时限、模型链、状态；
- 唯一的 `exploration`：探索图（fact / intent / goal / finding 节点与边）；
- 该探索产生的 activity 流（含 token 计量）、findings、assets、traffic 证据、报告。

任务不是会话（conversation），也不是意图（intent）：会话是人和模型对话的容器，意图是
任务内部一次可独立验证的工作单元。任务的进度只能由它自己的探索图与目标状态回答。

**活动清单** = `deleted_at IS NULL AND archived_at IS NULL` 的任务。归档在库里同时写
`archived_at` 与 `deleted_at`，所以两个条件都要给：只按 `deleted_at` 过滤会让归档任务
重新出现在列表里（TS 侧的 `tasks.list()` 曾经就漏了 `archived_at`）。

## 2. 生命周期：七个状态

数据库的 `tasks.status` 是**存储事实**，`paused` / `queued` 是**执行开关**，组合出来的
才是**任务状态**。对外发布的 `status` 必须是下表的值。

| key | 中文 | 终态 | 计入「进行中」 | 含义 |
| --- | --- | --- | --- | --- |
| `created` | 待启动 | 否 | 否 | 已创建，引擎还没运行过；scope/goals 可编辑 |
| `queued` | 排队中 | 否 | 是 | 已提交，等待并发槽位 |
| `running` | 进行中 | 否 | 是 | 引擎在跑、未暂停 |
| `paused` | 已暂停 | 否 | 否 | 人工暂停，进度与在途意图保留，可恢复 |
| `done` | 已完成 | 是 | 否 | 目标达成或引擎正常收尾 |
| `failed` | 失败 | 是 | 否 | 中止或执行错误 |
| `timeout` | 已超时 | 是 | 否 | 超出任务时限，引擎已收尾 |

解析顺序（与 Go 的 `resolvedTaskStatus` 一致）：

1. 存储状态是终态（`done` / `failed` / `timeout`）→ 原样返回；
2. `queued` 开关为真 → `queued`；
3. `paused` 开关为真（或引擎暂停中）→ `paused`；
4. 存储状态为 `running` → `running`；
5. 其余 → `created`。

**归档不是状态。** `archived_at` 只决定任务是否留在活动清单里，归档任务保留自己的终态。
客户端此前把 `archived` 当筛选状态、把 `draft` 当初始状态，这两个键在数据里都不存在，
选中「已归档」必然得到空列表。

**未知状态不丢弃。** 解析不到的状态一律折叠进 `created`，这样各状态计数之和恒等于
`total`；一张卡上的数字必须能加回来。

## 3. 统计口径

`GET /api/tasks/summary?days=N` 一次回答全部聚合，字段与含义：

| 字段 | 口径 |
| --- | --- |
| `total` | 活动清单里的任务数（未删除、未归档） |
| `by_status.{created…timeout}` | 七个状态的计数，键固定；未知状态折叠进 `created` |
| `active` | `queued + running`，引擎当前会推进的任务 |
| `paused` | `paused` |
| `terminal` | `done + failed + timeout` |
| `done` / `failed` / `timeout` | 三个终态的便捷字段 |
| `completion_rate` | `done / total × 100` |
| `goals_total` / `goals_met` / `goal_rate` | 所有任务的目标数与达成数之和；`goal_rate = met / total × 100`，只在 `goals_total > 0` 时有意义 |
| `in_flight` | 所有任务中 `state = 'running'` 的意图数之和 |
| `findings` | 任务清单的漏洞计数与分档合计（`total = critical + high + medium + low`） |
| `tokens` | 任务清单的 token 合计（`input_tokens` / `output_tokens` / `cache_*_tokens` / `total = input + output`） |
| `window_days` | `?days=`，默认 30 |
| `created_window` | 窗口内新建的任务数 |
| `created_prev` | 上一窗口新建的任务数（只为算环比，不叠加） |
| `throughput` | 窗口内每天新建的任务数，长度 = `window_days`，末尾是今天（UTC） |
| `lifecycle` | 上面的七状态定义（key/label/tone/terminal/active/hint），随数据下发 |
| `generated_unix` | 聚合时刻 |

窗口参数只影响 `created_window` / `created_prev` / `throughput`；其余字段是全量口径，
不会因为切了 7/30/90 天而变化。

## 4. 各界面读什么

- **概览 KPI「任务总数」**：`total`，脚注按 `lifecycle` 顺序列出非零状态。主数值不再
  是「运行中 / 全部」——那正是 `0 / 232` 的来源：232 个任务里没有在跑的，卡片却把
  分母摆成了全部任务。
- **任务健康度**：两个环分别读 `completion_rate` 与 `goal_rate`，脚注是 `done/total`
  与 `goals_met/goals_total`；右侧逐状态计数 + `in_flight`。
- **任务面板筛选计数**：读同一份 `by_status`。此前它统计的是**当前页**的 20 条，
  一页的分布从来不是全站分布。
- **web 控制台**：仍走 `GET /api/tasks`，状态语义与本定义一致（Go 本来就是这样解析的）。
- **降级**：`/api/tasks/summary` 取不到时，客户端用全量清单自算同样的口径，并显示
  「统计不可用」而不是把 0 当成真实值。

## 5. 契约示例

```json
{
  "total": 232,
  "by_status": { "created": 0, "queued": 0, "running": 0, "paused": 31, "done": 201, "failed": 0, "timeout": 0 },
  "active": 0,
  "paused": 31,
  "terminal": 201,
  "done": 201,
  "failed": 0,
  "timeout": 0,
  "completion_rate": 86.6,
  "goals_total": 8,
  "goals_met": 6,
  "goal_rate": 75,
  "in_flight": 0,
  "findings": { "total": 2, "critical": 0, "high": 1, "medium": 1, "low": 0 },
  "tokens": { "input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0, "cache_write_tokens": 0, "total": 0 },
  "window_days": 30,
  "created_window": 0,
  "created_prev": 232,
  "throughput": [0, 0, "…"],
  "lifecycle": [{ "key": "created", "label": "待启动", "tone": "muted", "terminal": false, "active": false, "hint": "…" }],
  "generated_unix": 1795291200
}
```

测试把这份契约钉住了：`server/task_summary_test.go` 断言状态集合、聚合数学、JSON 键名，
以及「真实库上的 summary.total == 活动任务数」。

## 6. 已知数据缺口

`findings` 的分档对任务来说普遍为 0，原因不在展示：`findings.task_id` 只有 2/1842 行有值，
其余记录只带 `node_id`，而它们的探索根本没有对应任务行（历史归档导入、MCP 直写）。
要做**单任务**漏洞分析，必须先让写入路径带上 `task_id`（`report_finding`），再回填历史：

```sql
UPDATE findings f
   SET task_id = t.id
  FROM exploration_nodes n
  JOIN tasks t ON t.exploration_id = n.exploration_id AND t.deleted_at IS NULL
 WHERE f.node_id = n.id AND f.task_id IS NULL;
```

回填前不要用任务面板的「漏洞」列判断任务质量——那个 0 是数据缺口，不是没漏洞。
