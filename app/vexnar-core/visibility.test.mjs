// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Store root must be set BEFORE importing the route module: context.ts resolves
// the store directory (SQLite file + meta tables) at module load time.
const root = await mkdtemp(join(tmpdir(), 'vexnar-visibility-'))
process.env.VEXNAR_STORE_ROOT = root
process.env.VEXNAR_STORE = 'sqlite'
delete process.env.VEXNAR_GATEWAY_TOKEN

const { meta, operations } = await import('./src/context.ts')
const { register } = await import('./src/routes/visibility.ts')
const { Hono } = await import('hono')

const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })

const app = new Hono()
register(app)

const json = async (response) => {
  const text = await response.text()
  try { return { status: response.status, body: JSON.parse(text) } }
  catch { return { status: response.status, body: text } }
}

const req = (path, init = {}) => app.request(path, init)
const jget = async (path) => json(await req(path))
const jpost = async (path, body) => json(await req(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

try {
  // ── 1. 资源侧可见性：开启 / 读取 / 关闭（幂等）────────────────────────────
  const on = await jpost('/api/visibility/toggle', { agent_id: 'auto', kind: 'mcp', resource_id: 7, visible: true })
  check('toggle mcp visibility on', on.status === 200 && on.body.ok === true && on.body.agent_id === 'auto' && on.body.kind === 'mcp' && on.body.resource_id === 7 && on.body.visible === true, JSON.stringify(on.body))

  const read1 = await jget('/api/visibility/mcp/7')
  check('GET /api/visibility/mcp/7 lists agent', read1.status === 200 && Array.isArray(read1.body.agents) && read1.body.agents.includes('auto'), JSON.stringify(read1.body))

  // 第二个 agent + 另一个资源，验证按 (kind,id) 精确隔离
  await jpost('/api/visibility/toggle', { agent_id: 'recon', kind: 'mcp', resource_id: 7, visible: true })
  await jpost('/api/visibility/toggle', { agent_id: 'auto', kind: 'mcp', resource_id: 8, visible: true })
  const read2 = await jget('/api/visibility/mcp/7')
  check('visibility is per-resource', JSON.stringify(read2.body.agents) === JSON.stringify(['auto', 'recon']), JSON.stringify(read2.body.agents))
  const readOther = await jget('/api/visibility/mcp/8')
  check('other resource isolated', JSON.stringify(readOther.body.agents) === JSON.stringify(['auto']), JSON.stringify(readOther.body.agents))

  const off = await jpost('/api/visibility/toggle', { agent_id: 'auto', kind: 'mcp', resource_id: 7, visible: false })
  check('toggle mcp visibility off', off.status === 200 && off.body.visible === false, JSON.stringify(off.body))
  const read3 = await jget('/api/visibility/mcp/7')
  check('agent removed after off', JSON.stringify(read3.body.agents) === JSON.stringify(['recon']), JSON.stringify(read3.body.agents))

  const offAgain = await jpost('/api/visibility/toggle', { agent_id: 'auto', kind: 'mcp', resource_id: 7, visible: false })
  const read4 = await jget('/api/visibility/mcp/7')
  check('toggle off is idempotent', offAgain.status === 200 && JSON.stringify(read4.body.agents) === JSON.stringify(['recon']), JSON.stringify(read4.body.agents))

  const onAgain = await jpost('/api/visibility/toggle', { agent_id: 'auto', kind: 'mcp', resource_id: 7, visible: true })
  const read5 = await jget('/api/visibility/mcp/7')
  check('toggle on is idempotent (no duplicate rows)', onAgain.status === 200 && JSON.stringify(read5.body.agents) === JSON.stringify(['auto', 'recon']), JSON.stringify(read5.body.agents))

  const emptyKind = await jget('/api/visibility/unknown_kind/7')
  check('unknown kind returns empty list', emptyKind.status === 200 && emptyKind.body.agents.length === 0, JSON.stringify(emptyKind.body))

  // ── 2. 入参校验 ────────────────────────────────────────────────────────────
  const badId = await jpost('/api/visibility/toggle', { agent_id: 'auto', kind: 'mcp', resource_id: 'abc', visible: true })
  check('bad resource_id rejected', badId.status === 400, `status=${badId.status} body=${JSON.stringify(badId.body)}`)

  const negId = await jpost('/api/visibility/toggle', { agent_id: 'auto', kind: 'mcp', resource_id: -3, visible: true })
  check('negative resource_id rejected', negId.status === 400, `status=${negId.status}`)

  const noAgent = await jpost('/api/visibility/toggle', { kind: 'mcp', resource_id: 1, visible: true })
  check('missing agent_id rejected', noAgent.status === 400, `status=${noAgent.status}`)

  const badKind = await jpost('/api/visibility/toggle', { agent_id: 'auto', kind: 'Bad Kind!', resource_id: 1, visible: true })
  check('bad kind rejected', badKind.status === 400, `status=${badKind.status}`)

  const badVisible = await jpost('/api/visibility/toggle', { agent_id: 'auto', kind: 'mcp', resource_id: 1, visible: 'yes' })
  check('non-boolean visible rejected', badVisible.status === 400, `status=${badVisible.status}`)

  const badPath = await jget('/api/visibility/mcp/not-a-number')
  check('invalid path id rejected', badPath.status === 400, `status=${badPath.status}`)

  // ── 3. skill 侧可见性 ─────────────────────────────────────────────────────
  const skillEmpty = await jget('/api/visibility/skill/demo-skill')
  check('skill visibility starts empty', skillEmpty.status === 200 && skillEmpty.body.agents.length === 0, JSON.stringify(skillEmpty.body))

  const skillOn = await jpost('/api/visibility/skill/toggle', { agent_id: 'auto', skill_name: 'demo-skill', visible: true })
  check('toggle skill visibility on', skillOn.status === 200 && skillOn.body.ok === true && skillOn.body.skill_name === 'demo-skill', JSON.stringify(skillOn.body))

  const skillRead = await jget('/api/visibility/skill/demo-skill')
  check('GET /api/visibility/skill/:name lists agent', JSON.stringify(skillRead.body.agents) === JSON.stringify(['auto']), JSON.stringify(skillRead.body.agents))

  const skillOther = await jget('/api/visibility/skill/other-skill')
  check('skill visibility is per-name', skillOther.body.agents.length === 0, JSON.stringify(skillOther.body.agents))

  const skillOff = await jpost('/api/visibility/skill/toggle', { agent_id: 'auto', skill_name: 'demo-skill', visible: false })
  const skillAfter = await jget('/api/visibility/skill/demo-skill')
  check('toggle skill visibility off', skillOff.status === 200 && skillAfter.body.agents.length === 0, JSON.stringify(skillAfter.body.agents))

  const skillBadName = await jget('/api/visibility/skill/bad%2Fname')
  check('skill name with slash rejected', skillBadName.status === 400, `status=${skillBadName.status}`)

  const skillNoName = await jpost('/api/visibility/skill/toggle', { agent_id: 'auto', visible: true })
  check('missing skill_name rejected', skillNoName.status === 400, `status=${skillNoName.status}`)

  // 资源侧与 skill 侧互不串表
  const crossRead = await jget('/api/visibility/skill/7')
  check('skill table does not leak resource rows', crossRead.status === 200 && crossRead.body.agents.length === 0, JSON.stringify(crossRead.body.agents))

  // ── 4. commands 目录：内置 + meta tools 聚合 ──────────────────────────────
  const before = await jget('/api/commands')
  const builtinOnly = Array.isArray(before.body.commands) && before.body.commands.some((cmd) => cmd.tool === 'run_command') && before.body.commands.every((cmd) => cmd.source === 'builtin')
  check('commands lists builtin catalog', before.status === 200 && builtinOnly && before.body.total >= 20, `total=${before.body.total}`)

  // meta 的 tools 表：一个自定义工具 + 一个内置工具的覆盖行（agents/enabled 覆盖）
  await meta.save({
    tools: [
      { key: 'demo_tool', system: false, kind: 'command', description: '演示用自定义命令', agents: ['auto'], enabled: true, exec: { command: 'echo hi' }, calls: 4, deferred: true },
      { key: 'run_command', system: true, kind: 'shell', description: '在沙箱里执行一条 shell 命令', agents: ['auto', 'recon'], enabled: false, calls: 9 }
    ]
  })

  const after = await jget('/api/commands?size=200')
  const custom = after.body.commands.find((cmd) => cmd.tool === 'demo_tool')
  check('meta custom tool appears in commands', Boolean(custom) && custom.source === 'meta' && custom.kind === 'command' && custom.description === '演示用自定义命令' && custom.deferred === true && JSON.stringify(custom.agents) === JSON.stringify(['auto']) && custom.calls === 4, JSON.stringify(custom))

  const overridden = after.body.commands.find((cmd) => cmd.tool === 'run_command')
  check('meta row overrides builtin metadata', Boolean(overridden) && overridden.source === 'meta' && overridden.enabled === false && overridden.kind === 'shell' && JSON.stringify(overridden.agents) === JSON.stringify(['auto', 'recon']), JSON.stringify(overridden))

  const qFiltered = await jget('/api/commands?q=demo')
  check('commands q filter', qFiltered.body.total === 1 && qFiltered.body.commands[0].tool === 'demo_tool', JSON.stringify(qFiltered.body.commands.map((cmd) => cmd.tool)))

  const paged = await jget('/api/commands?page=0&size=5')
  const paged2 = await jget('/api/commands?page=1&size=5')
  const totalAll = (await jget('/api/commands?size=200')).body.total
  check('commands pagination', paged.body.commands.length === 5 && paged2.body.commands.length === 5 && paged.body.total === totalAll && paged.body.commands[0].tool !== paged2.body.commands[0].tool, `size=${paged.body.commands.length} total=${paged.body.total}`)

  const sorted = [...after.body.commands].map((cmd) => cmd.tool)
  check('commands sorted by tool', JSON.stringify(sorted) === JSON.stringify([...sorted].sort()), sorted.slice(0, 3).join(','))

  // ── 5. commands 统计：activity 账本叠加 ───────────────────────────────────
  await operations.writer.commit([
    { table: 'activity', key: '1', record: { id: '1', exploration_id: 11, kind: 'tool_result', worker: 'auto', tool: 'nmap', summary: 'nmap -sV', is_error: false, metadata: {}, created_at: '2026-11-21T10:00:00Z', created_unix: 1 } },
    { table: 'activity', key: '2', record: { id: '2', exploration_id: 11, kind: 'tool_result', worker: 'auto', tool: 'nmap', summary: 'nmap -p-', is_error: true, metadata: {}, created_at: '2026-11-21T10:05:00Z', created_unix: 2 } },
    { table: 'activity', key: '3', record: { id: '3', exploration_id: 12, kind: 'tool_result', worker: 'recon', tool: 'ffuf', summary: 'ffuf', is_error: false, metadata: {}, created_at: '2026-11-21T11:00:00Z', created_unix: 3 } },
    { table: 'activity', key: '4', record: { id: '4', exploration_id: 11, kind: 'tool_result', worker: 'auto', tool: 'mystery_tool', summary: 'x', is_error: false, metadata: {}, created_at: '2026-11-21T09:00:00Z', created_unix: 4 } }
  ])

  const stats = await jget('/api/commands/stats')
  const nmap = stats.body.stats.find((row) => row.tool === 'nmap')
  check('stats counts nmap executions', stats.status === 200 && Boolean(nmap) && nmap.total === 2 && nmap.errors === 1 && nmap.last_used === '2026-11-21T10:05:00Z', JSON.stringify(nmap))

  check('stats sorted by total desc', JSON.stringify(stats.body.stats.map((row) => row.total)) === JSON.stringify([...stats.body.stats.map((row) => row.total)].sort((a, b) => b - a)), JSON.stringify(stats.body.stats.slice(0, 3).map((row) => [row.tool, row.total])))

  const unknown = stats.body.stats.find((row) => row.tool === 'mystery_tool')
  check('stats include ledger-only tool', Boolean(unknown) && unknown.total === 1 && unknown.kind === 'ledger', JSON.stringify(unknown))

  const statsTask = await jget('/api/commands/stats?task=11')
  const nmapTask = statsTask.body.stats.find((row) => row.tool === 'nmap')
  const ffufTask = statsTask.body.stats.find((row) => row.tool === 'ffuf')
  check('stats task filter', Boolean(nmapTask) && nmapTask.total === 2 && Boolean(ffufTask) && ffufTask.total === 0, JSON.stringify({ nmap: nmapTask?.total, ffuf: ffufTask?.total }))

  const statsQ = await jget('/api/commands/stats?q=ffuf')
  const ffufQ = statsQ.body.stats.find((row) => row.tool === 'ffuf')
  // q 匹配 tool / description / kind：run_tool 的描述里提到 ffuf，所以也算命中。
  const narrowed = statsQ.body.total > 0 && statsQ.body.total < stats.body.total
  check('stats q filter', Boolean(ffufQ) && ffufQ.total === 1 && narrowed, JSON.stringify(statsQ.body.stats.map((row) => [row.tool, row.total])))

  const listTask = await jget('/api/commands?task=11')
  const nmapRow = listTask.body.commands.find((cmd) => cmd.tool === 'nmap')
  check('commands list reflects ledger counts', Boolean(nmapRow) && nmapRow.exec_total === 2 && nmapRow.exec_errors === 1 && nmapRow.last_used === '2026-11-21T10:05:00Z', JSON.stringify(nmapRow))

  const lenientTask = await jget('/api/commands/stats?task=not-a-number')
  check('unparsable task filter is lenient', lenientTask.status === 200 && lenientTask.body.stats.find((row) => row.tool === 'nmap').total >= 2, `status=${lenientTask.status}`)

  const afterLedger = await jget('/api/commands?size=200')
  check('catalog keeps meta calls alongside exec counts', afterLedger.body.commands.find((cmd) => cmd.tool === 'demo_tool').calls === 4 && afterLedger.body.commands.find((cmd) => cmd.tool === 'demo_tool').exec_total === 0, JSON.stringify(afterLedger.body.commands.find((cmd) => cmd.tool === 'demo_tool')))

  // ── 6. 可见性持久化：写进 meta 后可重新读回 ───────────────────────────────
  const persisted = await meta.table('visibility')
  check('visibility rows stored in meta', Array.isArray(persisted) && persisted.some((row) => row.kind === 'mcp' && Number(row.resource_id) === 7 && row.agent === 'auto' && row.enabled === true), JSON.stringify(persisted))
  const persistedSkills = await meta.table('skillVisibility')
  check('skill rows stored separately', Array.isArray(persistedSkills) && persistedSkills.every((row) => row.skill !== undefined), JSON.stringify(persistedSkills))
} finally {
  // temp store left on disk for inspection
}

const pass = results.filter((r) => r.ok).length
const fail = results.filter((r) => !r.ok).length
for (const r of results) {
  console.log(`${r.ok ? '[PASS]' : '[FAIL]'} ${r.name}${r.ok ? '' : ` :: ${r.detail}`}`)
}
console.log(`\nvisibility.test: ${pass} pass, ${fail} fail`)
console.log(`store root: ${root}`)
process.exit(fail ? 1 : 0)
