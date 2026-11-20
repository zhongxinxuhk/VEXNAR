// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React from 'react';
import { REPO, safeGithub } from '../content.js';
export function External({ href, children, className = '' }) { return <a className={className} href={safeGithub(href)} target="_blank" rel="noopener noreferrer">{children}</a>; }
export function Icon({ name = 'grid', size = 20, ...props }) {
  const shapes = {
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
    close: <path d="m5 5 14 14M5 19 19 5" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    code: <><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18" /></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{shapes[name] || shapes.grid}</svg>;
}
export function Brand() { return <a className="brand" href="index.html" aria-label="VEXNAR 首页"><img src="assets/logo.png" width="32" height="32" alt="" /><span>VEXNAR</span></a>; }
export function Empty({ title, children, href = REPO, label = '查看项目仓库' }) { return <div className="empty"><div className="empty-icon"><Icon name="layers" size={28} /></div><h2>{title}</h2><p>{children}</p><External href={href} className="button secondary">{label}</External></div>; }
