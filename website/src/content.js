// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

export const REPO = 'https://github.com/zhongxinxuhk/VEXNAR';
export const pages = [
  { id: 'index', label: '总览' },
  { id: 'downloads', label: '下载中心', eyebrow: 'DESIGNED FOR YOUR WORKSPACE', title: '你的工作台，准备就绪。', description: '选择适合你的平台。下载链接直接指向 GitHub 正式 Release 资产。' },
  { id: 'releases', label: '版本更新', eyebrow: 'THE CHANGELOG', title: '持续演进，步步可见。', description: '跟随每一次公开发行，了解 VEXNAR 的能力与变化。' },
  { id: 'branches', label: '分支', eyebrow: 'DEVELOPMENT BRANCHES', title: '看见开发的每一条路径。', description: '从默认分支到功能分支，探索项目正在发生的变化。' },
  { id: 'commits', label: '提交记录', eyebrow: 'A RECORD OF PROGRESS', title: '每一次提交，都是向前。', description: '阅读默认分支的真实提交，追踪项目的细节与进展。' },
  { id: 'contributors', label: '合作者', eyebrow: 'BUILT TOGETHER', title: '由每一份贡献，连接而成。', description: '感谢参与代码建设的开源贡献者，让安全探索的工具持续变好。' },
  { id: 'credits', label: '开源致谢', eyebrow: 'OPEN SOURCE CREDITS', title: '让每一份贡献，被看见。', description: '致谢 VEXNAR 使用、参考与借鉴的开源项目，以及持续创造的作者与社区。' }
];
export function pageFromPath(path) {
  const file = path.split('/').filter(Boolean).at(-1) || 'index';
  const id = file.replace(/\.html$/, '');
  return pages.some(p => p.id === id) ? id : (file === 'VEXNAR' ? 'index' : 'notfound');
}
export function isPlatformAsset(name, platform) {
  const n = name.toLowerCase();
  return ({ mac: /\.dmg$|macos|darwin|(?:^|[-_])mac(?:[-_.]|$)/, win: /\.exe$|\.msi$|windows|win32|(?:^|[-_])win(?:[-_.]|$)/, linux: /linux|\.appimage$|\.deb$|\.rpm$/ })[platform].test(n);
}
export function platformAssets(releases, platform) {
  return releases.filter(r => !r.prerelease).flatMap(release => release.assets.filter(a => isPlatformAsset(a.name, platform)).map(asset => ({ ...asset, version: release.tag })));
}
export function filterCredits(projects, query, category) {
  const q = query.trim().toLocaleLowerCase();
  return projects.filter(p => (category === '全部' || p.category === category) && [p.name, p.author, p.usage, p.license, p.kind].join(' ').toLocaleLowerCase().includes(q));
}
export function safeGithub(url) {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && parsed.hostname === 'github.com' ? url : REPO; }
  catch { return REPO; }
}
