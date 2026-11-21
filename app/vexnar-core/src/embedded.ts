// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { api } from './routes.ts'

/**
 * In-process entry for the dsh host: the same Hono app the standalone server
 * mounts, without an HTTP listener. The account host plugin registers it as a
 * webserver prefix and forwards Fetch requests directly.
 */
export async function handle(request: Request) {
  return api.fetch(request)
}
