// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Hono } from 'hono'
import { ensureInterceptRulesSeeded } from './intercept-seed.ts'
import { registerInterceptSettings } from './routes/intercept.ts'
import { registerSettingsCatalog } from './routes/settings-catalog.ts'
import { registerToolDocumentation } from './routes/tool-documentation.ts'

const settings = new Hono()
registerInterceptSettings(settings)
registerSettingsCatalog(settings)
registerToolDocumentation(settings)

let migration: ReturnType<typeof ensureInterceptRulesSeeded> | undefined

/** Settings use the same storage and handlers as the core router. */
export async function handleSettings(request: Request): Promise<Response> {
  if (new URL(request.url).pathname.startsWith('/api/intercept/')) {
    migration ??= ensureInterceptRulesSeeded().catch(error => {
      migration = undefined
      throw error
    })
    await migration
  }
  return settings.fetch(request)
}
