// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Hono } from 'hono'
import { meta, operations, parseJson, store } from '../context.ts'

// ─────────────────────────────────────────────────────────────────────────────
// 资产同步（ScopeSentry 数据源），语义对齐 server/sync_scopesentry.go。
//
// ScopeSentry 是一个 ASM 资产测绘平台，通过其 MCP 接口按【项目】/【任务】两个
// 维度拉取子域名、Web 应用、服务等资产，映射为 VEXNAR 的公司 + 资产模型。数据源
// 本身是一个名为 "ScopeSentry" 的 http 传输 MCP 行（url + X-API-Key 头存 meta.mcp）。
//
// 与 agent 工具层不同，这里直接走 JSON-RPC 调 MCP 工具、拿原始 JSON，不触发
// AskUser 权限弹窗（后台批量同步）。
// ─────────────────────────────────────────────────────────────────────────────

const scopeSentryMCPName = 'ScopeSentry'
const syncMaxPerType = 5000
const syncDefaultPage = 100

function rfc3339(date: Date) {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = (value: number) => String(Math.floor(Math.abs(value))).padStart(2, '0')
  return `${date.toISOString().slice(0, 23)}${sign}${pad(offset / 60)}:${pad(offset % 60)}`.replace('Z', '')
}

function queryInt(c: any, key: string, def: number): number {
  const v = c.req.query(key)
  if (v) {
    const n = Number(v)
    if (Number.isInteger(n) && n > 0) return n
  }
  return def
}

function jsonStrMap(raw: unknown): Record<string, string> {
  const obj = typeof raw === 'string' ? parseJson(raw) : raw
  const out: Record<string, string> = {}
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) out[k] = String(v ?? '')
  }
  return out
}

function envHasValue(env: unknown): boolean {
  for (const v of Object.values(jsonStrMap(env))) {
    if (String(v).trim()) return true
  }
  return false
}

async function findMCPByName(name: string): Promise<any | null> {
  const all = await meta.table<any[]>('mcp')
  return all.find((m) => m.name === name) ?? null
}

// 最小 Streamable HTTP MCP 客户端（JSON-RPC over HTTP POST）。
class ScopeSentryClient {
  private nextID = 0
  private sessionID = ''
  constructor(
    private readonly url: string,
    private readonly headers: Record<string, string>,
    private readonly insecure: boolean
  ) {}

  private async roundTrip(method: string, params: unknown, expectResp: boolean): Promise<any> {
    const id = ++this.nextID
    const body: Record<string, unknown> = { jsonrpc: '2.0', method }
    if (expectResp) body.id = id
    if (params !== undefined) body.params = params
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
        ...this.headers,
        ...(this.sessionID ? { 'mcp-session-id': this.sessionID } : {})
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000)
    })
    const sid = res.headers.get('mcp-session-id')
    if (sid && !this.sessionID) this.sessionID = sid
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`mcp http ${res.status}: ${(await res.text()).slice(0, 200)}`)
    }
    if (!expectResp) return undefined
    const ct = res.headers.get('content-type') ?? ''
    if (ct.startsWith('text/event-stream')) {
      return parseSSEJson(await res.text(), id)
    }
    const data: any = await res.json()
    if (data?.error) throw new Error(`mcp rpc error ${data.error.code}: ${data.error.message}`)
    return data?.result
  }

  async initialize() {
    await this.roundTrip(
      'initialize',
      { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'vexnar', version: '0.2' } },
      true
    )
    await this.roundTrip('notifications/initialized', {}, false)
  }

  async call(tool: string, args: unknown): Promise<string> {
    const result = await this.roundTrip('tools/call', { name: tool, arguments: args }, true)
    const content = Array.isArray(result?.content) ? result.content : []
    let text = ''
    for (const blk of content) {
      if (blk && blk.type === 'text' && blk.text != null) text += String(blk.text)
    }
    if (result?.isError) throw new Error(`mcp tool "${tool}" error: ${text}`)
    return text
  }

  async tools(): Promise<string[]> {
    const result = await this.roundTrip('tools/list', {}, true)
    return (result?.tools ?? []).map((t: any) => String(t.name))
  }
}

function parseSSEJson(text: string, id: number): any {
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload) continue
    try {
      const obj = JSON.parse(payload)
      if (obj?.id === id) return obj?.result
    } catch {
      // 非 JSON 的 data 帧（如注释）跳过
    }
  }
  return undefined
}

async function scopeSentryClient(): Promise<ScopeSentryClient> {
  const m = await findMCPByName(scopeSentryMCPName)
  if (!m) throw new Error(`数据源 ${scopeSentryMCPName} 不存在，请先创建`)
  if (!m.url) throw new Error(`数据源 ${scopeSentryMCPName} 未配置 URL，请先配置`)
  const client = new ScopeSentryClient(m.url, jsonStrMap(m.env), Boolean(m.insecure))
  await client.initialize()
  return client
}

