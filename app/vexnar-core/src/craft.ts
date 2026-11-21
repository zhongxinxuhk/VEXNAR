// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawn } from 'node:child_process'

const CLI = process.env.CRAFT_ANYTHING_CLI || `${process.env.HOME}/.dsh/plugins-data/craft-anything/craft-anything-cli`

function probe(args: string[], input: string, timeoutMs: number) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(CLI, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('error', (error) => { clearTimeout(timer); resolve({ code: null, stdout, stderr: String(error) }) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
    child.stdin.end(input)
  })
}

/** Report the bundled Craft Anything CLI and the tools its MCP server lists. */
export async function craftStatus() {
  const versionRun = await probe(['--version'], '', 5000)
  const version = versionRun.stdout.trim().split(' ').pop() ?? ''
  const probeRun = await probe(['mcp'], [
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'vexnar', version: '1' } } }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    ''
  ].join('\n'), 10000)
  const tools: string[] = []
  for (const line of probeRun.stdout.split('\n')) {
    if (!line.trim()) continue
    try {
      const message = JSON.parse(line)
      if (message.id === 2) for (const tool of message.result?.tools ?? []) tools.push(tool.name)
    } catch {
      // ignore non-JSON rows
    }
  }
  return { installed: Boolean(version), version, path: CLI, tools, error: version ? '' : probeRun.stderr.slice(0, 200) }
}
