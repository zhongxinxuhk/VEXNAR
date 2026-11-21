// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawnSync } from 'node:child_process'

/** Read-path regression: metadata suite plus the domain suite. */
const suites = ['compare.mjs', 'compare-domain.mjs']
let failed = false
for (const suite of suites) {
  const result = spawnSync(process.execPath, [suite], { encoding: 'utf8' })
  const lines = (result.stdout || '').split('\n').filter((line) => line.startsWith('[PASS]') || line.startsWith('[FAIL]'))
  const pass = lines.filter((line) => line.startsWith('[PASS]')).length
  const fail = lines.filter((line) => line.startsWith('[FAIL]')).length
  if (fail || result.status !== 0) failed = true
  console.log(`${suite}: ${pass} pass, ${fail} fail`)
  for (const line of lines.filter((item) => item.startsWith('[FAIL]'))) console.log(`  ${line}`)
}
process.exit(failed ? 1 : 0)
