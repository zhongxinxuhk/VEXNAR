// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 数据层统一出口。
 *
 * 页面只从 `data/` 导入：取数（resources）、口径（metrics）、格式（format）、
 * 缓存与写操作（query）、事件流（stream）。任何页面直接 `fetch` 都视为缺陷——
 * 那意味着又出现了第二套超时/错误/快照语义。
 */
export * from './client.ts'
export * from './query.ts'
export * from './resources.ts'
export * from './metrics.ts'
export * from './format.ts'
export * from './stream.ts'
