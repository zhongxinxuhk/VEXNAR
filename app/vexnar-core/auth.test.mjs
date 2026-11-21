// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * app/vexnar-core/src/routes/auth.ts 自检：12 条路由逐条打通，并钉住三条硬契约
 *   1) JWT 用仓库根 jwt.key 的 HS256，sub=VEXNAR，TTL 7 天；
 *   2) 密码哈希与 Go 的 bcrypt 互认（双向：Go 生成的哈希这里能校验，这里生成的
 *      Go 能校验——测试里固定了一条 Go 现生成的 cost 10 向量）；
 *   3) stats 是对 store 的真聚合（资产按类型计数、finding 严重度、图谱节点数）。
 *
 * 运行：cd app/vexnar-store && npx tsx ../vexnar-core/auth.test.mjs
 */

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'

// import context / register 之前把持久层指到临时 SQLite，绝不污染真实 store。
const root = await mkdtemp(join(tmpdir(), 'vexnar-auth-'))
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_STORE_ROOT = root
process.env.VEXNAR_SQLITE_PATH = join(root, 'vexnar.sqlite')

const { register, hashPassword, verifyPassword, jwtSigningKey, flushLogPersist } = await import('./src/routes/auth.ts')
const { operations, store, meta } = await import('./src/context.ts')

const app = new Hono()
register(app)

const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })
const json = async (path, init) => {
  const response = await app.request(path, init)
  return { status: response.status, body: await response.json().catch(() => null), response }
}
const post = (path, body, headers = {}) =>
  json(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body ?? {}) })

// ── 造数据：一个任务 + finding + 资产 + 工具调用审计 + 一次被拦截 ──────────
const task = await operations.createTask({
  name: '自检任务',
  description: 'auth 路由自检任务',
  goal: '验证鉴权/日志/系统聚合路由'
})
const taskId = String(task.id)
await operations.reportFinding({
  task_id: taskId,
  vulnclass: 'SQL注入',
  severity: 'high',
  summary: '布尔盲注可复现',
  evidence: "id=1 and 1=1 vs id=1 and 1=2"
})
await operations.writer.put({
  table: 'assets',
  key: '1',
  record: { id: 1, type: 'domain', task_ids: [Number(taskId)], domain: 'target.test', last_seen: '2026-11-21T10:00:00+08:00' }
})
await operations.appendActivity(taskId, {
  kind: 'tool',
  worker: 'mainagent',
  summary: 'nuclei 扫描超时',
  is_error: true,
  metadata: { tool: 'nuclei', command: 'nuclei -u http://target.test' }
})
await operations.appendActivity(taskId, {
  kind: 'tool',
  worker: 'mainagent',
  summary: 'httpx 探测完成',
  is_error: false,
  metadata: { tool: 'httpx' }
})
await operations.writer.put({
  table: 'intercept_pending',
  key: '1',
  record: { id: 1, task_id: taskId, tool: 'ffuf', status: 'denied', reason: '命中高危命令规则', created_unix: Math.floor(Date.now() / 1000) }
})

// ── 鉴权（4 条）──────────────────────────────────────────────────────────

const status0 = await json('/api/auth/status')
check('GET /api/auth/status 未初始化', status0.status === 200 && status0.body.initialized === false, JSON.stringify(status0.body))

// 与 Go 互认的固定向量：Go bcrypt.GenerateFromPassword([]byte("U*U"), 10) 产物。
const GO_VECTOR = '$2a$10$eBgCRgPJYYP6E9dbGGtCee6d3RDGpCEk3gWtD9lw3PqP5/KRDqxpW'
check('bcrypt 校验 Go 生成的 cost10 哈希', verifyPassword('U*U', GO_VECTOR) && !verifyPassword('U*Ux', GO_VECTOR))
const roundTrip = hashPassword('round-trip-password')
check(
  'bcrypt 自产哈希（$2a$10$，60 字符）可回验',
  /^\$2a\$10\$[./A-Za-z0-9]{53}$/.test(roundTrip) && roundTrip.length === 60 && verifyPassword('round-trip-password', roundTrip),
  roundTrip.slice(0, 7)
)

