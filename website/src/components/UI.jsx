// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React from 'react';
import { REPO, safeGithub } from '../content.js';

export function External({ href, children, className = '', ...rest }) {
  return <a className={className} href={safeGithub(href)} target="_blank" rel="noopener noreferrer" {...rest}>{children}</a>;
}

const P = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  graph: <><circle cx="5" cy="12" r="3" /><circle cx="18" cy="5" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8 10 7-4M8 14l7 4" /></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m7 9 3 3-3 3m6 0h4" /></>,
  layers: <><path d="m12 3 10 5-10 5L2 8l10-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  branch: <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><path d="M6 7v10M18 7c0 5-12 3-12 8" /></>,
  commit: <><circle cx="12" cy="12" r="4" /><path d="M2 12h6m8 0h6" /></>,
  download: <><path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4" /></>,
  book: <><path d="M12 6C8 3 4 4 2 5v15c3-2 7-2 10 0 3-2 7-2 10 0V5c-3-2-7-2-10 1Zm0 0v14" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21v-3c0-6 14-6 14 0v3m1-17c5 0 5 8 0 8m2 3c3 1 3 4 3 6" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  plus: <path d="M12 4v16M4 12h16" />,
  minus: <path d="M4 12h16" />,
  close: <path d="m5 5 14 14M5 19 19 5" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  code: <><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18" /></>,
  dashboard: <><rect x="3" y="3" width="7.5" height="9" rx="2" /><rect x="13.5" y="3" width="7.5" height="5.5" rx="2" /><rect x="3" y="15" width="7.5" height="6" rx="2" /><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="2" /></>,
  chat: <><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" /><path d="M8 11h8M8 15h5" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  bug: <><path d="M8 6a4 4 0 0 1 8 0v1H8V6Z" /><rect x="5" y="8" width="14" height="11" rx="6" /><path d="M5 12H2m20 0h-3M5 17l-3 2m20-2 3 2M9 8v11m6-11v11" /></>,
  activity: <path d="M3 12h3l2.5-6 3.5 12 3-9 2 3h4" />,
  radio: <><circle cx="12" cy="12" r="2.5" /><path d="M7.5 7.5a6.5 6.5 0 0 0 0 9m9-9a6.5 6.5 0 0 1 0 9M4.5 4.5a11 11 0 0 0 0 15m15-15a11 11 0 0 1 0 15" /></>,
  network: <><rect x="9" y="3" width="6" height="5" rx="1.5" /><rect x="2" y="16" width="6" height="5" rx="1.5" /><rect x="16" y="16" width="6" height="5" rx="1.5" /><path d="M12 8v4m0 0H5v4m7-4h7v4" /></>,
  folderSync: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v3" /><path d="M3 9v8a2 2 0 0 0 2 2h7" /><path d="M15 17a4 4 0 1 1 1.5 3.1M20 22v-3h-3" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  brain: <><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V16a3 3 0 0 0 4 2.8V20h3V4H9Z" /><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V16a3 3 0 0 1-4 2.8V20h-3" /></>,
  bot: <><rect x="4" y="8" width="16" height="12" rx="4" /><path d="M12 4v4M8 14h.01M16 14h.01M9 18h6" /></>,
  plug: <><path d="M9 3v6M15 3v6M6 9h12v3a6 6 0 0 1-12 0V9ZM12 18v3" /></>,
  sparkles: <><path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z" /><path d="M18 15.5 19 18l2.5 1-2.5 1-1 2.5-1-2.5L14.5 19l2.5-1 1-2.5Z" /></>,
  wrench: <path d="M14.5 6.5a4 4 0 1 0 5 5L21 10l-3-7-3.5 3.5ZM12.5 9.5 4 18l2 2 8.5-8.5" />,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 19a2 2 0 0 0 4 0" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></>,
  scroll: <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3m0 13v3M4.2 7l2.6 1.5m10.4 6L19.8 16M4.2 17l2.6-1.5m10.4-6L19.8 7" /></>,
  send: <path d="M4 12 21 4l-7 17-2.5-7L4 12Z" />,
  paperclip: <path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7" />,
  arrowUp: <path d="M12 20V4m-7 7 7-7 7 7" />,
  arrowDown: <path d="M12 4v16m-7-7 7 7 7-7" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  play: <path d="M8 5.5 19 12 8 18.5v-13Z" />,
  pause: <path d="M9 5v14M15 5v14" />,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 6M20 5v6h-6" />,
  pin: <path d="m9 3 12 12-4 1-1 4-5-5-5-5 4-1 1-4ZM8 16l-4 4" />,
  trash: <path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13M10 11v6m4-6v6" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />,
  key: <><circle cx="8" cy="8" r="4" /><path d="m11 11 9 9m-4-4 2-2m-5-1 2-2" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  github: <path d="M9 19c-4 1.5-4-2.5-6-3m12 6v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.4-.4-4.1 1.6a10.5 10.5 0 0 0-5.4 0C6.4 3.7 5 4.1 5 4.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 3.6 10.5c0 4.6 2.7 5.7 5.5 6-.4.4-.6.9-.6 1.5V22" />,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><rect x="10" y="10" width="4" height="4" /><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3" /></>,
  database: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  cloud: <path d="M7 18h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.4A3.5 3.5 0 0 0 7 18Z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  zap: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />,
  alert: <><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 9v5m0 3v.5" /></>,
  chart: <path d="M4 20V4m0 16h16M8 16v-5m4 5V8m4 8v-3" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M15 5H5a2 2 0 0 0-2 2v10" /></>,
  expand: <path d="M9 3H3v6m12-6h6v6M9 21H3v-6m12 6h6v-6" />,
  cube: <><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" /><path d="m3 7 9 5 9-5M12 12v10" /></>,
  orbit: <><circle cx="12" cy="12" r="3" /><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-30 12 12)" /></>,
  cursor: <path d="m5 3 14 8-6 1.5L10 19 5 3Z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8v.5" /></>,
  dot: <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />,
  flag: <path d="M5 21V4m0 0h12l-2 4 2 4H5" />,
  filterList: <path d="M4 6h16M7 12h10M10 18h4" />,
  shuffle: <path d="M3 7h4l10 10h4m0 0-3-3m3 3-3 3M3 17h4l3-3m4-4 3-3h4m0 0-3-3m3 3-3 3" />
};

export function Icon({ name = 'grid', size = 20, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{P[name] || P.grid}</svg>;
}

export function Brand() {
  return <a className="brand" href="index.html" aria-label="VEXNAR 首页"><img src="assets/logo.png" width="32" height="32" alt="" /><span>VEXNAR</span></a>;
}

export function Empty({ title, children, href = REPO, label = '查看项目仓库' }) {
  return <div className="empty"><div className="empty-icon"><Icon name="layers" size={28} /></div><h2>{title}</h2><p>{children}</p><External href={href} className="button secondary">{label}</External></div>;
}

export function Severity({ level }) {
  const tone = level === '高危' ? 'red' : level === '中危' ? 'amber' : 'slate';
  return <span className={`vtag vtag-${tone}`}>{level}</span>;
}
