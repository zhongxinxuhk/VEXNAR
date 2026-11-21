// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Move the vendored dsh checkout to another upstream tag, keeping VEXNAR work
 * intact.
 *
 * Refuses to run when app/dsh has local modifications: the upstream tree is
 * read-only, so any edit there is either a mistake or work that belongs in
 * app/vexnar. After checkout it runs check-upstream.ts; on failure it restores
 * the previous commit and leaves upstream.lock.json untouched.
 *
 *   tsx scripts/upgrade-dsh.ts --tag dsh-v0.2.3
 *   tsx scripts/upgrade-dsh.ts --rollback
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const app = join(here, '..')
const dsh = join(app, 'dsh')
const lockPath = join(app, 'upstream.lock.json')
const lock = JSON.parse(readFileSync(lockPath, 'utf8'))

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

function git(gitArgs: string[]): string {
  return execFileSync('git', ['-C', dsh, ...gitArgs], { encoding: 'utf8' }).trim()
}

if (git(['status', '--porcelain']) !== '') {
  console.error('app/dsh has local changes; move them to app/vexnar first:')
  console.error(git(['status', '--short']))
  process.exit(1)
}

const previous = git(['rev-parse', 'HEAD'])

if (args.includes('--rollback')) {
  git(['checkout', '-q', lock.commit])
  console.log(`rolled back to ${lock.tag} (${lock.commit.slice(0, 8)})`)
  process.exit(0)
}

const tag = flag('--tag')
if (!tag) {
  console.error('usage: upgrade-dsh.ts --tag <upstream-tag> | --rollback')
  process.exit(2)
}

console.log(`fetching ${tag}`)
git(['fetch', '--depth', '1', 'origin', `refs/tags/${tag}:refs/tags/${tag}`])
git(['checkout', '-q', tag])
const commit = git(['rev-parse', 'HEAD'])
console.log(`checked out ${tag} (${commit.slice(0, 8)})`)

try {
  execFileSync(process.execPath, ['--import', 'tsx', join(here, 'check-upstream.ts')], { stdio: 'inherit' })
} catch {
  console.error('surface check failed — restoring previous checkout')
  git(['checkout', '-q', previous])
  process.exit(1)
}

lock.tag = tag
lock.commit = commit
lock.verifiedAt = new Date().toISOString().slice(0, 10)
writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
console.log(`upstream.lock.json updated to ${tag}`)
console.log('next: pnpm run setup, then verify the app boots and the brand/account patch still applies')