const firstPassword = 'VEXNAR-初始密码'
const init = await post('/api/auth/init', { password: firstPassword })
const initPayload = String(init.body?.token ?? '').split('.')[1]
const initClaims = initPayload ? JSON.parse(Buffer.from(initPayload, 'base64url').toString('utf8')) : {}
check(
  'POST /api/auth/init 发 token（HS256 / sub=VEXNAR / 7 天）',
  init.status === 200 && initClaims.sub === 'VEXNAR' && Math.round(initClaims.exp - initClaims.iat) === 7 * 24 * 3600,
  JSON.stringify({ sub: initClaims.sub, ttl: initClaims.exp - initClaims.iat })
)
const token = String(init.body?.token ?? '')
const [jwtHeader] = token.split('.')
check(
  'JWT header 是 HS256，密钥来自仓库根 jwt.key（32 字符）',
  JSON.parse(Buffer.from(jwtHeader, 'base64url').toString('utf8')).alg === 'HS256' && jwtSigningKey().length === 32,
  JSON.stringify(JSON.parse(Buffer.from(jwtHeader, 'base64url').toString('utf8')))
)

const status1 = await json('/api/auth/status')
check('GET /api/auth/status 初始化后', status1.body?.initialized === true, JSON.stringify(status1.body))

const initAgain = await post('/api/auth/init', { password: 'another-password' })
check('POST /api/auth/init 二次调用被拒（403）', initAgain.status === 403, JSON.stringify(initAgain.body))

const loginBadUser = await post('/api/auth/login', { username: 'admin', password: firstPassword })
const loginBadPass = await post('/api/auth/login', { username: 'VEXNAR', password: 'wrong-password' })
const loginOk = await post('/api/auth/login', { username: 'VEXNAR', password: firstPassword })
check(
  'POST /api/auth/login 正确凭据发 token，错误凭据 401',
  loginOk.status === 200 && typeof loginOk.body?.token === 'string' && loginBadUser.status === 401 && loginBadPass.status === 401,
  JSON.stringify({ ok: loginOk.status, badUser: loginBadUser.status, badPass: loginBadPass.status })
)

const noToken = await post('/api/auth/change-password', { old_password: firstPassword, new_password: 'VEXNAR-新密码' })
const wrongOld = await post('/api/auth/change-password', { old_password: 'not-the-old-one', new_password: 'VEXNAR-新密码' }, { authorization: `Bearer ${token}` })
const newPassword = 'VEXNAR-新密码'
const changed = await post('/api/auth/change-password', { old_password: firstPassword, new_password: newPassword }, { authorization: `Bearer ${token}` })
check(
  'POST /api/auth/change-password 需 token + 旧密码',
  noToken.status === 401 && wrongOld.status === 401 && changed.status === 200 && changed.body?.ok === true,
  JSON.stringify({ noToken: noToken.status, wrongOld: wrongOld.status, changed: changed.status })
)

const oldLogin = await post('/api/auth/login', { username: 'VEXNAR', password: firstPassword })
const newLogin = await post('/api/auth/login', { username: 'VEXNAR', password: newPassword })
check(
  '改密后旧密码失效、新密码可登录',
  oldLogin.status === 401 && newLogin.status === 200 && typeof newLogin.body?.token === 'string',
  JSON.stringify({ old: oldLogin.status, fresh: newLogin.status })
)
const authToken = String(newLogin.body?.token ?? token)

