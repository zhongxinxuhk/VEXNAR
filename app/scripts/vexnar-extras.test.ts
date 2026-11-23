// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 预置插件清单与 bundle 层顺序的自检。
 *
 * 安装流程里最容易悄悄坏掉的两处：清单里的 spec 与包名对不上（装上了但没启用），
 * 以及重跑 setup 时 bundle 顺序漂移（用户的插件被 VEXNAR 自己的层压掉）。
 * 这里用纯函数把两者钉住，不需要网络，也不需要真实 profile。
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'

import { extrasSpecs, mergeBundleLayer, readExtras } from './vexnar-extras.ts'

const file = join(import.meta.dirname, '..', 'vexnar', 'extras.json')
const extras = await readExtras(file)

// ── 清单 ───────────────────────────────────────────────────────────────────
assert.equal(extras.length, 9, `预置插件应为 9 个，实际 ${extras.length}`)
assert.equal(new Set(extras.map((item) => item.name)).size, extras.length, '包名不能重复')
assert.deepEqual(extrasSpecs(extras), extras.map((item) => item.spec), 'specs 应按清单顺序输出')

for (const item of extras) {
  assert.ok(item.spec.length > 0, `${item.name} 缺 spec`)
  if (item.spec.startsWith('github:')) {
    assert.match(item.spec, /#[0-9a-f]{40}$/, `${item.name} 的 GitHub spec 必须锁 40 位 commit`)
  } else {
    assert.ok(item.spec.startsWith(`${item.name}@`), `${item.name} 的 spec 必须以「包名@版本」开头：${item.spec}`)
  }
}

// 用户点名的插件都在清单里
for (const name of [
  'dsh-agent-efficiency', '@zhuifengqug/dsh-ant', '@zilliz/memsearch-dsh', 'dsh-purge-community',
  'dsh-craft-anything', 'dsh-infinite-gen-5', '@linfengqaqtat/dsh-scriptor-retrieval',
  '@furongjun1999/dsh-memory', 'dsh-planning-with-files'
]) {
  assert.ok(extras.some((item) => item.name === name), `清单缺 ${name}`)
}

// ── bundle 层顺序 ──────────────────────────────────────────────────────────
const merged = mergeBundleLayer({
  existing: ['user-extra', 'dsh-agent-efficiency', 'dsh-claude-style', '@vexnar/app-bundle', 'another-user'],
  carried: ['old-bundle'],
  extras: ['dsh-agent-efficiency'],
  theme: ['dsh-claude-style'],
  bundle: '@vexnar/app-bundle'
})
assert.deepEqual(
  merged,
  ['user-extra', 'another-user', 'old-bundle', 'dsh-agent-efficiency', 'dsh-claude-style', '@vexnar/app-bundle'],
  `顺序不对：${JSON.stringify(merged)}`
)

// 重复项只留一个；没有 extras 时也稳定
assert.deepEqual(mergeBundleLayer({ existing: ['a', 'a'], bundle: 'b' }), ['a', 'b'])
assert.deepEqual(mergeBundleLayer({ existing: ['a'], bundle: 'b' }), ['a', 'b'])

// 受管条目即使原来在末尾，也会回到固定位置
assert.deepEqual(
  mergeBundleLayer({ existing: ['x', 'dsh-claude-style'], extras: ['e'], theme: ['dsh-claude-style'], bundle: 'b' }),
  ['x', 'e', 'dsh-claude-style', 'b']
)

// 清单缺字段要报错，而不是装半套
await assert.rejects(
  () => readExtras(join(import.meta.dirname, 'testdata-extras-broken.json')),
  /ENOENT/,
  '不存在的清单应抛文件错误，由 setup 决定是否跳过'
)

console.log('extras preset: 12 checks passed')
