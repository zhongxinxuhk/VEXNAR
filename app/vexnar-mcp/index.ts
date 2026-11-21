// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * vexnar-mcp — the VEXNAR Go service's tool face, mounted on dsh's MCP plane.
 *
 * dsh owns MCP: `@deepseek-ai/dsh-mcp-manager` builds one fleet of
 * `dsh-mcp-client` instances from two sources — `config.servers` entries that a
 * Settings edit owns, and registrations contributed by plugins. This plugin uses
 * the second source, so the VEXNAR server is neither a hand-written
 * `dsh-mcp-client` row nor a second management surface next to the manager:
 * it appears in the manager's fleet as a registered entry, its tools arrive as
 * `mcp__<serverName>__<tool>`, and disabling or uninstalling this bundle
 * withdraws the server and its tools.
 *
 * The Go service authenticates `/mcp` with a bearer token it generates next to
 * its other runtime secrets (`data/mcp.token`, or `VEXNAR_MCP_TOKEN` when set).
 * The token is read at apply time and passed to the manager as a header value;
 * nothing is copied into this package, the patch, or a session transcript.
 */

import { readFileSync } from 'node:fs'

export const name = 'vexnar-mcp'

/** The manager service must be mounted before this plugin can contribute to it. */
export const inject = ['mcpManager']

type Config = {
  serverName: string
  url: string
  tokenFile: string
  tokenEnv: string
  startupTimeoutMs: number
  toolCallTimeoutMs: number
}

/** 只声明本插件真正用到的那一面：dsh 的 mcp-manager 注册表。 */
type McpContext = {
  mcpManager: {
    register(name: string, server: {
      transport: 'streamable-http'
      url: string
      headers: Record<string, string>
      startupTimeoutMs: number
      toolCallTimeoutMs: number
    }): void
  }
}

const DEFAULTS: Config = {
  serverName: 'vexnar',
  url: 'http://127.0.0.1:8787/mcp',
  tokenFile: '',
  tokenEnv: 'VEXNAR_MCP_TOKEN',
  startupTimeoutMs: 20000,
  toolCallTimeoutMs: 60000
}

/** Read the endpoint token: an explicit environment value wins over the token file. */
function resolveToken(tokenEnv: string, tokenFile: string): string {
  const fromEnv = tokenEnv === '' ? '' : (process.env[tokenEnv] ?? '').trim()
  if (fromEnv !== '') return fromEnv
  if (tokenFile === '') return ''
  try {
    return readFileSync(tokenFile, 'utf8').trim()
  } catch {
    return ''
  }
}

export function apply(ctx: McpContext, config: Partial<Config> = {}): void {
  const options: Config = { ...DEFAULTS, ...config }
  const token = resolveToken(options.tokenEnv, options.tokenFile)
  if (token === '') {
    throw new Error(
      `vexnar-mcp: no endpoint token (looked at $${options.tokenEnv} and ${options.tokenFile === '' ? '(no tokenFile)' : options.tokenFile}). ` +
        'Start the VEXNAR service so it writes data/mcp.token, or set VEXNAR_MCP_TOKEN.'
    )
  }

  ctx.mcpManager.register(options.serverName, {
    transport: 'streamable-http',
    url: options.url,
    headers: { Authorization: `Bearer ${token}` },
    startupTimeoutMs: options.startupTimeoutMs,
    toolCallTimeoutMs: options.toolCallTimeoutMs
  })
}
