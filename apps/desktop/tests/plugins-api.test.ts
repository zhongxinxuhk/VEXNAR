// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import {
  formatArgsInput,
  formatEnvInput,
  marketItemEndpoint,
  mcpEndpoint,
  parseArgsInput,
  parseEnvInput
} from '../src/renderer/src/components/plugins/api'
import type { MarketItem, McpServer } from '../src/renderer/src/components/plugins/types'

describe('MCP 表单解析', () => {
  it('args 一行一个参数，忽略空行与两端空白', () => {
    const args = parseArgsInput('  -y\n\n@modelcontextprotocol/server-filesystem\n  /tmp/ws  \n')
    expect(args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/tmp/ws'])
    expect(parseArgsInput('')).toEqual([])
  })

  it('args 回填成多行文本，便于直接编辑', () => {
    expect(formatArgsInput(['-y', 'pkg'])).toBe('-y\npkg')
    expect(formatArgsInput(null)).toBe('')
  })

  it('env 按 KEY=VALUE 解析，跳过注释与非法行，后值覆盖前值', () => {
    const env = parseEnvInput('# token\nGITHUB_TOKEN=abc\nBAD_LINE\nEMPTY=\nGITHUB_TOKEN=xyz')
    expect(env).toEqual({ GITHUB_TOKEN: 'xyz', EMPTY: '' })
  })

  it('env 能往返：解析后再格式化保持一致', () => {
    const env = parseEnvInput('A=1\nB=Bearer x')
    expect(formatEnvInput(env)).toBe('A=1\nB=Bearer x')
    expect(formatEnvInput(undefined)).toBe('')
  })
})

describe('MCP 端点展示', () => {
  const base: McpServer = {
    id: 1,
    name: 'demo',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'pkg'],
    enabled: true
  }

  it('stdio 拼接命令与参数', () => {
    expect(mcpEndpoint(base)).toBe('npx -y pkg')
  })

  it('http/sse 直接展示 URL', () => {
    expect(mcpEndpoint({ ...base, transport: 'http', command: undefined, args: null, url: 'https://x/mcp' })).toBe(
      'https://x/mcp'
    )
  })

  it('市场条目的端点展示与服务器一致', () => {
    const item: MarketItem = {
      id: 'mcp:demo',
      kind: 'mcp',
      name: 'demo',
      transport: 'stdio',
      command: 'uvx',
      args: ['mcp-server-fetch']
    }
    expect(marketItemEndpoint(item)).toBe('uvx mcp-server-fetch')
    expect(marketItemEndpoint({ ...item, transport: 'http', command: undefined, args: undefined, url: 'https://y' })).toBe(
      'https://y'
    )
  })
})
