// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawn } from 'node:child_process'

export interface RunOptions {
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
  maxOutput?: number
}

export interface RunResult {
  command: string
  args: string[]
  code: number | null
  signal: string | null
  stdout: string
  stderr: string
  truncated: boolean
  timed_out: boolean
  duration_ms: number
}

const ALLOWED = new Set(['nmap', 'httpx', 'ffuf', 'sqlmap', 'nuclei', 'curl', 'dig', 'whois', 'openssl', 'nc', 'nikto', 'gobuster', 'subfinder', 'katana'])

/**
 * External tool runner: allow-listed binaries, hard timeout, output cap and a
 * bounded number of concurrent processes. Results are plain data; the engine
 * decides what to persist.
 */
export function createRunner(options: { concurrency?: number; timeoutMs?: number; maxOutput?: number } = {}) {
  const concurrency = Math.max(options.concurrency ?? 2, 1)
  const defaultTimeout = options.timeoutMs ?? 30_000
  // 真实扫描的输出会超过 64KB（subfinder 一个域名就能到几十 KB 的 JSONL）；
  // 解析器会丢掉被截断的半行，但上限本身也要够大，别把整段结果砍掉。
  const defaultMaxOutput = options.maxOutput ?? 1024 * 1024
  let active = 0
  const queue: Array<() => void> = []

  async function acquire() {
    if (active < concurrency) { active++; return }
    await new Promise<void>((resolve) => queue.push(resolve))
    active++
  }

  function release() {
    active--
    const next = queue.shift()
    if (next) next()
  }

  async function run(command: string, args: string[] = [], runOptions: RunOptions = {}): Promise<RunResult> {
    if (!ALLOWED.has(command)) throw Object.assign(new Error(`命令不在允许列表: ${command}`), { status: 400 })
    await acquire()
    const started = Date.now()
    try {
      return await new Promise<RunResult>((resolve, reject) => {
        const child = spawn(command, args, {
          cwd: runOptions.cwd,
          env: { PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin', HOME: process.env.HOME ?? '', ...runOptions.env },
          stdio: ['ignore', 'pipe', 'pipe']
        })
        let stdout = ''
        let stderr = ''
        let truncated = false
        let timedOut = false
        const max = runOptions.maxOutput ?? defaultMaxOutput
        const append = (target: 'stdout' | 'stderr', chunk: Buffer) => {
          const text = chunk.toString('utf8')
          if (target === 'stdout') {
            if (stdout.length + text.length > max) { stdout += text.slice(0, Math.max(max - stdout.length, 0)); truncated = true } else stdout += text
          } else {
            if (stderr.length + text.length > max) { stderr += text.slice(0, Math.max(max - stderr.length, 0)); truncated = true } else stderr += text
          }
        }
        child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk))
        child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk))
        const timer = setTimeout(() => {
          timedOut = true
          child.kill('SIGKILL')
        }, runOptions.timeoutMs ?? defaultTimeout)
        child.on('error', (error) => { clearTimeout(timer); reject(error) })
        child.on('close', (code, signal) => {
          clearTimeout(timer)
          resolve({ command, args, code, signal, stdout, stderr, truncated, timed_out: timedOut, duration_ms: Date.now() - started })
        })
      })
    } finally {
      release()
    }
  }

  return { run, allowed: () => [...ALLOWED] }
}

export type Runner = ReturnType<typeof createRunner>
