// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useMemo, useState } from 'react';
import { Icon } from '../components/UI.tsx';
import { Badge, Chips, DataTable, EmptyState, KV, Panel, Tabs, Toggle } from './primitives.tsx';
import { agentsList, approvals, assetScopes, interceptRules, logs, mcpServers, notifyChannels, profiles, skillsList, toolCatalog } from './data.ts';
import type { AgentRow, ApprovalRow, ApprovalState, AssetScope, AssetScopeMode, InterceptRule, LogRow, McpServer, ModelProfile, NotifyChannel, SkillRow, ToolPolicy, ToolSpec } from './data.ts';

// Toast sink handed down by Console.tsx.
type Notify = (message: string) => void;
// Approval decisions this screen can write: approved / denied.
type Decision = 'approved' | 'denied';

// Local shapes: the demo rows come typed from data.ts, only form drafts and the
// settings panel state are declared here.
type InterceptDraft = { name: string; pattern: string; action: ToolPolicy };
type SettingsForm = { workers: number; maxRounds: number; proxy: string; autoUpdate: boolean; telemetry: boolean; desktopNotify: boolean; requireApproval: boolean };

type ViewHeadProps = {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
};

function ViewHead({ eyebrow, title, sub, actions }: ViewHeadProps) {
  return <div className="cx-view-head">
    <div>{eyebrow && <span className="cx-eyebrow">{eyebrow}</span>}<h1>{title}</h1>{sub && <p>{sub}</p>}</div>
    {actions && <div className="cx-view-actions">{actions}</div>}
  </div>;
}

/* ------------------------------- LLM ------------------------------- */
type LlmProps = { notify: Notify };

export function Llm({ notify }: LlmProps) {
  const [rows, setRows] = useState<ModelProfile[]>(profiles);
  const setDefault = (id: string) => {
    setRows(list => list.map(row => ({ ...row, default: row.id === id })));
    notify(`已将「${rows.find(row => row.id === id)!.name}」设为默认 profile`);
  };
  return <div className="cx-view">
    <ViewHead eyebrow="LLM" title="模型配置由 Go 服务端持有" sub="界面只显示 profile 名称；上游地址与密钥不进入浏览器。" />
    <div className="cx-cards-3">
      {rows.map(row => <Panel key={row.id} title={row.name} sub={`${row.provider} · ${row.model}`} actions={row.default ? <Badge tone="green" dot>默认</Badge> : <button type="button" className="cx-link" onClick={() => setDefault(row.id)}>设为默认</button>}>
        <div className="cx-kv-grid">
          <KV k="状态" v={row.state} />
          <KV k="故障转移链" v={row.chain.length ? row.chain.join(' → ') : '未配置'} />
        </div>
        <div className="cx-chip-row">{row.default ? <Badge tone="blue">任务默认</Badge> : <Badge tone="slate">可选</Badge>}<Badge tone="slate">{row.provider}</Badge></div>
      </Panel>)}
    </div>
    <div className="cx-grid-2">
      <Panel title="Provider 复用与故障转移" sub="来源：server/llmpool.go">
        <ul className="cx-bullets">
          <li>同一 profile 复用 Provider 与限流器，保存、激活或绑定变更时按代际失效。</li>
          <li>可选故障转移链；链上 Provider 共享熔断状态，避免重复打满上游。</li>
          <li>模型网关仅监听回环地址，用每次启动生成的一次性 token 鉴权。</li>
        </ul>
      </Panel>
      <Panel title="配置边界" sub="界面不保存第二份模型目录">
        <ul className="cx-bullets">
          <li>客户端不持有上游 base URL 与 API key，推理请求全部经过 Go 网关。</li>
          <li>用量与失败原因由服务端记录，界面展示的是同一份账本。</li>
          <li>新增 Provider 需要服务端配置与测试覆盖，界面表单只做选择与排序。</li>
        </ul>
      </Panel>
    </div>
  </div>;
}

/* ------------------------------ Agent ------------------------------ */
type AgentsProps = { notify: Notify };

