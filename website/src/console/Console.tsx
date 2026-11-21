// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/UI.tsx';
import { Badge, Modal } from './primitives.tsx';
import { consoleNav, viewLabels } from './nav.ts';
import { approvals as approvalRows, conversations, tasks as taskSeed } from './data.ts';
import type { ApprovalState, TaskRow } from './data.ts';
import Chat from './Chat.tsx';
import Dashboard from './Dashboard.tsx';
import { Assets, Commands, Findings, LlmRecords, Sync, Tasks, Traffic, Workspace } from './Work.tsx';
import { Agents, Approvals, AssetIntercept, Intercept, Llm, Logs, Mcp, Notify as NotifyView, Settings, Skills, Tools } from './Systems.tsx';

// Demo fixtures and navigation metadata live in data.ts / nav.ts (typed by the
// modules that own them). Only the shell's own UI state is declared here.
type Toast = { id: string; message: string };
type PaletteItem = { id: string; label: string; hint: string; icon: string; action: () => void };
type NewTaskDraft = { target: string; template: string; profile: string };

interface AgentConsoleProps {
  initialView?: string;
  className?: string;
  mode?: string;
}

// Buttons elsewhere hand back plain strings; keep the stored decision inside the
// demo's own vocabulary instead of widening the record to `string`.
const approvalStates: readonly ApprovalState[] = ['pending', 'approved', 'denied'];
const toApprovalState = (value: unknown): ApprovalState => approvalStates.find(state => state === value) ?? 'pending';

const initialApprovals = (): Record<string, ApprovalState> =>
  approvalRows.reduce<Record<string, ApprovalState>>((map, row) => ({ ...map, [row.id]: row.state }), {});

