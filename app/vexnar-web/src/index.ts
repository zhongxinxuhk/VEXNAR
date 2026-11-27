// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Web 测试域组装入口。
 *
 * 五层都在这里被实例化：policy（Gate）→ vault（Session）→ transport（Scheduler）
 * → analyzer（Observer）→ store（Evidence）。上层只拿 `engine` 与 `mcpUrl`。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'

import { WebTestingEngine } from './engine.ts'
import { startMcpServer, type RunningMcpServer } from './mcp.ts'
import type { FetchLike } from './transport.ts'
import type { PolicyConfig } from './types.ts'

export { WebTestingEngine } from './engine.ts'
export { WebStore } from './store.ts'
export { SessionVault } from './vault.ts'
export { handleWebHttp } from './routes.ts'
export { buildTools, startMcpServer, MCP_PROTOCOL_VERSION } from './mcp.ts'
export { AesGcmBox } from './crypto-box.ts'
export { defaultPolicy, normalizeOrigin, isOriginAllowed, isPrivateAddress, assertAdversarialAllowed, PolicyError } from './policy.ts'
export { MUTATIONS, tamperRequest, tamperIds, nextMutation, mutationFingerprint } from './tamper.ts'
export { EgressPool, parseEgress, egressMode } from './egress.ts'
export { identities, identityAt, identityById, mergeIdentityHeaders } from './identity.ts'
export { decide, initialPlan, describeAction, DEFAULT_LIMITS } from './adversarial.ts'
export { SessionTransport, preflight, TransportError } from './transport.ts'
export { extractStructure, extractJsonKeys, detectWafMarkers, classifyResponse, diffExchanges, redactUrl, redactHeaders, redactBody } from './analyzer.ts'
export type * from './types.ts'

export interface WebRuntimeOptions {
  root: string
  token?: string
  port?: number
  mcp?: boolean
  policy?: Partial<PolicyConfig>
  fetchImpl?: FetchLike
  log?: (message: string) => void
}

export interface WebRuntime {
  engine: WebTestingEngine
  mcp: RunningMcpServer | null
  mcpUrl: string
  tokenSource: string
  stop: () => Promise<void>
}

function resolveToken(root: string, explicit?: string): { token: string; source: string } {
  const fromExplicit = String(explicit ?? '').trim()
  if (fromExplicit) return { token: fromExplicit, source: 'options' }
  const fromEnv = String(process.env.VEXNAR_WEB_MCP_TOKEN ?? '').trim()
  if (fromEnv) return { token: fromEnv, source: 'VEXNAR_WEB_MCP_TOKEN' }
  const desktop = String(process.env.VEXNAR_DESKTOP_TOKEN ?? '').trim()
  if (desktop) return { token: desktop, source: 'VEXNAR_DESKTOP_TOKEN' }
  const file = join(root, 'mcp.token')
  if (existsSync(file)) {
    const existing = readFileSync(file, 'utf8').trim()
    if (existing) return { token: existing, source: 'mcp.token' }
  }
  const generated = randomBytes(32).toString('base64url')
  mkdirSync(root, { recursive: true, mode: 0o700 })
  writeFileSync(file, `${generated}\n`, { mode: 0o600 })
  try { chmodSync(file, 0o600) } catch { /* Windows 忽略 */ }
  return { token: generated, source: 'generated' }
}

export async function startWebRuntime(options: WebRuntimeOptions): Promise<WebRuntime> {
  const log = options.log ?? ((message: string) => console.log(message))
  const engine = new WebTestingEngine({
    root: options.root,
    policy: options.policy,
    fetchImpl: options.fetchImpl,
    log
  })
  let mcp: RunningMcpServer | null = null
  let tokenSource = ''
  if (options.mcp !== false) {
    const { token, source } = resolveToken(options.root, options.token)
    tokenSource = source
    mcp = await startMcpServer({
      engine,
      token,
      port: options.port ?? Number(process.env.VEXNAR_WEB_MCP_PORT ?? 8792)
    })
    log(`[web] MCP 已就绪 ${mcp.url}（${mcp.tools.length} 个工具，令牌来源 ${source}）`)
  }
  return {
    engine,
    mcp,
    mcpUrl: mcp?.url ?? '',
    tokenSource,
    stop: async () => {
      await mcp?.close().catch(() => undefined)
      await engine.close()
    }
  }
}
