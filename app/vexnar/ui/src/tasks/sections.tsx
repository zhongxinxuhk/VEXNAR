// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/** 任务详情的十个页签，逐条对齐 Web 控制台的 /function/tasks/detail。 */

import { useMemo, useRef, useState } from 'react'

import { tasksApi, reportText, type ActivityItem, type Asset, type Finding, type Task } from './api.js'
import { useResource } from './hooks.js'
import { Button, Card, Empty, ErrorLine, Field, KeyValue, Metric, Select, severityChip, relTime } from './ui.js'

const FINDING_STATUS: Array<[string, string]> = [
  ['pending', '待处理'],
  ['in_progress', '处理中'],
  ['confirmed', '已确认'],
  ['fixed', '已修复'],
  ['false_positive', '误报'],
  ['ignored', '忽略'],
  ['risk_accepted', '风险接受']
]

function ListItem({ title, meta, actions, tone }: { title: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode; tone?: string }) {
  return (
    <div className="vx-task-item" data-tone={tone}>
      <div className="vx-task-item-main">
        <div className="vx-task-item-title">{title}</div>
        {meta ? <div className="vx-task-item-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="vx-task-item-actions">{actions}</div> : null}
    </div>
  )
}

/* ── 会话 ─────────────────────────────────────────────── */
export function SessionsSection({ task }: { task: Task }) {
  const [seg, setSeg] = useState<number | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState('')
  const [reply, setReply] = useState('')
  const sessions = useResource(`sessions:${task.id}`, () => tasksApi.mainSessions(task.id))
  const history = useResource(`history:${task.id}:${seg ?? ''}`, () => tasksApi.activityHistory(task.id, seg === undefined ? 'main' : `main:${seg}`, 0, 120))
  const items = history.data?.items ?? []

  const send = async () => {
    const message = draft.trim()
    if (!message || busy) return
    setBusy('send')
    setReply('')
    try {
      const result = await tasksApi.chat(task.id, message, seg)
      setReply(result.reply || '（已发送）')
      setDraft('')
      history.reload()
    } catch (error) {
      setReply(`发送失败：${(error as Error).message}`)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="vx-task-stack">
      <Card
        title="主 Agent 会话"
        extra={
          <div className="vx-task-inline">
            <Select
              ariaLabel="会话分段"
              value={seg === undefined ? 'current' : String(seg)}
              onChange={(value) => setSeg(value === 'current' ? undefined : Number(value))}
              options={[
                ['current', '当前会话'],
                ...(sessions.data?.sessions ?? []).map((item) => [String(item.seq), `会话 #${item.seq}`] as [string, string])
              ]}
            />
            <Button
              onClick={() => {
                setBusy('new')
                tasksApi
                  .newMainSession(task.id)
                  .then((result) => {
                    setSeg(result.current)
                    sessions.reload()
                    history.reload()
                  })
                  .catch((error: Error) => setReply(error.message))
                  .finally(() => setBusy(''))
              }}
              disabled={busy === 'new'}
            >
              新会话
            </Button>
            <Button tone="ghost" onClick={() => void tasksApi.chatStop(task.id).catch(() => {})}>
              停止
            </Button>
          </div>
        }
      >
        <div className="vx-task-feed">
          {history.loading && <Empty text="读取会话…" />}
          <ErrorLine error={history.error} />
          {!history.loading && items.length === 0 && <Empty text="还没有对话" hint="在下方给主 Agent 发消息，引导探索方向。" />}
          {items.map((item) => (
            <div key={item.id} className="vx-task-feed-item">
              <span className="vx-task-feed-time">{relTime(item.ts)}</span>
              <div>
                <div className="vx-task-feed-title">
                  {item.tool ? <code className="vx-task-tool">{item.tool}</code> : null}
                  {item.title || item.kind || '步骤'}
                </div>
                {item.summary ? <div className="vx-task-feed-body">{item.summary}</div> : null}
              </div>
            </div>
          ))}
        </div>
        <div className="vx-task-compose">
          <textarea
            className="vx-task-textarea"
            placeholder="给主 Agent 发消息，引导探索方向…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void send()
            }}
          />
          <div className="vx-task-compose-actions">
            {reply ? <small className="vx-task-hint">{reply.slice(0, 240)}</small> : <small className="vx-task-hint">⌘/Ctrl + Enter 发送</small>}
            <Button tone="primary" onClick={() => void send()} disabled={!draft.trim() || busy === 'send'}>
              {busy === 'send' ? '发送中…' : '发送'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ── 总览 ─────────────────────────────────────────────── */
export function OverviewSection({ task }: { task: Task }) {
  const goals = useResource(`goals:${task.id}`, () => tasksApi.goals(task.id))
  const constraints = useResource(`constraints:${task.id}`, () => tasksApi.constraints(task.id))
  const scope = useResource(`scope:${task.id}`, () => tasksApi.scope(task.id))
  const rules = useResource(`rules:${task.id}`, () => tasksApi.rules(task.id))
  const coverage = useResource(`coverage:${task.id}`, () => tasksApi.coverage(task.id))
  const tokens = useResource(`tokens:${task.id}`, () => tasksApi.tokens(task.id))

  const [goalText, setGoalText] = useState('')
  const [constraintText, setConstraintText] = useState('')
  const [constraintKind, setConstraintKind] = useState('deny')
  const [scopeValue, setScopeValue] = useState('')
  const [scopeKind, setScopeKind] = useState('root_domain')
  const [rulePattern, setRulePattern] = useState('')
  const [ruleKind, setRuleKind] = useState('deny')
  const [busy, setBusy] = useState('')

  const run = async (name: string, action: () => Promise<unknown>, after: () => void) => {
    setBusy(name)
    try {
      await action()
      after()
    } catch (error) {
      window.alert((error as Error).message)
    } finally {
      setBusy('')
    }
  }

  const modelTokens = tokens.data ?? []

  return (
    <div className="vx-task-stack">
      <Card title="任务描述与目标">
        <div className="vx-task-cols">
          <KeyValue label="描述">{task.description || '—'}</KeyValue>
          <KeyValue label="目标">{task.goal || '—'}</KeyValue>
          <KeyValue label="创建">{relTime(task.created_at)}</KeyValue>
          <KeyValue label="最近活动">{relTime(task.last_activity)}</KeyValue>
        </div>
      </Card>

      <div className="vx-task-metrics">
        <Metric label="目标达成" value={`${task.goals_met ?? 0}/${task.goals_total ?? 0}`} />
        <Metric label="进行中意图" value={task.in_flight ?? 0} hint="frontier 待领" />
        <Metric label="确认漏洞" value={(task.findings?.critical ?? 0) + (task.findings?.high ?? 0) + (task.findings?.medium ?? 0) + (task.findings?.low ?? 0)} />
        <Metric label="资产覆盖" value={`${coverage.data?.percent ?? 0}%`} hint={`已测 ${coverage.data?.tested ?? 0} / ${coverage.data?.total ?? 0}`} />
        <Metric label="Token" value={(task.tokens?.total ?? modelTokens.reduce((sum, item) => sum + (item.total ?? 0), 0)).toLocaleString()} />
      </div>

      <Card title={`目标（${goals.data?.length ?? 0}）`} extra={<span className="vx-task-hint">可核验的目标，会派发探索意图</span>}>
        <div className="vx-task-list">
          {(goals.data ?? []).map((goal) => (
            <ListItem
              key={goal.id}
              title={goal.text}
              meta={goal.vulnclass ? <span className="vx-chip vx-chip--muted">{goal.vulnclass}</span> : null}
              actions={
                <Button tone="danger" onClick={() => void run(`goal-${goal.id}`, () => tasksApi.deleteGoal(task.id, goal.id), goals.reload)} disabled={busy === `goal-${goal.id}`}>
                  删除
                </Button>
              }
            />
          ))}
          {!goals.loading && (goals.data?.length ?? 0) === 0 && <Empty text="暂无目标" hint="加上一条可核验的目标，规划器会据此派发意图。" />}
        </div>
        <div className="vx-task-inline vx-task-inline--wide">
          <Field placeholder="新增目标，如「拿到管理员账号的越权访问」" value={goalText} onChange={setGoalText} onEnter={() => goalText.trim() && void run('add-goal', () => tasksApi.addGoal(task.id, goalText.trim()), () => { setGoalText(''); goals.reload() })} />
          <Button tone="primary" disabled={!goalText.trim() || busy === 'add-goal'} onClick={() => void run('add-goal', () => tasksApi.addGoal(task.id, goalText.trim()), () => { setGoalText(''); goals.reload() })}>
            添加
          </Button>
        </div>
      </Card>

      <Card title={`操作约束（${constraints.data?.length ?? 0}）`} extra={<span className="vx-task-hint">允许 / 禁止，框定 planner 与 worker 的边界</span>}>
        <div className="vx-task-list">
          {(constraints.data ?? []).map((constraint) => (
            <ListItem
              key={constraint.id}
              title={constraint.text}
              meta={<span className={`vx-chip vx-chip--${constraint.kind === 'deny' ? 'error' : 'success'}`}>{constraint.kind === 'deny' ? '禁止' : '允许'}</span>}
              actions={
                <Button tone="danger" onClick={() => void run(`c-${constraint.id}`, () => tasksApi.deleteConstraint(task.id, constraint.id), constraints.reload)}>
                  删除
                </Button>
              }
            />
          ))}
          {!constraints.loading && (constraints.data?.length ?? 0) === 0 && <Empty text="暂无操作约束" />}
        </div>
        <div className="vx-task-inline vx-task-inline--wide">
          <Select value={constraintKind} onChange={setConstraintKind} ariaLabel="约束类型" options={[['deny', '禁止'], ['allow', '允许']]} />
          <Field placeholder="一条操作约束，如「仅测当前端口，不扫其他端口」" value={constraintText} onChange={setConstraintText} />
          <Button
            tone="primary"
            disabled={!constraintText.trim()}
            onClick={() => void run('add-constraint', () => tasksApi.addConstraint(task.id, constraintText.trim(), constraintKind), () => { setConstraintText(''); constraints.reload() })}
          >
            添加
          </Button>
        </div>
      </Card>

      <Card title={`测试范围（${scope.data?.length ?? 0}）`} extra={<span className="vx-task-hint">覆盖度分母与授权边界</span>}>
        <div className="vx-task-list">
          {(scope.data ?? []).map((row) => (
            <ListItem
              key={row.id}
              title={<code>{row.value}</code>}
              meta={
                <div className="vx-task-inline">
                  <span className="vx-chip vx-chip--muted">{row.kind}</span>
                  {row.reason ? <span className="vx-task-hint">{row.reason}</span> : null}
                </div>
              }
              actions={
                <Button tone="danger" onClick={() => void run(`s-${row.id}`, () => tasksApi.deleteScope(task.id, row.id), scope.reload)}>
                  删除
                </Button>
              }
            />
          ))}
          {!scope.loading && (scope.data?.length ?? 0) === 0 && <Empty text="暂无测试范围" />}
        </div>
        <div className="vx-task-inline vx-task-inline--wide">
          <Select
            value={scopeKind}
            onChange={setScopeKind}
            ariaLabel="范围类型"
            options={[['root_domain', '根域名'], ['domain', '域名'], ['ip', 'IP'], ['cidr', 'CIDR']]}
          />
          <Field placeholder="如 example.com" value={scopeValue} onChange={setScopeValue} />
          <Button
            tone="primary"
            disabled={!scopeValue.trim()}
            onClick={() => void run('add-scope', () => tasksApi.addScope(task.id, scopeKind, scopeValue.trim()), () => { setScopeValue(''); scope.reload() })}
          >
            添加
          </Button>
        </div>
      </Card>

      <Card title={`任务级拦截规则（${rules.data?.length ?? 0}）`} extra={<span className="vx-task-hint">仅本任务生效，先拦截后允许</span>}>
        <div className="vx-task-list">
          {(rules.data ?? []).map((rule) => (
            <ListItem
              key={rule.id}
              title={<code>{rule.pattern}</code>}
              meta={
                <div className="vx-task-inline">
                  <span className={`vx-chip vx-chip--${rule.kind === 'deny' ? 'error' : 'success'}`}>{rule.kind === 'deny' ? '拦截' : '允许'}</span>
                  <span className="vx-chip vx-chip--muted">{rule.match}</span>
                  {rule.note ? <span className="vx-task-hint">{rule.note}</span> : null}
                </div>
              }
              actions={
                <div className="vx-task-inline">
                  <Button onClick={() => void run(`r-${rule.id}`, () => tasksApi.toggleRule(task.id, rule.id, !rule.enabled), rules.reload)}>
                    {rule.enabled ? '停用' : '启用'}
                  </Button>
                  <Button tone="danger" onClick={() => void run(`rd-${rule.id}`, () => tasksApi.deleteRule(task.id, rule.id), rules.reload)}>
                    删除
                  </Button>
                </div>
              }
            />
          ))}
          {!rules.loading && (rules.data?.length ?? 0) === 0 && <Empty text="暂无任务级规则" />}
        </div>
        <div className="vx-task-inline vx-task-inline--wide">
          <Select value={ruleKind} onChange={setRuleKind} ariaLabel="规则动作" options={[['deny', '拦截'], ['allow', '允许']]} />
          <Field placeholder="匹配内容，如 .gov.cn" value={rulePattern} onChange={setRulePattern} />
          <Button
            tone="primary"
            disabled={!rulePattern.trim()}
            onClick={() =>
              void run(
                'add-rule',
                () => tasksApi.addRule(task.id, { kind: ruleKind, match: 'fuzzy_domain', pattern: rulePattern.trim(), enabled: true, note: '' }),
                () => {
                  setRulePattern('')
                  rules.reload()
                }
              )
            }
          >
            添加
          </Button>
        </div>
      </Card>

      <Card title="LLM Token 用量" extra={<span className="vx-task-hint">按模型统计</span>}>
        {modelTokens.length === 0 ? (
          <Empty text="暂无 LLM 用量" hint="任务尚未产生调用，或记录仍在写入。" />
        ) : (
          <div className="vx-task-list">
            {modelTokens.map((item) => (
              <ListItem key={item.model} title={item.model} meta={<span className="vx-task-hint">prompt {item.prompt ?? 0} · completion {item.completion ?? 0}</span>} actions={<strong>{(item.total ?? 0).toLocaleString()}</strong>} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ── 探索链路 ─────────────────────────────────────────── */
export function GraphSection({ task }: { task: Task }) {
  const intents = useResource(`intents:${task.id}`, () => tasksApi.intents(task.id))
  const list = intents.data ?? []
  const [busy, setBusy] = useState(false)
  const grouped = useMemo(() => {
    const map = new Map<string, number>()
    for (const intent of list) map.set(intent.status ?? 'pending', (map.get(intent.status ?? 'pending') ?? 0) + 1)
    return Array.from(map.entries())
  }, [list])

  return (
    <div className="vx-task-stack">
      <Card
        title={`探索意图（${list.length}）`}
        extra={
          <div className="vx-task-inline">
            {grouped.map(([status, count]) => (
              <span key={status} className="vx-chip vx-chip--muted">
                {status} · {count}
              </span>
            ))}
            <Button
              onClick={() => {
                setBusy(true)
                tasksApi
                  .intentsRerunBlocked(task.id)
                  .then(() => intents.reload())
                  .catch((error: Error) => window.alert(error.message))
                  .finally(() => setBusy(false))
              }}
              disabled={busy}
            >
              重跑被拦截意图
            </Button>
          </div>
        }
      >
        {intents.loading ? (
          <Empty text="读取意图…" />
        ) : list.length === 0 ? (
          <Empty text="暂无探索意图" hint="任务开始运行后，这里会列出 planner 派发的每一步。" />
        ) : (
          <div className="vx-task-list">
            {list.map((intent) => (
              <ListItem
                key={intent.id}
                title={intent.text || `意图 #${intent.id}`}
                meta={
                  <div className="vx-task-inline">
                    <span className="vx-chip vx-chip--muted">#{intent.id}</span>
                    <span className="vx-chip vx-chip--muted">{intent.kind ?? 'intent'}</span>
                    <span className="vx-chip vx-chip--muted">{intent.status ?? 'pending'}</span>
                    {intent.blocked ? <span className="vx-chip vx-chip--error">被拦截</span> : null}
                    <span className="vx-task-hint">{relTime(intent.created_at)}</span>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ── 播报板 ───────────────────────────────────────────── */
export function BroadcastSection({ task }: { task: Task }) {
  const [kind, setKind] = useState('')
  const feed = useResource(`feed:${task.id}`, () => tasksApi.activity(task.id, 150))
  const items = (feed.data ?? []).filter((item) => !kind || item.kind === kind)
  const kinds = Array.from(new Set((feed.data ?? []).map((item) => item.kind ?? 'step')))

  return (
    <div className="vx-task-stack">
      <Card
        title="播报板"
        extra={
          <div className="vx-task-inline">
            <Select value={kind} onChange={setKind} ariaLabel="类型" options={[['', '全部类型'], ...kinds.map((value) => [value, value] as [string, string])]} />
            <Button onClick={feed.reload}>刷新</Button>
          </div>
        }
      >
        {feed.loading ? (
          <Empty text="读取播报…" />
        ) : items.length === 0 ? (
          <Empty text="暂无播报" hint="任务产生活动后，这里会按时间倒序播报。" />
        ) : (
          <div className="vx-task-feed">
            {items.map((item: ActivityItem) => (
              <div key={item.id} className="vx-task-feed-item">
                <span className="vx-task-feed-time">{relTime(item.ts)}</span>
                <div>
                  <div className="vx-task-feed-title">
                    <span className="vx-chip vx-chip--muted">{item.actor ?? item.kind ?? 'step'}</span>
                    {item.title || item.tool || `步骤 #${item.id}`}
                  </div>
                  {item.summary ? <div className="vx-task-feed-body">{item.summary}</div> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ── 发现 ─────────────────────────────────────────────── */
export function FindingsSection({ task }: { task: Task }) {
  const [page, setPage] = useState(1)
  const findings = useResource(`findings:${task.id}:${page}`, () => tasksApi.findings(task.id, page, 20))
  const rows = findings.data?.items ?? []
  const total = findings.data?.total ?? rows.length
  const [busy, setBusy] = useState('')

  return (
    <div className="vx-task-stack">
      <Card
        title={`漏洞（${total}）`}
        extra={
          <div className="vx-task-inline">
            <Button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              上一页
            </Button>
            <span className="vx-task-hint">
              第 {page} / {Math.max(1, Math.ceil(total / 20))} 页
            </span>
            <Button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage((value) => value + 1)}>
              下一页
            </Button>
          </div>
        }
      >
        {findings.loading ? (
          <Empty text="读取发现…" />
        ) : rows.length === 0 ? (
          <Empty text="本任务及直接关联任务暂无确认发现" />
        ) : (
          <div className="vx-task-table">
            <div className="vx-task-tr vx-task-tr--head">
              <span>漏洞</span>
              <span>等级</span>
              <span>状态</span>
              <span>资产</span>
              <span>发现时间</span>
            </div>
            {rows.map((row: Finding) => (
              <div key={row.id} className="vx-task-tr">
                <span title={row.title}>
                  <strong>{row.title || row.vulnclass || `#${row.id}`}</strong>
                  {row.vulnclass ? <small className="vx-task-hint"> {row.vulnclass}</small> : null}
                </span>
                <span>{severityChip(row.severity)}</span>
                <span>
                  <Select
                    ariaLabel="处置状态"
                    value={row.status}
                    onChange={(value) => {
                      setBusy(String(row.id))
                      tasksApi
                        .setFindingStatus(row.id, value)
                        .then(findings.reload)
                        .catch((error: Error) => window.alert(error.message))
                        .finally(() => setBusy(''))
                    }}
                    options={FINDING_STATUS}
                  />
                </span>
                <span className="vx-task-dim">{row.host || row.url || '—'}</span>
                <span className="vx-task-dim">{relTime(row.created_at)}</span>
              </div>
            ))}
          </div>
        )}
        {busy ? <small className="vx-task-hint">更新中…</small> : null}
      </Card>
    </div>
  )
}

/* ── 复测 ─────────────────────────────────────────────── */
export function RetestsSection({ task }: { task: Task }) {
  const findings = useResource(`retest-findings:${task.id}`, () => tasksApi.findings(task.id, 1, 50))
  const rows = findings.data?.items ?? []
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState('')

  return (
    <div className="vx-task-stack">
      <Card title="复测" extra={<span className="vx-task-hint">对已确认漏洞发起复测</span>}>
        {findings.loading ? (
          <Empty text="读取漏洞…" />
        ) : rows.length === 0 ? (
          <Empty text="暂无可复测漏洞" hint="本任务发现漏洞后，可在这里手动发起复测。" />
        ) : (
          <>
            <div className="vx-task-inline vx-task-inline--wide">
              <Field placeholder="复测备注（可选）" value={notes} onChange={setNotes} />
            </div>
            <div className="vx-task-list">
              {rows.map((row) => (
                <ListItem
                  key={row.id}
                  title={row.title || row.vulnclass || `#${row.id}`}
                  meta={
                    <div className="vx-task-inline">
                      {severityChip(row.severity)}
                      <span className="vx-chip vx-chip--muted">{row.status}</span>
                      <span className="vx-task-dim">{row.host || row.url || '—'}</span>
                    </div>
                  }
                  actions={
                    <Button
                      tone="primary"
                      disabled={busy === String(row.id)}
                      onClick={() => {
                        setBusy(String(row.id))
                        tasksApi
                          .startRetest(row.id, notes.trim())
                          .then(() => {
                            setNotes('')
                            findings.reload()
                          })
                          .catch((error: Error) => window.alert(error.message))
                          .finally(() => setBusy(''))
                      }}
                    >
                      发起复测
                    </Button>
                  }
                />
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

/* ── 测试资产 ─────────────────────────────────────────── */
export function AssetsSection({ task }: { task: Task }) {
  const [type, setType] = useState('')
  const [dsl, setDsl] = useState('')
  const [page, setPage] = useState(0)
  const key = `assets:${task.id}:${type}:${dsl}:${page}`
  const assets = useResource(key, () => tasksApi.assets(task.id, type, 50, page * 50, dsl))
  const rows = assets.data?.assets ?? []
  const total = assets.data?.total ?? rows.length
  const [busy, setBusy] = useState('')

  return (
    <div className="vx-task-stack">
      <Card
        title={`测试资产（${total}）`}
        extra={
          <div className="vx-task-inline">
            <Select
              value={type}
              onChange={(value) => {
                setType(value)
                setPage(0)
              }}
              ariaLabel="资产类型"
              options={[
                ['', '全部类型'],
                ['root_domain', '根域名'],
                ['subdomain', '子域名'],
                ['ip', 'IP'],
                ['app', '应用'],
                ['service', '服务'],
                ['endpoint', '接口']
              ]}
            />
            <Button disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
              上一页
            </Button>
            <Button disabled={(page + 1) * 50 >= total} onClick={() => setPage((value) => value + 1)}>
              下一页
            </Button>
          </div>
        }
      >
        <div className="vx-task-inline vx-task-inline--wide">
          <Field placeholder="DSL 搜索，如 domain=example AND status_code>=400" value={dsl} onChange={setDsl} onEnter={() => setPage(0)} />
          <Button onClick={() => setPage(0)}>搜索</Button>
        </div>
        {assets.loading ? (
          <Empty text="读取资产…" />
        ) : rows.length === 0 ? (
          <Empty text="该任务暂无资产" hint="任务运行时会自动把范围与资产挂上来。" />
        ) : (
          <div className="vx-task-table">
            <div className="vx-task-tr vx-task-tr--head">
              <span>资产</span>
              <span>类型</span>
              <span>ICP 备案</span>
              <span>来源</span>
              <span />
            </div>
            {rows.map((row: Asset & { display?: string; origin?: string }) => (
              <div key={row.id} className="vx-task-tr">
                <span title={row.display}>{row.display}</span>
                <span className="vx-chip vx-chip--muted">{row.type}</span>
                <span className="vx-task-dim">{row.icp || '—'}</span>
                <span className="vx-task-dim" title={row.origin}>{row.origin || '—'}</span>
                <span>
                  <Button
                    tone="danger"
                    disabled={busy === String(row.id)}
                    onClick={() => {
                      setBusy(String(row.id))
                      tasksApi
                        .detachAsset(task.id, row.id)
                        .then(assets.reload)
                        .catch((error: Error) => window.alert(error.message))
                        .finally(() => setBusy(''))
                    }}
                  >
                    移除
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ── 资产覆盖图 ───────────────────────────────────────── */
export function CoverageSection({ task }: { task: Task }) {
  const coverage = useResource(`coverage:${task.id}`, () => tasksApi.coverage(task.id))
  const graph = useResource(`coverage-graph:${task.id}`, () => tasksApi.coverageGraph(task.id))
  const nodes = graph.data?.nodes ?? []
  const groups = useMemo(() => {
    const map = new Map<string, { total: number; tested: number }>()
    for (const node of nodes) {
      const entry = map.get(node.type) ?? { total: 0, tested: 0 }
      entry.total += 1
      if (node.tested) entry.tested += 1
      map.set(node.type, entry)
    }
    return Array.from(map.entries())
  }, [nodes])
  const percent = coverage.data?.percent ?? 0

  return (
    <div className="vx-task-stack">
      <Card title="资产覆盖度" extra={<span className="vx-task-hint">按资产类型统计（粗略，仅供参考）</span>}>
        <div className="vx-task-cols">
          <KeyValue label="覆盖">{`${percent}%`}</KeyValue>
          <KeyValue label="已测 / 范围">{`${coverage.data?.tested ?? 0} / ${coverage.data?.total ?? 0}`}</KeyValue>
          <KeyValue label="节点">{nodes.length}</KeyValue>
        </div>
        <div className="vx-task-bar">
          <i style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
        </div>
        {groups.length === 0 ? (
          <Empty text="暂无覆盖数据" hint="任务运行并产出资产后，这里会按类型展开覆盖情况。" />
        ) : (
          <div className="vx-task-list">
            {groups.map(([kind, entry]) => (
              <ListItem
                key={kind}
                title={kind}
                meta={<span className="vx-task-hint">{`${entry.tested}/${entry.total}`}</span>}
                actions={
                  <span className="vx-task-mini-bar">
                    <i style={{ width: `${entry.total ? Math.round((entry.tested / entry.total) * 100) : 0}%` }} />
                  </span>
                }
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ── 拦截审批 ─────────────────────────────────────────── */
export function InterceptSection({ task }: { task: Task }) {
  const approvals = useResource(`approvals:${task.id}`, () => tasksApi.approvals(task.id, 1, 50))
  const pending = useResource(`pending:${task.id}`, () => tasksApi.pending(task.id))
  const rows = approvals.data ?? []
  const waiting = pending.data ?? []

  return (
    <div className="vx-task-stack">
      <Card
        title={`待审批（${waiting.length}）`}
        extra={
          <Button
            onClick={() => {
              pending.reload()
              approvals.reload()
            }}
          >
            刷新
          </Button>
        }
      >
        {waiting.length === 0 ? (
          <Empty text="没有待审批请求" />
        ) : (
          <div className="vx-task-list">
            {waiting.map((row) => (
              <ListItem
                key={row.id}
                title={<code>{row.tool || `审批 #${row.id}`}</code>}
                meta={<span className="vx-task-hint">{row.reason || relTime(row.created_at)}</span>}
                actions={
                  <div className="vx-task-inline">
                    <Button
                      tone="primary"
                      onClick={() => {
                        tasksApi.decide(row.id, 'allowed').then(() => {
                          pending.reload()
                          approvals.reload()
                        })
                      }}
                    >
                      允许
                    </Button>
                    <Button
                      tone="danger"
                      onClick={() => {
                        tasksApi.decide(row.id, 'denied').then(() => {
                          pending.reload()
                          approvals.reload()
                        })
                      }}
                    >
                      拒绝
                    </Button>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </Card>
      <Card title={`审批记录（${rows.length}）`}>
        {approvals.loading ? (
          <Empty text="读取记录…" />
        ) : rows.length === 0 ? (
          <Empty text="暂无审批记录" hint="规则或模型作出审批决定后，记录会出现在这里。" />
        ) : (
          <div className="vx-task-table">
            <div className="vx-task-tr vx-task-tr--head">
              <span>工具</span>
              <span>动作</span>
              <span>结果</span>
              <span>时间</span>
            </div>
            {rows.map((row) => (
              <div key={row.id} className="vx-task-tr">
                <span>
                  <code>{row.tool || `#${row.id}`}</code>
                </span>
                <span className="vx-task-dim">{row.action || '—'}</span>
                <span>
                  <span className={`vx-chip vx-chip--${row.decision === 'denied' ? 'error' : 'success'}`}>{row.decision || row.status || '—'}</span>
                </span>
                <span className="vx-task-dim">{relTime(row.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ── 报告 ─────────────────────────────────────────────── */
export function ReportSection({ task }: { task: Task }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const ref = useRef<HTMLPreElement>(null)

  const load = () => {
    setLoading(true)
    reportText(task.id)
      .then((value) => {
        setText(value)
        setError('')
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }
  useResource(`report:${task.id}`, async () => {
    load()
    return true
  })

  return (
    <div className="vx-task-stack">
      <Card
        title="渗透测试报告（Markdown）"
        extra={
          <div className="vx-task-inline">
            <Button onClick={load}>重新生成</Button>
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(text)
              }}
            >
              复制
            </Button>
            <Button
              onClick={() => {
                const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
                const href = URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = href
                link.download = `report-${task.id}.md`
                link.click()
                setTimeout(() => URL.revokeObjectURL(href), 1000)
              }}
            >
              下载
            </Button>
          </div>
        }
      >
        <ErrorLine error={error} />
        {loading ? <Empty text="生成报告…" /> : <pre className="vx-task-report" ref={ref}>{text || '（空报告）'}</pre>}
      </Card>
    </div>
  )
}
