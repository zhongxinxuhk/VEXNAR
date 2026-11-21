// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

export const REPO = 'https://github.com/zhongxinxuhk/VEXNAR';

/** Every page the site ships a pre-rendered document for (`<id>.html`). */
export type SitePageId =
  | 'index'
  | 'console'
  | 'architecture'
  | 'downloads'
  | 'releases'
  | 'branches'
  | 'commits'
  | 'contributors'
  | 'credits';

/** Result of resolving a request path: a known page, or the not-found page. */
export type PageId = SitePageId | 'notfound';

/**
 * One entry of the page registry. `title`/`description` are only carried by the
 * inner pages; `index` has neither and renders its own hero copy.
 */
export interface Page {
  id: SitePageId;
  label: string;
  title?: string;
  description?: string;
}

export const pages: Page[] = [
  { id: 'index', label: '总览' },
  { id: 'console', label: '客户端', title: 'VEXNAR 客户端', description: '全屏 Agent 客户端：对话、工具调用、审批、探索图与系统配置。' },
  { id: 'architecture', label: '架构剖析', title: '技术架构剖析', description: '六层结构、层间契约与四套节点级架构图，每个节点链接到公开源码。' },
  { id: 'downloads', label: '下载中心', title: '下载 VEXNAR', description: '选择平台，查看公开发行包与安装方式。' },
  { id: 'releases', label: '版本更新', title: '版本与更新', description: '公开发行记录、版本说明与预发布信息。' },
  { id: 'branches', label: '分支', title: '开发分支', description: '查看公开分支、默认分支与对应的提交历史。' },
  { id: 'commits', label: '提交记录', title: '代码提交', description: '默认分支最近的公开变更，支持按说明、作者或 SHA 检索。' },
  { id: 'contributors', label: '合作者', title: '项目合作者', description: '参与 VEXNAR 代码建设的开源贡献者。' },
  { id: 'credits', label: '开源致谢', title: '开源致谢', description: 'VEXNAR 使用的开源软件，以及开发过程中参考的项目。' }
];
export function pageFromPath(path: string): PageId {
  const file = path.split('/').filter(Boolean).at(-1) || 'index';
  const id = file.replace(/\.html$/, '');
  const match = pages.find(p => p.id === id);
  return match ? match.id : (file === 'VEXNAR' ? 'index' : 'notfound');
}

/** Download platforms the site groups release assets by. */
export type Platform = 'mac' | 'win' | 'linux';

export function isPlatformAsset(name: string, platform: Platform): boolean {
  const n = name.toLowerCase();
  return ({ mac: /\.dmg$|macos|darwin|(?:^|[-_])mac(?:[-_.]|$)/, win: /\.exe$|\.msi$|windows|win32|(?:^|[-_])win(?:[-_.]|$)/, linux: /linux|\.appimage$|\.deb$|\.rpm$/ })[platform].test(n);
}

/**
 * One file attached to a GitHub release. Only `name` is guaranteed by the
 * download UI; the extra fields come straight from the generated snapshot and
 * stay `unknown` so a malformed snapshot cannot leak a false shape.
 */
export interface ReleaseAsset {
  name: string;
  url?: string;
  size?: number;
  [field: string]: unknown;
}

/** One entry of the generated GitHub release feed. */
export interface Release {
  tag: string;
  prerelease: boolean;
  assets: ReleaseAsset[];
}

/** A release asset tagged with the version it belongs to. */
export type PlatformAsset = ReleaseAsset & { version: string };

export function platformAssets(releases: readonly Release[], platform: Platform): PlatformAsset[] {
  return releases.filter(r => !r.prerelease).flatMap(release => release.assets.filter(a => isPlatformAsset(a.name, platform)).map(asset => ({ ...asset, version: release.tag })));
}

/** One row of `credits.json`'s `projects`. Logo fields are optional. */
export interface CreditProject {
  name: string;
  github: string;
  author: string;
  category: string;
  kind: string;
  usage: string;
  license: string;
  license_url: string;
  logo?: string;
  logo_kind?: string;
  logo_source?: string;
  note?: string;
}

export function filterCredits(projects: readonly CreditProject[], query: string, category: string): CreditProject[] {
  const q = query.trim().toLocaleLowerCase();
  return projects.filter(p => (category === '全部' || p.category === category) && [p.name, p.author, p.usage, p.license, p.kind].join(' ').toLocaleLowerCase().includes(q));
}
export function safeGithub(url: string): string {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && parsed.hostname === 'github.com' ? url : REPO; }
  catch { return REPO; }
}