export function Agents({ notify }: AgentsProps) {
  const [rows, setRows] = useState<AgentRow[]>(agentsList);
  const [active, setActive] = useState(agentsList[0].id);
  const item = rows.find(row => row.id === active)!;
  return <div className="cx-view">
    <ViewHead eyebrow="Agent" title="Agent 装配与工具可见性" sub="每个 Agent 有自己的模型、工具、Skill 与审查范围；可见不等于已解锁。" />
    <div className="cx-split">
      <Panel title="Agent" sub={`${rows.length} 个装配`} bodyClass="cx-tight">
        <div className="cx-agent-list">
          {rows.map(row => <button type="button" key={row.id} className={`cx-agent-row ${active === row.id ? 'is-active' : ''}`} onClick={() => setActive(row.id)}>
            <span className="cx-agent-icon"><Icon name={row.id === 'planner' ? 'brain' : row.id === 'verifier' ? 'shield' : row.id === 'worker' ? 'users' : 'bot'} size={15} /></span>
            <span><b>{row.name}</b><small>{row.role} · {row.model}</small></span>
            <Badge tone={row.enabled ? 'green' : 'slate'}>{row.enabled ? '启用' : '停用'}</Badge>
          </button>)}
        </div>
      </Panel>
      <Panel title={item.name} sub={item.note} actions={<Toggle label="启用该 Agent" checked={item.enabled} onChange={value => { setRows(list => list.map(row => row.id === item.id ? { ...row, enabled: value } : row)); notify(`${item.name} 已${value ? '启用' : '停用'}（演示）`); }} />}>
        <div className="cx-kv-grid">
          <KV k="角色" v={item.role} />
          <KV k="模型" v={item.model} />
          <KV k="工具" v={String(item.tools.length)} />
          <KV k="Skill" v={item.skills.join(' · ')} />
        </div>
        <p className="cx-subhead">工具装配</p>
        <div className="cx-chip-row">{item.tools.map(tool => <code key={tool} className="cx-tool-chip">{tool}</code>)}</div>
        <p className="cx-subhead">审查范围</p>
        <p className="cx-note">进入 Guard 范围的工具会匹配拦截规则；未命中时可调用审查模型。allow / deny / ask 由配置决定，不是固定行为。</p>
      </Panel>
    </div>
  </div>;
}

/* ------------------------------- MCP ------------------------------- */
type McpProps = { notify: Notify };

export function Mcp({ notify }: McpProps) {
  const [rows, setRows] = useState<McpServer[]>(mcpServers);
  const discover = (id: string) => {
    setRows(list => list.map(row => row.id === id ? { ...row, state: '已连接', tools: row.tools + 1, latency: '14ms' } : row));
    notify('重新执行 tools/list，目录已刷新（演示 +1）');
  };
  return <div className="cx-view">
    <ViewHead eyebrow="MCP" title="扩展工具目录" sub="连接 MCP 执行 tools/list 后把名称与描述持久化；界面可离线展示目录。" />
    <div className="cx-cards-3">
      {rows.map(row => <Panel key={row.id} title={row.name} sub={`${row.transport} · 工具 ${row.tools}`} actions={<Badge tone={row.state === '已连接' ? 'green' : 'slate'}>{row.state}</Badge>}>
        <div className="cx-kv-grid">
          <KV k="地址" v={row.url} mono />
          <KV k="延迟" v={row.latency} />
        </div>
        <button type="button" className="cx-btn" onClick={() => discover(row.id)}><Icon name="refresh" size={13} />重新发现</button>
      </Panel>)}
    </div>
    <Panel title="延迟发现" sub="deferred tools">
      <ul className="cx-bullets">
        <li>MCP 工具的 Schema 可以延迟暴露，减少首轮上下文体积。</li>
        <li>Skill 加载与会话恢复维护解锁集合；可见的工具名不等同于调用权限。</li>
        <li>连接失败以工具错误返回，任务继续；重新发现是显式操作。</li>
      </ul>
    </Panel>
  </div>;
}

/* ------------------------------ Skill ------------------------------ */
type SkillsProps = { notify: Notify };

