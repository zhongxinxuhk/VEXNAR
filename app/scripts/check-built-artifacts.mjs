// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 构建产物是否齐全。
 *
 * 产物不入库（见 app/.gitignore），所以「包里有插件」这件事只能靠构建来保证。
 * 这个脚本按源码推导每个包应有的产物，逐个检查存在与语法，缺一个就退出 1。
 *
 * 为什么不是一张写死的文件名清单：清单会漏。0.1.0 的打包任务只归档了
 * account/lib 下的 `index.js` 与 `client.js`，同一个目录里另外十三个宿主模块
 * 全被丢在仓库里没进包——用户装上去，账号页、登录、拦截守卫、yak 历史都不存在。
 * 按 `src/*.ts` 推导，新增一个宿主模块就自动进入检查范围，漏不掉。
 *
 * 用 Node 内置模块写成 .mjs、不 import 任何依赖：CI 的 app-bundle 任务只安装
 * 插件的依赖闭包，它必须在安装之前或之后都能跑。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const app = join(here, '..')

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

/**
 * 每个包：`artifacts` 是必须存在的产物（相对 `app/`），`sources` 声明产物的来源。
 * 与 `scripts/vexnar-runtime.ts` 的 `bundleFiles` 是同一份事实，改一处必须改两处。
 */
const packages = [
  {
    name: '@vexnar/dsh-ui',
    artifacts: ['vexnar/ui/lib/index.js', 'vexnar/ui/lib/client.js'],
    sources: {
      'vexnar/ui/lib/index.js': 'vexnar/ui/src/index.ts',
      'vexnar/ui/lib/client.js': 'vexnar/ui/src/client.tsx'
    }
  },
  {
    name: '@vexnar/dsh-account',
    artifacts: [
      ...accountHostModules().map(name => `vexnar/account/lib/${name}.js`),
      'vexnar/account/lib/client.js',
      // 由 @vexnar/core 的 build-embedded.ts 生成，落进 account/lib。
      'vexnar/account/lib/core-embedded.js',
      'vexnar/account/lib/settings-embedded.js',
      // 构建脚本生成的附随文件，没有单一源文件。
      'vexnar/account/lib/yak-history.proto',
      'vexnar/account/lib/yak-history.NOTICES.txt'
    ].sort(),
    sources: {
      'vexnar/account/lib/client.js': 'vexnar/account/src/client.tsx',
      'vexnar/account/lib/core-embedded.js': 'vexnar-core/src/embedded.ts',
      'vexnar/account/lib/settings-embedded.js': 'vexnar-core/src/settings-embedded.ts'
    }
  },
  {
    name: '@vexnar/dsh-egress',
    artifacts: ['vexnar-egress/index.js'],
    sources: { 'vexnar-egress/index.js': 'vexnar-egress/index.ts' }
  }
]

/** 同一个文件可能被 sources 与 artifacts 各查一次，去重后只报一条。 */
const problems = new Set()

function checkFile(path, reason) {
  const full = join(app, path)
  if (!existsSync(full)) {
    problems.add(`${path} 不存在（${reason}）`)
    return false
  }
  if (statSync(full).size === 0) {
    problems.add(`${path} 是空文件（${reason}）`)
    return false
  }
  return true
}

for (const pack of packages) {
  for (const [artifact, source] of Object.entries(pack.sources)) {
    if (!existsSync(join(app, source))) {
      problems.add(`${pack.name}: 脚本声明的源文件 ${source} 不存在，检查脚本本身`)
    }
    checkFile(artifact, pack.name)
  }
  for (const artifact of pack.artifacts) {
    if (!checkFile(artifact, pack.name)) continue
    if (!artifact.endsWith('.js')) continue
    // bundle 出来的都是 ESM；`node --check` 只做语法，不解析 import。
    try {
      execFileSync(process.execPath, ['--check', join(app, artifact)], { stdio: 'pipe' })
    } catch (error) {
      const detail = String(error.stderr ?? error.message).trim().split('\n').slice(0, 4).join('\n    ')
      problems.add(`${artifact} 语法检查失败：\n    ${detail}`)
    }
  }
}

if (problems.size > 0) {
  console.error(`✗ 构建产物不完整，共 ${problems.size} 项：`)
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('先在 app/ 执行 `pnpm run build` 再打包。')
  process.exit(1)
}

const total = packages.reduce((sum, pack) => sum + pack.artifacts.length, 0)
console.log(`✓ 构建产物齐全：${packages.length} 个 bundle / ${total} 个文件`)
