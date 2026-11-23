// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 本地加密盒：AES-256-GCM，密钥单独放 `<root>/vault.key`（0600）。
 *
 * 两处用它：会话凭据（vault）与请求/响应正文（evidence）。AAD 绑定记录 id，
 * 这样把密文从一条记录搬到另一条会直接解失败——防止"张冠李戴"的证据替换。
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export class AesGcmBox {
  private readonly key: Buffer

  constructor(root: string) {
    mkdirSync(root, { recursive: true, mode: 0o700 })
    this.key = loadKey(root)
  }

  seal(data: Buffer | string, aad = ''): string {
    const plaintext = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8')
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'))
    const body = Buffer.concat([cipher.update(plaintext), cipher.final()])
    return JSON.stringify({
      v: 1,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: body.toString('base64')
    })
  }

  open(payload: string, aad = ''): Buffer {
    const envelope = JSON.parse(payload) as { iv: string; tag: string; data: string }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(envelope.iv, 'base64'))
    if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'))
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()])
  }
}

function loadKey(root: string): Buffer {
  const file = join(root, 'vault.key')
  if (existsSync(file)) {
    const key = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64')
    if (key.length !== 32) throw new Error(`vault.key 长度异常（${key.length} 字节），应为 32`)
    return key
  }
  const key = randomBytes(32)
  writeFileSync(file, `${key.toString('base64')}\n`, { mode: 0o600 })
  try { chmodSync(file, 0o600) } catch { /* Windows 忽略 */ }
  return key
}
