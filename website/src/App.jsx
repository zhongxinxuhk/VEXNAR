// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useEffect, useRef, useState } from 'react';
import Home from './components/Home.jsx';
import Credits from './components/Credits.jsx';
import QuickSearch from './components/QuickSearch.jsx';
import ConsolePage from './components/ConsolePage.jsx';
import ArchitecturePage from './components/ArchitecturePage.jsx';
import { Downloads, Releases, Branches, Commits, Contributors } from './components/ProjectPages.jsx';
import { Brand, External, Empty, Icon } from './components/UI.jsx';
import github from '../.generated/github.json';
import credits from '../credits.json';
import { REPO, pages, pageFromPath } from './content.js';

const content = {
  index: Home,
  console: ConsolePage,
  architecture: ArchitecturePage,
  downloads: Downloads,
  releases: Releases,
  branches: Branches,
  commits: Commits,
  contributors: Contributors,
  credits: Credits
};
const ownIntro = new Set(['console', 'architecture']);

export default function App({ initialPage = 'index' }) {
  const [route, setRoute] = useState(initialPage), [menu, setMenu] = useState(false), [search, setSearch] = useState(false), [scrolled, setScrolled] = useState(false);
  const mainRef = useRef(null), firstRender = useRef(true), menuButton = useRef(null);
  useEffect(() => {
    const pagePaths = new Set(pages.map(page => `${page.id}.html`));
    const pop = () => { setRoute(pageFromPath(location.pathname)); setMenu(false); setSearch(false); };
    const click = event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest('a');
      if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href);
      if (url.origin !== location.origin || url.hash) return;
      const file = url.pathname.split('/').filter(Boolean).at(-1) || '';
      if (!pagePaths.has(file)) return;
      event.preventDefault();
      history.pushState({}, '', url);
      setRoute(pageFromPath(url.pathname));
      setMenu(false); setSearch(false);
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    const scroll = () => setScrolled(scrollY > 20);
    const key = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearch(previous => !previous); }
      if (event.key === 'Escape') setMenu(wasOpen => { if (wasOpen) menuButton.current?.focus(); return false; });
    };
    window.addEventListener('popstate', pop);
    document.addEventListener('click', click);
    window.addEventListener('scroll', scroll, { passive: true });
    document.addEventListener('keydown', key);
    scroll();
    return () => { window.removeEventListener('popstate', pop); document.removeEventListener('click', click); window.removeEventListener('scroll', scroll); document.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => {
    document.title = `${pages.find(page => page.id === route)?.label || '页面未找到'} · VEXNAR`;
    if (firstRender.current) firstRender.current = false;
    else mainRef.current?.focus({ preventScroll: true });
    if (!window.IntersectionObserver) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer.unobserve(entry.target); }
    }), { threshold: .08 });
    document.querySelectorAll('.reveal').forEach(item => { item.classList.add('reveal-ready'); observer.observe(item); });
    return () => observer.disconnect();
  }, [route]);
  const page = pages.find(item => item.id === route), Page = content[route];
  return <>
    <a className="skip" href="#main">跳转到正文</a>
    <header className={`header ${scrolled ? 'scrolled' : ''}`}>
      <div className="nav-shell">
        <Brand />
        <nav id="navigation" className={menu ? 'open' : ''} aria-label="主导航">
          {pages.map(item => <a key={item.id} href={`${item.id}.html`} aria-current={route === item.id ? 'page' : undefined}>{item.label}</a>)}
        </nav>
        <div className="nav-actions">
          <button className="search-toggle icon-button" aria-label="搜索网站" onClick={() => setSearch(true)}><Icon name="search" size={18} /><kbd>⌘ K</kbd></button>
          <External href={REPO} className="github-link">GitHub</External>
          <button ref={menuButton} className="menu-toggle icon-button" aria-label={menu ? '关闭导航菜单' : '打开导航菜单'} aria-expanded={menu} aria-controls="navigation" onClick={() => setMenu(!menu)}><Icon name={menu ? 'close' : 'menu'} /></button>
        </div>
      </div>
    </header>
    <QuickSearch open={search} onClose={() => setSearch(false)} />
    <main id="main" tabIndex="-1" ref={mainRef} key={route} className={`page page-${route}`}>
      {page && route !== 'index' && !ownIntro.has(route) && <section className="page-intro">
        <div className="page-breadcrumb"><a href="index.html">VEXNAR</a><span>/</span><span>{page.label}</span></div>
        <div className="page-intro-content">
          <div><h1>{page.title}</h1><p>{page.description}</p></div>
          <div className="snapshot">{route === 'credits' ? <>来源核对<time>{credits.verified_at}</time></> : <>GitHub 数据快照<time>{github.updatedAt}</time></>}</div>
        </div>
      </section>}
      {Page ? <Page /> : <Empty title="页面未找到">请通过顶部导航返回官网页面。</Empty>}
    </main>
    <footer>
      <div className="footer-top">
        <div><Brand /><p>AI 自主渗透测试系统</p></div>
        <div className="footer-links">
          <a href="console.html">交互体验</a>
          <a href="architecture.html">架构剖析</a>
          <a href="downloads.html">下载与安装</a>
          <a href="credits.html">开源致谢</a>
          <External href={REPO}>GitHub</External>
          <External href={`${REPO}/blob/main/LICENSE`}>许可证</External>
        </div>
      </div>
      <div className="footer-bottom"><span>© 2026 xuzhongxin</span><span>VEXNAR · AGPL-3.0-or-later</span></div>
    </footer>
  </>;
}
