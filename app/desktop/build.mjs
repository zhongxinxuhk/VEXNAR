// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 把桌面主进程打成单个 JS。
 *
 * 安装包里没有 tsx，Electron 主进程也不能直接吃 `.ts`（除了类型擦除那几种写法），
 * 所以 `desktop/main.ts` 连同它 import 的 `scripts/vexnar-web.ts`、`vexnar-runtime.ts`
 * 一起 bundle 成 `desktop/dist/main.js`。`electron` 保持 external——它是运行时注入的。
 */

import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outfile = join(here, 'dist', 'main.js')

// 根包里没有 esbuild：和 vexnar-core 的 build-embedded.ts 一样，借用 ui 包那
// 一份（`--filter` 精简安装时根依赖可能是空的）。
const { build } = await import(new URL('../vexnar/ui/node_modules/esbuild/lib/main.js', import.meta.url).href)

mkdirSync(dirname(outfile), { recursive: true })

await build({
  entryPoints: [join(here, 'main.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: ['node22'],
  // 运行时注入；打进 bundle 只会拿到一个路径字符串。
  external: ['electron'],
  // 主进程自己的 createRequire 已经在 main.ts 里，不需要 banner——两个都会
  // 声明 `require`，重复声明会直接语法错误。
  legalComments: 'none',
  logLevel: 'info'
})

console.log(`built VEXNAR desktop main → ${outfile}`)
