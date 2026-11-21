// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { callApi, useApi } from './api.js'

/**
 * 工具目录与 MCP 舰队：设置 →「内置插件」分区的两个标签页。
 *
 * 这两个面在 Web 控制台（`/system/tools`、`/system/mcp`）里是独立页面，各自带
 * 「列表 + 抽屉编辑」。搬进 dsh 后沿用 dsh 插件页的交互：卡片列表 → 点卡片进
 * 详情页（不再是覆盖式抽屉），保存/恢复默认/删除都在详情页底部。窄面板里抽屉
 * 会把列表压成一条缝，整页替换反而更接近 dsh 自己的插件详情。
 *
 * 数据仍然只来自 Go 服务（`/vexnar-api/api/...`），这里不缓存第二份；「Agent
 * 能否调用」由 dsh 的插件挂载与权限预设决定，本页只管注册面本身。
 */

interface ToolRow {
  key: string
  system: boolean
  description?: string
  schema?: unknown
  agents?: string[] | null
  enabled?: boolean
  kind?: string
  exec?: unknown
  deferred?: boolean
  calls?: number
}

interface ServerRow {
  id: number
  name: string
  transport: string
  command?: string
  args?: unknown
  env?: unknown
  url?: string
  enabled?: boolean
  insecure?: boolean
  tools?: string[]
}

interface AgentRow { key: string; name?: string; role?: string; enabled?: boolean }

function errorText(error: unknown): string {
  return String((error as { message?: unknown })?.message ?? error)
}

function pretty(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) } catch { return '' }
}

function parseJson(text: string, fallback: unknown): unknown {
  const trimmed = text.trim()
  if (!trimmed) return fallback
  return JSON.parse(trimmed)
}

/** 状态胶囊：和 dsh 插件页一致，绿=在用，灰=停用。 */
function Pill({ on, onLabel = '已启用', offLabel = '已停用' }: { on: boolean; onLabel?: string; offLabel?: string }): ReactNode {
  return <span className={on ? 'vx-cat-pill vx-cat-pill--on' : 'vx-cat-pill'}>{on ? onLabel : offLabel}</span>
}

