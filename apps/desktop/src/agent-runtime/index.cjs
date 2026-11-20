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

const { resolveReadPath } = require('./read-policy.cjs')
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
  apiKey: '',
  // Wire format selected by the Go backend. Responses is the default: the
  // platform (NewAPI) reaches its full reasoning surface only on /v1/responses.
  format: 'openai-responses',
  accessMode: 'full'
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

const approvals = new Map()
function approveRead(target) {
  return new Promise((resolve) => {
    const id = randomUUID()
    const timer = setTimeout(() => { approvals.delete(id); resolve(false) }, 120000)
    approvals.set(id, (allowed) => { clearTimeout(timer); resolve(allowed) })
    send({ type: 'approval_request', id, path: target })
  })
}
function safePath(root, relative) {
  return resolveReadPath(root, relative, state.accessMode, approveRead)
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
  const root = await safePath(state.workspace, relative)
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
  const absolute = await safePath(state.workspace, relative)
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
    throw new Error(`Git 状态读取失败：${error.message}`)
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

function systemPrompt(accessMode) {
  return `You are the VEXNAR desktop agent. Be concise, technical and actionable. Current execution environment: this computer. Workspace: ${state.workspace || '(none selected)'}. Access mode: ${accessMode}. Do not claim to have executed tools or read files unless tool evidence is supplied.`
}

// NewAPI 中转对 reasoning 的透传字段取决于上游协议：
//   /v1/responses   → reasoning.effort
//   /v1/chat/completions → reasoning_effort
// wire 值集合为 minimal/low/medium/high/xhigh/max（不含 off，关闭走 thinking 字段）。
// 不在此做静默降级：把 max 悄悄换成 high 会让 UI 档位失真，上游不支持时应在
// NewAPI 渠道用 param_override 改写，或由网关自身做档位映射。
const REASONING_EFFORT_WIRE_VALUES = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']

function reasoningField(reasoningEffort) {
  if (!REASONING_EFFORT_WIRE_VALUES.includes(reasoningEffort)) return null
  return state.format === 'openai-responses'
    ? { reasoning: { effort: reasoningEffort } }
    : { reasoning_effort: reasoningEffort }
}

// Responses takes a flat `input` array whose content parts are input_text /
// input_image, and the system prompt travels in top-level `instructions`.
function responsesBody(accessMode, text, attachments, reasoningEffort) {
  const content = []
  if (text) content.push({ type: 'input_text', text })
  for (const image of attachments) {
    content.push({ type: 'input_image', image_url: image.dataUrl })
  }
  return {
    model: state.model,
    instructions: systemPrompt(accessMode),
    input: content.length ? [{ role: 'user', content }] : [],
    stream: true,
    store: false,
    ...(reasoningField(reasoningEffort) ?? {})
  }
}

function chatBody(accessMode, text, attachments, reasoningEffort) {
  return {
    model: state.model,
    stream: true,
    stream_options: { include_usage: true },
    ...(reasoningField(reasoningEffort) ?? {}),
    messages: [
      { role: 'system', content: systemPrompt(accessMode) },
      {
        role: 'user',
        content: attachments.length
          ? [
              ...(text ? [{ type: 'text', text }] : []),
              ...attachments.map((image) => ({ type: 'image_url', image_url: { url: image.dataUrl } }))
            ]
          : text
      }
    ]
  }
}

// readSSE walks an SSE body line by line and hands each (event, data) pair to
// onFrame. The event name is optional: the Responses API repeats the
// discriminator inside the JSON `type` field, so both are passed along.
async function readSSE(response, onFrame) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let event = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        event = ''
        continue
      }
      if (trimmed.startsWith('event:')) {
        event = trimmed.slice(6).trim()
        continue
      }
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      let json
      try {
        json = JSON.parse(payload)
      } catch {
        continue // SSE comment / keepalive, not a frame
      }
      onFrame(event, json)
    }
  }
}

function trackUsage(promptTokens) {
  if (!cancelled && Number.isSafeInteger(promptTokens) && promptTokens >= 0) {
    send({ type: 'context_usage', model: state.model, promptTokens })
  }
}

