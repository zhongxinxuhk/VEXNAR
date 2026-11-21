<!--
  Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
  Repository: https://github.com/zhongxinxuhk/VEXNAR
  SPDX-License-Identifier: AGPL-3.0-or-later
-->

# @vexnar/store

VEXNAR 的存储层。**默认跟随 dsh**：`$DSH_HOME/vexnar/store` 下的 JSON 域文件，
可读、可编辑、原子写入、zod 校验。**PostgreSQL 是可选适配器**，只用于兼容存量部署
与一次性导入。

## 两种后端

| 后端 | 选择方式 | 数据位置 |
|---|---|---|
| JSON（默认） | `VEXNAR_STORE=json`（缺省） | `VEXNAR_STORE_ROOT` 或 `$DSH_HOME/vexnar/store` |
| PostgreSQL（可选） | `VEXNAR_STORE=postgres` + `VEXNAR_PG_URL` | 现有 VEXNAR 库 |

```text
store/
├─ tasks/<id>.json          per-record
├─ findings/<id>.json
├─ nodes/<id>.json
├─ edges/<src>-<rel>-<dst>.json
├─ assets/<id>.json
├─ companies/<ordinal-id>.json
├─ activity/<id>.json
└─ meta.json                 single-file 域（配置类）
```

导入时会清空对应表目录，避免旧键与新键并存造成重复；遗留的 `tasks.json`
等单文件会被删除。

写入路径：临时文件 + `rename` 原子替换（0600），目录 0700。

## 从 PostgreSQL 导入

```sh
cd app && pnpm install                          # workspace 统一安装，只需一次
pnpm --filter @vexnar/store run seed            # 只读 PG，写 JSON store
pnpm --filter @vexnar/store run compare         # JSON store vs PG 适配器逐项对比
```

最近一次（per-record 布局）：

```text
[PASS] tasks row count  232 vs 232
[PASS] tasks sample equal
[PASS] findings sample equal
[PASS] assets sample equal
[PASS] nodes page equal
[PASS] findings stats equal
```

## 实现要点

1. **推荐排序用主键限定**：`ORDER BY tasks.id`，否则 PG 会把 `id::text` 的输出列当成
   排序键，得到字典序（`996 > 1836`）。
2. **节点页排序**：`priority DESC, id`；JSON 与 PG 必须一致，否则分页集合不同，
   边集合也跟着不同。
3. **BIGINT 数组**：pg 返回 `int8[]` 时元素是字符串，需归一成 number。
4. **时间双形态**：任务/发现用 RFC3339（含偏移），资产/节点用 `::text` 或秒级 ISO；
   store 在两种后端输出同一形状。
5. **统计的任务下拉**：JSON 侧需要 join 内存里的 tasks 才能补 name/description。

## 写路径

```text
writer.commit(ops)   写 journal(prepared) → 逐条原子写 → journal(committed)
writer.recover()     启动时重放 prepared/failed 的提交（幂等）
writer.lock()        单写者锁；崩溃残留 pid 会被检测并接管
```

- 每条记录带 `rev`，`expectedRev` 不匹配抛 `StoreConflict`（HTTP 409）；
- 写入是"一条记录一个文档"，不会整表重写；
- `reportFinding` 把 finding、finding 节点、`yields` 边放在同一个 journal 提交里；
- `updateTask` / `controlTask` / `deleteTask`：改名/置顶、pause/resume、软删除；
- 分类与模板：增改删、任务归类（删除分类自动解绑）；
- 资产挂载/卸载与任务范围：`task_asset_links`、`task_scope` 独立记录；
- 通知渠道、agent 名称/描述、tool 配置、自定义工具、MCP server：写 `meta.json` 后刷新缓存；
- 归档：`archives/<id>.json` + 任务的 `archived_at`，恢复/删除成对处理；
- journal 恢复只重放 `prepared`，`failed` 不重放；
- 测试：`pnpm --filter @vexnar/store run test:writes`（创建任务、分配探索、改漏洞、冲突、上报漏洞、日志重放、锁释放）。

## 与 dsh 的关系

dsh 的 `storage-domain` 是"schema 校验 + 可替换 backend"的 KV 域。本包按同一模型实现
JSON 文件后端，后续可以：
- 把 `defineDomain`/`ctx.storageDomain` 接进来，让 store 成为 dsh 插件；
- 把 PostgreSQL 适配器做成独立插件（`VEXNAR_STORE=postgres`），保持可选。
