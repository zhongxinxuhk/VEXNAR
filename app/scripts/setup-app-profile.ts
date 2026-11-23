// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Prepare the isolated VEXNAR dsh profile.
 *
 * The profile is written once, from the shipped web template, and then only
 * ever patched — never recreated — so bundles the user installs from the
 * Plugins page survive every `pnpm run setup`. When the launcher moves to a new
 * data directory, the bundles the previous home still lists are carried over
 * (see `profile-migration.ts`): without that step a new home makes the plugin
 * shop and Craft Anything look deleted while they sit untouched next door.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { planLegacyBundles, readLegacyManifests } from './profile-migration.ts'
import { extrasSpecs, mergeBundleLayer, readExtras } from './vexnar-extras.ts'
import { appDir, modernPython, profileName, runtimeBin, runtimeEnv, vexnarHome } from './vexnar-runtime.ts'

const bin = runtimeBin()
const require = createRequire(await realpath(bin))
const runtimeModule = (name: string): Promise<Record<string, any>> => import(pathToFileURL(require.resolve(name)).href)
const [{ initProfile }, { PROFILE_TEMPLATES }] = await Promise.all([
  runtimeModule('@deepseek-ai/dsh-app-boot'),
  runtimeModule('@deepseek-ai/dsh-official-bundles')
])
const profile = join(vexnarHome(), 'profiles', profileName)
const template: string[] = [...PROFILE_TEMPLATES.web.bundles]
initProfile(profile, template)

const theme = process.env.VEXNAR_THEME === 'off' ? [] : ['dsh-claude-style@^0.21.6']
const themeNames = ['dsh-claude-style']
const bundle = '@vexnar/app-bundle'
const manifestPath = join(profile, 'package.json')

interface Manifest {
  name?: string
  dependencies?: Record<string, string>
  dsh: { profile: { bundles: string[] } }
}

const readManifest = async (): Promise<Manifest> => JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest

const first = await readManifest()
first.name = 'vexnar-profile'
await writeFile(manifestPath, JSON.stringify(first, null, 2) + '\n')

const bundleRoot = process.env.VEXNAR_BUNDLES || process.env.VEXNAR_DSH_BUNDLES
const vxDir = bundleRoot ? resolve(bundleRoot, 'app', 'vexnar') : join(appDir, 'vexnar')
const addons = [vxDir, join(vxDir, 'ui'), join(vxDir, 'account'), join(appDir, 'vexnar-egress')].map(dir => `file:${dir}`)

// ── Extras preset ───────────────────────────────────────────────────────────
// `app/vexnar/extras.json` 是安装时固化的插件预设：插件商店装的 bundle 只写当前
// profile，换机器重跑 setup 不会自动回来。清单里的 spec 进 profile 依赖，包名进
// bundle 层（排在皮肤与 @vexnar/app-bundle 之前）。VEXNAR_EXTRAS=off 可整体跳过。
// 清单缺失时只跳过 extras，不阻断已经可用的安装；清单本身写坏则直接报错。
const extrasFile = process.env.VEXNAR_EXTRAS_MANIFEST || join(vxDir, 'extras.json')
const extras = process.env.VEXNAR_EXTRAS === 'off'
  ? []
  : await readExtras(extrasFile).catch((error) => {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      console.warn(`[vexnar] 未找到预置插件清单 ${extrasFile}，跳过 extras`)
      return []
    }
    throw error
  })
const extraNames = extras.map(item => item.name)
if (extras.length) {
  const own = extras.filter(item => item.runtime !== true).length
  console.log(`[vexnar] 预置插件 ${extras.length} 个（依赖 ${own} 个，运行时自带 ${extras.length - own} 个）：${extraNames.join(', ')}`)
}

const installed = spawnSync('pnpm', ['add', '--force', ...addons, ...theme, ...extrasSpecs(extras)], {
  cwd: profile, env: runtimeEnv(), stdio: 'inherit'
})
if (installed.error) throw installed.error
if (installed.status !== 0) process.exit(installed.status ?? 1)

// ── Legacy homes ────────────────────────────────────────────────────────────
// Bundles the previous data directory lists are reinstalled one by one, so a
// single incompatible package cannot fail the whole setup. VEXNAR_LEGACY_HOME
// adds a source; VEXNAR_MIGRATE_PROFILE=off skips the step.
const legacyHomes: string[] = [process.env.VEXNAR_LEGACY_HOME, join(appDir, '.dsh-home')]
  .filter((home): home is string => home !== undefined && home !== '' && existsSync(home))