export function Skills({ notify }: SkillsProps) {
  const [rows, setRows] = useState<SkillRow[]>(skillsList);
  return <div className="cx-view">
    <ViewHead eyebrow="Skill" title="可解锁的能力包" sub="Skill 提供执行套路与提示，不绕过工具审查。" />
    <Panel title="Skill 目录" sub={`${rows.filter(row => row.unlocked).length} / ${rows.length} 已解锁`} bodyClass="cx-tight">
      <div className="cx-skill-list">
        {rows.map(row => <div key={row.id} className="cx-skill-row">
          <span className="cx-agent-icon"><Icon name="sparkles" size={15} /></span>
          <div><b>{row.name}</b><small>{row.note}</small></div>
          <Badge tone="slate">{row.kind}</Badge>
          <Toggle label={row.unlocked ? '已解锁' : '未解锁'} checked={row.unlocked} onChange={value => { setRows(list => list.map(item => item.id === row.id ? { ...item, unlocked: value } : item)); notify(`${row.name} ${value ? '已解锁' : '已收回'}`); }} />
        </div>)}
      </div>
    </Panel>
  </div>;
}

/* ------------------------------- 工具 ------------------------------- */
type ToolsProps = { notify: Notify };

export function Tools({ notify }: ToolsProps) {
  const [rows, setRows] = useState<ToolSpec[]>(toolCatalog);
  const counts = useMemo<Record<string, number>>(() => rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.policy]: (acc[row.policy] || 0) + 1 }), {}), [rows]);
  return <div className="cx-view">
    <ViewHead eyebrow="工具" title="工具目录与审批策略" sub="每个工具的策略决定调用是直接放行、进入审批，还是被拦截。" />
    <div className="cx-stats cx-stats-3">
      {[['allow 直接放行', counts.allow || 0, 'green'], ['ask 需要审批', counts.ask || 0, 'amber'], ['deny 拦截', counts.deny || 0, 'red']].map(([label, value, tone]) => <div key={label} className={`cx-stat cx-tone-${tone}`}><div className="cx-stat-top"><span>{label}</span><Icon name="shield" size={15} /></div><strong>{value}</strong><small>共 {rows.length} 个工具</small></div>)}
    </div>
    <Panel title="工具列表" sub="修改策略只影响本演示" bodyClass="cx-tight">
      <div className="cx-tool-table">
        <div className="cx-tr cx-th"><span>工具</span><span>来源</span><span>说明</span><span>策略</span></div>
        {rows.map(row => <div key={row.id} className="cx-tr">
          <span><code>{row.name}</code></span>
          <span>{row.source}</span>
          <span className="cx-muted">{row.note}</span>
          <span>
            <select className="cx-select" value={row.policy} aria-label={`${row.name} 策略`} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => { const value = event.target.value as ToolPolicy; setRows(list => list.map(item => item.id === row.id ? { ...item, policy: value } : item)); notify(`${row.name} 策略改为 ${value}`); }}>
              <option value="allow">allow</option>
              <option value="ask">ask</option>
              <option value="deny">deny</option>
            </select>
          </span>
        </div>)}
      </div>
    </Panel>
  </div>;
}

/* ------------------------------ 通知推送 ------------------------------ */
type NotifyViewProps = { notify: Notify };

export function Notify({ notify }: NotifyViewProps) {
  const [rows, setRows] = useState<NotifyChannel[]>(notifyChannels);
  return <div className="cx-view">
    <ViewHead eyebrow="通知推送" title="关键事件推送到团队渠道" sub="任务暂停、发现确认与审批待处理可以走不同渠道。" />
    <div className="cx-cards-3">
      {rows.map(row => <Panel key={row.id} title={row.name} sub={row.kind} actions={<Toggle label="启用" checked={row.enabled} onChange={value => setRows(list => list.map(item => item.id === row.id ? { ...item, enabled: value } : item))} />}>
        <p className="cx-note">{row.note}</p>
        <button type="button" className="cx-btn" disabled={!row.enabled} onClick={() => notify(`${row.name} 测试消息已发送（演示）`)}><Icon name="bell" size={13} />发送测试</button>
      </Panel>)}
    </div>
    <Panel title="推送范围" sub="按事件类型订阅">
      <div className="cx-chip-row">{['task.paused', 'task.completed', 'finding.verified', 'approval.pending', 'llm.quota', 'update.available'].map(event => <code key={event} className="cx-tool-chip">{event}</code>)}</div>
    </Panel>
  </div>;
}

