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
  body: {},
  createElement: element,
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => []
}
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })
globalThis.HTMLElement ??= class {}
globalThis.MutationObserver ??= class { observe() {} disconnect() {} }

const react = {
  createElement: (type, props, ...kids) => ({ type, props, kids }),
  useState: (v) => [v, () => {}],
  useEffect: () => {},
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
      register: (options) => { registered.push(options.name + (options.key ? `:${options.key}` : '')) }
    },
    effect: (fn) => fn()
  })
  assert.deepEqual(injected, [
    'tool.call.toolview',
    'tool.call.toolview',
    'sidebar.brand.mark',
    'sidebar.brand.name',
    'conversation.hero.brand.mark'
  ])
  assert.deepEqual(registered, [
    'tool.call.toolview:mcp__vexnar__report_finding',
    'tool.call.toolview:mcp__vexnar__traffic_get',
    'sidebar.brand.mark',
    'sidebar.brand.name',
    'conversation.hero.brand.mark'
  ])
})

test('a missing slots service degrades instead of throwing', () => {
  const plugin = loadPlugin()
  assert.doesNotThrow(() => plugin.apply({}),
    'a failed service must not take the whole client plugin down')
})

test('the stylesheet only references tokens dsh actually defines', () => {
  for (const stale of ['--dsw-alias-bg-secondary', '--dsw-alias-border-secondary']) {
    assert.equal(bundle.includes(stale), false, `${stale} does not exist upstream; it would fall back to a hex literal`)
  }
  assert.ok(bundle.includes('vexnar-dsh-ui-styles'), 'stylesheet injection must ship in the bundle')
})
