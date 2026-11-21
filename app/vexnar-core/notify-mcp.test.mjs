// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 存储根与后端必须在 import 路由模块之前确定：context.ts 在模块加载时就解析
// store 目录（SQLite 文件）并打开 writer/meta。
const root = await mkdtemp(join(tmpdir(), 'vexnar-notify-mcp-'))
process.env.VEXNAR_STORE_ROOT = root
process.env.VEXNAR_STORE = 'sqlite'
delete process.env.VEXNAR_GATEWAY_TOKEN
// 测试用的假接收端在环回地址上；守卫默认拒绝，这里显式放开（与 Go 的
// VEXNAR_NOTIFY_ALLOW_LOCAL 语义一致）。
process.env.VEXNAR_NOTIFY_ALLOW_LOCAL = '1'

const { register } = await import('./src/routes/notify-mcp.ts')
// context 已被路由模块加载过，这里拿到的是同一个实例，用来直接播种数据。
const { operations } = await import('./src/context.ts')
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
const jget = async (path) => json(await app.request(path))
const jpost = async (path, body) => json(await app.request(path, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
}))
// ── 假 webhook 接收端（环回，离线可跑）────────────────────────────────────────
const received = []
const hookServer = createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => {
    received.push({ url: req.url, body, headers: req.headers })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"ok":true}')
  })
})
await new Promise((resolve) => hookServer.listen(0, '127.0.0.1', resolve))
const hookBase = `http://127.0.0.1:${hookServer.address().port}`

// ── 假 MCP stdio 服务器（newline-delimited JSON-RPC）─────────────────────────
const mcpFixturePath = join(root, 'mcp-fixture.mjs')
await writeFile(mcpFixturePath, `
let buffer = ''
process.stdin.setEncoding('utf8')
const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\\n')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let index = buffer.indexOf('\\n')
  while (index >= 0) {
    const line = buffer.slice(0, index).trim()
    buffer = buffer.slice(index + 1)
    index = buffer.indexOf('\\n')
    if (!line) continue
    let msg
    try { msg = JSON.parse(line) } catch { continue }
    if (msg.id === undefined) continue
    if (msg.method === 'initialize') {
      send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1.0.0' } } })
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'echo', description: '回显输入' }, { name: 'ping', description: '探活' }] } })
    } else {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'method not found' } })
    }
  }
})
`, 'utf8')

let hookClosed = false

