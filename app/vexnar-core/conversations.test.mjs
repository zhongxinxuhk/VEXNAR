// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createServer } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = await mkdtemp(join(tmpdir(), 'vexnar-conv-'))
process.env.VEXNAR_STORE = 'sqlite'
process.env.VEXNAR_STORE_ROOT = root

// 本地 mock 模型网关：/chat/completions 固定返回一段助手文本，验证 gatewayComplete 全链路。
const gateway = createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'mock reply' } }] }))
  })
})
await new Promise((resolve) => gateway.listen(0, '127.0.0.1', resolve))
const port = gateway.address().port
process.env.VEXNAR_GATEWAY_URL = `http://127.0.0.1:${port}/api/desktop/openai/v1`
process.env.VEXNAR_GATEWAY_TOKEN = 'test-token'

// env 就绪后再动态 import：context.ts 顶层 await 会用上面的临时 SQLite 根目录。
const { Hono } = await import('hono')
const { register } = await import('../vexnar-core/src/routes/conversations.ts')
const ctx = await import('../vexnar-core/src/context.ts')

// 预置一个 agent，供「创建会话校验 agent_key」与「mentions」使用。
const tables = await ctx.meta.load()
tables.agents = [{ key: 'mainagent', name: '主 Agent', description: 'demo agent' }]
await ctx.meta.save(tables)

const app = new Hono()
register(app)

const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })
const req = (path, init) => app.request(path, init)
const jres = async (res) => ({ status: res.status, body: await res.json() })
const json = (o) => JSON.stringify(o)
const post = (path, body) => req(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const patch = (path, body) => req(path, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 会话 CRUD ────────────────────────────────────────────────────────────────
const created = await jres(await post('/api/conversations', { agent_key: 'mainagent', title: 'first' }))
check('create conversation', created.status === 200 && created.body.id === 1 && created.body.agent_key === 'mainagent', json(created.body))

let agentMissing = await jres(await post('/api/conversations', { agent_key: 'nope', title: 'x' }))
check('create rejects unknown agent', agentMissing.status === 404, json(agentMissing.body))

const listed = await jres(await req('/api/conversations'))
check('list conversations', listed.status === 200 && listed.body.conversations.length === 1 && listed.body.conversations[0].running === false, json(listed.body))

const renamed = await jres(await patch('/api/conversations/1', { title: 'renamed', pinned: true }))
check('rename + pin', renamed.status === 200 && renamed.body.title === 'renamed' && renamed.body.pinned === true, json(renamed.body))

const profiled = await jres(await patch('/api/conversations/1/profile', { llm_profile_id: null }))
check('profile update', profiled.status === 200 && profiled.body.ok === true, json(profiled.body))

// ── mentions ────────────────────────────────────────────────────────────────
const mentions = await jres(await req('/api/chat/mentions?q=main'))
check('mentions search', mentions.status === 200 && mentions.body.items.some((x) => x.key === 'mainagent'), json(mentions.body))

// ── 消息 list/send（mock 模型）──────────────────────────────────────────────
const send = await jres(await post('/api/conversations/1/messages', { message: 'hello world' }))
check('send message accepted', send.status === 202 && send.body.status === 'accepted', json(send.body))

let msgs = null
for (let i = 0; i < 150; i++) {
  msgs = await jres(await req('/api/conversations/1/messages'))
  if (msgs.body.running === false && msgs.body.items.some((x) => x.kind === 'result')) break
  await sleep(20)
}
check('run completes (running=false)', msgs.body.running === false, json(msgs.body))

const items = msgs.body.items
const kinds = items.map((x) => x.kind)
check('message kinds present', kinds[0] === 'user' && kinds.includes('text') && kinds.includes('result'), json(kinds))
const seqs = items.map((x) => Number(x.seq))
check('seq ascending', seqs.every((s, i) => i === 0 || s > seqs[i - 1]), json(seqs))
check('mock reply persisted', items.some((x) => x.kind === 'text' && x.summary === 'mock reply'), json(items))

const detail = await jres(await req(`/api/conversations/1/messages/${items[0].seq}`))
check('message detail', detail.status === 200 && typeof detail.body.detail === 'string', json(detail.body))

// ?since=cursor 增量轮询
const since = await jres(await req(`/api/conversations/1/messages?since=${items[0].seq}`))
check('since cursor page', since.status === 200 && since.body.cursor >= Number(items[0].seq), json(since.body))

// 第二次发送（含 @提及）
const sendMention = await jres(await post('/api/conversations/1/messages', { message: '@mainagent do it' }))
check('mention message accepted', sendMention.status === 202, json(sendMention.body))

// 发送中的并发保护
const busySend = await jres(await post('/api/conversations/1/messages', { message: 'second while busy' }))
check('busy conflict (409)', busySend.status === 409, json(busySend.body))

// 等第二轮结束，再测 stop → idle
let second = null
for (let i = 0; i < 150; i++) {
  second = await jres(await req('/api/conversations/1/messages'))
  if (second.body.running === false) break
  await sleep(20)
}
const stop = await jres(await req('/api/conversations/1/stop', { method: 'POST' }))
check('stop idle', stop.status === 200 && stop.body.status === 'idle', json(stop.body))

// ── digest + 批量删除 + 删除 ────────────────────────────────────────────────
const digest = await jres(await req('/api/conversations/digest'))
check('digest', digest.status === 200 && Array.isArray(digest.body.items) && digest.body.items.length >= 2, json(digest.body))

const c2 = await jres(await post('/api/conversations', { agent_key: 'mainagent', title: 'second' }))
const batch = await jres(await post('/api/conversations/delete/batch', { ids: [c2.body.id] }))
check('batch delete', batch.status === 200 && batch.body.items[0].ok === true, json(batch.body))

const del = await jres(await req('/api/conversations/1', { method: 'DELETE' }))
check('delete conversation', del.status === 200 && del.body.deleted === 1, json(del.body))

const listedAfter = await jres(await req('/api/conversations'))
check('list empty after delete', listedAfter.status === 200 && listedAfter.body.conversations.length === 0, json(listedAfter.body))

// ── 汇报 ─────────────────────────────────────────────────────────────────────
let failed = false
for (const item of results) {
  if (!item.ok) failed = true
  console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`)
}
console.log(`root: ${root}`)
gateway.close()
process.exit(failed ? 1 : 0)
