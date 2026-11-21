// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
const { build } = await import(new URL('../vexnar/ui/node_modules/esbuild/lib/main.js', import.meta.url))
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'vexnar', 'account', 'lib', 'core-embedded.js')
await build({
  entryPoints: [join(here, 'src', 'embedded.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  external: ['pg-native'],
  banner: { js: "import { createRequire as __vexnarCreateRequire } from 'node:module'; const require = __vexnarCreateRequire(import.meta.url);" },
  logLevel: 'info'
})
