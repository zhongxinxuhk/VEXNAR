// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * P0-2: compare TS tool implementations with the Go MCP tools.
 *
 *   list_assets    ids / simple DSL / type filter           (read)
 *   traffic_get    index + body reconstruction               (read)
 *   report_finding validation text + insert shape (rolled back)
 */
import { db } from '../p0-db/db.mjs'
import { mcpCall } from './mcp.mjs'
import { listAssets } from './tools/list-assets.mjs'
import { trafficGet, smallTrafficIds } from './tools/traffic-get.mjs'
import { validateReportFinding, writeShapeCheck } from './tools/report-finding.mjs'

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
}

const pickAsset = (asset) => ({
  id: String(asset.id),
  type: asset.type,
  domain: asset.domain ?? '',
  root_domain: asset.root_domain ?? '',
  company_id: asset.company_id === undefined ? '' : String(asset.company_id),
  task_ids: (asset.task_ids ?? []).map(String).sort().join(','),
  last_seen: asset.last_seen ?? ''
})

const stripGo = (json) => ({
  count: json.count,
  assets: json.assets.map(pickAsset)
})
const stripTs = (json) => ({
  count: json.count,
  assets: json.assets.map((asset) => pickAsset({ ...asset, task_ids: asset.task_ids ?? [] }))
})

for (const args of [
  { ids: [20, 1727] },
  { type: 'root_domain', dsl: 'domain=example', limit: 3 },
  { dsl: 'domain==example.test', limit: 1 }
]) {
  const go = await mcpCall('list_assets', args)
  if (go.isError) {
    record(`list_assets ${JSON.stringify(args)}`, false, go.text)
    continue
  }
  const ts = stripTs(await listAssets(args))
  const goStripped = stripGo(JSON.parse(go.text))
  const match = JSON.stringify(ts) === JSON.stringify(goStripped)
  record(`list_assets ${JSON.stringify(args)}`, match, match ? '' : JSON.stringify({ ts, go: goStripped }).slice(0, 500))
}

for (const id of smallTrafficIds(3)) {
  const go = await mcpCall('traffic_get', { id })
  if (go.isError) {
    record(`traffic_get ${id}`, false, go.text)
    continue
  }
  let ts = ''
  try {
    ts = trafficGet(id)
  } catch (error) {
    record(`traffic_get ${id}`, false, String(error.message))
    continue
  }
  const match = ts === go.text
  record(`traffic_get ${id}`, match, match ? '' : `ts=${ts.length}B go=${go.text.length}B`)
}

// report_finding: validation text must match the Go wrapper/handler.
for (const args of [{}, { task_id: '999999', vulnclass: 'X', severity: 'low', summary: 's' }]) {
  const go = await mcpCall('report_finding', args)
  const exists = args.task_id
    ? Boolean(await db.selectFrom('tasks').select('id').where('id', '=', args.task_id).executeTakeFirst())
    : false
  const tsError = validateReportFinding(args, () => exists)
  const goText = go.text.trim()
  const match = tsError === null ? !go.isError : goText.includes(tsError)
  record(`report_finding validate ${JSON.stringify(args)}`, match, `ts=${tsError ?? 'accepted'} go=${goText.slice(0, 120)}`)
}

const shape = await writeShapeCheck(db)
record('report_finding insert shape', shape.diffs.length === 0, JSON.stringify(shape))

let failed = false
for (const item of results) {
  if (!item.ok) failed = true
  console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `\n  ${item.detail}` : ''}`)
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`)
process.exit(failed ? 1 : 0)