/* ------------------------------ 拦截规则 ------------------------------ */
type InterceptProps = { notify: Notify };

export function Intercept({ notify }: InterceptProps) {
  const [rows, setRows] = useState<InterceptRule[]>(interceptRules);
  const [draft, setDraft] = useState<InterceptDraft>({ name: '', pattern: '', action: 'ask' });
  const add = () => {
    if (!draft.name.trim() || !draft.pattern.trim()) return;
    setRows(list => [...list, { id: `ir-${list.length + 1}`, name: draft.name, pattern: draft.pattern, action: draft.action, enabled: true, hits: 0 }]);
    notify('已新增拦截规则（演示）');
    setDraft({ name: '', pattern: '', action: 'ask' });
  };
  return <div className="cx-view">
    <ViewHead eyebrow="拦截规则" title="进入执行前的规则审查" sub="规则命中后按 allow / deny / ask 分支处理；未命中的调用交给工具本身。" />
    <div className="cx-grid-2">
      <Panel title="规则" sub={`${rows.filter(row => row.enabled).length} / ${rows.length} 已启用`} bodyClass="cx-tight">
        <div className="cx-rule-list">
          {rows.map(row => <div key={row.id} className="cx-rule-row">
            <div><b>{row.name}</b><code>{row.pattern}</code><small>{row.hits} 次命中 · 动作 {row.action}</small></div>
            <Toggle label="启用" checked={row.enabled} onChange={value => setRows(list => list.map(item => item.id === row.id ? { ...item, enabled: value } : item))} />
          </div>)}
        </div>
      </Panel>
      <Panel title="新增规则" sub="演示表单不会保存到磁盘">
        <div className="cx-form">
          <label className="cx-field"><span>名称</span><input value={draft.name} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, name: event.target.value })} placeholder="例如：导出接口需审批" /></label>
          <label className="cx-field"><span>匹配表达式</span><input value={draft.pattern} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, pattern: event.target.value })} placeholder="method = POST and path ^/api/export" /></label>
          <label className="cx-field"><span>动作</span>
            <select value={draft.action} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setDraft({ ...draft, action: event.target.value as ToolPolicy })}>
              <option value="ask">ask · 创建审批</option>
              <option value="deny">deny · 直接拒绝</option>
              <option value="allow">allow · 放行并记录</option>
            </select>
          </label>
          <button type="button" className="cx-btn cx-btn-primary" onClick={add} disabled={!draft.name.trim() || !draft.pattern.trim()}><Icon name="plus" size={14} />添加规则</button>
        </div>
      </Panel>
    </div>
  </div>;
}

/* ------------------------------ 资产拦截 ------------------------------ */
export function AssetIntercept() {
  const [rows, setRows] = useState<AssetScope[]>(assetScopes);
  return <div className="cx-view">
    <ViewHead eyebrow="资产拦截" title="按资产定义可测范围" sub="资产拦截先于工具调用：不在范围内的目标即使工具可用也不会被执行。" />
    <Panel title="作用域" sub={`${rows.filter(row => row.enabled).length} 条生效`} bodyClass="cx-tight">
      <div className="cx-scope-list">
        {rows.map(row => <div key={row.id} className="cx-scope-row">
          <div><b>{row.target}</b><small>{row.note}</small></div>
          <select className="cx-select" value={row.mode} aria-label={`${row.target} 模式`} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setRows(list => list.map(item => item.id === row.id ? { ...item, mode: event.target.value as AssetScopeMode } : item))}>
            <option value="允许">允许</option><option value="只读">只读</option><option value="拦截">拦截</option>
          </select>
          <Toggle label="启用" checked={row.enabled} onChange={value => setRows(list => list.map(item => item.id === row.id ? { ...item, enabled: value } : item))} />
        </div>)}
      </div>
    </Panel>
    <Panel title="为什么需要两层拦截" sub="资产拦截 + 工具审查">
      <ul className="cx-bullets">
        <li>资产拦截回答「能不能碰这个目标」，工具审查回答「这次调用要不要人确认」。</li>
        <li>两层都记录事件：被拦截的调用可以在审批记录与日志里追溯。</li>
        <li>规则随任务保存；跨任务共享的资产不自动扩大测试范围。</li>
      </ul>
    </Panel>
  </div>;
}

