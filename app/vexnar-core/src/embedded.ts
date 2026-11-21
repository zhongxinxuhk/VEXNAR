// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { api } from './routes.ts'
import { goData } from './go-data.ts'
import { ensureInterceptRulesSeeded } from './intercept-seed.ts'
import { startRuntime } from './runtime.ts'

export { isGoDataRequest, isDataPlaneRequest } from './go-data.ts'
export { modelCompletionReady, setModelCompletion } from './gateway.ts'

/**
 * 拦截规则的一次性迁移只跑一次：成功或失败都记住这次尝试，之后的请求不再重试，
 * 迁移源（PostgreSQL）不可用也不会把每个请求都拖慢。
 */
let migration: Promise<unknown> | null = null

function migrateOnce(): Promise<unknown> {
  migration ??= ensureInterceptRulesSeeded().then(
    (outcome) => {
      if (outcome.seeded > 0) console.log(`[vexnar] 拦截规则迁移：${outcome.seeded} 条（来源 ${outcome.source}）`)
    },
    (error) => console.error('[vexnar] 拦截规则迁移失败（不影响其它接口）', error)
  )
  return migration
}

/**
 * In-process entry for the dsh host: the same Hono app the standalone server
 * mounts, without an HTTP listener. The account host plugin registers it as a
 * webserver prefix and forwards Fetch requests directly.
 *
 * 底座（触发器 / 定时任务 / store 独占锁）在第一次请求时启动一次：宿主进程里不该在
 * `import` 阶段就去锁库，但请求进来时必须已经在跑。
 */
let booting: Promise<void> | null = null

export async function handle(request: Request, localPeer: boolean) {
  if (!booting) booting = startRuntime()
  await booting
  await migrateOnce()
  return await goData(request, localPeer) ?? api.fetch(request)
}