try {
  // ═══ 通知 ═══════════════════════════════════════════════════════════════
  // ── GET /api/notify/meta ────────────────────────────────────────────────
  const meta0 = await jget('/api/notify/meta')
  const kinds = meta0.body.kinds ?? []
  const webhookKind = kinds.find((k) => k.kind === 'webhook')
  const dingtalkKind = kinds.find((k) => k.kind === 'dingtalk')
  check('notify meta: 200 + 六种渠道类型按字典序', meta0.status === 200
    && kinds.map((k) => k.kind).join(',') === 'dingtalk,email,feishu,telegram,webhook,wecom',
    JSON.stringify(kinds.map((k) => k.kind)))
  check('notify meta: 渠道默认限流与凭据字段', Boolean(webhookKind) && webhookKind.default_rate_per_min === 0
    && webhookKind.secret_keys.includes('url')
    && Boolean(dingtalkKind) && dingtalkKind.default_rate_per_min === 20 && dingtalkKind.secret_keys.includes('secret'),
    JSON.stringify({ webhookKind, dingtalkKind }))
  check('notify meta: 全局开关/回链/汇总周期默认值', meta0.body.enabled === true
    && meta0.body.public_base_url === '' && meta0.body.defaults.digest_interval_min === 30,
    JSON.stringify({ enabled: meta0.body.enabled, base: meta0.body.public_base_url, defaults: meta0.body.defaults }))
  check('notify meta: stats 为空库快照', meta0.body.stats.channels === 0 && meta0.body.stats.pending === 0
    && meta0.body.stats.backlog_age_ms === 0, JSON.stringify(meta0.body.stats))

  // ── 播种渠道（渠道 CRUD 属 routes.ts，本模块只消费其行）─────────────────────
  const goodChannel = await operations.createChannel({ name: 'fixture-webhook', kind: 'webhook', config: { url: `${hookBase}/hook` }, enabled: true })
  const noUrlChannel = await operations.createChannel({ name: 'webhook-缺地址', kind: 'webhook', config: {}, enabled: true })
  const deadChannel = await operations.createChannel({ name: 'webhook-打不通', kind: 'webhook', config: { url: 'http://127.0.0.1:1/nowhere' }, enabled: true })

  // ── 播种投递历史 ────────────────────────────────────────────────────────
  const sentDelivery = await operations.recordDelivery({ channel_id: goodChannel.id, event_kind: 'finding_created', title: 'SQL 注入', status: 'ok', attempts: 1 })
  const failedDelivery = await operations.recordDelivery({ channel_id: goodChannel.id, event_kind: 'finding_created', title: 'SSRF', status: 'failed', attempts: 3, error: 'HTTP 500' })
  const pendingDelivery = await operations.recordDelivery({ channel_id: goodChannel.id, event_kind: 'finding_status_changed', title: '弱口令', status: 'pending', attempts: 0 })

  // ── GET /api/notify/deliveries ──────────────────────────────────────────
  const list = await jget('/api/notify/deliveries')
  const first = list.body.deliveries?.[0]
  check('deliveries: 200 + 三条按 id 倒序 + 渠道名回填', list.status === 200 && list.body.total === 3
    && list.body.page === 1 && list.body.page_size === 50
    && list.body.deliveries.map((d) => d.id).join(',') === `${pendingDelivery.id},${failedDelivery.id},${sentDelivery.id}`
    && list.body.deliveries.every((d) => d.channel_name === 'fixture-webhook' && d.channel_kind === 'webhook'),
    JSON.stringify(list.body))
  check('deliveries: 状态归一化（ok→sent / failed / pending）', first?.state === 'pending'
    && list.body.deliveries[1].state === 'failed' && list.body.deliveries[1].last_error === 'HTTP 500'
    && list.body.deliveries[2].state === 'sent' && typeof list.body.deliveries[2].sent_at === 'string'
    && list.body.deliveries[2].finding_id === '0',
    JSON.stringify(list.body.deliveries.map((d) => [d.id, d.state, d.last_error, d.sent_at])))

  const filtered = await jget(`/api/notify/deliveries?state=failed&event_kind=finding_created&channel_id=${goodChannel.id}`)
  check('deliveries: state/event_kind/channel_id 过滤', filtered.status === 200 && filtered.body.total === 1
    && filtered.body.deliveries[0].id === failedDelivery.id, JSON.stringify(filtered.body))

  const paged = await jget('/api/notify/deliveries?page=2&page_size=2')
  check('deliveries: 分页 + page_size 上限回落', paged.status === 200 && paged.body.deliveries.length === 1
    && paged.body.total === 3 && paged.body.page === 2
    && (await jget('/api/notify/deliveries?page_size=1000')).body.page_size === 50,
    JSON.stringify({ items: paged.body.deliveries.length, page_size: paged.body.page_size }))

  // ── POST /api/notify/deliveries/:id/retry ───────────────────────────────
  const retried = await jpost(`/api/notify/deliveries/${failedDelivery.id}/retry`, {})
  const afterRetry = await jget('/api/notify/deliveries')
  const retriedRow = afterRetry.body.deliveries.find((d) => d.id === failedDelivery.id)
  check('delivery retry: 失败行重置为 pending/attempts=0/清错误', retried.status === 200 && retried.body.ok === true
    && retriedRow.state === 'pending' && retriedRow.attempts === 0 && retriedRow.last_error === '',
    JSON.stringify({ status: retried.status, row: retriedRow }))
  const retrySent = await jpost(`/api/notify/deliveries/${sentDelivery.id}/retry`, {})
  check('delivery retry: 已发送行拒绝重发（400）', retrySent.status === 400
    && retrySent.body.error.includes('不允许重发'), JSON.stringify(retrySent.body))
  const retryMissing = await jpost('/api/notify/deliveries/999999/retry', {})
  check('delivery retry: 不存在的 id → 400', retryMissing.status === 400, JSON.stringify(retryMissing.body))

  // ── POST /api/notify/channels/:id/test ──────────────────────────────────
  const tested = await jpost(`/api/notify/channels/${goodChannel.id}/test`, {})
  const hookBody = received[0]?.body ?? ''
  check('channel test: 200 + 同步送达 + latency_ms', tested.status === 200 && tested.body.ok === true
    && typeof tested.body.latency_ms === 'number' && tested.body.latency_ms >= 0, JSON.stringify(tested.body))
  check('channel test: 接收端收到测试消息体', received.length === 1 && hookBody.includes('测试消息')
    && JSON.parse(hookBody).items?.[0]?.vulnclass === '连通性测试', String(hookBody).slice(0, 200))
  const testNoUrl = await jpost(`/api/notify/channels/${noUrlChannel.id}/test`, {})
  check('channel test: 配置缺目标 URL → 400', testNoUrl.status === 400 && testNoUrl.body.error.includes('缺少目标 URL'), JSON.stringify(testNoUrl.body))
  const testDead = await jpost(`/api/notify/channels/${deadChannel.id}/test`, {})
  check('channel test: 对端不可达 → 502 带原始原因', testDead.status === 502 && testDead.body.error.length > 0, JSON.stringify(testDead.body))
  const testMissing = await jpost('/api/notify/channels/999999/test', {})
  const testBadId = await jpost('/api/notify/channels/abc/test', {})
  check('channel test: 渠道不存在 → 404 / id 非法 → 400', testMissing.status === 404 && testBadId.status === 400,
    JSON.stringify({ missing: testMissing.status, bad: testBadId.status }))

  // ═══ MCP ════════════════════════════════════════════════════════════════
  const importBody = {
    json: {
      mcpServers: {
        fixture: { command: process.execPath, args: [mcpFixturePath] },
        'remote-one': { type: 'streamable-http', url: 'https://example.com/mcp' }
      }
    }
  }
  const imported = await jpost('/api/mcp/import', importBody)
  const importedFixture = imported.body.imported?.find((row) => row.name === 'fixture')
  const importedRemote = imported.body.imported?.find((row) => row.name === 'remote-one')
  check('mcp import: 200 + 两条导入 + transport 规范化', imported.status === 200 && imported.body.total === 2
    && imported.body.imported.length === 2 && imported.body.skipped.length === 0
    && importedFixture?.transport === 'stdio' && importedRemote?.transport === 'http',
    JSON.stringify(imported.body))

  const importedAgain = await jpost('/api/mcp/import', importBody)
  check('mcp import: 无 overwrite 时同名跳过', importedAgain.status === 200
    && importedAgain.body.imported.length === 0 && importedAgain.body.skipped.length === 2
    && importedAgain.body.skipped[0].reason.includes('同名 MCP 已存在'), JSON.stringify(importedAgain.body))

  const overwritten = await jpost('/api/mcp/import', { ...importBody, overwrite: true })
  const overwrittenFixture = overwritten.body.imported?.find((row) => row.name === 'fixture')
  check('mcp import: overwrite 覆盖并复用同一 id', overwritten.status === 200
    && overwritten.body.imported.length === 2 && overwrittenFixture?.id === importedFixture?.id,
    JSON.stringify(overwritten.body))

  const importSkipped = await jpost('/api/mcp/import', {
    json: { mcpServers: { 'no-command': { type: 'stdio' }, ok: { type: 'http', url: 'https://example.com/x' } } }
  })
  const badImportJSON = await jpost('/api/mcp/import', { json: { foo: 'bar' } })
  const missingPayload = await jpost('/api/mcp/import', {})
  const stringPayload = await jpost('/api/mcp/import', { raw: JSON.stringify({ mcpServers: { 'from-raw': { command: '/bin/echo' } } }) })
  check('mcp import: 单条失败进 skipped / 无 mcpServers 400 / 缺字段 400 / raw 字符串形态',
    importSkipped.status === 200 && importSkipped.body.imported.length === 1
    && importSkipped.body.skipped[0].reason.includes('缺少 command')
    && badImportJSON.status === 400 && badImportJSON.body.error.includes('未找到 mcpServers')
    && missingPayload.status === 400 && missingPayload.body.error.includes('缺少要导入的 JSON')
    && stringPayload.status === 200 && stringPayload.body.imported[0]?.name === 'from-raw'
    && stringPayload.body.imported[0]?.transport === 'stdio',
    JSON.stringify({ skipped: importSkipped.body, bad: badImportJSON.body, missing: missingPayload.body, raw: stringPayload.body }))

  // ── GET /api/mcp/:id/tools ──────────────────────────────────────────────
  const toolsEmpty = await jget(`/api/mcp/${importedFixture.id}/tools`)
  check('mcp tools: 未发现前返回空数组 + 服务器元数据', toolsEmpty.status === 200
    && Array.isArray(toolsEmpty.body.tools) && toolsEmpty.body.tools.length === 0
    && toolsEmpty.body.name === 'fixture' && toolsEmpty.body.transport === 'stdio' && toolsEmpty.body.enabled === true,
    JSON.stringify(toolsEmpty.body))
  const toolsMissing = await jget('/api/mcp/999999/tools')
  check('mcp tools: 不存在的服务器 → 404', toolsMissing.status === 404, JSON.stringify(toolsMissing.body))

  // ── POST /api/mcp/:id/refresh ───────────────────────────────────────────
  const refreshed = await jpost(`/api/mcp/${importedFixture.id}/refresh`, {})
  check('mcp refresh: 200 + 真实 stdio 握手拿到工具', refreshed.status === 200
    && refreshed.body.tools.map((t) => t.name).join(',') === 'echo,ping'
    && refreshed.body.tools[0].description === '回显输入', JSON.stringify(refreshed.body))
  const toolsCached = await jget(`/api/mcp/${importedFixture.id}/tools`)
  check('mcp refresh: 工具列表已回写缓存', toolsCached.status === 200 && toolsCached.body.tools.length === 2
    && toolsCached.body.tools[1].name === 'ping', JSON.stringify(toolsCached.body.tools))

  const brokenServer = await operations.saveMcpServer({ name: 'broken-stdio', transport: 'stdio', command: '/nonexistent/definitely-not-a-command' })
  const refreshBroken = await jpost(`/api/mcp/${brokenServer.id}/refresh`, {})
  const refreshMissing = await jpost('/api/mcp/999999/refresh', {})
  check('mcp refresh: 发现失败 → 502 带原因 / 服务器不存在 → 404',
    refreshBroken.status === 502 && refreshBroken.body.error.startsWith('工具发现失败') && refreshBroken.body.error.length > 20
    && refreshMissing.status === 404,
    JSON.stringify({ broken: refreshBroken.body.error?.slice(0, 120), missing: refreshMissing.status }))

  // ═══ 侧边问答 ═══════════════════════════════════════════════════════════
  const task = await operations.createTask({ name: '旁路问答任务', description: '侧边问答自检', goal: '验证侧边问答契约' })
  const scope = `task-${task.id}-main`
  // 主 Agent 侧写下的上下文快照（side_question_sessions）由引擎负责，这里直接播种。
  await operations.writer.put({
    table: 'side_question_sessions',
    key: scope,
    record: {
      captured_at: '2026-11-21T00:00:00Z',
      model: { profile_id: 1, name: 'default', format: 'openai', model: 'gpt-4o-mini', identity: 'abc', streaming: true, window_tokens: 128000 }
    }
  })

  const noScope = await jget('/api/side-questions')
  check('side questions GET: 缺父作用域 → 400', noScope.status === 400 && noScope.body.error.includes('task_id'), JSON.stringify(noScope.body))

  const created = await jpost('/api/side-questions', { task_id: String(task.id), question: '第一个旁路问题', client_request_id: 'req-1' })
  check('side questions POST: 201 + pending + 快照元数据', created.status === 201
    && created.body.status === 'pending' && created.body.ordinal === 1 && created.body.sequence === 1
    && created.body.client_request_id === 'req-1' && created.body.snapshot_at === '2026-11-21T00:00:00Z'
    && created.body.model?.name === 'default', JSON.stringify(created.body))

  const idempotent = await jpost('/api/side-questions', { task_id: String(task.id), question: '第一个旁路问题', client_request_id: 'req-1' })
  check('side questions POST: 同请求 ID + 同问题 → 200 幂等返回同一条', idempotent.status === 200 && idempotent.body.id === created.body.id,
    JSON.stringify({ status: idempotent.status, id: idempotent.body.id }))

  const conflict = await jpost('/api/side-questions', { task_id: String(task.id), question: '换了问题内容', client_request_id: 'req-1' })
  check('side questions POST: 同请求 ID + 不同问题 → 409', conflict.status === 409
    && conflict.body.error.includes('同一请求 ID'), JSON.stringify(conflict.body))

  const emptyQuestion = await jpost('/api/side-questions', { task_id: String(task.id), question: '   ', client_request_id: 'req-x' })
  const longQuestion = await jpost('/api/side-questions', { task_id: String(task.id), question: 'x'.repeat(4001), client_request_id: 'req-y' })
  const badRequestId = await jpost('/api/side-questions', { task_id: String(task.id), question: '合法问题', client_request_id: 'bad id!' })
  check('side questions POST: 空问题/超长/非法请求 ID → 400', emptyQuestion.status === 400
    && longQuestion.status === 400 && badRequestId.status === 400,
    JSON.stringify({ empty: emptyQuestion.status, long: longQuestion.status, bad: badRequestId.status }))

  const unknownTask = await jpost('/api/side-questions', { task_id: '999999', question: '孤儿任务', client_request_id: 'req-z' })
  check('side questions POST: 任务不存在 → 404', unknownTask.status === 404, JSON.stringify(unknownTask.body))

  await jpost('/api/side-questions', { task_id: String(task.id), question: '第二个旁路问题', client_request_id: 'req-2' })
  await jpost('/api/side-questions', { task_id: String(task.id), question: '第三个旁路问题', client_request_id: 'req-3' })

  const history = await jget(`/api/side-questions?task_id=${task.id}`)
  check('side questions GET: 倒序历史 + 快照可用', history.status === 200 && history.body.items.length === 3
    && history.body.items.map((row) => row.question).join('|') === '第三个旁路问题|第二个旁路问题|第一个旁路问题'
    && history.body.next_cursor === 0 && history.body.current === null
    && history.body.snapshot?.available === true && history.body.snapshot.captured_at === '2026-11-21T00:00:00Z',
    JSON.stringify({ items: history.body.items?.map((row) => row.ordinal), cursor: history.body.next_cursor, snapshot: history.body.snapshot }))

  const page1 = await jget(`/api/side-questions?task_id=${task.id}&limit=2`)
  const page2 = await jget(`/api/side-questions?task_id=${task.id}&limit=2&before=${page1.body.next_cursor}`)
  check('side questions GET: limit + before 游标翻页', page1.status === 200 && page1.body.items.length === 2
    && page1.body.next_cursor === 2
    && page2.status === 200 && page2.body.items.length === 1 && page2.body.items[0].ordinal === 1
    && page2.body.next_cursor === 0,
    JSON.stringify({ p1: page1.body.items?.map((r) => r.ordinal), cursor: page1.body.next_cursor, p2: page2.body.items?.map((r) => r.ordinal) }))

  const conversationScope = await jpost('/api/side-questions', { conversation_id: '42', question: '会话侧问', client_request_id: 'req-c' })
  const conversationHistory = await jget('/api/side-questions?conversation_id=42')
  check('side questions: 会话作用域独立成 scope', conversationScope.status === 201
    && conversationHistory.body.items.length === 1 && conversationHistory.body.snapshot === null,
    JSON.stringify({ created: conversationScope.status, items: conversationHistory.body.items?.length, snapshot: conversationHistory.body.snapshot }))

  // 通知 stats 应该在播种之后反映真实渠道数
  const metaAfter = await jget('/api/notify/meta')
  check('notify meta: stats 随播种更新', metaAfter.body.stats.channels === 3 && metaAfter.body.stats.channels_on === 3
    && metaAfter.body.stats.pending === 2 && metaAfter.body.stats.sent_today === 1,
    JSON.stringify(metaAfter.body.stats))
} finally {
  if (!hookClosed) {
    hookClosed = true
    await new Promise((resolve) => hookServer.close(resolve))
  }
}

const pass = results.filter((r) => r.ok).length
const fail = results.filter((r) => !r.ok).length
for (const r of results) {
  console.log(`${r.ok ? '[PASS]' : '[FAIL]'} ${r.name}${r.ok ? '' : ` :: ${r.detail}`}`)
}
console.log(`\nnotify-mcp.test: ${pass} pass, ${fail} fail`)
console.log(`store root: ${root}`)
process.exit(fail ? 1 : 0)