/* ------------------------------ 审批记录 ------------------------------ */
type ApprovalsProps = {
  decisions: Record<string, ApprovalState>;
  decide: (id: string, state: Decision) => void;
  notify: Notify;
};

export function Approvals({ decisions, decide, notify }: ApprovalsProps) {
  const stateOf = (row: ApprovalRow) => decisions[row.id] || row.state;
  const pending = approvals.filter(row => stateOf(row) === 'pending');
  const history = approvals.filter(row => stateOf(row) !== 'pending');
  return <div className="cx-view">
    <ViewHead eyebrow="审批记录" title="人工介入的执行记录" sub="ask 分支创建的审批等待人确认；超时或任务取消时不继续执行。" actions={<Badge tone={pending.length ? 'amber' : 'green'} dot>{pending.length} 个待处理</Badge>} />
    <Panel title="待处理" sub="批准或拒绝会立即改变当前演示状态" bodyClass="cx-tight">
      {pending.length ? <div className="cx-approval-list">
        {pending.map(row => <div key={row.id} className="cx-approval-row">
          <div className="cx-approval-row-h"><Badge tone="amber">待审批</Badge><b>{row.id}</b><code>{row.tool}</code><span>{row.time}</span></div>
          <p>{row.target}</p>
          <div className="cx-approval-row-f">
            <span>{row.reason} · {row.risk}</span>
            <div>
              <button type="button" className="cx-btn cx-btn-primary" onClick={() => { decide(row.id, 'approved'); notify(`${row.id} 已批准（演示）`); }}><Icon name="check" size={13} />批准</button>
              <button type="button" className="cx-btn cx-btn-ghost" onClick={() => { decide(row.id, 'denied'); notify(`${row.id} 已拒绝（演示）`); }}><Icon name="ban" size={13} />拒绝</button>
            </div>
          </div>
        </div>)}
      </div> : <EmptyState icon="check" text="没有待处理审批。Agent 的 ask 调用会出现在这里。" />}
    </Panel>
    <Panel title="历史" sub={`${history.length} 条`} bodyClass="cx-tight">
      <DataTable dense rows={history} columns={[
        { key: 'id', title: '编号', width: '74px', mono: true },
        { key: 'target', title: '调用' },
        { key: 'agent', title: 'Agent', width: '94px' },
        { key: 'risk', title: '风险', width: '88px' },
        { key: 'state', title: '结果', width: '72px', render: row => <Badge tone={stateOf(row) === 'approved' ? 'green' : 'red'}>{stateOf(row) === 'approved' ? '已允许' : '已拒绝'}</Badge> },
        { key: 'time', title: '时间', width: '66px', align: 'right' }
      ]} />
    </Panel>
  </div>;
}

