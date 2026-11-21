// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useEffect, useRef } from 'react';
import { Icon } from '../components/UI.jsx';

export function Panel({ title, sub, actions, children, className = '', bodyClass = '', flush = false }) {
  return (
    <section className={`cx-panel ${className}`}>
      {(title || actions) && <header className="cx-panel-h">
        <div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
        {actions && <div className="cx-panel-actions">{actions}</div>}
      </header>}
      <div className={`cx-panel-b ${bodyClass}`} data-flush={flush ? 'true' : undefined}>{children}</div>
    </section>
  );
}

export function Segmented({ items, value, onChange, label }) {
  return <div className="cx-seg" role="group" aria-label={label}>
    {items.map(([id, text]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>{text}</button>)}
  </div>;
}

export function Chips({ items, value, onChange, label }) {
  return <div className="cx-chips" role="group" aria-label={label}>
    {items.map(item => <button key={item} type="button" aria-pressed={value === item} onClick={() => onChange(item)}>{item}</button>)}
  </div>;
}

export function Tabs({ items, value, onChange, label }) {
  return <div className="cx-tabs" role="tablist" aria-label={label}>
    {items.map(([id, text]) => <button key={id} type="button" role="tab" id={`cx-tab-${id}`} aria-selected={value === id} tabIndex={value === id ? 0 : -1} onClick={() => onChange(id)} onKeyDown={event => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const index = items.findIndex(item => item[0] === value);
      const next = items[(index + (event.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length][0];
      onChange(next);
      document.getElementById(`cx-tab-${next}`)?.focus();
    }}>{text}</button>)}
  </div>;
}

export function Toggle({ checked, onChange, label, id }) {
  const inputId = id || `tg-${label}`;
  return <button type="button" id={inputId} className="cx-toggle" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
    <span className="cx-toggle-track"><span className="cx-toggle-knob" /></span>
    <span className="cx-toggle-label">{label}</span>
  </button>;
}

export function Badge({ tone = 'slate', children, dot = false }) {
  return <span className={`cx-badge cx-badge-${tone}`}>{dot && <i className="cx-dot" aria-hidden="true" />}{children}</span>;
}

export function Stat({ label, value, sub, tone = 'slate', icon = 'dot' }) {
  return <div className={`cx-stat cx-tone-${tone}`}>
    <div className="cx-stat-top"><span>{label}</span><Icon name={icon} size={16} /></div>
    <strong>{value}</strong>
    {sub && <small>{sub}</small>}
  </div>;
}

export function Meter({ value = 0, tone = 'blue', label }) {
  return <div className="cx-meter" role="img" aria-label={label || `${value}%`}>
    <span className={`cx-meter-fill cx-fill-${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>;
}

export function Field({ label, hint, children, inline = false }) {
  return <label className={`cx-field ${inline ? 'cx-field-inline' : ''}`}>
    <span className="cx-field-label">{label}</span>
    {children}
    {hint && <small>{hint}</small>}
  </label>;
}

export function KV({ k, v, mono = false }) {
  return <div className="cx-kv"><span>{k}</span><b className={mono ? 'cx-mono' : undefined}>{v}</b></div>;
}

export function EmptyState({ text, icon = 'search', children }) {
  return <div className="cx-empty"><Icon name={icon} size={26} /><p>{text}</p>{children}</div>;
}

// DataTable keeps every interactive list in the demo consistent: header row,
// optional selection, keyboard-activatable rows.
export function DataTable({ columns, rows, rowKey = 'id', selected, onSelect, empty = '没有匹配记录。', dense = false }) {
  if (!rows.length) return <EmptyState text={empty} />;
  return <div className={`cx-table ${dense ? 'cx-table-dense' : ''}`} role="table">
    <div className="cx-tr cx-th" role="row">
      {columns.map(col => <span key={col.key} role="columnheader" style={{ flex: col.width ? `0 0 ${col.width}` : undefined }} className={col.align === 'right' ? 'cx-align-right' : undefined}>{col.title}</span>)}
    </div>
    {rows.map(row => {
      const key = row[rowKey];
      const active = selected === key;
      return <div
        key={key}
        role="row"
        tabIndex={onSelect ? 0 : undefined}
        aria-selected={onSelect ? active : undefined}
        className={`cx-tr cx-trow ${active ? 'is-active' : ''}`}
        onClick={onSelect ? () => onSelect(key) : undefined}
        onKeyDown={onSelect ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(key); } } : undefined}
      >
        {columns.map(col => <span key={col.key} role="cell" style={{ flex: col.width ? `0 0 ${col.width}` : undefined }} className={`${col.align === 'right' ? 'cx-align-right' : ''} ${col.mono ? 'cx-mono' : ''}`}>{col.render ? col.render(row) : row[col.key]}</span>)}
      </div>;
    })}
  </div>;
}

export function Modal({ open, title, sub, onClose, children, footer }) {
  const dialog = useRef(null);
  useEffect(() => {
    if (!open) return;
    const key = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open, onClose]);
  useEffect(() => {
    if (open) dialog.current?.focus();
  }, [open]);
  if (!open) return null;
  return <div className="cx-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="cx-modal" role="dialog" aria-modal="true" aria-label={title} tabIndex="-1" ref={dialog}>
      <header><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div><button type="button" className="cx-icon-btn" aria-label="关闭" onClick={onClose}><Icon name="close" size={16} /></button></header>
      <div className="cx-modal-b">{children}</div>
      {footer && <footer>{footer}</footer>}
    </div>
  </div>;
}

export function SourceLink({ href, children }) {
  return <a className="cx-source" href={href} target="_blank" rel="noopener noreferrer">{children}<Icon name="external" size={12} /></a>;
}
