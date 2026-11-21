// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 把插件入口 `index.ts` 转成 `index.js`。
 *
 * dsh 把这个包装进 profile 的 `node_modules` 再 import，而 Node 对
 * `node_modules` 下的文件不做类型擦除（ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING），
 * 所以入口必须是真 JS；源仍然只有一份 `index.ts`。
 */
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
await build({
  entryPoints: [join(here, 'index.ts')],
  outfile: join(here, 'index.js'),
  bundle: false,
  format: 'esm',
  platform: 'neutral',
  target: ['node22'],
  legalComments: 'none',
  logLevel: 'warning'
})
console.log('built @vexnar/dsh-vexnar-mcp -> index.js')
