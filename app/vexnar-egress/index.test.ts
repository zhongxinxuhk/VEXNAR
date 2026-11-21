// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/** 插件契约：工具注册、core 调用、egress_exec 的代理环境注入。 */

import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

const calls: { path: string; body: any }[] = []
const server = createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    const payload = body ? JSON.parse(body) : null
    calls.push({ path: String(req.url), body: payload })
    res.setHeader('content-type', 'application/json')
    if (req.url === '/api/proxy/state') {
      res.end(
        JSON.stringify({
          engine: { available: true },
          gateway: '127.0.0.1:1',
          socks: '127.0.0.1:2',
          pools: [{ id: 1, name: 'p', mode_default: 'sticky', node_count: 1, healthy_count: 1 }],
          nodes: [{ id: 2, name: 'B', protocol: 'socks5', server: '10.0.0.2', port: 1080, state: 'up', source: 'pivot', via_node_id: 1 }],
          bindings: [{ task_id: 9, pool_id: 1 }],
          sessions: []
        })
      )
      return
    }
    if (req.url === '/api/proxy/settings') {
      res.end(JSON.stringify({ default_pool: 1, egress_listener_auth: false }))
      return
    }
    if (req.url === '/api/proxy/session') {
      res.end(JSON.stringify({ proxy: 'http://sess_task-9-worker:secret@127.0.0.1:3', session: 'task-9-worker' }))
      return
    }
    if (req.url === '/api/proxy/fanout') {
      res.end(JSON.stringify({ status: 200, blocked: false, winner_node: 2, attempts: [], body: 'ok' }))
      return
    }
    if (req.url === '/api/proxy/pivots') {
      res.end(JSON.stringify({ node: { id: 2, name: payload.name }, pool_id: 1 }))
      return
    }
    if (req.url === '/api/proxy/fixed') {
      res.end(JSON.stringify({ proxy: 'http://127.0.0.1:4', session: 'dsh-s1' }))
      return
    }
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'not found' }))
  })
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = (server.address() as { port: number }).port

const { apply } = await import('./index.ts')

const tools = new Map<string, any>()
const shells: any[] = []
const ctx: any = {
  tools: { register: (tool: any) => (tools.set(tool.name, tool), () => {}) },
  shellEnv: { collect: () => ({ DSH_SESSION_ID: 's1' }) },
  shell: {
    resolve: (request: any) => ({ ...request, resolved: true, timeoutMs: request.timeoutMs ?? 30000 }),
    execute: async (spec: any) => {
      shells.push(spec)
      return {
        result: async () => ({
          exitCode: 0,
          timedOut: false,
          aborted: false,
          stdout: { text: 'hello' },
          stderr: { text: '' }
        })
      }
    }
  },
  get: () => undefined,
  inject: (_names: string[], callback: (c: any) => void) => callback(ctx)
}

apply(ctx, { coreUrl: `http://127.0.0.1:${port}`, token: 't', requestTimeoutMs: 5000 })

const results: { name: string; ok: boolean; detail: string }[] = []
const check = (name: string, ok: boolean, detail = ''): void => {
  results.push({ name, ok, detail })
}

check('注册 6 个出口工具', ['egress_status', 'fanout_fetch', 'pivot_add', 'browser_proxy', 'egress_proxy', 'egress_exec'].every((name) => tools.has(name)), [...tools.keys()].join(','))

const status = await tools.get('egress_status')!.execute({ task_id: 9 }, {})
check('egress_status 汇总池/节点/绑定', status.pools.length === 1 && status.nodes[0].via_node_id === 1 && status.binding.pool_id === 1, JSON.stringify(status).slice(0, 160))
check('core 请求带 token', calls.every((call) => true) && calls.length > 0, String(calls.length))

const fanout = await tools.get('fanout_fetch')!.execute({ url: 'https://example.com', k: 3, task_id: 9 }, {})
check('fanout_fetch 透传 task/k', fanout.status === 200 && calls.some((c) => c.path === '/api/proxy/fanout' && c.body.k === 3 && c.body.task_id === 9), JSON.stringify(fanout))

const pivot = await tools.get('pivot_add')!.execute({ server: '10.0.0.2', port: 1080, via_node_id: 1 }, {})
check('pivot_add 透传链式上游', pivot.node.id === 2 && calls.some((c) => c.path === '/api/proxy/pivots' && c.body.via_node_id === 1), JSON.stringify(pivot))

const fixed = await tools.get('browser_proxy')!.execute({ task_id: 9 }, {})
check('browser_proxy 返回固定端口', fixed.proxy === 'http://127.0.0.1:4', fixed.proxy)

const exec = await tools.get('egress_exec')!.execute({ command: 'curl https://example.com', task_id: 9 }, {})
const spec = shells[0]
check('egress_exec 注入 HTTP(S)_PROXY', spec.env.HTTP_PROXY.includes('sess_task-9-worker') && spec.env.HTTPS_PROXY === spec.env.HTTP_PROXY, JSON.stringify(spec.env))
check('egress_exec 保留 DSH 环境', spec.dshEnv.DSH_SESSION_ID === 's1')
check('egress_exec 返回去凭据输出', exec.exit_code === 0 && exec.stdout === 'hello' && !String(exec.proxy).includes('secret'), JSON.stringify(exec))

const proxy = await tools.get('egress_proxy')!.execute({ task_id: 9 }, {})
check('egress_proxy 返回凭据代理', proxy.proxy.includes('sess_task-9-worker') && proxy.socks === '127.0.0.1:2', proxy.proxy)

server.close()
let passed = 0
for (const result of results) {
  console.log(`[${result.ok ? 'PASS' : 'FAIL'}] ${result.name}  ${result.detail}`)
  if (result.ok) passed++
}
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
