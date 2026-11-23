// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 嵌入 core 的启动自检：`lib/core-embedded.js` 必须能导入、起底座、回答域接口，
 * 并让「模型通道 → 规划器」这条自主执行链真的跑起来。
 *
 * 旧版 core 的模块图里 `routes/traffic.ts` ↔ `traffic-proxy/mitm.ts` 是一个环，
 * 加上 `context.ts` 的顶层 await，esbuild 会把两个模块包成互相等待的异步 init：
 * 导入永远不结束，dsh 宿主只能在 4 秒后报 `timed_out`，任务队列与自主执行链全部
 * 拿不到。这里直接对构建产物做端到端验证，把那个状态钉死。
 *
 * 这是一条对产物的检查：改动 `src/` 后要重新执行 `pnpm run build:embedded`。
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** `lib/core-embedded.js` 里本测试用到的面（产物没有 .d.ts，这里按结构声明）。 */
interface CoreModule {
  handle(request: Request, localPeer: boolean): Promise<Response>
  runtimeInfo(): {
    mode: 'ts' | 'go'
    store: 'sqlite' | 'json' | 'postgres'
    started: boolean
    triggers: number
    schedules: boolean
    store_locked: boolean
    engine: string
  }
  startRuntime(): Promise<void>
  stopRuntime(): Promise<void>
  setModelCompletion(next: ((messages: readonly { role: string; content: string }[]) => Promise<string>) | undefined): void
}

const root = await mkdtemp(join(tmpdir(), 'vexnar-embedded-'))
process.env.VEXNAR_STORE_ROOT = root
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_SQLITE_PATH = join(root, 'vexnar.sqlite')
process.env.VEXNAR_CLIENT_SQLITE = '1'
delete process.env.VEXNAR_PG_DSN
delete process.env.VEXNAR_PG_URL

const deadline = (ms: number, message: string) =>
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms).unref())

// 动态说明符：产物没有类型声明，静态 import 会被类型检查挡下；运行时由 tsx 解析。
const entry = new URL('../vexnar/account/lib/core-embedded.js', import.meta.url).href

const imported = Date.now()
const core = await Promise.race([
  import(entry) as Promise<CoreModule>,
  deadline(15_000, 'core-embedded.js 导入超过 15 秒：模块图里又有互相等待的顶层 await')
])
const importMs = Date.now() - imported
assert.ok(importMs < 15_000, `core 导入耗时 ${importMs}ms，超过启动预算`)

const call = async (path: string, init?: RequestInit) => {
  const response = await core.handle(new Request(`http://127.0.0.1${path}`, init), true)
  return { status: response.status, body: await response.text() }
}
const json = (path: string, method: string, payload: unknown) =>
  call(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })

try {
  // 底座：触发器 / 定时任务 / store 独占锁 / 任务队列。
  await Promise.race([core.startRuntime(), deadline(20_000, 'startRuntime() 20 秒未完成')])
  const info = core.runtimeInfo()
  assert.equal(info.started, true, '底座应已启动')
  assert.equal(info.schedules, true, '定时任务循环应已启动')
  assert.equal(info.store_locked, true, 'store 独占锁应已持有')

  const runtime = await call('/api/_runtime')
  assert.equal(runtime.status, 200, 'GET /api/_runtime 应返回 200')
  assert.equal(JSON.parse(runtime.body).started, true, '/api/_runtime 应报告已启动')

  const tasks = await call('/api/tasks')
  assert.equal(tasks.status, 200, 'GET /api/tasks 应返回 200（域接口已可用，不再是 503/501）')
  assert.ok(Array.isArray(JSON.parse(tasks.body).tasks), 'GET /api/tasks 应返回 {tasks:[]}')

  // 自主执行链：建任务 → 装模型通道 → 规划器落意图 → 队列可见。
  const created = await json('/api/tasks', 'POST', { name: 'embedded chain', description: 'probe 127.0.0.1', goal: 'probe 127.0.0.1' })
  assert.equal(created.status, 201, 'POST /api/tasks 应返回 201')
  const taskId = String(JSON.parse(created.body).id)
  assert.equal(core.runtimeInfo().engine, 'idle', '未装模型通道时引擎应待机')

  core.setModelCompletion(() => Promise.resolve(JSON.stringify({ intents: [{ text: 'recon 127.0.0.1', priority: 1 }] })))
  assert.equal(core.runtimeInfo().engine, 'ready', '装上模型通道后引擎应就绪')

  const planned = await json('/api/engine/plan', 'POST', { task_id: taskId })
  assert.equal(planned.status, 200, 'POST /api/engine/plan 应返回 200')
  const intents = JSON.parse(planned.body).intents
  assert.equal(intents.length, 1, '规划器应把模型输出落成一条意图')
  assert.equal(intents[0].kind, 'intent', '落库结果应是 intent 节点')

  const active = await json('/api/active', 'POST', { id: taskId })
  assert.equal(active.status, 200, 'POST /api/active 应返回 200')

  const queue = await call('/api/engine/queue')
  assert.equal(queue.status, 200, 'GET /api/engine/queue 应返回 200')
  assert.ok(Array.isArray(JSON.parse(queue.body).entries), '任务队列应可查询')
} finally {
  await core.stopRuntime().catch(() => {})
  await rm(root, { recursive: true, force: true })
}