async function responsesReply(text, attachments, networkApproved, accessMode, reasoningEffort) {
  const base = state.baseUrl.replace(/\/+$/, '')
  const url = base.endsWith('/responses') ? base : `${base}/responses`
  const controller = new AbortController()
  currentAbort = controller
  const response = await fetch(url, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      authorization: `Bearer ${state.apiKey}`,
      'x-vexnar-desktop-token': state.apiKey,
      'x-vexnar-user-approved': networkApproved ? '1' : '0'
    },
    body: JSON.stringify(responsesBody(accessMode, text, attachments, reasoningEffort))
  })
  if (!response.ok || !response.body) {
    throw new Error(`LLM HTTP ${response.status}: ${await response.text()}`)
  }
  let received = false
  await readSSE(response, (event, json) => {
    const kind = event || json?.type || ''
    switch (kind) {
      case 'response.output_text.delta':
        if (typeof json?.delta === 'string' && json.delta) {
          received = true
          emitDelta(json.delta)
        }
        break
      case 'response.completed':
      case 'response.incomplete':
        trackUsage(json?.response?.usage?.input_tokens)
        break
      case 'response.failed':
      case 'error':
        throw new Error(json?.error?.message || json?.message || '模型返回失败')
      default:
        break
    }
  })
  if (!received) emitDelta('(模型没有返回内容)')
}

async function chatReply(text, attachments, networkApproved, accessMode, reasoningEffort) {
  const base = state.baseUrl.replace(/\/+$/, '')
  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
  const controller = new AbortController()
  currentAbort = controller
  const request = (includeUsage) => fetch(url, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${state.apiKey}`,
      'x-vexnar-desktop-token': state.apiKey,
      'x-vexnar-user-approved': networkApproved ? '1' : '0'
    },
    body: JSON.stringify(
      includeUsage
        ? chatBody(accessMode, text, attachments, reasoningEffort)
        : (() => {
            const body = chatBody(accessMode, text, attachments, reasoningEffort)
            delete body.stream_options
            return body
          })()
    )
  })
  let response = await request(true)
  if (response.status === 400) {
    const error = await response.text()
    if (!/stream_options|include_usage/i.test(error)) throw new Error(`LLM HTTP 400: ${error}`)
    response = await request(false)
  }
  if (!response.ok || !response.body) {
    throw new Error(`LLM HTTP ${response.status}: ${await response.text()}`)
  }
  let received = false
  await readSSE(response, (_event, json) => {
    trackUsage(json?.usage?.prompt_tokens)
    const delta = json?.choices?.[0]?.delta?.content
    if (typeof delta === 'string' && delta) {
      received = true
      emitDelta(delta)
    }
  })
  if (!received) emitDelta('(模型没有返回内容)')
}

async function llmReply(text, attachments = [], networkApproved = false, accessMode = 'full', reasoningEffort) {
  if (state.format === 'openai-responses') {
    return responsesReply(text, attachments, networkApproved, accessMode, reasoningEffort)
  }
  return chatReply(text, attachments, networkApproved, accessMode, reasoningEffort)
}

async function handleUserMessage(sessionId, text, attachments = [], networkApproved = false, accessMode = 'full', reasoningEffort) {
  cancelled = false
  state.accessMode = accessMode
  try {
    if (state.apiKey && state.baseUrl) {
      if (accessMode === 'request' && !networkApproved) throw new Error('模型联网请求尚未批准')
      await llmReply(text, attachments, networkApproved, accessMode, reasoningEffort)
    } else {
      if (attachments.length) throw new Error('尚未配置支持图片的模型服务，图片未被发送')
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
    for (const resolve of approvals.values()) resolve(false)
    approvals.clear()
    currentAbort = null
    send({ type: 'assistant_done' })
  }
}

process.on('message', (message) => {
  if (!message || typeof message !== 'object') return
  if (message.type === 'init') {
    state.workspace = String(message.workspace || '')
    state.model = String(message.model || '')
    state.baseUrl = String(message.baseUrl || '')
    state.apiKey = String(message.apiKey || '')
    state.format = String(message.format || 'openai-responses')
    send({ type: 'ready' })
    return
  }
  if (message.type === 'approval_response') {
    const resolve = approvals.get(message.id)
    if (resolve) { approvals.delete(message.id); resolve(message.allowed === true) }
    return
  }
  if (message.type === 'cancel') {
    for (const resolve of approvals.values()) resolve(false)
    approvals.clear()
    cancelled = true
    currentAbort?.abort()
    return
  }
  if (message.type === 'user_message') {
    void handleUserMessage(String(message.sessionId || ''), String(message.text || ''), Array.isArray(message.attachments) ? message.attachments : [], message.networkApproved === true, message.accessMode || 'full', message.reasoningEffort)
  }
})

process.on('disconnect', () => process.exit(0))
process.on('uncaughtException', (error) => {
  send({ type: 'error', message: error.message })
  process.exitCode = 1
})

send({ type: 'ready' })
