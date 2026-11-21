// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as reactDom from 'react-dom'

import { Button, Card, Empty, ErrorLine } from '../tasks/ui.js'
import { DEFAULT_SCOPE_TOOLS, errText, interceptApi } from './api.js'
import type {
  InterceptRule,
  JudgeConfig,
  JudgeFailAction,
  JudgeUsage,
  MatchTarget,
  MatchType,
  RuleAction,
  RuleDraft,
  ToolEntry,
  ToolProfile
} from './api.js'

/**
 * 设置 → 拦截规则。
 *
 * 与 Web 控制台 `/system/intercept` 是同一组接口、同一份数据：规则 CRUD、启停、
 * 拦截范围（哪些工具进入匹配）、模型兜底审批的配置与用量。区别只在渲染层——这里
 * 用 dsh 的别名 token，跟着壳的主题、字号和深色模式走，不引入第二套组件库。
 */

/** dsh 的客户端模块表提供 react-dom；取不到时抽屉退化成行内浮层，功能不受影响。 */
const createPortal = (reactDom as { createPortal?: (node: ReactNode, host: Element) => ReactNode }).createPortal

const TABS = [
  ['rules', '拦截规则'],
  ['judge', '模型配置']
] as const

type TabID = (typeof TABS)[number][0]

const ACTION_LABEL: Record<RuleAction, string> = { allow: '允许', deny: '禁止', ask: '申请' }
const ACTION_TONE: Record<RuleAction, string> = { allow: 'success', deny: 'error', ask: 'warn' }

const TARGET_LABEL: Record<MatchTarget, string> = { tool_name: '工具名', tool_input: '输入内容' }
const TYPE_LABEL: Record<MatchType, string> = { string: '字符串', regex: '正则' }

type Loaded<T> = { data: T | undefined; error: string; loading: boolean; reload: () => void }

/** 取一次、可重取。key 式依赖由调用方用 enabled 表达，避免对象依赖每次渲染都重发。 */
function useLoader<T>(load: () => Promise<T>, enabled = true): Loaded<T> {
  const [tick, setTick] = useState(0)
  const [state, setState] = useState<{ data: T | undefined; error: string }>({ data: undefined, error: '' })
  const [loading, setLoading] = useState(enabled)
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    loadRef
      .current()
      .then((data) => {
        if (!alive) return
        setState({ data, error: '' })
        setLoading(false)
      })
      .catch((reason: unknown) => {
        if (!alive) return
        setState({ data: undefined, error: errText(reason) })
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [enabled, tick])
  return { ...state, loading, reload: () => setTick((value) => value + 1) }
}

/** Esc 关闭浮层：抽屉和对话框都必须能被键盘关掉。 */
function useEscape(active: boolean, close: () => void): void {
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // 抽屉开在设置弹窗里：Esc 先关最上面这一层。不拦下来，宿主会顺手把
      // 整个设置弹窗一起关掉（它也在 window 上监听 Esc）。
      event.preventDefault()
      event.stopPropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, close])
}

const fmtTokens = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

/* ── 原子件 ──────────────────────────────────────────────────────────────── */

function Switch({
  checked,
  onChange,
  disabled,
  label
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="vx-int-switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  )
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <label className="vx-int-field">
      <span className="vx-int-label">{label}</span>
      {children}
      {hint ? <small className="vx-int-hint">{hint}</small> : null}
    </label>
  )
}

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }): ReactNode {
  const layer = (
    <div
      className="vx-int-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {children}
    </div>
  )
  // 挂到 body：设置弹窗（以及 Claude Style 皮肤）会在中间层放 transform，
  // 那会把 position: fixed 的容器换成那一层，抽屉于是从弹窗左上角开始、
  // 超出窗口右边缘并被裁掉。宿主自己的设置弹窗也是 createPortal 到 body 的。
  const host = typeof document === 'undefined' ? undefined : document.body
  return host && typeof createPortal === 'function' ? createPortal(layer, host) : layer
}

const PlusIcon = (): ReactNode => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M6 2.25v7.5M2.25 6h7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)

const PencilIcon = (): ReactNode => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path
      d="M8.4 1.9a1.2 1.2 0 0 1 1.7 1.7L4.3 9.4l-2.2.5.5-2.2 5.8-5.8Z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
)

