// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 代理池的 TS 控制面：/api/proxy/* 与 /api/tasks/:id/proxy。
 *
 * 运行时可整体内嵌在 app core 里，不依赖 Go：协议引擎（mihomo 二进制）由本模块
 * 托管；节点/池/订阅都在 TS 的 SQLite 中。响应形状与 Go 版契约一致，web 无需改动。
 */

import { join } from 'node:path'
import type { Context, Hono } from 'hono'

import { storeRoot } from '../context.ts'
import { EgressGateway } from './gateway.ts'
import { EgressManager, EgressError, FANOUT_BUDGET_PER_HOUR, fingerprint, sanitizeKey } from './manager.ts'
import { nodeFromClashMap, parseInput, parseUri } from './parse.ts'
import type { Binding, Pool, StoredNode, Subscription } from './types.ts'

let runtime: Promise<{ manager: EgressManager; gateway: EgressGateway }> | undefined

/** 单例运行时；首次请求时启动（gateway 端口在此时分配）。 */
export function egressRuntime(): Promise<{ manager: EgressManager; gateway: EgressGateway }> {
  if (!runtime) {
    runtime = (async () => {
      const dir = process.env.VEXNAR_EGRESS_DIR?.trim() || join(storeRoot(), 'egress')
      const manager = new EgressManager({ dir })
      await manager.start()
      const gateway = new EgressGateway(manager)
      await gateway.start()
      return { manager, gateway }
    })()
  }
  return runtime
}

/** 测试/关停用：释放网关与数据库。 */
export async function stopEgressRuntime(): Promise<void> {
  if (!runtime) return
  const { manager, gateway } = await runtime
  runtime = undefined
  await gateway.stop()
  await manager.stop()
}

