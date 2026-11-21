// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 协议引擎（mihomo 二进制）托管。
 *
 * TS 侧不实现 vmess/vless/ssr 这些协议，而是把 app 自带的 mihomo 当作"协议拨号器"：
 * 为每个启用节点生成一个只监听 127.0.0.1 的 SOCKS 入口，用 `IN-NAME` 规则把该入口
 * 绑定到指定 proxy。实测 mihomo v1.19.34 的 `listeners + IN-NAME` 可用（见
 * app/docs/EGRESS-TS.md 的验证记录）。
 *
 * 二进制由 `app/scripts/fetch-mihomo.ts` 下载并校验；没有二进制时引擎不可用，
 * 只有 socks5/http 节点能走原生拨号（dialer.ts），其它协议显式报错。
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createConnection, createServer } from 'node:net'
import { join } from 'node:path'


import type { NodeConfig } from './types.ts'

export interface EngineNode extends NodeConfig {
  id: number
  viaNodeId?: number
}

export interface EngineOptions {
  binary?: string
  workDir: string
  basePort?: number
  logger?: (message: string) => void
}

const READY_TIMEOUT_MS = 10_000

export class ProtocolEngine {
  private readonly workDir: string
  private readonly binary?: string
  private readonly basePort: number
  private readonly log: (message: string) => void
  private child?: ChildProcess
  private ports = new Map<number, number>()
  private signature = ''
  private lastError = ''
  private starting?: Promise<void>

  constructor(options: EngineOptions) {
    this.workDir = options.workDir
    this.binary = resolveEngineBinary(options.binary)
    this.basePort = options.basePort ?? Number(process.env.VEXNAR_MIHOMO_BASE_PORT ?? 19100)
    this.log = options.logger ?? ((message) => console.log(`[egress] ${message}`))
    mkdirSync(this.workDir, { recursive: true, mode: 0o700 })
  }

  get available(): boolean {
    return Boolean(this.binary) && existsSync(this.binary as string)
  }

  get error(): string {
    return this.lastError
  }

  portFor(nodeId: number): number | undefined {
    return this.ports.get(nodeId)
  }

  /** 启动/重载引擎；签名不变时直接返回。 */
  async reconcile(nodes: EngineNode[]): Promise<void> {
    if (!this.available) {
      this.lastError = this.binary ? `mihomo 不存在：${this.binary}` : '未配置 VEXNAR_MIHOMO_BIN'
      return
    }
    const signature = JSON.stringify(nodes.map((n) => [n.id, n.protocol, n.server, n.port, n.name, n.config, n.secrets]))
    if (signature === this.signature && this.child && this.child.exitCode === null) return
    if (this.starting) await this.starting
    this.starting = this.restart(nodes, signature).finally(() => {
      this.starting = undefined
    })
    await this.starting
  }

  private async restart(nodes: EngineNode[], signature: string): Promise<void> {
    await this.stopProcess()
    this.ports = new Map()
    if (nodes.length === 0) {
      this.signature = signature
      this.lastError = ''
      return
    }

    const listeners: Record<string, unknown>[] = []
    const proxies: Record<string, unknown>[] = []
    const rules: string[] = []
    let port = this.basePort
    for (const node of nodes) {
      while (!(await portFree(port))) port++
      this.ports.set(node.id, port)
      const proxyName = `vx-${node.id}`
      const listenerName = `n${node.id}`
      listeners.push({ name: listenerName, type: 'socks', port, listen: '127.0.0.1', udp: false })
      proxies.push(clashProxy(node, proxyName, node.viaNodeId))
      rules.push(`IN-NAME,${listenerName},${proxyName}`)
      port++
    }
    rules.push('MATCH,DIRECT')

    const config = {
      'log-level': 'warning',
      'allow-lan': false,
      ipv6: false,
      listeners,
      proxies,
      rules
    }
    const configPath = join(this.workDir, 'config.yaml')
    writeFileSync(configPath, toYaml(config), { mode: 0o600 })

    const child = spawn(this.binary as string, ['-d', this.workDir, '-f', configPath], {
      cwd: this.workDir,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000)
    })
    child.once('exit', (code) => {
      if (this.child === child) {
        this.lastError = `mihomo 退出 code=${code}${stderr ? `: ${stderr.split('\n')[0]}` : ''}`
        this.log(this.lastError)
      }
    })
    this.child = child
    try {
      for (const node of nodes) {
        await waitPort('127.0.0.1', this.ports.get(node.id) as number, READY_TIMEOUT_MS)
      }
      this.signature = signature
      this.lastError = ''
    } catch (error) {
      await this.stopProcess()
      this.lastError = `mihomo 未就绪: ${(error as Error).message}${stderr ? ` / ${stderr.split('\n')[0]}` : ''}`
      throw new Error(this.lastError)
    }
  }

  async stop(): Promise<void> {
    await this.stopProcess()
    this.signature = ''
    this.ports = new Map()
  }

  private async stopProcess(): Promise<void> {
    const child = this.child
    this.child = undefined
    if (!child || child.exitCode !== null) return
    child.kill('SIGTERM')
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    const timer = new Promise<void>((resolve) => setTimeout(resolve, 3000))
    await Promise.race([exited, timer])
    if (child.exitCode === null) child.kill('SIGKILL')
  }
}

/** 把节点配置变成 mihomo 的 proxies 条目；密钥字段合并回去。 */
export function clashProxy(node: NodeConfig, name: string, viaNodeId?: number): Record<string, unknown> {
  return {
    ...node.config,
    ...node.secrets,
    name,
    type: node.protocol,
    server: node.server,
    port: node.port,
    ...(viaNodeId ? { 'dialer-proxy': `vx-${viaNodeId}` } : {})
  }
}

/** mihomo 只吃 YAML；手写序列化避免再引一个运行时依赖。 */
export function toYaml(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent)
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]\n`
    return value
      .map((item) => {
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          const body = toYaml(item, indent + 2).trimStart()
          return `${pad}- ${body}`
        }
        return `${pad}- ${scalar(item)}\n`
      })
      .join('')
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return `${pad}{}\n`
    return entries
      .map(([key, val]) => {
        if (Array.isArray(val) || (val !== null && typeof val === 'object')) {
          return `${pad}${key}:\n${toYaml(val, indent + 2)}`
        }
        return `${pad}${key}: ${scalar(val)}\n`
      })
      .join('')
  }
  return `${pad}${scalar(value)}\n`
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  const text = String(value)
  if (/^[A-Za-z0-9_./:@-]+$/.test(text) && text !== '') return text
  return JSON.stringify(text)
}

/** 依次尝试：显式配置 → 环境变量 → 仓库/app 的 .vexnar-bin（fetch-mihomo 的落点）。 */
export function resolveEngineBinary(explicit?: string): string {
  const exe = process.platform === 'win32' ? 'mihomo.exe' : 'mihomo'
  const candidates = [
    explicit,
    process.env.VEXNAR_MIHOMO_BIN,
    join(process.cwd(), '.vexnar-bin', exe),
    join(process.cwd(), 'app', '.vexnar-bin', exe),
    join(process.cwd(), '..', '.vexnar-bin', exe),
    join(process.cwd(), '..', 'app', '.vexnar-bin', exe)
  ].filter((value): value is string => Boolean(value && value.trim()))
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return candidates[0] ?? ''
}

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })
}

export function waitPort(host: string, port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = createConnection({ host, port })
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline) reject(new Error(`等待 ${host}:${port} 超时`))
        else setTimeout(tryOnce, 100)
      })
    }
    tryOnce()
  })
}
