// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pages, pageFromPath, platformAssets, filterCredits, safeGithub } from '../src/content.js';
import { architectures } from '../src/architecture.js';
import { contracts as layerContracts, layers, lifecycle } from '../src/architecture/layers.js';
import { approvals as demoApprovals, conversations, graph, graphLegend, toolCatalog, transcripts } from '../src/console/data.js';
import { consoleNav } from '../src/console/nav.js';
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
test('agent UI references appear in the published credits with MIT links', async () => {
  const catalog = JSON.parse(await read('../credits.json'));
  const rendered = await read('../dist/credits.html');
  for (const [name, kind] of [['Motif', '交互改编'], ['GAIA UI', '设计参考'], ['Halaska UI', '设计参考']]) {
    const [project] = filterCredits(catalog.projects, name, 'UI 与交互');
    assert.equal(project?.name, name);
    assert.equal(project.kind, kind);
    assert.equal(project.license, 'MIT');
    assert.ok(rendered.includes(project.github));
    assert.ok(rendered.includes(project.license_url));
  }
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
  const titles = { index: '让一支 Agent 团队', console: 'VEXNAR 客户端', architecture: '把系统拆成六层', downloads: '下载 VEXNAR', releases: '版本与更新', branches: '开发分支', commits: '代码提交', contributors: '项目合作者', credits: 'Open Source Projects' };
  for (const page of pages) {
    const html = await read(`../dist/${page.id}.html`);
    assert.ok(html.includes(titles[page.id]), page.id);
    assert.ok(!html.includes('<!--app-html-->'));
    const expectedCurrent = page.id === 'console' ? 0 : 1;
    assert.equal((html.match(/aria-current="page"/g) || []).length, expectedCurrent, page.id);
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

test('3D layers stay source-backed, cross-referenced and free of dangling ids', async () => {
  assert.equal(layers.length, 6);
  const layerIds = new Set(layers.map(layer => layer.id));
  assert.equal(layerIds.size, layers.length);
  const nodeIds = new Set();
  for (const layer of layers) {
    assert.equal(layer.facts.length, 3);
    assert.ok(layer.contracts.length >= 2);
    assert.ok(layer.risks.length >= 2);
    for (const node of layer.nodes) {
      assert.ok(!nodeIds.has(node.id), `duplicate node id ${node.id}`);
      nodeIds.add(node.id);
      const lines = (await fs.readFile(new URL(`../../${node.source}`, import.meta.url), 'utf8')).split('\n');
      assert.ok(node.line > 0 && node.line <= lines.length, `${node.source}:${node.line}`);
      assert.ok(node.detail.length > 30 && node.tags.length > 0, node.id);
    }
  }
  for (const step of lifecycle) assert.ok(layerIds.has(step.layer) && nodeIds.has(step.node), step.event);
  assert.equal(lifecycle.length, 8);
  for (const row of layerContracts) assert.equal(row.length, 5);
});
test('console demo keeps every interactive surface wired to existing data', () => {
  const items = consoleNav.flatMap(group => group.items);
  assert.equal(items.length, 21);
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  const conversationIds = new Set(conversations.map(chat => chat.id));
  for (const chat of conversations) assert.equal(chat.state === 'empty' || Boolean(transcripts[chat.id]), true, chat.id);
  for (const [id, steps] of Object.entries(transcripts)) {
    assert.ok(conversationIds.has(id), id);
    assert.equal(new Set(steps.map(step => step.id)).size, steps.length, id);
    for (const step of steps) {
      if (step.kind !== 'tool') continue;
      assert.ok(toolCatalog.some(tool => tool.name === step.tool), step.tool);
      assert.ok(step.output.length > 0);
    }
  }
  const approvalIds = new Set(demoApprovals.map(row => row.id));
  for (const step of transcripts.main.filter(entry => entry.kind === 'approval')) assert.ok(approvalIds.has(step.approval || 'AP-88'));
  const graphIds = new Set(graph.nodes.map(node => node.id));
  for (const [from, to] of graph.edges) assert.ok(graphIds.has(from) && graphIds.has(to), `${from}->${to}`);
});
test('client page is a bare application shell, architecture ships interactive markup', async () => {
  const consolePage = await read('../dist/console.html');
  for (const marker of ['cx-titlebar', 'is-client', '主 Agent · 编排会话', '允许一次', '待办', '⌘J', '新建对话', '返回官网']) assert.ok(consolePage.includes(marker), marker);
  assert.ok(!consolePage.includes('class="header'), 'client page must not render the site header');
  assert.ok(!consolePage.includes('footer-top'), 'client page must not render the site footer');
  assert.ok(!consolePage.includes('class="skip"'), 'client page must not render site chrome');
  assert.ok(!consolePage.includes('data-theme'), 'client page ships a single light appearance');
  const architecturePage = await read('../dist/architecture.html');
  for (const marker of ['INTERACTION', 'ORCHESTRATION', 'SUBSTRATE', 'EVENT LIFECYCLE', '层间契约', '剖析导览']) assert.ok(architecturePage.includes(marker), marker);
  assert.ok(architecturePage.includes('layer-evidence'));
  const home = await read('../dist/index.html');
  assert.ok(home.includes('assets/client/console-chat') && home.includes('打开客户端体验'));
  assert.ok(!home.includes('cx-window'), 'the client must not be embedded in the website');
});

test('exploration graph demo keeps typed nodes, legend tones and bounded coordinates', () => {
  const types = new Set(graphLegend.map(row => row.type));
  for (const type of ['起点', '目标', '意图', '事实', '漏洞', '提示']) assert.ok(types.has(type), type);
  assert.equal(graphLegend.length, graph.nodes.reduce((set, node) => set.add(node.type), new Set()).size);
  for (const node of graph.nodes) {
    assert.ok(types.has(node.type), node.id);
    assert.ok(node.x >= 0 && node.x + 160 <= 1000, `${node.id} x`);
    assert.ok(node.y >= 0 && node.y + 54 <= 560, `${node.id} y`);
    assert.ok(node.detail.length > 10 && node.sub.length > 0, node.id);
  }
  assert.equal(graph.edges.length, 13);
  assert.equal(new Set(graph.nodes.map(node => node.id)).size, graph.nodes.length);
});

test('credits put DSH first and enumerate its built-in plugins and themes', async () => {
  const catalog = JSON.parse(await read('../credits.json'));
  const dsh = catalog.dsh;
  assert.equal(dsh.name, 'DeepSeek Harness');
  assert.ok(dsh.version.startsWith('0.2.'));
  assert.ok(dsh.builtins.length >= 190, String(dsh.builtins.length));
  const ids = new Set();
  for (const row of dsh.builtins) {
    assert.ok(row.package.startsWith('@deepseek-ai/'), row.package);
    assert.ok(ids.add(row.id), `duplicate ${row.id}`);
    assert.ok(row.dir && row.url.includes(`/tree/${dsh.tag}/`), row.id);
    assert.ok(['启用', '停用', '条件启用'].includes(row.state), row.id);
    assert.ok(row.license && row.license_url.includes('/LICENSE'), row.id);
  }
  for (const pkg of ['@deepseek-ai/dsh-client-ui-theme', '@deepseek-ai/dsh-plugin-manager', '@deepseek-ai/dsh-mcp-manager', '@deepseek-ai/dsh-skill-office']) {
    assert.ok(dsh.builtins.some(row => row.package === pkg), pkg);
  }
  const groups = new Set(dsh.builtins.map(row => row.group));
  for (const group of groups) assert.ok(['Agent 能力', '工具与文件', '会话与数据', '插件与设置', '模型与网络', '客户端界面', '平台与传输', '安全与审批', '主题与外观'].includes(group), group);
  assert.ok(!groups.has('其他'));
  for (const state of ['启用', '停用', '条件启用']) assert.ok(dsh.builtins.some(row => row.state === state), state);
  for (const name of ['浅色主题', '深色主题', '跟随系统', 'Montserrat', 'Shiki']) assert.ok(dsh.themes.some(theme => theme.name === name), name);
  assert.ok(!catalog.projects.some(project => project.name === 'DeepSeek Harness'));
  const rendered = await read('../dist/credits.html');
  assert.ok(rendered.includes('dsh-credits'));
  assert.ok(rendered.indexOf('DeepSeek Harness') < rendered.indexOf('Open Source Projects'), 'DSH must render above the project directory');
  for (const marker of ['@deepseek-ai/dsh-plugin-manager', 'Montserrat', 'Shiki', '条件启用', '置顶']) assert.ok(rendered.includes(marker), marker);
  await fs.access(new URL(`../dist/${dsh.logo}`, import.meta.url));
});
