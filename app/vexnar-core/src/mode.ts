// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 运行时底座的模式判定：单独一个无依赖模块，避免 `runtime.ts`（会拉起后台循环）
 * 被别处为了读一个环境变量而拖进模块图。
 */

export type RuntimeMode = 'ts' | 'go'

/**
 * 数据面由谁回答。
 *
 * - `ts`（默认）：`/api/tasks`、`/api/traffic`、`/api/intercept` 等全部由 core
 *   原生实现直接读 SQLite store，Go 进程可以不启动，模型走进程内桌面网关。
 * - `go`：旧路径，数据面整段转发给 `VEXNAR_GO_URL`，模型走 Go 回环网关（回滚开关）。
 */
export function runtimeMode(): RuntimeMode {
  const raw = (process.env.VEXNAR_RUNTIME_MODE || 'ts').trim().toLowerCase()
  return raw === 'go' ? 'go' : 'ts'
}

export function storeBackend(): 'sqlite' | 'json' | 'postgres' {
  const mode = (process.env.VEXNAR_STORE || 'sqlite').trim().toLowerCase()
  return mode === 'json' || mode === 'postgres' ? mode : 'sqlite'
}
