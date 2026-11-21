// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/UI.jsx';
import { Badge } from './primitives.jsx';
import { conversations, transcripts, agentsList, profiles } from './data.js';

const toolIcon = tool => {
  if (tool === 'bash') return 'terminal';
  if (tool === 'http_request') return 'activity';
  if (tool === 'record_fact') return 'flag';
  if (tool === 'insert_assets') return 'network';
  if (tool === 'report_finding') return 'bug';
  if (tool === 'delegate_worker') return 'users';
  if (tool === 'graph_overview') return 'graph';
  if (tool === 'add_hint') return 'sparkles';
  if (tool?.startsWith('mcp__')) return 'plug';
  return 'wrench';
};

const laneOf = id => (id === 'main' ? 'mainagent' : id === 'planner' ? 'planner' : id.replace('w', 'work#'));
const laneTone = lane => (lane === 'planner' ? 'amber' : lane === 'mainagent' ? 'ink' : `w${(Number(String(lane).replace('work#', '')) - 1) % 5}`);

const initialPlan = [
  { id: 'p1', text: '确认 admin.acme.test 后台入口与指纹', done: true },
  { id: 'p2', text: '验证默认口令（只读）并写入事实', done: true },
  { id: 'p3', text: '枚举后台只读列表接口，判断角色裁剪', done: false },
  { id: 'p4', text: '等待 /api/export 审批结果', done: false },
  { id: 'p5', text: '复验 F-103 订单越权并升级结论', done: false }
];

function laneClass(id) {
  const lane = laneOf(id);
  const tone = laneTone(lane);
  return `cx-lane cx-lane-${tone}`;
}

function Step({ step, open, onToggle, approvals, decideApproval, conversation }) {
  if (step.kind === 'user') {
    return <div className="cx-msg cx-msg-user">
      <div className="cx-bubble cx-bubble-user">{step.text}</div>
      <span className="cx-avatar cx-avatar-user" aria-hidden="true">U</span>
    </div>;
  }
  if (step.kind === 'text') {
    return <div className="cx-msg cx-msg-ai">
      <span className={laneClass(conversation)} aria-hidden="true">{(laneOf(conversation) === 'mainagent' ? 'M' : laneOf(conversation) === 'planner' ? 'P' : laneOf(conversation).replace('work#', '#'))}</span>
      <div className="cx-bubble cx-bubble-ai">{step.text}</div>
    </div>;
  }
  if (step.kind === 'thinking') {
    return <details className="cx-thinking" open={false}>
      <summary><Icon name="brain" size={14} /><span>{step.label || '思考'}</span><em>折叠</em></summary>
      <p>{step.text}</p>
    </details>;
  }
  if (step.kind === 'approval') {
    const state = approvals[step.approval] || step.state;
    return <div className={`cx-approval cx-approval-${state}`}>
      <header>
        <span className="cx-approval-icon"><Icon name="shield" size={16} /></span>
        <div><b>{step.title}</b><small>{step.summary}</small></div>
        <Badge tone={state === 'approved' ? 'green' : state === 'denied' ? 'red' : 'amber'}>{state === 'approved' ? '已允许' : state === 'denied' ? '已拒绝' : '待审批'}</Badge>
      </header>
      <p>{step.reason}</p>
      {state === 'pending' ? <footer>
        <button type="button" className="cx-btn cx-btn-primary" onClick={() => decideApproval(step.approval, 'approved')}>允许一次</button>
        <button type="button" className="cx-btn" onClick={() => decideApproval(step.approval, 'approved')}>始终允许</button>
        <button type="button" className="cx-btn cx-btn-ghost" onClick={() => decideApproval(step.approval, 'denied')}>拒绝</button>
        <span className="cx-approval-note">{step.risk} · 审批范围仅限本次调用</span>
      </footer> : <footer className="cx-approval-result">
        <Icon name={state === 'approved' ? 'check' : 'ban'} size={14} />
        <span>{state === 'approved' ? '审批通过，调用已执行并写入证据链。' : '已拒绝，该调用不会执行；Agent 会改用只读路径。'}</span>
      </footer>}
    </div>;
  }
  const error = step.status === 'error';
  return <div className={`cx-toolstep ${error ? 'is-error' : ''}`}>
    <button type="button" className="cx-toolstep-h" aria-expanded={open} onClick={onToggle}>
      <span className="cx-tool-icon"><Icon name={toolIcon(step.tool)} size={15} /></span>
      <code className="cx-tool-name">{step.tool}</code>
      <span className="cx-tool-title">{step.title}</span>
      <span className="cx-tool-summary">{step.summary}</span>
      <span className="cx-tool-duration">{error ? '错误' : step.duration}</span>
      <Icon className={`cx-chevron ${open ? 'is-open' : ''}`} name="chevronRight" size={14} />
    </button>
    {open && <div className="cx-toolstep-b">
      <div>
        <span className="cx-io-label">输入</span>
        <pre className="cx-code">{typeof step.input === 'string' ? step.input : JSON.stringify(step.input, null, 2)}</pre>
      </div>
      <div>
        <span className="cx-io-label">输出</span>
        <pre className="cx-code cx-code-out">{(step.output || []).join('\n')}</pre>
      </div>
    </div>}
  </div>;
}

