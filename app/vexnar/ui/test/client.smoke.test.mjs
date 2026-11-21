// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Smoke test for the built client bundle.
 *
 * It exists because of a real regression: a rewrite of client.tsx dropped
 * `export const inject = ['slots']`, so dsh never injected the slots service,
 * every registration threw, and the sidebar silently fell back to the shell's
 * own artwork. Nothing in the build or typecheck caught it — only a browser
 * did. This test drives the built artifact the way the dsh module loader does.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const bundle = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')

// Browser stubs live for the whole test process: the plugin reads globals such
// as `document` at call time, not only while the bundle is evaluated.
const element = () => ({ id: '', textContent: '', remove() {}, append() {}, setAttribute() {} })
globalThis.document = {
  head: { append() {} },
  // A plain dsh shell: no Claude-style skin marker, so the skin brand guard
  // must stay inert.
  body: { hasAttribute: () => false, querySelectorAll: () => [] },
  createElement: element,
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => []
}
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })
globalThis.HTMLElement ??= class {}
globalThis.MutationObserver ??= class { observe() {} disconnect() {} }

// The bundle is loaded, not rendered, so the hooks only have to exist: a
// missing name here fails the whole plugin, not one component, and the shell
// then silently drops every VEXNAR surface.
const react = {
  createElement: (type, props, ...kids) => ({ type, props, kids }),
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useRef: (v) => ({ current: v }),
  useReducer: (fn, v) => [v, () => {}],
  useContext: () => ({}),
  createContext: (v) => ({ _currentValue: v, Provider: Symbol('provider'), Consumer: Symbol('consumer') }),
  memo: (component) => component,
  forwardRef: (render) => render,
  Children: { map: (kids, fn) => (Array.isArray(kids) ? kids.map(fn) : []) },
  isValidElement: (node) => Boolean(node && typeof node === 'object' && 'type' in node),
  StrictMode: Symbol('strict'),
  Fragment: Symbol('fragment')
}
const requireShim = (name) => {
  if (name === 'react') return react
  if (name === 'react/jsx-runtime') return { jsx: () => ({}), jsxs: () => ({}), Fragment: react.Fragment }
  return {}
}

/** Load the bundle the way the dsh module loader does, and return its plugin. */
function loadPlugin() {
  let loaded = null
  globalThis.window = { __ModuleLoader__: { load: (m) => { loaded = m } } }
  new Function('require', bundle)(requireShim)
  assert.ok(loaded !== null, 'bundle must call window.__ModuleLoader__.load')
  assert.equal(loaded.id, '@vexnar/dsh-ui')
  return loaded.factory(requireShim)
}

test('plugin declares the slots service', () => {
  const plugin = loadPlugin()
  assert.deepEqual(plugin.inject, ['slots'],
    'without `export const inject = ["slots"]` dsh never injects ctx.slots')
})

test('apply registers every surface it owns', () => {
  const plugin = loadPlugin()
  const injected = []
  const registered = []
  plugin.apply({
    slots: {
      inject: (name, cb) => { injected.push(name); cb() },
      register: (options) => { registered.push([options.name, options.key ?? options.id].filter(Boolean).join(':')) }
    },
    effect: (fn) => fn()
  })
  // 项目流量由会话动作和全局流量入口打开。
  const expected = [
    'tool.call.toolview:mcp__vexnar__report_finding',
    'tool.call.toolview:mcp__vexnar__traffic_get',
    'conversation.session.header.actions:vexnar-yak-history',
    // 抓包开关也挂在会话头部：它作用的是当前会话的抓包范围，与流量入口并列。
    'conversation.session.header.actions:vexnar-session-capture',
    'conversation.hero.options:vexnar-yak-history',
    ...['overview', 'tasks', 'traffic']
      .flatMap((panel) => [`main:vexnar-${panel}`, `sidebar.panellist:vexnar-${panel}`]),
    ...['notify', 'intercept']
      .map((section) => `settings.section:vexnar-${section}`),
    // 工具与 MCP 是「内置插件」分区的标签页，不再单独占一节设置。
    ...['tools', 'mcp']
      .map((tab) => `settings.plugins.tab:vexnar-plugin-${tab}`),
    'sidebar.brand.mark',
    'sidebar.brand.name',
    'conversation.hero.brand.mark'
  ]
  assert.deepEqual(injected, expected.map((entry) => entry.split(':')[0]))
  assert.deepEqual(registered, expected)
})

