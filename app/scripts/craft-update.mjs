// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Keep the bundled Craft Anything CLI current.
 *
 *   node scripts/craft-update.mjs --check    report only
 *   node scripts/craft-update.mjs            download, verify SHA256, replace
 *
 * The binary lives outside the repo (dsh plugin data), so an update never
 * dirties the working tree. CRAFT_ANYTHING_CLI overrides the target path.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const checkOnly = process.argv.includes('--check')
const target = process.env.CRAFT_ANYTHING_CLI || join(process.env.HOME || '', '.dsh', 'plugins-data', 'craft-anything', 'craft-anything-cli')

function currentVersion() {
  if (!existsSync(target)) return ''
  const result = spawnSync(target, ['--version'], { encoding: 'utf8' })
  return (result.stdout || '').trim().split(' ').pop() ?? ''
}

async function latestTag() {
  const response = await fetch('https://github.com/storytold/craft-anything/releases/latest', { redirect: 'manual' })
  const location = response.headers.get('location') || ''
  const match = location.match(/\/tag\/v?([0-9][^/]*)$/)
  if (!match) throw new Error(`cannot resolve latest release: ${response.status} ${location}`)
  return match[1]
}

async function download(url, file) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`download failed ${response.status}: ${url}`)
  writeFileSync(file, Buffer.from(await response.arrayBuffer()))
}

const installed = currentVersion()
const latest = await latestTag()
console.log(`craft-anything: installed=${installed || 'none'} latest=${latest}`)
if (checkOnly || installed === latest) process.exit(0)

const platform = process.platform === 'darwin' ? 'macos-universal' : process.platform === 'linux' ? 'linux-x86_64' : ''
if (!platform) throw new Error(`unsupported platform: ${process.platform}`)
const asset = `craft-anything-cli-${latest}-${platform}.zip`
const base = `https://github.com/storytold/craft-anything/releases/download/v${latest}`
const work = mkdtempSync(join(tmpdir(), 'craft-update-'))
try {
  const zip = join(work, asset)
  await download(`${base}/${asset}`, zip)
  await download(`${base}/SHA256SUMS.txt`, join(work, 'SHA256SUMS.txt'))
  const sums = readFileSync(join(work, 'SHA256SUMS.txt'), 'utf8')
  const line = sums.split('\n').find((row) => row.endsWith(asset))
  if (!line) throw new Error(`checksum missing for ${asset}`)
  const expected = line.split(/\s+/)[0]
  const actual = spawnSync('shasum', ['-a', '256', zip], { encoding: 'utf8' }).stdout.split(/\s+/)[0]
  if (expected !== actual) throw new Error(`checksum mismatch: ${actual} != ${expected}`)
  const unzip = spawnSync('unzip', ['-q', zip, '-d', work], { encoding: 'utf8' })
  if (unzip.status !== 0) throw new Error(unzip.stderr || 'unzip failed')
  const extracted = join(work, asset.replace(/\.zip$/, ''), 'craft-anything-cli')
  if (!existsSync(extracted)) throw new Error('CLI binary missing from archive')
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(extracted, `${target}.new`)
  chmodSync(`${target}.new`, 0o755)
  spawnSync('mv', [`${target}.new`, target])
  console.log(`craft-anything updated to ${latest}: ${target}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
