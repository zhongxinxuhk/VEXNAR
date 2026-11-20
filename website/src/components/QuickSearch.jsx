// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useEffect, useRef, useState } from 'react';
import { pages } from '../content.js';
import { Icon } from './UI.jsx';
export default function QuickSearch({open,onClose}) {
  const dialog=useRef(null), input=useRef(null), previousFocus=useRef(null);
  const [query,setQuery]=useState('');
  useEffect(()=>{if(open){previousFocus.current=document.activeElement;setQuery('');dialog.current.showModal();input.current.focus();}else if(dialog.current.open){dialog.current.close();previousFocus.current?.focus();}},[open]);
  const matches=pages.filter(p=>`${p.label} ${p.title||''}`.toLowerCase().includes(query.toLowerCase()));
  return <dialog ref={dialog} className="quick-search" onCancel={onClose} onClick={e=>{if(e.target===dialog.current)onClose();}} aria-label="站内快速导航"><div className="quick-search-input"><Icon name="search"/><input ref={input} aria-label="搜索页面" placeholder="查找页面…" value={query} onChange={e=>setQuery(e.target.value)}/><button className="icon-button" onClick={onClose} aria-label="关闭搜索"><Icon name="close" size={18}/></button></div><div className="quick-search-results">{matches.map(p=><a key={p.id} href={`${p.id}.html`} onClick={onClose}><Icon name={p.id==='credits'?'book':'grid'} size={18}/><span>{p.label}</span><small>{p.id==='index'?'产品与系统架构':p.description}</small></a>)}{matches.length===0&&<p>没有找到相关页面。</p>}</div><div className="quick-search-footer">Tab 切换结果，Enter 打开页面<span>Esc 关闭</span></div></dialog>;
}
