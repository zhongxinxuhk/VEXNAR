// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from 'node:fs/promises';
import { render } from '../.ssr/entry-server.js';
import { pages } from '../src/content.js';
const template = await fs.readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
await fs.cp(new URL('../assets', import.meta.url), new URL('../dist/assets', import.meta.url), { recursive: true });
for (const page of [...pages, { id: 'notfound', label: '页面未找到' }]) {
  let html = template.replace('<!--app-html-->', () => render(page.id)).replace(/<title>.*?<\/title>/, `<title>${page.label} · VEXNAR — AI 自主安全探索</title>`);
  if (page.id === 'notfound') html = html.replace('<head>', '<head><base href="/VEXNAR/">');
  await fs.writeFile(new URL(`../dist/${page.id === 'notfound' ? '404' : page.id}.html`, import.meta.url), html);
}
await fs.writeFile(new URL('../dist/.nojekyll', import.meta.url), '');
await fs.writeFile(new URL('../dist/robots.txt', import.meta.url), 'User-agent: *\nAllow: /\nSitemap: https://zhongxinxuhk.github.io/VEXNAR/sitemap.xml\n');
await fs.writeFile(new URL('../dist/sitemap.xml', import.meta.url), '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + pages.map(p => `<url><loc>https://zhongxinxuhk.github.io/VEXNAR/${p.id}.html</loc></url>`).join('') + '</urlset>');
console.log(`Pre-rendered ${pages.length} React pages + 404. Hashed assets remain relative for GitHub Pages.`);
