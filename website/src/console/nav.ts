// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/** Counters a nav entry can show; resolved against live state by the caller. */
export type NavBadge = 'approvals';

/**
 * One console destination. `icon` is a key of the glyph table in
 * `components/UI.tsx`; it stays `string` here so the demo dataset does not keep
 * a second copy of the icon inventory.
 */
export interface NavEntry {
  id: string;
  label: string;
  icon: string;
  badge?: NavBadge;
}

/** A titled block of nav entries ("功能" / "系统"). */
export interface NavGroup {
  label: string;
  items: NavEntry[];
}

// Console navigation mirrors web/src/navigation/sidebar/sidebar-items.ts so the
// demo reads like the real product shell. Every entry maps to a live view.
export const consoleNav: NavGroup[] = [
  {
    label: '功能',
    items: [
      { id: 'dashboard', label: '仪表盘', icon: 'dashboard' },
      { id: 'chat', label: '对话', icon: 'chat' },
      { id: 'tasks', label: '任务', icon: 'target' },
      { id: 'findings', label: '发现', icon: 'bug' },
      { id: 'traffic', label: '流量', icon: 'activity' },
      { id: 'commands', label: '工具执行', icon: 'terminal' },
      { id: 'llm-records', label: 'LLM 录制', icon: 'radio' },
      { id: 'assets', label: '资产', icon: 'network' },
      { id: 'sync', label: '资产同步', icon: 'folderSync' },
      { id: 'workspace', label: '工作空间', icon: 'folder' }
    ]
  },
  {
    label: '系统',
    items: [
      { id: 'llm', label: 'LLM', icon: 'brain' },
      { id: 'agents', label: 'Agent', icon: 'bot' },
      { id: 'mcp', label: 'MCP', icon: 'plug' },
      { id: 'skills', label: 'Skill', icon: 'sparkles' },
      { id: 'tools', label: '工具', icon: 'wrench' },
      { id: 'notify', label: '通知推送', icon: 'bell' },
      { id: 'intercept', label: '拦截规则', icon: 'shield' },
      { id: 'asset-intercept', label: '资产拦截', icon: 'ban' },
      { id: 'approvals', label: '审批记录', icon: 'clipboard', badge: 'approvals' },
      { id: 'logs', label: '日志', icon: 'scroll' },
      { id: 'settings', label: '系统配置', icon: 'settings' }
    ]
  }
];

/** View id → nav label, used by the console breadcrumb. */
export const viewLabels: Record<string, string> = Object.fromEntries(
  consoleNav.flatMap((group): Array<[string, string]> => group.items.map((item): [string, string] => [item.id, item.label]))
);
