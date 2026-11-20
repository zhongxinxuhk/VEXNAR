// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useEffect, useRef, useState } from 'react';
import Architecture from './Architecture.jsx';
import github from '../.generated/github.json';
import credits from '../credits.json';
import { REPO, pages, pageFromPath, platformAssets, filterCredits, safeGithub } from './content.js';

function External({ href, children, className = '' }) { return <a className={className} href={safeGithub(href)} target="_blank" rel="noopener noreferrer">{children}</a>; }
function Brand() { return <a className="brand" href="index.html" aria-label="VEXNAR 首页"><img src="assets/logo.png" width="34" height="34" alt="" /><span>VEXNAR</span></a>; }
function Empty({ title, children, href, label }) { return <div className="empty"><span className="empty-icon">◇</span><h2>{title}</h2><p>{children}</p><External href={href} className="button secondary">{label}</External></div>; }
function Hero() {
  const [tilt, setTilt] = useState({});
  const move = event => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || event.pointerType === 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    setTilt({ '--tilt-x': `${(event.clientY - rect.top - rect.height / 2) / 45}deg`, '--tilt-y': `${(event.clientX - rect.left - rect.width / 2) / -45}deg` });
  };
  return <section className="hero"><div className="hero-ambient" aria-hidden="true" /><div className="hero-copy"><div className="eyebrow"><span className="signal" />AUTONOMOUS SECURITY, CONNECTED.</div><h1>洞察攻击面<br />让<span className="gradient">每一步</span><br />都有据可循<span className="period">.</span></h1><p className="lead">VEXNAR，让 AI 探索、工具执行与漏洞验证连成闭环。<br className="desktop-break" />从一个目标出发，看见完整的安全脉络。</p><div className="actions"><a className="button primary" href="downloads.html">获取 VEXNAR</a><a className="button secondary" href="#architecture">探索技术架构</a></div><div className="hero-note">开源可审阅 · 证据可追溯 · 人始终在环</div></div>
    <div className="orbit-stage" onPointerMove={move} onPointerLeave={() => setTilt({})}><div className="orbit" style={tilt} role="img" aria-label="探索图概念示意：目标、规划、执行和验证连接到 VEXNAR 内核"><div className="orbit-grid" /><div className="ring r1" /><div className="ring r2" /><div className="ring r3" /><svg className="orbit-paths" viewBox="0 0 600 600" aria-hidden="true"><path d="M155 110 Q300 115 300 300 T475 240 M110 405 Q230 420 300 300 T410 495" /><circle r="3"><animateMotion dur="9s" repeatCount="indefinite" path="M155 110 Q300 115 300 300 T475 240" /></circle><circle r="3"><animateMotion dur="11s" repeatCount="indefinite" path="M110 405 Q230 420 300 300 T410 495" /></circle></svg><div className="core"><img src="assets/logo.png" alt="" /><span>VEXNAR</span></div>{[['n1', '目标资产', 'ATTACK SURFACE'], ['n2', '自主规划', 'PLANNING'], ['n3', '工具执行', 'EXECUTION'], ['n4', '独立验证', 'VERIFICATION']].map(([cls, title, sub]) => <div className={`node ${cls}`} key={cls}><i />{title}<small>{sub}</small></div>)}<div className="orbit-caption"><span>CONNECTED EXPLORATION</span><span>概念示意</span></div></div></div>
  </section>;
}
function Overview() {
  return <><Hero /><div className="stats"><div><strong>Dual Graph</strong><span>资产与探索，锚点相连</span></div><div><strong>Go Core</strong><span>模型与任务，统一编排</span></div><div><strong>Evidence</strong><span>执行有据，发现可复核</span></div><div><strong>Open Source</strong><span>AGPL-3.0-or-later</span></div></div>
    <section className="section reveal" id="capabilities"><div className="section-heading"><div><div className="eyebrow">BUILT FOR THE FULL PICTURE</div><h2>从零散线索，到完整脉络。</h2></div><p>把探索、执行和验证放在同一个工作流中。<br />把模型的判断，落到可观察的事实。</p></div><div className="features">{[
      ['⌘', 'PLANNING & EXECUTION', '自主探索，持续推进', '规划者分解目标，Worker 领取意图。执行结果写回任务图，成为下一轮规划的上下文。'],
      ['◎', 'CONNECTED CONTEXT', '双图连接意图与事实', '探索图保留任务推进的血缘，资产图沉淀跨任务的目标真值。锚点连接每个方向与具体对象。'],
      ['⌁', 'EVIDENCE FIRST', '保留证据，验证发现', '关联请求、响应与工具结果，通过独立验证流程支持确认，保留可复核的来源。'],
      ['◇', 'HUMAN IN THE LOOP', '自主执行，随时介入', '通过配置规则与审批、对话和过程记录介入运行，在探索中纠偏、暂停或接管。']
    ].map(([icon, tag, title, text]) => <article className="feature" key={tag}><span className="feature-icon">{icon}</span><span className="kicker">{tag}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <Architecture />
    <section className="technical-strip reveal"><div><div className="eyebrow">CONTEXT WITH MEMORY</div><h2>保留重要上下文，<br /><span className="muted">让探索继续向前。</span></h2><p>近期消息保留结构，历史对话滚动摘要。<br />复用以快照身份与内容版本为依据。</p></div><div className="memory-stack" aria-label="上下文组织概念示意"><div><span>RECENT</span><b>近期结构化消息</b><small>保留工具调用与结果配对</small></div><div><span>SUMMARY</span><b>滚动历史摘要</b><small>保留目标、事实、来源与未完成事项</small></div><div><span>IDENTITY</span><b>快照身份与摘要边界</b><small>身份不匹配时重新生成</small></div></div></section>
    <section className="section open-section reveal"><div className="eyebrow">OPEN SOURCE. OPEN PROGRESS.</div><h2>每一次演进，都公开可见。</h2><p>追踪项目进展，认识贡献者，向开源的基石致谢。</p><div className="open-links"><a href="branches.html">分支与开发</a><a href="commits.html">最近提交</a><a href="contributors.html">合作者</a><a href="credits.html">开源致谢</a></div><div className="github-snapshot">{github.repo.stars} GitHub Stars · {github.contributors.length} 位公开贡献者 · 数据快照 {github.updatedAt}</div></section>
  </>;
}
function Downloads() {
  return <><div className="download-grid">{[['macOS', 'mac', '⌘'], ['Windows', 'win', '⊞'], ['Linux', 'linux', '△']].map(([name, platform, icon]) => {
    const assets = platformAssets(github.releases, platform);
    return <article className="download-card" key={platform}><div className="os-icon">{icon}</div><h2>{name}</h2><p>公开正式发行包</p>{assets.length ? assets.slice(0, 8).map(a => <External href={a.url} className="asset" key={a.url}>{a.name}<small>{(a.size / 1048576).toFixed(1)} MB · {a.version}</small></External>) : <><span className="badge">尚未发布</span><p>当前没有此平台的正式公开安装包。发布后将在这里显示真实下载链接。</p></>}</article>;
  })}</div><div className="notice"><h2>从源码开始</h2><p>也可以通过安装脚本、Docker Compose 或源码构建。服务端部署需要 PostgreSQL 与模型配置，具体要求以仓库文档为准。</p><External href={`${REPO}#安装`} className="button secondary">查看安装指南</External><External href={`${REPO}/releases`} className="text-link">所有发行版本</External></div></>;
}
function Releases() { return github.releases.length ? <div className="release-list">{github.releases.map(r => <article className="release" key={r.tag}><div className="release-meta"><span className="badge">{r.prerelease ? '预发布' : '正式发行'}</span><time>{r.date}</time></div><h2><External href={r.url}>{r.name}</External></h2><pre className="release-body">{r.body || '此版本没有填写发行说明。'}</pre><External href={r.url} className="text-link">查看完整发行说明</External></article>)}</div> : <Empty title="第一份发行说明，即将写下。" href={`${REPO}/releases`} label="前往 GitHub Releases">项目目前没有公开 Release。版本发布后，这里会同步版本号、时间和官方说明。</Empty>; }
function Branches() { return <><div className="list">{github.branches.map(b => <article className="branch-row" key={b.name}><div><span className="branch-icon">⑂</span><h2><External href={`${REPO}/tree/${encodeURIComponent(b.name)}`}>{b.name}</External></h2>{b.name === github.repo.defaultBranch && <span className="badge">默认分支</span>}</div><span className="mono">{b.sha.slice(0, 8)}</span><External href={`${REPO}/commits/${encodeURIComponent(b.name)}`} className="text-link">查看提交</External></article>)}</div><p className="data-note">最多展示 100 个公开分支，默认分支标识来自仓库元数据。</p></>; }
function Commits() { return <><div className="commit-list">{github.commits.map(c => <article className="commit" key={c.sha}><div className="commit-mark" /><div><h2><External href={c.url}>{c.message}</External></h2><p>{c.author}<span>·</span><time>{c.date}</time></p></div><External href={c.url} className="sha mono">{c.sha.slice(0, 8)}</External></article>)}</div><p className="data-note">默认分支最近 50 次公开提交，完整历史请查看 GitHub。</p></>; }
function Contributors() { return <><div className="people">{github.contributors.map(c => <External href={c.url} className="person" key={c.name}><img src={`https://github.com/${encodeURIComponent(c.name)}.png?size=160`} width="80" height="80" alt={`${c.name} 的头像`} loading="lazy" /><h2>{c.name}</h2><p>{c.contributions} 次提交贡献</p><span className="text-link">GitHub 主页</span></External>)}</div><div className="notice"><h2>一起构建下一步。</h2><p>这里展示 GitHub 公开代码贡献者。欢迎通过 Issue、Pull Request 与文档改进参与项目。</p><External href={`${REPO}/issues`} className="button secondary">参与讨论</External></div></>; }
function CreditLogo({ item }) {
  const [failed, setFailed] = useState(false);
  return <div className="credit-logo-wrap">{item.logo && !failed ? <img className={`credit-logo ${item.logo_kind.includes('Simple Icons') ? 'symbol' : ''}`} src={item.logo} alt={`${item.name} ${item.logo_kind}`} width="48" height="48" loading="lazy" onError={() => setFailed(true)} /> : <span className="credit-monogram">{item.name.slice(0, 2)}</span>}</div>;
}
function Credits() {
  const [query, setQuery] = useState(''); const [category, setCategory] = useState('全部');
  const projects = filterCredits(credits.projects, query, category);
  return <><section className="credits-intro"><div><span className="eyebrow">INTRODUCTION</span><h2>站在开源的肩膀上。</h2></div><div><p>从界面、编辑器与终端，到 Agent、数据库与运行时；从直接使用的软件，到架构与交互设计的启发。这里记录 VEXNAR 使用、参考与借鉴的开源项目。</p><p>每项分别列出用途、作者或维护者、GitHub 地址与许可证，并标注使用关系。研究参考表示开发资料，不代表运行时集成。</p></div></section><section className="credits-projects"><div className="credits-section-heading"><div><div className="eyebrow">OPEN SOURCE PROJECTS</div><h2>开放的技术，共同的基石。</h2></div><span className="credit-count" aria-live="polite">显示 {projects.length} / {credits.projects.length} 个项目</span></div><div className="credits-toolbar"><label className="credit-search">搜索项目<input type="search" placeholder="搜索名称、作者、用途或许可证" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="credit-filters" role="group" aria-label="按用途筛选项目">{['全部', 'UI 与交互', '编辑器与终端', 'Agent 与工具', '数据与运行时', '参考与借鉴'].map(cat => <button key={cat} aria-pressed={cat === category} onClick={() => setCategory(cat)}>{cat}</button>)}</div></div><div className="credits-grid">{projects.map(item => <article className="credit-card" key={item.github}><div className="credit-card-top"><CreditLogo item={item} /><span className="badge">{item.kind}</span></div><h3>{item.name}</h3><p className="credit-author">{item.author}</p><dl><dt>Usage · 用途</dt><dd>{item.usage}</dd><dt>License · 许可证</dt><dd><External href={item.license_url} className="credit-license">{item.license}</External></dd></dl>{item.note && <p className="credit-note">{item.note}</p>}<External href={item.github} className="credit-github"><span>GitHub</span><span>{item.github.replace('https://github.com/', '')}</span></External></article>)}</div>{projects.length === 0 && <p className="credit-empty">没有匹配的项目，请尝试其他关键词或分类。</p>}</section><section className="credits-license"><div><div className="eyebrow">LICENSE</div><h2>尊重每一份开放。</h2></div><div><p>VEXNAR 自有代码采用 AGPL-3.0-or-later。第三方项目保留各自的版权与许可证；各卡片链接到上游原文，具体版本以所用版本的许可证为准。</p><p>来源核对日期：{credits.verified_at}。此页展示主要组件及开发参考；Web 模板原始 MIT 声明保留在 <External href={`${REPO}/blob/main/web/LICENSE`}>web/LICENSE</External>。</p><p className="credit-note">专用 Logo 来自原仓库；部分标识来自 Simple Icons（<a href="assets/credits/simple-icons-LICENSE.txt">CC0-1.0</a>）。无专用 Logo 时使用维护者头像或名称标识。Logo 用于来源识别。</p></div></section><section className="credits-thanks"><div className="eyebrow">ACKNOWLEDGEMENTS</div><h2>感谢，把创造分享出来的人。</h2><p>感谢每一位开源作者、维护者与贡献者。<br />你们在代码、文档、反馈与技术探索上的投入，让 VEXNAR 得以继续向前。</p><External href={REPO} className="button secondary">参与 VEXNAR 开源建设</External></section></>;
}
const content = { index: Overview, downloads: Downloads, releases: Releases, branches: Branches, commits: Commits, contributors: Contributors, credits: Credits };
export default function App({ initialPage = 'index' }) {
  const [route, setRoute] = useState(initialPage); const [menu, setMenu] = useState(false); const [progress, setProgress] = useState(0);
  const mainRef = useRef(null); const firstRender = useRef(true);
  useEffect(() => {
    const pop = () => { setRoute(pageFromPath(window.location.pathname)); setMenu(false); };
    const click = event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const a = event.target.closest('a'); if (!a || a.target || a.hasAttribute('download')) return;
      const url = new URL(a.href);
      if (url.origin !== location.origin || url.hash || !/\/(index|downloads|releases|branches|commits|contributors|credits)\.html$/.test(url.pathname)) return;
      event.preventDefault(); history.pushState({}, '', url); setRoute(pageFromPath(url.pathname)); setMenu(false); window.scrollTo({ top: 0, behavior: 'instant' });
    };
    const scroll = () => { const total = document.documentElement.scrollHeight - innerHeight; setProgress(total > 0 ? scrollY / total : 0); };
    const key = event => { if (event.key === 'Escape') setMenu(false); };
    window.addEventListener('popstate', pop); document.addEventListener('click', click); window.addEventListener('scroll', scroll, { passive: true }); document.addEventListener('keydown', key); scroll();
    return () => { window.removeEventListener('popstate', pop); document.removeEventListener('click', click); window.removeEventListener('scroll', scroll); document.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => {
    document.title = `${pages.find(p => p.id === route)?.label || '页面未找到'} · VEXNAR — AI 自主安全探索`;
    if (firstRender.current) firstRender.current = false; else mainRef.current?.focus({ preventScroll: true });
    const items = document.querySelectorAll('.reveal');
    if (!window.IntersectionObserver) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer.unobserve(entry.target); } }), { threshold: 0.08 });
    items.forEach(item => { item.classList.add('reveal-ready'); observer.observe(item); });
    return () => observer.disconnect();
  }, [route]);
  const page = pages.find(p => p.id === route); const Page = content[route];
  return <><a className="skip" href="#main">跳转到正文</a><header className="header"><div className="reading-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" /><div className="nav-shell"><Brand /><button className="menu-toggle" aria-label={menu ? '关闭导航菜单' : '打开导航菜单'} aria-expanded={menu} aria-controls="navigation" onClick={() => setMenu(!menu)}>☰</button><nav id="navigation" className={menu ? 'open' : ''} aria-label="主导航">{pages.map(p => <a key={p.id} href={`${p.id}.html`} aria-current={route === p.id ? 'page' : undefined}>{p.label}</a>)}</nav><External href={REPO} className="github-link">GitHub</External></div></header><main id="main" tabIndex="-1" ref={mainRef} key={route} className="page-transition">{page && route !== 'index' && <section className="page-intro"><div className="eyebrow">{page.eyebrow}</div><h1>{page.title}</h1><p>{page.description}</p><div className="snapshot">{route === 'credits' ? `来源与许可证核对 · ${credits.verified_at}` : `GitHub 公开数据快照 · ${github.updatedAt}`}</div></section>}{Page ? <Page /> : <Empty title="这条路径还没有内容。" href={REPO} label="查看项目仓库">请通过顶部导航返回官网页面。</Empty>}</main><footer><div className="footer-top"><Brand /><p>探索有迹。验证有据。</p><External href={REPO}>GitHub</External><External href={`${REPO}/blob/main/LICENSE`}>AGPL-3.0-or-later</External></div><div className="footer-bottom"><span>© 2026 xuzhongxin · VEXNAR</span><span>React 驱动 · 开源共建</span></div></footer></>;
}
