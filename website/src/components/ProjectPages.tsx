// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react';
import githubData from '../../.generated/github.json';
import { REPO, isPlatformAsset, platformAssets, type Platform, type PlatformAsset } from '../content.ts';
import { External, Empty, Icon } from './UI.tsx';

/** One branch row of the generated GitHub snapshot. */
interface BranchRow {
  name: string;
  sha: string;
}

/** One commit row of the generated GitHub snapshot. */
interface CommitRow {
  sha: string;
  url: string;
  message: string;
  author: string;
  date: string;
}

/** One contributor row of the generated GitHub snapshot. */
interface ContributorRow {
  name: string;
  url: string;
  contributions: number;
}

/** One release row of the generated GitHub snapshot. */
interface ReleaseRow {
  tag: string;
  name: string;
  url: string;
  date: string;
  body?: string;
  prerelease: boolean;
  assets: { name: string; url?: string; size?: number }[];
}

/** The public fields `scripts/prepare_data.py` keeps in `.generated/github.json`. */
interface GithubSnapshot {
  updatedAt: string;
  repo: { stars: number; defaultBranch: string };
  releases: ReleaseRow[];
  branches: BranchRow[];
  commits: CommitRow[];
  contributors: ContributorRow[];
}

/** The generated snapshot, narrowed from the JSON module to the fields the pages read. */
const github: GithubSnapshot = githubData;

/** One download card of the platform grid. */
type PlatformCard = [name: string, platform: Platform, symbol: string, description: string];
const PLATFORM_CARDS: PlatformCard[] = [
  ['macOS', 'mac', '⌘', 'Apple Silicon（arm64）'],
  ['Windows', 'win', '⊞', 'Windows x64'],
  ['Linux', 'linux', '△', '暂未打包']
];

/** Release asset that carries a download URL in the generated snapshot. */
type DownloadableAsset = PlatformAsset & { url: string };
const isDownloadableAsset = (asset: PlatformAsset): asset is DownloadableAsset => typeof asset.url === 'string' && asset.url.length > 0;

