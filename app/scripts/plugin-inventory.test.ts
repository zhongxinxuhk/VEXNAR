// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 盘点的自检：profile 与预设分叉必须被报出来。
 *
 * 用真实 profile 的依赖形状做样本，不读文件、不装包——这里钉住的是分类规则：
 * 模板包、VEXNAR 自己的包、皮肤、依赖包、运行时自带的 bundle，各自的来源判定，
 * 以及「装了但预设没带」必须进 missing。
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'

import { OWN_BUNDLES, TEMPLATE_BUNDLES, scanProfile } from './plugin-inventory.ts'
import { readExtras } from './vexnar-extras.ts'

const file = join(import.meta.dirname, '..', 'vexnar', 'extras.json')
const extras = await readExtras(file)

// 真实已装 profile 的缩影：模板、皮肤、第三方、运行时自带、VEXNAR 自己的包各一条。
const inventory = scanProfile({
  profile: {
    dependencies: {
      'dsh-agent-efficiency': '0.1.4',
      'dsh-claude-style': '^0.21.7',
      '@deepseek-ai/dsh-cua-bundle': '0.2.2-rc.5',
      '@vexnar/app-bundle': 'file:../vexnar'
    },
    dsh: {
      profile: {
        bundles: [
          '@deepseek-ai/dsh-base',
          '@deepseek-ai/dsh-web-app',
          'dsh-agent-efficiency',
          'dsh-claude-style',
          '@deepseek-ai/dsh-cua-bundle',
          '@vexnar/app-bundle'
        ]
      }
    }
  },
  extras,
  theme: ['dsh-claude-style']
})

const row = (name: string) => inventory.bundles.find((item) => item.name === name)
assert.equal(row('dsh-agent-efficiency')?.source, 'extras')
assert.equal(row('dsh-claude-style')?.source, 'theme')
assert.equal(row('@deepseek-ai/dsh-cua-bundle')?.source, 'runtime')
assert.equal(row('@deepseek-ai/dsh-base')?.source, 'template')
assert.equal(row('@vexnar/app-bundle')?.source, 'own')
assert.deepEqual(inventory.missing, [], '全部已装 bundle 都应在预设里')
assert.ok(TEMPLATE_BUNDLES.every((name) => name.startsWith('@deepseek-ai/dsh-')), '模板 bundle 应是官方包')
assert.ok(OWN_BUNDLES.includes('@vexnar/app-bundle'))
assert.ok(OWN_BUNDLES.includes('@vexnar/dsh-egress'), 'egress 是 VEXNAR 自己的 bundle，不应被报成预设缺口')

// 装了但预设没带：必须报出来，而不是静默当成"用户自己装的"。
const leaked = scanProfile({
  profile: {
    dependencies: { 'some-unknown-bundle': '1.0.0' },
    dsh: { profile: { bundles: ['some-unknown-bundle'] } }
  },
  extras
})
assert.deepEqual(leaked.missing, ['some-unknown-bundle'])

// 预设里有、这台机器没装：只提示，不算分叉。
assert.ok(inventory.absent.includes('@furongjun1999/dsh-memory'))

console.log('plugin inventory: 12 checks passed')
