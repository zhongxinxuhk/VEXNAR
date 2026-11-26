// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 删掉全部构建产物，让下一次 `pnpm run build` 从零重建。
 *
 * 产物不入库之后，本地目录里的旧文件就成了唯一能冒充「已构建」的东西：
 * 源码删掉一个模块，同名产物还在，归档时它照样进包。打包任务先跑一遍这个脚本，
 * 包里就只会有本次源码能生成的文件。
 *
 * 只删 `app/.gitignore` 里列的那三个位置，不碰 src/ 与 node_modules。
 * 跨平台用 node 而不是 `rm -rf`：Windows 上没有 rm。
 */

import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 与 app/.gitignore 的「构建产物一律不入库」一节保持同一份清单。 */
const targets = [
  'vexnar/ui/lib',
  'vexnar/account/lib',
  'vexnar-egress/index.js',
  'vexnar-tools/index.js'
]

for (const target of targets) {
  rmSync(join(app, target), { recursive: true, force: true })
  console.log(`clean: ${target}`)
}
