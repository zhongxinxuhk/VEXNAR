// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useMemo, useState } from 'react';
import { External, Icon } from './UI.jsx';

const GROUP_ORDER = ['全部', 'Agent 能力', '工具与文件', '会话与数据', '插件与设置', '模型与网络', '客户端界面', '平台与传输', '安全与审批', '主题与外观'];
const stateTone = { 启用: 'green', 停用: 'slate', 条件启用: 'amber' };
const sourceLabel = { 'dsh-base': 'base', 'dsh-web-app': 'web-app' };

function ThemeCard({ theme, repository, tag }) {
  const sourcePath = theme.source.replace(/^app\/dsh\//, '');
  const tone = /浅色/.test(theme.name) ? 'light' : /深色/.test(theme.name) ? 'dark' : /系统/.test(theme.name) ? 'system' : /Montserrat/.test(theme.name) ? 'font' : /Shiki/.test(theme.name) ? 'code' : 'tokens';
  return <article className={`dsh-theme dsh-theme-${tone}`}>
    <div className="dsh-theme-art" aria-hidden="true">
      {tone === 'font' ? <span className="dsh-font-glyph">Ag</span> : tone === 'code' ? <span className="dsh-code-glyph">{'{ }'}</span> : tone === 'tokens' ? <span className="dsh-token-dots"><i /><i /><i /><i /></span> : <span className="dsh-theme-window"><i /><i /><i /></span>}
    </div>
    <div className="dsh-theme-body">
      <div className="dsh-theme-title"><b>{theme.name}</b><em>{theme.en}</em></div>
      <p>{theme.note}</p>
      <div className="dsh-theme-meta">
        <span className="tag">{theme.kind}</span>
        <External href={theme.license_url} className="dsh-license">{theme.license}</External>
        <External href={`${repository}/blob/${tag}/${sourcePath}`} className="dsh-source-link">源码<Icon name="external" size={10} /></External>
      </div>
    </div>
  </article>;
}

export default function DshCredits({ dsh }) {
  const [group, setGroup] = useState('全部');
  const [query, setQuery] = useState('');
  const groups = useMemo(() => GROUP_ORDER.filter(name => name === '全部' || dsh.builtins.some(row => row.group === name)), [dsh]);
  const counts = useMemo(() => dsh.builtins.reduce((acc, row) => ({ ...acc, [row.group]: (acc[row.group] || 0) + 1 }), {}), [dsh]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dsh.builtins.filter(row => (group === '全部' || row.group === group) && (!q || `${row.package} ${row.id} ${row.description}`.toLowerCase().includes(q)));
  }, [dsh, group, query]);
  const enabled = dsh.builtins.filter(row => row.state === '启用').length;

  return <section className="dsh-credits" id="dsh">
    <div className="directory-heading">
      <h2>DSH 与内置组件 <span>DeepSeek Harness · 客户端底座</span></h2>
      <span className="credit-count">置顶 · {dsh.builtins.length} 个内置组件 · {dsh.themes.length} 项主题外观</span>
    </div>

    <article className="dsh-feature">
      <div className="dsh-logo"><img src={dsh.logo} alt="DeepSeek Harness" width="64" height="64" loading="lazy" /></div>
      <div className="dsh-feature-body">
        <div className="dsh-feature-title">
          <h3>{dsh.name}</h3>
          <span className="tag">排第一 · 客户端底座</span>
          <span className="dsh-version">v{dsh.version}</span>
        </div>
        <p className="dsh-author">{dsh.author} · {dsh.license} · tag {dsh.tag} · commit {dsh.commit.slice(0, 8)}</p>
        <p className="dsh-role">{dsh.role}</p>
        <div className="dsh-stats">
          <span><b>{dsh.builtins.length}</b> 内置组件</span>
          <span><b>{enabled}</b> 直接启用</span>
          <span><b>{dsh.themes.length}</b> 主题与外观</span>
          <span><b>web profile</b> VEXNAR 组合</span>
        </div>
        <div className="dsh-feature-links">
          <External href={dsh.repository} className="dsh-primary-link"><Icon name="github" size={13} />github.com/deepseek-ai/deepseek-harness</External>
          <External href={dsh.license_url} className="dsh-secondary-link">MIT LICENSE</External>
          <External href={`${dsh.repository}/tree/${dsh.tag}`} className="dsh-secondary-link">源码快照 {dsh.tag}</External>
        </div>
      </div>
    </article>

    <div className="dsh-subhead"><h3>内置主题与外观</h3><p>浅色、深色与跟随系统由 ui-theme 提供；Montserrat 与 Shiki 随主题一起打包。</p></div>
    <div className="dsh-themes">
      {dsh.themes.map(theme => <ThemeCard key={theme.name} theme={theme} repository={dsh.repository} tag={dsh.tag} />)}
    </div>

    <div className="dsh-subhead"><h3>内置插件与组件</h3><p>按 VEXNAR 实际组合列出，包含显式停用与条件启用行；名称链接到对应源码目录。</p></div>
    <div className="dsh-toolbar">
      <label className="search-field dsh-search"><Icon name="search" size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索包名、行 ID 或说明" aria-label="搜索 DSH 内置组件" /></label>
      <div className="credit-filters" role="group" aria-label="按分组筛选 DSH 内置组件">
        {groups.map(name => <button key={name} type="button" aria-pressed={group === name} onClick={() => setGroup(name)}>{name}{name === '全部' ? ` ${dsh.builtins.length}` : ` ${counts[name]}`}</button>)}
      </div>
      <span className="result-count" aria-live="polite">{filtered.length} / {dsh.builtins.length}</span>
    </div>

    <div className="dsh-table" role="table" aria-label="DSH 内置插件与组件">
      <div className="dsh-row dsh-head" role="row">
        <span role="columnheader">组件 / 包名</span>
        <span role="columnheader">行 ID</span>
        <span role="columnheader">分组</span>
        <span role="columnheader">来源</span>
        <span role="columnheader">状态</span>
        <span role="columnheader">许可</span>
      </div>
      {filtered.map(row => <div className="dsh-row" role="row" key={row.id}>
        <span role="cell" className="dsh-pkg">
          <External href={row.url}>{row.package}</External>
          {row.description && <small title={row.description}>{row.description}</small>}
        </span>
        <span role="cell" className="dsh-id"><code>{row.id}</code></span>
        <span role="cell" className="dsh-group"><span className="tag">{row.group}</span></span>
        <span role="cell" className="dsh-origin"><code>{sourceLabel[row.source] || row.source}</code></span>
        <span role="cell" className="dsh-state"><span className={`dsh-state-pill is-${stateTone[row.state] || 'slate'}`}>{row.state}</span></span>
        <span role="cell" className="dsh-license-cell"><External href={row.license_url}>{row.license}</External></span>
      </div>)}
      {!filtered.length && <p className="filter-empty">没有匹配的内置组件。</p>}
    </div>

    <p className="data-note">来源：{dsh.sources.map(file => <code key={file}>{file}</code>)}。停用表示组合里显式 <code>disabled: true</code>；条件启用表示由 profile 表达式决定。VEXNAR 自有行（<code>@vexnar/dsh-ui</code>、<code>@vexnar/dsh-account</code>）不计入第三方致谢。</p>
  </section>;
}