const skip = (name: string): boolean => template.includes(name) || themeNames.includes(name) || extraNames.includes(name) || name === bundle || name.startsWith('@vexnar/')
/** Whether the runtime itself ships a package, in which case only its bundle layer entry is missing. */
const provided = (name: string): boolean => {
  try {
    require.resolve(name)
    return true
  } catch {
    return false
  }
}
// 运行时自带的 bundle 有两种来路：dsh 安装里就有（provided），或 profile 依赖里
// 装了同名包（例如 @deepseek-ai/dsh-subagent-codex 是 on-demand 包）。两种都算
// "能解析"，只在这两处都找不到时才提示改名。
const inProfile = (name: string): boolean =>
  existsSync(join(profile, 'node_modules', ...name.split('/'), 'package.json'))
for (const item of extras) {
  if (item.runtime === true && !provided(item.name) && !inProfile(item.name)) {
    console.warn(`[vexnar] 运行时与 profile 里都找不到预置 bundle ${item.name}：升级 dsh 后可能改名，请核对 extras.json`)
  }
}
const plan = process.env.VEXNAR_MIGRATE_PROFILE === 'off'
  ? []
  : planLegacyBundles(readLegacyManifests(legacyHomes), {
    skip,
    provided,
    installed: [...((await readManifest()).dsh.profile.bundles ?? [])]
  })
const carried: string[] = []
for (const { name, version } of plan) {
  // A runtime-shipped bundle has no registry dependency of its own: listing it in the layer is the whole restore.
  if (version === undefined) {
    carried.push(name)
    console.log(`[vexnar] 旧配置里的 ${name} 由运行时自带，已恢复其插件层条目`)
    continue
  }
  const added = spawnSync(process.execPath, [bin, 'plugin', '--profile', profileName, 'add', `${name}@${version}`], {
    cwd: profile, env: runtimeEnv(), stdio: 'inherit'
  })
  if (added.status !== 0) console.warn(`[vexnar] 旧配置里的 ${name}@${version} 未装回，稍后可在插件面板重新安装`)
  else console.log(`[vexnar] 已从旧配置装回 ${name}@${version}`)
}

// ── Bundle layer ────────────────────────────────────────────────────────────
// One entry per bundle, VEXNAR's own rows last: re-running setup reorders but
// never drops a bundle the user installed.
const last = await readManifest()
last.dsh.profile.bundles = mergeBundleLayer({
  existing: last.dsh.profile.bundles ?? [],
  carried,
  extras: extraNames,
  theme: themeNames,
  bundle
})
await writeFile(manifestPath, JSON.stringify(last, null, 2) + '\n')

// ── 灵枢 python 侧的终止信号补丁 ─────────────────────────────────────────────
// `@furongjun1999/dsh-memory` 的 md_cg/mcp_server.py 是裸的 `for line in sys.stdin:`
// 主循环：终端 Ctrl-C / 宿主 SIGTERM 时阻塞读抛 KeyboardInterrupt 逃出 main()，
// 于是 stderr 打一屏 Traceback（看着像崩溃）、sustain/cg 清理整段被跳过、退出码
// 130（mcp-bridge 与 lingshu-bridge 只能按异常退出处理）。上游发布修复版前由
// scripts/patch-md-cg-signals.py 就地补：首个信号优雅下线、第二个信号交还 SIG_DFL。
// 必须在 pnpm add 之后跑——profile 的 node_modules 每次安装都会被整目录替换。
// 失败不阻断安装：补不上只是回到旧行为，setup 不该因此失败。
const python = modernPython()
if (python) {
  const patched = spawnSync(python, [join(appDir, 'scripts', 'patch-md-cg-signals.py')], {
    env: runtimeEnv(), stdio: 'inherit'
  })
  if (patched.error) console.warn(`[vexnar] 灵枢信号补丁未运行：${patched.error.message}`)
  else if (patched.status !== 0) console.warn('[vexnar] 灵枢信号补丁未完全应用（不影响使用，详见上方输出）')
} else {
  console.warn('[vexnar] 未找到 ≥3.10 的 Python，跳过灵枢信号补丁')
}

console.log('[vexnar] 隔离配置已就绪')
