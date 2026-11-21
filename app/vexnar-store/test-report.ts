// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { storeOperations } from './src/operations.ts'
import { buildReport, buildReportHtml, escapeHtml, listReports, saveReport } from './src/report.ts'

/** One assertion result, printed as PASS/FAIL at the end. */
type CheckResult = { name: string; ok: boolean; detail: string | number }

const root = await mkdtemp(join(tmpdir(), 'vexnar-report-'))
const ops = storeOperations(root)
const task = await ops.createTask({ description: 'audit', goal: 'audit example.com' })
// Stored records are `Record<string, unknown>`; the id a task row carries is a string.
const taskId = String(task.id)
const intent = await ops.addNode(taskId, { kind: 'intent', payload: { text: 'probe' }, state: 'running' })
await ops.reportFinding({ task_id: taskId, intent_id: String(intent.id), vulnclass: 'SQL注入', severity: 'high', summary: 'union based', evidence: "id=1' UNION SELECT 1--" })
await ops.addAsset(taskId, { type: 'endpoint', url: 'https://example.com' })
const findings = await ops.writer.list('findings')
const assets = await ops.writer.list('assets')
const report = buildReport({ task: await ops.writer.readRecord('tasks', taskId), findings, assets })
const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail: string | number = '') => results.push({ name, ok, detail })
check('report renders finding', report.markdown.includes('SQL注入') && report.markdown.includes('high 1'), report.markdown.split('\n')[0])
check('report counts assets', report.stats.assets === 1 && report.stats.findings === 1, JSON.stringify(report.stats))

const saved = await saveReport(root, taskId, report.markdown, report.stats)
const listed = await listReports(root, taskId)
check('report saved and listed', saved.bytes > 0 && listed.some((item) => item.id === saved.id), JSON.stringify({ saved, listed }))

const html = buildReportHtml({ task: await ops.writer.readRecord('tasks', taskId), findings, assets })
check('html escapes and renders', html.includes('SQL注入') && html.includes('class="finding high"') && escapeHtml('<x>') === '&lt;x&gt;', html.length)

let failed = false
for (const item of results) { if (!item.ok) failed = true; console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`) }
process.exit(failed ? 1 : 0)