/* ------------------------------- 日志 ------------------------------- */
export function Logs() {
  const [level, setLevel] = useState('全部');
  const [query, setQuery] = useState('');
  const rows: LogRow[] = logs.filter(row => (level === '全部' || row.level === level) && `${row.source} ${row.text}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="cx-view">
    <ViewHead eyebrow="日志" title="服务端事件流" sub="任务、工具审查、模型重试与存储写入的同一份日志。" />
    <div className="cx-filterbar">
      <Chips items={['全部', 'INFO', 'WARN', 'ERROR']} value={level} onChange={setLevel} label="日志级别" />
      <label className="cx-search"><Icon name="search" size={14} /><input value={query} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="搜索来源或内容" aria-label="搜索日志" /></label>
      <span className="cx-filter-note">{rows.length} / {logs.length} 条</span>
    </div>
    <Panel title="日志流" bodyClass="cx-tight">
      <div className="cx-loglist">
        {rows.map(row => <div key={row.id} className={`cx-log cx-log-${row.level.toLowerCase()}`}>
          <time>{row.time}</time><Badge tone={row.level === 'ERROR' ? 'red' : row.level === 'WARN' ? 'amber' : 'slate'}>{row.level}</Badge><code>{row.source}</code><span>{row.text}</span>
        </div>)}
        {!rows.length && <EmptyState text="没有匹配的日志。" />}
      </div>
    </Panel>
  </div>;
}

/* ------------------------------ 系统配置 ------------------------------ */
type SettingsProps = { notify: Notify };

export function Settings({ notify }: SettingsProps) {
  const [tab, setTab] = useState('general');
  const [form, setForm] = useState<SettingsForm>({ workers: 3, maxRounds: 24, proxy: 'http://127.0.0.1:8083', autoUpdate: true, telemetry: false, desktopNotify: true, requireApproval: true });
  const set = <Key extends keyof SettingsForm>(key: Key, value: SettingsForm[Key]) => setForm(current => ({ ...current, [key]: value }));
  return <div className="cx-view">
    <ViewHead eyebrow="系统配置" title="运行参数与安全开关" sub="配置保存在服务端；界面只提交变更。演示表单不会写出任何文件。" actions={<button type="button" className="cx-btn cx-btn-primary" onClick={() => notify('配置已保存（演示，不落盘）')}><Icon name="check" size={14} />保存配置</button>} />
    <Panel title="配置" sub="3 组参数">
      <Tabs items={[['general', '常规'], ['security', '安全'], ['update', '更新']]} value={tab} onChange={setTab} label="配置分类" />
      <div className="cx-tab-body">
        {tab === 'general' && <div className="cx-form cx-form-2">
          <label className="cx-field"><span>并行 Worker 数</span><input type="number" min="1" max="8" value={form.workers} onChange={(event: React.ChangeEvent<HTMLInputElement>) => set('workers', Number(event.target.value))} /><small>超过上游配额时会排队等待。</small></label>
          <label className="cx-field"><span>单任务最大规划轮次</span><input type="number" min="1" max="100" value={form.maxRounds} onChange={(event: React.ChangeEvent<HTMLInputElement>) => set('maxRounds', Number(event.target.value))} /><small>达到上限后任务暂停，可手动恢复。</small></label>
          <label className="cx-field"><span>记录型代理</span><input value={form.proxy} onChange={(event: React.ChangeEvent<HTMLInputElement>) => set('proxy', event.target.value)} /><small>工具流量经代理落证据，凭据落盘前脱敏。</small></label>
          <div className="cx-field"><span>桌面通知</span><Toggle label="允许浏览器通知" checked={form.desktopNotify} onChange={value => set('desktopNotify', value)} /></div>
        </div>}
        {tab === 'security' && <div className="cx-form cx-form-2">
          <div className="cx-field"><span>默认审批策略</span><Toggle label="未命中的写操作需要审批" checked={form.requireApproval} onChange={value => set('requireApproval', value)} /></div>
          <div className="cx-field"><span>遥测</span><Toggle label="发送匿名运行指标" checked={form.telemetry} onChange={value => set('telemetry', value)} /></div>
          <div className="cx-field"><span>会话</span><p className="cx-note">JWT 有效期 7 天；密钥保存在数据目录之外，安装时生成。</p></div>
        </div>}
        {tab === 'update' && <div className="cx-form cx-form-2">
          <div className="cx-field"><span>自动更新</span><Toggle label="检查到新版本时提示" checked={form.autoUpdate} onChange={value => set('autoUpdate', value)} /></div>
          <div className="cx-field"><span>版本</span><p className="cx-note">当前 v1.0.0 · 最近检查 2026-07-25 20:31 · release feed 暂不可达（2 分钟 TTL 后重试）。</p></div>
        </div>}
      </div>
    </Panel>
  </div>;
}
