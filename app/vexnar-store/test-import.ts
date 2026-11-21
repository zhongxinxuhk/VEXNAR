// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawnSync } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { blobStore } from './src/blobs.ts'

type CheckResult = { name: string; ok: boolean; detail: string }

const sourceRoot = await mkdtemp(join(tmpdir(), 'vexnar-evidence-src-'))
const store = await mkdtemp(join(tmpdir(), 'vexnar-evidence-dst-'))
const blob = await blobStore(sourceRoot).put('evidence body')
const result = spawnSync(process.execPath, ['--import', 'tsx', 'import-evidence.ts', join(sourceRoot, 'evidence', 'blobs', 'sha256')], {
  cwd: dirname(fileURLToPath(import.meta.url)),
  env: { ...process.env, VEXNAR_STORE_ROOT: store },
  encoding: 'utf8'
})
/** Child stdout is untrusted: parse to unknown, then read the one field we assert on. */
const parsed: unknown = JSON.parse(result.stdout || '{}')
const imported = typeof parsed === 'object' && parsed !== null ? (parsed as { imported?: unknown }).imported : undefined
const results: CheckResult[] = []
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail })
check('imports blobs', result.status === 0 && imported === 1, JSON.stringify(parsed))
const read = await blobStore(store).read(blob.hash)
check('imported blob readable', read.toString() === 'evidence body', read.toString())

let failed = false
for (const item of results) { if (!item.ok) failed = true; console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`) }
process.exit(failed ? 1 : 0)