const TrashIcon = (): ReactNode => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path
      d="M2.5 3.3h7M4.6 3.3V2.2h2.8v1.1M3.4 3.3l.4 6.2h4.4l.4-6.2M5.1 5v3M6.9 5v3"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const FilterIcon = (): ReactNode => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M2 3h10L8.2 7.4v3.5L5.8 12V7.4L2 3Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
)

const BotIcon = (): ReactNode => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <rect x="2.2" y="4.4" width="9.6" height="7" rx="2" stroke="currentColor" strokeWidth="1.2" />
    <path d="M7 2.2v2.2M4.9 7.9h.1M9 7.9h.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)

/* ── 拦截范围信息条 ──────────────────────────────────────────────────────── */

function ScopeBar({
  tools,
  loading,
  error,
  onEdit
}: {
  tools: string[] | undefined
  loading: boolean
  error: string
  onEdit: () => void
}): ReactNode {
  const names = tools ?? [...DEFAULT_SCOPE_TOOLS]
  const empty = names.length === 0
  return (
    <div className="vx-int-bar" data-warn={empty ? '1' : undefined}>
      <span className="vx-int-bar-icon" aria-hidden="true">
        <FilterIcon />
      </span>
      <div className="vx-int-bar-text">
        <span className="vx-int-bar-title">
          拦截范围
          {loading ? <span className="vx-int-hint">读取中…</span> : null}
        </span>
        {error ? (
          <span className="vx-int-warn">范围读取失败：{error}（按默认 {DEFAULT_SCOPE_TOOLS.length} 个工具显示）</span>
        ) : empty ? (
          <span className="vx-int-warn">未启用任何工具 — 拦截规则与模型兜底均不会生效</span>
        ) : (
          <span className="vx-int-bar-names" title={names.join('、')}>
            {names.length} 个工具 · {names.join('、')}
          </span>
        )}
      </div>
      <div className="vx-int-bar-actions">
        <Button onClick={onEdit}>调整范围</Button>
      </div>
    </div>
  )
}

/* ── 规则表格 ───────────────────────────────────────────────────────────── */

