// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pages, pageFromPath, platformAssets, filterCredits, safeGithub } from '../src/content.js';
import { architectures } from '../src/architecture.js';
const read = path => fs.readFile(new URL(path, import.meta.url), 'utf8');

test('existing public URLs retain page identity, including project base and 404', () => {
  for (const page of pages) assert.equal(pageFromPath(`/VEXNAR/${page.id}.html`), page.id);
  assert.equal(pageFromPath('/VEXNAR/'), 'index');
  assert.equal(pageFromPath('/'), 'index');
  assert.equal(pageFromPath('/VEXNAR/unknown'), 'notfound');
  assert.ok(pages.findIndex(p => p.id === 'credits') === pages.findIndex(p => p.id === 'contributors') + 1);
});
test('downloads exclude prereleases and do not confuse Darwin with Windows', () => {
  const releases = [
    { tag: 'v1', prerelease: false, assets: [{ name: 'vexnar-darwin-arm64.zip' }, { name: 'vexnar-win-x64.exe' }, { name: 'vexnar-linux-amd64.zip' }] },
    { tag: 'v2-beta', prerelease: true, assets: [{ name: 'beta-mac.dmg' }] }
  ];
  assert.deepEqual(platformAssets(releases, 'mac').map(a => a.name), ['vexnar-darwin-arm64.zip']);
  assert.deepEqual(platformAssets(releases, 'win').map(a => a.name), ['vexnar-win-x64.exe']);
  assert.equal(platformAssets([], 'linux').length, 0);
});
test('credit search combines purpose and text filters', async () => {
  const catalog = JSON.parse(await read('../credits.json'));
  assert.equal(filterCredits(catalog.projects, 'Monaco', '全部').length, 1);
  assert.equal(filterCredits(catalog.projects, '', '编辑器与终端').length, 3);
  assert.equal(filterCredits(catalog.projects, 'Monaco', '数据与运行时').length, 0);
  assert.equal(new Set(catalog.projects.map(p => p.github)).size, catalog.projects.length);
});
test('source-backed diagrams contain no dangling edges and point to real public files', async () => {
  assert.equal(architectures.length, 4);
  for (const diagram of architectures) {
    const ids = new Set(diagram.nodes.map(n => n.id));
    assert.equal(ids.size, diagram.nodes.length);
    for (const [a, b] of diagram.edges) assert.ok(ids.has(a) && ids.has(b));
    for (const id of diagram.sequence) assert.ok(ids.has(id));
    for (const node of diagram.nodes) {
      const source = new URL(`../../${node.source}`, import.meta.url);
      const lines = (await fs.readFile(source, 'utf8')).split('\n');
      assert.ok(node.line > 0 && node.line <= lines.length);
      assert.ok(node.detail.length > 20);
    }
  }
});
test('all pages ship pre-rendered React content, hashed local assets and no private fields', async () => {
  const titles = { index: '洞察攻击面', downloads: '你的工作台', releases: '持续演进', branches: '开发的每一条路径', commits: '每一次提交', contributors: '由每一份贡献', credits: 'OPEN SOURCE CREDITS' };
  for (const page of pages) {
    const html = await read(`../dist/${page.id}.html`);
    assert.ok(html.includes(titles[page.id]), page.id);
    assert.ok(!html.includes('<!--app-html-->'));
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
    for (const [, asset] of html.matchAll(/(?:src|href)="(\.\/assets\/[^"?]+)(?:\?[^\"]*)?"/g)) {
      await fs.access(new URL(`../dist/${asset}`, import.meta.url));
    }
  }
  const snapshot = await read('../.generated/github.json');
  assert.ok(!/"(?:email|Authorization|api_key|token)"\s*:/.test(snapshot));
  const home = await read('../dist/index.html');
  assert.ok(home.includes('技术架构图') && home.includes('缓存设计') && home.includes('工具调用'));
  const missing = await read('../dist/404.html');
  assert.ok(missing.includes('<base href="/VEXNAR/">'));
});
test('untrusted URL values cannot become executable or off-domain links', () => {
  for (const url of ['javascript:alert(1)', 'https://github.com.evil.invalid/x', 'https://evil.invalid']) assert.equal(safeGithub(url), 'https://github.com/zhongxinxuhk/VEXNAR');
});
