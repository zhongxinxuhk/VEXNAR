// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/** index.ts → index.js（profile 的 node_modules 下 Node 不做类型擦除）。 */
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
console.log('built @vexnar/dsh-tools -> index.js')