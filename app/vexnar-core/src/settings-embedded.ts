// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Hono } from 'hono'
import { ensureInterceptRulesSeeded } from './intercept-seed.ts'
import { registerInterceptSettings } from './routes/intercept.ts'
import { registerSettingsCatalog } from './routes/settings-catalog.ts'
import { registerToolDocumentation } from './routes/tool-documentation.ts'
import { registerNotificationSettings } from './routes/notification-settings.ts'
import { registerLocalTrafficCleanup, registerTaskDataManagement } from './routes/data-management.ts'
import { register as registerUpdate } from './routes/update.ts'
import { registerReadViews } from './routes/read-views.ts'
import { captureOverview, registerTrafficHistory } from './routes/traffic-history.ts'

const settings = new Hono()
registerInterceptSettings(settings)
registerSettingsCatalog(settings)
registerToolDocumentation(settings)
registerNotificationSettings(settings, true)
registerReadViews(settings)
registerTrafficHistory(settings)
registerTaskDataManagement(settings)
registerLocalTrafficCleanup(settings)
registerUpdate(settings)
settings.get('/api/traffic/capture', async (c) => c.json(await captureOverview()))

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
