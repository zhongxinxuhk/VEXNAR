// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Minimal JetBrains IDE MCP client for the command line.
 *
 * The Docker MCP gateway only exposes catalog servers, so this checkout talks to
 * GoLand's own MCP endpoint (127.0.0.1:64343) directly: initialize once, then
 * call a tool. Use it for IDE-side work (build, run configurations, inspections)
 * when the gateway has no matching server.
 *
 *   tsx app/scripts/ide-mcp.ts tools
 *   tsx app/scripts/ide-mcp.ts call <toolName> '<jsonArgs>'
 */
const URL = process.env.IJ_MCP_URL || 'http://127.0.0.1:64343/stream'
const PROJECT =
  process.env.IJ_MCP_SERVER_PROJECT_PATH || process.cwd()
/** JSON-RPC 信封：只声明我们真正读的字段，其余保持未解释。 */
type RpcMessage = {
  result?: {
    tools?: { name: string; description?: string }[]
    content?: { type: string; text?: string }[]
  }
  error?: unknown
}

const HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
  'IJ_MCP_SERVER_PROJECT_PATH': PROJECT
}

async function rpc(payload: unknown, sessionId?: string): Promise<{ message: RpcMessage; sessionId: string | undefined }> {
  const headers = { ...HEADERS }
  if (sessionId) headers['Mcp-Session-Id'] = sessionId
  const res = await fetch(URL, { method: 'POST', headers, body: JSON.stringify(payload) })
  const sid = res.headers.get('mcp-session-id') || sessionId
  let body = await res.text()
  const dataLine = body.split('\n').find((line) => line.startsWith('data:'))
  if (dataLine) body = dataLine.slice(5).trim()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`)
  return { message: JSON.parse(body) as RpcMessage, sessionId: sid }
}

const { message: init, sessionId } = await rpc({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'vexnar-app', version: '0.1.0' }
  }
})
if (init.error) throw new Error(JSON.stringify(init.error))

const [cmd, name, rawArgs] = process.argv.slice(2)
if (cmd === 'tools') {
  const { message } = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, sessionId)
  for (const tool of message.result?.tools ?? []) {
    console.log(`${tool.name}\t${tool.description ?? ''}`)
  }
} else if (cmd === 'call' && name) {
  const args = rawArgs ? JSON.parse(rawArgs) : {}
  const { message } = await rpc(
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } },
    sessionId
  )
  if (message.error) throw new Error(JSON.stringify(message.error))
  for (const part of message.result?.content ?? []) {
    if (part.type === 'text') console.log(part.text ?? '')
    else console.log(JSON.stringify(part))
  }
} else {
  console.error('usage: ide-mcp.ts tools | call <tool> <json>')
  process.exit(2)
}
