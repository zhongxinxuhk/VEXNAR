// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { storeOperations } from './src/operations.ts'
import { StoreConflict } from './src/writer.ts'

const root = await mkdtemp(join(tmpdir(), 'vexnar-writes-'))
const ops = storeOperations(root)
const release = await ops.writer.lock()
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })

const task = await ops.createTask({ description: 'write test', goal: 'prove writes' })
check('create task', task.id === '1' && task.rev === 1, JSON.stringify(task))
const second = await ops.createTask({ description: 'second', goal: 'isolated exploration' })
check('exploration allocates', second.exploration_id === Number(task.exploration_id) + 1, JSON.stringify(second))

await ops.writer.put({ table: 'findings', key: '900', record: { id: '900', vulnclass: 'X', severity: 'low', status: 'pending', summary: 's', evidence: 'e', created_at_text: '2026-01-01T00:00:00+08:00' } })
const patched = await ops.patchFinding('900', { status: 'confirmed' })
check('patch finding', patched.status === 'confirmed' && patched.rev === 2, JSON.stringify(patched))

let conflict = null
try {
  await ops.writer.put({ table: 'findings', key: '900', record: { status: 'ignored' }, expectedRev: 1 })
} catch (error) {
  conflict = error
}
check('stale revision conflicts', conflict instanceof StoreConflict, String(conflict))

await ops.writer.put({ table: 'nodes', key: '100', record: { id: '100', exploration_id: Number(task.exploration_id), kind: 'intent', state: 'running', payload: {}, priority: 1, origin: 'test', created_at: 'x' } })
const reported = await ops.reportFinding({ task_id: task.id, intent_id: '100', vulnclass: 'SQL注入', severity: 'high', summary: 'union based', evidence: 'id=1 UNION SELECT ...', worker: 'tester' })
const node = await ops.writer.readRecord('nodes', reported.finding_node_id)
const edge = await ops.writer.readRecord('edges', `100-yields-${reported.finding_node_id}`)
const finding = await ops.writer.readRecord('findings', reported.finding_id)
check('report finding commits graph', node?.kind === 'finding' && node?.state === 'confirmed' && edge?.rel === 'yields' && finding?.node_id === reported.finding_node_id, JSON.stringify({ node: node?.id, edge: edge?.rel, finding: finding?.id }))

let invalidTask = null
try { await ops.reportFinding({ task_id: '99999', vulnclass: 'X', severity: 'low', summary: 's', evidence: 'e' }) } catch (error) { invalidTask = error }
check('report rejects unknown task', invalidTask?.status === 404, String(invalidTask))

// Crash recovery: a prepared journal is replayed.
await writeFile(join(root, 'journal', 'manual.json'), JSON.stringify({
  state: 'prepared',
  ops: [{ table: 'tasks', key: '77', record: { id: '77', exploration_id: 99, name: '', description: 'replayed', goal: 'g', status: 'created', paused: false, queued: false, coverage_enabled: true, created_at_text: 'x', created_unix: 0, completed_at_text: null, completed_unix: 0 } }]
}))
const recovery = await ops.writer.recover()
const replayed = await ops.writer.readRecord('tasks', '77')
check('journal replay', recovery.replayed === 1 && replayed?.id === '77', JSON.stringify({ recovery, replayed }))
const journalState = JSON.parse(await readFile(join(root, 'journal', 'manual.json'), 'utf8')).state
check('journal committed', journalState === 'committed', journalState)

await release()
let locked = false
try {
  const second = storeOperations(root)
  await second.writer.lock()
} catch {
  locked = true
}
check('lock released', !locked)

let failed = false
for (const item of results) { if (!item.ok) failed = true; console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`) }
console.log(`root: ${root}`)
process.exit(failed ? 1 : 0)
