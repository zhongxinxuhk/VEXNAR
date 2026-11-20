// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

export const executionCategories = {
  planning: 'chat.tracePlanning',
  skill: 'chat.traceSkill',
  mcp: 'chat.traceMcp',
  browser: 'chat.traceBrowser',
  terminal: 'chat.traceTerminal',
  software: 'chat.traceSoftware',
  api: 'chat.traceApi',
  other: 'chat.traceOther'
} as const

export type ExecutionCategory = keyof typeof executionCategories

export function executionGroup(tool: string): { category: ExecutionCategory; source?: string } {
  const mcp = /^mcp__([^]+?)__([^]+)$/.exec(tool)
  if (mcp) {
    const source = mcp[1]
    const namespace = source.toLowerCase()
    const category = namespace === 'browser' ? 'browser' : namespace === 'software' ? 'software' : 'mcp'
    return { category, source }
  }
  switch (tool.toLowerCase()) {
    case 'skill':
      return { category: 'skill' }
    case 'todowrite':
      return { category: 'planning' }
    case 'bash':
    case 'shell':
    case 'powershell':
      return { category: 'terminal' }
    case 'webfetch':
    case 'web_search':
      return { category: 'api' }
    default:
      return { category: 'other' }
  }
}
