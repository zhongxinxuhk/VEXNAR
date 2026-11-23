// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/** TS MITM 采集单例：CA 与各 scope 监听随首次抓包启动。 */

import { join } from 'node:path'

import { storeRoot } from '../context.ts'
import { MitmProxy } from './mitm.ts'

export { setExchangeRecorder } from './mitm.ts'
export type { ExchangeRecorder } from './mitm.ts'

let proxy: MitmProxy | undefined

export function mitmProxy(): MitmProxy {
  if (!proxy) {
    proxy = new MitmProxy(join(storeRoot(), 'traffic', 'mitm-ca'))
  }
  return proxy
}

export function stopMitmProxy(): void {
  proxy?.closeAll()
  proxy = undefined
}