// ─────────────────────────────────────────────────────────────────────────────
// 入库辅助（简化但等价的资产/公司 upsert，走 operations.writer 的 kv 表）
// ─────────────────────────────────────────────────────────────────────────────

async function upsertAsset(
  type: string,
  identify: (row: any) => boolean,
  build: (existing: any | null, id: number) => Record<string, unknown>
): Promise<void> {
  const rows = await operations.writer.list('assets')
  const existing = rows.find((r) => r.type === type && identify(r)) ?? null
  if (existing) {
    const next = { ...existing, ...build(existing, Number(existing.id)), last_seen: rfc3339(new Date()) }
    await operations.writer.put({ table: 'assets', key: String(existing.id), record: next, expectedRev: Number(existing.rev ?? 0) })
    return
  }
  const id = Math.max(0, ...rows.map((r) => Number(r.id))) + 1
  const record = { id, type, task_ids: [], ...build(null, id), last_seen: rfc3339(new Date()) }
  await operations.writer.put({ table: 'assets', key: String(id), record })
}

async function upsertIP(ip: string, boundDomain: string): Promise<void> {
  await upsertAsset('ip', (r) => r.ip === ip, (existing) => {
    const bound = Array.isArray(existing?.bound_domains) ? [...existing.bound_domains] : []
    if (!bound.includes(boundDomain)) bound.push(boundDomain)
    return { ip, bound_domains: bound }
  })
}

function companyNKey(name: string): string {
  return String(name).trim().toLowerCase().replace(/\s+/g, ' ')
}

async function upsertCompanyByName(name: string): Promise<number | null> {
  const rows = await operations.writer.list('companies')
  const nkey = companyNKey(name)
  const existing = rows.find((r) => r.nkey === nkey)
  const now = rfc3339(new Date())
  if (existing) {
    await operations.writer.put({
      table: 'companies',
      key: String(existing.id),
      record: { ...existing, name, updated_at: now },
      expectedRev: Number(existing.rev ?? 0)
    })
    return Number(existing.id)
  }
  const id = Math.max(0, ...rows.map((r) => Number(r.id))) + 1
  await operations.writer.put({
    table: 'companies',
    key: String(id),
    record: { id, name, nkey, created_at: now, updated_at: now, scope: [], asset_count: 0 }
  })
  return id
}

function classifyScopeKind(value: string): string {
  if (value.includes('/')) return 'cidr'
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return 'ip'
  if (/^\d{6,}$/.test(value)) return 'icp'
  if (value.includes('.')) return 'domain'
  return 'keyword'
}

async function addCompanyScope(companyId: number, roots: string[], reason: string): Promise<void> {
  const row = await operations.writer.readRecord('companies', String(companyId))
  if (!row) return
  const scope = Array.isArray(row.scope) ? [...row.scope] : []
  let nextId = scope.reduce((m, s) => Math.max(m, Number(s.id ?? 0)), 0)
  for (const root of roots) {
    const kind = classifyScopeKind(root)
    scope.push({
      id: ++nextId,
      company_id: companyId,
      kind,
      ...(kind === 'domain' || kind === 'root_domain' ? { domain: root } : {}),
      ...(kind === 'ip' || kind === 'cidr' ? { net: root } : {}),
      ...(kind === 'icp' || kind === 'keyword' ? { value: root } : {}),
      raw: root,
      reason
    })
  }
  await operations.writer.put({
    table: 'companies',
    key: String(companyId),
    record: { ...row, scope },
    expectedRev: Number(row.rev ?? 0)
  })
}

