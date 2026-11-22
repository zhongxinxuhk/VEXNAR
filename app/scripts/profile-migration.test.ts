// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { planLegacyBundles, readLegacyManifests, type ProfileManifestLike } from './profile-migration.ts'

const template = new Set(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])

const skip = (name: string): boolean =>
  template.has(name) || name === '@vexnar/app-bundle' || name === 'dsh-claude-style'

const legacy: ProfileManifestLike = {
  dependencies: {
    'dsh-plugin-shop': '0.9.4',
    'dsh-craft-anything': '0.6.1',
    'dsh-claude-style': '^0.21.6',
    '@deepseek-ai/dsh-base': '0.2.2-rc.5',
    '@vexnar/dsh-ui': 'file:/gone/app/vexnar/ui',
  },
  dsh: {
    profile: {
      bundles: [
        '@deepseek-ai/dsh-base',
        '@deepseek-ai/dsh-web-app',
        'dsh-claude-style',
        '@vexnar/app-bundle',
        'dsh-plugin-shop',
        'dsh-craft-anything',
        '@vexnar/dsh-ui',
      ],
    },
  },
}

test('carries the shop bundles a template-only profile would drop', () => {
  assert.deepEqual(planLegacyBundles([legacy], { skip, installed: [] }), [
    { name: 'dsh-plugin-shop', version: '0.9.4' },
    { name: 'dsh-craft-anything', version: '0.6.1' },
  ])
})

test('never replays template entries or the bundles setup writes itself', () => {
  const planned = planLegacyBundles([legacy], { skip, installed: [] })
  assert.equal(planned.some(bundle => template.has(bundle.name) || bundle.name === 'dsh-claude-style'), false)
  assert.equal(planned.some(bundle => bundle.name === '@vexnar/app-bundle'), false)
})

test('never replays a local checkout specifier', () => {
  assert.equal(
    planLegacyBundles([legacy], { skip, installed: [] }).some(bundle => bundle.name === '@vexnar/dsh-ui'),
    false,
  )
})

test('keeps bundles the current profile already lists out of the plan', () => {
  assert.deepEqual(
    planLegacyBundles([legacy], { skip, installed: ['dsh-plugin-shop'] }),
    [{ name: 'dsh-craft-anything', version: '0.6.1' }],
  )
})

test('deduplicates across homes and keeps the first listing order', () => {
  const other: ProfileManifestLike = {
    dependencies: { 'dsh-plugin-shop': '0.9.4', 'another-plugin': '1.2.3' },
    dsh: { profile: { bundles: ['dsh-plugin-shop', 'another-plugin'] } },
  }
  assert.deepEqual(planLegacyBundles([legacy, other], { skip, installed: [] }).map(bundle => bundle.name), [
    'dsh-plugin-shop',
    'dsh-craft-anything',
    'another-plugin',
  ])
})

test('ignores a bundle with no registry dependency', () => {
  const bare: ProfileManifestLike = { dsh: { profile: { bundles: ['shipped-by-runtime'] } } }
  assert.deepEqual(planLegacyBundles([bare], { skip, installed: [] }), [])
})

test('restores a runtime-shipped bundle as a layer entry without a dependency', () => {
  const bare: ProfileManifestLike = {
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-experimental-cot-translation-bundle'] } },
  }
  assert.deepEqual(
    planLegacyBundles([bare], { skip, installed: [], provided: name => name.endsWith('cot-translation-bundle') }),
    [{ name: '@deepseek-ai/dsh-experimental-cot-translation-bundle' }],
  )
})

test('a local checkout specifier is never restored, even for a runtime-shipped name', () => {
  const manifest: ProfileManifestLike = {
    dependencies: { 'legacy-local': 'file:/gone/legacy-local' },
    dsh: { profile: { bundles: ['legacy-local'] } },
  }
  assert.deepEqual(planLegacyBundles([manifest], { skip, installed: [], provided: () => true }), [])
})

test('skips malformed manifests and still restores bundles from valid profiles', t => {
  const home = mkdtempSync(join(tmpdir(), 'vexnar-profile-migration-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))

  const manifests = {
    'invalid-json': '{',
    'invalid-root': 'null',
    'invalid-bundles': JSON.stringify({ dsh: { profile: { bundles: {} } } }),
    'invalid-dependency': JSON.stringify({
      dependencies: { 'another-plugin': 123 },
      dsh: { profile: { bundles: ['another-plugin'] } },
    }),
    valid: JSON.stringify(legacy),
  }
  for (const [profile, manifest] of Object.entries(manifests)) {
    const directory = join(home, 'profiles', profile)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'package.json'), manifest)
  }

  assert.deepEqual(planLegacyBundles(readLegacyManifests([home]), { skip, installed: [] }), [
    { name: 'dsh-plugin-shop', version: '0.9.4' },
    { name: 'dsh-craft-anything', version: '0.6.1' },
  ])
})
