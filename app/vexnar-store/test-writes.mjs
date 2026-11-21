// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { storeOperations } from './src/operations.ts'
import { StoreConflict } from './src/writer.ts'
import { jsonStore } from './src/json-store.ts'

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
  await ops.writer.put({ table: 'findings', key: '900', record: { ...patched, status: 'ignored' }, expectedRev: 1 })
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

const renamed = await ops.updateTask(task.id, { name: 'renamed', pinned: true })
check('update task name/pin', renamed.name === 'renamed' && renamed.pinned_at !== null, JSON.stringify({ name: renamed.name, pinned: renamed.pinned_at }))
const paused = await ops.controlTask(task.id, 'pause')
const resumed = await ops.controlTask(task.id, 'resume')
check('pause then resume', paused.paused === true && resumed.paused === false, JSON.stringify({ paused: paused.paused, resumed: resumed.paused }))

const category = await ops.createCategory('Batch A')
const assigned = await ops.setTaskCategory(second.id, Number(category.id))
check('category create/assign', assigned.task.category_id === Number(category.id) && assigned.category?.name === 'Batch A', JSON.stringify({ id: category.id, task: assigned.task.id }))
let duplicateCategory = null
try { await ops.createCategory('Batch A') } catch (error) { duplicateCategory = error }
check('duplicate category rejected', duplicateCategory?.status === 409, String(duplicateCategory))
const renamedCategory = await ops.renameCategory(String(category.id), 'Batch B')
check('rename category', renamedCategory.name === 'Batch B', renamedCategory.name)
const cleared = await ops.deleteCategory(String(category.id))
const afterDelete = await ops.writer.readRecord('tasks', second.id)
check('delete category detaches task', cleared.deleted === Number(category.id) && afterDelete?.category_id == null, JSON.stringify({ deleted: cleared.deleted, category: afterDelete?.category_id }))

const template = await ops.createTemplate({ name: 'T1', description: 'd', goal: 'g' })
const updatedTemplate = await ops.updateTemplate(String(template.id), { name: 'T1 renamed' })
const removedTemplate = await ops.deleteTemplate(String(template.id))
check('template lifecycle', updatedTemplate.name === 'T1 renamed' && removedTemplate.deleted === Number(template.id), JSON.stringify({ created: template.id, renamed: updatedTemplate.name }))

await ops.writer.put({ table: 'assets', key: '500', record: { id: 500, type: 'root_domain', domain: 'asset.example', task_ids: [], last_seen: 'x' } })
const attach1 = await ops.attachAssets(second.id, [500])
const attach2 = await ops.attachAssets(second.id, [500])
const detach = await ops.detachAsset(second.id, '500')
check('asset attach/detach', attach1.attached === 1 && attach2.existing === 1 && detach.detached === 500, JSON.stringify({ attach1, attach2, detach }))
let attachMissing = null
try { await ops.attachAssets(second.id, [999999]) } catch (error) { attachMissing = error }
check('attach rejects unknown asset', attachMissing?.status === 404, String(attachMissing))

const scope1 = await ops.addScope(second.id, { kind: 'domain', value: 'scope.example', reason: 'manual' })
const scope2 = await ops.addScope(second.id, { kind: 'domain', value: 'scope.example', reason: 'manual' })
const scopeId = scope1.scopes_added === 1 ? 1 : 2
const scopeDel = await ops.deleteScope(second.id, String(scopeId))
check('scope add/dedupe/delete', scope1.scopes_added === 1 && scope1.assets_linked === 1 && scope2.scopes_existing === 1 && scopeDel.deleted === scopeId, JSON.stringify({ scope1, scope2, scopeDel }))

const channel = await ops.createChannel({ name: 'IM', kind: 'webhook', config: { url: 'http://example' } })
const channelUpdate = await ops.updateChannel(String(channel.id), { enabled: false })
const channelDelete = await ops.deleteChannel(String(channel.id))
check('notify channel lifecycle', channel.id > 0 && channelUpdate.id === channel.id && channelDelete.ok === true, JSON.stringify({ channel, channelUpdate, channelDelete }))

await (async () => {
  const meta = (await import('./src/meta-store.ts')).metaStore(root)
  const tables = await meta.load()
  tables.agents = [{ key: 'goals', name: 'Goals', description: 'd' }]
  tables.tools = [{ key: 'demo_tool', description: 'd', agents: [], enabled: true }]
  await meta.save(tables)
})()
const agentUpdate = await ops.updateAgent('goals', { name: 'Goals 2', description: 'd2' })
const toolUpdate = await ops.updateTool('demo_tool', { enabled: false, agents: ['planner'] })
const metaAfter = await (async () => {
  const meta = (await import('./src/meta-store.ts')).metaStore(root)
  const tables = await meta.load()
  return { agent: tables.agents[0], tool: tables.tools[0] }
})()
check('agent/tool update', agentUpdate.ok && toolUpdate.ok && metaAfter.agent.name === 'Goals 2' && metaAfter.tool.enabled === false, JSON.stringify(metaAfter))

const custom = await ops.createCustomTool({ key: 'demo_custom', description: 'd', kind: 'command', exec: { command: 'echo hi' } })
const customUpdate = await ops.updateCustomTool('demo_custom', { description: 'd2', enabled: false })
const customDelete = await ops.deleteCustomTool('demo_custom')
let customDup = null
try { await ops.createCustomTool({ key: 'demo_tool', kind: 'command' }) } catch (error) { customDup = error }
let customBadKey = null
try { await ops.createCustomTool({ key: 'Bad-Key', kind: 'command' }) } catch (error) { customBadKey = error }
check('custom tool lifecycle', custom.key === 'demo_custom' && customUpdate.ok && customDelete.deleted === 'demo_custom' && customDup?.status === 409 && customBadKey?.status === 400, JSON.stringify({ custom, customDup: customDup?.status, customBadKey: customBadKey?.status }))