async function ssProjectMeta(cl: ScopeSentryClient, projectID: string): Promise<{ name: string; roots: string[] }> {
  const text = await cl.call('get_project', { id: projectID })
  const p: any = JSON.parse(text)
  const roots = String(p?.target ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
  return { name: String(p?.name ?? ''), roots }
}

async function ssPageAll(cl: ScopeSentryClient, ssType: string, filter: Record<string, unknown>, pageSize: number): Promise<{ items: any[]; truncated: boolean }> {
  const items: any[] = []
  let truncated = false
  for (let page = 1; ; page++) {
    const args: Record<string, unknown> = { asset_type: ssType, pageIndex: page, pageSize }
    if (Object.keys(filter).length) args.filter = filter
    const text = await cl.call('list_assets', args)
    const env: any = JSON.parse(text)
    const list = env?.list ?? []
    if (!list.length) break
    items.push(...list)
    if (items.length >= syncMaxPerType) {
      items.length = syncMaxPerType
      truncated = true
      break
    }
    if (list.length < pageSize) break
  }
  return { items, truncated }
}

async function ssIngest(assetType: string, raw: any, synced: Record<string, number>): Promise<string> {
  try {
    switch (assetType) {
      case 'subdomain': {
        if (!raw?.host) return ''
        await upsertAsset('subdomain', (r) => r.domain === raw.host, () => ({
          domain: raw.host,
          record_type: String(raw.type ?? ''),
          record_value: Array.isArray(raw.value) ? raw.value : []
        }))
        synced.subdomain++
        for (const ip of raw.ip ?? []) {
          if (ip) {
            try {
              await upsertIP(ip, raw.host)
              synced.ip++
            } catch {
              // 单条 IP 失败不阻塞整体
            }
          }
        }
        return ''
      }
      case 'app': {
        if (!raw?.name) return ''
        await upsertAsset('app', (r) => r.app_name === raw.name, () => ({
          app_name: raw.name,
          ...(raw.category ? { category: String(raw.category) } : {}),
          ...(raw.description ? { app_description: String(raw.description) } : {}),
          ...(raw.icp ? { app_icp: String(raw.icp) } : {})
        }))
        synced.app++
        return ''
      }
      case 'service': {
        if (raw?.service === 'http' || raw?.url) {
          if (!raw.url) return ''
          await upsertAsset('service', (r) => r.service_type === 'http' && r.url === raw.url, () => ({
            service_type: 'http',
            url: raw.url,
            ...(raw.ip ? { ip: String(raw.ip) } : {}),
            ...(Array.isArray(raw.products) ? { technologies: raw.products } : {}),
            ...(raw.status != null ? { status_code: Number(raw.status) } : {}),
            ...(raw.title ? { page_title: String(raw.title) } : {}),
            ...(raw.icon ? { favicon_mmh3: String(raw.icon) } : {})
          }))
        } else {
          await upsertAsset('service', (r) => r.service_type === 'other' && r.domain === raw.domain && Number(r.port) === Number(raw.port), () => ({
            service_type: 'other',
            ...(raw.domain ? { domain: String(raw.domain) } : {}),
            ...(raw.ip ? { ip: String(raw.ip) } : {}),
            port: Number(raw.port ?? 0),
            service_name: String(raw.service ?? '')
          }))
        }
        synced.service++
        return ''
      }
      default:
        return '未知资产类型: ' + assetType
    }
  } catch (e: any) {
    return `${assetType} 解析失败: ${e?.message ?? e}`
  }
}

export function register(api: Hono) {
  // GET /api/sync/scopesentry/status
  api.get('/api/sync/scopesentry/status', async (c) => {
    try {
      const m = await findMCPByName(scopeSentryMCPName)
      const resp: any = { exists: !!m, configured: false, enabled: false, reachable: false, tools: [] }
      if (!m) return c.json(resp)
      const configured = !!m.url && envHasValue(m.env)
      resp.configured = configured
      resp.enabled = !!m.enabled
      if (m.url) resp.url = m.url
      if (Array.isArray(m.tools)) resp.tools = m.tools
      if (configured && m.enabled) {
        try {
          const cl = new ScopeSentryClient(m.url, jsonStrMap(m.env), Boolean(m.insecure))
          await cl.initialize()
          const tools = await cl.tools()
          resp.reachable = true
          if (tools.length) resp.tools = tools
        } catch {
          // 轻量可达性探测失败不算错误，保持 reachable=false
        }
      }
      return c.json(resp)
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, 500)
    }
  })

  // POST /api/sync/scopesentry/datasource — 创建占位行并/或设置 URL + API Key 并启用。
  api.post('/api/sync/scopesentry/datasource', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const url = String(body.url ?? '').trim()
    const apiKey = String(body.api_key ?? '').trim()
    try {
      const m = await findMCPByName(scopeSentryMCPName)
      const mergedEnv = jsonStrMap(m?.env ?? {})
      if (apiKey) mergedEnv['X-API-Key'] = apiKey
      else if (!('X-API-Key' in mergedEnv)) mergedEnv['X-API-Key'] = ''
      const nextUrl = url || String(m?.url ?? '').trim()
      const enabled = !!nextUrl && envHasValue(mergedEnv)
      const result = await operations.saveMcpServer({
        ...(m ? { id: Number(m.id) } : {}),
        name: scopeSentryMCPName,
        transport: 'http',
        url: nextUrl,
        env: mergedEnv,
        enabled
      })
      meta.reload()
      // 尽力做一次工具发现，让状态卡尽快显示 tools（失败不阻塞）。
      if (enabled) {
        try {
          const cl = new ScopeSentryClient(nextUrl, mergedEnv, Boolean(m?.insecure))
          await cl.initialize()
          await cl.tools()
        } catch {
          // best-effort
        }
      }
      return c.json({ id: result.id, enabled })
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, e?.status ?? 500)
    }
  })

  // GET /api/sync/scopesentry/projects
  api.get('/api/sync/scopesentry/projects', async (c) => {
    let cl: ScopeSentryClient
    try {
      cl = await scopeSentryClient()
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, 502)
    }
    const args: Record<string, unknown> = { pageIndex: queryInt(c, 'page', 1), pageSize: queryInt(c, 'size', 50) }
    const search = c.req.query('search')
    if (search) args.search = search
    let text: string
    try {
      text = await cl.call('list_projects_data', args)
    } catch (e: any) {
      return c.json({ error: `list_projects_data 失败: ${e?.message ?? e}` }, 502)
    }
    let env: any = {}
    try {
      env = JSON.parse(text)
    } catch (e: any) {
      return c.json({ error: '解析项目列表失败: ' + String(e?.message ?? e) }, 502)
    }
    const result = env?.result ?? {}
    const projects = result.All ?? []
    return c.json({ projects, tag: env?.tag ?? {} })
  })

  // GET /api/sync/scopesentry/tasks
  api.get('/api/sync/scopesentry/tasks', async (c) => {
    let cl: ScopeSentryClient
    try {
      cl = await scopeSentryClient()
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, 502)
    }
    const args: Record<string, unknown> = { pageIndex: queryInt(c, 'page', 1), pageSize: queryInt(c, 'size', 50) }
    const search = c.req.query('search')
    if (search) args.search = search
    let text: string
    try {
      text = await cl.call('list_tasks', args)
    } catch (e: any) {
      return c.json({ error: `list_tasks 失败: ${e?.message ?? e}` }, 502)
    }
    let env: any = {}
    try {
      env = JSON.parse(text)
    } catch (e: any) {
      return c.json({ error: '解析任务列表失败: ' + String(e?.message ?? e) }, 502)
    }
    return c.json({ tasks: env?.list ?? [] })
  })

  // POST /api/sync/scopesentry/sync
  api.post('/api/sync/scopesentry/sync', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const dimension = String(body.dimension ?? '')
    const targets = Array.isArray(body.targets) ? body.targets.map(String) : []
    let assetTypes = Array.isArray(body.asset_types) ? body.asset_types.map(String) : []
    const createCompany = Boolean(body.create_company)
    let pageSize = Number(body.page_size ?? 0)
    if (!pageSize || pageSize <= 0 || pageSize > 500) pageSize = syncDefaultPage

    if (dimension !== 'project' && dimension !== 'task') return c.json({ error: 'dimension 必须是 project 或 task' }, 400)
    if (!targets.length) return c.json({ error: 'targets 不能为空' }, 400)
    if (!assetTypes.length) assetTypes = ['subdomain', 'service', 'app']

    let cl: ScopeSentryClient
    try {
      cl = await scopeSentryClient()
    } catch (e: any) {
      return c.json({ error: String(e?.message ?? e) }, 502)
    }

    const synced = { subdomain: 0, app: 0, service: 0, ip: 0 }
    const companies: string[] = []
    const warnings: string[] = []
    const errs: string[] = []
    let madeCompany = false

    for (const target of targets) {
      const filter: Record<string, unknown> = {}
      if (dimension === 'project') {
        filter.project = [target]
        if (createCompany) {
          try {
            const pm = await ssProjectMeta(cl, target)
            if (pm.name) {
              const cid = await upsertCompanyByName(pm.name)
              if (cid != null) {
                companies.push(pm.name)
                madeCompany = true
                if (pm.roots.length) await addCompanyScope(cid, pm.roots, 'scopesentry:' + pm.name)
              }
            }
          } catch (e: any) {
            warnings.push(`项目 ${target} 详情获取失败: ${e?.message ?? e}`)
          }
        }
      } else {
        filter.task = [target]
      }

      for (const at of assetTypes) {
        const ssTypeMap: Record<string, string> = { subdomain: 'subdomain', service: 'asset', app: 'app' }
        const ssType = ssTypeMap[at]
        if (!ssType) {
          warnings.push('未知资产类型，已跳过: ' + at)
          continue
        }
        try {
          const { items, truncated } = await ssPageAll(cl, ssType, filter, pageSize)
          if (truncated) warnings.push(`${at}(${target}) 达到 ${syncMaxPerType} 条上限，已截断`)
          for (const raw of items) {
            const e = await ssIngest(at, raw, synced)
            if (e) errs.push(e)
          }
        } catch (e: any) {
          errs.push(`${at}(${target}) 拉取失败: ${e?.message ?? e}`)
        }
      }
    }

    store.invalidate?.(['assets', 'companies'])
    return c.json({ synced, companies, warnings, errors: errs })
  })
}