/** 开关：原生 checkbox 承载语义，样式只画外壳。 */
function Switch({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label: string }): ReactNode {
  return (
    <label className="vx-cat-switch">
      <input type="checkbox" checked={on} onChange={(event) => { onChange(event.target.checked) }} />
      <span className="vx-cat-switch-track" aria-hidden="true"><span className="vx-cat-switch-thumb" /></span>
      <span className="vx-cat-switch-label">{label}</span>
    </label>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): ReactNode {
  return (
    <div className="vx-cat-field">
      <div className="vx-cat-field-label">{label}</div>
      {hint ? <div className="vx-cat-field-hint">{hint}</div> : null}
      {children}
    </div>
  )
}

function AgentPicker({ agents, value, onChange }: { agents: AgentRow[]; value: string[]; onChange: (next: string[]) => void }): ReactNode {
  const toggle = (key: string): void => {
    onChange(value.includes(key) ? value.filter((item) => item !== key) : [...value, key])
  }
  if (agents.length === 0) return <div className="vx-cat-hint">还没有 agent，先到「Agent 管理」建一个。</div>
  return (
    <div className="vx-cat-chips">
      {agents.map((agent) => (
        <button
          key={agent.key}
          type="button"
          className={value.includes(agent.key) ? 'vx-cat-chip vx-cat-chip--on' : 'vx-cat-chip'}
          aria-pressed={value.includes(agent.key)}
          onClick={() => { toggle(agent.key) }}
        >
          {agent.key}
        </button>
      ))}
    </div>
  )
}

// ── JSON Schema 参数编辑 ──────────────────────────────────────────────────
// 控制台只允许改每个参数的 description/default（结构由代码定义），这里照做：
// 结构不动，避免用户在 UI 里把内置工具的参数名改坏。

interface ParamRow { name: string; type: string; required: boolean; description: string; defaultValue: string }

function paramsOf(schema: unknown): ParamRow[] {
  const root = schema as { properties?: Record<string, unknown>; required?: unknown } | null
  const props = root?.properties
  if (!props || typeof props !== 'object') return []
  const required = Array.isArray(root?.required) ? root.required.filter((item): item is string => typeof item === 'string') : []
  return Object.entries(props).map(([name, raw]) => {
    const prop = (raw ?? {}) as { type?: unknown; description?: unknown; default?: unknown }
    const hasDefault = Object.prototype.hasOwnProperty.call(prop, 'default')
    return {
      name,
      type: typeof prop.type === 'string' ? prop.type : 'any',
      required: required.includes(name),
      description: typeof prop.description === 'string' ? prop.description : '',
      defaultValue: hasDefault ? pretty(prop.default) : ''
    }
  })
}

function withParam(schema: unknown, name: string, patch: { description?: string; defaultValue?: string }): unknown {
  const root = (schema && typeof schema === 'object')
    ? JSON.parse(JSON.stringify(schema)) as { properties?: Record<string, Record<string, unknown>> }
    : { type: 'object', properties: {} as Record<string, Record<string, unknown>> }
  root.properties = root.properties ?? {}
  const prop = root.properties[name] ?? (root.properties[name] = {})
  if (patch.description !== undefined) {
    if (patch.description) prop.description = patch.description
    else delete prop.description
  }
  if (patch.defaultValue !== undefined) {
    const text = patch.defaultValue.trim()
    if (!text) delete prop.default
    else {
      try { prop.default = JSON.parse(text) } catch { prop.default = patch.defaultValue }
    }
  }
  return root
}

function ParamEditor({ schema, onChange }: { schema: unknown; onChange: (next: unknown) => void }): ReactNode {
  const rows = useMemo(() => paramsOf(schema), [schema])
  if (rows.length === 0) {
    return <div className="vx-cat-hint">该工具没有声明参数。</div>
  }
  return (
    <div className="vx-cat-params">
      {rows.map((row) => (
        <div className="vx-cat-param" key={row.name}>
          <div className="vx-cat-param-head">
            <code>{row.name}</code>
            <span className="vx-cat-param-type">{row.type}</span>
            {row.required ? <span className="vx-cat-param-req">必填</span> : null}
          </div>
          <input
            className="vx-cat-input"
            placeholder="参数描述（发送给模型）"
            value={row.description}
            onChange={(event) => { onChange(withParam(schema, row.name, { description: event.target.value })) }}
          />
          <input
            className="vx-cat-input"
            placeholder="默认值（JSON，留空=无默认）"
            value={row.defaultValue}
            onChange={(event) => { onChange(withParam(schema, row.name, { defaultValue: event.target.value })) }}
          />
        </div>
      ))}
    </div>
  )
}

// ── 工具标签页 ────────────────────────────────────────────────────────────

type ToolsView = { kind: 'list' } | { kind: 'edit'; tool: ToolRow } | { kind: 'new' }

export function ToolsTab(): ReactNode {
  const [nonce, setNonce] = useState(0)
  const [view, setView] = useState<ToolsView>({ kind: 'list' })
  const [query, setQuery] = useState('')
  const tools = useApi('/api/tools', [nonce])
  const agents = useApi('/api/agents', [])
  const rows: ToolRow[] = tools.data?.tools ?? []
  const agentRows: AgentRow[] = agents.data?.agents ?? []

  const refresh = (): void => { setNonce(nonce + 1) }

  if (view.kind === 'edit') {
    return <ToolDetail tool={view.tool} agents={agentRows} onBack={() => { setView({ kind: 'list' }) }} onSaved={() => { refresh(); setView({ kind: 'list' }) }} />
  }
  if (view.kind === 'new') {
    return <NewTool agents={agentRows} onBack={() => { setView({ kind: 'list' }) }} onSaved={() => { refresh(); setView({ kind: 'list' }) }} />
  }
  if (tools.loading) return <div className="vx-cat-hint">加载中…</div>
  if (tools.error) return <div className="vx-cat-error">{tools.error}</div>

  const needle = query.trim().toLowerCase()
  const matched = needle
    ? rows.filter((row) => `${row.key} ${row.description ?? ''}`.toLowerCase().includes(needle))
    : rows
  const system = matched.filter((row) => row.system)
  const custom = matched.filter((row) => !row.system)

  const card = (row: ToolRow): ReactNode => (
    <button key={row.key} type="button" className="vx-cat-card" onClick={() => { setView({ kind: 'edit', tool: row }) }}>
      <span className="vx-cat-card-top">
        <code className="vx-cat-key">{row.key}</code>
        <Pill on={Boolean(row.enabled)} />
      </span>
      <span className="vx-cat-desc">{row.description || '（无描述）'}</span>
      <span className="vx-cat-meta">
        {row.kind ?? 'builtin'}
        {' · '}
        {(row.agents ?? []).length} 个 agent
        {' · '}
        调用 {row.calls ?? 0}
      </span>
    </button>
  )

  return (
    <div className="vx-cat">
      <p className="vx-cat-lead">
        平台注册的工具：系统工具由 Go 代码定义（结构固定，可改描述、参数说明与默认值、绑定 Agent、启停），
        自定义工具可整条增删改。agent 能不能真正调用，仍由 dsh 的插件挂载与权限预设决定。
      </p>
      <div className="vx-cat-toolbar">
        <input className="vx-cat-input vx-cat-search" placeholder="搜索 key / 描述" value={query} onChange={(event) => { setQuery(event.target.value) }} />
        <button type="button" className="vx-cat-btn vx-cat-btn--primary" onClick={() => { setView({ kind: 'new' }) }}>+ 新建工具</button>
      </div>
      <div className="vx-cat-section">
        <div className="vx-cat-section-head"><span>系统工具</span><span className="vx-cat-count">{system.length}</span></div>
        {system.length === 0
          ? <div className="vx-cat-hint">没有匹配的系统工具。</div>
          : <div className="vx-cat-grid">{system.map(card)}</div>}
      </div>
      <div className="vx-cat-section">
        <div className="vx-cat-section-head"><span>自定义工具</span><span className="vx-cat-count">{custom.length}</span></div>
        {custom.length === 0
          ? <div className="vx-cat-hint">还没有自定义工具。自定义工具用 command / script / http / shell 四种执行器，保存后立即出现在这里。</div>
          : <div className="vx-cat-grid">{custom.map(card)}</div>}
      </div>
    </div>
  )
}

function ToolDetail({ tool, agents, onBack, onSaved }: { tool: ToolRow; agents: AgentRow[]; onBack: () => void; onSaved: () => void }): ReactNode {
  const [description, setDescription] = useState(tool.description ?? '')
  const [schema, setSchema] = useState<unknown>(tool.schema ?? {})
  const [bound, setBound] = useState<string[]>(tool.agents ?? [])
  const [enabled, setEnabled] = useState(Boolean(tool.enabled))
  const [kind, setKind] = useState(tool.kind ?? 'command')
  const [exec, setExec] = useState(() => pretty(tool.exec ?? {}))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const save = async (): Promise<void> => {
    setBusy(true); setError(''); setNotice('')
    try {
      if (tool.system) {
        await callApi(`/api/tools/${encodeURIComponent(tool.key)}`, 'PUT', { description, schema, agents: bound, enabled })
      } else {
        await callApi(`/api/tools/custom/${encodeURIComponent(tool.key)}`, 'PUT', {
          description, schema, agents: bound, enabled, kind, exec: parseJson(exec, {}), deferred: Boolean(tool.deferred)
        })
      }
      setNotice('已保存')
      onSaved()
    } catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }

  const reset = async (): Promise<void> => {
    setBusy(true); setError(''); setNotice('')
    try { await callApi(`/api/tools/${encodeURIComponent(tool.key)}/reset`, 'POST', {}); setNotice('已恢复默认'); onSaved() }
    catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }

  const remove = async (): Promise<void> => {
    if (!window.confirm(`删除自定义工具 ${tool.key}？`)) return
    setBusy(true); setError('')
    try { await callApi(`/api/tools/custom/${encodeURIComponent(tool.key)}`, 'DELETE'); onSaved() }
    catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }

  return (
    <div className="vx-cat">
      <div className="vx-cat-head">
        <button type="button" className="vx-cat-back" onClick={onBack}>← 返回</button>
        <code className="vx-cat-key">{tool.key}</code>
        <Pill on={Boolean(tool.system)} onLabel="系统工具" offLabel="自定义工具" />
        <span className="vx-cat-spacer" />
        <Switch on={enabled} onChange={setEnabled} label="启用" />
      </div>
      <Field label="绑定 Agent" hint="勾选后该 agent 的会话里才会出现这个工具；空选等于只注册不投放。">
        <AgentPicker agents={agents} value={bound} onChange={setBound} />
      </Field>
      <Field label="工具描述" hint="发送给模型的说明，模型据此判断何时调用。">
        <textarea className="vx-cat-textarea" rows={5} value={description} onChange={(event) => { setDescription(event.target.value) }} />
      </Field>
      <Field label="参数" hint="结构由代码定义，这里改每个参数给模型的描述与默认值。">
        <ParamEditor schema={schema} onChange={setSchema} />
      </Field>
      {tool.system ? null : (
        <>
          <Field label="执行器">
            <select className="vx-cat-input" value={kind} onChange={(event) => { setKind(event.target.value) }}>
              {['command', 'script', 'http', 'shell'].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="执行规格（JSON）" hint="按执行器不同填写：command/script/http/shell 各自的字段见《自定义工具设计》。">
            <textarea className="vx-cat-textarea vx-cat-mono" rows={8} value={exec} onChange={(event) => { setExec(event.target.value) }} />
          </Field>
        </>
      )}
      {error ? <div className="vx-cat-error">{error}</div> : null}
      {notice ? <div className="vx-cat-notice">{notice}</div> : null}
      <div className="vx-cat-footer">
        <button type="button" className="vx-cat-btn vx-cat-btn--primary" disabled={busy} onClick={() => { void save() }}>保存</button>
        {tool.system
          ? <button type="button" className="vx-cat-btn" disabled={busy} onClick={() => { void reset() }}>恢复默认</button>
          : <button type="button" className="vx-cat-btn vx-cat-btn--danger" disabled={busy} onClick={() => { void remove() }}>删除</button>}
      </div>
    </div>
  )
}

function NewTool({ agents, onBack, onSaved }: { agents: AgentRow[]; onBack: () => void; onSaved: () => void }): ReactNode {
  const [key, setKey] = useState('')
  const [kind, setKind] = useState('command')
  const [description, setDescription] = useState('')
  const [bound, setBound] = useState<string[]>([])
  const [enabled, setEnabled] = useState(true)
  const [exec, setExec] = useState('{\n  "command": "echo hello"\n}')
  const [schema, setSchema] = useState('{\n  "type": "object",\n  "properties": {}\n}')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const create = async (): Promise<void> => {
    setBusy(true); setError('')
    try {
      await callApi('/api/tools/custom', 'POST', {
        key: key.trim(), description, agents: bound, enabled, kind,
        exec: parseJson(exec, {}), schema: parseJson(schema, {}), deferred: false
      })
      onSaved()
    } catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }

  return (
    <div className="vx-cat">
      <div className="vx-cat-head">
        <button type="button" className="vx-cat-back" onClick={onBack}>← 返回</button>
        <span className="vx-cat-title">新建自定义工具</span>
        <span className="vx-cat-spacer" />
        <Switch on={enabled} onChange={setEnabled} label="启用" />
      </div>
      <Field label="Key" hint="小写字母开头，只含小写字母/数字/下划线；保存后不可改（与 Go 执行器绑定）。">
        <input className="vx-cat-input vx-cat-mono" placeholder="my_tool" value={key} onChange={(event) => { setKey(event.target.value) }} />
      </Field>
      <Field label="执行器">
        <select className="vx-cat-input" value={kind} onChange={(event) => { setKind(event.target.value) }}>
          {['command', 'script', 'http', 'shell'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </Field>
      <Field label="绑定 Agent">
        <AgentPicker agents={agents} value={bound} onChange={setBound} />
      </Field>
      <Field label="工具描述" hint="发送给模型，写清楚它做什么、什么时候用。">
        <textarea className="vx-cat-textarea" rows={4} value={description} onChange={(event) => { setDescription(event.target.value) }} />
      </Field>
      <Field label="参数 JSON Schema" hint="http 执行器必须声明参数；其余执行器可留空对象。">
        <textarea className="vx-cat-textarea vx-cat-mono" rows={6} value={schema} onChange={(event) => { setSchema(event.target.value) }} />
      </Field>
      <Field label="执行规格（JSON）">
        <textarea className="vx-cat-textarea vx-cat-mono" rows={8} value={exec} onChange={(event) => { setExec(event.target.value) }} />
      </Field>
      {error ? <div className="vx-cat-error">{error}</div> : null}
      <div className="vx-cat-footer">
        <button type="button" className="vx-cat-btn vx-cat-btn--primary" disabled={busy || key.trim() === ''} onClick={() => { void create() }}>创建</button>
      </div>
    </div>
  )
}

// ── MCP 标签页 ────────────────────────────────────────────────────────────

type McpView = { kind: 'list' } | { kind: 'edit'; server: ServerRow } | { kind: 'new' }

const TRANSPORTS = ['stdio', 'streamable-http', 'http', 'sse']

export function McpTab(): ReactNode {
  const [nonce, setNonce] = useState(0)
  const [view, setView] = useState<McpView>({ kind: 'list' })
  const servers = useApi('/api/mcp', [nonce])
  const rows: ServerRow[] = servers.data?.servers ?? []
  const refresh = (): void => { setNonce(nonce + 1) }

  if (view.kind === 'edit') {
    return <ServerDetail server={view.server} onBack={() => { setView({ kind: 'list' }) }} onSaved={() => { refresh(); setView({ kind: 'list' }) }} />
  }
  if (view.kind === 'new') {
    return <ServerDetail server={{ id: 0, name: '', transport: 'stdio', args: [], env: {}, enabled: true, insecure: false }} onBack={() => { setView({ kind: 'list' }) }} onSaved={() => { refresh(); setView({ kind: 'list' }) }} />
  }
  if (servers.loading) return <div className="vx-cat-hint">加载中…</div>
  if (servers.error) return <div className="vx-cat-error">{servers.error}</div>

  const toggle = async (row: ServerRow): Promise<void> => {
    try { await callApi(`/api/mcp/${row.id}/enabled`, 'PUT', { enabled: !row.enabled }); refresh() } catch (cause) { window.alert(errorText(cause)) }
  }

  return (
    <div className="vx-cat">
      <p className="vx-cat-lead">
        平台注册的 MCP server。这里的增删改只动 Go 侧注册表；dsh 自己那座 MCP 舰队在插件页管理，
        两边是不同层，别把同名 server 当成同一份配置。
      </p>
      <div className="vx-cat-toolbar">
        <span className="vx-cat-count">{rows.length} 个 server</span>
        <span className="vx-cat-spacer" />
        <button type="button" className="vx-cat-btn vx-cat-btn--primary" onClick={() => { setView({ kind: 'new' }) }}>+ 新建 server</button>
      </div>
      {rows.length === 0
        ? <div className="vx-cat-hint">还没有 MCP server。</div>
        : (
          <div className="vx-cat-grid">
            {rows.map((row) => (
              <div key={row.id} className="vx-cat-card vx-cat-card--row">
                <button type="button" className="vx-cat-card-main" onClick={() => { setView({ kind: 'edit', server: row }) }}>
                  <span className="vx-cat-card-top">
                    <code className="vx-cat-key">{row.name}</code>
                    <Pill on={Boolean(row.enabled)} />
                  </span>
                  <span className="vx-cat-desc">{row.url || row.command || '（未配置地址）'}</span>
                  <span className="vx-cat-meta">{row.transport} · {(row.tools ?? []).length} 个工具</span>
                </button>
                <button type="button" className="vx-cat-mini" onClick={() => { void toggle(row) }}>{row.enabled ? '停用' : '启用'}</button>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

function ServerDetail({ server, onBack, onSaved }: { server: ServerRow; onBack: () => void; onSaved: () => void }): ReactNode {
  const isNew = server.id === 0
  const [name, setName] = useState(server.name)
  const [transport, setTransport] = useState(server.transport || 'stdio')
  const [command, setCommand] = useState(server.command ?? '')
  const [args, setArgs] = useState(() => pretty(server.args ?? []))
  const [env, setEnv] = useState(() => pretty(server.env ?? {}))
  const [url, setUrl] = useState(server.url ?? '')
  const [enabled, setEnabled] = useState(Boolean(server.enabled))
  const [insecure, setInsecure] = useState(Boolean(server.insecure))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // 缓存工具列表单独计一次 nonce：刷新后不必退回列表再进来。新建态没有 id，
  // 走 /api/mcp 占位，避免编辑页刚打开就打出一次 404。
  const [toolsNonce, setToolsNonce] = useState(0)
  const cached = useApi(isNew ? '/api/mcp' : `/api/mcp/${server.id}/tools`, [server.id, toolsNonce])
  const cachedTools: Array<{ name?: string; description?: string }> = isNew ? [] : (cached.data?.tools ?? [])

  const save = async (): Promise<void> => {
    setBusy(true); setError(''); setNotice('')
    try {
      await callApi('/api/mcp', 'POST', {
        id: server.id, name: name.trim(), transport, command, url,
        args: parseJson(args, []), env: parseJson(env, {}), enabled, insecure
      })
      onSaved()
    } catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }

  const remove = async (): Promise<void> => {
    if (!window.confirm(`删除 MCP server ${server.name}？`)) return
    setBusy(true); setError('')
    try { await callApi(`/api/mcp/${server.id}`, 'DELETE'); onSaved() }
    catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }

  const reloadTools = async (): Promise<void> => {
    if (isNew) return
    setBusy(true); setError(''); setNotice('')
    try {
      await callApi(`/api/mcp/${server.id}/refresh`, 'POST', {})
      setNotice('已刷新工具列表')
      setToolsNonce(toolsNonce + 1)
    } catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }

  return (
    <div className="vx-cat">
      <div className="vx-cat-head">
        <button type="button" className="vx-cat-back" onClick={onBack}>← 返回</button>
        <code className="vx-cat-key">{isNew ? '新建 server' : server.name}</code>
        <span className="vx-cat-spacer" />
        <Switch on={enabled} onChange={setEnabled} label="启用" />
      </div>
      <Field label="名称">
        <input className="vx-cat-input" value={name} onChange={(event) => { setName(event.target.value) }} />
      </Field>
      <Field label="传输">
        <select className="vx-cat-input" value={transport} onChange={(event) => { setTransport(event.target.value) }}>
          {TRANSPORTS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </Field>
      {transport === 'stdio'
        ? (
          <>
            <Field label="命令">
              <input className="vx-cat-input vx-cat-mono" placeholder="npx" value={command} onChange={(event) => { setCommand(event.target.value) }} />
            </Field>
            <Field label="参数（JSON 数组）">
              <textarea className="vx-cat-textarea vx-cat-mono" rows={4} value={args} onChange={(event) => { setArgs(event.target.value) }} />
            </Field>
            <Field label="环境变量（JSON 对象）">
              <textarea className="vx-cat-textarea vx-cat-mono" rows={4} value={env} onChange={(event) => { setEnv(event.target.value) }} />
            </Field>
          </>
        )
        : (
          <Field label="URL">
            <input className="vx-cat-input vx-cat-mono" placeholder="https://host/mcp" value={url} onChange={(event) => { setUrl(event.target.value) }} />
          </Field>
        )}
      <Field label="TLS">
        <Switch on={insecure} onChange={setInsecure} label="跳过证书校验（自签服务器）" />
      </Field>
      {isNew ? null : (
        <Field label={`已缓存工具（${cachedTools.length}）`} hint="发现结果来自上一次刷新；点下方「刷新工具列表」向后端重新拉取。">
          {cachedTools.length === 0
            ? <div className="vx-cat-hint">还没有缓存。启用后刷新一次即可看到该 server 的工具。</div>
            : <div className="vx-cat-chips">{cachedTools.slice(0, 40).map((tool) => <span key={tool.name} className="vx-cat-chip" title={tool.description ?? ''}>{tool.name}</span>)}</div>}
        </Field>
      )}
      {error ? <div className="vx-cat-error">{error}</div> : null}
      {notice ? <div className="vx-cat-notice">{notice}</div> : null}
      <div className="vx-cat-footer">
        <button type="button" className="vx-cat-btn vx-cat-btn--primary" disabled={busy || name.trim() === ''} onClick={() => { void save() }}>保存</button>
        {isNew ? null : <button type="button" className="vx-cat-btn" disabled={busy} onClick={() => { void reloadTools() }}>刷新工具列表</button>}
        {isNew ? null : <button type="button" className="vx-cat-btn vx-cat-btn--danger" disabled={busy} onClick={() => { void remove() }}>删除</button>}
      </div>
    </div>
  )
}
