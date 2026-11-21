// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/** TS 控制面路由契约：与 web 期望的 JSON 形状一致，不依赖 Go。 */

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'

const dir = await mkdtemp(join(tmpdir(), 'vexnar-egress-routes-'))
process.env.VEXNAR_EGRESS_DIR = dir

const { registerEgress, stopEgressRuntime } = await import('./src/egress/routes.ts')
const app = new Hono()
registerEgress(app)

const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })

const state0 = await (await app.request('/api/proxy/state')).json()
check(
  '初始 state 形状',
  state0.enabled === true && Array.isArray(state0.pools) && Array.isArray(state0.nodes) && state0.default_pool === 0,
  JSON.stringify(state0).slice(0, 120)
)
check('网关已分配端口', /127\.0\.0\.1:\d+/.test(state0.gateway), state0.gateway)

const poolRes = await app.request('/api/proxy/pools', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'hk', mode_default: 'rotate', fallback: 'block' })
})
const pool = await poolRes.json()
check('创建池返回 id 与计数', poolRes.status === 200 && pool.id > 0 && pool.node_count === 0, JSON.stringify(pool))

const importRes = await app.request('/api/proxy/nodes/import', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    text: 'proxies:\n  - { name: A, type: socks5, server: 10.0.0.1, port: 1080 }\n  - { name: B, type: socks5, server: 10.0.0.2, port: 1080 }\n',
    pool_id: pool.id,
    tags: ['hk']
  })
})
const imported = await importRes.json()
check(
  '导入节点并入池',
  importRes.status === 200 && imported.created === 2 && imported.added_to_pool === 2,
  JSON.stringify(imported)
)

const nodes = await (await app.request('/api/proxy/nodes')).json()
check('节点列表含配置且无密钥', nodes.length === 2 && nodes.every((n) => n.config && !('password' in n)), JSON.stringify(nodes[0]?.name))
const disabled = await app.request('/api/proxy/nodes/batch', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ids: [nodes[0].id], action: 'disable' })
})
check('批量禁用', (await disabled.json()).updated === 1)

const bindRes = await app.request('/api/tasks/5/proxy', {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ pool_id: pool.id, mode: 'sticky', fallback: 'block', max_conns: 4 })
})
const binding = await bindRes.json()
check('任务绑定', bindRes.status === 200 && binding.pool_id === pool.id && binding.max_conns === 4, JSON.stringify(binding))
const bound = await (await app.request('/api/tasks/5/proxy')).json()
check('读取任务绑定', bound.binding?.pool_id === pool.id)

const conflict = await app.request(`/api/proxy/pools/${pool.id}`, { method: 'DELETE' })
check('被绑定池禁止删除 409', conflict.status === 409, String(conflict.status))

const settingsGet = await (await app.request('/api/proxy/settings')).json()
check('代理池设置可读', settingsGet.default_pool === 0 && settingsGet.egress_listener_auth === false, JSON.stringify(settingsGet))
await app.request('/api/proxy/settings', {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ default_pool: pool.id, egress_listener_auth: true })
})
const settings2 = await (await app.request('/api/proxy/settings')).json()
check('代理池设置可写', settings2.default_pool === pool.id && settings2.egress_listener_auth === true, JSON.stringify(settings2))

await app.request('/api/tasks/5/proxy', { method: 'DELETE' })
const removed = await app.request(`/api/proxy/pools/${pool.id}`, { method: 'DELETE' })
check('解绑后可删除池', removed.status === 200, String(removed.status))

const badParse = await app.request('/api/proxy/nodes/parse', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: 'not-a-node' })
})
const badBody = await badParse.json()
check('非法输入返回 issues 而非 500', badParse.status === 200 && badBody.issues.length === 1, JSON.stringify(badBody))

await stopEgressRuntime()

let passed = 0
for (const r of results) {
  console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${r.name}  ${r.detail}`)
  if (r.ok) passed++
}
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
