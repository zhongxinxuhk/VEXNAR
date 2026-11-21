// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 本地 MITM CA：第一次启动生成根证书，之后按 host 现场签发叶证书。
 * 根证书落在 `<storeRoot>/traffic/mitm-ca/`，工具通过
 * `GET /api/traffic/mitm/ca.pem` 拿到 PEM 并设置 SSL_CERT_FILE/CURL_CA_BUNDLE。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { join } from 'node:path'
import { createSecureContext, type SecureContext } from 'node:tls'

import * as forgeModule from 'node-forge'

// node-forge 是 CJS：在纯 ESM 入口下命名空间对象可能挂在 default 上，两种布局都兼容。
const forge: typeof forgeModule =
  (forgeModule as unknown as { default?: typeof forgeModule }).default ?? forgeModule

const CA_KEY = 'ca.key.pem'
const CA_CERT = 'ca.crt.pem'
const LEAF_KEY = 'leaf.key.pem'
const MAX_CONTEXTS = 256

export class MitmCA {
  readonly dir: string
  readonly certPem: string
  private readonly caKey: forgeModule.pki.rsa.PrivateKey
  private readonly caCert: forgeModule.pki.Certificate
  private readonly leafKeyPemValue: string
  private readonly leafKey: forgeModule.pki.rsa.PrivateKey
  private readonly contexts = new Map<string, SecureContext>()
  private readonly certCache = new Map<string, string>()

  constructor(dir: string) {
    this.dir = dir
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const caKeyPath = join(dir, CA_KEY)
    const caCertPath = join(dir, CA_CERT)
    if (existsSync(caKeyPath) && existsSync(caCertPath)) {
      this.caKey = forge.pki.privateKeyFromPem(readFileSync(caKeyPath, 'utf8')) as forgeModule.pki.rsa.PrivateKey
      this.caCert = forge.pki.certificateFromPem(readFileSync(caCertPath, 'utf8'))
      this.certPem = readFileSync(caCertPath, 'utf8')
    } else {
      const keys = forge.pki.rsa.generateKeyPair(2048)
      const cert = forge.pki.createCertificate()
      cert.publicKey = keys.publicKey
      cert.serialNumber = randomSerial()
      cert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000)
      cert.validity.notAfter = new Date(Date.now() + 3650 * 24 * 3600 * 1000)
      const attrs = [
        { name: 'commonName', value: 'VEXNAR MITM CA' },
        { name: 'organizationName', value: 'VEXNAR' },
        { shortName: 'OU', value: 'local traffic capture' }
      ]
      cert.setSubject(attrs)
      cert.setIssuer(attrs)
      cert.setExtensions([
        { name: 'basicConstraints', cA: true, critical: true },
        { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
        { name: 'subjectKeyIdentifier' }
      ])
      cert.sign(keys.privateKey, forge.md.sha256.create())
      this.caKey = keys.privateKey as forgeModule.pki.rsa.PrivateKey
      this.caCert = cert
      this.certPem = forge.pki.certificateToPem(cert)
      writeFileSync(caKeyPath, forge.pki.privateKeyToPem(keys.privateKey), { mode: 0o600 })
      writeFileSync(caCertPath, this.certPem, { mode: 0o644 })
    }

    const leafPath = join(dir, LEAF_KEY)
    if (existsSync(leafPath)) {
      this.leafKeyPemValue = readFileSync(leafPath, 'utf8')
      this.leafKey = forge.pki.privateKeyFromPem(this.leafKeyPemValue) as forgeModule.pki.rsa.PrivateKey
    } else {
      // 叶证书复用同一把 key，按 host 只重签证书，省掉每连接 RSA 生成。
      const keys = forge.pki.rsa.generateKeyPair(2048)
      this.leafKey = keys.privateKey as forgeModule.pki.rsa.PrivateKey
      this.leafKeyPemValue = forge.pki.privateKeyToPem(keys.privateKey)
      writeFileSync(leafPath, this.leafKeyPemValue, { mode: 0o600 })
    }
  }

  /** 与 Go 的 CACertPath 相同的 PEM，工具直接信任即可。 */
  certPath(): string {
    return join(this.dir, CA_CERT)
  }

  private certPemFor(host: string): string {
    this.contextFor(host)
    return this.certCache.get(host.trim().toLowerCase() || 'localhost') as string
  }

  /** 叶证书私钥 PEM（tls.createServer 的默认 key）。 */
  get leafKeyPem(): string {
    return this.leafKeyPemValue
  }

  /** 指定 host 的叶证书 PEM（CONNECT 目标没有 SNI 时当默认证书）。 */
  certFor(host: string): string {
    return this.certPemFor(host)
  }

  /** 为 SNI/host 生成（并缓存）SecureContext。 */
  contextFor(host: string): SecureContext {
    const name = host.trim().toLowerCase() || 'localhost'
    const cached = this.contexts.get(name)
    if (cached) return cached
    const cert = forge.pki.createCertificate()
    cert.publicKey = forge.pki.rsa.setPublicKey(this.leafKey.n, this.leafKey.e)
    cert.serialNumber = randomSerial()
    cert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000)
    cert.validity.notAfter = new Date(Date.now() + 825 * 24 * 3600 * 1000)
    cert.setSubject([{ name: 'commonName', value: name }])
    cert.setIssuer(this.caCert.subject.attributes)
    const altNames = isIP(name)
      ? [{ type: 7, ip: name }]
      : [{ type: 2, value: name }]
    cert.setExtensions([
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames },
      { name: 'authorityKeyIdentifier' }
    ])
    cert.sign(this.caKey, forge.md.sha256.create())
    const certPem = forge.pki.certificateToPem(cert)
    this.certCache.set(name, certPem)
    const context = createSecureContext({
      key: this.leafKeyPemValue,
      cert: certPem
    })
    if (this.contexts.size >= MAX_CONTEXTS) {
      const oldest = this.contexts.keys().next().value
      if (oldest) this.contexts.delete(oldest)
    }
    this.contexts.set(name, context)
    return context
  }
}

function randomSerial(): string {
  const bytes = forge.random.getBytesSync(16)
  return Buffer.from(bytes, 'binary').toString('hex')
}
