// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/** esbuild 的构建入口只用到这几个选项；动态 import 的模块没有静态类型，这里给出本地形状。 */
type BuildOptions = {
  entryPoints: string[]
  outfile: string
  bundle: boolean
  platform: 'node'
  format: 'esm'
  target: string
  sourcemap: boolean
  external: string[]
  banner: { js: string }
  logLevel: 'info'
}
type EsbuildModule = { build: (options: BuildOptions) => Promise<unknown> }

// 动态 import 的说明符必须是字符串，URL 需要 .href（解析出的模块与原来一致）。
const { build } = (await import(new URL('../vexnar/ui/node_modules/esbuild/lib/main.js', import.meta.url).href)) as EsbuildModule
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
