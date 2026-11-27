// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Harness 干净 profile 冒烟。
 *
 * 走的是一条真实的新用户路径，不读本机已有的 `.vexnar-home`：
 *
 *   1. 建临时 `VEXNAR_HOME`，跑一次 `pnpm run setup`；
 *   2. 从已安装的 `@vexnar/app-bundle` 读 preset，断言 8 个且 id 完全匹配；
 *   3. 在临时 store 上启动 core（TS 单进程、SQLite），断言新库的 agent 为 0、
 *      领域工具已注册并绑定 agent、Web 只走进程内 REST、8792 没有监听；
 *   4. 负向自检：复制 patch、删掉一个 preset，确认同一个检查器会拒绝 7/8。
 *
 * 默认关闭 extras/theme，避免冒烟依赖 GitHub tarball 的网速；`--full` 才装
 * 预置插件。P1-6 起 core 不再自己开 Web MCP，因此直接断言 8792 没有监听。
 *
 * 用法：
 *   pnpm exec tsx scripts/smoke-harness.ts
 *   pnpm exec tsx scripts/smoke-harness.ts --keep
 *   pnpm exec tsx scripts/smoke-harness.ts --full
 *   pnpm exec tsx scripts/smoke-harness.ts --check <cordis.patch.yml>
 *
 * 退出码：0 = 通过；1 = 任一断言或 setup 失败。
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { readPresets, type PresetRow } from './harness-topology.ts'
import { appDir, profileName } from './vexnar-runtime.ts'
import type { TopologySnapshot } from '../vexnar-core/src/topology.ts'

/** 与 `app/vexnar/cordis.patch.yml` 的 agent preset 契约一致。 */
const EXPECTED_PRESETS = [
  'vexnar-goals',
  'vexnar-planner',
  'vexnar-main',
  'vexnar-worker',
  'vexnar-auto',
  'vexnar-pentest',
  'vexnar-reporter',
  'vexnar-retester'
] as const

/** 领域工具的最小稳定集合；只用 key，避免把描述文案写进冒烟。 */
const REQUIRED_DOMAIN_TOOLS = [
  'add_intent',
  'graph_overview',
  'list_findings',
  'report_finding',
  'record_fact',
  'list_tasks'
] as const

const MIN_DOMAIN_TOOLS = 10
const SETUP_TIMEOUT_MS = 300_000
const LEGACY_WEB_MCP_PORT = 8792

interface Options {
  keep: boolean
  full: boolean
  help: boolean
  home?: string
  check?: string
}

const USAGE = `用法：pnpm exec tsx scripts/smoke-harness.ts [选项]

  --keep                 保留临时 VEXNAR_HOME（默认成功即删，失败保留）
  --full                 安装 extras 与 theme（默认关闭，避免联网拉 GitHub tarball）
  --home <dir>           复用指定数据目录（不会自动删除）
  --check <patch>        只校验一个 cordis.patch.yml 的 preset 集合后退出
  -h, --help             显示本帮助
`

function takeValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag} 缺少参数`)
  return value
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { keep: false, full: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    switch (arg) {
      case '--keep':
        options.keep = true
        break
      case '--full':
        options.full = true
        break
      case '--home':
        options.home = takeValue(argv, index, arg)
        index += 1
        break
      case '--check':
        options.check = takeValue(argv, index, arg)
        index += 1
        break
      case '-h':
      case '--help':
        options.help = true
        break
      default:
        throw new Error(`未知参数：${arg}`)
    }
  }
  return options
}

function presetProblems(rows: readonly PresetRow[]): string[] {
  const ids = rows.map((row) => row.id)
  const problems: string[] = []
  const missing = EXPECTED_PRESETS.filter((id) => !ids.includes(id))
  const unexpected = ids.filter((id) => !(EXPECTED_PRESETS as readonly string[]).includes(id))
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
  if (missing.length) problems.push(`缺少 preset: ${missing.join(', ')}`)
  if (unexpected.length) problems.push(`多出未知 preset: ${[...new Set(unexpected)].join(', ')}`)
  if (duplicates.length) problems.push(`重复 preset: ${[...new Set(duplicates)].join(', ')}`)
  if (rows.length !== EXPECTED_PRESETS.length) problems.push(`preset 数 ${rows.length} != ${EXPECTED_PRESETS.length}`)
  return problems
}

function assertPresetRows(rows: readonly PresetRow[], label: string): void {
  const problems = presetProblems(rows)
  if (problems.length) throw new Error(`${label} 校验失败：${problems.join('；')}`)
}

/** 只用于负向用例：删掉一个 preset 的顶层 block，不碰真实 profile。 */
function removePresetBlock(text: string, id: string): string {
  const lines = text.split(/\r?\n/u)
  const marker = new RegExp(`^\\s*-\\s+id:\\s+${id}\\s*$`, 'u')
  const start = lines.findIndex((line) => marker.test(line))
  if (start < 0) throw new Error(`patch 里找不到 preset block：${id}`)
  let end = start + 1
  while (end < lines.length && !/^\s*-\s+id:\s+preset-[A-Za-z0-9_-]+\s*$/u.test(lines[end]!)) end += 1
  return [...lines.slice(0, start), ...lines.slice(end)].join('\n')
}

async function portListening(port: number): Promise<boolean> {
  return await new Promise((resolvePort) => {
    const socket = connect({ port, host: '127.0.0.1' })
    const finish = (listening: boolean) => {
      socket.destroy()
      resolvePort(listening)
    }
    socket.setTimeout(500, () => finish(false))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

function tail(text: string | null | undefined, max = 30): string {
  const lines = String(text ?? '').trimEnd().split(/\r?\n/u)
  return lines.slice(-max).join('\n')
}

function setupEnv(home: string, full: boolean): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    VEXNAR_HOME: home,
    VEXNAR_MIGRATE_PROFILE: 'off',
    VEXNAR_EXTRAS: full ? 'on' : 'off',
    VEXNAR_THEME: full ? 'on' : 'off'
  }
  // setup 的 vexnarHome() 会把继承来的 DSH_HOME 也当成原版客户端目录；
  // 冒烟只要临时 VEXNAR_HOME，DSH_HOME 由 setup 自己注入。
  for (const name of [
    'DSH_HOME',
    'VEXNAR_LEGACY_HOME',
    'VEXNAR_APP_DIR',
    'VEXNAR_RUNTIME',
    'VEXNAR_BUNDLES',
    'VEXNAR_DSH_BUNDLES',
    'VEXNAR_EXTRAS_MANIFEST'
  ]) delete env[name]
  return env
}

async function runSetup(home: string, full: boolean): Promise<void> {
  const started = Date.now()
  const result = spawnSync('pnpm', ['run', 'setup'], {
    cwd: appDir,
    env: setupEnv(home, full),
    encoding: 'utf8',
    timeout: SETUP_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  if (result.error) throw new Error(`setup 无法执行：${result.error.message}`)
  if (result.status !== 0) {
    console.error(tail(result.stdout))
    console.error(tail(result.stderr))
    throw new Error(`setup 退出码 ${String(result.status)}`)
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`[2/5] setup 完成（${seconds}s，extras/theme ${full ? '开启' : '关闭'}）`)
}

function configureCoreEnv(home: string): void {
  process.env.DSH_HOME = home
  process.env.VEXNAR_HOME = home
  process.env.VEXNAR_STORE = 'sqlite'
  process.env.VEXNAR_STORE_ROOT = join(home, 'vexnar', 'store')
  process.env.VEXNAR_RUNTIME_MODE = 'ts'
  process.env.VEXNAR_TASK_CONCURRENCY = '1'
  process.env.VEXNAR_TRAFFIC_DIR = join(home, 'traffic')
  // 干净冒烟只测 TS/SQLite 主路径：不继承宿主的 Go、PG、代理或额外 token。
  for (const name of [
    'PORT',
    'VEXNAR_GO',
    'VEXNAR_GO_URL',
    'VEXNAR_PG_DSN',
    'VEXNAR_PG_URL',
    'VEXNAR_EGRESS',
    'VEXNAR_CORE_EMBEDDED',
    'VEXNAR_DESKTOP_TOKEN',
    'VEXNAR_API_TOKEN',
    'VEXNAR_WEB_MCP_PORT',
    'VEXNAR_WEB_MCP_TOKEN',
    'VEXNAR_WEB_ADVERSARIAL'
  ]) delete process.env[name]
}

async function assertInstalledProfile(profileDir: string): Promise<{ patch: string; presets: PresetRow[] }> {
  const manifestPath = join(profileDir, 'package.json')
  if (!existsSync(manifestPath)) throw new Error(`profile 清单不存在：${manifestPath}`)
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    dsh?: { profile?: { bundles?: string[] } }
  }
  const bundles = manifest.dsh?.profile?.bundles ?? []
  if (!bundles.includes('@vexnar/app-bundle')) {
    throw new Error(`profile bundle 层缺少 @vexnar/app-bundle：${bundles.join(', ')}`)
  }

  const patch = join(profileDir, 'node_modules', '@vexnar', 'app-bundle', 'cordis.patch.yml')
  if (!existsSync(patch)) throw new Error(`已安装的 app-bundle 缺 cordis.patch.yml：${patch}`)
  const patchText = await readFile(patch, 'utf8')
  if (patchText.includes("'vexnar-web'")) throw new Error('cordis.patch.yml 仍注册 vexnar-web MCP')
  if (/VEXNAR_WEB_MCP_(?:TOKEN|PORT)/u.test(patchText)) {
    throw new Error('cordis.patch.yml 仍注入 VEXNAR_WEB_MCP_TOKEN/PORT')
  }
  const presets = readPresets(patch)
  assertPresetRows(presets, patch)
  return { patch, presets }
}

async function negativePresetCase(home: string, patch: string): Promise<void> {
  const text = await readFile(patch, 'utf8')
  const corrupt = join(home, 'negative', 'cordis.patch.yml')
  await mkdir(dirname(corrupt), { recursive: true })
  await writeFile(corrupt, removePresetBlock(text, 'preset-vexnar-goals'))
  const broken = readPresets(corrupt)
  if (broken.length !== EXPECTED_PRESETS.length - 1) {
    throw new Error(`负向用例构造失败：删一个 preset 后读到 ${broken.length} 个`)
  }
  let rejected = false
  let message = ''
  try {
    assertPresetRows(broken, corrupt)
  } catch (error) {
    rejected = true
    message = error instanceof Error ? error.message : String(error)
  }
  if (!rejected) throw new Error('负向用例失败：删掉一个 preset 后检查器仍然通过')
  console.log(`[4/5] 负向用例通过：删 preset-vexnar-goals 后只剩 7 个，检查器拒绝（${message}）`)
}

async function runCore(home: string): Promise<TopologySnapshot> {
  console.log('[5/5] 启动 core（sqlite，Web REST in-process，无 8792 MCP）')
  configureCoreEnv(home)

  const runtime = await import('../vexnar-core/src/runtime.ts')
  const routes = await import('../vexnar-core/src/routes.ts')
  const web = await import('../vexnar-core/src/web.ts')
  try {
    await runtime.startRuntime()
    const webStatus = await web.webStatus()
    if (webStatus.ready !== true) throw new Error(`Web 引擎未就绪：${JSON.stringify(webStatus)}`)
    if (webStatus.mode !== 'in-process' || webStatus.mcp !== null) {
      throw new Error(`Web 引擎仍暴露 MCP：${JSON.stringify(webStatus)}`)
    }
    if (await portListening(LEGACY_WEB_MCP_PORT)) {
      throw new Error(`127.0.0.1:${LEGACY_WEB_MCP_PORT} 仍有监听`)
    }

    const response = await routes.api.request('/api/_topology')
    if (!response.ok) throw new Error(`GET /api/_topology HTTP ${response.status}`)
    const snapshot = await response.json() as TopologySnapshot

    const problems: string[] = []
    if (!snapshot.runtime.started) problems.push('runtime.started=false')
    if (!snapshot.runtime.store_locked) problems.push('runtime.store_locked=false')
    if (snapshot.store.backend !== 'sqlite') problems.push(`store.backend=${snapshot.store.backend} 不是 sqlite`)
    if (snapshot.agents.total !== 0) problems.push(`新库 agent 数 ${snapshot.agents.total} != 0`)
    if (snapshot.agents.run_artifacts !== 0) problems.push(`新库 run_artifacts=${snapshot.agents.run_artifacts} != 0`)
    if (snapshot.tools.total < MIN_DOMAIN_TOOLS) problems.push(`工具总数 ${snapshot.tools.total} < ${MIN_DOMAIN_TOOLS}`)
    if (snapshot.tools.enabled < MIN_DOMAIN_TOOLS) problems.push(`启用工具 ${snapshot.tools.enabled} < ${MIN_DOMAIN_TOOLS}`)
    if (snapshot.tools.bound < MIN_DOMAIN_TOOLS) problems.push(`绑定 agent 的工具 ${snapshot.tools.bound} < ${MIN_DOMAIN_TOOLS}`)
    for (const key of REQUIRED_DOMAIN_TOOLS) {
      if (!snapshot.tools.keys.includes(key)) problems.push(`缺少领域工具 ${key}`)
    }
    if (snapshot.runtime.go.enabled) problems.push('VEXNAR_GO 仍处于启用状态')
    if (snapshot.runtime.web_mcp !== null) problems.push(`topology.runtime.web_mcp=${snapshot.runtime.web_mcp} != null`)
    if (snapshot.web.mode !== 'in-process') problems.push(`topology.web.mode=${snapshot.web.mode} != in-process`)
    if (snapshot.web.mcp_port !== null) problems.push(`topology.web.mcp_port=${snapshot.web.mcp_port} != null`)
    if (snapshot.web.mcp_url !== null) problems.push(`topology.web.mcp_url=${snapshot.web.mcp_url} != null`)
    if (snapshot.listeners.some((item) => item.name === 'web-mcp')) problems.push('topology.listeners 仍含 web-mcp')
    if (snapshot.env.VEXNAR_WEB_MCP_PORT) problems.push('topology.env 仍注入 VEXNAR_WEB_MCP_PORT')
    if (problems.length) throw new Error(problems.join('；'))

    console.log(`      agents: total=${snapshot.agents.total} enabled=${snapshot.agents.enabled} run_artifacts=${snapshot.agents.run_artifacts}`)
    console.log(`      tools: total=${snapshot.tools.total} enabled=${snapshot.tools.enabled} bound=${snapshot.tools.bound}`)
    console.log(`      mcp: total=${snapshot.mcp.total} enabled=${snapshot.mcp.enabled} servers=${snapshot.mcp.servers.map((server) => `${server.name}:${server.enabled ? 'on' : 'off'}`).join(', ')}`)
    console.log(`      store: ${snapshot.store.backend} ${snapshot.store.db_path ?? snapshot.store.root}`)
    console.log('      web: in-process (no 8792 MCP)')
    console.log(`      tools(${snapshot.tools.keys.length}): ${snapshot.tools.keys.join(', ')}`)
    return snapshot
  } finally {
    await runtime.stopRuntime().catch((error) => {
      console.error(`[smoke] 停止 core 失败：${error instanceof Error ? error.message : String(error)}`)
    })
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(USAGE)
    return
  }
  if (options.check !== undefined) {
    const rows = readPresets(resolve(options.check))
    assertPresetRows(rows, resolve(options.check))
    console.log(`PRESET CHECK PASS ${rows.length}/${EXPECTED_PRESETS.length}：${rows.map((row) => row.id).join(', ')}`)
    return
  }

  const providedHome = options.home !== undefined
  const home = providedHome ? resolve(options.home!) : await mkdtemp(join(tmpdir(), 'vexnar-smoke-'))
  const profileDir = join(home, 'profiles', profileName)
  let keep = options.keep || providedHome

  try {
    console.log(`[1/5] 临时 VEXNAR_HOME=${home}`)
    await runSetup(home, options.full)

    const { patch, presets } = await assertInstalledProfile(profileDir)
    console.log(`[3/5] presets ${presets.length}/${EXPECTED_PRESETS.length}：${presets.map((preset) => `${preset.id}(${preset.name})`).join(', ')}`)
    console.log(`      patch: ${patch}`)

    await negativePresetCase(home, patch)
    const snapshot = await runCore(home)
    console.log(`SMOKE PASS ${presets.length} presets / tools ${snapshot.tools.enabled}/${snapshot.tools.total}（bound ${snapshot.tools.bound}）/ 干净 SQLite store`)
  } catch (error) {
    keep = true
    console.error(`\n[smoke] FAIL ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  } finally {
    if (keep) {
      console.log(`临时目录保留：${home}`)
    } else {
      await rm(home, { recursive: true, force: true })
    }
  }
}

try {
  await main()
} catch (error) {
  console.error(`[smoke] FAIL ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
