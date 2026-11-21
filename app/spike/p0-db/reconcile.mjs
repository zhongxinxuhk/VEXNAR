// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * P0-1 reconciler: TS read paths vs the running Go API.
 *
 * For each domain the TS rows are mapped onto the Go DTO's stable fields and
 * compared by id. Derived fields (task status/metrics) are reported separately
 * because their source is the engine, not the rows.
 *
 *   node reconcile.mjs            # needs Go on 127.0.0.1:8787 and PG on 7432
 */
import jwt from 'jsonwebtoken'
import { jwtKey } from './db.mjs'
import { assets, busiestTask, counts, findings, nodes, tasks } from './queries.mjs'

const BASE = process.env.VEXNAR_API || 'http://127.0.0.1:8787'
const token = jwt.sign({}, jwtKey(), { algorithm: 'HS256', subject: 'VEXNAR', expiresIn: '1h' })

async function get(path) {
  const response = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  const text = await response.text()
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}: ${text.slice(0, 200)}`)
  return JSON.parse(text)
}

const unix = (value) => (value ? Math.floor(new Date(value).getTime() / 1000) : 0)
const str = (value) => (value === null || value === undefined ? '' : String(value))

const results = []
function compare(domain, tsRows, goRows, fields, options = {}) {
  const byId = new Map(goRows.map((row) => [str(row.id), row]))
  let compared = 0
  const diffs = []
  const derived = []
  for (const tsRow of tsRows) {
    const id = str(tsRow.id)
    const go = byId.get(id)
    if (go === undefined) continue
    compared += 1
    for (const [field, pick] of Object.entries(fields)) {
      const left = pick.ts(tsRow)
      const right = pick.go(go)
      if (options.skip?.(field, tsRow, go)) {
        derived.push({ id, field, ts: left, go: right })
        continue
      }
      if (str(left) !== str(right)) diffs.push({ id, field, ts: left, go: right })
    }
  }
  results.push({ domain, compared, mismatches: diffs.length, diffs: diffs.slice(0, 5), derived: derived.slice(0, 3) })
}

const countsRow = await counts()
const tasksRes = await get('/api/tasks')
const goTasks = Array.isArray(tasksRes) ? tasksRes : (tasksRes.tasks ?? tasksRes.items ?? [])
const tsTasks = await tasks(300)

compare('tasks', tsTasks, goTasks, {
  exploration_id: { ts: (r) => r.exploration_id, go: (g) => g.exploration_id },
  name: { ts: (r) => r.name, go: (g) => g.name },
  description: { ts: (r) => r.description, go: (g) => g.description },
  goal: { ts: (r) => r.goal, go: (g) => g.goal },
  created_unix: { ts: (r) => unix(r.created_at), go: (g) => g.created_unix },
  completed_unix: { ts: (r) => unix(r.completed_at), go: (g) => g.completed_unix },
  paused: { ts: (r) => Boolean(r.paused), go: (g) => Boolean(g.paused) },
  queued: { ts: (r) => Boolean(r.queued), go: (g) => Boolean(g.queued) },
  status: { ts: (r) => r.status, go: (g) => g.status }
}, {
  // The API's status is engine-resolved; only terminal rows must already agree.
  skip: (field, row) => field === 'status' && !['done', 'failed', 'timeout'].includes(row.status)
})

const findingsRes = await get('/api/exploration/findings')
const goFindings = Array.isArray(findingsRes) ? findingsRes : (findingsRes.items ?? findingsRes.findings ?? [])
const tsFindings = await findings(500)
compare('findings', tsFindings, goFindings, {
  finding_id: { ts: (r) => r.finding_id, go: (g) => g.finding_id },
  vulnclass: { ts: (r) => r.vulnclass, go: (g) => g.vulnclass },
  name: { ts: (r) => r.name, go: (g) => g.name },
  severity: { ts: (r) => r.severity, go: (g) => g.severity },
  status: { ts: (r) => r.status, go: (g) => g.status },
  summary: { ts: (r) => r.summary, go: (g) => g.summary },
  evidence: { ts: (r) => r.evidence, go: (g) => g.evidence }
})

const goAssets = (await get('/api/assets?type=root_domain&limit=300')).assets ?? []
const tsAssets = await assets(300)
compare('assets', tsAssets, goAssets, {
  type: { ts: (r) => r.type, go: (g) => g.type },
  domain: { ts: (r) => r.domain, go: (g) => g.domain },
  root_domain: { ts: (r) => r.root_domain, go: (g) => g.root_domain },
  company_id: { ts: (r) => r.company_id ?? '', go: (g) => g.company_id ?? '' }
})

const sample = (await busiestTask()) ?? tsTasks.find((row) => row.exploration_id) ?? tsTasks[0]
if (sample) {
  const page = await get(`/api/exploration/nodes?task=${encodeURIComponent(String(sample.id))}&order=asc&size=100`)
  const tsNodes = await nodes(sample.exploration_id, 100)
  compare('exploration_nodes', tsNodes, page.items ?? [], {
    kind: { ts: (r) => r.kind, go: (g) => g.type ?? g.kind },
    state: { ts: (r) => r.state, go: (g) => g.state }
  })
}

console.log('DB counts:', JSON.stringify(countsRow))
let failed = false
for (const result of results) {
  const status = result.mismatches === 0 ? 'PASS' : 'FAIL'
  if (result.mismatches > 0) failed = true
  console.log(`\n[${status}] ${result.domain}: compared=${result.compared} mismatches=${result.mismatches}`)
  for (const diff of result.diffs) console.log('  diff', JSON.stringify(diff))
  for (const item of result.derived) console.log('  derived/not-compared', JSON.stringify(item))
}
process.exit(failed ? 1 : 0)
