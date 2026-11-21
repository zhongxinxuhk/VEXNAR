// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const repo = join(here, '..', '..', '..')

/** One `content` entry of an MCP tools/call result. */
type McpContentPart = { type?: string; text?: string }

/** The JSON-RPC envelope `tools/call` answers with (only the fields this spike reads). */
type McpCallEnvelope = { result?: { content?: McpContentPart[]; isError?: boolean } }

/** Flattened tool answer: the text, the error flag and the raw envelope. */
export type McpToolResult = { text: string; isError: boolean; raw: unknown }

export function mcpToken(): string {
  if (process.env.VEXNAR_MCP_TOKEN) return process.env.VEXNAR_MCP_TOKEN
  return readFileSync(join(repo, 'data', 'mcp.token'), 'utf8').trim()
}

export async function mcpCall(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${mcpToken()}`
  }
  const call = async (body: Record<string, unknown>): Promise<unknown> => {
    const response = await fetch(process.env.VEXNAR_MCP_URL || 'http://127.0.0.1:8787/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })
    let text = await response.text()
    const line = text.split('\n').find((row) => row.startsWith('data:'))
    if (line) text = line.slice(5).trim()
    return JSON.parse(text)
  }
  await call({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'p0-tools', version: '0' } }
  })
  const result = (await call({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } })) as McpCallEnvelope
  const content = result.result?.content ?? []
  const text = content.filter((part) => part.type === 'text').map((part) => part.text).join('\n')
  return { text, isError: result.result?.isError === true, raw: result }
}