test('obsolete sidebar and settings entries are absent', () => {
  const plugin = loadPlugin()
  const ids = []
  plugin.apply({
    slots: {
      inject: (name, cb) => cb(),
      register: (options) => { ids.push(`${options.name}:${options.key ?? options.id}`) }
    },
    effect: (fn) => fn()
  })
  for (const gone of ['vexnar-findings', 'vexnar-tool-run', 'vexnar-logs', 'vexnar-workbench',
    'vexnar-mcp', 'vexnar-tools', 'vexnar-asset-sync', 'vexnar-assets', 'vexnar-approvals']) {
    assert.equal(ids.some((id) => id.endsWith(`:${gone}`)), false,
      `${gone} must no longer register a panel or settings section: 发现 is a tab of 任务, 工具执行 lives in the task detail`)
  }
  assert.ok(ids.includes('sidebar.panellist:vexnar-tasks'), 'the task panel owns the sidebar entry')
  assert.equal(ids.includes('settings.section:vexnar-tools-mcp'), false,
    'tools and MCP no longer own a settings section: they are tabs of 内置插件')
  assert.ok(ids.includes('settings.plugins.tab:vexnar-plugin-tools'), 'the tools list is a tab of the plugins section')
  assert.ok(ids.includes('settings.plugins.tab:vexnar-plugin-mcp'), 'the MCP server list is a tab of the plugins section')
})

test('the agent roster lives in dsh, not in a VEXNAR settings section', () => {
  const plugin = loadPlugin()
  const ids = []
  plugin.apply({
    slots: {
      inject: (name, cb) => cb(),
      register: (options) => { ids.push(`${options.name}:${options.key ?? options.id}`) }
    },
    effect: (fn) => fn()
  })
  // 引擎角色是 cordis.patch.yml 里的 @deepseek-ai/dsh-agent-preset 行，名册与编辑
  // 只留在 dsh 自己的设置 → Agent 预设；VEXNAR 不再注册第二个 agent 设置节。
  assert.equal(ids.some((id) => id === 'settings.section:vexnar-agents'), false,
    'vexnar-agents must not register: 设置 → Agent 预设 is the single roster')
  assert.equal(bundle.includes("'/api/agents'"), false,
    'the client keeps no agent roster page, so it must not read /api/agents')
})

test('a missing slots service degrades instead of throwing', () => {
  const plugin = loadPlugin()
  assert.doesNotThrow(() => plugin.apply({}),
    'a failed service must not take the whole client plugin down')
})

test('the skin brand guard targets the skin-owned brand nodes', () => {
  // The guard exists because the Claude-style skin draws its own sidebar brand
  // and never renders the host `sidebar.brand.*` occupants.
  assert.ok(bundle.includes('brand-identity'), 'brand-identity part must be rewritten')
  assert.ok(bundle.includes('rail-mark'), 'collapsed rail mark must be rewritten too')
  assert.ok(bundle.includes('vx-brand-word'), 'the injected wordmark needs its class')
})

test('拦截规则设置面用的就是 Web 控制台那组接口', () => {
  // 设置页是 Web `/system/intercept` 的第二个客户端，不是第二份真相：
  // 规则、拦截范围、模型兜底与用量必须落在同一组端点上。
  for (const endpoint of [
    '/api/intercept/rules',
    '/api/intercept/tool-config',
    '/api/intercept/judge',
    '/api/intercept/judge/usage',
    '/api/llm/profiles'
  ]) {
    assert.ok(bundle.includes(endpoint), `settings page must read ${endpoint}, the same endpoint the web console uses`)
  }
  assert.ok(bundle.includes('vx-int-table'), 'the rules table ships its own styles')
  assert.ok(bundle.includes('vx-int-switch'), 'enable/disable is a switch, not a text column')
})

test('浮层挂到 body：设置弹窗的 transform 不能当它的容器', () => {
  // 真实回归：设置弹窗（以及 Claude Style 皮肤）中间层带 transform，`position: fixed`
  // 会被换成那一层，抽屉从弹窗左上角开始、右侧超出窗口被裁。宿主自己的设置弹窗也是
  // createPortal 到 body 的，这里跟它保持一致。
  assert.ok(bundle.includes('createPortal'), 'drawer/dialog overlay must portal out of the settings dialog')
  assert.ok(bundle.includes('require("react-dom")'), 'react-dom comes from the dsh module table, like the settings sections that already portal')
  // 控件是 100% 宽 + 内边距；没有 border-box 就会横向溢出，出现横向滚动条并把输入框切掉。
  assert.ok(bundle.includes('box-sizing: border-box'), 'form controls need border-box, or 100% width overflows the drawer')
})

test('the stylesheet only references tokens dsh actually defines', () => {
  for (const stale of ['--dsw-alias-bg-secondary', '--dsw-alias-border-secondary']) {
    assert.equal(bundle.includes(stale), false, `${stale} does not exist upstream; it would fall back to a hex literal`)
  }
  assert.ok(bundle.includes('vexnar-dsh-ui-styles'), 'stylesheet injection must ship in the bundle')
})