export default function Chat({ approvals, decideApproval, notify, theme, onToggleTheme }) {
  const [active, setActive] = useState('main');
  const [newChats, setNewChats] = useState([]);
  const [sent, setSent] = useState({});
  const [open, setOpen] = useState({ m3: true, m6: false, w32: true });
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [plan, setPlan] = useState(initialPlan);
  const [showPlan, setShowPlan] = useState(false);
  const [agent, setAgent] = useState('主 Agent');
  const [model, setModel] = useState(profiles[0].name);
  const timers = useRef([]);
  const thread = useRef(null);
  const replyCount = useRef(0);
  const painted = useRef(false);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    setPlan(initialPlan);
    setOpen({ m3: true, m6: false, w32: true });
  }, [active]);
  useEffect(() => {
    const node = thread.current;
    if (node) node.scrollTop = 0;
  }, [active]);
  useEffect(() => {
    if (!painted.current) { painted.current = true; return; }
    const node = thread.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [sent, sending]);

  const scheduled = (fn, delay) => { timers.current.push(setTimeout(fn, delay)); };

  const allChats = useMemo(() => [
    ...newChats.map(chat => ({ id: chat.id, rail: '新对话', name: chat.name, state: 'empty' })),
    ...conversations
  ], [newChats]);

  const steps = [...(transcripts[active] || []), ...(sent[active] || [])];
  const railGroups = useMemo(() => {
    const groups = new Map();
    allChats.forEach(chat => {
      if (!groups.has(chat.rail)) groups.set(chat.rail, []);
      groups.get(chat.rail).push(chat);
    });
    return [...groups.entries()];
  }, [allChats]);

  const doneCount = plan.filter(item => item.done).length;

  function startChat() {
    const id = `new-${newChats.length + 1}`;
    setNewChats(list => [...list, { id, name: `新对话 ${newChats.length + 1}` }]);
    setActive(id);
    setSent(current => ({ ...current, [id]: [] }));
    setDraft('');
    notify('已创建新的 Agent 会话（演示）');
  }

  function send(text) {
    const content = (text ?? draft).trim();
    if (!content || sending) return;
    setDraft('');
    setSending(true);
    const base = `u-${Date.now()}`;
    setSent(current => ({ ...current, [active]: [...(current[active] || []), { id: base, kind: 'user', text: content }] }));
    const lane = laneOf(active);
    const variant = replyCount.current % 2;
    replyCount.current += 1;
    scheduled(() => setSent(current => ({ ...current, [active]: [...(current[active] || []), { id: `${base}-t`, kind: 'thinking', label: '思考', text: variant === 0 ? '先读探索图确认当前前沿，再把请求拆成一条可执行的只读意图；涉及写操作会先走审批。' : '把这条输入当作新的约束提示写入探索图，然后规划下一步验证顺序。' }] })), 500);
    scheduled(() => setSent(current => ({ ...current, [active]: [...(current[active] || []), {
      id: `${base}-tool`, kind: 'tool', tool: 'graph_overview', title: '读取探索图概览', summary: '意图 12 · 事实 8 · 漏洞 4',
      input: { scope: 'task:T-2407' },
      output: ['intents: 12 (done 9, running 3)', 'facts: 8', 'findings: 4 (verified 2)', 'frontier: [i3 后台功能枚举, i5 订单越权]'],
      ...{ status: 'ok', duration: '61ms' }
    }] })), 1200);
    scheduled(() => {
      setSent(current => ({ ...current, [active]: [...(current[active] || []), {
        id: `${base}-text`, kind: 'text',
        text: variant === 0
          ? `收到。我会保留「${content.slice(0, 28)}${content.length > 28 ? '…' : ''}」这条约束：先验证只读接口的权限边界，写操作继续走审批；如果发现可复现，转独立复验会话确认。`
          : `已写入提示。下一步让 ${lane === 'planner' ? 'Worker' : '后台枚举 Worker'} 用普通账号重放菜单与列表接口，先把越权面收敛，再谈导出。`
      }] }));
      setSending(false);
    }, 2200);
  }

  function stopStreaming() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setSending(false);
    notify('已停止生成（演示不会中断真实任务）');
  }

  const isNew = active.startsWith('new-');

  return <div className="cx-chat">
    <aside className="cx-chat-rail" aria-label="会话列表">
      <button type="button" className="cx-new-chat" onClick={startChat}><Icon name="plus" size={15} />新建对话</button>
      <div className="cx-rail-list">
        {railGroups.map(([group, items]) => <div className="cx-rail-group" key={group}>
          <p className="cx-rail-title">{group === 'Workers' ? <><Icon name="users" size={12} />Workers</> : group === '新对话' ? '新对话' : <><Icon name={group === '主 Agent' ? 'bot' : 'brain'} size={12} />{group}</>}</p>
          {items.map(chat => <button key={chat.id} type="button" className={`cx-rail-item ${active === chat.id ? 'is-active' : ''}`} onClick={() => setActive(chat.id)}>
            <span className={`cx-state cx-state-${chat.state || 'done'}`} aria-hidden="true" />
            <span className="cx-rail-name">{chat.name}</span>
            {chat.state === 'live' && <em>实时</em>}
          </button>)}
        </div>)}
      </div>
      <p className="cx-rail-foot">演示会话 · 不会连接真实模型</p>
    </aside>

    <section className="cx-thread-wrap">
      <header className="cx-thread-h">
        <div>
          <b>{allChats.find(chat => chat.id === active)?.name || '主 Agent · 编排会话'}</b>
          <small>{isNew ? '新会话 · 等待输入' : '主 Agent · 编排会话'}</small>
        </div>
        <div className="cx-thread-actions">
          <div className="cx-plan-wrap">
            <button type="button" className="cx-btn cx-btn-ghost" aria-expanded={showPlan} onClick={() => setShowPlan(value => !value)}>
              <Icon name="list" size={14} />待办 {doneCount}/{plan.length}
            </button>
            {showPlan && <div className="cx-popover cx-plan-pop">
              <p className="cx-pop-title">本轮计划 · 跨轮共享</p>
              {plan.map(item => <label key={item.id} className="cx-plan-item">
                <input type="checkbox" checked={item.done} onChange={() => setPlan(list => list.map(entry => entry.id === item.id ? { ...entry, done: !entry.done } : entry))} />
                <span className={item.done ? 'is-done' : ''}>{item.text}</span>
              </label>)}
              <p className="cx-pop-foot">勾选只改变演示状态；真实待办由 Planner 维护。</p>
            </div>}
          </div>
          <Badge tone="green" dot>可交互</Badge>
          <button type="button" className="cx-icon-btn" aria-label="切换界面外观" onClick={onToggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /></button>
        </div>
      </header>

      <div className="cx-thread" ref={thread}>
        {steps.length === 0 ? <div className="cx-chat-empty">
          <span className="cx-chat-empty-icon"><Icon name="bot" size={26} /></span>
          <h3>开始和「Agent」对话</h3>
          <p>描述目标与范围，Agent 会把任务拆成意图、调用工具、把事实写回探索图。<br />演示环境不会发出任何网络请求。</p>
          <div className="cx-suggestions">
            {['对 acme.test 做只读资产梳理', '检查后台接口的角色校验', '把 F-103 转成复验会话', '生成本轮探索摘要'].map(text => <button key={text} type="button" onClick={() => setDraft(text)}>{text}<Icon name="chevronRight" size={12} /></button>)}
          </div>
        </div> : steps.map(step => <Step
          key={step.id}
          step={step.kind === 'approval' ? { ...step, approval: step.approval || 'AP-88' } : step}
          conversation={active}
          approvals={approvals}
          decideApproval={decideApproval}
          open={Boolean(open[step.id])}
          onToggle={() => setOpen(map => ({ ...map, [step.id]: !map[step.id] }))}
        />)}
        {sending && <div className="cx-typing" aria-live="polite"><span /><span /><span />Agent 正在生成</div>}
      </div>

      <footer className="cx-composer">
        <div className="cx-composer-top">
          <label className="cx-select-wrap">
            <span>选择 Agent</span>
            <select value={agent} onChange={event => setAgent(event.target.value)} aria-label="选择 Agent">
              {agentsList.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
            <Icon name="chevronDown" size={12} />
          </label>
          <label className="cx-select-wrap">
            <span>模型</span>
            <select value={model} onChange={event => setModel(event.target.value)} aria-label="选择模型">
              {profiles.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
              <option value="DeepSeek V4">DeepSeek V4</option>
            </select>
            <Icon name="chevronDown" size={12} />
          </label>
          <span className="cx-composer-hint">Enter 发送 · Shift+Enter 换行</span>
        </div>
        <div className="cx-composer-input">
          <button type="button" className="cx-icon-btn" aria-label="添加附件" onClick={() => notify('附件上传在演示中不落地')}><Icon name="paperclip" size={16} /></button>
          <textarea
            rows={1}
            value={draft}
            placeholder="给「Agent」发消息，描述目标或补充约束…"
            aria-label="消息输入"
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }}
          />
          {sending
            ? <button type="button" className="cx-send is-stop" aria-label="停止生成" onClick={stopStreaming}><Icon name="stop" size={16} /></button>
            : <button type="button" className="cx-send" aria-label="发送" disabled={!draft.trim()} onClick={() => send()}><Icon name="arrowUp" size={16} /></button>}
        </div>
        <p className="cx-composer-foot"><Icon name="shield" size={12} /> 默认（Claude Opus 4.8）· 工具调用受拦截规则约束 · 演示数据</p>
      </footer>
    </section>
  </div>;
}