export function registerEgress(api: Hono): void {
  const wrap = (handler: (c: Context) => Promise<Response>) => async (c: Context) => {
    try {
      return await handler(c)
    } catch (error) {
      if (error instanceof EgressError) {
        return c.json({ error: error.message, code: error.code }, error.status as 400)
      }
      return c.json({ error: (error as Error).message, code: 'EGRESS_FAILED' }, 500)
    }
  }

  const manager = async () => (await egressRuntime()).manager

  // ---- state / settings ----
  api.get(
    '/api/proxy/state',
    wrap(async (c) => {
      const mgr = await manager()
      return c.json(mgr.state())
    })
  )
  // 渗透中登记跳板：拿到一个 SOCKS5/HTTP 出口（如 SSH -D、CS socks）后立即入池，
  // 并可选择经现有节点链式拨号（via_node_id）。
  api.post(
    '/api/proxy/pivots',
    wrap(async (c) => {
      const mgr = await manager()
      const body = (await c.req.json()) as Record<string, unknown>
      const protocol = String(body.protocol ?? 'socks5')
      if (protocol !== 'socks5' && protocol !== 'http') return c.json({ error: '跳板只支持 socks5/http' }, 400)
      const server = String(body.server ?? '').trim()
      const port = Number(body.port ?? 0)
      if (!server || !Number.isInteger(port) || port <= 0) return c.json({ error: 'server/port 无效' }, 400)
      const username = body.username == null ? '' : String(body.username)
      const password = body.password == null ? '' : String(body.password)
      const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : ''
      let config
      try {
        config = parseUri(`${protocol}://${auth}${server}:${port}#${encodeURIComponent(String(body.name ?? `pivot-${server}:${port}`))}`)
      } catch (error) {
        return c.json({ error: (error as Error).message }, 400)
      }
      const viaNodeId = Number(body.via_node_id ?? body.viaNodeId ?? 0) || undefined
      if (viaNodeId && !mgr.nodeById(viaNodeId)) return c.json({ error: '上游节点不存在' }, 400)
      const node: StoredNode = {
        ...config,
        fingerprint: fingerprint(config),
        tags: Array.isArray(body.tags) ? body.tags.map(String) : ['pivot'],
        weight: 1,
        maxConns: Number(body.max_conns ?? 8) || 8,
        enabled: true,
        note: String(body.note ?? '渗透跳板'),
        egressIp: '',
        source: 'pivot',
        viaNodeId,
        createdAt: 0,
        updatedAt: 0,
        id: 0
      }
      mgr.store.upsertNodes([node])
      await mgr.reload()
      const stored = mgr.store.listNodes().find((item) => item.fingerprint === node.fingerprint)
      const created = stored ? (mgr.state() as { nodes: NodeDto[] }).nodes.find((item) => item.id === stored.id) : undefined
      const poolId = Number(body.pool_id ?? 0) || mgr.settings.defaultPool
      if (created && poolId) {
        const pool = mgr.store.pool(poolId)
        if (pool) mgr.store.setPoolNodes(poolId, [...new Set([...mgr.store.poolNodes(poolId), created.id])])
      }
      await mgr.reload()
      return c.json({ node: created ?? null, pool_id: poolId })
    })
  )

  // 会话出口：给 dsh 工具/浏览器返回带凭据的代理 URL（凭证只在本进程内）。
  api.post(
    '/api/proxy/session',
    wrap(async (c) => {
      const mgr = await manager()
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
      const taskId = Number(body.task_id ?? 0) || 0
      const scope = String(body.scope ?? '').trim()
      const key = sanitizeKey(scope || (taskId ? `task-${taskId}-worker` : `dsh-${crypto.randomUUID()}`))
      const endpoint = mgr.endpoint({
        key,
        taskId: taskId || undefined,
        poolId: Number(body.pool_id ?? 0) || undefined,
        mode: (body.mode as 'sticky' | 'rotate' | 'fanout' | undefined) ?? 'sticky',
        fallback: body.fallback as 'block' | 'direct' | undefined,
        maxConns: Number(body.max_conns ?? 8) || 8,
        fanoutK: Number(body.fanout_k ?? 3) || 3
      })
      const state = mgr.state() as { socks?: string }
      return c.json({ proxy: endpoint.url, socks: state.socks ?? '', session: key, pool_id: endpoint.poolId })
    })
  )

  // 浏览器固定端口：只能配置静态代理的客户端（Playwright MCP）用；无认证、仅回环。
  api.post(
    '/api/proxy/fixed',
    wrap(async (c) => {
      const { gateway } = await egressRuntime()
      const mgr = await manager()
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
      const taskId = Number(body.task_id ?? 0) || 0
      const scope = String(body.scope ?? '').trim()
      const key = sanitizeKey(scope || (taskId ? `task-${taskId}-worker` : `dsh-${crypto.randomUUID()}`))
      mgr.endpoint({ key, taskId: taskId || undefined, poolId: Number(body.pool_id ?? 0) || undefined, mode: 'rotate', maxConns: 16 })
      const port = await gateway.openFixed(key)
      return c.json({ proxy: `http://127.0.0.1:${port}`, session: key })
    })
  )
  api.delete(
    '/api/proxy/fixed/:key',
    wrap(async (c) => {
      const { gateway } = await egressRuntime()
      const key = sanitizeKey(c.req.param('key') ?? '')
      gateway.closeFixed(key)
      return c.json({ closed: key })
    })
  )

  api.get(
    '/api/proxy/_bridge',
    wrap(async (c) => {
      const { manager: mgr, gateway } = await egressRuntime()
      return c.json({
        contract: 1,
        engine: { available: mgr.engine.available, error: mgr.engine.error || null },
        gateway: { http: mgr.gatewayAddress(), socks: mgr.socksAddress(), ports: gatewayPorts(gateway) },
        endpoints: 'TS native'
      })
    })
  )
  api.get(
    '/api/proxy/settings',
    wrap(async (c) => {
      const mgr = await manager()
      return c.json({
        default_pool: mgr.settings.defaultPool,
        egress_listener_auth: mgr.settings.listenerAuth,
        engine: { available: mgr.engine.available, error: mgr.engine.error || null },
        fanout_budget_per_hour: FANOUT_BUDGET_PER_HOUR
      })
    })
  )
  api.put(
    '/api/proxy/settings',
    wrap(async (c) => {
      const mgr = await manager()
      const body = (await c.req.json()) as { default_pool?: number; egress_listener_auth?: boolean }
      if (body.default_pool !== undefined) mgr.setDefaultPool(Number(body.default_pool) || 0)
      if (body.egress_listener_auth !== undefined) mgr.setListenerAuth(Boolean(body.egress_listener_auth))
      return c.json({
        default_pool: mgr.settings.defaultPool,
        egress_listener_auth: mgr.settings.listenerAuth
      })
    })
  )

  // ---- pools ----
  api.get(
    '/api/proxy/pools',
    wrap(async (c) => c.json((await manager()).state().pools))
  )
  api.post(
    '/api/proxy/pools',
    wrap(async (c) => {
      const mgr = await manager()
      const body = (await c.req.json()) as Partial<Pool> & { mode_default?: string; fanout_k?: number; max_conns?: number }
      const id = mgr.store.createPool({
        name: String(body.name ?? '').trim(),
        strategy: body.strategy,
        modeDefault: (body.mode_default ?? body.modeDefault ?? 'sticky') as Pool['modeDefault'],
        fallback: body.fallback,
        fanoutK: Number(body.fanout_k ?? body.fanoutK ?? 3),
        maxConns: Number(body.max_conns ?? body.maxConns ?? 128),
        healthUrl: body.healthUrl,
        ipProbeUrl: body.ipProbeUrl,
        checkSeconds: body.checkSeconds,
        stickyTtl: body.stickyTtl,
        note: body.note
      })
      await mgr.reload()
      return c.json(poolDto(mgr, id))
    })
  )
  api.patch(
    '/api/proxy/pools/:id',
    wrap(async (c) => {
      const mgr = await manager()
      const id = Number(c.req.param('id'))
      const existing = mgr.store.pool(id)
      if (!existing) return c.json({ error: '池不存在' }, 404)
      const body = (await c.req.json()) as Record<string, unknown>
      mgr.store.updatePool({
        id,
        name: String(body.name ?? existing.name),
        strategy: String(body.strategy ?? existing.strategy),
        modeDefault: (body.mode_default ?? body.modeDefault ?? existing.modeDefault) as Pool['modeDefault'],
        fallback: (body.fallback ?? existing.fallback) as Pool['fallback'],
        fanoutK: Number(body.fanout_k ?? body.fanoutK ?? existing.fanoutK),
        maxConns: Number(body.max_conns ?? body.maxConns ?? existing.maxConns),
        healthUrl: String(body.health_url ?? body.healthUrl ?? existing.healthUrl),
        ipProbeUrl: String(body.ip_probe_url ?? body.ipProbeUrl ?? existing.ipProbeUrl),
        checkSeconds: Number(body.check_interval ?? body.checkSeconds ?? existing.checkSeconds),
        stickyTtl: Number(body.sticky_ttl ?? body.stickyTtl ?? existing.stickyTtl),
        note: String(body.note ?? existing.note)
      })
      await mgr.reload()
      return c.json(poolDto(mgr, id))
    })
  )
  api.delete(
    '/api/proxy/pools/:id',
    wrap(async (c) => {
      const mgr = await manager()
      const id = Number(c.req.param('id'))
      if (!mgr.store.pool(id)) return c.json({ error: '池不存在' }, 404)
      for (const binding of mgr.store.bindings().values()) {
        if (binding.poolId === id) return c.json({ error: '该池仍被任务绑定，先解除绑定再删除' }, 409)
      }
      if (mgr.settings.defaultPool === id) mgr.setDefaultPool(0)
      mgr.store.deletePool(id)
      await mgr.reload()
      return c.json({ deleted: id })
    })
  )
  api.get(
    '/api/proxy/pools/:id/nodes',
    wrap(async (c) => {
      const mgr = await manager()
      const id = Number(c.req.param('id'))
      const state = mgr.state() as { nodes: NodeDto[]; pools: { id: number; members?: number[] | null }[] }
      const members = state.pools.find((p) => p.id === id)?.members ?? []
      return c.json(state.nodes.filter((n) => members.includes(n.id)))
    })
  )
  api.post(
    '/api/proxy/pools/:id/nodes',
    wrap(async (c) => {
      const mgr = await manager()
      const id = Number(c.req.param('id'))
      const body = (await c.req.json()) as { node_ids?: number[] }
      const current = mgr.store.poolNodes(id)
      const merged = [...new Set([...current, ...(body.node_ids ?? [])])]
      mgr.store.setPoolNodes(id, merged)
      await mgr.reload()
      return c.json({ pool_id: id, node_ids: merged })
    })
  )
  api.delete(
    '/api/proxy/pools/:id/nodes/:nodeID',
    wrap(async (c) => {
      const mgr = await manager()
      const id = Number(c.req.param('id'))
      const nodeId = Number(c.req.param('nodeID'))
      const kept = mgr.store.poolNodes(id).filter((n) => n !== nodeId)
      mgr.store.setPoolNodes(id, kept)
      await mgr.reload()
      return c.json({ pool_id: id, node_ids: kept })
    })
  )
  api.post(
    '/api/proxy/pools/:id/check',
    wrap(async (c) => {
      const mgr = await manager()
      return c.json(await mgr.checkPool(Number(c.req.param('id'))))
    })
  )

  // ---- nodes ----
  api.get(
    '/api/proxy/nodes',
    wrap(async (c) => c.json((await manager()).state().nodes))
  )
  api.post(
    '/api/proxy/nodes',
    wrap(async (c) => {
      const mgr = await manager()
      const body = (await c.req.json()) as NodeInput
      const node = toStoredNode(body)
      const result = mgr.store.upsertNodes([node], body.tags ?? [])
      await mgr.reload()
      return c.json(result)
    })
  )
  api.post(
    '/api/proxy/nodes/parse',
    wrap(async (c) => {
      const body = (await c.req.json()) as { text?: string; url?: string }
      const text = await resolveText(body.text, body.url)
      return c.json(parseInput(text))
    })
  )
  api.post(
    '/api/proxy/nodes/import',
    wrap(async (c) => {
      const mgr = await manager()
      const body = (await c.req.json()) as { text?: string; url?: string; pool_id?: number; tags?: string[] }
      const text = await resolveText(body.text, body.url)
      const parsed = parseInput(text)
      if (parsed.nodes.length === 0) {
        return c.json({ error: '没有解析到可用节点', issues: parsed.issues }, 400)
      }
      const nodes = parsed.nodes.map((config) => toStoredNode(config as NodeInput, body.tags))
      const result = mgr.store.upsertNodes(nodes, body.tags ?? [])
      let added = 0
      if (body.pool_id && body.pool_id > 0) {
        const fingerprints = new Set(parsed.nodes.map((n) => fingerprint(n)))
        const imported = mgr.store.listNodes().filter((n) => fingerprints.has(n.fingerprint))
        const current = mgr.store.poolNodes(body.pool_id)
        const merged = [...new Set([...current, ...imported.map((n) => n.id)])]
        added = merged.length - current.length
        mgr.store.setPoolNodes(body.pool_id, merged)
      }
      await mgr.reload()
      return c.json({ ...result, added_to_pool: added, issues: parsed.issues })
    })
  )
  api.post(
    '/api/proxy/nodes/batch',
    wrap(async (c) => {
      const mgr = await manager()
      const body = (await c.req.json()) as { ids?: number[]; action?: string; pool_id?: number; tags?: string[] }
      const ids = [...new Set(body.ids ?? [])]
      let updated = 0
      let deleted = 0
      const checked: unknown[] = []
      for (const id of ids) {
        const node = mgr.store.node(id)
        if (!node) continue
        switch (body.action) {
          case 'enable':
          case 'disable':
            node.enabled = body.action === 'enable'
            mgr.store.updateNode(node)
            updated++
            break
          case 'delete':
            mgr.store.deleteNode(id)
            deleted++
            break
          case 'check':
            checked.push(await mgr.checkNode(id))
            break
          case 'tag':
            node.tags = [...new Set([...node.tags, ...(body.tags ?? [])])]
            mgr.store.updateNode(node)
            updated++
            break
          default:
            break
        }
      }
      if (body.action === 'add_to_pool' || body.action === 'remove_from_pool') {
        if (!body.pool_id) return c.json({ error: '需要 pool_id' }, 400)
        const current = mgr.store.poolNodes(body.pool_id)
        const merged =
          body.action === 'add_to_pool'
            ? [...new Set([...current, ...ids])]
            : current.filter((id) => !ids.includes(id))
        mgr.store.setPoolNodes(body.pool_id, merged)
        updated = merged.length
      }
      await mgr.reload()
      return c.json({ updated, deleted, checked })
    })
  )
  api.patch(
    '/api/proxy/nodes/:id',
    wrap(async (c) => {
      const mgr = await manager()
      const id = Number(c.req.param('id'))
      const node = mgr.store.node(id)
      if (!node) return c.json({ error: '节点不存在' }, 404)
      const body = (await c.req.json()) as NodeInput
      if (body.name) node.name = body.name
      if (body.tags) node.tags = body.tags
      if (body.weight !== undefined) node.weight = body.weight
      if (body.max_conns !== undefined) node.maxConns = body.max_conns
      if (body.enabled !== undefined) node.enabled = body.enabled
      if (body.note !== undefined) node.note = body.note
      if (body.config) node.config = body.config
      if (body.secrets) node.secrets = body.secrets
      node.fingerprint = fingerprint(node)
      mgr.store.updateNode(node)
      await mgr.reload()
      const state = mgr.state() as { nodes: NodeDto[] }
      return c.json(state.nodes.find((n) => n.id === id) ?? null)
    })
  )
  api.delete(
    '/api/proxy/nodes/:id',
    wrap(async (c) => {
      const mgr = await manager()
      const id = Number(c.req.param('id'))
      mgr.store.deleteNode(id)
      await mgr.reload()
      return c.json({ deleted: id })
    })
  )
  api.post(
    '/api/proxy/nodes/:id/check',
    wrap(async (c) => {
      const mgr = await manager()
      return c.json(await mgr.checkNode(Number(c.req.param('id'))))
    })
  )

  // ---- leases / default pool ----
  api.post(
    '/api/proxy/leases/reset',
    wrap(async (c) => {
      const mgr = await manager()
      const body = (await c.req.json().catch(() => ({}))) as { task_id?: number }
      if (body.task_id && body.task_id > 0) mgr.revokeTask(Number(body.task_id))
      else for (const key of [...(mgr as unknown as { sessions: Map<string, unknown> }).sessions.keys()]) mgr.revoke(key)
      return c.json({ reset: true, task_id: body.task_id ?? 0 })
    })
  )
  api.put(
    '/api/proxy/default-pool',
    wrap(async (c) => {
      const mgr = await manager()
      const body = (await c.req.json()) as { pool_id?: number }
      const id = Number(body.pool_id ?? 0)
      if (id > 0 && !mgr.store.pool(id)) return c.json({ error: '池不存在' }, 404)
      mgr.setDefaultPool(id)
      return c.json({ pool_id: id })
    })
  )

  // ---- fanout ----
  api.post(
    '/api/proxy/fanout',
    wrap(async (c) => {
      const mgr = await manager()
      const body = (await c.req.json()) as {
        task_id?: number
        url?: string
        method?: string
        headers?: Record<string, string>
        body?: string
        k?: number
      }
      if (!body.url) return c.json({ error: 'url 必填' }, 400)
      const key = `task:${Number(body.task_id ?? 0)}:worker`
      mgr.endpoint({ key, taskId: Number(body.task_id ?? 0), role: 'worker' })
      const result = await mgr.fanout(key, body.method ?? 'GET', body.url, {
        k: body.k,
        headers: body.headers,
        body: body.body
      })
      return c.json({
        status: result.status,
        blocked: result.blocked,
        winner_node: result.winner_node,
        attempts: result.attempts,
        body: result.body
      })
    })
  )

  // ---- subscriptions ----
  api.get(
    '/api/proxy/subscriptions',
    wrap(async (c) => c.json((await manager()).store.subscriptions().map(subDto)))
  )
  api.post(
    '/api/proxy/subscriptions',
    wrap(async (c) => {
      const mgr = await manager()
      const body = (await c.req.json()) as Partial<Subscription> & { pool_id?: number; interval_seconds?: number }
      const id = mgr.store.saveSubscription({
        name: body.name,
        url: body.url,
        poolId: Number(body.pool_id ?? body.poolId ?? 0),
        tags: body.tags,
        intervalSeconds: Number(body.interval_seconds ?? body.intervalSeconds ?? 3600),
        enabled: body.enabled !== false
      })
      return c.json(subDto(mgr.store.subscription(id) as Subscription))
    })
  )
  api.post(
    '/api/proxy/subscriptions/preview',
    wrap(async (c) => {
      const body = (await c.req.json()) as { url?: string }
      const text = await resolveText(undefined, body.url)
      return c.json(parseInput(text))
    })
  )
  api.patch(
    '/api/proxy/subscriptions/:id',
    wrap(async (c) => {
      const mgr = await manager()
      const id = Number(c.req.param('id'))
      const existing = mgr.store.subscription(id)
      if (!existing) return c.json({ error: '订阅不存在' }, 404)
      const body = (await c.req.json()) as Partial<Subscription> & { pool_id?: number; interval_seconds?: number }
      mgr.store.saveSubscription({
        id,
        name: body.name ?? existing.name,
        url: body.url ?? existing.url,
        poolId: Number(body.pool_id ?? body.poolId ?? existing.poolId),
        tags: body.tags ?? existing.tags,
        intervalSeconds: Number(body.interval_seconds ?? body.intervalSeconds ?? existing.intervalSeconds),
        enabled: body.enabled ?? existing.enabled
      })
      return c.json(subDto(mgr.store.subscription(id) as Subscription))
    })
  )
  api.delete(
    '/api/proxy/subscriptions/:id',
    wrap(async (c) => {
      const mgr = await manager()
      const id = Number(c.req.param('id'))
      mgr.store.deleteSubscription(id)
      return c.json({ deleted: id })
    })
  )
  api.post(
    '/api/proxy/subscriptions/:id/refresh',
    wrap(async (c) => {
      const mgr = await manager()
      return c.json(await mgr.refreshSubscription(Number(c.req.param('id'))))
    })
  )

  // ---- task binding ----
  api.get(
    '/api/tasks/:id/proxy',
    wrap(async (c) => {
      const mgr = await manager()
      const taskId = Number(c.req.param('id'))
      const binding = mgr.store.binding(taskId)
      const snapshot = (mgr.state() as { sessions: Record<string, unknown>[] }).sessions.find(
        (s) => s.task_id === taskId && s.session === `task-${taskId}-worker`
      )
      return c.json({ task_id: taskId, binding: binding ? bindingDto(binding) : null, worker_session: snapshot })
    })
  )
  api.put(
    '/api/tasks/:id/proxy',
    wrap(async (c) => {
      const mgr = await manager()
      const taskId = Number(c.req.param('id'))
      const body = (await c.req.json()) as {
        pool_id?: number
        mode?: string
        fanout_k?: number
        fallback?: string
        max_conns?: number
      }
      if (!body.pool_id || !mgr.store.pool(Number(body.pool_id))) return c.json({ error: '池不存在' }, 404)
      const binding: Binding = {
        taskId,
        poolId: Number(body.pool_id),
        mode: (body.mode as Binding['mode']) ?? 'sticky',
        fanoutK: Number(body.fanout_k ?? 3),
        fallback: (body.fallback as Binding['fallback']) ?? 'block',
        maxConns: Number(body.max_conns ?? 8)
      }
      mgr.store.setBinding(binding)
      await mgr.reload()
      return c.json(bindingDto(binding))
    })
  )
  api.delete(
    '/api/tasks/:id/proxy',
    wrap(async (c) => {
      const mgr = await manager()
      const taskId = Number(c.req.param('id'))
      mgr.revokeTask(taskId)
      mgr.store.deleteBinding(taskId)
      await mgr.reload()
      return c.json({ task_id: taskId, binding: null })
    })
  )

  // ---- SSE ----
  api.get('/api/proxy/events', async (c) => {
    const mgr = await manager()
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (value: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`))
        send(mgr.state())
        const onEvent = (event: unknown) => {
          try {
            send(event)
          } catch {
            /* closed */
          }
        }
        mgr.events.on('event', onEvent)
        const ping = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': ping\n\n'))
          } catch {
            /* closed */
          }
        }, 20_000)
        c.req.raw.signal.addEventListener('abort', () => {
          clearInterval(ping)
          mgr.events.off('event', onEvent)
          try {
            controller.close()
          } catch {
            /* already closed */
          }
        })
      }
    })
    return c.body(stream, 200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'x-accel-buffering': 'no'
    })
  })
}

// ---------- DTO helpers ----------

interface NodeDto {
  id: number
  name: string
  protocol: string
  server: string
  port: number
  [key: string]: unknown
}

interface NodeInput {
  name?: string
  protocol?: string
  server?: string
  port?: number
  config?: Record<string, unknown>
  secrets?: Record<string, string>
  uri?: string
  tags?: string[]
  weight?: number
  max_conns?: number
  maxConns?: number
  enabled?: boolean
  note?: string
}

function toStoredNode(input: NodeInput, tags: string[] = []): StoredNode {
  const config =
    input.uri
      ? parseInput(input.uri).nodes[0]
      : nodeFromClashMap({
          name: input.name,
          type: input.protocol,
          server: input.server,
          port: input.port,
          ...input.config,
          ...input.secrets
        })
  if (!config) throw new Error('无法解析节点')
  return {
    ...config,
    id: 0,
    fingerprint: fingerprint(config),
    tags: tags.length ? tags : input.tags ?? [],
    weight: input.weight ?? 1,
    maxConns: input.max_conns ?? input.maxConns ?? 32,
    enabled: input.enabled !== false,
    note: input.note ?? '',
    egressIp: '',
    source: '',
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000)
  }
}

function poolDto(mgr: EgressManager, id: number): unknown {
  const state = mgr.state() as { pools: Record<string, unknown>[] }
  return state.pools.find((pool) => pool.id === id) ?? null
}

function bindingDto(binding: Binding) {
  return {
    task_id: binding.taskId,
    pool_id: binding.poolId,
    mode: binding.mode,
    fanout_k: binding.fanoutK,
    fallback: binding.fallback,
    max_conns: binding.maxConns
  }
}

function subDto(sub: Subscription) {
  return {
    id: sub.id,
    name: sub.name,
    url: sub.url,
    pool_id: sub.poolId,
    tags: sub.tags,
    interval_seconds: sub.intervalSeconds,
    enabled: sub.enabled,
    last_fetch_at: sub.lastFetchAt ? new Date(sub.lastFetchAt * 1000).toISOString() : '0001-01-01T00:00:00Z',
    last_error: sub.lastError || undefined,
    last_added: sub.lastAdded,
    last_removed: sub.lastRemoved,
    last_changed: sub.lastChanged,
    last_diff: sub.lastDiff || undefined,
    created_at: new Date(sub.createdAt * 1000).toISOString()
  }
}

async function resolveText(text?: string, url?: string): Promise<string> {
  if (text && text.trim()) return text
  const target = (url ?? '').trim()
  if (!target) throw new Error('需要粘贴节点内容或填写订阅 URL')
  if (!/^https?:\/\//i.test(target)) throw new Error('订阅 URL 只允许 http/https')
  const response = await fetch(target, {
    headers: { 'user-agent': 'vexnar/egress' },
    signal: AbortSignal.timeout(25_000),
    redirect: 'error'
  })
  if (!response.ok) throw new Error(`订阅返回 HTTP ${response.status}`)
  const body = await response.arrayBuffer()
  if (body.byteLength > 8 << 20) throw new Error('订阅内容超过 8MB')
  return Buffer.from(body).toString('utf8')
}

function gatewayPorts(gateway: EgressGateway): { http: number; socks: number } {
  const ports = (gateway as unknown as { addresses: { httpPort: number; socksPort: number } }).addresses
  return { http: ports.httpPort, socks: ports.socksPort }
}

export { sanitizeKey }
