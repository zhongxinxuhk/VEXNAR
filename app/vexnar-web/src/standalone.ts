// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 独立跑 Web 测试引擎（不依赖 dsh / core）：调试与验收用。
 *
 *   pnpm --filter @vexnar/web run mcp
 *   VEXNAR_WEB_ROOT=/tmp/vx-web VEXNAR_DESKTOP_TOKEN=dev pnpm ... mcp
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

import { startWebRuntime } from './index.ts'

const root = process.env.VEXNAR_WEB_ROOT?.trim()
  || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'vexnar', 'store', 'web')

const runtime = await startWebRuntime({ root })
const shutdown = async (): Promise<void> => {
  await runtime.stop()
  process.exit(0)
}
process.once('SIGINT', () => { void shutdown() })
process.once('SIGTERM', () => { void shutdown() })
console.log(`[web] root=${root} mcp=${runtime.mcpUrl}`)
