// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { executionGroup } from './execution-groups'

const fields = {
  skill: 'chat.inspectSkill',
  delegatedTool: 'chat.inspectDelegatedTool',
  path: 'chat.inspectPath',
  source: 'chat.inspectSource',
  version: 'chat.inspectVersion',
  command: 'chat.inspectCommand',
  directory: 'chat.inspectDirectory',
  exitCode: 'chat.inspectExitCode',
  action: 'chat.inspectAction',
  url: 'chat.inspectUrl',
  application: 'chat.inspectApplication',
  window: 'chat.inspectWindow',
  session: 'chat.inspectSession',
  method: 'chat.inspectMethod'
} as const

const todoStatuses = {
  pending: 'chat.inspectTodoPending',
  in_progress: 'chat.inspectTodoRunning',
  completed: 'chat.inspectTodoDone'
} as const

const MAX_OVERVIEW_INPUT = 128 * 1024
const MAX_OVERVIEW_TODOS = 30

type Field = { key: keyof typeof fields; label: (typeof fields)[keyof typeof fields]; value: string | number }
type Todo = { text: string; status: (typeof todoStatuses)[keyof typeof todoStatuses] }
type RecordValue = Record<string, unknown>

function object(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}

function structured(text: string): RecordValue {
  if (!text || text.length > MAX_OVERVIEW_INPUT) return {}
  try {
    return object(JSON.parse(text))
  } catch {
    return {}
  }
}

/** Present only explicit fields from already-redacted historical tool payloads. */
export function describeToolPayload(tool: string, rawInput: string, rawOutput: string): {
  category: ReturnType<typeof executionGroup>['category']
  fields: Field[]
  todos: Todo[]
  additionalTodos: number
  stdout?: string
  stderr?: string
  terminalOutput?: string
} {
  const recordedInput = structured(rawInput)
  const delegatedTool = tool === 'ExecuteExtraTool' && typeof recordedInput.tool_name === 'string'
    ? recordedInput.tool_name.trim()
    : ''
  const effectiveTool = delegatedTool || tool
  const { category, source } = executionGroup(effectiveTool)
  const terminalSession = /^shell_(open|send|read|close|list)$/.test(effectiveTool)
  const input = delegatedTool ? object(recordedInput.params) : recordedInput
  const output = structured(rawOutput)
  const values: Field[] = []
  const add = (key: keyof typeof fields, ...candidates: unknown[]): void => {
    const value = candidates.find((candidate) =>
      (typeof candidate === 'string' && candidate.trim().length > 0) ||
      (typeof candidate === 'number' && Number.isFinite(candidate))
    )
    if (typeof value === 'string' || typeof value === 'number') values.push({ key, label: fields[key], value })
  }

  if (delegatedTool) add('delegatedTool', delegatedTool)
  if (source) add('source', source)

  switch (category) {
    case 'skill':
      add('skill', input.name)
      add('source', output.source)
      add('version', output.version)
      break
    case 'terminal':
      add('command', input.command)
      add('directory', output.cwd, input.cwd)
      {
        // Norma Bash appends this suffix to its combined output on a nonzero exit.
        const exit = /^\[exit code (-?\d+)\]$/.exec(rawOutput.trimEnd().split('\n').at(-1) ?? '')
        add('exitCode', output.exit_code, exit ? Number(exit[1]) : undefined)
      }
      add('session', output.shell_session_id, input.shell_session_id,
        terminalSession ? output.session_id : undefined, terminalSession ? input.session_id : undefined)
      break
    case 'browser':
      add('action', output.action, input.action)
      add('url', output.url, input.url)
      add('session', output.browser_session_id, input.browser_session_id)
      break
    case 'software':
      add('application', output.application, input.application)
      add('window', output.window_title, input.window_title)
      add('action', output.action, input.action)
      add('session', output.software_session_id, input.software_session_id)
      break
    case 'api':
      add('method', input.method)
      add('url', input.url)
      break
    case 'other':
    case 'mcp':
      add('path', input.file_path, input.path)
      break
  }

  const todos: Todo[] = []
  const list = category === 'planning' && Array.isArray(input.todos) ? input.todos : []
  for (const item of list.slice(0, MAX_OVERVIEW_TODOS)) {
    const row = object(item)
    const status = row.status
    if (typeof row.content === 'string' && row.content.trim() &&
      (status === 'pending' || status === 'in_progress' || status === 'completed')) {
      todos.push({ text: row.content, status: todoStatuses[status] })
    }
  }

  return {
    category,
    fields: values,
    todos,
    additionalTodos: Math.max(0, list.length - MAX_OVERVIEW_TODOS),
    stdout: category === 'terminal' && typeof output.stdout === 'string' ? output.stdout : undefined,
    stderr: category === 'terminal' && typeof output.stderr === 'string' ? output.stderr : undefined,
    terminalOutput: terminalSession
      ? typeof output.output === 'string' ? output.output : typeof output.screen === 'string' ? output.screen : undefined
      : undefined
  }
}