// settings 行式形状（Go 导入的 [{key,value}]）兼容：整表改成行式再登录一次。
{
  const tables = await meta.load()
  const current = tables.settings && typeof tables.settings === 'object' && !Array.isArray(tables.settings) ? tables.settings : {}
  tables.settings = Object.entries(current).map(([key, value]) => ({ key, value }))
  await meta.save(tables)
  meta.reload()
}
const rowShapeLogin = await post('/api/auth/login', { username: 'VEXNAR', password: newPassword })
const rowShapeStatus = await json('/api/auth/status')
check(
  'settings 行式形状（Go 导入的 [{key,value}]）下鉴权仍然可用',
  rowShapeLogin.status === 200 && rowShapeStatus.body?.initialized === true,
  JSON.stringify({ login: rowShapeLogin.status, initialized: rowShapeStatus.body?.initialized })
)

// ── 日志（3 条）──────────────────────────────────────────────────────────

const marker = `自检日志标记 ${Date.now()}`
console.log(`[selftest] ${marker}`)
await flushLogPersist()

const logs = await json('/api/logs?limit=50')
const logItems = logs.body?.items ?? []
check(
  'GET /api/logs 抓到 console 输出并带游标',
  logs.status === 200 && logs.body?.cursor > 0 && logItems.some((item) => item.text.includes(marker)),
  JSON.stringify({ cursor: logs.body?.cursor, count: logItems.length, last: logItems.at(-1)?.text?.slice(0, 40) })
)

const sinceSkip = await json(`/api/logs?since=${logs.body?.cursor}&limit=10`)
check(
  'GET /api/logs?since=cursor 不回放已读行',
  sinceSkip.status === 200 && (sinceSkip.body?.items ?? []).length === 0,
  JSON.stringify({ items: (sinceSkip.body?.items ?? []).length })
)

const history = await json('/api/logs/history?limit=50')
const historyItems = history.body?.items ?? []
check(
  'GET /api/logs/history 从 SQLite 翻页（db_id 倒序）',
  history.status === 200 && historyItems.length > 0 && historyItems[0].db_id >= historyItems.at(-1).db_id && historyItems.some((item) => String(item.text).includes(marker)),
  JSON.stringify({ count: historyItems.length, newest: historyItems[0]?.db_id, has_more: history.body?.has_more })
)

const streamResponse = await app.request('/api/logs/stream?since=0')
const reader = streamResponse.body.getReader()
const { value } = await reader.read()
const firstChunk = Buffer.from(value ?? new Uint8Array()).toString('utf8')
await reader.cancel().catch(() => {})
check(
  'GET /api/logs/stream 是 SSE 且回放历史行',
  streamResponse.status === 200 &&
    String(streamResponse.headers.get('content-type')).startsWith('text/event-stream') &&
    firstChunk.startsWith('data: ') &&
    firstChunk.includes('"seq"'),
  JSON.stringify({ type: streamResponse.headers.get('content-type'), head: firstChunk.slice(0, 48) })
)

// ── 系统（5 条）──────────────────────────────────────────────────────────

const stats = await json(`/api/stats?task=${taskId}`)
const statsBody = stats.body ?? {}
check(
  'GET /api/stats 聚合 store（资产/漏洞/图谱/引擎态）',
  stats.status === 200 &&
    statsBody.assets === 1 &&
    statsBody.asset_counts?.domain === 1 &&
    statsBody.active_task?.id === taskId &&
    statsBody.active_task?.findings === 1 &&
    statsBody.active_task?.findings_by_severity?.high === 1 &&
    statsBody.exploration?.by_kind !== undefined &&
    typeof statsBody.engine_mode === 'string' &&
    typeof statsBody.traffic === 'number',
  JSON.stringify({
    assets: statsBody.assets,
    counts: statsBody.asset_counts,
    findings: statsBody.active_task?.findings,
    mode: statsBody.engine_mode
  })
)

const statsMissing = await json('/api/stats?task=999999')
check('GET /api/stats?task=不存在 回 404', statsMissing.status === 404, JSON.stringify(statsMissing.body))

