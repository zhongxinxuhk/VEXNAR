// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * VEXNAR client plugin for the dsh web client.
 *
 * Scope: presentation only. Domain truth stays in the Go service; this plugin
 * renders tool calls the MCP bridge already returns, and never re-derives
 * findings, traffic or task state.
 *
 * Planned registrations (see app/vexnar/README.md):
 *   - tool.call.toolview keyed by `mcp__vexnar__report_finding`
 *   - tool.call.toolview keyed by `mcp__vexnar__get_finding_traffic`
 *   - sidebar.panellist entry for the task/finding board
 *
 * The package is not built yet: the dsh client bundle build (tsx + Vite) is the
 * first app-side task once the profile boots.
 */

export const name = 'vexnar-client'

export const inject = ['slots']

export function apply(ctx: { slots: { inject: (slot: string, cb: () => unknown) => void } }): void {
  // Placeholder keeps the plugin mountable while the UI lands. Registering a
  // slot before its component exists would fail at activation, so this file
  // deliberately registers nothing yet.
  void ctx
}
