// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * P0-3 demo: fixture -> TS claim -> simulated execution -> write-back -> verify.
 *
 *   node demo.mjs            # creates a paused fixture task and removes it
 *   node demo.mjs --keep     # leaves the fixture for the Go manager to reload
 */
import { createFixture, cleanupTask } from './fixture.mjs'
import { claimOne, executeAndWriteBack } from './worker.mjs'
import { verify } from './verify.mjs'

const keep = process.argv.includes('--keep')
const run = async () => {
  const fixture = await createFixture()
  console.log('fixture', fixture)

  const claim = await claimOne(fixture.explorationId)
  console.log('claim', claim)
  if (!claim.claimed) throw new Error('worker claimed nothing')

  const write = await executeAndWriteBack(fixture.explorationId, claim)
  console.log('write', write)

  const checks = await verify(fixture.explorationId, claim.intentId, write.factId)
  let failed = false
  for (const check of checks) {
    if (!check.ok) failed = true
    console.log(`[${check.ok ? 'PASS' : 'FAIL'}] ${check.name}${check.detail ? `  ${check.detail}` : ''}`)
  }

  if (!keep) await cleanupTask(fixture.taskId)
  else console.log(`kept task ${fixture.taskId}; restart Go to see it via /api/exploration/nodes?task=${fixture.taskId}`)

  process.exit(failed ? 1 : 0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