export default function AgentConsole({ initialView = 'chat', className = '', mode = 'embed' }: AgentConsoleProps) {
  const client = mode === 'client';
  const [view, setView] = useState(initialView);
  const [collapsed, setCollapsed] = useState(false);
  const [palette, setPalette] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, ApprovalState>>(initialApprovals);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [rows, setRows] = useState<TaskRow[]>(taskSeed);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTask, setNewTask] = useState<NewTaskDraft>({ target: 'shop.acme.test', template: '外部渗透', profile: '默认（Claude Opus 4.8）' });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const paletteInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (palette) {
      const timer = setTimeout(() => paletteInput.current?.focus(), 20);
      return () => clearTimeout(timer);
    }
  }, [palette]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') { event.preventDefault(); setPalette(value => !value); }
      if (event.key === 'Escape') setPalette(false);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  const notify = (message: string) => {
    const id = `t-${Math.random().toString(36).slice(2, 8)}`;
    setToasts(list => [...list, { id, message }]);
    timers.current.push(setTimeout(() => setToasts(list => list.filter(item => item.id !== id)), 2800));
  };

  const decide = (id: string, state: string) => setDecisions(map => ({ ...map, [id]: toApprovalState(state) }));
  const pendingCount = Object.values(decisions).filter(state => state === 'pending').length;

  const go = (next?: string): void => {
    if (!next) return;
    setView(next);
    setNavOpen(false);
    setPalette(false);
  };

  const paletteItems = useMemo<PaletteItem[]>(() => {
    const navItems = consoleNav.flatMap(group => group.items.map(item => ({ id: `nav-${item.id}`, label: item.label, hint: group.label, icon: item.icon, action: () => go(item.id) })));
    const chats = conversations.map(chat => ({ id: `conv-${chat.id}`, label: chat.name, hint: '对话', icon: 'chat', action: () => go('chat') }));
    const query = paletteQuery.trim().toLowerCase();
    return [...navItems, ...chats].filter(item => !query || `${item.label} ${item.hint}`.toLowerCase().includes(query)).slice(0, 9);
  }, [paletteQuery]);

  function createTask() {
    const target = newTask.target.trim() || 'acme.test';
    const id = `T-${2400 + rows.length + 1}`;
    setRows(list => [{ id, name: `${target} ${newTask.template}`, category: newTask.template, status: '探索中', profile: newTask.profile, intents: 0, facts: 0, findings: 0, assets: 0, elapsed: '0m', created: '刚刚' }, ...list]);
    setCreateOpen(false);
    setView('tasks');
    notify(`任务 ${id} 已创建（演示，不会执行）`);
  }

  const content: React.ReactNode = (() => {
    switch (view) {
      case 'dashboard': return <Dashboard onNavigate={go} onCreateTask={() => setCreateOpen(true)} notify={notify} />;
      case 'chat': return <Chat approvals={decisions} decideApproval={decide} notify={notify} />;
      case 'tasks': return <Tasks rows={rows} setRows={setRows} notify={notify} onCreateTask={() => setCreateOpen(true)} />;
      case 'findings': return <Findings notify={notify} />;
      case 'traffic': return <Traffic />;
      case 'commands': return <Commands />;
      case 'llm-records': return <LlmRecords />;
      case 'assets': return <Assets notify={notify} />;
      case 'sync': return <Sync notify={notify} />;
      case 'workspace': return <Workspace />;
      case 'llm': return <Llm notify={notify} />;
      case 'agents': return <Agents notify={notify} />;
      case 'mcp': return <Mcp notify={notify} />;
      case 'skills': return <Skills notify={notify} />;
      case 'tools': return <Tools notify={notify} />;
      case 'notify': return <NotifyView notify={notify} />;
      case 'intercept': return <Intercept notify={notify} />;
      case 'asset-intercept': return <AssetIntercept />;
      case 'approvals': return <Approvals decisions={decisions} decide={decide} notify={notify} />;
      case 'logs': return <Logs />;
      case 'settings': return <Settings notify={notify} />;
      default: return <Dashboard onNavigate={go} onCreateTask={() => setCreateOpen(true)} notify={notify} />;
    }
  })();

  return <div className={`cx-window ${client ? 'is-client' : ''} ${className}`}>
    {client ? <div className="cx-titlebar">
      <span className="cx-lights" aria-hidden="true"><i /><i /><i /></span>
      <span className="cx-app"><img src="assets/logo.png" width="15" height="15" alt="" /><b>VEXNAR</b><em>v1.0.0</em></span>
      <span className="cx-title-task">T-2407 · acme.test 外部渗透</span>
      <span className="cx-title-right">
        <span className="cx-conn"><i aria-hidden="true" />本地 · 127.0.0.1:8088</span>
        <span className="cx-title-chip">演示数据</span>
        <a className="cx-exit" href="index.html" aria-label="返回官网" title="返回官网"><Icon name="external" size={12} /><span>返回官网</span></a>
      </span>
    </div> : <div className="cx-chrome">
      <span className="cx-lights" aria-hidden="true"><i /><i /><i /></span>
      <span className="cx-url"><Icon name="lock" size={12} />app.vexnar.local/{view}</span>
      <span className="cx-chrome-meta"><Badge tone="slate">演示环境</Badge><span className="cx-chrome-note">本地快照 · 不执行真实任务</span></span>
    </div>}
    <div className={`cx ${collapsed ? 'is-collapsed' : ''}`}>
      <button type="button" className="cx-mobile-nav" aria-label="打开导航" aria-expanded={navOpen} onClick={() => setNavOpen(value => !value)}><Icon name="menu" size={16} /></button>
      <aside className={`cx-side ${navOpen ? 'is-open' : ''}`} aria-label="控制台导航">
        <div className="cx-brand">
          <img src="assets/logo.png" width="26" height="26" alt="" />
          {!collapsed && <span>VEXNAR</span>}
          <button type="button" className="cx-icon-btn cx-collapse" aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'} onClick={() => setCollapsed(value => !value)}><Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={14} /></button>
        </div>
        <nav className="cx-nav">
          {consoleNav.map(group => <div key={group.label} className="cx-nav-group">
            {!collapsed && <p>{group.label}</p>}
            {group.items.map(item => <button key={item.id} type="button" className={`cx-nav-item ${view === item.id ? 'is-active' : ''}`} aria-current={view === item.id ? 'true' : undefined} title={item.label} onClick={() => go(item.id)}>
              <Icon name={item.icon} size={16} />
              {!collapsed && <span>{item.label}</span>}
              {item.badge === 'approvals' && pendingCount > 0 && <em className="cx-nav-badge">{pendingCount}</em>}
            </button>)}
          </div>)}
        </nav>
        <div className="cx-side-foot">
          <span className="cx-avatar" aria-hidden="true">X</span>
          {!collapsed && <div><b>xuzhongxin</b><small>管理员</small></div>}
          {!collapsed && <button type="button" className="cx-icon-btn" aria-label="账户菜单" onClick={() => notify('账户菜单为演示占位')}><Icon name="more" size={14} /></button>}
        </div>
      </aside>

      <div className="cx-shell">
        <header className="cx-top">
          <button type="button" className="cx-icon-btn cx-top-collapse" aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'} onClick={() => setCollapsed(value => !value)}><Icon name="menu" size={16} /></button>
          <div className="cx-top-path"><span>VEXNAR</span><Icon name="chevronRight" size={12} /><b>{viewLabels[view as keyof typeof viewLabels]}</b></div>
          <button type="button" className="cx-searchbtn" onClick={() => setPalette(true)}><Icon name="search" size={15} /><span>搜索</span><kbd>⌘J</kbd></button>
          <div className="cx-top-right">
            <Badge tone="green" dot>LLM 已配置</Badge>
            <span className="cx-taskchip"><Icon name="target" size={12} />T-2407 · 探索中</span>
            <button type="button" className="cx-icon-btn" aria-label="通知" onClick={() => go('notify')}><Icon name="bell" size={15} /></button>
            <span className="cx-avatar cx-avatar-sm" aria-hidden="true">X</span>
          </div>
        </header>
        <main className="cx-main">{content}</main>
      </div>
    </div>

    {palette && <div className="cx-palette-backdrop" onClick={(event: React.MouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) setPalette(false); }}>
      <div className="cx-palette" role="dialog" aria-label="控制台快速导航">
        <div className="cx-palette-input"><Icon name="search" size={16} /><input ref={paletteInput} value={paletteQuery} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPaletteQuery(event.target.value)} placeholder="搜索页面或会话…" aria-label="搜索页面或会话" /><kbd>Esc</kbd></div>
        <div className="cx-palette-list">
          {paletteItems.map(item => <button key={item.id} type="button" onClick={item.action}><Icon name={item.icon} size={15} /><span>{item.label}</span><small>{item.hint}</small></button>)}
          {!paletteItems.length && <p className="cx-palette-empty">没有匹配的页面。</p>}
        </div>
        <p className="cx-palette-foot">↑↓ 选择 · Enter 打开 · Esc 关闭 · 演示环境快照</p>
      </div>
    </div>}

    <div className="cx-toasts" aria-live="polite">
      {toasts.map(toast => <div key={toast.id} className="cx-toast"><Icon name="check" size={14} />{toast.message}</div>)}
    </div>

    <Modal open={createOpen} title="新建任务" sub="演示表单不会创建真实任务" onClose={() => setCreateOpen(false)} footer={<>
      <button type="button" className="cx-btn" onClick={() => setCreateOpen(false)}>取消</button>
      <button type="button" className="cx-btn cx-btn-primary" onClick={createTask}><Icon name="plus" size={14} />创建任务</button>
    </>}>
      <div className="cx-form">
        <label className="cx-field"><span>目标</span><input value={newTask.target} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setNewTask({ ...newTask, target: event.target.value })} placeholder="example.test" /><small>仅用于演示，任务不会启动。</small></label>
        <label className="cx-field"><span>任务模板</span><select value={newTask.template} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setNewTask({ ...newTask, template: event.target.value })}><option>外部渗透</option><option>内网横向</option><option>只读复核</option><option>业务复核</option></select></label>
        <label className="cx-field"><span>模型 profile</span><select value={newTask.profile} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setNewTask({ ...newTask, profile: event.target.value })}><option>默认（Claude Opus 4.8）</option><option>DeepSeek V4</option><option>本地 Qwen（离线）</option></select></label>
      </div>
    </Modal>
  </div>;
}
