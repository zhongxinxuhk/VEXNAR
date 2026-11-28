// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 构建产物与打包清单是否自洽。
 *
 * 产物不入库（见 app/.gitignore），所以「包里有插件」这件事只能靠构建来保证。
 * 这里做两件事：
 *
 *   1. 每个 `@vexnar/*` 工作区包都必须在 `scripts/vexnar-packages.json` 里
 *      登记为 shipped 或 embedded。新加一个包却忘了打包，构建直接失败，而不是
 *      等用户装完发现插件缺席。
 *   2. 清单里声明的每个运行时产物都真实存在、非空、能通过语法检查。
 *
 * account 的宿主模块清单以 `vexnar/account/build.ts` 的 `hostEntries` 为准：
 * 手写清单会漏——0.1.0 的打包任务只归档了 `index.js` 与 `client.js`，同目录
 * 另外十三个宿主模块全被丢在仓库里没进包。现在清单与 build.ts 两边交叉核对，
 * 任何一边新增/改名而另一边没跟上都会报错。
 *
 * 用 Node 内置模块写成 .mjs：CI 的打包任务只安装插件的依赖闭包，它必须在
 * 安装之前或之后都能跑。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { appRoot as app, classificationProblems, packages, shippedByName } from './vexnar-packages.mjs'

/**
 * account 的宿主模块清单以 `vexnar/account/build.ts` 的 `hostEntries` 为准。
 *
 * 不能按 `src/*.ts` 推导：那里还有 `.d.ts` 声明与纯类型模块
 * （`billing-types.ts`、`wallet-types.ts`、`styles.ts`），esbuild 转译后没有产物。
 * 也不能在这里另抄一份清单——抄的那份才是真正会漏的东西。解析失败就直接失败，
 * 不要退化成「检查通过」。
 */
function accountHostModules() {
  const text = readFileSync(join(app, 'vexnar/account/build.ts'), 'utf8')
  const block = /const hostEntries = \[([\s\S]*?)\n\]/.exec(text)
  if (!block) throw new Error('无法从 vexnar/account/build.ts 解析 hostEntries，检查脚本失效')
  const names = [...block[1].matchAll(/'([^']+)'/gu)].map(match => match[1])
  if (names.length === 0) throw new Error('vexnar/account/build.ts 的 hostEntries 是空的，检查脚本失效')
  return names
}

/** 同一个问题可能被多处发现，去重后只报一条。 */
const problems = new Set(classificationProblems(app))

// account 的产物由 build.ts 决定，清单必须与它一一对应。
const account = shippedByName.get('@vexnar/dsh-account')
if (account === undefined) {
  problems.add('vexnar-packages.json 缺少 @vexnar/dsh-account')
} else {
  const generated = new Set([
    ...accountHostModules().map(name => `lib/${name}.js`),
    'lib/client.js',
    // 由 @vexnar/core 的 build-embedded.ts 生成，落进 account/lib。
    'lib/core-embedded.js',
    'lib/settings-embedded.js',
    // 构建脚本生成的附随文件，没有单一源文件。
    'lib/yak-history.proto',
    'lib/yak-history.NOTICES.txt'
  ])
  const declared = new Set(account.files)
  for (const file of generated) {
    if (!declared.has(file)) problems.add(`@vexnar/dsh-account: 产物 ${file} 没有登记到 scripts/vexnar-packages.json`)
  }
  for (const file of declared) {
    if (!generated.has(file)) problems.add(`@vexnar/dsh-account: 清单里的 ${file} 没有构建来源（hostEntries 或生成步骤）`)
  }
}

let total = 0
for (const item of packages.shipped) {
  const base = join(app, item.dir)
  if (!existsSync(base)) {
    problems.add(`${item.name}: 源目录 ${item.dir} 不存在`)
    continue
  }
  for (const file of item.files) {
    total += 1
    const full = join(base, file)
    if (!existsSync(full)) {
      problems.add(`${item.name}: ${file} 不存在`)
      continue
    }
    if (statSync(full).size === 0) {
      problems.add(`${item.name}: ${file} 是空文件`)
      continue
    }
    if (!file.endsWith('.js')) continue
    // bundle 出来的都是 ESM；`node --check` 只做语法，不解析 import。
    try {
      execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' })
    } catch (error) {
      const detail = String(error.stderr ?? error.message).trim().split('\n').slice(0, 4).join('\n    ')
      problems.add(`${item.name}: ${file} 语法检查失败：\n    ${detail}`)
    }
  }
}

if (problems.size > 0) {
  console.error(`✗ 打包清单与产物不一致，共 ${problems.size} 项：`)
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('先在 app/ 执行 `pnpm run build`；新增包请同步 scripts/vexnar-packages.json。')
  process.exit(1)
}

console.log(`✓ 打包清单齐全：${packages.shipped.length} 个自研包 / ${total} 个运行时文件；工作区没有未登记的 @vexnar/* 包`)
