// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/** core 的 `ChatMessage` 形状；这里只按结构声明，不跨包引用源码。 */
interface ChatMessage {
  role: string
  content: string
}

/**
 * 被 `vexnar-core/build-embedded.ts` 打包出来的 `/vexnar-api` 处理器。
 *
 * 产物是 `lib/core-embedded.js`（生成的，不手写、不加头注释）；这里只声明
 * `src/index.ts` 与 `src/platform.ts` 用到的那个面，让动态 import 有类型可依。
 */
export function handle(request: Request, localPeer: boolean): Promise<Response>
export function isGoDataRequest(method: string | undefined, pathname: string): boolean
/**
 * 装/摘进程内的模型通道。引擎因此不需要 HTTP 网关：同一个进程里直接调用，
 * 没有监听端口，也没有要来回传的令牌。
 */
export function setModelCompletion(next: ((messages: readonly ChatMessage[]) => Promise<string>) | undefined): void
export function modelCompletionReady(): boolean
export function runtimeInfo(): {
  mode: 'ts' | 'go'
  store: 'sqlite' | 'json' | 'postgres'
  started: boolean
  started_at: number
  triggers: number
  schedules: boolean
  store_locked: boolean
  engine: string
  task_concurrency: number
}
/**
 * 启动运行时底座（幂等）：触发器、定时任务、store 恢复与独占锁、任务队列。
 *
 * 宿主插件在 core 加载完成后直接调用它，自主执行链因此在后台运行，
 * 而不是等 `/vexnar-api` 的第一个请求。重复调用返回同一个 Promise。
 */
export function startRuntime(options?: { signals?: boolean }): Promise<void>
/** 停掉底座（退出或测试清理用）：触发器、定时任务与 store 锁逐个释放。 */
export function stopRuntime(): Promise<void>
