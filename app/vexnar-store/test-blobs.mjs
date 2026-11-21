// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { blobStore } from './src/blobs.ts'

const root = await mkdtemp(join(tmpdir(), 'vexnar-blobs-'))
const blobs = blobStore(root)
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok, detail })

const put = await blobs.put('hello evidence')
check('put returns sha256', put.hash.length === 64 && put.size === 14, JSON.stringify(put))
const read = await blobs.read(put.hash)
check('read roundtrip', read.toString() === 'hello evidence', read.toString())
const empty = await blobs.put('')
check('empty blob', empty.size === 0 && (await blobs.read(empty.hash)).length === 0, JSON.stringify(empty))
check('missing size', (await blobs.size('0'.repeat(64))) === null, 'null')

let failed = false
for (const item of results) { if (!item.ok) failed = true; console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? `  ${item.detail}` : ''}`) }
process.exit(failed ? 1 : 0)
