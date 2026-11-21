// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from 'node:crypto'
import { cp, mkdir, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { storeRoot } from './src/index.ts'

const source = process.argv[2]
if (!source) {
  console.error('用法: tsx import-evidence.mjs <evidence_blobs_dir>')
  process.exit(2)
}
const target = join(storeRoot(), 'evidence', 'blobs', 'sha256')
await mkdir(target, { recursive: true, mode: 0o700 })
await cp(source, target, { recursive: true })

let count = 0
const mismatched = []
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) { await walk(path); continue }
    if (!entry.name.endsWith('.bin')) continue
    const hash = entry.name.slice(0, -4)
    const actual = createHash('sha256').update(await readFile(path)).digest('hex')
    count++
    if (actual !== hash) mismatched.push(path)
  }
}
await walk(target)
console.log(JSON.stringify({ imported: count, mismatched }, null, 2))
process.exit(mismatched.length ? 1 : 0)