const mcp = await ops.saveMcpServer({ name: 'demo-mcp', transport: 'stdio', command: 'npx', args: ['x'] })
const mcpDisabled = await ops.setMcpEnabled(String(mcp.id), false)
const mcpDelete = await ops.deleteMcpServer(String(mcp.id))
check('mcp lifecycle', mcp.id > 0 && mcpDisabled.ok && mcpDelete.deleted === mcp.id, JSON.stringify({ mcp, mcpDisabled, mcpDelete }))

const archived = await ops.archiveTask(second.id)
const archives = await ops.listArchives()
const hiddenByArchive = !(await jsonStore(root).tasks.list()).some((row) => row.id === second.id)
const restored = await ops.restoreArchive(String(archived.id))
const visibleAgain = (await jsonStore(root).tasks.list()).some((row) => row.id === second.id)
const archived2 = await ops.archiveTask(second.id)
const removedArchive = await ops.deleteArchive(String(archived2.id))
check('archive lifecycle', archived.state === 'done' && archives.length === 1 && hiddenByArchive && restored.id === archived.id && visibleAgain && removedArchive.id === archived2.id, JSON.stringify({ archived: archived.id, hiddenByArchive, visibleAgain }))

const goalTask = await ops.createTask({ description: 'goal host', goal: 'host goals' })
await ops.writer.put({ table: 'nodes', key: '1000', record: { id: '1000', exploration_id: Number(goalTask.exploration_id), kind: 'fact', state: 'origin', payload: {}, priority: 0, origin: 'system', created_at: 'x' } })
const goal = await ops.addGoal(goalTask.id, { text: 'prove goals', vulnclass: 'XSS' })
const goalEdge = await ops.writer.readRecord('edges', `1000-spawns-${goal.id}`)
const goalEdit = await ops.editGoal(goalTask.id, goal.id, { text: 'renamed goal', vulnclass: 'SQLi' })
const goalDelete = await ops.deleteGoal(goalTask.id, goal.id)
const goalGone = !(await ops.writer.readRecord('nodes', goal.id))
check('goal lifecycle', goal.state === 'open' && goal.payload.text === 'prove goals' && goalEdge?.rel === 'spawns' && goalEdit.payload.text === 'renamed goal' && goalDelete.deleted === Number(goal.id) && goalGone, JSON.stringify({ id: goal.id, edge: goalEdge?.rel, edit: goalEdit.payload, gone: goalGone }))

const intentNode = { id: '2000', exploration_id: Number(second.exploration_id), kind: 'intent', state: 'running', payload: {}, priority: 1, origin: 'w', created_at: 'x' }
await ops.writer.put({ table: 'nodes', key: '2000', record: intentNode })
const pausedIntent = await ops.controlIntent(second.id, '2000', { action: 'pause' })
const resumedIntent = await ops.controlIntent(second.id, '2000', { action: 'resume' })
const cancelledIntent = await ops.controlIntent(second.id, '2000', { action: 'cancel', reason: 'dup work' })
check('intent control', pausedIntent.state === 'paused' && resumedIntent.state === 'open' && cancelledIntent.state === 'deleted', JSON.stringify({ pausedIntent, resumedIntent, cancelledIntent }))

await ops.writer.put({ table: 'nodes', key: '2001', record: { id: '2001', exploration_id: Number(second.exploration_id), kind: 'intent', state: 'blocked', payload: {}, priority: 1, origin: 'w', created_at: 'x' } })
const rerun = await ops.rerunIntent(second.id, '2001')
const rerunAgain = await ops.rerunIntent(second.id, '2001').catch((error) => error)
check('intent rerun', rerun.reopened === 2001 && rerunAgain?.status === 409, JSON.stringify({ rerun, again: rerunAgain?.status }))

await ops.writer.put({ table: 'nodes', key: '2002', record: { id: '2002', exploration_id: Number(goalTask.exploration_id), kind: 'intent', state: 'paused', payload: {}, priority: 1, origin: 'w', created_at: 'x' } })
const sent = await ops.sendIntentMessage(goalTask.id, '2002', { message: 'steer', request_id: 'req-1' })
const sentAgain = await ops.sendIntentMessage(goalTask.id, '2002', { message: 'steer', request_id: 'req-1' }).catch((error) => error)
check('intent message', sent.state === 'running' && sent.accepted === true && sentAgain?.status === 409, JSON.stringify({ sent, again: sentAgain?.status }))

let staleTask = null
try { await ops.updateTask(task.id, { name: 'stale' }, 1) } catch (error) { staleTask = error }
check('task rev conflict', staleTask instanceof StoreConflict, String(staleTask))

const removed = await ops.deleteTask(task.id)
const store = jsonStore(root)
const listed = await store.tasks.list()
check('delete hides task', removed.deleted === true && !listed.some((row) => row.id === task.id), JSON.stringify(removed))
const survivingFinding = await ops.writer.readRecord('findings', reported.finding_id)
check('findings survive delete', survivingFinding?.id === reported.finding_id, String(survivingFinding?.id))

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
