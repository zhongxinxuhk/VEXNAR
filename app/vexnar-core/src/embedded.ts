// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { api } from './routes.ts'
import { goData } from './go-data.ts'
import { startRuntime } from './runtime.ts'

export { isGoDataRequest, isDataPlaneRequest } from './go-data.ts'

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
  return await goData(request, localPeer) ?? api.fetch(request)
}