function RulesTab(): ReactNode {
  const rules = useLoader(interceptApi.rules)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<InterceptRule | null>(null)
  const [removing, setRemoving] = useState<InterceptRule | null>(null)
  const [busy, setBusy] = useState(0)
  const [bulk, setBulk] = useState(false)
  const [error, setError] = useState('')

  const rows = rules.data ?? []
  const enabledCount = rows.filter((rule) => rule.enabled).length

  const toggle = async (rule: InterceptRule) => {
    setError('')
    setBusy(rule.id)
    try {
      await interceptApi.toggleRule(rule.id, !rule.enabled)
      rules.reload()
    } catch (reason) {
      setError(errText(reason))
    } finally {
      setBusy(0)
    }
  }

  /** 一次性把停用的规则全部打开：20 条内置规则逐条点开关太费手。 */
  const enableAll = async () => {
    const pending = rows.filter((rule) => !rule.enabled)
    if (pending.length === 0) return
    setError('')
    setBulk(true)
    try {
      await Promise.all(pending.map((rule) => interceptApi.toggleRule(rule.id, true)))
      rules.reload()
    } catch (reason) {
      setError(errText(reason))
    } finally {
      setBulk(false)
    }
  }

  const remove = async (rule: InterceptRule) => {
    setError('')
    setBusy(rule.id)
    try {
      await interceptApi.deleteRule(rule.id)
      setRemoving(null)
      rules.reload()
    } catch (reason) {
      setError(errText(reason))
    } finally {
      setBusy(0)
    }
  }

  return (
    <div className="vx-int-stack">
      <div className="vx-int-head">
        <span className="vx-int-hint">按优先级（数字越大越先）逐条匹配，首条命中的规则生效</span>
        <span className="vx-int-count">
          共 {rows.length} 条规则 · {enabledCount} 条启用
        </span>
        {enabledCount < rows.length ? (
          <Button tone="ghost" disabled={bulk} onClick={() => void enableAll()}>
            {bulk ? '启用中…' : '全部启用'}
          </Button>
        ) : null}
        <Button tone="primary" onClick={() => setCreating(true)}>
          <PlusIcon />
          新建规则
        </Button>
      </div>

      <ErrorLine error={error || rules.error} />

      {rules.loading && rows.length === 0 ? (
        <Empty text="读取拦截规则…" />
      ) : rows.length === 0 ? (
        <div className="vx-int-empty">
          <Empty text="暂无拦截规则" hint="没有规则命中时，工具调用只受拦截范围与模型兜底约束。" />
          <Button onClick={() => setCreating(true)}>
            <PlusIcon />
            新建第一条规则
          </Button>
        </div>
      ) : (
        <div className="vx-int-table" role="table" aria-label="拦截规则">
          <div className="vx-int-tr vx-int-tr--head" role="row">
            <span role="columnheader">优先级</span>
            <span role="columnheader">名称</span>
            <span role="columnheader">目标</span>
            <span role="columnheader">类型</span>
            <span role="columnheader">模式</span>
            <span role="columnheader">策略</span>
            <span role="columnheader" className="vx-int-tr-center">
              启用
            </span>
            <span role="columnheader" />
          </div>
          {rows.map((rule) => (
            <div className="vx-int-tr" role="row" key={rule.id} data-off={rule.enabled ? undefined : '1'}>
              <span className="vx-int-priority" role="cell">
                {rule.priority}
              </span>
              <span className="vx-int-name" role="cell" title={rule.name}>
                {rule.name}
              </span>
              <span className="vx-int-dim" role="cell">
                {TARGET_LABEL[rule.match_target]}
              </span>
              <span className="vx-int-dim" role="cell">
                {TYPE_LABEL[rule.match_type]}
              </span>
              <span role="cell" className="vx-int-pattern">
                <code className="vx-int-code" title={rule.pattern}>
                  {rule.pattern}
                </code>
              </span>
              <span role="cell">
                <span className={`vx-chip vx-chip--${ACTION_TONE[rule.action]}`}>{ACTION_LABEL[rule.action]}</span>
              </span>
              <span role="cell" className="vx-int-tr-center">
                <Switch
                  checked={rule.enabled}
                  disabled={busy === rule.id}
                  label={`${rule.enabled ? '停用' : '启用'}规则 ${rule.name}`}
                  onChange={() => void toggle(rule)}
                />
              </span>
              <span role="cell" className="vx-int-actions">
                <button
                  type="button"
                  className="vx-int-iconbtn"
                  title="编辑规则"
                  aria-label={`编辑规则 ${rule.name}`}
                  onClick={() => setEditing(rule)}
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  className="vx-int-iconbtn vx-int-iconbtn--danger"
                  title="删除规则"
                  aria-label={`删除规则 ${rule.name}`}
                  onClick={() => setRemoving(rule)}
                >
                  <TrashIcon />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {creating || editing ? (
        <RuleEditor
          rule={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            rules.reload()
          }}
        />
      ) : null}

      {removing ? (
        <ConfirmDelete
          rule={removing}
          busy={busy === removing.id}
          error={error}
          onCancel={() => setRemoving(null)}
          onConfirm={() => void remove(removing)}
        />
      ) : null}
    </div>
  )
}

function ConfirmDelete({
  rule,
  busy,
  error,
  onCancel,
  onConfirm
}: {
  rule: InterceptRule
  busy: boolean
  error: string
  onCancel: () => void
  onConfirm: () => void
}): ReactNode {
  const close = useRef(onCancel)
  close.current = onCancel
  useEscape(true, () => close.current())
  return (
    <Overlay onClose={onCancel}>
      <div className="vx-int-modal" role="dialog" aria-modal="true" aria-label="删除规则">
        <header className="vx-int-sheet-head">
          <h2 className="vx-int-sheet-title">删除规则</h2>
          <p className="vx-int-sheet-sub">
            「{rule.name}」删除后不再参与匹配；已产生的审批记录保留。
          </p>
        </header>
        <div className="vx-int-sheet-body">
          <ErrorLine error={error} />
          <p className="vx-int-note">
            <code className="vx-int-code">{rule.pattern}</code>
          </p>
        </div>
        <footer className="vx-int-sheet-foot">
          <Button onClick={onCancel}>取消</Button>
          <Button tone="danger" disabled={busy} onClick={onConfirm}>
            {busy ? '删除中…' : '删除'}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

/* ── 规则编辑器（右侧抽屉） ─────────────────────────────────────────────── */

const draftOf = (rule: InterceptRule | null): RuleDraft => ({
  name: rule?.name ?? '',
  enabled: rule?.enabled ?? true,
  priority: rule?.priority ?? 0,
  match_target: rule?.match_target ?? 'tool_name',
  match_type: rule?.match_type ?? 'string',
  pattern: rule?.pattern ?? '',
  action: rule?.action ?? 'deny',
  message: rule?.message ?? '',
  timeout_enabled: rule?.timeout_enabled ?? true,
  timeout_seconds: rule?.timeout_seconds || 60,
  timeout_action: rule?.timeout_action ?? 'deny'
})

function RuleEditor({
  rule,
  onClose,
  onSaved
}: {
  rule: InterceptRule | null
  onClose: () => void
  onSaved: () => void
}): ReactNode {
  const [draft, setDraft] = useState<RuleDraft>(() => draftOf(rule))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [regexWarn, setRegexWarn] = useState(false)
  const close = useRef(onClose)
  close.current = onClose
  useEscape(true, () => close.current())

  // 浏览器只认识 JS RegExp，Go 的 RE2 还接受 (?i) 一类内联 flag：
  // 这里只在 JS 语法确实不合法时提示“服务端最终校验”，不拦提交。
  useEffect(() => {
    if (draft.match_type !== 'regex' || !draft.pattern) {
      setRegexWarn(false)
      return
    }
    try {
      new RegExp(draft.pattern)
      setRegexWarn(false)
    } catch {
      setRegexWarn(true)
    }
  }, [draft.match_type, draft.pattern])

  const patch = (next: Partial<RuleDraft>) => setDraft((current) => ({ ...current, ...next }))

  const submit = async () => {
    if (!draft.name.trim()) {
      setError('名称不能为空')
      return
    }
    if (!draft.pattern.trim()) {
      setError('模式不能为空')
      return
    }
    setError('')
    setSaving(true)
    try {
      const body: RuleDraft = {
        ...draft,
        name: draft.name.trim(),
        pattern: draft.pattern.trim(),
        message: draft.message,
        priority: Number.isFinite(draft.priority) ? Math.trunc(draft.priority) : 0,
        timeout_seconds: draft.timeout_seconds > 0 ? Math.trunc(draft.timeout_seconds) : 60
      }
      if (rule) await interceptApi.updateRule(rule.id, body)
      else await interceptApi.createRule(body)
      onSaved()
    } catch (reason) {
      setError(errText(reason))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <aside className="vx-int-sheet" role="dialog" aria-modal="true" aria-label={rule ? '编辑规则' : '新建规则'}>
        <header className="vx-int-sheet-head">
          <h2 className="vx-int-sheet-title">{rule ? '编辑规则' : '新建规则'}</h2>
          <p className="vx-int-sheet-sub">优先级越大越先匹配；首条命中生效，后续跳过。</p>
        </header>

        <div className="vx-int-sheet-body">
          <Field label="名称">
            <input
              className="vx-int-control"
              placeholder="给规则起个名字"
              value={draft.name}
              autoFocus
              onChange={(event) => patch({ name: event.target.value })}
            />
          </Field>

          <div className="vx-int-row vx-int-row--2">
            <Field label="优先级（越大越先）">
              <input
                className="vx-int-control"
                type="number"
                value={String(draft.priority)}
                onChange={(event) => patch({ priority: Number.parseInt(event.target.value, 10) || 0 })}
              />
            </Field>
            <Field label="匹配目标">
              <select
                className="vx-int-control"
                value={draft.match_target}
                onChange={(event) => patch({ match_target: event.target.value as MatchTarget })}
              >
                <option value="tool_name">工具名（tool_name）</option>
                <option value="tool_input">输入内容（tool_input JSON）</option>
              </select>
            </Field>
          </div>

          <div className="vx-int-divider" />

          <Field label="匹配类型">
            <select
              className="vx-int-control"
              value={draft.match_type}
              onChange={(event) => patch({ match_type: event.target.value as MatchType })}
            >
              <option value="string">字符串包含</option>
              <option value="regex">正则表达式</option>
            </select>
          </Field>

          <Field
            label="模式"
            hint={
              regexWarn ? (
                <span className="vx-int-warn">包含 Go RE2 扩展语法（如 (?i)），浏览器无法预览，提交后由服务端校验</span>
              ) : undefined
            }
          >
            <input
              className="vx-int-control vx-int-control--mono"
              placeholder={draft.match_type === 'regex' ? '^Bash$' : 'rm -rf'}
              value={draft.pattern}
              spellCheck={false}
              onChange={(event) => patch({ pattern: event.target.value })}
            />
          </Field>

          <div className="vx-int-divider" />

          <Field label="拦截策略">
            <select
              className="vx-int-control"
              value={draft.action}
              onChange={(event) => patch({ action: event.target.value as RuleAction })}
            >
              <option value="allow">允许 — 直接放行，跳过后续规则</option>
              <option value="deny">禁止 — 阻断，返回拒绝消息给模型</option>
              <option value="ask">向用户申请 — 等待审批</option>
            </select>
          </Field>

          {draft.action !== 'allow' ? (
            <Field label={draft.action === 'deny' ? '拒绝消息（返回给模型）' : '审批说明（可选）'}>
              <textarea
                className="vx-int-control"
                rows={2}
                placeholder={draft.action === 'deny' ? '操作被安全策略阻止' : ''}
                value={draft.message}
                onChange={(event) => patch({ message: event.target.value })}
              />
            </Field>
          ) : null}

          {draft.action === 'ask' ? (
            <>
              <div className="vx-int-divider" />
              <div className="vx-int-checkline">
                <Switch
                  checked={draft.timeout_enabled}
                  label="启用审批超时"
                  onChange={(next) => patch({ timeout_enabled: next })}
                />
                <span>启用审批超时</span>
                <small className="vx-int-hint">超时后自动处置，不再等待</small>
              </div>
              {draft.timeout_enabled ? (
                <div className="vx-int-row vx-int-row--2">
                  <Field label="超时时间（秒）">
                    <input
                      className="vx-int-control"
                      type="number"
                      min={5}
                      value={String(draft.timeout_seconds)}
                      onChange={(event) => {
                        const seconds = Number.parseInt(event.target.value, 10)
                        if (seconds > 0) patch({ timeout_seconds: seconds })
                      }}
                    />
                  </Field>
                  <Field label="超时动作">
                    <select
                      className="vx-int-control"
                      value={draft.timeout_action}
                      onChange={(event) => patch({ timeout_action: event.target.value as 'allow' | 'deny' })}
                    >
                      <option value="deny">自动拒绝</option>
                      <option value="allow">自动允许</option>
                    </select>
                  </Field>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="vx-int-divider" />

          <div className="vx-int-checkline">
            <Switch checked={draft.enabled} label="启用此规则" onChange={(next) => patch({ enabled: next })} />
            <span>启用此规则</span>
          </div>

          <ErrorLine error={error} />
        </div>

        <footer className="vx-int-sheet-foot">
          <Button onClick={onClose}>取消</Button>
          <Button tone="primary" disabled={saving} onClick={() => void submit()}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </footer>
      </aside>
    </Overlay>
  )
}

/* ── 拦截范围对话框 ─────────────────────────────────────────────────────── */

/** SDK 内建工具不在工具表里播种（对每个 agent 都生效），因此与 Web 控制台同一份硬编码。 */
const sdkTool = (key: string, description: string): ToolEntry => ({ key, description, system: true })

const SDK_EXEC: ToolEntry[] = [
  sdkTool('Bash', '在 shell 中执行命令'),
  sdkTool('WebFetch', '发起 HTTP/HTTPS 请求（含代理支持）'),
  sdkTool('web_search', '网络搜索'),
  sdkTool('shell_open', '开启持久 PTY 交互会话'),
  sdkTool('shell_send', '向交互会话发送输入'),
  sdkTool('shell_read', '读取交互会话输出'),
  sdkTool('shell_close', '关闭交互会话'),
  sdkTool('shell_list', '列出所有交互会话')
]

const SDK_WRITE: ToolEntry[] = [
  sdkTool('Write', '写入文件'),
  sdkTool('Edit', '编辑文件（精确替换）'),
  sdkTool('MultiEdit', '批量编辑文件')
]

const SDK_KEYS = new Set([...SDK_EXEC, ...SDK_WRITE].map((tool) => tool.key))

function toolGroups(catalog: ToolEntry[]): Array<{ label: string; tools: ToolEntry[] }> {
  const system: ToolEntry[] = []
  const custom: ToolEntry[] = []
  for (const tool of catalog) {
    if (SDK_KEYS.has(tool.key)) continue
    if (tool.system) system.push(tool)
    else custom.push(tool)
  }
  return [
    { label: '执行类', tools: SDK_EXEC },
    { label: '写入/编辑类', tools: SDK_WRITE },
    { label: '系统工具', tools: system },
    { label: '自定义工具', tools: custom }
  ].filter((group) => group.tools.length > 0)
}

function ScopeDialog({
  tools,
  onClose,
  onSaved
}: {
  tools: string[]
  onClose: () => void
  onSaved: () => void
}): ReactNode {
  const catalog = useLoader(interceptApi.tools)
  const [picked, setPicked] = useState<Set<string>>(() => new Set(tools))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const close = useRef(onClose)
  close.current = onClose
  useEscape(true, () => close.current())

  const groups = toolGroups(catalog.data ?? [])

  const toggle = (key: string) => {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const save = async () => {
    setError('')
    setSaving(true)
    try {
      await interceptApi.saveScopeTools([...picked])
      onSaved()
    } catch (reason) {
      setError(errText(reason))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="vx-int-modal" role="dialog" aria-modal="true" aria-label="拦截范围">
        <header className="vx-int-sheet-head">
          <h2 className="vx-int-sheet-title">
            <FilterIcon />
            拦截范围
          </h2>
          <p className="vx-int-sheet-sub">
            只有启用的工具才进入规则匹配；其余工具直接放行。已选 {picked.size} 个。
          </p>
        </header>

        <div className="vx-int-sheet-body">
          <ErrorLine error={catalog.error} />
          {catalog.loading && groups.length === 0 ? <Empty text="读取工具目录…" /> : null}
          {groups.map((group, index) => (
            <div key={group.label} className="vx-int-group">
              {index > 0 ? <div className="vx-int-divider" /> : null}
              <p className="vx-int-label">{group.label}</p>
              {group.tools.map((tool) => (
                <div key={tool.key} className="vx-int-toolrow">
                  <Switch
                    checked={picked.has(tool.key)}
                    label={`${picked.has(tool.key) ? '移出' : '加入'}拦截范围：${tool.key}`}
                    onChange={() => toggle(tool.key)}
                  />
                  <span className="vx-int-toolrow-main">
                    <span className="vx-int-toolrow-key">
                      <code>{tool.key}</code>
                      {tool.kind && tool.kind !== 'builtin' ? (
                        <span className="vx-chip vx-chip--muted">{tool.kind}</span>
                      ) : null}
                    </span>
                    {tool.description ? <small className="vx-int-hint">{tool.description}</small> : null}
                  </span>
                </div>
              ))}
            </div>
          ))}
          <ErrorLine error={error} />
        </div>

        <footer className="vx-int-sheet-foot">
          <span className="vx-int-hint">不保存则沿用当前范围。</span>
          <Button onClick={onClose}>取消</Button>
          <Button tone="primary" disabled={saving} onClick={() => void save()}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </footer>
      </div>
    </Overlay>
  )
}

/* ── 模型兜底（模型配置页签） ───────────────────────────────────────────── */

function UsageCard({ usage, onRefresh }: { usage: JudgeUsage | undefined; onRefresh: () => void }): ReactNode {
  const daily = usage?.daily ?? []
  const peak = Math.max(1, ...daily.map((day) => day.input_tokens + day.output_tokens))
  return (
    <Card
      title="审批 Token 消耗"
      extra={
        <Button tone="ghost" onClick={onRefresh}>
          刷新
        </Button>
      }
    >
      <p className="vx-int-hint">模型兜底审批的累计用量，单独计量（worker=judge），不与各模型配置的统计混在一起。</p>
      <div className="vx-int-stats">
        <div className="vx-int-stat">
          <span>审批调用</span>
          <b>{usage ? usage.calls.toLocaleString() : '—'}</b>
        </div>
        <div className="vx-int-stat">
          <span>输入 Token</span>
          <b>{usage ? fmtTokens(usage.input_tokens) : '—'}</b>
        </div>
        <div className="vx-int-stat">
          <span>输出 Token</span>
          <b>{usage ? fmtTokens(usage.output_tokens) : '—'}</b>
        </div>
        <div className="vx-int-stat">
          <span>缓存读</span>
          <b>{usage ? fmtTokens(usage.cache_read_tokens) : '—'}</b>
        </div>
        <div className="vx-int-stat">
          <span>缓存写</span>
          <b>{usage ? fmtTokens(usage.cache_write_tokens) : '—'}</b>
        </div>
      </div>
      {daily.length > 0 ? (
        <div className="vx-int-sparkwrap">
          <p className="vx-int-label">近 {daily.length} 天每日消耗（输入 + 输出）</p>
          <div className="vx-int-spark">
            {daily.map((day) => {
              const total = day.input_tokens + day.output_tokens
              return (
                <i
                  key={day.date}
                  title={`${day.date} · ${day.calls} 次 · ${fmtTokens(total)} tokens`}
                  style={{ height: `${Math.max(3, Math.round((total / peak) * 100))}%` }}
                />
              )
            })}
          </div>
        </div>
      ) : null}
    </Card>
  )
}

function JudgeTab(): ReactNode {
  const config = useLoader(interceptApi.judge)
  const profiles = useLoader(interceptApi.profiles)
  const [draft, setDraft] = useState<JudgeConfig | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (config.data && draft === undefined) setDraft(config.data)
  }, [config.data, draft])

  const form = draft ?? config.data
  const usage = useLoader(() => interceptApi.judgeUsage(30), Boolean(form?.enabled))

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2400)
    return () => window.clearTimeout(timer)
  }, [notice])

  if (config.loading && !form) return <Empty text="读取模型兜底配置…" />
  if (!form) return <ErrorLine error={config.error || '模型兜底配置不可用'} />

  const patch = (next: Partial<JudgeConfig>) => setDraft({ ...form, ...next })

  const save = async () => {
    setError('')
    setSaving(true)
    try {
      await interceptApi.saveJudge(form)
      const fresh = await interceptApi.judge()
      setDraft(fresh)
      config.reload()
      setNotice('模型兜底配置已保存')
    } catch (reason) {
      setError(errText(reason))
    } finally {
      setSaving(false)
    }
  }

  const restorePrompt = async () => {
    setError('')
    setSaving(true)
    try {
      // 清空提示词保存 → 服务端下次返回内置模板全文，再回填到编辑框。
      await interceptApi.saveJudge({ ...form, prompt: '' })
      const fresh = await interceptApi.judge()
      setDraft(fresh)
      setNotice('已恢复内置默认模板')
    } catch (reason) {
      setError(errText(reason))
    } finally {
      setSaving(false)
    }
  }

  const profileOptions: ToolProfile[] = profiles.data ?? []

  return (
    <div className="vx-int-stack">
      <div className="vx-int-bar" data-on={form.enabled ? '1' : undefined}>
        <span className="vx-int-bar-icon" aria-hidden="true">
          <BotIcon />
        </span>
        <div className="vx-int-bar-text">
          <span className="vx-int-bar-title">
            模型兜底审批
            <span className={`vx-chip vx-chip--${form.enabled ? 'success' : 'muted'}`}>
              {form.enabled ? '已启用' : '未启用'}
            </span>
          </span>
          <span className="vx-int-bar-names">
            拦截范围内的命令，若没有命中任何规则，才由模型做语义判断（放行 / 转人工 / 拦截）。
          </span>
        </div>
        <div className="vx-int-bar-actions">
          <Switch checked={form.enabled} label="启用模型兜底审批" onChange={(next) => patch({ enabled: next })} />
        </div>
      </div>

      <ErrorLine error={error || config.error} />
      {notice ? <p className="vx-int-notice">{notice}</p> : null}

      {form.enabled ? (
        <>
          <UsageCard usage={usage.data} onRefresh={usage.reload} />
          <div className="vx-int-cols">
            <Card
              title="审批提示词"
              extra={
                <Button tone="ghost" disabled={saving} onClick={() => void restorePrompt()}>
                  恢复默认模板
                </Button>
              }
            >
              <p className="vx-int-hint">模型据此判定 ALLOW / ASK / DENY，可直接编辑。</p>
              <textarea
                className="vx-int-control vx-int-prompt"
                value={form.prompt}
                spellCheck={false}
                placeholder="留空使用内置模板"
                onChange={(event) => patch({ prompt: event.target.value })}
              />
              <p className="vx-int-hint vx-int-right">{form.prompt.length} 字</p>
            </Card>

            <Card title="判定参数">
              <Field label="审批模型">
                <select
                  className="vx-int-control"
                  value={String(form.profile_id || 0)}
                  onChange={(event) => patch({ profile_id: Number(event.target.value) || 0 })}
                >
                  <option value="0">跟随激活配置</option>
                  {profileOptions.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}（{profile.model}）
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="模型判定超时（秒）">
                <input
                  className="vx-int-control"
                  type="number"
                  min={1}
                  value={String(form.timeout_seconds)}
                  onChange={(event) => {
                    const seconds = Number.parseInt(event.target.value, 10)
                    if (seconds > 0) patch({ timeout_seconds: seconds })
                  }}
                />
              </Field>
              <Field label="模型失败时（出错 / 超时 / 无法解析）">
                <select
                  className="vx-int-control"
                  value={form.fail_action}
                  onChange={(event) => patch({ fail_action: event.target.value as JudgeFailAction })}
                >
                  <option value="allow">放行</option>
                  <option value="ask">转人工审批</option>
                  <option value="deny">拦截</option>
                </select>
              </Field>
              <div className="vx-int-divider" />
              <Field label="审批等待超时（秒）" hint="模型判为「转人工」时的等待上限">
                <input
                  className="vx-int-control"
                  type="number"
                  min={5}
                  value={String(form.ask_timeout_seconds)}
                  onChange={(event) => {
                    const seconds = Number.parseInt(event.target.value, 10)
                    if (seconds > 0) patch({ ask_timeout_seconds: seconds })
                  }}
                />
              </Field>
              <Field label="超时后默认动作">
                <select
                  className="vx-int-control"
                  value={form.ask_timeout_action}
                  onChange={(event) => patch({ ask_timeout_action: event.target.value as 'allow' | 'deny' })}
                >
                  <option value="deny">拦截</option>
                  <option value="allow">放行</option>
                </select>
              </Field>
            </Card>
          </div>
        </>
      ) : (
        <p className="vx-int-hint">开启后，未命中规则的命令才会交给模型判定；关闭时不做任何兜底判定。</p>
      )}

      <div className="vx-int-foot">
        {profiles.error ? <span className="vx-int-hint">模型配置读取失败：{profiles.error}</span> : null}
        <Button tone="primary" disabled={saving} onClick={() => void save()}>
          {saving ? '保存中…' : '保存配置'}
        </Button>
      </div>
    </div>
  )
}

/* ── 页面 ───────────────────────────────────────────────────────────────── */

export function InterceptSettings(): ReactNode {
  const scope = useLoader(interceptApi.scopeTools)
  const [tab, setTab] = useState<TabID>('rules')
  const [scopeOpen, setScopeOpen] = useState(false)

  return (
    <div className="vx-int-page">
      <ScopeBar tools={scope.data} loading={scope.loading} error={scope.error} onEdit={() => setScopeOpen(true)} />

      <div className="vx-task-tabbar" role="tablist" aria-label="拦截设置">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'rules' ? <RulesTab /> : <JudgeTab />}

      {scopeOpen ? (
        <ScopeDialog
          tools={scope.data ?? [...DEFAULT_SCOPE_TOOLS]}
          onClose={() => setScopeOpen(false)}
          onSaved={() => {
            setScopeOpen(false)
            scope.reload()
          }}
        />
      ) : null}
    </div>
  )
}
