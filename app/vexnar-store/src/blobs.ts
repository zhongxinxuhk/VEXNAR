// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Content-addressed evidence bodies: `<root>/evidence/blobs/sha256/<ab>/<hash>.bin`. */
export function blobStore(root: string) {
  const dir = join(root, 'evidence', 'blobs', 'sha256')
  const path = (hash: string) => join(dir, hash.slice(0, 2), `${hash}.bin`)

  return {
    async put(body: Buffer | string) {
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body)
      const hash = createHash('sha256').update(buffer).digest('hex')
      const file = path(hash)
      await mkdir(join(file, '..'), { recursive: true, mode: 0o700 })
      const temp = `${file}.tmp`
      await writeFile(temp, buffer, { mode: 0o600 })
      await rename(temp, file)
      return { hash, size: buffer.length }
    },
    async read(hash: string) {
      return readFile(path(hash))
    },
    async size(hash: string) {
      try { return (await stat(path(hash))).size } catch { return null }
    },
    path
  }
}

export type BlobStore = ReturnType<typeof blobStore>
