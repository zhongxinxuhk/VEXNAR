// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import jwt from 'jsonwebtoken'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const token = jwt.sign({}, readFileSync(join(repo, 'jwt.key')), { algorithm: 'HS256', subject: 'VEXNAR', expiresIn: '1h' })
const GO = 'http://127.0.0.1:8787'
const TS = 'http://127.0.0.1:8790'
const headers = { Authorization: `Bearer ${token}` }
const get = async (base, path) => (await fetch(base + path, { headers })).json()
const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))
function diff(left, right, path = '') {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return [`${path}.length ${left.length}/${right.length}`]
    for (let i = 0; i < left.length; i++) { const d = diff(left[i], right[i], `${path}[${i}]`); if (d.length) return d }
    return []
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      const d = diff(left[key], right[key], `${path}.${key}`)
      if (d.length) return d
    }
    return []
  }
  return JSON.stringify(left) === JSON.stringify(right) ? [] : [`${path}: ${JSON.stringify(left)} vs ${JSON.stringify(right)}`]
}
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })

const goTasks = (await get(GO, '/api/tasks')).tasks
const tsTasks = (await get(TS, '/api/tasks')).tasks
const taskFields = ['id', 'exploration_id', 'name', 'description', 'goal', 'paused', 'queued', 'created_unix', 'completed_unix', 'coverage_enabled', 'tokens', 'goals_total', 'goals_met', 'in_flight', 'findings']
const pick = (row) => Object.fromEntries(taskFields.map((k) => [k, row[k]]))
check('tasks core fields', same(goTasks.map(pick), tsTasks.map(pick)), JSON.stringify(diff(canon(goTasks.map(pick)), canon(tsTasks.map(pick))).slice(0,2)))

const goAssets = await get(GO, '/api/assets?type=root_domain&limit=200')
const tsAssets = await get(TS, '/api/assets?type=root_domain&limit=200')
const assetFields = ['id', 'type', 'company_id', 'task_ids', 'domain', 'root_domain', 'last_seen']
const pickAsset = (row) => Object.fromEntries(assetFields.filter((k) => k in row).map((k) => [k, row[k]]))
check('assets core fields', same(goAssets.assets.map(pickAsset), tsAssets.assets.map(pickAsset)), `${goAssets.total}/${tsAssets.total}`)

const goFindings = await get(GO, '/api/exploration/findings')
const tsFindings = await get(TS, '/api/exploration/findings')
const findingFields = ['id', 'finding_id', 'vulnclass', 'name', 'severity', 'status', 'summary', 'evidence']
const pickFinding = (row) => Object.fromEntries(findingFields.filter((k) => k in row).map((k) => [k, row[k]]))
check('findings core fields', same(goFindings.map(pickFinding), tsFindings.map(pickFinding)), JSON.stringify(diff(canon(goFindings.map(pickFinding)), canon(tsFindings.map(pickFinding))).slice(0,2)))

const goStats = await get(GO, '/api/exploration/findings/stats')
const tsStats = await get(TS, '/api/exploration/findings/stats')
check('findings stats', same(goStats, tsStats), JSON.stringify(diff(canon(goStats), canon(tsStats)).slice(0,2)))

const taskId = goTasks.find((t) => t.id === '1823') ? '1823' : goTasks[0].id
const goNodes = await get(GO, `/api/exploration/nodes?task=${taskId}&order=asc&size=100`)
const tsNodes = await get(TS, `/api/exploration/nodes?task=${taskId}&order=asc&size=100`)
const nodeFields = ['id', 'type', 'state', 'priority']
const pickNode = (row) => Object.fromEntries(nodeFields.map((k) => [k, row[k]]))
check('nodes page items', same(goNodes.items.map(pickNode), tsNodes.items.map(pickNode)), JSON.stringify(diff(canon(goNodes.items.map(pickNode)), canon(tsNodes.items.map(pickNode))).slice(0,2)))
const sortEdges = (rows) => [...rows].sort((a, b) => (a.src + a.dst + a.rel).localeCompare(b.src + b.dst + b.rel))
check('nodes page edges', same(sortEdges(goNodes.edges), sortEdges(tsNodes.edges)), `${goNodes.edges.length}/${tsNodes.edges.length}`)

const goIntents = await get(GO, '/api/exploration/intents?task=1823&limit=50')
const tsIntents = await get(TS, '/api/exploration/intents?task=1823&limit=50')
const ids = (value) => (Array.isArray(value) ? value : value.items).map((row) => row.id)
check('intents ids', same(ids(goIntents), ids(tsIntents)), `${ids(goIntents).length}/${ids(tsIntents).length}`)

const goActivity = await get(GO, '/api/exploration/activity/history?task=657&limit=10&session=plan')
const tsActivity = await get(TS, '/api/exploration/activity/history?task=657&limit=10&session=plan')
const seqs = (value) => value.items.map((row) => row.seq)
check('activity history', same(seqs(goActivity), seqs(tsActivity)) && goActivity.snapshot_cursor === tsActivity.snapshot_cursor, `${seqs(goActivity).length}/${seqs(tsActivity).length}`)

const goTokens = await get(GO, '/api/exploration/tokens?task=657')
const tsTokens = await get(TS, '/api/exploration/tokens?task=657')
check('token stats', same(goTokens.workers, tsTokens.workers) && same(goTokens.sessions, tsTokens.sessions) && same(goTokens.total, tsTokens.total), `${goTokens.workers.length}/${tsTokens.workers.length} · sessions ${goTokens.sessions.length}/${tsTokens.sessions.length}`)

const goGoals = await get(GO, '/api/tasks/657/goals')
const tsGoals = await get(TS, '/api/tasks/657/goals')
check('goals', same(goGoals, tsGoals), `${goGoals.goals.length}/${tsGoals.goals.length}`)

const goTaskAssets = await get(GO, '/api/assets?task_id=1137&limit=10')
const tsTaskAssets = await get(TS, '/api/assets?task_id=1137&limit=10')
const assetFields2 = ['id', 'type', 'task_ids', 'domain', 'root_domain', 'port', 'url', 'last_seen']
const pickAsset2 = (row) => Object.fromEntries(assetFields2.filter((key) => key in row).map((key) => [key, row[key]]))
check('task assets', same(goTaskAssets, tsTaskAssets), `${goTaskAssets.total}/${tsTaskAssets.total}`)
const goTaskCounts = await get(GO, '/api/assets/counts?task_id=1137')
const tsTaskCounts = await get(TS, '/api/assets/counts?task_id=1137')
check('task asset counts', same(goTaskCounts, tsTaskCounts))

let failed = false
for (const item of results) { if (!item.ok) failed = true; console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`) }
process.exit(failed ? 1 : 0)
