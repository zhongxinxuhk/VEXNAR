// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Host half of @vexnar/dsh-craft.
 *
 * Craft Anything ships as a Rust CLI with an MCP mode. This plugin owns that
 * server: it registers `craft` with dsh's MCP manager for the plugin's lifetime,
 * so disabling or removing the plugin also unmounts the server and withdraws
 * its tools. The binary lives in dsh plugin data (outside the repo) and is kept
 * current by `pnpm run craft:update`.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const name = '@vexnar/dsh-craft'

export const inject = ['mcpManager']

function cliPath() {
  return process.env.CRAFT_ANYTHING_CLI || join(process.env.HOME || '', '.dsh', 'plugins-data', 'craft-anything', 'craft-anything-cli')
}

export function apply(ctx) {
  const command = cliPath()
  if (!existsSync(command)) {
    console.warn(`[craft] CLI not installed at ${command}; run: pnpm run craft:update`)
    return
  }
  ctx.mcpManager.register('craft', {
    transport: 'stdio',
    command,
    args: ['mcp'],
    timeoutMs: 120000
  })
}
