// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { storeOperations } from './src/operations.ts'
import { buildReport } from './src/report.ts'

const root = await mkdtemp(join(tmpdir(), 'vexnar-report-'))
const ops = storeOperations(root)
const task = await ops.createTask({ description: 'audit', goal: 'audit example.com' })
const intent = await ops.addNode(task.id, { kind: 'intent', payload: { text: 'probe' }, state: 'running' })
await ops.reportFinding({ task_id: task.id, intent_id: String(intent.id), vulnclass: 'SQL注入', severity: 'high', summary: 'union based', evidence: "id=1' UNION SELECT 1--" })
await ops.addAsset(task.id, { type: 'endpoint', url: 'https://example.com' })
const findings = []
for (const name of await (await import('node:fs/promises')).readdir(join(root, 'findings'))) {
  if (name.endsWith('.json')) findings.push(JSON.parse(await (await import('node:fs/promises')).readFile(join(root, 'findings', name), 'utf8')).record)
}
const assets = []
for (const name of await (await import('node:fs/promises')).readdir(join(root, 'assets'))) {
  if (name.endsWith('.json')) assets.push(JSON.parse(await (await import('node:fs/promises')).readFile(join(root, 'assets', name), 'utf8')).record)
}
const report = buildReport({ task: await ops.writer.readRecord('tasks', task.id), findings, assets })
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })
check('report renders finding', report.markdown.includes('SQL注入') && report.markdown.includes('high 1'), report.markdown.split('\n')[0])
check('report counts assets', report.stats.assets === 1 && report.stats.findings === 1, JSON.stringify(report.stats))

let failed = false
for (const item of results) { if (!item.ok) failed = true; console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`) }
process.exit(failed ? 1 : 0)