const audit = await json(`/api/audit?task=${taskId}`)
const entries = audit.body?.entries ?? []
const blocked = entries.filter((entry) => entry.action === 'block')
check(
  'GET /api/audit 合并工具调用与拦截拒绝',
  audit.status === 200 &&
    entries.length === 3 &&
    entries.some((entry) => entry.tool === 'httpx' && entry.action === 'allow') &&
    blocked.some((entry) => entry.tool === 'nuclei' && entry.reason.includes('超时')) &&
    blocked.some((entry) => entry.tool === 'ffuf') &&
    audit.body?.attributions?.nuclei === 1,
  JSON.stringify({ entries: entries.map((entry) => `${entry.tool}:${entry.action}`), attributions: audit.body?.attributions })
)

const active = await post('/api/active', { id: taskId })
const activeBogus = await post('/api/active', { id: '999999' })
const statsDefault = await json('/api/stats')
check(
  'POST /api/active 切换活跃任务（并落 settings）',
  active.status === 200 &&
    active.body?.active === taskId &&
    activeBogus.status === 404 &&
    statsDefault.body?.active_task?.id === taskId,
  JSON.stringify({ active: active.body, bogus: activeBogus.status, resolved: statsDefault.body?.active_task?.id })
)

// 埋一个孤儿快照 + 一条 finding 已被硬删的绑定，gc 必须把它们收走。
await operations.writer.put({
  table: 'traffic_evidence_snapshots',
  key: 'orphan-snapshot',
  record: { id: 'orphan-snapshot', snapshot: { url: 'http://target.test/orphan', method: 'GET' } }
})
await operations.writer.put({
  table: 'finding_traffic_bindings',
  key: '77',
  record: { id: 77, finding_id: '999999', snapshot_id: 'orphan-snapshot', role: 'proof', position: 0 }
})

const gc = await post('/api/gc', {})
check(
  'POST /api/gc 真回收孤儿快照与孤儿绑定',
  gc.status === 200 && gc.body?.snapshots === 1 && gc.body?.bindings === 1 && gc.body?.removed === 2 &&
    (await operations.writer.list('traffic_evidence_snapshots')).length === 0,
  JSON.stringify(gc.body)
)

const reportResponse = await app.request(`/api/report?task=${taskId}`)
const reportText = await reportResponse.text()
check(
  'GET /api/report 出 Markdown（含目标与 finding）',
  reportResponse.status === 200 &&
    String(reportResponse.headers.get('content-type')).startsWith('text/markdown') &&
    reportText.includes('SQL注入') &&
    reportText.includes('验证鉴权/日志/系统聚合路由'),
  JSON.stringify({ status: reportResponse.status, bytes: reportText.length })
)

const reportMissing = await json('/api/report?task=999999')
check('GET /api/report?task=不存在 回 404', reportMissing.status === 404, JSON.stringify(reportMissing.body))

// ── 12 条路由全在册（没有掉进 404/501 兜底）────────────────────────────────
const inventory = [
  ['GET', '/api/auth/status'],
  ['POST', '/api/auth/init'],
  ['POST', '/api/auth/login'],
  ['POST', '/api/auth/change-password'],
  ['GET', '/api/logs'],
  ['GET', '/api/logs/history'],
  ['GET', '/api/logs/stream?since=0'],
  ['GET', '/api/audit'],
  ['GET', '/api/stats'],
  ['POST', '/api/gc'],
  ['POST', '/api/active'],
  ['GET', '/api/report']
]
const missing = []
for (const [method, path] of inventory) {
  const response = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${authToken}` },
    ...(method === 'POST' ? { body: '{}' } : {})
  })
  if (response.status === 404 || response.status === 501) missing.push(`${method} ${path} -> ${response.status}`)
  else if (path.includes('/stream')) await response.body?.cancel().catch(() => {})
}
check('12 条路由全部注册在本模块', inventory.length === 12 && missing.length === 0, JSON.stringify({ registered: inventory.length, missing }))

// ── 报告 ────────────────────────────────────────────────────────────────
let failed = 0
for (const item of results) {
  if (!item.ok) failed += 1
  console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`)
}
console.log(`\n${results.length - failed}/${results.length} passed · 12 routes`)
process.exit(failed ? 1 : 0)
