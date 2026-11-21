// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState, type ComponentType } from 'react';
import Home from './components/Home.tsx';
import Credits from './components/Credits.tsx';
import QuickSearch from './components/QuickSearch.tsx';
import ConsolePage from './components/ConsolePage.tsx';
import ArchitecturePage from './components/ArchitecturePage.tsx';
import { Downloads, Releases, Branches, Commits, Contributors } from './components/ProjectPages.tsx';
import { Brand, External, Empty, Icon } from './components/UI.tsx';
import githubData from '../.generated/github.json';
import credits from '../credits.json';
import { REPO, pages, pageFromPath, type PageId } from './content.ts';

/** The public fields of the generated snapshot the shell prints in the page intro. */
interface GithubShellSnapshot { updatedAt: string }

const github: GithubShellSnapshot = githubData;

/** Page component per route id; unknown routes render the not-found panel instead. */
const content: Partial<Record<PageId, ComponentType>> = {
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
/** Routes that open on their own intro instead of the shell's page breadcrumb. */
const ownIntro: ReadonlySet<string> = new Set(['console', 'architecture']);

/** Props of the site shell: the route this document was resolved for. */
interface AppProps { initialPage?: PageId }

export default function App({ initialPage = 'index' }: AppProps) {
  const [route, setRoute] = useState<PageId>(initialPage), [menu, setMenu] = useState(false), [search, setSearch] = useState(false), [scrolled, setScrolled] = useState(false);
  const mainRef = useRef<HTMLElement>(null), firstRender = useRef(true), menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const pagePaths = new Set(pages.map(page => `${page.id}.html`));
    const pop = () => { setRoute(pageFromPath(location.pathname)); setMenu(false); setSearch(false); };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
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
    const key = (event: KeyboardEvent) => {
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
  // The client route renders the application shell alone: no website header,
  // footer, quick search or max-width wrapper around it.
  if (route === 'console' && Page) return <Page />;
  return <>
    <a className="skip" href="#main">跳转到正文</a>
    <header className={`header ${scrolled ? 'scrolled' : ''}`}>
      <div className="nav-shell">
        <div className="brand-cluster">
          <Brand />
          <span className="brand-divider" aria-hidden="true" />
          <a className="unit-brand" href="https://sec.hn.cn" target="_blank" rel="noopener noreferrer" title="希灵安全 · sec.hn.cn">
            <img className="unit-logo" src="assets/sec-logo.png" width="84" height="24" alt="希灵 SEC · sec.hn.cn" />
          </a>
        </div>
        <nav id="navigation" className={menu ? 'open' : ''} aria-label="主导航">
          {pages.map(item => <a key={item.id} href={`${item.id}.html`} aria-current={route === item.id ? 'page' : undefined}>{item.label}</a>)}
        </nav>
        <div className="nav-actions">
          <button className="search-toggle" aria-label="搜索网站" onClick={() => setSearch(true)}><Icon name="search" size={15} /><span>搜索</span><kbd>⌘K</kbd></button>
          <External href={REPO} className="github-link"><Icon name="github" size={15} /><span>GitHub</span></External>
          <button ref={menuButton} className="menu-toggle icon-button" aria-label={menu ? '关闭导航菜单' : '打开导航菜单'} aria-expanded={menu} aria-controls="navigation" onClick={() => setMenu(!menu)}><Icon name={menu ? 'close' : 'menu'} /></button>
        </div>
      </div>
    </header>
    <QuickSearch open={search} onClose={() => setSearch(false)} />
    <main id="main" tabIndex={-1} ref={mainRef} key={route} className={`page page-${route}`}>
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
        <div className="footer-brand">
          <Brand />
          <p>AI 自主渗透测试系统。任务编排、工具审查、双图证据与独立复验，都留在同一个工作区。</p>
          <a className="footer-unit" href="https://sec.hn.cn" target="_blank" rel="noopener noreferrer">
            <img src="assets/sec-logo.png" width="70" height="20" alt="" />
            <span>sec.hn.cn</span>
          </a>
        </div>
        <nav className="footer-col" aria-label="站点导航">
          <span>站点</span>
          <a href="index.html">总览</a>
          <a href="console.html">客户端</a>
          <a href="architecture.html">架构剖析</a>
          <a href="downloads.html">下载与安装</a>
          <a href="credits.html">开源致谢</a>
        </nav>
        <nav className="footer-col" aria-label="项目资源">
          <span>项目</span>
          <a href="releases.html">版本更新</a>
          <a href="branches.html">分支</a>
          <a href="commits.html">提交记录</a>
          <External href={`${REPO}/blob/main/LICENSE`}>许可证</External>
          <External href={REPO}>GitHub</External>
        </nav>
      </div>
      <div className="footer-bottom">
        <p className="footer-copy">© 2026 xuzhongxin <i aria-hidden="true" /> VEXNAR <i aria-hidden="true" /> AGPL-3.0-or-later</p>
        <div className="footer-legal">
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">琼ICP备2025060601号-1</a>
          <span className="legal-sep" aria-hidden="true" />
          <a href="https://beian.mps.gov.cn/#/query/webSearch?code=46010002001548" target="_blank" rel="noopener noreferrer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 2.6 8 3.1v6c0 5.2-8 9.7-8 9.7S4 16.9 4 11.7v-6l8-3.1Z" /><path d="m12 8.2 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6L8.2 11l2.6-.4L12 8.2Z" /></svg>
            琼公网安备46010002001548号
          </a>
        </div>
      </div>
    </footer>
  </>;
}