/** `Object.groupBy` is ES2024 and the site's lib target is ES2022, so it is read through an explicit shape. */
type GroupBy = <T>(items: readonly T[], key: (item: T) => string) => Record<string, T[]>;
const nativeGroupBy = (Object as unknown as { groupBy?: GroupBy }).groupBy;
export function Downloads() {
  const [platform,setPlatform]=useState('all');
  // 最新一版：有条目的正式发行里，含 mac 或 win 安装包的那个（Linux 暂不打包）。
  const latest = github.releases.find(r=>!r.prerelease&&r.assets.some(a=>isPlatformAsset(a.name,'mac')||isPlatformAsset(a.name,'win')));
  const [device,setDevice]=useState('');
  useEffect(()=>{const ua=navigator.userAgent;setDevice(/Mac/.test(ua)?'mac':/Windows/.test(ua)?'win':/Linux/.test(ua)?'linux':'');},[]);
  return <><div className="page-tools"><div className="segmented" role="group" aria-label="下载平台">{[['all','全部平台'],['mac','macOS'],['win','Windows'],['linux','Linux']].map(([id,label])=><button key={id} aria-pressed={platform===id} onClick={()=>setPlatform(id)}>{label}</button>)}</div><External href={`${REPO}/releases`} className="understated-link">GitHub Releases</External></div>{latest&&<p className="data-note">最新版本 <b>{latest.tag}</b> · {latest.date} · <External href={latest.url}>查看发行说明</External></p>}<div className="download-grid">{PLATFORM_CARDS.filter(([,id])=>platform==='all'||id===platform).map(([name,id,symbol,description])=>{const assets=platformAssets(github.releases,id);return <article className="download-card" key={id}><div className="download-card-top"><span className="os-icon">{symbol}</span>{device===id&&<span className="tag">当前设备</span>}</div><h2>{name}</h2><p>{description}</p><div className="download-assets">{assets.length?assets.slice(0,8).filter(isDownloadableAsset).map(a=><External href={a.url} className="asset" key={a.url}><Icon name="download" size={18}/><span>{a.name}<small>{a.version} · {((a.size??0)/1048576).toFixed(1)} MB</small></span></External>):<><span className="release-state">尚未发布</span><p>暂无此平台的正式公开安装包。</p><External href={`${REPO}#安装`} className="button secondary">查看源码安装</External></>}</div></article>;})}</div><section className="installation-guide"><div><span className="section-label">其他安装方式</span><h2>源码构建与插件开发。</h2><p>客户端安装包之外，仓库提供源码构建、插件开发与自托管说明；Go 服务端不再随客户端一起发布，需要时按仓库文档自行构建。</p></div><div className="installation-options"><External href={`${REPO}#安装`}><Icon name="terminal"/><span><b>安装与构建说明</b><small>依赖、启动方式与配置要求</small></span></External><External href={`${REPO}/releases`}><Icon name="download"/><span><b>完整发行资产</b><small>版本、平台与包文件</small></span></External></div></section></>;
}
export function Releases(){const[channel,setChannel]=useState('all');const releases=github.releases.filter(r=>channel==='all'||(channel==='stable'?!r.prerelease:r.prerelease));return <><div className="page-tools"><div className="segmented" role="group" aria-label="发行类型">{[['all','全部发行'],['stable','正式版本'],['preview','预发布']].map(([id,label])=><button key={id} aria-pressed={channel===id} onClick={()=>setChannel(id)}>{label}</button>)}</div><span className="result-count">{releases.length} 个版本</span></div>{releases.length?<div className="release-list">{releases.map(r=><article className="release" key={r.tag}><div className="release-date"><time>{r.date}</time><span className="tag">{r.prerelease?'预发布':'正式版本'}</span></div><div><h2><External href={r.url}>{r.name}</External></h2><pre className="release-body">{r.body||'此版本没有填写发行说明。'}</pre><External href={r.url} className="understated-link">查看完整发行说明</External></div></article>)}</div>:<Empty title="暂无公开发行记录" href={`${REPO}/releases`} label="查看 GitHub Releases">该分类下暂时没有公开 Release。发布后，此页会显示版本说明及对应下载入口。</Empty>}</>;}
export function Branches(){const[query,setQuery]=useState('');const branches=github.branches.filter(b=>b.name.toLowerCase().includes(query.toLowerCase()));return <><div className="page-tools"><label className="search-field"><Icon name="search" size={18}/><input aria-label="搜索分支" placeholder="搜索分支名称" value={query} onChange={e=>setQuery(e.target.value)}/></label><span className="result-count">{branches.length} 个公开分支</span></div><div className="branch-list">{branches.map(b=><article className="branch-row" key={b.name}><div className="branch-identity"><Icon name="branch"/><div><h2><External href={`${REPO}/tree/${encodeURIComponent(b.name)}`}>{b.name}</External></h2><code>{b.sha.slice(0,8)}</code></div>{b.name===github.repo.defaultBranch&&<span className="tag">默认分支</span>}</div><External href={`${REPO}/commits/${encodeURIComponent(b.name)}`} className="understated-link">查看提交</External></article>)}{branches.length===0&&<p className="filter-empty">没有匹配的分支。</p>}</div><p className="data-note">展示最多 100 个公开分支；默认分支信息由 GitHub 仓库提供。</p></>;}
export function Commits(){const[query,setQuery]=useState('');const commits=github.commits.filter(c=>`${c.message} ${c.author} ${c.sha}`.toLowerCase().includes(query.toLowerCase()));const groups: Record<string, CommitRow[]> = nativeGroupBy ? nativeGroupBy(commits, c => c.date) : commits.reduce<Record<string, CommitRow[]>>((all, c) => { (all[c.date] ||= []).push(c); return all; }, {});return <><div className="page-tools"><label className="search-field wide"><Icon name="search" size={18}/><input aria-label="搜索提交" placeholder="搜索提交说明、作者或 SHA" value={query} onChange={e=>setQuery(e.target.value)}/></label><span className="result-count">{commits.length} 次提交</span></div><div className="commit-list">{Object.entries(groups).map(([date,items])=><section className="commit-group" key={date}><div className="commit-group-date"><Icon name="commit" size={18}/><time>{date}</time></div><div>{items.map(c=><article className="commit" key={c.sha}><div><h2><External href={c.url}>{c.message}</External></h2><p>{c.author}</p></div><External href={c.url} className="sha">{c.sha.slice(0,8)}</External></article>)}</div></section>)}{commits.length===0&&<p className="filter-empty">没有匹配的提交。</p>}</div><p className="data-note">默认分支最近 50 次公开提交。完整历史可在 GitHub 中查看。</p></>;}
export function Contributors(){return <><div className="community-intro"><p>代码、文档、问题反馈和测试，都是项目的一部分。</p><External href={`${REPO}/issues`} className="button secondary">参与项目讨论</External></div><div className="people">{github.contributors.map(c=><External href={c.url} className="person" key={c.name}><img src={`https://github.com/${encodeURIComponent(c.name)}.png?size=160`} width="72" height="72" alt={`${c.name} 的头像`} loading="lazy"/><div><h2>{c.name}</h2><p>{c.contributions} 次提交贡献</p></div><span className="understated-link">GitHub 主页</span></External>)}</div><section className="contribute-panel"><div><Icon name="code" size={28}/><h2>参与 VEXNAR</h2><p>可以从问题复现、文档修订或一个具体的功能改进开始。</p></div><div><External href={`${REPO}/issues`}>查看 Issues</External><External href={`${REPO}/pulls`}>查看 Pull Requests</External><a href="credits.html">查看开源致谢</a></div></section><p className="data-note">此页展示 GitHub 公开代码贡献者。</p></>;}
