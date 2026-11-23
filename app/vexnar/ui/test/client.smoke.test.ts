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

type ElementStub = { type: unknown; props: unknown; kids: unknown[] }

/** dsh 插件上下文里这份冒烟测试真正用到的两件事。 */
type SlotRegistration = { name: string; key?: string; id?: string }
type PluginContext = {
  slots?: {
    inject(name: string, callback: () => void): void
    register(options: SlotRegistration): void
  }
  effect?(fn: () => void): void
}
type Plugin = {
  inject?: string[]
  apply(ctx: PluginContext): void
}
type LoadedModule = { id: string; factory: (require: (name: string) => unknown) => Plugin }

const here = dirname(fileURLToPath(import.meta.url))
const bundle = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')

// Browser stubs live for the whole test process: the plugin reads globals such
// as `document` at call time, not only while the bundle is evaluated.
const element = (): Record<string, unknown> => ({ id: '', textContent: '', remove() {}, append() {}, setAttribute() {} })
// 桩只实现插件真正调用到的那几个成员，其余按 unknown 逃逸。
globalThis.document = {
  head: { append() {} },
  // A plain dsh shell: no Claude-style skin marker, so the skin brand guard
  // must stay inert.
  body: { hasAttribute: () => false, querySelectorAll: () => [] },
  createElement: element,
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => []
} as unknown as Document
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })
globalThis.HTMLElement ??= class {} as unknown as typeof HTMLElement
globalThis.MutationObserver ??= class { observe() {} disconnect() {} } as unknown as typeof MutationObserver

// The bundle is loaded, not rendered, so the hooks only have to exist: a
// missing name here fails the whole plugin, not one component, and the shell
// then silently drops every VEXNAR surface.
const react = {
  createElement: (type: unknown, props: unknown, ...kids: unknown[]): ElementStub => ({ type, props, kids }),
  useState: <T,>(initial: T | (() => T)): [T, () => void] =>
    [typeof initial === 'function' ? (initial as () => T)() : initial, () => {}],
  useEffect: (): void => {},
  useLayoutEffect: (): void => {},
  useMemo: <T,>(compute: () => T): T => compute(),
  useCallback: <T,>(callback: T): T => callback,
  useRef: <T,>(value: T): { current: T } => ({ current: value }),
  useReducer: (_reducer: unknown, initial: unknown): [unknown, () => void] => [initial, () => {}],
  useContext: (): Record<string, never> => ({}),
  createContext: <T,>(value: T) => ({ _currentValue: value, Provider: Symbol('provider'), Consumer: Symbol('consumer') }),
  memo: <T,>(component: T): T => component,
  forwardRef: <T,>(render: T): T => render,
  Children: {
    map: (kids: unknown, visit: (kid: unknown) => unknown): unknown[] =>
      (Array.isArray(kids) ? kids.map(visit) : [])
  },
  isValidElement: (node: unknown): boolean => Boolean(node && typeof node === 'object' && 'type' in node),
  StrictMode: Symbol('strict'),
  Fragment: Symbol('fragment')
}
const requireShim = (name: string): unknown => {
  if (name === 'react') return react
  if (name === 'react/jsx-runtime') return { jsx: () => ({}), jsxs: () => ({}), Fragment: react.Fragment }
  return {}
}

/** Load the bundle the way the dsh module loader does, and return its plugin. */
function loadPlugin(): Plugin {
  let loaded: LoadedModule | null = null
  globalThis.window = {
    __ModuleLoader__: { load: (module: LoadedModule) => { loaded = module } }
  } as unknown as Window & typeof globalThis
  new Function('require', bundle)(requireShim)
  const module = loaded as LoadedModule | null
  assert.ok(module !== null, 'bundle must call window.__ModuleLoader__.load')
  assert.equal(module.id, '@vexnar/dsh-ui')
  return module.factory(requireShim)
}

test('plugin declares the slots service', () => {
  const plugin = loadPlugin()
  assert.deepEqual(plugin.inject, ['slots'],
    'without `export const inject = ["slots"]` dsh never injects ctx.slots')
})

test('apply registers every surface it owns', () => {
  const plugin = loadPlugin()
  const injected: string[] = []
  const registered: string[] = []
  plugin.apply({
    slots: {
      inject: (name: string, callback: () => void) => { injected.push(name); callback() },
      register: (options: SlotRegistration) => {
        registered.push([options.name, options.key ?? options.id].filter(Boolean).join(':'))
      }
    },
    effect: (fn: () => void) => fn()
  })
  // 项目流量由会话动作和全局流量入口打开。
  const expected = [
    'tool.call.toolview:mcp__vexnar__report_finding',
    'tool.call.toolview:mcp__vexnar__traffic_get',
    'conversation.session.header.actions:vexnar-yak-history',
    // 抓包开关也挂在会话头部：它作用的是当前会话的抓包范围，与流量入口并列。
    'conversation.session.header.actions:vexnar-session-capture',
    'conversation.hero.options:vexnar-yak-history',
    // 四个领域页，按 PANELS 的注册顺序；代理池也是主面板，漏了它侧边栏就少一个入口。
    ...['overview', 'tasks', 'traffic', 'egress']
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
  const ids: string[] = []
  plugin.apply({
    slots: {
      inject: (_name: string, callback: () => void) => callback(),
      register: (options: SlotRegistration) => { ids.push(`${options.name}:${options.key ?? options.id}`) }
    },
    effect: (fn: () => void) => fn()
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
  const ids: string[] = []
  plugin.apply({
    slots: {
      inject: (_name: string, callback: () => void) => callback(),
      register: (options: SlotRegistration) => { ids.push(`${options.name}:${options.key ?? options.id}`) }
    },
    effect: (fn: () => void) => fn()
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

test('四页共用一套外壳与一套口径', () => {
  // 设计层：四页都渲染 vx-ui-page，不再各自维护 padding 与标题字号。
  assert.ok(bundle.includes('vx-ui-page'), 'the shared page shell must ship')
  assert.ok(bundle.includes('vx-ui-kpi'), 'KPI cards come from the shared kit')
  // 口径：概览与流量页读同一个键，代理池与概览读同一个键。
  for (const key of ['traffic:totals', 'traffic:capture', 'proxy:state', 'tasks:summary']) {
    assert.ok(bundle.includes(key), `shared query key ${key} must exist: it is what keeps two pages on one number`)
  }
  // 只有一个 HTTP 出口：错误类型与超时码都在，说明没有第二套 fetch 语义。
  assert.ok(bundle.includes('ApiError'), 'the shared client must ship its error type')
  assert.ok(bundle.includes('TIMEOUT'), 'the shared client must ship the timeout code')
})

test('the stylesheet only references tokens dsh actually defines', () => {
  for (const stale of ['--dsw-alias-bg-secondary', '--dsw-alias-border-secondary']) {
    assert.equal(bundle.includes(stale), false, `${stale} does not exist upstream; it would fall back to a hex literal`)
  }
  assert.ok(bundle.includes('vexnar-dsh-ui-styles'), 'stylesheet injection must ship in the bundle')
  // --vx-muted 曾被引用 20 余次却从未定义，深色下退化成透明文本。
  assert.ok(bundle.includes('--vx-muted: var(--vx-text-dim)'), 'the muted token must be defined, not just referenced')
})
