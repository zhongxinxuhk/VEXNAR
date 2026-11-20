'use strict'

// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/*
 * VEXNAR Agent Runtime
 *
 * Runs as an independent Node.js process, forked by the Electron main process.
 * Keeping orchestration/tool execution here prevents renderer crashes or UI
 * reloads from taking down the agent session.
 */

const fs = require('node:fs')
const fsp = fs.promises
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { randomUUID } = require('node:crypto')

const execFileAsync = promisify(execFile)

const state = {
  workspace: '',
  model: '',
  baseUrl: '',
  apiKey: ''
}

let cancelled = false
let currentAbort = null

function send(event) {
  if (process.connected) process.send(event)
}

function emitDelta(text) {
  if (!cancelled) send({ type: 'assistant_delta', text })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function truncate(text, max = 6000) {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max)}\n… (${value.length - max} chars omitted)` : value
}

function safePath(root, relative) {
  if (!root) throw new Error('尚未选择工作区')
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, relative || '.')
  const rel = path.relative(resolvedRoot, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('路径超出当前工作区')
  return resolved
}

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'target',
  'out',
  'release',
  'dist',
  '.next',
  '.idea',
  '.pg-build',
  '.venv',
  'venv',
  '__pycache__',
  '.cache',
  'coverage',
  '.pnpm-store',
  '.yarn',
  '.gradle'
])

async function listFiles(relative = '.', depth = 2) {
  const root = safePath(state.workspace, relative)
  const lines = []
  const walk = async (dir, level) => {
    if (lines.length >= 120 || level > depth) return
    const entries = await fsp.readdir(dir, { withFileTypes: true })
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const entry of entries) {
      if (lines.length >= 120) return
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
      const absolute = path.join(dir, entry.name)
      const rel = path.relative(state.workspace, absolute)
      if (entry.isDirectory()) {
        lines.push(`${rel}/`)
        await walk(absolute, level + 1)
      } else if (entry.isFile()) {
        lines.push(rel)
      }
    }
  }
  await walk(root, 0)
  return lines.join('\n') || '(empty workspace)'
}

async function readFile(relative) {
  const absolute = safePath(state.workspace, relative)
  const stat = await fsp.stat(absolute)
  if (!stat.isFile()) throw new Error('不是文件')
  if (stat.size > 200_000) throw new Error('文件过大')
  return truncate(await fsp.readFile(absolute, 'utf8'))
}

async function gitStatus() {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--short', '--branch'], {
      cwd: state.workspace,
      timeout: 5000,
      maxBuffer: 512 * 1024
    })
    return truncate(stdout.trim() || '(clean)')
  } catch (error) {
    return `git status unavailable: ${error.message}`
  }
}

async function runTool(name, input) {
  const id = randomUUID()
  send({ type: 'tool_start', id, name, input })
  try {
    let output = ''
    if (name === 'list_files') output = await listFiles(input?.path || '.', input?.depth ?? 2)
    else if (name === 'read_file') output = await readFile(input?.path)
    else if (name === 'git_status') output = await gitStatus()
    else throw new Error(`unknown tool: ${name}`)
    send({ type: 'tool_end', id, name, ok: true, output: truncate(output) })
    return output
  } catch (error) {
    const output = error instanceof Error ? error.message : String(error)
    send({ type: 'tool_end', id, name, ok: false, output })
    return `tool ${name} failed: ${output}`
  }
}

async function localReply(text) {
  emitDelta('独立 Agent Runtime 已连接。\n')
  await sleep(120)
  if (!state.workspace) {
    emitDelta(
      '\n当前还没有选择工作区。打开右侧 Workspace 面板选择项目目录后，我可以读取文件、检查 Git 状态并执行工具。'
    )
    return
  }

  emitDelta(`\n当前工作区：\`${state.workspace}\`\n`)
  const files = await runTool('list_files', { depth: 2 })
  if (cancelled) return
  emitDelta(`\n工作区文件（节选）：\n\n\`\`\`\n${truncate(files, 2500)}\n\`\`\`\n`)

  const git = await runTool('git_status', {})
  if (cancelled) return
  emitDelta(`\nGit 状态：\n\n\`\`\`\n${truncate(git, 1800)}\n\`\`\`\n`)
  emitDelta(
    '\n这是桌面端独立运行时链路的最小闭环：UI → typed IPC → Agent Runtime → Tool Executor。配置模型 API 后，下一步会把这里替换成真实的流式推理。'
  )
  if (text.trim()) {
    emitDelta(`\n\n收到请求：${text.trim()}`)
  }
}

async function llmReply(text) {
  const base = state.baseUrl.replace(/\/+$/, '')
  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
  const controller = new AbortController()
  currentAbort = controller
  const response = await fetch(url, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${state.apiKey}`
    },
    body: JSON.stringify({
      model: state.model,
      stream: true,
      messages: [
        {
          role: 'system',
          content:
            'You are the VEXNAR desktop agent. Be concise, technical and actionable. You are running inside an independent Electron desktop app.'
        },
        { role: 'user', content: text }
      ]
    })
  })
  if (!response.ok || !response.body) {
    throw new Error(`LLM HTTP ${response.status}: ${await response.text()}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let received = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload)
        const delta = json?.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta) {
          received = true
          emitDelta(delta)
        }
      } catch {
        // Ignore non-JSON SSE comments/keepalives.
      }
    }
  }
  if (!received) emitDelta('(模型没有返回内容)')
}

async function handleUserMessage(sessionId, text) {
  cancelled = false
  try {
    if (state.apiKey && state.baseUrl) {
      await llmReply(text)
    } else {
      await localReply(text)
    }
  } catch (error) {
    if (!cancelled) {
      send({
        type: 'error',
        message: error instanceof Error ? error.message : String(error)
      })
    }
  } finally {
    currentAbort = null
    if (!cancelled) send({ type: 'assistant_done' })
  }
}

process.on('message', (message) => {
  if (!message || typeof message !== 'object') return
  if (message.type === 'init') {
    state.workspace = String(message.workspace || '')
    state.model = String(message.model || '')
    state.baseUrl = String(message.baseUrl || '')
    state.apiKey = String(message.apiKey || '')
    send({ type: 'ready' })
    return
  }
  if (message.type === 'cancel') {
    cancelled = true
    currentAbort?.abort()
    return
  }
  if (message.type === 'user_message') {
    void handleUserMessage(String(message.sessionId || ''), String(message.text || ''))
  }
})

process.on('disconnect', () => process.exit(0))
process.on('uncaughtException', (error) => {
  send({ type: 'error', message: error.message })
  process.exitCode = 1
})

send({ type: 'ready' })
